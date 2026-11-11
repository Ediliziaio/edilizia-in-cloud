-- ============================================================================
-- Correzioni dalla revisione indipendente dei lotti 5-8 (10/11/2026, notte).
-- Nessun dato toccato: subappalto_affidamenti era vuota in produzione.
--
-- 1. contratto_aggancia_affidamenti scattava solo se cambiava l'elenco: un
--    contratto non firmato spostato su un'altra commessa (o ditta) lasciava le
--    quote della commessa vecchia «a contratto» per sempre. Ora scatta anche su
--    order_id / subappaltatore_id / company_id e rifiuta lo spostamento finché
--    il contratto ha righe affidate.
-- 2. Prezzo delle righe affidate al centesimo: il quadro lavori e la variante
--    vogliono i centesimi; con 12,345 € il quadro non si costruiva e la variante
--    restava senza strada.
-- 3. Contratto non firmato ma con misure o SAL (base registrata): l'elenco si
--    può rivedere, ma le quote affidate no (prima si riscrivevano e l'importo
--    restava quello di prima). Si cambiano con una variante.
-- 4. Contratto «Risolto»: le quote si fermano a quanto misurato e riconosciuto;
--    senza misure tornano in bozza. Prima restavano «a contratto» per sempre e
--    la voce non si poteva più dare a nessuno.
-- 5. In firma: bloccati anche numero, date, note e referenti (sono nel PDF).
-- 6. contratto_in_firma risponde solo per i contratti di un'azienda in cui
--    l'utente lavora.
-- ============================================================================

set local lock_timeout = '3s';

create or replace function public.contratto_aggancia_affidamenti()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_anagrafica uuid;
  v_righe jsonb;
  r record;
  v_a public.subappalto_affidamenti%rowtype;
  v_tot numeric;
  v_altri numeric;
  v_desc text;
  v_presi uuid[] := '{}';
  v_base boolean;
begin
  if new.firmato_il is not null then return null; end if;
  if tg_op = 'UPDATE'
     and new.elenco_lavori is not distinct from old.elenco_lavori
     and new.order_id is not distinct from old.order_id
     and new.subappaltatore_id is not distinct from old.subappaltatore_id
     and new.company_id is not distinct from old.company_id then
    return null;
  end if;

  select s.campo_subappaltatore_id into v_anagrafica
    from public.subappaltatori_sicurezza s where s.id = new.subappaltatore_id;
  v_anagrafica := coalesce(v_anagrafica, new.subappaltatore_id);

  -- Spostato su un'altra commessa, ditta o azienda con quote agganciate: no.
  if tg_op = 'UPDATE' and (new.order_id is distinct from old.order_id or new.company_id is distinct from old.company_id
       or new.subappaltatore_id is distinct from old.subappaltatore_id)
     and exists (select 1 from public.subappalto_affidamenti a where a.contratto_id = new.id
                 and (a.order_id is distinct from new.order_id or a.company_id is distinct from new.company_id or a.subappaltatore_id is distinct from v_anagrafica)) then
    raise exception using errcode = '23514',
      message = 'Il contratto ha voci affidate da questa commessa e a questa ditta: per spostarlo togli prima quelle righe da «Lavori e prezzi».';
  end if;

  v_base := exists (select 1 from public.subappalto_quadri_lavori ql where ql.contratto_id = new.id)
    and (exists (select 1 from public.subappalto_misure m where m.contratto_id = new.id and m.stato <> 'annullata')
         or exists (select 1 from public.sal_subappaltatori s where s.contratto_id = new.id and s.stato <> 'contestato' and s.importo_lordo > 0));

  v_righe := case when jsonb_typeof(new.elenco_lavori) = 'array' then new.elenco_lavori else '[]'::jsonb end;

  for r in
    select nullif(e->>'affidamento_id', '')::uuid as id,
           coalesce(nullif(e->>'quantita', '')::numeric, 0) as quantita,
           coalesce(nullif(e->>'prezzo', '')::numeric, 0) as prezzo
      from jsonb_array_elements(v_righe) e
     where nullif(e->>'affidamento_id', '') is not null
  loop
    if r.id = any(v_presi) then
      raise exception using errcode = '23514', message = 'Lo stesso lavoro affidato compare due volte nell''elenco del contratto.';
    end if;
    select * into v_a from public.subappalto_affidamenti a where a.id = r.id for update;
    if not found or v_a.order_id is distinct from new.order_id or v_a.company_id is distinct from new.company_id then
      raise exception using errcode = '23514', message = 'Una riga del contratto viene da un affidamento che non è di questa commessa.';
    end if;
    if v_a.subappaltatore_id is distinct from v_anagrafica then
      raise exception using errcode = '23514', message = 'Una riga del contratto è affidata a un''altra ditta.';
    end if;
    if v_a.contratto_id is not null and v_a.contratto_id <> new.id then
      raise exception using errcode = '23514', message = 'Una riga del contratto è già in un altro contratto della ditta.';
    end if;
    select v.quantita, v.descrizione into v_tot, v_desc
      from public.order_work_phase_voci v where v.id = v_a.voce_id for update;
    if r.prezzo < 0 or r.prezzo <> round(r.prezzo, 2) then
      raise exception using errcode = '22023',
        message = format('«%s»: il prezzo nel contratto va al centesimo (es. 12,35, non 12,345).', left(coalesce(v_desc, ''), 80));
    end if;
    if v_base and (v_a.contratto_id is distinct from new.id or v_a.quantita <> r.quantita or v_a.prezzo_unitario is distinct from r.prezzo) then
      raise exception using errcode = '23514',
        message = format('«%s»: il contratto ha già misure o SAL, le voci affidate si cambiano con una variante.', left(coalesce(v_desc, ''), 80));
    end if;
    select coalesce(sum(a.quantita), 0) into v_altri
      from public.subappalto_affidamenti a where a.voce_id = v_a.voce_id and a.id <> v_a.id;
    if r.quantita <= 0 or r.quantita > coalesce(v_tot, 0) - v_altri + 0.0005 then
      raise exception using errcode = '23514',
        message = format('«%s»: nel contratto %s, ma della voce restano %s (il resto è affidato ad altre ditte).',
                         left(coalesce(v_desc, ''), 80), public.quantita_testo(r.quantita),
                         public.quantita_testo(greatest(coalesce(v_tot, 0) - v_altri, 0)));
    end if;

    update public.subappalto_affidamenti a set
      contratto_id = new.id,
      stato = 'a_contratto',
      quantita = r.quantita,
      prezzo_unitario = r.prezzo,
      origine_prezzo = case when a.prezzo_unitario is not distinct from r.prezzo then a.origine_prezzo else 'manuale' end,
      variante_id = case when a.prezzo_unitario is not distinct from r.prezzo then a.variante_id else null end,
      aggiornato_il = now()
     where a.id = r.id;
    v_presi := v_presi || r.id;
  end loop;

  if v_base and exists (select 1 from public.subappalto_affidamenti a where a.contratto_id = new.id and not (a.id = any(v_presi))) then
    raise exception using errcode = '23514',
      message = 'Il contratto ha già misure o SAL: le voci affidate non si tolgono dall''elenco, si cambiano con una variante.';
  end if;
  update public.subappalto_affidamenti a set contratto_id = null, aggiornato_il = now()
   where a.contratto_id = new.id and not (a.id = any(v_presi));

  return null;
end;
$$;
revoke all on function public.contratto_aggancia_affidamenti() from public, anon, authenticated;

drop trigger if exists contratto_aggancia_affidamenti on public.contratti_subappalto;
create trigger contratto_aggancia_affidamenti
  after insert or update of elenco_lavori, order_id, subappaltatore_id, company_id on public.contratti_subappalto
  for each row execute function public.contratto_aggancia_affidamenti();

-- 4. Contratto risolto: le quote si fermano al misurato, il resto torna libero.
create or replace function public.contratto_risolto_libera_quote()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  a public.subappalto_affidamenti%rowtype;
  v_qv jsonb;
  v_ric numeric;
  v_fatto numeric;
begin
  if new.stato is distinct from 'risolto' or old.stato is not distinct from 'risolto' then return null; end if;
  for a in select * from public.subappalto_affidamenti x where x.contratto_id = new.id for update loop
    v_qv := null;
    select e.x into v_qv
      from public.subappalto_quadri_lavori ql, jsonb_array_elements(ql.voci) e(x)
     where ql.contratto_id = new.id and e.x->>'affidamento_id' = a.id::text
     order by ql.revisione desc limit 1;
    v_fatto := 0;
    if v_qv is not null then
      select coalesce(sum(m.quantita_riconosciuta), 0) into v_ric from public.subappalto_misure m
       where m.contratto_id = new.id and m.voce_id = (v_qv->>'id')::uuid and m.stato = 'riconosciuta';
      -- A corpo la misura è una frazione della quota (0-1).
      v_fatto := case when v_qv->>'base' = 'corpo' then round(a.quantita * least(v_ric, 1), 4) else least(v_ric, a.quantita) end;
    end if;
    if v_fatto > 0 then
      update public.subappalto_affidamenti x set quantita = v_fatto, aggiornato_il = now() where x.id = a.id;
    else
      update public.subappalto_affidamenti x set contratto_id = null, aggiornato_il = now() where x.id = a.id;
    end if;
  end loop;
  return null;
end;
$$;
revoke all on function public.contratto_risolto_libera_quote() from public, anon, authenticated;

drop trigger if exists contratto_risolto_libera_quote on public.contratti_subappalto;
create trigger contratto_risolto_libera_quote
  after update of stato on public.contratti_subappalto
  for each row execute function public.contratto_risolto_libera_quote();

-- 5 e 6. In firma: tutto quello che sta nel PDF; e la domanda solo per la propria azienda.
create or replace function public.contratto_in_firma(p_contratto uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.signature_requests r
      join public.contratti_subappalto c on c.id = r.contratto_subappalto_id
     where r.contratto_subappalto_id = p_contratto and r.status in ('pending', 'otp_verified')
       and public.has_permission_for_company(auth.uid(), 'can_edit_orders', c.company_id)
  );
$$;
revoke all on function public.contratto_in_firma(uuid) from public, anon;
grant execute on function public.contratto_in_firma(uuid) to authenticated, service_role;

do $do$
declare
  d text;
begin
  d := pg_get_functiondef('public.contratto_subappalto_protetto()'::regprocedure);
  if d like '%new.referente_subappaltatore is distinct from old.referente_subappaltatore%' then return; end if;
  d := replace(d,
    '    or new.articoli_personalizzati is distinct from old.articoli_personalizzati)
    and public.contratto_in_firma(old.id) then',
    '    or new.articoli_personalizzati is distinct from old.articoli_personalizzati
    or new.numero_contratto is distinct from old.numero_contratto
    or new.data_stipula is distinct from old.data_stipula
    or new.data_inizio is distinct from old.data_inizio
    or new.data_fine_prevista is distinct from old.data_fine_prevista
    or new.note is distinct from old.note
    or new.responsabile_impresa is distinct from old.responsabile_impresa
    or new.referente_subappaltatore is distinct from old.referente_subappaltatore)
    and public.contratto_in_firma(old.id) then');
  if d not like '%new.referente_subappaltatore is distinct from old.referente_subappaltatore%' then
    raise exception 'contratto_subappalto_protetto: testo non atteso, correzione non applicata';
  end if;
  execute d;
end
$do$;
