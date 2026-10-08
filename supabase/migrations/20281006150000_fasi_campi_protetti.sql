-- Fasi della commessa: dal cantiere si cambiano solo stato, avanzamento e foto,
-- e una fase non esce dall'azienda della sua commessa (06/10/2026).
--
-- Cosa si poteva fare prima. La policy «Campo workers can update phases of
-- assigned orders» controlla solo che l'utente sia assegnato alla commessa
-- (order_campo_assignments oppure order_employees), in USING e in WITH CHECK:
-- non limita né le colonne né l'azienda. L'operaio assegnato, senza alcun
-- permesso d'ufficio, dalle API (PATCH su /rest/v1/order_work_phases) poteva:
--   - rinominare la fase, cambiarne note e posizione;
--   - spostarne le date, che trg_fase_date_alle_squadre porta alle squadre
--     che seguono la fase (e ai loro accessi);
--   - spostarla su un'altra commessa a cui è assegnato;
--   - metterle la company_id di un'altra azienda: la policy degli
--     amministratori guarda la company_id della riga, e gli amministratori di
--     quell'azienda la vedevano e la modificavano. Chiudendola nella stessa
--     richiesta, l'evento «fase completata» delle automazioni finiva in
--     quell'azienda, col nome scelto dall'operaio.
-- Neanche le altre policy legano la company_id alla commessa: l'ufficio con
-- «Ordini e Commesse» poteva mettere a una fase (o crearla con) l'azienda di
-- un altro, l'amministratore poteva creare o spostare una fase nella commessa
-- di un'altra azienda, cambiandone l'avanzamento.
-- Provato il 06/10/2026 sull'azienda demo in una transazione annullata, prima
-- e dopo questa migrazione: ogni colonna cambiata da operaio, subappaltatore
-- (con e senza «Ordini e Commesse»), ufficio, amministratore, super admin,
-- funzione DEFINER e service role, più i passaggi a catena (169 casi). Prima
-- l'operaio cambiava 15 colonne su 17 (non il venduto, già protetto, né la
-- commessa di un'altra azienda, dove non è assegnato); dopo il suo cambio di
-- company_id l'amministratore dell'altra azienda vedeva la fase e la
-- rinominava; la fase creata dall'amministratore nella commessa di un'altra
-- azienda ne portava l'avanzamento da 55 a 50. Dopo: l'operaio cambia solo le
-- 6 colonne del cantiere e nessun utente porta una fase fuori dalla sua azienda.
-- Nessuno l'aveva ancora fatto: tutte le fasi stanno nell'azienda della loro
-- commessa, e user_action_log (che copre le fasi dal 02/10) ha modifiche solo
-- da amministratori e super admin; central_audit_log non copre la tabella.
--
-- Cosa fa. Un trigger rifiuta (42501), quando la richiesta arriva da un utente
-- (authenticated o anon):
--   - per tutti, super admin compreso: una fase creata con un'azienda diversa
--     da quella della commessa, il cambio della company_id, lo spostamento su
--     una commessa di un'altra azienda;
--   - per chi nell'azienda della commessa non ha «Ordini e Commesse»
--     (has_permission_for_company, che lo dà anche al super admin e
--     all'amministratore di quell'azienda): ogni colonna diversa da quelle che
--     cambia l'app di cantiere (stato, percentuale, foto, chiusura e
--     updated_at). L'azienda è quella della commessa (get_order_company_id),
--     non quella in cui l'utente sta lavorando.
-- Il venduto non lo guarda: lo decide trg_fase_venduto_solo_con_importi
-- (20281006130000), che scatta dopo questo (i trigger BEFORE vanno in ordine
-- alfabetico). Nessuno dei due cambia la riga: l'ordine decide solo quale
-- messaggio vede chi sbaglia due cose nella stessa richiesta.
--
-- Chi deve continuare a funzionare (provato nella stessa prova):
--   - l'app di cantiere: chiude e riapre la fase, aggiunge e toglie foto;
--   - l'ufficio con «Ordini e Commesse» e l'amministratore: modifica completa
--     della fase, creazione (addPhase, applyTemplate), approvazione dei
--     rapportini che alza l'avanzamento;
--   - il super admin;
--   - le funzioni SECURITY DEFINER (girano come postgres) e le edge function
--     col service role: il trigger guarda current_user.
-- Il subappaltatore che nell'azienda ha «Ordini e Commesse» (la modifica
-- segue la vista) conta come l'ufficio: apre la commessa dal menu e ne cambia
-- le fasi come oggi.

set local lock_timeout = '3s';

create or replace function public.fase_campi_protetti()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_utente uuid := (select auth.uid());
  -- Le colonne che cambia l'app di cantiere: CampoAvanzamento (stato,
  -- percentuale, foto, chiusura) e l'approvazione dei rapportini (anche
  -- updated_at).
  v_cantiere constant text[] := array['status', 'percentuale', 'foto_urls', 'completata_il', 'completata_da', 'updated_at'];
  -- Guardate da un altro trigger.
  v_altrove constant text[] := array['importo_venduto'];
  v_azienda_giusta boolean;
begin
  -- Solo le richieste degli utenti (PostgREST come authenticated o anon). Le
  -- funzioni SECURITY DEFINER, il service role, i cron e le migrazioni passano.
  if current_user not in ('authenticated', 'anon') then
    return new;
  end if;

  -- Per tutti, super admin compreso: la fase sta nell'azienda della sua
  -- commessa, e la sua azienda non cambia.
  if tg_op = 'INSERT' then
    v_azienda_giusta := new.company_id is not distinct from public.get_order_company_id(new.order_id);
  elsif new.company_id is distinct from old.company_id then
    v_azienda_giusta := false;
  elsif new.order_id is distinct from old.order_id then
    v_azienda_giusta := new.company_id is not distinct from public.get_order_company_id(new.order_id);
  else
    v_azienda_giusta := true;
  end if;

  if not v_azienda_giusta then
    raise exception 'Una fase resta nell''azienda della sua commessa.'
      using errcode = '42501';
  end if;

  if tg_op = 'INSERT' then
    return new;
  end if;

  -- Cambiano solo colonne del cantiere: va bene per chiunque passi la RLS.
  if (to_jsonb(new) - v_cantiere - v_altrove) = (to_jsonb(old) - v_cantiere - v_altrove) then
    return new;
  end if;

  -- Il resto (nome, date, note, posizione, commessa…) lo cambia chi ha
  -- «Ordini e Commesse» nell'azienda della commessa, non chi passa solo dalla
  -- policy di campo.
  if public.has_permission_for_company(v_utente, 'can_edit_orders', public.get_order_company_id(old.order_id)) then
    return new;
  end if;

  raise exception 'Dal cantiere si aggiornano solo stato, avanzamento e foto della fase: il resto lo cambia chi ha il permesso «Ordini e Commesse».'
    using errcode = '42501';
end;
$$;

-- Funzione di trigger: non serve a nessuno poterla chiamare (allo scatto il
-- privilegio non viene controllato).
revoke all on function public.fase_campi_protetti() from public, anon, authenticated;

create or replace trigger trg_fase_campi_protetti
  before insert or update
  on public.order_work_phases
  for each row execute function public.fase_campi_protetti();
