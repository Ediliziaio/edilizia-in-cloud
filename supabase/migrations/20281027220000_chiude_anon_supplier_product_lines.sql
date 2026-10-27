-- `anon` aveva SELECT, INSERT, UPDATE e DELETE sulle linee prodotto dei
-- fornitori. Non è un permesso dato a mano: è il valore di partenza di Supabase
-- (`grant all on all tables in schema public to anon, authenticated`), che resta
-- addosso a ogni tabella creata senza un revoke. A fermare chi non ha fatto
-- l'accesso c'erano solo le policy — tutte su `company_id = get_my_company_id()`
-- o sul super admin, che per `anon` non danno nessuna riga. Quindi oggi non era
-- sfruttabile, ma era l'unica cosa fra una policy sbagliata e il listino di
-- tutte le aziende.
--
-- Verificato prima di togliere: nessuna pagina pubblica e nessuna edge function
-- legge questa tabella con la chiave anonima (la usano il wizard serramenti, il
-- PDF e le tariffe, tutti da utente autenticato).

revoke all on table public.supplier_product_lines from anon;
