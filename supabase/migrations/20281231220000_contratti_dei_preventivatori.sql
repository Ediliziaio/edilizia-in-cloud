-- Il preventivo firmato è il contratto, e un contratto è una commessa — lotto 2 (31/10/2026).
--
-- Il lotto 1 (20281029270000, 20281030180000) l'ha reso vero per il preventivatore classico.
-- Qui per tutti gli altri:
--
--  1. «Firmato su carta» anche per i preventivatori (modulo_firmato_su_carta): scansione
--     obbligatoria in quote-pdfs/<azienda>/contratti-carta/<chiave>-<progetto>/, come il classico.
--     Edili e serramenti la registrano sulla loro riga «ombra» in quotes (source modulo:<chiave>:<id>,
--     la stessa della firma digitale); il fotovoltaico, che firma senza riga ombra, sul progetto.
--  2. converti_modulo_commessa_atomic vale per tutti: fotovoltaico, serramenti, ristrutturazione e
--     i 7 edili (bagni, tetti, clima, elettrico, termoidraulico, pavimenti, piscine). Crea la commessa
--     SOLO da un preventivo firmato (digitale, dal link o su carta), con le righe (articoli o lavorazioni
--     con le loro voci), le fasi e le rate del piano di pagamento del preventivo, se c'è e fa 100%.
--     Le voci opzionali, fuori dal totale del preventivo, restano fuori anche dalla commessa.
--  3. sr_converti_in_ordine passa dallo stesso motore: prima creava solo la testata (niente articoli,
--     fasi né rate), segnava da sola il preventivo «accettato» senza firma, e metteva l'id del CONTATTO
--     in orders.customer_id (che vuole un profilo: la conversione falliva sul vincolo).
--  4. Ai 7 edili la colonna ordine_id; a tutti gli edili `copia_di` (la copia con un altro modello).
--  5. Una copia o revisione di un preventivo già commessa non diventa una seconda commessa: è una
--     variante di quella (fotovoltaico: versione_padre_id; serramenti: parent_id; edili: copia_di).
--     La commessa punta al contratto (orders.quote_id = riga ombra, quando c'è), quindi vale anche
--     l'indice unico orders_un_contratto_una_commessa e le date delle rate «alla firma» si calcolano.
--
-- Ripresa l'8/11/2026 sopra lo stato attuale. In più: i serramenti diventano una riga per posizione
-- (gruppo, riferimento = ambiente, misure del preventivo, stato «da rilevare»), così l'ordine potrà
-- leggere le misure del sopralluogo. Nessuna riga esistente viene scritta.
--
-- Le 4 commesse di ristrutturazione fatte prima senza firma restano com'erano: la regola vale per
-- le conversioni nuove.

set local lock_timeout = '3s';
set local statement_timeout = '60s';

-- ── 4. Colonne ─────────────────────────────────────────────────────────────────────────────────
alter table public.bgn_progetti add column if not exists ordine_id uuid references public.orders(id) on delete set null;
alter table public.tet_progetti add column if not exists ordine_id uuid references public.orders(id) on delete set null;
alter table public.clm_progetti add column if not exists ordine_id uuid references public.orders(id) on delete set null;
alter table public.ele_progetti add column if not exists ordine_id uuid references public.orders(id) on delete set null;
alter table public.idr_progetti add column if not exists ordine_id uuid references public.orders(id) on delete set null;
alter table public.pav_progetti add column if not exists ordine_id uuid references public.orders(id) on delete set null;
alter table public.pis_progetti add column if not exists ordine_id uuid references public.orders(id) on delete set null;
create index if not exists idx_bgn_progetti_ordine on public.bgn_progetti(ordine_id) where ordine_id is not null;
create index if not exists idx_tet_progetti_ordine on public.tet_progetti(ordine_id) where ordine_id is not null;
create index if not exists idx_clm_progetti_ordine on public.clm_progetti(ordine_id) where ordine_id is not null;
create index if not exists idx_ele_progetti_ordine on public.ele_progetti(ordine_id) where ordine_id is not null;
create index if not exists idx_idr_progetti_ordine on public.idr_progetti(ordine_id) where ordine_id is not null;
create index if not exists idx_pav_progetti_ordine on public.pav_progetti(ordine_id) where ordine_id is not null;
create index if not exists idx_pis_progetti_ordine on public.pis_progetti(ordine_id) where ordine_id is not null;

alter table public.rst_progetti add column if not exists copia_di uuid references public.rst_progetti(id) on delete set null;
alter table public.bgn_progetti add column if not exists copia_di uuid references public.bgn_progetti(id) on delete set null;
alter table public.tet_progetti add column if not exists copia_di uuid references public.tet_progetti(id) on delete set null;
alter table public.clm_progetti add column if not exists copia_di uuid references public.clm_progetti(id) on delete set null;
alter table public.ele_progetti add column if not exists copia_di uuid references public.ele_progetti(id) on delete set null;
alter table public.idr_progetti add column if not exists copia_di uuid references public.idr_progetti(id) on delete set null;
alter table public.pav_progetti add column if not exists copia_di uuid references public.pav_progetti(id) on delete set null;
alter table public.pis_progetti add column if not exists copia_di uuid references public.pis_progetti(id) on delete set null;
comment on column public.rst_progetti.copia_di is
  'Il preventivo da cui questo è stato copiato (copia con un altro modello): se quello è già commessa, questo è una variante.';

-- Il fotovoltaico firma senza riga ombra: il modo e la scansione stanno sul progetto.
alter table public.fv_progetti add column if not exists firma_modo text;
alter table public.fv_progetti add column if not exists contratto_firmato jsonb;
alter table public.fv_progetti add column if not exists firmato_da text;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'fv_progetti_firma_modo_check') then
    alter table public.fv_progetti add constraint fv_progetti_firma_modo_check
      check (firma_modo is null or firma_modo in ('digitale', 'online', 'carta', 'importato'));
  end if;
end $$;

-- Le voci del computo degli edili diversi dalla ristrutturazione.
alter table public.order_work_phase_voci drop constraint if exists order_work_phase_voci_origine_check;
alter table public.order_work_phase_voci add constraint order_work_phase_voci_origine_check
  check (origine = any (array['preventivo', 'computo_rst', 'computo', 'listino', 'variante', 'computo_modulo']));

-- ── Chiavi e tabelle dei preventivatori ───────────────────────────────────────────────────────
-- La chiave è quella del ponte delle firme (quotes.source = modulo:<chiave>:<id>).
create or replace function public.modulo_chiave(p_modulo text)
returns text language sql immutable set search_path to 'public' as $$
  select case lower(btrim(coalesce(p_modulo, '')))
    when 'fv' then 'fv' when 'sr' then 'sr' when 'rst' then 'rst'
    when 'bagni' then 'bagni' when 'bgn' then 'bagni'
    when 'tetti' then 'tetti' when 'tet' then 'tetti'
    when 'clm' then 'clm' when 'ele' then 'ele' when 'idr' then 'idr' when 'pav' then 'pav' when 'pis' then 'pis'
  end
$$;

create or replace function public.modulo_tabella(p_chiave text)
returns text language sql immutable set search_path to 'public' as $$
  select case public.modulo_chiave(p_chiave)
    when 'fv' then 'fv_progetti' when 'sr' then 'sr_progetti' when 'rst' then 'rst_progetti'
    when 'bagni' then 'bgn_progetti' when 'tetti' then 'tet_progetti' when 'clm' then 'clm_progetti'
    when 'ele' then 'ele_progetti' when 'idr' then 'idr_progetti' when 'pav' then 'pav_progetti'
    when 'pis' then 'pis_progetti'
  end
$$;

-- ── Il contratto di un preventivatore ─────────────────────────────────────────────────────────
-- Firmato = la riga ombra è accettata (firma digitale, link o carta) o già convertita; per il
-- fotovoltaico il progetto è «firmato»; per i serramenti c'è la data di firma (firma dalla /stima).
-- Uno stato «accettato» messo a mano, senza firma né scansione, non è un contratto.
create or replace function public.modulo_contratto_di(p_chiave text, q jsonb)
returns jsonb language plpgsql stable set search_path to 'public' as $$
declare
  ombra public.quotes;
  firmato boolean := false;
  modo text;
begin
  if p_chiave <> 'fv' then
    select * into ombra from public.quotes
     where company_id = (q->>'company_id')::uuid
       and source = 'modulo:' || p_chiave || ':' || (q->>'id')
       and deleted_at is null
     order by created_at limit 1;
  end if;
  if ombra.id is not null and ombra.status in ('accettata', 'convertita') then firmato := true; end if;
  if p_chiave = 'fv' and (q->>'stato' = 'firmato' or nullif(q->>'firmato_il', '') is not null) then firmato := true; end if;
  if p_chiave = 'sr' and nullif(q->>'firmato_il', '') is not null then firmato := true; end if;
  if firmato then
    modo := coalesce(case when p_chiave = 'fv' then q->>'firma_modo' else ombra.firma_modo end,
      case when ombra.id is not null and ombra.signed_by_ip is not null then 'online' else 'digitale' end);
  end if;
  return jsonb_build_object(
    'firmato', firmato,
    'modo', modo,
    'quote_id', ombra.id,
    'quote_number', ombra.quote_number,
    'quote_status', ombra.status,
    'signed_at', case when p_chiave = 'fv' then q->>'firmato_il'
                      else coalesce(ombra.signed_at::text, q->>'firmato_il') end,
    'signed_by_name', case when p_chiave = 'fv' then q->>'firmato_da' else ombra.signed_by_name end,
    'contratto_firmato', case when p_chiave = 'fv' then q->'contratto_firmato' else to_jsonb(ombra.contratto_firmato) end);
end $$;

-- Un altro preventivo della stessa famiglia (copia, revisione, versione) già diventato commessa.
create or replace function public.modulo_famiglia_in_commessa(p_chiave text, q jsonb)
returns jsonb language plpgsql stable set search_path to 'public' as $$
declare
  tabella text := public.modulo_tabella(p_chiave);
  legame text := case p_chiave when 'fv' then 'versione_padre_id' when 'sr' then 'parent_id' else 'copia_di' end;
  codice text := case p_chiave when 'fv' then 'numero' else 'code' end;
  trovato jsonb;
begin
  execute format($f$
    with recursive su(id, padre, livello, percorso) as (
      select id, %1$I, 0, array[id] from public.%2$I where id = $1
      union all
      select p.id, p.%1$I, su.livello + 1, su.percorso || p.id
        from public.%2$I p join su on p.id = su.padre
       where not p.id = any(su.percorso)
    ), radice as (
      select id from su order by livello desc limit 1
    ), giu(id, percorso) as (
      select id, array[id] from radice
      union all
      select c.id, giu.percorso || c.id from public.%2$I c join giu on c.%1$I = giu.id
       where not c.id = any(giu.percorso)
    )
    select jsonb_build_object('order_id', o.id, 'order_code', o.order_code, 'preventivo', p.%3$I)
      from giu join public.%2$I p on p.id = giu.id join public.orders o on o.id = p.ordine_id
     where p.id <> $1 and o.deleted_at is null
     limit 1 $f$, legame, tabella, codice)
    into trovato using (q->>'id')::uuid;
  -- Un edile importato da un preventivo classico che è già una commessa.
  if trovato is null and nullif(q->>'origine_quote_id', '') is not null then
    select jsonb_build_object('order_id', o.id, 'order_code', o.order_code, 'preventivo', o.quote_number) into trovato
      from public.orders o
     where o.quote_id = (q->>'origine_quote_id')::uuid and o.deleted_at is null
     limit 1;
  end if;
  return trovato;
end $$;

-- Le rate del piano di pagamento del preventivo, sul totale IVA inclusa. Tre forme:
--   edili     {modo, righe: [{nome, percent, evento, numero}]}
--   fotovolt. {tranche: [{label, pct}]}
--   serramenti [{label, when, percentuale}]
-- Un piano che non fa 100% non diventa rate (la commessa prende il modello dell'azienda).
create or replace function public.rate_da_piano_preventivo(p_piano jsonb, p_totale_lordo numeric)
returns jsonb language plpgsql immutable set search_path to 'public' as $$
declare
  righe jsonb;
  r jsonb;
  n integer;
  pos integer := 0;
  somma numeric := 0;
  totale numeric := round(coalesce(p_totale_lordo, 0), 2);
  resto numeric;
  importo numeric;
  pct numeric;
  etichetta text;
  testo text;
  evento text;
  numero integer;
  esito jsonb := '[]'::jsonb;
  ammessi constant text[] := array['data_fissa', 'firma_contratto', 'accettazione_preventivo', 'merce_magazzino',
    'consegna_cantiere', 'inizio_lavori', 'data_posa', 'sal_numero', 'fine_lavori', 'fattura_acconto', 'fattura_saldo'];
begin
  if p_piano is null or totale <= 0 then return '[]'::jsonb; end if;
  if jsonb_typeof(p_piano) = 'object' and jsonb_typeof(p_piano->'righe') = 'array' then
    select coalesce(jsonb_agg(jsonb_build_object('label', x->>'nome', 'percent', x->>'percent',
             'evento', x->>'evento', 'numero', x->>'numero') order by i), '[]')
      into righe from jsonb_array_elements(p_piano->'righe') with ordinality a(x, i) where jsonb_typeof(x) = 'object';
  elsif jsonb_typeof(p_piano) = 'object' and jsonb_typeof(p_piano->'tranche') = 'array' then
    select coalesce(jsonb_agg(jsonb_build_object('label', x->>'label', 'percent', x->>'pct') order by i), '[]')
      into righe from jsonb_array_elements(p_piano->'tranche') with ordinality a(x, i) where jsonb_typeof(x) = 'object';
  elsif jsonb_typeof(p_piano) = 'array' then
    select coalesce(jsonb_agg(jsonb_build_object('label', coalesce(nullif(x->>'label', ''), x->>'when'),
             'percent', x->>'percentuale', 'quando', x->>'when') order by i), '[]')
      into righe from jsonb_array_elements(p_piano) with ordinality a(x, i) where jsonb_typeof(x) = 'object';
  else
    return '[]'::jsonb;
  end if;
  -- Le percentuali devono essere numeri tra 0 e 100; le righe a zero non diventano rate.
  for r in select value from jsonb_array_elements(righe) loop
    begin
      pct := round((r->>'percent')::numeric, 2);
    exception when others then
      return '[]'::jsonb;
    end;
    if pct is null or pct < 0 or pct > 100 then return '[]'::jsonb; end if;
    somma := somma + pct;
  end loop;
  if abs(somma - 100) > 0.01 then return '[]'::jsonb; end if;
  select coalesce(jsonb_agg(x order by i), '[]') into righe
    from jsonb_array_elements(righe) with ordinality a(x, i) where (x->>'percent')::numeric > 0;
  n := jsonb_array_length(righe);
  if n = 0 or n > 12 then return '[]'::jsonb; end if;
  resto := totale;
  for r in select value from jsonb_array_elements(righe) loop
    pos := pos + 1;
    pct := round((r->>'percent')::numeric, 2);
    if pos = n then importo := greatest(0, resto);
    else importo := round(totale * pct / 100, 2); resto := resto - importo; end if;
    etichetta := left(coalesce(nullif(btrim(r->>'label'), ''), 'Rata ' || pos), 80);
    evento := r->>'evento';
    if evento is null or evento <> all (ammessi) then
      testo := lower(concat_ws(' ', r->>'label', r->>'quando'));
      evento := case
        when testo ~ 'firma|contratto|ordine' then 'firma_contratto'
        when testo ~ 'accettazion' then 'accettazione_preventivo'
        when testo ~ 'fine lavori|fine dei lavori|ultimazion|collaudo|saldo' then 'fine_lavori'
        when testo ~ 'inizio|avvio|apertura' then 'inizio_lavori'
        when testo ~ 'consegna' then 'consegna_cantiere'
        when testo ~ 'posa' then 'data_posa'
        else 'data_fissa' end;
    end if;
    numero := null;
    if evento = 'sal_numero' then
      begin
        numero := least(greatest(coalesce(nullif(r->>'numero', '')::integer, pos), 1), 99);
      exception when others then
        numero := pos;
      end;
    end if;
    esito := esito || jsonb_build_object(
      'position', pos - 1,
      'label', etichetta,
      'type', case when etichetta ~* 'finanziam' then 'financing' when pos = n then 'balance' else 'deposit' end,
      'amount', importo,
      'is_paid', false,
      'trigger_evento', evento,
      'trigger_numero', numero,
      'giorni_preavviso', 7);
  end loop;
  return esito;
end $$;

-- ── Lettura del progetto con i controlli di accesso ───────────────────────────────────────────
create or replace function public.modulo_progetto_accessibile(p_chiave text, p_progetto_id uuid, p_permesso text, p_blocca boolean)
returns jsonb language plpgsql security definer set search_path to 'public' as $$
declare
  tabella text := public.modulo_tabella(p_chiave);
  q jsonb;
  azienda uuid;
begin
  if auth.uid() is null or public.utente_bloccato() or public.utente_e_cliente_esterno() then
    raise exception 'Sessione non autorizzata.' using errcode = '42501';
  end if;
  if tabella is null then raise exception 'Modulo non valido.' using errcode = '22023'; end if;
  execute format('select to_jsonb(p) from public.%I p where id = $1 %s', tabella,
                 case when p_blocca then 'for update' else '' end)
    into q using p_progetto_id;
  if q is null then raise exception 'Preventivo non trovato.' using errcode = 'P0002'; end if;
  azienda := (q->>'company_id')::uuid;
  perform public.assert_company_access(azienda);
  -- Stessa visibilità delle tabelle di origine, anche per «solo assegnati».
  if azienda is distinct from public.get_effective_company_id()
     or public.check_staff_visibility(auth.uid(), (q->>'created_by')::uuid) is not true
     or (p_permesso is not null and public.has_permission_for_company(auth.uid(), p_permesso, azienda) is not true) then
    raise exception 'Non hai il permesso di farlo su questo preventivo.' using errcode = '42501';
  end if;
  -- Non basta che una vecchia riga di accesso esista ancora.
  if azienda is distinct from public.get_user_company_id(auth.uid())
     and not public.has_role(auth.uid(), 'super_admin'::public.app_role)
     and not exists (select 1 from public.multi_company_access m where m.user_id = auth.uid()
       and m.company_id = azienda and m.status = 'active' and (m.expires_at is null or m.expires_at > now())) then
    raise exception 'Accesso azienda scaduto o revocato.' using errcode = '42501';
  end if;
  return q;
end $$;

-- Per la scheda «Dal preventivo alla commessa»: firmato o no, come, la commessa (sua o della famiglia).
create or replace function public.modulo_contratto(p_modulo text, p_progetto_id uuid)
returns jsonb language plpgsql security definer set search_path to 'public' as $$
declare
  chiave text := public.modulo_chiave(p_modulo);
  q jsonb := public.modulo_progetto_accessibile(chiave, p_progetto_id, null, false);
begin
  return public.modulo_contratto_di(chiave, q) || jsonb_build_object(
    'ordine_id', q->>'ordine_id',
    'famiglia', public.modulo_famiglia_in_commessa(chiave, q));
end $$;

-- ── 1. Firmato su carta ───────────────────────────────────────────────────────────────────────
create or replace function public.modulo_firmato_su_carta(
  p_modulo text, p_progetto_id uuid, p_path text, p_nome text, p_mime text,
  p_firmato_il date, p_firmatario text, p_solo_verifica boolean default false)
returns jsonb language plpgsql security definer set search_path to 'public' as $$
declare
  chiave text := public.modulo_chiave(p_modulo);
  tabella text := public.modulo_tabella(chiave);
  q jsonb;
  azienda uuid;
  contratto jsonb;
  ombra public.quotes;
  firmato_alle timestamptz := (p_firmato_il + time '12:00') at time zone 'Europe/Rome';
  documento jsonb;
  aliquota numeric;
  imponibile numeric;
  totale numeric;
begin
  q := public.modulo_progetto_accessibile(chiave, p_progetto_id, 'can_edit_preventivi', true);
  azienda := (q->>'company_id')::uuid;
  if nullif(q->>'deleted_at', '') is not null or coalesce((q->>'annullato')::boolean, false) then
    raise exception 'Il preventivo è stato eliminato o annullato.' using errcode = '22023';
  end if;
  if nullif(q->>'ordine_id', '') is not null then
    raise exception 'Questo preventivo è già una commessa: è già il contratto.' using errcode = '22023';
  end if;
  contratto := public.modulo_contratto_di(chiave, q);
  if (contratto->>'firmato')::boolean then
    raise exception 'Il preventivo è già firmato: è già il contratto.' using errcode = '22023';
  end if;
  if q->>'stato' in ('rifiutato', 'archiviato', 'annullato') or contratto->>'quote_status' = 'rifiutata' then
    raise exception 'Un preventivo «%» non si firma: riaprilo o fanne una copia.',
      coalesce(nullif(contratto->>'quote_status', ''), q->>'stato') using errcode = '22023';
  end if;
  if p_firmato_il is null or p_firmato_il > (now() at time zone 'Europe/Rome')::date then
    raise exception 'Indica il giorno della firma (non nel futuro).' using errcode = '22023';
  end if;
  if nullif(btrim(coalesce(p_firmatario, '')), '') is null then
    raise exception 'Indica chi ha firmato.' using errcode = '22023';
  end if;
  if p_solo_verifica then return jsonb_build_object('progetto_id', p_progetto_id, 'verificato', true); end if;
  if p_path is null or p_path not like azienda || '/contratti-carta/' || chiave || '-' || p_progetto_id || '/%'
     or p_path like '%..%'
     or not exists (select 1 from storage.objects s where s.bucket_id = 'quote-pdfs' and s.name = p_path) then
    raise exception 'Carica prima la scansione del contratto firmato.' using errcode = '22023';
  end if;
  documento := jsonb_build_object('bucket', 'quote-pdfs', 'path', p_path,
    'name', coalesce(nullif(btrim(p_nome), ''), 'contratto firmato'), 'mime', p_mime);

  if chiave = 'fv' then
    update public.fv_progetti
       set stato = 'firmato', firmato_il = firmato_alle, firma_modo = 'carta',
           contratto_firmato = documento, firmato_da = btrim(p_firmatario)
     where id = p_progetto_id;
    return jsonb_build_object('progetto_id', p_progetto_id, 'firmato', true);
  end if;

  -- Edili e serramenti: il contratto sta sulla riga ombra, la stessa della firma digitale.
  if chiave = 'sr' then
    aliquota := coalesce(nullif((q->>'iva_percentuale')::numeric, -1), 10);
    totale := round(coalesce((q->>'totale_max')::numeric, (q->>'totale_min')::numeric, 0), 2);
    imponibile := round(totale / (1 + greatest(aliquota, 0) / 100), 2);
  else
    totale := round(coalesce((q->>'totale')::numeric, 0), 2);
    imponibile := round(coalesce(nullif((q->>'totale_imponibile')::numeric, 0),
      totale / (1 + greatest(coalesce((q->>'iva_pct')::numeric, 22), 0) / 100)), 2);
  end if;
  select * into ombra from public.quotes where id = (contratto->>'quote_id')::uuid for update;
  if ombra.id is null then
    insert into public.quotes (company_id, created_by, quote_number, status, source, title,
      client_name, client_email, client_phone, subtotal, vat_amount, total,
      signed_at, signed_by_name, firma_modo, contratto_firmato)
    values (azienda, auth.uid(), public.generate_quote_number(azienda), 'accettata',
      'modulo:' || chiave || ':' || p_progetto_id,
      'Preventivo ' || coalesce(q->>'code', ''),
      coalesce(nullif(btrim(concat_ws(' ', q->>'cliente_nome', q->>'cliente_cognome')), ''), 'Cliente'),
      nullif(q->>'cliente_email', ''), nullif(q->>'cliente_telefono', ''),
      imponibile, round(totale - imponibile, 2), totale,
      firmato_alle, btrim(p_firmatario), 'carta', documento)
    returning * into ombra;
  else
    update public.quotes
       set status = 'accettata', signed_at = firmato_alle, signed_by_name = btrim(p_firmatario),
           firma_modo = 'carta', contratto_firmato = documento, updated_at = now()
     where id = ombra.id;
  end if;
  -- Il progetto risulta firmato come con la firma digitale (fea-completa-firma).
  if chiave = 'sr' then
    update public.sr_progetti set stato = 'accettato', firmato_il = firmato_alle, updated_at = now() where id = p_progetto_id;
  else
    execute format('update public.%I set stato = ''accettato'' where id = $1', tabella) using p_progetto_id;
  end if;
  return jsonb_build_object('progetto_id', p_progetto_id, 'quote_id', ombra.id, 'firmato', true);
end $$;

-- ── 2. Dal preventivo firmato alla commessa ───────────────────────────────────────────────────
create or replace function public.converti_modulo_commessa_atomic(p_modulo text, p_progetto_id uuid, p_raggruppa_capitoli boolean DEFAULT false, p_anteprima boolean DEFAULT true, p_impronta text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  chiave text := public.modulo_chiave(p_modulo);
  tabella text := public.modulo_tabella(p_modulo);
  prefisso text := split_part(public.modulo_tabella(p_modulo), '_', 1);
  q jsonb; r jsonb; materiali jsonb := '[]'; fasi jsonb := '[]'; rate jsonb := '[]';
  componenti jsonb := '[]'; servizi jsonb := '[]'; ore jsonb := '[]'; voci jsonb := '[]';
  serramenti jsonb := '[]'; accessori jsonb := '[]'; listino jsonb := '{}';
  contratto jsonb; famiglia jsonb;
  azienda uuid; profilo uuid; ordine uuid; fase_id uuid; sotto jsonb; sotto_pos integer; stato uuid; esito jsonb;
  opportunita uuid;
  aliquota numeric; netto numeric; lordo numeric; quantita numeric; prezzo numeric; costo numeric;
  nome text; note text; descrizione text; indirizzo text; codice text; impronta text; misure text; origine text;
  posizione integer := 0; gruppi_misura jsonb := '{}'; chiave_gruppo text; esclusi integer := 0;
  voce jsonb; voce_pos integer; somma_voci numeric := 0; venduto_esatto boolean;
begin
  if tabella is null then raise exception 'Modulo non valido.' using errcode = '22023'; end if;
  q := public.modulo_progetto_accessibile(chiave, p_progetto_id, 'can_edit_orders', true);
  azienda := (q->>'company_id')::uuid;
  if nullif(q->>'ordine_id','') is not null then
    raise exception 'Questo preventivo è già diventato una commessa.' using errcode='23505';
  end if;
  if coalesce((q->>'annullato')::boolean,false) or nullif(q->>'deleted_at','') is not null then
    raise exception 'Il preventivo è stato eliminato o annullato.';
  end if;
  -- Il preventivo firmato è il contratto: senza firma non c'è commessa.
  contratto := public.modulo_contratto_di(chiave, q);
  if not (contratto->>'firmato')::boolean then
    raise exception 'Il preventivo non è firmato: la commessa nasce dal contratto. Fallo firmare (firma digitale o accettazione dal link) oppure registra la firma su carta.'
      using errcode = '22023';
  end if;
  -- Un contratto, una commessa: una copia o revisione di un preventivo già commessa è una variante.
  famiglia := public.modulo_famiglia_in_commessa(chiave, q);
  if famiglia is not null then
    raise exception 'Il preventivo % è già la commessa %: le modifiche di questo preventivo vanno registrate come variante di quella commessa.',
      coalesce(famiglia->>'preventivo', ''), coalesce(famiglia->>'order_code', '') using errcode = '23505';
  end if;
  if nullif(contratto->>'quote_id', '') is not null
     and exists (select 1 from public.orders o where o.quote_id = (contratto->>'quote_id')::uuid) then
    raise exception 'Esiste già una commessa associata a questo contratto.' using errcode = '23505';
  end if;

  if chiave = 'fv' then
    aliquota := coalesce((q->>'iva_aliquota')::numeric, 10);
    if aliquota < 0 then aliquota := 10; end if;
    if aliquota > 0 and aliquota <= 1 then aliquota := round(aliquota*100,2); end if;
    netto := case when coalesce((q->>'prezzo_vendita_manuale')::numeric,0)>0
      then round((q->>'prezzo_vendita_manuale')::numeric,2)
      else round(coalesce((q->>'prezzo_vendita_iva_inclusa')::numeric,0)/(1+aliquota/100),2) end;
    select coalesce(jsonb_agg(to_jsonb(c) order by ordinamento,id),'[]') into componenti
      from (select * from public.fv_componenti_progetto where progetto_id=p_progetto_id for share) c;
    select coalesce(jsonb_agg(to_jsonb(s) order by ordinamento,id),'[]') into servizi
      from (select * from public.fv_servizi_progetto where progetto_id=p_progetto_id for share) s;
    select coalesce(jsonb_agg(to_jsonb(m) order by ordinamento,id),'[]') into ore
      from (select * from public.fv_manodopera_progetto where progetto_id=p_progetto_id for share) m;
    for r in select value from jsonb_array_elements(componenti) loop
      quantita := coalesce((r->>'quantita')::numeric,0);
      if quantita<=0 then esclusi:=esclusi+1; continue; end if;
      nome := coalesce(nullif(trim(concat_ws(' ',r->>'marca',r->>'modello')),''),nullif(r->>'descrizione',''),'Componente');
      prezzo := coalesce((r->>'prezzo_unitario_vendita')::numeric,(r->>'prezzo_unitario_netto')::numeric,0);
      costo := coalesce((r->>'prezzo_unitario_netto')::numeric,0);
      note := nullif(concat_ws(' · ',nullif(r->>'descrizione',''),nullif(r->>'categoria','')),'');
      if quantita<>trunc(quantita) then
        note:=concat(quantita,' unità × ',prezzo,' €',case when note is not null then ' · '||note else '' end);
      end if;
      materiali:=materiali||jsonb_build_array(jsonb_build_object('name',left(nome,120),'description',note,
        'quantity',(case when quantita=trunc(quantita) then quantita else 1 end)::integer,
        'unit_price',round(case when quantita=trunc(quantita) then prezzo else prezzo*quantita end,2),
        'purchase_price',round(case when quantita=trunc(quantita) then costo else costo*quantita end,2),
        'status','da_ordinare','position',jsonb_array_length(materiali),'vat_rate',aliquota));
    end loop;
    for r in select value from jsonb_array_elements(servizi) loop
      quantita:=coalesce((r->>'quantita')::numeric,1);
      if quantita<=0 then esclusi:=esclusi+1; continue; end if;
      fasi:=fasi||jsonb_build_array(jsonb_build_object('name',coalesce(nullif(r->>'descrizione',''),nullif(r->>'tipo',''),'Servizio'),
        'notes',concat_ws(E'\n',nullif(r->>'tipo',''),quantita||' unità')));
    end loop;
    for r in select value from jsonb_array_elements(ore) loop
      quantita:=coalesce((r->>'ore')::numeric,0);
      if quantita<=0 then esclusi:=esclusi+1; continue; end if;
      fasi:=fasi||jsonb_build_array(jsonb_build_object('name',coalesce(nullif(r->>'descrizione',''),'Manodopera'),
        'notes',quantita||' h · Manodopera prevista; le ore effettive si registrano in cantiere.'));
    end loop;
    descrizione:=coalesce(nullif(trim(q->>'titolo'),''),'Impianto fotovoltaico '||coalesce(q->>'numero',''));
    codice:=q->>'numero';
    indirizzo:=concat_ws(', ',nullif(q->>'indirizzo',''),nullif(trim(concat_ws(' ',q->>'cap',q->>'comune')),''),nullif(q->>'provincia',''));
    lordo := round(netto*(1+aliquota/100),2);
    rate := public.rate_da_piano_preventivo(q->'modalita_pagamento', lordo);

  elsif chiave = 'sr' then
    -- Lo stesso conto di prima (sr_converti_in_ordine): il prezzo IVA inclusa del preventivo.
    lordo := round(coalesce((q->>'totale_max')::numeric,(q->>'totale_min')::numeric,0),2);
    if (q->>'totale_min') is not null and (q->>'totale_max') is not null
       and (q->>'totale_min')::numeric > (q->>'totale_max')::numeric then
      raise exception 'Forbice prezzo non coerente: min (%) maggiore di max (%)', q->>'totale_min', q->>'totale_max'
        using errcode = '22023';
    end if;
    select coalesce(jsonb_agg(to_jsonb(s) order by position,id),'[]') into serramenti
      from (select * from public.sr_serramenti_progetto where progetto_id=p_progetto_id for share) s;
    select coalesce(jsonb_agg(to_jsonb(a) order by position,id),'[]') into accessori
      from (select * from public.sr_accessori_progetto where progetto_id=p_progetto_id for share) a;
    select coalesce(jsonb_agg(to_jsonb(v) order by position,id),'[]') into servizi
      from (select * from public.sr_servizi_progetto where progetto_id=p_progetto_id for share) v;
    if coalesce((q->>'iva_percentuale')::numeric, 10) >= 0 then
      aliquota := coalesce((q->>'iva_percentuale')::numeric, 10);
    else
      -- IVA mista dei beni significativi: 10% fino al valore di accessori e servizi, 22% sul resto.
      declare bs numeric; altre numeric; begin
        select coalesce(sum(coalesce((x->>'prezzo_totale')::numeric, (x->>'prezzo_unitario')::numeric*coalesce((x->>'quantita')::numeric,1), 0)),0)
          into bs from jsonb_array_elements(serramenti) x;
        select coalesce(sum(coalesce((x->>'prezzo_totale')::numeric, (x->>'prezzo_unitario')::numeric*coalesce((x->>'quantita')::numeric,1), 0)),0)
          into altre from jsonb_array_elements(accessori) x;
        altre := altre + (select coalesce(sum(coalesce((x->>'prezzo_totale_vendita')::numeric,
          (x->>'prezzo_unitario_vendita')::numeric*coalesce((x->>'quantita')::numeric,1), 0)),0) from jsonb_array_elements(servizi) x);
        aliquota := case when bs + altre <= 0 then 22
          else round((0.10*(least(bs,altre)+altre) + 0.22*greatest(0,bs-altre)) / (bs+altre) * 100, 2) end;
      end;
    end if;
    netto := round(lordo/(1+aliquota/100),2);
    -- Serramenti e accessori sono gli articoli da ordinare; il costo d'acquisto lo mette l'ordine al fornitore.
    for r in select value from jsonb_array_elements(serramenti) loop
      quantita := coalesce((r->>'quantita')::numeric,1);
      if quantita<=0 then esclusi:=esclusi+1; continue; end if;
      misure := case when (r->>'larghezza_mm') is not null and (r->>'altezza_mm') is not null
        then (r->>'larghezza_mm')||'×'||(r->>'altezza_mm')||' mm' end;
      nome := coalesce(nullif(r->>'tipologia_label',''),nullif(r->>'tipologia',''),'Serramento');
      chiave_gruppo := concat_ws('|','ser',nome,r->>'materiale',r->>'serie',r->>'colore_interno',r->>'colore_esterno');
      if not gruppi_misura ? chiave_gruppo then gruppi_misura := gruppi_misura || jsonb_build_object(chiave_gruppo, gen_random_uuid()); end if;
      prezzo := coalesce((r->>'prezzo_unitario')::numeric, (r->>'prezzo_totale')::numeric/quantita, 0);
      materiali:=materiali||jsonb_build_array(jsonb_build_object(
        'name',left(nome,120),
        'misure_testo',misure,
        'gruppo_id',gruppi_misura->>chiave_gruppo,
        'riferimento',nullif(btrim(r->>'ambiente'),''),
        'misure_preventivo',case when (r->>'larghezza_mm') is not null or (r->>'altezza_mm') is not null
          then jsonb_strip_nulls(jsonb_build_object('larghezza',(r->>'larghezza_mm')::numeric,'altezza',(r->>'altezza_mm')::numeric)) end,
        'measure_status','da_rilevare',
        'description',nullif(concat_ws(' · ',nullif(r->>'ambiente',''),nullif(r->>'materiale',''),nullif(r->>'serie',''),
          nullif(r->>'vetro',''),nullif(r->>'apertura',''),
          nullif(concat_ws('/',nullif(r->>'colore_interno',''),nullif(r->>'colore_esterno','')),''),
          nullif(r->>'note','')),''),
        'quantity',quantita::integer,'unit_price',round(prezzo,2),
        'status','da_ordinare','position',jsonb_array_length(materiali),'vat_rate',aliquota,
        'categoria','serramento','family_id',(select f.id from public.article_families f where f.id=nullif(r->>'family_id','')::uuid),
        'axis_selections',case when jsonb_typeof(r->'valori_assi')='object' and r->'valori_assi'<>'{}'::jsonb then r->'valori_assi' end));
    end loop;
    for r in select value from jsonb_array_elements(accessori) loop
      quantita := coalesce((r->>'quantita')::numeric,1);
      if quantita<=0 then esclusi:=esclusi+1; continue; end if;
      misure := case when (r->>'larghezza_mm') is not null and (r->>'altezza_mm') is not null
        then (r->>'larghezza_mm')||'×'||(r->>'altezza_mm')||' mm' end;
      prezzo := coalesce((r->>'prezzo_unitario')::numeric, (r->>'prezzo_totale')::numeric/quantita, 0);
      chiave_gruppo := concat_ws('|','acc',r->>'tipo',r->>'descrizione');
      if misure is not null and not gruppi_misura ? chiave_gruppo then gruppi_misura := gruppi_misura || jsonb_build_object(chiave_gruppo, gen_random_uuid()); end if;
      materiali:=materiali||jsonb_build_array(jsonb_build_object(
        'name',left(coalesce(nullif(r->>'descrizione',''),nullif(r->>'tipo',''),'Accessorio'),120),
        'misure_testo',misure,
        'gruppo_id',case when misure is not null then gruppi_misura->>chiave_gruppo end,
        'misure_preventivo',case when misure is not null
          then jsonb_build_object('larghezza',(r->>'larghezza_mm')::numeric,'altezza',(r->>'altezza_mm')::numeric) end,
        'measure_status',case when misure is not null then 'da_rilevare' end,
        'description',nullif(concat_ws(' · ',nullif(r->>'tipo',''),nullif(r->>'note','')),''),
        'quantity',quantita::integer,'unit_price',round(prezzo,2),
        'status','da_ordinare','position',jsonb_array_length(materiali),'vat_rate',aliquota,
        'categoria','accessorio','family_id',(select f.id from public.article_families f where f.id=nullif(r->>'family_id','')::uuid),
        'axis_selections',case when jsonb_typeof(r->'valori_assi')='object' and r->'valori_assi'<>'{}'::jsonb then r->'valori_assi' end));
    end loop;
    -- I servizi (posa, smontaggio, smaltimento…) sono le lavorazioni, col loro costo previsto.
    venduto_esatto := coalesce((q->>'sconto_percentuale')::numeric,0)=0 and coalesce((q->>'sconto_importo')::numeric,0)=0
      and coalesce((q->>'prezzo_manuale')::numeric,0)=0;
    for r in select value from jsonb_array_elements(servizi) loop
      quantita := coalesce((r->>'quantita')::numeric,1);
      if quantita<=0 then esclusi:=esclusi+1; continue; end if;
      fasi:=fasi||jsonb_build_array(jsonb_build_object('name',coalesce(nullif(r->>'descrizione',''),'Servizio'),
        'notes',concat_ws(E'\n',nullif(r->>'note',''),quantita||' '||coalesce(r->>'unita','')),
        'importo_venduto',case when venduto_esatto then round((r->>'prezzo_totale_vendita')::numeric,2) end,
        'voci',jsonb_build_array(jsonb_build_object(
          'descrizione',coalesce(nullif(r->>'descrizione',''),'Servizio'),
          'unita',nullif(r->>'unita',''),
          'quantita',quantita,
          'costo_manodopera',greatest(coalesce((r->>'prezzo_unitario_costo')::numeric,0),0),
          'costo_materiali',0,
          'importo',(r->>'prezzo_totale_vendita')::numeric,
          'tariffa_id',r->>'tariffa_id',
          'origine_id',r->>'id'))));
    end loop;
    descrizione := 'Serramenti '||coalesce(q->>'code','')
      || coalesce(' · '||nullif(trim(concat_ws(' ',q->>'cliente_nome',q->>'cliente_cognome')),''),'')
      || coalesce(' ('||nullif(q->>'cantiere_citta','')||')','');
    codice := q->>'code';
    indirizzo:=concat_ws(', ',nullif(q->>'cantiere_indirizzo',''),nullif(trim(concat_ws(' ',q->>'cantiere_cap',q->>'cantiere_citta')),''),nullif(q->>'cantiere_provincia',''));
    rate := public.rate_da_piano_preventivo(q->'pagamento_milestones', lordo);

  else
    -- Ristrutturazione e gli altri edili: lo stesso computo (<prefisso>_computo_voci).
    aliquota := coalesce((q->>'iva_pct')::numeric, 22);
    if aliquota < 0 then aliquota := 22; end if;
    if aliquota > 0 and aliquota <= 1 then aliquota := round(aliquota*100,2); end if;
    netto:=case when coalesce((q->>'totale_imponibile')::numeric,0)>0 then round((q->>'totale_imponibile')::numeric,2)
      else round(coalesce((q->>'totale')::numeric,0)/(1+aliquota/100),2) end;
    execute format('select coalesce(jsonb_agg(to_jsonb(v) order by v.ordine, v.id), ''[]'')
                      from (select * from public.%I where progetto_id = $1 for share) v', prefisso || '_computo_voci')
      into voci using p_progetto_id;
    execute format('select coalesce(jsonb_object_agg(l.id, l.tariffa_id), ''{}'') from public.%I l
                     where l.company_id = $1 and l.tariffa_id is not null
                       and l.id in (select nullif(x->>''listino_voce_id'', '''')::uuid from jsonb_array_elements($2) x)',
                   prefisso || '_listino_voci')
      into listino using azienda, voci;
    origine := case when chiave = 'rst' then 'computo_rst' else 'computo_modulo' end;
    for r in select value from jsonb_array_elements(voci) loop
      quantita:=coalesce((r->>'quantita')::numeric,0);
      -- Le opzionali si propongono al cliente ma stanno fuori dal totale: fuori anche dalla commessa.
      if quantita<=0 or coalesce((r->>'opzionale')::boolean,false) then esclusi:=esclusi+1; continue; end if;
      somma_voci:=somma_voci+coalesce((r->>'importo')::numeric,0);
      -- Il costo materiali di un computo è una stima della lavorazione:
      -- non identifica un articolo reale da ordinare né un costo consuntivo.
      -- Resta, con quantità e tariffa, nella voce prevista della fase.
      fasi:=fasi||jsonb_build_array(jsonb_build_object('name',coalesce(nullif(r->>'descrizione',''),'Lavorazione'),
        'capitolo',coalesce(nullif(trim(r->>'capitolo_nome'),''),'Generale'),
        'notes',concat_ws(E'\n',nullif(r->>'capitolo_nome',''),quantita||' '||coalesce(r->>'unita_misura','')),
        'voci',jsonb_build_array(jsonb_build_object(
          'descrizione',coalesce(nullif(r->>'descrizione',''),'Lavorazione'),
          'unita',nullif(r->>'unita_misura',''),
          'quantita',quantita,
          'costo_manodopera',greatest(coalesce((r->>'costo_manodopera')::numeric,0),0),
          'costo_materiali',greatest(coalesce((r->>'costo_materiali')::numeric,0),0),
          'importo',(r->>'importo')::numeric,
          'tariffa_id',listino->>(r->>'listino_voce_id'),
          'origine_id',r->>'id'))));
    end loop;
    if p_raggruppa_capitoli then
      select coalesce(jsonb_agg(jsonb_build_object('name',capitolo,'notes',dettaglio,'voci',voci_capitolo) order by prima),'[]') into fasi
      from (select value->>'capitolo' capitolo,min(n) prima,
        string_agg((value->>'name')||E'\n'||(value->>'notes'),E'\n\n' order by n) dettaglio,
        jsonb_agg(value->'voci'->0 order by n) voci_capitolo
        from jsonb_array_elements(fasi) with ordinality a(value,n) group by value->>'capitolo') gruppi;
    end if;
    if jsonb_typeof(q->'fasi_previste')='array' and jsonb_array_length(q->'fasi_previste')>0 then
      fasi:=q->'fasi_previste';
    elsif abs(somma_voci-netto)<0.01 then
      -- Le voci fanno l'imponibile: il venduto di ogni lavorazione è la somma delle sue voci.
      select coalesce(jsonb_agg(f || jsonb_build_object('importo_venduto',
          (select round(sum(coalesce((v->>'importo')::numeric,0)),2) from jsonb_array_elements(f->'voci') v)) order by n),'[]')
        into fasi from jsonb_array_elements(fasi) with ordinality x(f,n);
    end if;
    descrizione:=coalesce(nullif(left(split_part(trim(q->>'note'),E'\n',1),120),''),
      case chiave when 'rst' then 'Ristrutturazione' when 'bagni' then 'Bagno' when 'tetti' then 'Tetto'
        when 'clm' then 'Climatizzazione' when 'ele' then 'Impianto elettrico' when 'idr' then 'Impianto termoidraulico'
        when 'pav' then 'Pavimenti' when 'pis' then 'Piscina' end ||' '||coalesce(q->>'code',''));
    codice:=q->>'code';
    indirizzo:=concat_ws(', ',nullif(q->>'cantiere_indirizzo',''),nullif(trim(concat_ws(' ',q->>'cantiere_cap',q->>'cantiere_citta')),''),nullif(q->>'cantiere_provincia',''));
    lordo := round(netto*(1+aliquota/100),2);
    rate := public.rate_da_piano_preventivo(q->'piano_pagamento', lordo);
  end if;

  if netto<=0 then raise exception 'Il preventivo non ha un prezzo di vendita: completalo prima di creare la commessa.'; end if;
  impronta:=md5(jsonb_build_array(q,componenti,servizi,ore,voci,serramenti,accessori,p_raggruppa_capitoli,contratto)::text);
  esito:=jsonb_build_object('materiali',materiali,'fasi',fasi,'rate',rate,'imponibile',netto,'aliquota',aliquota,
    'totale',round(netto*(1+aliquota/100),2),'impronta',impronta,'esclusi',esclusi,'descrizione',descrizione,
    'contratto',contratto);
  if p_anteprima then return esito; end if;
  if p_impronta is distinct from impronta then
    raise exception 'Il preventivo è cambiato: rivedi il riepilogo prima di creare la commessa.' using errcode='PT409';
  end if;
  select id into stato from public.order_statuses where company_id=azienda
    order by is_default desc nulls last,position asc nulls last,created_at asc limit 1;
  if stato is null then raise exception 'Imposta almeno uno stato commessa per questa azienda.'; end if;
  select customer_profile_id into profilo from public.marketing_contacts
    where id=(q->>'cliente_id')::uuid and company_id=azienda;
  select o.id into opportunita from public.marketing_opportunities o
    where o.id = nullif(coalesce(q->>'opportunita_id', q->>'opportunita_crm_id'), '')::uuid and o.company_id = azienda;
  -- Le rate del piano entrano con la commessa: commessa_avvia (dal client) non le sovrascrive.
  esito:=esito||public.create_order_atomic(jsonb_build_object('company_id',azienda,'customer_id',profilo,
    'order_code',public.prossimo_numero_commessa(azienda),'description',descrizione,'total_amount',netto,
    'deposit_amount',0,'balance_amount',netto,'payment_type','standard','current_status_id',stato,
    'assigned_to',case when public.solo_assegnati_attivo() then auth.uid() else null end,
    'vat_rate',aliquota,'internal_notes',concat('Da preventivo ',chiave,' ',codice)),materiali,null,auth.uid(),rate);
  ordine:=(esito->>'id')::uuid;
  -- create_order_atomic non conosce gruppo e riferimento: si scrivono per posizione.
  update public.order_items oi
     set gruppo_id = nullif(m.value->>'gruppo_id','')::uuid, riferimento = nullif(m.value->>'riferimento','')
    from jsonb_array_elements(materiali) m
   where oi.order_id = ordine and oi.position = (m.value->>'position')::integer
     and (m.value ? 'gruppo_id' or m.value ? 'riferimento');
  update public.orders set created_by=auth.uid(),
    client_name=nullif(trim(concat_ws(' ',q->>'cliente_nome',q->>'cliente_cognome')),''),
    client_email=nullif(q->>'cliente_email',''),client_phone=nullif(q->>'cliente_telefono',''),
    indirizzo_lavori=nullif(indirizzo,''),work_address=nullif(indirizzo,''),
    opportunity_id=opportunita,
    -- La commessa punta al suo contratto: la riga ombra firmata, quando c'è.
    quote_id=nullif(contratto->>'quote_id','')::uuid,
    quote_number=nullif(contratto->>'quote_number',''),
    fv_progetto_id=case when chiave='fv' then p_progetto_id else null end,
    rst_progetto_id=case when chiave='rst' then p_progetto_id else null end
    where id=ordine and company_id=azienda;
  for r in select value from jsonb_array_elements(fasi) loop
    insert into public.order_work_phases(company_id,order_id,name,position,notes,importo_venduto)
      values(azienda,ordine,r->>'name',posizione,concat_ws(E'\n',r->>'notes','Dal preventivo '||coalesce(codice,'')),(r->>'importo_venduto')::numeric) returning id into fase_id;
    sotto_pos:=0;
    for sotto in select value from jsonb_array_elements(coalesce(r->'sottofasi','[]')) loop
      insert into public.order_work_subphases(phase_id,name,position,peso,fatta)
        values(fase_id,sotto->>'name',sotto_pos,coalesce((sotto->>'peso')::integer,1),false);
      sotto_pos:=sotto_pos+1;
    end loop;
    voce_pos:=0;
    for voce in select value from jsonb_array_elements(case when jsonb_typeof(r->'voci')='array' then r->'voci' else '[]' end) loop
      insert into public.order_work_phase_voci(company_id,order_id,phase_id,position,descrizione,unita,quantita,
        costo_manodopera,costo_materiali,importo,tariffa_id,origine,origine_id,origine_codice)
      values(azienda,ordine,fase_id,voce_pos,voce->>'descrizione',voce->>'unita',(voce->>'quantita')::numeric,
        (voce->>'costo_manodopera')::numeric,(voce->>'costo_materiali')::numeric,(voce->>'importo')::numeric,
        nullif(voce->>'tariffa_id','')::uuid,
        case when chiave='sr' then 'preventivo' else coalesce(origine,'computo_rst') end,
        (voce->>'origine_id')::uuid,codice)
      on conflict do nothing;
      voce_pos:=voce_pos+1;
    end loop;
    posizione:=posizione+1;
  end loop;
  execute format('update public.%I set ordine_id = $1 where id = $2', tabella) using ordine, p_progetto_id;
  if nullif(contratto->>'quote_id','') is not null then
    update public.quotes set status='convertita', updated_at=now() where id=(contratto->>'quote_id')::uuid;
  end if;
  if chiave = 'sr' then
    insert into public.sr_progetti_audit (progetto_id, company_id, user_id, event_type, event_data)
    values (p_progetto_id, azienda, auth.uid(), 'converted_to_ordine',
      jsonb_build_object('ordine_id', ordine, 'importo_eur', netto, 'importo_iva_inclusa_eur', lordo,
        'aliquota_iva', aliquota, 'articoli', jsonb_array_length(materiali), 'lavorazioni', jsonb_array_length(fasi),
        'rate', jsonb_array_length(rate)));
  end if;
  return esito;
end;
$function$;

-- ── 3. Serramenti: la vecchia porta passa dal motore unico ────────────────────────────────────
-- Importo e anticipo a mano non contano più: l'importo è quello del contratto, le rate quelle del piano.
create or replace function public.sr_converti_in_ordine(p_progetto_id uuid, p_importo_eur numeric default null, p_anticipo_eur numeric default null)
returns uuid language plpgsql security definer set search_path to 'public', 'auth' as $$
declare
  riepilogo jsonb;
begin
  riepilogo := public.converti_modulo_commessa_atomic('sr', p_progetto_id, false, true, null);
  return (public.converti_modulo_commessa_atomic('sr', p_progetto_id, false, false, riepilogo->>'impronta')->>'id')::uuid;
end $$;

-- ── Permessi ──────────────────────────────────────────────────────────────────────────────────
revoke all on function public.modulo_chiave(text) from public, anon;
revoke all on function public.modulo_tabella(text) from public, anon;
revoke all on function public.modulo_contratto_di(text, jsonb) from public, anon, authenticated;
revoke all on function public.modulo_famiglia_in_commessa(text, jsonb) from public, anon, authenticated;
revoke all on function public.rate_da_piano_preventivo(jsonb, numeric) from public, anon;
revoke all on function public.modulo_progetto_accessibile(text, uuid, text, boolean) from public, anon, authenticated;
revoke all on function public.modulo_contratto(text, uuid) from public, anon;
revoke all on function public.modulo_firmato_su_carta(text, uuid, text, text, text, date, text, boolean) from public, anon;
revoke all on function public.converti_modulo_commessa_atomic(text, uuid, boolean, boolean, text) from public, anon;
revoke all on function public.sr_converti_in_ordine(uuid, numeric, numeric) from public, anon;
grant execute on function public.modulo_chiave(text) to authenticated, service_role;
grant execute on function public.modulo_tabella(text) to authenticated, service_role;
grant execute on function public.rate_da_piano_preventivo(jsonb, numeric) to authenticated, service_role;
grant execute on function public.modulo_contratto_di(text, jsonb) to service_role;
grant execute on function public.modulo_famiglia_in_commessa(text, jsonb) to service_role;
grant execute on function public.modulo_progetto_accessibile(text, uuid, text, boolean) to service_role;
grant execute on function public.modulo_contratto(text, uuid) to authenticated, service_role;
grant execute on function public.modulo_firmato_su_carta(text, uuid, text, text, text, date, text, boolean) to authenticated, service_role;
grant execute on function public.converti_modulo_commessa_atomic(text, uuid, boolean, boolean, text) to authenticated, service_role;
grant execute on function public.sr_converti_in_ordine(uuid, numeric, numeric) to authenticated, service_role;
