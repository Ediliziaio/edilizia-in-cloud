-- Fasi della commessa: il «Venduto» lo scrive solo chi vede gli importi (06/10/2026).
--
-- Cosa si poteva fare prima. order_work_phases.importo_venduto
-- (20281006120000) nell'app si vede e si scrive solo con i permessi «Ordini e
-- Commesse» e «Importi di vendita» (canEditOrders e canViewOrderAmounts). Le
-- policy della tabella però decidono sulla riga, non sulla colonna:
--   - «Campo workers can update phases of assigned orders» lascia all'operaio e
--     al subappaltatore assegnati alla commessa ogni colonna della fase;
--   - «Staff can manage order work phases if permitted» chiede solo
--     can_edit_orders, anche a chi ha gli importi spenti.
-- Dalle API (PATCH e POST su /rest/v1/order_work_phases) potevano quindi
-- scrivere il venduto di una fase, o crearne una col venduto già messo.
-- Provato il 06/10/2026 sull'azienda demo in una transazione annullata, prima e
-- dopo questa migrazione: scrivevano il venduto l'operaio assegnato, il
-- subappaltatore con «Ordini e Commesse» ma senza importi, lo staff d'ufficio
-- senza importi (anche creando una fase) e l'amministratore di un'altra
-- azienda messo sulla commessa. Nessuno l'aveva ancora fatto: nessuna fase ha
-- un venduto e user_action_log (che copre le fasi dal 02/10) non ha modifiche
-- della colonna.
--
-- Cosa fa. Un trigger rifiuta (42501) il cambio del venduto quando arriva da
-- un utente (authenticated o anon) che nell'azienda della commessa non ha
-- entrambi i permessi; per has_permission_for_company li hanno anche il super
-- admin e l'amministratore di quell'azienda. L'azienda è quella della commessa
-- (get_order_company_id), non la company_id della riga, che l'operaio può
-- riscrivere nella stessa richiesta, né quella in cui l'utente sta lavorando:
-- l'amministratore di un'altra azienda messo sulla commessa resta fuori. La
-- lettura non cambia, come per i prezzi delle righe del contratto.
--
-- Chi deve continuare a funzionare (provato nella stessa prova):
--   - l'ufficio con i due permessi e l'amministratore, anche quando rimandano
--     il venduto invariato insieme ad altre colonne;
--   - il super admin;
--   - le funzioni SECURITY DEFINER (girano come postgres) e le edge function
--     col service role: il trigger guarda current_user;
--   - l'operaio che aggiorna avanzamento, stato e foto: il trigger non scatta;
--   - chi crea una fase senza venduto (addPhase, applyTemplate).

set local lock_timeout = '3s';

create or replace function public.fase_venduto_solo_con_importi()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_utente uuid := (select auth.uid());
  v_aziende uuid[];
  v_azienda uuid;
begin
  -- Solo le richieste degli utenti (PostgREST come authenticated o anon). Le
  -- funzioni SECURITY DEFINER, il service role, i cron e le migrazioni passano.
  if current_user not in ('authenticated', 'anon') then
    return new;
  end if;

  if tg_op = 'INSERT' then
    if new.importo_venduto is null then
      return new;
    end if;
    v_aziende := array[public.get_order_company_id(new.order_id)];
  else
    -- Rimandato invariato insieme al resto della fase: niente da controllare.
    if new.importo_venduto is not distinct from old.importo_venduto then
      return new;
    end if;
    -- Se nella stessa richiesta la fase cambia commessa, servono i permessi
    -- su tutte e due.
    v_aziende := array[public.get_order_company_id(old.order_id),
                       public.get_order_company_id(new.order_id)];
  end if;

  foreach v_azienda in array v_aziende loop
    if v_azienda is null
       or not public.has_permission_for_company(v_utente, 'can_edit_orders', v_azienda)
       or not public.has_permission_for_company(v_utente, 'can_view_order_amounts', v_azienda) then
      raise exception 'Il venduto della fase lo scrive solo chi ha i permessi «Ordini e Commesse» e «Importi di vendita».'
        using errcode = '42501';
    end if;
  end loop;

  return new;
end;
$$;

-- Funzione di trigger: non serve a nessuno poterla chiamare (allo scatto il
-- privilegio non viene controllato).
revoke all on function public.fase_venduto_solo_con_importi() from public, anon, authenticated;

create or replace trigger trg_fase_venduto_solo_con_importi
  before insert or update of importo_venduto
  on public.order_work_phases
  for each row execute function public.fase_venduto_solo_con_importi();
