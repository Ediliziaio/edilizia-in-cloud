-- Opportunità: «Elimina» porta sempre nel cestino.
--
-- Fino al 17/09/2026 «Elimina» cancellava per sempre le opportunità senza note,
-- documenti o appuntamenti collegati, cioè proprio i lead appena arrivati e mai
-- lavorati, senza traccia di chi l'avesse fatto: un lead BeMade del mattino è
-- sparito così, e lo si è capito solo dal registro attività del contatto. Le
-- altre diventavano «abbandonate» e uscivano dalla pipeline, senza modo di
-- sapere com'erano prima né di rimetterle.
--
-- Ora il frontend scrive solo deleted_at (dentro o fuori dal cestino) e il
-- database fa il resto, qualunque sia la strada:
--   - entrando: ricorda lo stato, mette «abandoned» (come prima: i conteggi
--     che non guardano deleted_at non la vedono aperta o vinta, e il «crea o
--     aggiorna» dei lead non la riprende) e scrive chi l'ha eliminata leggendo
--     l'utente dalla sessione;
--   - uscendo: rimette lo stato di prima. Le 3 opportunità archiviate prima di
--     oggi non lo hanno: prendono quello della loro fase, altrimenti «open».
-- Entrare o uscire dal cestino non fa partire automazioni (un ripristino di una
-- «vinta» altrimenti rimanderebbe le email di vinta) e lascia nel registro del
-- contatto una riga con chi è stato.
-- Niente svuotamento automatico: un'opportunità resta nel cestino finché
-- qualcuno non la ripristina.
--
-- In più: soft_delete_record e restore_record (migrazione 20260506200000)
-- giravano con i privilegi del proprietario, cercavano la riga solo per id,
-- senza controllo di azienda né di permessi, ed erano eseguibili da qualunque
-- utente autenticato. Nessuno le chiama (né il frontend, né le edge function,
-- né altre funzioni del database): si tolgono agli utenti.

set local lock_timeout = '3s';

alter table public.marketing_opportunities
  add column if not exists stato_prima_eliminazione text;

comment on column public.marketing_opportunities.stato_prima_eliminazione is
  'Stato che l''opportunità aveva prima di finire nel cestino: il ripristino lo rimette. NULL fuori dal cestino.';

-- Il cestino di un'azienda: poche righe, lette dalla più recente.
create index if not exists idx_mkt_opp_cestino
  on public.marketing_opportunities (company_id, deleted_at desc)
  where deleted_at is not null;

create or replace function public.opportunita_cestino_stato()
returns trigger
language plpgsql
set search_path to 'public'
as $function$
begin
  if old.deleted_at is null and new.deleted_at is not null then
    new.stato_prima_eliminazione := old.status;
    new.status := 'abandoned';
    new.deleted_by := coalesce(auth.uid(), new.deleted_by);
  elsif old.deleted_at is not null and new.deleted_at is null then
    new.status := coalesce(
      old.stato_prima_eliminazione,
      (select s.auto_status
         from public.marketing_pipeline_stages s
        where s.id = new.stage_id
          and s.auto_status in ('open', 'won', 'lost', 'abandoned')),
      'open');
    new.stato_prima_eliminazione := null;
    new.deleted_by := null;
  end if;
  return new;
end;
$function$;

revoke all on function public.opportunita_cestino_stato() from public, anon, authenticated;

-- Si attiva solo quando l'UPDATE scrive deleted_at. Lo stato che cambia qui non
-- fa scattare i trigger «UPDATE OF status» (won_at/lost_at, conversioni verso
-- Meta e Google): restano quelli di prima, e al ripristino tornano coerenti.
drop trigger if exists trg_opportunita_cestino_stato on public.marketing_opportunities;
create trigger trg_opportunita_cestino_stato
  before update of deleted_at on public.marketing_opportunities
  for each row execute function public.opportunita_cestino_stato();

-- Automazioni: fire_marketing_automation scatta su ogni UPDATE e manda
-- «opportunity_won/lost» quando lo stato diventa vinta o persa. Il ripristino
-- rimette proprio quello stato: senza questo controllo ripartirebbero le email
-- e i messaggi di vinta. La funzione è lunga e condivisa con contatti e
-- appuntamenti: si inserisce il controllo nel ramo delle opportunità invece di
-- riscriverla, e se il punto non si trova la migrazione si ferma.
do $$
declare
  v_def   text := pg_get_functiondef('public.fire_marketing_automation()'::regprocedure);
  v_nuova text;
begin
  if position('OLD.deleted_at IS DISTINCT FROM NEW.deleted_at' in v_def) > 0 then
    return;
  end if;
  v_nuova := replace(v_def, '-- Il payload si costruisce PRIMA',
'-- Entrare o uscire dal cestino non è un fatto commerciale: il ripristino
        -- rimette lo stato di prima, anche vinta o persa, e non deve far
        -- ripartire le automazioni di esito o di fase (20280918201000).
        IF OLD.deleted_at IS DISTINCT FROM NEW.deleted_at THEN
          RETURN NEW;
        END IF;

        -- Il payload si costruisce PRIMA');
  if v_nuova = v_def then
    raise exception 'fire_marketing_automation: non trovo il ramo delle opportunità dove inserire il controllo del cestino';
  end if;
  execute v_nuova;
end
$$;

-- Registro del contatto: al posto di «Stato opportunità: abandoned» una riga
-- che dice cosa è successo, con chi l'ha fatto.
create or replace function public.log_opportunity_updates()
 returns trigger
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
DECLARE
  old_stage_name text;
  new_stage_name text;
  assignee_name text;
BEGIN
  -- Stage change
  IF OLD.stage_id IS DISTINCT FROM NEW.stage_id THEN
    SELECT name INTO old_stage_name FROM public.marketing_pipeline_stages WHERE id = OLD.stage_id;
    SELECT name INTO new_stage_name FROM public.marketing_pipeline_stages WHERE id = NEW.stage_id;
    INSERT INTO public.marketing_contact_activities (contact_id, company_id, activity_type, description, metadata, created_by)
    VALUES (NEW.contact_id, NEW.company_id, 'stage_changed',
      'Fase cambiata: ' || COALESCE(old_stage_name,'?') || ' → ' || COALESCE(new_stage_name,'?'),
      jsonb_build_object('old_stage', old_stage_name, 'new_stage', new_stage_name, 'opportunity_name', NEW.name),
      COALESCE(auth.uid(), NEW.assigned_to));
  END IF;

  -- Cestino (20280918201000)
  IF OLD.deleted_at IS NULL AND NEW.deleted_at IS NOT NULL THEN
    INSERT INTO public.marketing_contact_activities (contact_id, company_id, activity_type, description, metadata, created_by)
    VALUES (NEW.contact_id, NEW.company_id, 'opportunity_deleted',
      'Opportunità spostata nel cestino',
      jsonb_build_object('opportunity_id', NEW.id, 'opportunity_name', NEW.name, 'old_status', OLD.status),
      COALESCE(auth.uid(), NEW.deleted_by, NEW.assigned_to));
  ELSIF OLD.deleted_at IS NOT NULL AND NEW.deleted_at IS NULL THEN
    INSERT INTO public.marketing_contact_activities (contact_id, company_id, activity_type, description, metadata, created_by)
    VALUES (NEW.contact_id, NEW.company_id, 'opportunity_restored',
      'Opportunità ripristinata dal cestino',
      jsonb_build_object('opportunity_id', NEW.id, 'opportunity_name', NEW.name, 'new_status', NEW.status),
      COALESCE(auth.uid(), NEW.assigned_to));
  -- Status change
  ELSIF OLD.status IS DISTINCT FROM NEW.status THEN
    INSERT INTO public.marketing_contact_activities (contact_id, company_id, activity_type, description, metadata, created_by)
    VALUES (NEW.contact_id, NEW.company_id, 'status_changed',
      'Stato opportunità: ' || NEW.status,
      jsonb_build_object('old_status', OLD.status, 'new_status', NEW.status, 'opportunity_name', NEW.name),
      COALESCE(auth.uid(), NEW.assigned_to));
  END IF;

  -- Assigned_to change
  IF OLD.assigned_to IS DISTINCT FROM NEW.assigned_to AND NEW.assigned_to IS NOT NULL THEN
    SELECT first_name || ' ' || last_name INTO assignee_name FROM public.profiles WHERE id = NEW.assigned_to;
    INSERT INTO public.marketing_contact_activities (contact_id, company_id, activity_type, description, metadata, created_by)
    VALUES (NEW.contact_id, NEW.company_id, 'opportunity_assigned',
      'Opportunità assegnata a ' || COALESCE(assignee_name, '?'),
      jsonb_build_object('opportunity_name', NEW.name, 'assigned_to', NEW.assigned_to, 'assigned_name', assignee_name),
      COALESCE(auth.uid(), NEW.assigned_to));
  END IF;

  RETURN NEW;
END;
$function$;

do $$
begin
  if to_regprocedure('public.soft_delete_record(text, uuid)') is not null then
    revoke all on function public.soft_delete_record(text, uuid) from public, anon, authenticated;
  end if;
  if to_regprocedure('public.restore_record(text, uuid)') is not null then
    revoke all on function public.restore_record(text, uuid) from public, anon, authenticated;
  end if;
end
$$;
