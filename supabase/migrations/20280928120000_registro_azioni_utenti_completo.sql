-- Registro azioni utenti, completamento: storico, doppioni, CRM, pulizia.
--
-- Segue 20280928110000. Chiude i limiti di quel registro:
--   1. storico: le tabelle che già sapevano chi le ha create (created_by) ne
--      riempiono il registro per gli ultimi 90 giorni;
--   2. salvataggi ripetuti: lo stesso utente che modifica lo stesso record entro
--      due minuti aggiorna la riga invece di scriverne una per ogni salvataggio;
--   3. CRM: contatti e opportunità entrano nel registro (le modifiche dei
--      campi, che il registro attività non diceva);
--   4. pulizia: le righe oltre 24 mesi si cancellano a lotti, una volta a settimana.

set local lock_timeout = '3s';
set local statement_timeout = '60s';

alter table public.user_action_log add column if not exists volte integer not null default 1;

create index if not exists user_action_log_recente_idx
  on public.user_action_log (company_id, user_id, tabella, record_id, created_at desc)
  where azione = 'update';

create index if not exists user_action_log_data_idx
  on public.user_action_log (created_at);

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
  v_id text;
  v_recente bigint;
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
    v_id := v_riga ->> 'id';

    if tg_op = 'UPDATE' then
      v_prima := to_jsonb(old);
      select array_agg(k order by k) into v_cambi
        from jsonb_object_keys(v_riga) k
       where v_riga -> k is distinct from v_prima -> k
         and k not in ('updated_at', 'updated_by', 'last_activity_at', 'modified_at', 'search_vector', 'fts');
      if v_cambi is null then
        return new;
      end if;

      -- Salvataggi ripetuti sullo stesso record: una riga sola.
      select id into v_recente
        from public.user_action_log
       where company_id = v_company and user_id = v_utente
         and tabella = tg_table_name and record_id = v_id
         and azione = 'update' and created_at > now() - interval '2 minutes'
       order by created_at desc
       limit 1;
      if v_recente is not null then
        update public.user_action_log l
           set created_at = now(),
               volte = l.volte + 1,
               campi_modificati = (
                 select array_agg(distinct c order by c)
                   from unnest(coalesce(l.campi_modificati, '{}') || v_cambi) c
               )
         where l.id = v_recente;
        return new;
      end if;
    end if;

    foreach v_chiave in array array['name', 'title', 'titolo', 'number', 'numero', 'code', 'codice', 'reference', 'subject', 'nome', 'ragione_sociale', 'description', 'descrizione', 'client_name', 'first_name', 'email'] loop
      v_etichetta := nullif(btrim(coalesce(v_riga ->> v_chiave, '')), '');
      exit when v_etichetta is not null;
    end loop;
    -- Contatti: nome e cognome insieme.
    if tg_table_name = 'marketing_contacts' then
      v_etichetta := nullif(btrim(coalesce(v_riga ->> 'first_name', '') || ' ' || coalesce(v_riga ->> 'last_name', '')), '');
    end if;

    insert into public.user_action_log (company_id, user_id, azione, tabella, record_id, etichetta, campi_modificati)
    values (v_company, v_utente, lower(tg_op), tg_table_name, v_id, left(v_etichetta, 200), v_cambi);
  exception when others then
    raise log 'registra_azione_utente: % non registrato su %: %', tg_op, tg_table_name, sqlerrm;
  end;

  return coalesce(new, old);
end;
$$;

revoke all on function public.registra_azione_utente() from public, anon, authenticated;

-- CRM: contatti e opportunità.
do $crm$
declare
  t text;
begin
  foreach t in array array['marketing_contacts', 'marketing_opportunities'] loop
    if to_regclass('public.' || t) is not null then
      execute format('drop trigger if exists trg_registra_azione_utente on public.%I', t);
      execute format(
        'create trigger trg_registra_azione_utente after insert or update or delete on public.%I for each row execute function public.registra_azione_utente()',
        t
      );
    end if;
  end loop;
end
$crm$;

-- Storico: creazioni degli ultimi 90 giorni dalle tabelle che hanno created_by.
-- Una tabella alla volta, solo se non già presenti nel registro.
do $storico$
declare
  t text;
begin
  foreach t in array array['orders', 'giornale_lavori', 'note_cantiere', 'sal_records', 'squadre_commesse', 'appointments', 'marketing_calendars', 'stock_lotti', 'warehouse_transfers', 'warehouse_uscite', 'ddt_ricezione', 'purchase_orders', 'quotes', 'signature_requests', 'invoices', 'invoice_payments', 'prima_nota_entries', 'scadenze', 'cespiti', 'mezzi', 'mezzi_manutenzioni', 'tasks', 'tickets', 'social_posts', 'email_templates', 'automation_flows', 'lead_forms'] loop
    if exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = t and column_name = 'created_by')
       and exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = t and column_name = 'created_at')
       and exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = t and column_name = 'company_id')
    then
      begin
        execute format($q$
          insert into public.user_action_log (company_id, user_id, azione, tabella, record_id, etichetta, created_at)
          select x.company_id, x.created_by, 'insert', %L, x.id::text,
                 left(coalesce(
                   nullif(btrim(j ->> 'name'), ''), nullif(btrim(j ->> 'title'), ''), nullif(btrim(j ->> 'titolo'), ''),
                   nullif(btrim(j ->> 'number'), ''), nullif(btrim(j ->> 'numero'), ''), nullif(btrim(j ->> 'code'), ''),
                   nullif(btrim(j ->> 'subject'), ''), nullif(btrim(j ->> 'description'), ''), nullif(btrim(j ->> 'client_name'), '')
                 ), 200),
                 x.created_at
            from public.%I x, lateral (select to_jsonb(x) as j) s
           where x.created_by is not null and x.company_id is not null
             and x.created_at > now() - interval '90 days'
             and not exists (
               select 1 from public.user_action_log l
                where l.tabella = %L and l.record_id = x.id::text and l.azione = 'insert')
        $q$, t, t, t);
      exception when others then
        raise notice 'storico azioni: % saltata (%)', t, sqlerrm;
      end;
    end if;
  end loop;
end
$storico$;

-- Pulizia: oltre 24 mesi, a lotti.
create or replace function public.pulisci_user_action_log(p_mesi integer default 24, p_lotto integer default 5000)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tot integer := 0;
  v_n integer;
begin
  loop
    delete from public.user_action_log
     where id in (
       select id from public.user_action_log
        where created_at < now() - make_interval(months => p_mesi)
        limit p_lotto);
    get diagnostics v_n = row_count;
    v_tot := v_tot + v_n;
    exit when v_n < p_lotto or v_tot >= 100000;
  end loop;
  return v_tot;
end;
$$;

revoke all on function public.pulisci_user_action_log(integer, integer) from public, anon, authenticated;

do $cron$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.unschedule('pulisci-user-action-log')
      where exists (select 1 from cron.job where jobname = 'pulisci-user-action-log');
    perform cron.schedule('pulisci-user-action-log', '30 3 * * 0', $c$select public.pulisci_user_action_log(24)$c$);
  end if;
end
$cron$;
