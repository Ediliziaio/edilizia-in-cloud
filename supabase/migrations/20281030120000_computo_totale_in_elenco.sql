-- Il totale del preventivo con computo nell'elenco dei preventivi (30/10/2026).
-- L'elenco legge solo le colonne di riepilogo (titolo, committente, numero di voci):
-- senza il totale, i computi mai mandati in firma mostravano «—». Lo calcola e lo
-- scrive il gestionale a ogni salvataggio (imponibile scontato, più l'IVA se applicata),
-- con la stessa funzione che usa per i computi rimasti sul computer.
-- Colonna nuova senza valore predefinito: istantanea, nessuna riga riscritta.

alter table public.computo_preventivo_drafts
  add column if not exists total numeric(14,2);

alter table public.computo_preventivo_drafts
  drop constraint if exists computo_preventivo_drafts_total_check;
alter table public.computo_preventivo_drafts
  add constraint computo_preventivo_drafts_total_check check (total is null or (total >= 0 and total < 1e12));

-- Chi salva il computo scrive anche il totale (l'insert ha già il grant su tutta la riga).
grant update (total) on public.computo_preventivo_drafts to authenticated;

comment on column public.computo_preventivo_drafts.total is
  'Totale per l''elenco dei preventivi: imponibile scontato più IVA se applicata. Lo scrive il client a ogni salvataggio; null per i computi salvati prima del 30/10/2026 o senza importi.';
