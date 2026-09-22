-- Le descrizioni delle tipologie di serramento escono sotto ogni finestra nel
-- PDF del cliente (SerramentoPDF, «descrizione tecnica del listino»). Dal
-- 15/09/2026 quelle della libreria portavano una nota per l'azienda — «Prezzo
-- al metro quadro della configurazione base; le altre scelte lo modificano in
-- percentuale» — che il cliente si ritrovava sotto ogni riga del preventivo.
-- Il modo di calcolare il prezzo sta già in modalita_prezzo_base: la nota si
-- toglie dalla libreria e dalle famiglie già importate (al 22/09/2026 solo
-- quelle di Demo Azienda 2, nessuna ancora in un preventivo).
-- Idempotente: dove la nota non c'è non cambia nulla.
set local lock_timeout = '3s';
set local statement_timeout = '60s';

update public.article_family_templates
   set descrizione = regexp_replace(descrizione, '\s*—\s*Prezzo al metro quadro della configurazione base[^.]*\.', '')
 where descrizione like '%Prezzo al metro quadro della configurazione base%';

update public.article_families
   set descrizione = regexp_replace(descrizione, '\s*—\s*Prezzo al metro quadro della configurazione base[^.]*\.', '')
 where descrizione like '%Prezzo al metro quadro della configurazione base%';
