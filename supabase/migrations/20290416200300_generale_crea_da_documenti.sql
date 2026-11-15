-- Commessa generale dai documenti, lotti 5 e 7 (docs/piano-commessa-generale-da-documenti.md, §4.3 e §5).
--
-- 1. Il contratto della generale prende i dati che i documenti di un appalto portano e che non
--    avevano un posto: manodopera, durata, corpo/misura, SAL (soglia o cadenza), termini di
--    pagamento, revisione prezzi, tetto dell'accordo quadro, quota in RTI con il totale
--    dell'appalto. La polizza CAR prende il massimale RCT.
-- 2. `commessa_generale_crea_da_documenti(lettura, piano)`: tutto in una transazione — generale,
--    dati, contratto, garanzie, riferimenti PA, elenco prezzi, fasi. Il piano lo compone il
--    browser con i SOLI campi confermati (src/lib/orders/generali/daDocumenti/scritture.ts); le
--    scritture passano dalle RPC e dalle regole che già esistono, con i permessi di chi conferma.
-- 3. `generale_applicativo_crea(lettura, generale, piano)`: un contratto applicativo diventa una
--    figlia dell'accordo quadro, col suo CIG derivato (scelta provvisoria n. 1).
-- 4. `commessa_generale_da_documenti_annulla(lettura)`: «Annulla tutto» manda nel cestino ciò che
--    la conferma ha creato e rimette la lettura «pronta». Il cestino rifiuta una commessa che ha
--    già costi o movimenti: niente si perde.

alter table public.generale_contratti add column if not exists costo_manodopera numeric(14,2);
alter table public.generale_contratti add column if not exists durata_giorni integer;
alter table public.generale_contratti add column if not exists a_corpo_misura text;
alter table public.generale_contratti add column if not exists sal_soglia_importo numeric(14,2);
alter table public.generale_contratti add column if not exists sal_cadenza_giorni integer;
alter table public.generale_contratti add column if not exists termini_pagamento_giorni integer;
alter table public.generale_contratti add column if not exists revisione_prezzi text;
alter table public.generale_contratti add column if not exists tetto_accordo numeric(14,2);
alter table public.generale_contratti add column if not exists importo_totale_appalto numeric(14,2);
alter table public.generale_contratti add column if not exists quota_pct numeric(6,3);
alter table public.generale_contratto_garanzie add column if not exists massimale numeric(14,2);

-- ─── Lettura usata: solo da chi può modificare le commesse, solo se pronta ─────
create or replace function public.generale_lettura_segna_usata(p_lettura uuid, p_generale uuid, p_creato jsonb)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare v_company uuid; v_stato text;
begin
  select company_id, stato into v_company, v_stato from public.generale_letture where id = p_lettura for update;
  if v_company is null or auth.uid() is null
     or public.has_permission_for_company(auth.uid(), 'can_edit_orders', v_company) is not true then
    raise exception 'Lettura non trovata' using errcode = '42501';
  end if;
  if v_stato <> 'pronta' then
    raise exception 'Questa lettura è già stata usata o non è finita.' using errcode = '22023';
  end if;
  update public.generale_letture
     set stato = 'usata', generale_id = p_generale, creato = p_creato, updated_at = now()
   where id = p_lettura;
end $$;
revoke all on function public.generale_lettura_segna_usata(uuid, uuid, jsonb) from public, anon;
grant execute on function public.generale_lettura_segna_usata(uuid, uuid, jsonb) to authenticated;

-- ─── I pezzi comuni: contratto, garanzie, riferimenti PA, elenco, fasi ─────────
-- Invoker: chiamata da commessa_generale_crea_da_documenti (invoker) vale con le regole di chi
-- conferma; chiamata da generale_applicativo_crea (definer) le regole delle tabelle non valgono,
-- ma le RPC chiamate dentro controllano auth.uid() e l'azienda è già verificata.
create or replace function public.generale_documenti_scrivi_pezzi(p_generale uuid, p_ordine_pa uuid, p_company uuid, p_piano jsonb)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  c jsonb := p_piano->'contratto';
  x jsonb;
  v_garanzie int := 0;
  v_rif int := 0;
  v_elenco jsonb;
  v_fasi jsonb;
begin
  if c is not null and jsonb_typeof(c) = 'object' then
    insert into public.generale_contratti (
      generale_id, company_id, riferimento, data_firma, importo_base, ribasso_pct, oneri_sicurezza,
      data_consegna_lavori, data_fine_prevista, penale_giornaliera, penale_massima_pct,
      anticipazione_pct, ritenuta_pct, cig, cup, split_payment, note,
      costo_manodopera, durata_giorni, a_corpo_misura, sal_soglia_importo, sal_cadenza_giorni,
      termini_pagamento_giorni, revisione_prezzi, tetto_accordo, importo_totale_appalto, quota_pct)
    values (
      p_generale, p_company, nullif(c->>'riferimento', ''), nullif(c->>'data_firma', '')::date,
      nullif(c->>'importo_base', '')::numeric, coalesce(nullif(c->>'ribasso_pct', '')::numeric, 0),
      coalesce(nullif(c->>'oneri_sicurezza', '')::numeric, 0),
      nullif(c->>'data_consegna_lavori', '')::date, nullif(c->>'data_fine_prevista', '')::date,
      nullif(c->>'penale_giornaliera', '')::numeric, coalesce(nullif(c->>'penale_massima_pct', '')::numeric, 10),
      coalesce(nullif(c->>'anticipazione_pct', '')::numeric, 0), coalesce(nullif(c->>'ritenuta_pct', '')::numeric, 0),
      nullif(c->>'cig', ''), nullif(c->>'cup', ''), coalesce((c->>'split_payment')::boolean, false), nullif(c->>'note', ''),
      nullif(c->>'costo_manodopera', '')::numeric, nullif(c->>'durata_giorni', '')::int, nullif(c->>'a_corpo_misura', ''),
      nullif(c->>'sal_soglia_importo', '')::numeric, nullif(c->>'sal_cadenza_giorni', '')::int,
      nullif(c->>'termini_pagamento_giorni', '')::int, nullif(c->>'revisione_prezzi', ''),
      nullif(c->>'tetto_accordo', '')::numeric, nullif(c->>'importo_totale_appalto', '')::numeric, nullif(c->>'quota_pct', '')::numeric)
    on conflict (generale_id) do update set
      riferimento = excluded.riferimento, data_firma = excluded.data_firma, importo_base = excluded.importo_base,
      ribasso_pct = excluded.ribasso_pct, oneri_sicurezza = excluded.oneri_sicurezza,
      data_consegna_lavori = excluded.data_consegna_lavori, data_fine_prevista = excluded.data_fine_prevista,
      penale_giornaliera = excluded.penale_giornaliera, penale_massima_pct = excluded.penale_massima_pct,
      anticipazione_pct = excluded.anticipazione_pct, ritenuta_pct = excluded.ritenuta_pct,
      cig = excluded.cig, cup = excluded.cup, split_payment = excluded.split_payment, note = excluded.note,
      costo_manodopera = excluded.costo_manodopera, durata_giorni = excluded.durata_giorni,
      a_corpo_misura = excluded.a_corpo_misura, sal_soglia_importo = excluded.sal_soglia_importo,
      sal_cadenza_giorni = excluded.sal_cadenza_giorni, termini_pagamento_giorni = excluded.termini_pagamento_giorni,
      revisione_prezzi = excluded.revisione_prezzi, tetto_accordo = excluded.tetto_accordo,
      importo_totale_appalto = excluded.importo_totale_appalto, quota_pct = excluded.quota_pct,
      updated_at = now();
  end if;

  for x in select * from jsonb_array_elements(coalesce(p_piano->'garanzie', '[]'::jsonb)) loop
    insert into public.generale_contratto_garanzie (generale_id, company_id, tipo, importo, massimale, note)
    values (p_generale, p_company, x->>'tipo', nullif(x->>'importo', '')::numeric, nullif(x->>'massimale', '')::numeric, nullif(x->>'note', ''));
    v_garanzie := v_garanzie + 1;
  end loop;

  for x in select * from jsonb_array_elements(coalesce(p_piano->'riferimenti_pa', '[]'::jsonb)) loop
    insert into public.order_riferimenti_pa (order_id, company_id, tipo, numero, data, cig, cup, codice_univoco_ufficio, fonte, ordinamento)
    values (p_ordine_pa, p_company, coalesce(x->>'tipo', 'contratto'), nullif(x->>'numero', ''), nullif(x->>'data', '')::date,
            nullif(upper(x->>'cig'), ''), nullif(upper(x->>'cup'), ''), nullif(upper(x->>'codice_univoco_ufficio'), ''),
            'contratto_generale', v_rif);
    v_rif := v_rif + 1;
  end loop;

  if jsonb_typeof(p_piano->'elenco') = 'array' and jsonb_array_length(p_piano->'elenco') > 0 then
    v_elenco := public.generale_elenco_importa(p_generale, p_piano->'elenco');
  end if;
  if jsonb_typeof(p_piano->'fasi') = 'array' and jsonb_array_length(p_piano->'fasi') > 0 then
    v_fasi := public.commessa_importa_fasi(p_ordine_pa, p_piano->'fasi', 'computo', null);
  end if;
  return jsonb_build_object('garanzie', v_garanzie, 'riferimenti_pa', v_rif, 'elenco', v_elenco, 'fasi', v_fasi);
end $$;
revoke all on function public.generale_documenti_scrivi_pezzi(uuid, uuid, uuid, jsonb) from public, anon;
grant execute on function public.generale_documenti_scrivi_pezzi(uuid, uuid, uuid, jsonb) to authenticated;

-- ─── Creazione della generale ──────────────────────────────────────────────────
create or replace function public.commessa_generale_crea_da_documenti(p_lettura uuid, p_piano jsonb)
returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_l record;
  v_gen uuid;
  v_pezzi jsonb;
begin
  select id, company_id, stato into v_l from public.generale_letture where id = p_lettura;
  if v_l.id is null then raise exception 'Lettura non trovata' using errcode = 'P0002'; end if;
  if v_l.stato <> 'pronta' then raise exception 'Questa lettura è già stata usata o non è finita.' using errcode = '22023'; end if;
  if coalesce(btrim(p_piano->>'nome'), '') = '' then raise exception 'Scrivi il nome della commessa generale.' using errcode = '22023'; end if;

  v_gen := public.commessa_generale_crea(
    v_l.company_id, p_piano->>'modello', btrim(p_piano->>'nome'), nullif(p_piano->>'cliente_id', '')::uuid,
    nullif(p_piano->>'valore', '')::numeric, null);
  if jsonb_typeof(p_piano->'dati') = 'object' and p_piano->'dati' <> '{}'::jsonb then
    perform public.commessa_generale_dati_salva(v_gen, p_piano->'dati');
  end if;
  v_pezzi := public.generale_documenti_scrivi_pezzi(v_gen, v_gen, v_l.company_id, p_piano);
  perform public.generale_lettura_segna_usata(p_lettura, v_gen, jsonb_build_object('generale_id', v_gen, 'tipo', 'generale') || v_pezzi);
  return v_gen;
end $$;
revoke all on function public.commessa_generale_crea_da_documenti(uuid, jsonb) from public, anon;
grant execute on function public.commessa_generale_crea_da_documenti(uuid, jsonb) to authenticated;

-- ─── Contratto applicativo: figlia dell'accordo quadro ─────────────────────────
create or replace function public.generale_applicativo_crea(p_lettura uuid, p_generale uuid, p_piano jsonb)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_company uuid;
  v_stato text;
  v_figlia uuid := gen_random_uuid();
  v_cliente uuid;
  v_pezzi jsonb;
begin
  select company_id, stato into v_company, v_stato from public.generale_letture where id = p_lettura;
  if v_company is null or auth.uid() is null or public.utente_bloccato()
     or public.has_permission_for_company(auth.uid(), 'can_edit_orders', v_company) is not true then
    raise exception 'Lettura non trovata' using errcode = '42501';
  end if;
  if v_stato <> 'pronta' then raise exception 'Questa lettura è già stata usata o non è finita.' using errcode = '22023'; end if;
  select o.customer_id into v_cliente from public.orders o
   where o.id = p_generale and o.company_id = v_company and o.workflow_kind = 'generale' and o.deleted_at is null;
  if not found then raise exception 'Accordo quadro non trovato.' using errcode = 'P0002'; end if;
  if coalesce(btrim(p_piano->>'nome'), '') = '' then raise exception 'Scrivi il nome del contratto applicativo.' using errcode = '22023'; end if;

  insert into public.orders (id, company_id, created_by, description, workflow_kind, total_amount, order_code, customer_id, work_address, work_start_date, work_end_date)
  values (v_figlia, v_company, auth.uid(), left(btrim(p_piano->>'nome'), 500), 'commessa',
          coalesce(nullif(p_piano->>'valore', '')::numeric, 0), public.prossimo_numero_commessa(v_company), v_cliente,
          left(nullif(p_piano->'dati'->>'indirizzo', ''), 300), nullif(p_piano->'dati'->>'inizio', '')::date, nullif(p_piano->'dati'->>'fine', '')::date);
  perform public.commessa_generale_collega(p_generale, array[v_figlia]);
  -- Il contratto dell'accordo resta sulla generale: dell'applicativo si scrivono riferimenti PA
  -- (col CIG derivato) e fasi sulla figlia; niente contratto, garanzie o elenco qui.
  v_pezzi := public.generale_documenti_scrivi_pezzi(p_generale, v_figlia, v_company,
               jsonb_build_object('riferimenti_pa', coalesce(p_piano->'riferimenti_pa', '[]'::jsonb), 'fasi', coalesce(p_piano->'fasi', '[]'::jsonb)));
  perform public.generale_lettura_segna_usata(p_lettura, p_generale, jsonb_build_object('generale_id', p_generale, 'figlia_id', v_figlia, 'tipo', 'applicativo') || v_pezzi);
  return v_figlia;
end $$;
revoke all on function public.generale_applicativo_crea(uuid, uuid, jsonb) from public, anon;
grant execute on function public.generale_applicativo_crea(uuid, uuid, jsonb) to authenticated;

-- ─── «Annulla tutto» ───────────────────────────────────────────────────────────
create or replace function public.commessa_generale_da_documenti_annulla(p_lettura uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_company uuid;
  v_stato text;
  v_creato jsonb;
  v_ordine uuid;
begin
  select company_id, stato, creato into v_company, v_stato, v_creato from public.generale_letture where id = p_lettura for update;
  if v_company is null or auth.uid() is null
     or public.has_permission_for_company(auth.uid(), 'can_edit_orders', v_company) is not true then
    raise exception 'Lettura non trovata' using errcode = '42501';
  end if;
  if v_stato <> 'usata' or v_creato is null then
    raise exception 'Da questa lettura non è stato creato niente.' using errcode = '22023';
  end if;
  v_ordine := coalesce(nullif(v_creato->>'figlia_id', ''), nullif(v_creato->>'generale_id', ''))::uuid;
  -- Il cestino controlla permessi e movimenti: con costi o incassi la commessa non si toglie.
  perform public.set_order_trashed(v_ordine, v_company, true);
  update public.generale_letture
     set stato = 'pronta', generale_id = case when v_creato->>'tipo' = 'applicativo' then generale_id else null end,
         creato = null, updated_at = now()
   where id = p_lettura;
end $$;
revoke all on function public.commessa_generale_da_documenti_annulla(uuid) from public, anon;
grant execute on function public.commessa_generale_da_documenti_annulla(uuid) to authenticated;
