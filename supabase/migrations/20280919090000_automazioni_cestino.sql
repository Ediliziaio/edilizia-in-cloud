-- Cestino delle automazioni.
--
-- Il 19/09/2026 alle 11:55 due clic su «Elimina selezionati» nell'area super
-- admin hanno cancellato 20 automazioni: DELETE vero, e a cascata nodi,
-- collegamenti, iscrizioni, coda e versioni. Nessuna copia: il backup
-- settimanale saltava l'azienda della piattaforma. Sedici flussi «Notifica
-- lead» sono stati ricostruiti a mano dai quattro superstiti.
--
-- Da qui in poi «Elimina» sposta nel cestino, come per le opportunità
-- (20280918201000_opportunita_cestino.sql):
--
-- - entrando nel cestino l'automazione diventa «archived» (il motore esegue
--   solo le «published»), si ricorda lo stato di prima e chi l'ha tolta, e il
--   lavoro in corso si mette in pausa: i passi in coda e le iscrizioni attive.
--   Il motore non ricontrolla lo stato del flusso quando esegue la coda, quindi
--   senza la pausa un'email già programmata partirebbe lo stesso;
-- - uscendo si rimette tutto com'era;
-- - una DELETE qualsiasi — schermata vecchia, chiamata diretta all'API —
--   diventa «sposta nel cestino». L'eliminazione vera passa solo da
--   automazione_elimina_definitivamente(), che il cestino usa di proposito;
-- - la purga di un'azienda cancellata funziona ancora: la guardia sta nella
--   clausola WHEN con azienda_ancora_esiste(), che dentro il cascade risulta
--   falsa (vedi project_purga_azienda_ostacoli).

alter table public.automation_flows
  add column if not exists deleted_at timestamptz,
  add column if not exists deleted_by uuid,
  add column if not exists stato_prima_eliminazione text;

comment on column public.automation_flows.deleted_at is
  'Nel cestino da questo momento. «Elimina» non cancella più: vedi automazione_elimina_definitivamente().';

create index if not exists idx_automation_flows_cestino
  on public.automation_flows (company_id, deleted_at desc)
  where deleted_at is not null;

-- ── Entrare e uscire dal cestino ─────────────────────────────────────────
create or replace function public.automazione_cestino_stato()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if old.deleted_at is null and new.deleted_at is not null then
    new.stato_prima_eliminazione := old.status;
    new.status := 'archived';
    new.deleted_by := coalesce(new.deleted_by, auth.uid());

    update automation_queue
       set status = 'in_pausa_cestino', updated_at = now()
     where flow_id = new.id and status = 'pending';
    update automation_enrollments
       set status = 'paused', updated_at = now()
     where flow_id = new.id and status = 'active';

  elsif old.deleted_at is not null and new.deleted_at is null then
    new.status := coalesce(old.stato_prima_eliminazione, 'draft');
    new.stato_prima_eliminazione := null;
    new.deleted_by := null;

    update automation_queue
       set status = 'pending', updated_at = now()
     where flow_id = new.id and status = 'in_pausa_cestino';
    update automation_enrollments
       set status = 'active', updated_at = now()
     where flow_id = new.id and status = 'paused';
  end if;
  return new;
end
$$;

revoke all on function public.automazione_cestino_stato() from public, anon, authenticated;

drop trigger if exists trg_automazione_cestino_stato on public.automation_flows;
create trigger trg_automazione_cestino_stato
  before update of deleted_at on public.automation_flows
  for each row execute function public.automazione_cestino_stato();

-- ── Una DELETE qualsiasi finisce nel cestino ─────────────────────────────
create or replace function public.automazione_elimina_va_nel_cestino()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  -- Già nel cestino: ci resta. Uscirne definitivamente è una scelta esplicita.
  if old.deleted_at is null then
    update automation_flows
       set deleted_at = now(), deleted_by = auth.uid()
     where id = old.id;
  end if;
  return null; -- la cancellazione vera non avviene
end
$$;

revoke all on function public.automazione_elimina_va_nel_cestino() from public, anon, authenticated;

drop trigger if exists trg_automazione_elimina_va_nel_cestino on public.automation_flows;
create trigger trg_automazione_elimina_va_nel_cestino
  before delete on public.automation_flows
  for each row
  when (public.azienda_ancora_esiste(old.company_id)
        and coalesce(current_setting('eic.automazione_elimina_davvero', true), '') <> 'on')
  execute function public.automazione_elimina_va_nel_cestino();

-- ── Eliminazione definitiva, di proposito ────────────────────────────────
-- SECURITY INVOKER: la DELETE passa dalle stesse policy di prima, quindi
-- ognuno elimina solo quello che poteva già eliminare.
create or replace function public.automazione_elimina_definitivamente(p_flow_id uuid)
returns boolean
language plpgsql
security invoker
set search_path to 'public'
as $$
declare
  v_righe int;
begin
  perform set_config('eic.automazione_elimina_davvero', 'on', true);
  delete from automation_flows where id = p_flow_id;
  get diagnostics v_righe = row_count;
  perform set_config('eic.automazione_elimina_davvero', '', true);
  return v_righe > 0;
end
$$;

revoke all on function public.automazione_elimina_definitivamente(uuid) from public, anon;
grant execute on function public.automazione_elimina_definitivamente(uuid) to authenticated, service_role;
