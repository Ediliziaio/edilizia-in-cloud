-- La galleria di immagini del listino: fino a 12 foto per linea, con un ruolo
-- (principale, sezione tecnica, dettaglio, esclusa dal PDF) e una didascalia.
-- Finora l'interfaccia le caricava nello storage e poi provava a scriverle su
-- una colonna che non esisteva: il database rispondeva 42703/PGRST204 e
-- `erroreGalleria` lo diceva all'utente senza salvataggi parziali. Questa è la
-- colonna che mancava.
--
-- Nessuna bonifica dei dati: `leggiImmaginiCatalogo(immagini, immagine_url)`
-- ripiega da sola sulla vecchia foto singola quando la galleria è vuota, e
-- `immagine_url` continua a portare la principale per chi legge solo quella.
-- Aggiungere una colonna senza valore predefinito non riscrive la tabella.

alter table public.listino_schede_linea  add column if not exists immagini jsonb;
alter table public.supplier_product_lines add column if not exists immagini jsonb;

comment on column public.listino_schede_linea.immagini is
  'Galleria di catalogo: [{id, url, ruolo, didascalia}]. Vuota o nulla = si usa immagine_url.';
comment on column public.supplier_product_lines.immagini is
  'Galleria di catalogo: [{id, url, ruolo, didascalia}].';

-- Queste due tabelle hanno i permessi PER COLONNA: senza un GRANT esplicito la
-- colonna nuova non si legge nemmeno con un select('*') dal browser, e la
-- galleria resterebbe muta come prima. Solo i ruoli che la usano davvero:
-- `anon` ha già dei GRANT su queste tabelle, ma le policy lo fermano comunque e
-- qui non lo allarghiamo.
grant select, insert, update (immagini) on public.listino_schede_linea  to authenticated, service_role;
grant select, insert, update (immagini) on public.supplier_product_lines to authenticated, service_role;
