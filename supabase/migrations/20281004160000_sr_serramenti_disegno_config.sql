-- Il disegno del serramento si congela nella riga del preventivo: tipologia, apertura e le scelte
-- (colore, vetro, telaio) come etichette, così un PDF vecchio esce uguale anche se il listino cambia.
-- NULL = riga senza disegno congelato (il PDF ricalcola dal listino, se l'articolo ha il disegno).
alter table public.sr_serramenti_progetto
  add column if not exists disegno_config jsonb;

comment on column public.sr_serramenti_progetto.disegno_config is
  'Configurazione congelata del disegno automatico (src/lib/serramenti/disegnoConfig.ts). NULL = ricalcolo dal listino.';
