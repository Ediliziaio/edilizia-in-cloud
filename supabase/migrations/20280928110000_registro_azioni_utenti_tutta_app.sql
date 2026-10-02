-- Registro delle azioni degli utenti su tutta l'applicazione.
--
-- Il Log Attività di un utente mostrava il CRM (note, fasi, contatti) e gli
-- eventi di sicurezza, ma non il resto: commesse, calendario, magazzino,
-- acquisti, fatture, personale. Ogni modulo scriveva (o no) per conto suo.
--
-- Un solo trigger generico, agganciato alle tabelle di lavoro, registra CHI ha
-- creato, modificato o eliminato COSA e QUANDO, con i nomi dei campi cambiati
-- (non i valori: niente dati personali o importi duplicati nel registro).
--   · scrive solo quando c'è un utente collegato (auth.uid()): i flussi
--     automatici, le funzioni di sistema e le importazioni con chiave di servizio
--     restano fuori, sono già nei loro registri;
--   · non blocca mai l'operazione: un errore del registro viene ignorato;
--   · gli UPDATE che toccano solo colonne tecniche (updated_at…) non scrivono.
-- Le tabelle del CRM (contatti, opportunità, note) hanno già il registro
-- attività con autore e non sono agganciate qui.

set local lock_timeout = '3s';
set local statement_timeout = '60s';

create table if not exists public.user_action_log (
  id bigint generated always as identity primary key,
  company_id uuid not null,
  user_id uuid not null,
  azione text not null check (azione in ('insert', 'update', 'delete')),
  tabella text not null,
  record_id text,
  etichetta text,
  campi_modificati text[],
  created_at timestamptz not null default now()
);

comment on table public.user_action_log is
  'Chi ha creato/modificato/eliminato cosa nelle tabelle di lavoro (commesse, calendario, magazzino, fatture, personale…). Scritta dal trigger registra_azione_utente.';

create index if not exists user_action_log_utente_idx
  on public.user_action_log (company_id, user_id, created_at desc);

alter table public.user_action_log enable row level security;

-- Lettura: amministratori dell'azienda e chi ha il permesso impostazioni, come company_activity_log.
drop policy if exists user_action_log_lettura on public.user_action_log;
create policy user_action_log_lettura
  on public.user_action_log for select to authenticated
  using (
    (select public.has_role(auth.uid(), 'super_admin'::public.app_role))
    or public.e_amministratore_di(company_id)
    or (
      company_id = (select public.get_user_company_id(auth.uid()))
      and (select public.has_permission(auth.uid(), 'can_view_settings'))
    )
  );
-- Nessuna policy di scrittura: scrive solo il trigger (security definer).

create or replace function public.registra_azione_utente()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_utente uuid := auth.uid();
  v_riga jsonb;
  v_prima jsonb;
  v_company uuid;
  v_cambi text[];
  v_etichetta text;
  v_chiave text;
begin
  if v_utente is null then
    return coalesce(new, old);
  end if;

  begin
    v_riga := case when tg_op = 'DELETE' then to_jsonb(old) else to_jsonb(new) end;
    v_company := nullif(v_riga ->> 'company_id', '')::uuid;
    if v_company is null then
      return coalesce(new, old);
    end if;

    if tg_op = 'UPDATE' then
      v_prima := to_jsonb(old);
      select array_agg(k order by k) into v_cambi
        from jsonb_object_keys(v_riga) k
       where v_riga -> k is distinct from v_prima -> k
         and k not in ('updated_at', 'updated_by', 'last_activity_at', 'modified_at', 'search_vector', 'fts');
      if v_cambi is null then
        return new;
      end if;
    end if;

    foreach v_chiave in array array['name', 'title', 'titolo', 'number', 'numero', 'code', 'codice', 'reference', 'subject', 'nome', 'ragione_sociale', 'description', 'descrizione', 'client_name'] loop
      v_etichetta := nullif(btrim(coalesce(v_riga ->> v_chiave, '')), '');
      exit when v_etichetta is not null;
    end loop;

    insert into public.user_action_log (company_id, user_id, azione, tabella, record_id, etichetta, campi_modificati)
    values (v_company, v_utente, lower(tg_op), tg_table_name, v_riga ->> 'id', left(v_etichetta, 200), v_cambi);
  exception when others then
    -- Il registro non deve mai far fallire il lavoro dell'utente.
    raise log 'registra_azione_utente: % non registrato su %: %', tg_op, tg_table_name, sqlerrm;
  end;

  return coalesce(new, old);
end;
$$;

revoke all on function public.registra_azione_utente() from public, anon, authenticated;

-- Aggancio alle tabelle di lavoro (solo quelle che esistono, con id e company_id).
do $agg$
declare
  t text;
begin
  foreach t in array array['orders', 'order_work_phases', 'order_campo_assignments', 'order_phase_assignments', 'order_document_folders', 'order_variable_compensations', 'giornale_lavori', 'campo_rapportini', 'campo_timbrature', 'note_cantiere', 'foto_cantiere', 'squadre_commesse', 'squadre_componenti', 'ordini_variazione', 'sal_records', 'order_bonus_lines', 'prelievi_campo', 'site_deliveries', 'shipments_to_site', 'appointments', 'marketing_calendars', 'marketing_calendar_availability', 'user_availability', 'warehouses', 'warehouse_sections', 'warehouse_stock', 'warehouse_movements', 'warehouse_transfers', 'warehouse_uscite', 'warehouse_lotti', 'stock_lotti', 'stock_units', 'goods_receipts', 'ddt_ricezione', 'scorte_furgone', 'purchase_orders', 'purchase_order_items', 'suppliers', 'subappaltatori', 'articoli_native', 'anagrafiche_native', 'listini_fornitore', 'listino_prezzi', 'contratti_subappalto', 'quotes', 'quote_items', 'quote_versions', 'signature_requests', 'sr_progetti', 'fv_progetti', 'rst_progetti', 'bgn_progetti', 'clm_progetti', 'ele_progetti', 'idr_progetti', 'pav_progetti', 'pis_progetti', 'tet_progetti', 'invoices', 'invoice_payments', 'documenti_fiscali', 'fatture_ricevute', 'prima_nota_entries', 'scadenze', 'company_costs', 'expense_reports', 'cespiti', 'employees', 'hr_richieste', 'hr_assenze', 'hr_candidati', 'hr_cedolini', 'hr_documenti', 'leave_requests', 'mezzi', 'mezzi_assegnazioni', 'mezzi_manutenzioni', 'marketing_pipelines', 'marketing_pipeline_stages', 'marketing_tags', 'marketing_documents', 'tasks', 'tickets', 'customer_documents', 'contratti_manutenzione', 'social_posts', 'email_templates', 'automation_flows', 'lead_forms'] loop
    if exists (
      select 1 from information_schema.columns
       where table_schema = 'public' and table_name = t and column_name = 'company_id'
    ) and exists (
      select 1 from information_schema.columns
       where table_schema = 'public' and table_name = t and column_name = 'id'
    ) then
      execute format('drop trigger if exists trg_registra_azione_utente on public.%I', t);
      execute format(
        'create trigger trg_registra_azione_utente after insert or update or delete on public.%I for each row execute function public.registra_azione_utente()',
        t
      );
    end if;
  end loop;
end
$agg$;
