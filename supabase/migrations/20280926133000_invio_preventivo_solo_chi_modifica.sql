-- Mandare un preventivo al cliente richiede di poterlo modificare (26/09/2026).
--
-- send-quote-signature scrive sul preventivo col service role (stato, link di
-- firma, scadenza, email del cliente) e annulla le firme in corso. Dal 26/09
-- controllava che chi chiama VEDESSE il preventivo: chi lo vede soltanto, dalle
-- Commesse (q_sel, can_view_orders) o coi Preventivi in sola lettura, poteva
-- ancora mandarlo in firma o via email. Deciso da Florin: per mandarlo al
-- cliente serve poterlo modificare, come per le righe e le schede tecniche.
--
-- preventivo_modificabile(id) non copia la regola: gira coi permessi di chi
-- chiama (SECURITY INVOKER) e legge la riga con un blocco (FOR KEY SHARE). Per
-- un SELECT con blocco Postgres applica, oltre alle policy di lettura, le USING
-- delle policy di UPDATE: q_upd_preventivi (super admin, oppure il permesso di
-- modificare i Preventivi, e il preventivo fra quelli che lo staff vede) e la
-- RESTRICTIVE del blocco utente. Se la policy cambia, cambia anche la risposta.
-- Non scrive niente; FOR KEY SHARE è il blocco più leggero e finisce con la
-- chiamata: i salvataggi ordinari passano, chi riscrive company_id o
-- quote_number aspetta qualche millisecondo.
--
-- I preventivi vanno al cliente solo da send-quote-signature: fea-richiedi-firma
-- con «quote» (che controllava solo l'azienda) risponde 400, nello stesso commit.
--
-- Provato il 26/09 dal guardiano degli accessi con utenti veri, in transazioni
-- annullate: 33 casi su 33 uguali alla policy di modifica. I 5 preventivi mandati
-- in firma finora vengono da amministratori, che passano; l'invio del solo PDF
-- non è mai stato usato. Chi perde l'invio (chi vede i preventivi dalle Commesse)
-- non l'ha mai usato.

set local lock_timeout = '3s';

create or replace function public.preventivo_modificabile(p_quote_id uuid)
returns boolean
language sql
volatile
security invoker
set search_path = public
as $$
  select exists (select 1 from public.quotes q where q.id = p_quote_id for key share);
$$;

comment on function public.preventivo_modificabile(uuid) is
  'Chi chiama può modificare questo preventivo? SECURITY INVOKER + FOR KEY SHARE: risponde la RLS di quotes (q_upd_preventivi e blocco utente). La usa send-quote-signature prima di ogni scrittura.';

revoke all on function public.preventivo_modificabile(uuid) from public, anon;
grant execute on function public.preventivo_modificabile(uuid) to authenticated;
