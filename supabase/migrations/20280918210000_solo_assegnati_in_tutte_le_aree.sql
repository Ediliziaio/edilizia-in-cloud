-- «Solo i propri»: chi crea qualcosa continua a vederlo, in ogni area.
--
-- Il 18/09/2026 appuntamenti e attività hanno avuto il rimedio
-- (20280918200000): chi vede solo i propri e non indica nessuno diventa
-- l'assegnatario, altrimenti l'app salva la riga e poi la RLS non gliela fa
-- rileggere — 42501, che a schermo diventa «Non hai i permessi per questa
-- operazione». Le stesse policy filtrano per assegnatario anche altrove:
-- preventivi, ticket, reclami, chiamate, messaggi, interazioni, schede
-- progetto e calendari. Là il difetto c'è ma non ha ancora fatto danni
-- (nessuna riga orfana: controllato oggi); lo si chiude prima.
--
-- Una sola funzione, con il nome della colonna come argomento del trigger: le
-- aree usano nomi diversi per dire «di chi è» (assigned_to, user_id, sent_by,
-- sender_id, staff_user_id, owner_id, created_by).
--
-- Vale SOLO per chi ha «Solo i propri»: per tutti gli altri niente cambia, e
-- le righe che arrivano dai canali automatici (webhook, cron, import via
-- service role) non hanno un utente e restano come sono.

set local lock_timeout = '3s';

create or replace function public.assegna_colonna_a_chi_crea()
returns trigger
language plpgsql
set search_path to 'public'
as $$
declare
  v_uid uuid := auth.uid();
  v_colonna text := tg_argv[0];
begin
  if v_uid is null or not public.solo_assegnati_attivo() then
    return new;
  end if;
  if (to_jsonb(new) ->> v_colonna) is null then
    new := jsonb_populate_record(new, jsonb_build_object(v_colonna, v_uid));
  end if;
  return new;
end;
$$;

-- Appuntamenti e attività passano alla funzione unica (stesso effetto).
drop trigger if exists trg_assegna_appuntamento_a_chi_crea on public.appointments;
create trigger trg_assegna_appuntamento_a_chi_crea
  before insert on public.appointments
  for each row execute function public.assegna_colonna_a_chi_crea('assigned_to');

drop trigger if exists trg_assegna_attivita_a_chi_crea on public.tasks;
create trigger trg_assegna_attivita_a_chi_crea
  before insert on public.tasks
  for each row execute function public.assegna_colonna_a_chi_crea('assigned_to');

drop function if exists public.assegna_a_chi_crea_solo_assegnatario();

do $$
declare
  r record;
begin
  for r in
    select * from (values
      ('quotes', 'assigned_to'),                -- preventivi
      ('tickets', 'assigned_to'),               -- interventi
      ('support_tickets', 'assigned_to'),       -- assistenza
      ('customer_complaints', 'assigned_to'),   -- reclami
      ('call_logs', 'user_id'),                 -- chiamate
      ('contact_messages', 'sent_by'),
      ('customer_messages', 'sender_id'),
      ('customer_interactions', 'staff_user_id'),
      ('marketing_calendars', 'owner_id'),
      ('bgn_progetti', 'created_by'),
      ('clm_progetti', 'created_by'),
      ('ele_progetti', 'created_by'),
      ('fv_progetti', 'created_by'),
      ('idr_progetti', 'created_by'),
      ('pav_progetti', 'created_by'),
      ('pis_progetti', 'created_by'),
      ('rst_progetti', 'created_by'),
      ('sr_progetti', 'created_by'),
      ('tet_progetti', 'created_by')
    ) as v(tabella, colonna)
  loop
    -- Salta quello che non esiste (più aziende, schemi diversi nel tempo).
    if not exists (
      select 1 from information_schema.columns
       where table_schema = 'public' and table_name = r.tabella and column_name = r.colonna
    ) then
      continue;
    end if;

    execute format('drop trigger if exists trg_assegna_a_chi_crea on public.%I', r.tabella);
    execute format(
      'create trigger trg_assegna_a_chi_crea before insert on public.%I
         for each row execute function public.assegna_colonna_a_chi_crea(%L)',
      r.tabella, r.colonna
    );
  end loop;
end $$;
