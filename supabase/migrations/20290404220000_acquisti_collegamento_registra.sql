-- Ciclo acquisti, lotto 3 (15/11/2026): una sola porta per scrivere nella traccia dei collegamenti.
-- Documento: docs/automazioni-acquisti.md §3. La usano le aree B, C (tesoreria) e D (subappalti):
-- ognuna con le sue regole, tutte con le stesse colonne, le stesse prove e la stessa storia.
--
-- acquisti_collegamento_registra(azienda, da, a, regola, esito, prove, …) → id del collegamento
--   - l'azienda la verifica il server: entrambi i documenti devono essere suoi (tabella per tipo);
--   - chi chiama deve poter collegare (acquisti_puo_collegare: service role, super admin dentro,
--     o costi/acquisti senza sola lettura);
--   - esito 'automatico' o 'manuale' → stato 'collegato'; 'proposta' → 'proposto';
--   - idempotente: stessa azienda, stessi estremi, stessa regola = stessa riga (chiave unica);
--   - un collegamento rifiutato o annullato da una persona NON si rifà da una regola; si rifà solo
--     a mano (esito 'manuale'), e la storia lo registra;
--   - l'autore è l'utente autenticato, oppure il processo (impostazione acquisti.processo).

-- Il documento è dell'azienda? Un tipo sconosciuto = no.
create or replace function public.acquisti_documento_dell_azienda(p_tipo text, p_id uuid, p_company uuid) returns boolean
language plpgsql stable security definer set search_path = public as $$
declare v_tabella text; v_ok boolean;
begin
  v_tabella := case p_tipo
    when 'fattura_ricevuta' then 'fatture_ricevute'
    when 'ddt' then 'ddt_ricezione'
    when 'riga_ddt' then 'ddt_righe'
    when 'ordine' then 'purchase_orders'
    when 'riga_ordine' then 'purchase_order_items'
    when 'commessa' then 'orders'
    when 'fase' then 'order_work_phases'
    when 'magazzino' then 'warehouses'
    when 'anagrafica' then 'suppliers'
    when 'contratto' then 'contratti_subappalto'
    when 'sal' then 'sal_subappaltatori'
    when 'rapportino' then 'campo_rapportini'
    when 'movimento_banca' then 'bank_transactions'
    when 'costo' then 'company_costs'
  end;
  if v_tabella is null or p_id is null or p_company is null then return false; end if;
  execute format('select exists (select 1 from public.%I where id = $1 and company_id = $2)', v_tabella) into v_ok using p_id, p_company;
  return coalesce(v_ok, false);
end $$;
revoke all on function public.acquisti_documento_dell_azienda(text, uuid, uuid) from public, anon, authenticated;

create or replace function public.acquisti_collegamento_registra(
  p_company uuid,
  p_da_tipo text, p_da_id uuid, p_da_riga text,
  p_a_tipo text, p_a_id uuid, p_a_riga text,
  p_regola text,
  p_esito text,
  p_prove jsonb default '[]'::jsonb,
  p_percorso jsonb default null,
  p_quantita numeric default null,
  p_unita text default null,
  p_importo numeric default null,
  p_versione_regola integer default 1,
  p_con_ai boolean default false,
  p_motivo text default null
) returns uuid
language plpgsql security definer set search_path = public as $$
declare v_chiave text; v_id uuid; v_stato text; v_nuovo text; v_utente uuid := auth.uid();
begin
  if not public.acquisti_puo_collegare(p_company) then
    raise exception 'Non hai il permesso di collegare i documenti d''acquisto.' using errcode = '42501';
  end if;
  if p_esito not in ('automatico', 'proposta', 'manuale') then
    raise exception 'Esito non valido: solo automatico, proposta o manuale si registrano (scelta, conflitto e nessuno restano all''utente).' using errcode = '22023';
  end if;
  if btrim(coalesce(p_regola, '')) = '' or length(p_regola) > 80 then
    raise exception 'Serve il nome della regola.' using errcode = '22023';
  end if;
  if p_prove is null or jsonb_typeof(p_prove) <> 'array' then
    raise exception 'Le prove vanno passate come elenco.' using errcode = '22023';
  end if;
  if p_esito = 'manuale' and v_utente is null then
    raise exception 'Un collegamento manuale lo fa una persona.' using errcode = '22023';
  end if;
  if not public.acquisti_documento_dell_azienda(p_da_tipo, p_da_id, p_company)
     or not public.acquisti_documento_dell_azienda(p_a_tipo, p_a_id, p_company) then
    raise exception 'Un documento non è di questa azienda.' using errcode = '42501';
  end if;

  v_chiave := p_company || '|' || p_da_tipo || ':' || p_da_id || coalesce('#' || nullif(p_da_riga, ''), '')
           || '|' || p_a_tipo || ':' || p_a_id || coalesce('#' || nullif(p_a_riga, ''), '') || '|' || p_regola;
  v_nuovo := case when p_esito = 'proposta' then 'proposto' else 'collegato' end;
  if p_motivo is not null then perform set_config('acquisti.motivo', p_motivo, true); end if;

  insert into public.acquisti_collegamenti (company_id, da_tipo, da_id, da_riga, a_tipo, a_id, a_riga, quantita, unita, importo,
                                            regola, versione_regola, esito, prove, percorso, stato, autore_tipo, autore_id,
                                            autore_processo, con_ai, chiave)
  values (p_company, p_da_tipo, p_da_id, nullif(p_da_riga, ''), p_a_tipo, p_a_id, nullif(p_a_riga, ''), p_quantita, p_unita, p_importo,
          p_regola, coalesce(p_versione_regola, 1), p_esito, p_prove, p_percorso, v_nuovo,
          case when v_utente is null then 'processo' else 'utente' end, v_utente,
          case when v_utente is null then coalesce(nullif(current_setting('acquisti.processo', true), ''), 'servizio') end,
          coalesce(p_con_ai, false), v_chiave)
  on conflict (company_id, chiave) do nothing
  returning id into v_id;
  if v_id is not null then return v_id; end if;

  -- Esisteva già: si aggiorna solo quando è un passo avanti ammesso.
  select id, stato into v_id, v_stato from public.acquisti_collegamenti where company_id = p_company and chiave = v_chiave for update;
  if v_stato in ('rifiutato', 'annullato') then
    if p_esito <> 'manuale' then return v_id; end if; -- una regola non contraddice una persona
    update public.acquisti_collegamenti set stato = 'proposto', updated_at = now() where id = v_id;
    v_stato := 'proposto';
  end if;
  if v_stato = 'proposto' and v_nuovo = 'collegato' then
    update public.acquisti_collegamenti
       set stato = 'collegato', esito = p_esito, prove = p_prove, percorso = coalesce(p_percorso, percorso),
           quantita = coalesce(p_quantita, quantita), unita = coalesce(p_unita, unita), importo = coalesce(p_importo, importo),
           versione_regola = coalesce(p_versione_regola, versione_regola), con_ai = con_ai or coalesce(p_con_ai, false),
           autore_tipo = case when v_utente is null then autore_tipo else 'utente' end,
           autore_id = coalesce(v_utente, autore_id), updated_at = now()
     where id = v_id;
  end if;
  return v_id;
end $$;
revoke all on function public.acquisti_collegamento_registra(uuid, text, uuid, text, text, uuid, text, text, text, jsonb, jsonb, numeric, text, numeric, integer, boolean, text) from public, anon;
grant execute on function public.acquisti_collegamento_registra(uuid, text, uuid, text, text, uuid, text, text, text, jsonb, jsonb, numeric, text, numeric, integer, boolean, text) to authenticated;
