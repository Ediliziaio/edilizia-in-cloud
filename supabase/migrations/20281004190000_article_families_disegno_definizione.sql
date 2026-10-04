-- Tipo di disegno composto a mano: con disegno_tipologia = 'personalizzata' le ante e le misure di partenza
-- stanno qui (src/lib/serramenti/disegnoSerramento.ts, DefinizioneDisegno). NULL negli altri casi.
alter table public.article_families
  add column if not exists disegno_definizione jsonb;

comment on column public.article_families.disegno_definizione is
  'Definizione del disegno quando disegno_tipologia = personalizzata: {larghezzaMm, altezzaMm, ante[], soglia, scorrimento, inLinea}. NULL altrimenti.';
