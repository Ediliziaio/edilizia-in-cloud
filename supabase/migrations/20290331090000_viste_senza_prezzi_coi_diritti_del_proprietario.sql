-- Le viste «senza prezzi» tornano a girare coi diritti del proprietario (15/11/2026).
--
-- Nascono così (20290110160000, 20290110190000, 20290110210000): stesse righe della tabella, costi
-- vuoti, e le regole di visibilità copiate una per una nella WHERE. Servono a chi NON vede i costi,
-- perché a quell'utente la regola restrittiva `costi_solo_con_permesso` nasconde le righe della
-- tabella quando le legge direttamente.
--
-- 20290314000002 le ha riscritte con `security_invoker = true`: da allora la vista applica le regole
-- della tabella a chi legge, e la regola sui costi la svuota proprio per chi la deve usare. Giulia
-- Ufficio (Demo Azienda 2) senza «Costi» vedeva 0 voci su 8 nella commessa DEMO-2026-N045.
--
-- Le WHERE delle viste restano quelle (con `orders_visibili` al posto di `orders`, come le ha
-- lasciate la riscrittura del 14/03): azienda, assegnazioni, cantiere, portale e utente bloccato.
-- Nessuna riga scritta.
set local lock_timeout = '3s';
set local statement_timeout = '60s';

alter view if exists public.order_items_senza_prezzi set (security_invoker = false);
alter view if exists public.order_employees_senza_prezzi set (security_invoker = false);
alter view if exists public.order_external_teams_senza_prezzi set (security_invoker = false);
alter view if exists public.purchase_orders_senza_prezzi set (security_invoker = false);
alter view if exists public.purchase_order_items_senza_prezzi set (security_invoker = false);
alter view if exists public.supplier_rfq_quotes_senza_prezzi set (security_invoker = false);
alter view if exists public.supplier_rfq_suppliers_senza_prezzi set (security_invoker = false);
