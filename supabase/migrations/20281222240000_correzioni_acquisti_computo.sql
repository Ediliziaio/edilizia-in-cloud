-- Due correzioni trovate dalla revisione del 07/11/2026, sulle migrazioni dello
-- stesso giorno già applicate.
--
-- 1. computo_uploads.updated_at non lo aggiornava nessuno (né un trigger né la
--    edge function): solo 2 computi su 22 lo avevano diverso da created_at. Il
--    controllo delle letture interrotte (20281222230000) guarda proprio
--    updated_at: un «Riprova» fatto più di 30 minuti dopo il caricamento poteva
--    essere chiuso come fallito mentre la lettura era in corso. Ora un trigger lo
--    aggiorna a ogni modifica della riga: anche gli avanzamenti della lettura
--    («Lettura OCR pagina 3…») contano come segno di vita.
--
-- 2. materiali_variazioni (20281222190000) si leggeva da chiunque nell'azienda:
--    chi vede solo le commesse assegnate a lui vedeva le variazioni di tutte.
--    permesso materiali_variazioni: chi può vedere la commessa (puo_vedere_commessa).

set local lock_timeout = '3s';

drop trigger if exists computo_uploads_updated_at on public.computo_uploads;
create trigger computo_uploads_updated_at
  before update on public.computo_uploads
  for each row execute function public.update_updated_at_column();

drop policy if exists materiali_variazioni_leggi on public.materiali_variazioni;
create policy materiali_variazioni_leggi on public.materiali_variazioni
  for select to authenticated
  using (public.materiali_utente_in_azienda(company_id) and public.puo_vedere_commessa(order_id));
