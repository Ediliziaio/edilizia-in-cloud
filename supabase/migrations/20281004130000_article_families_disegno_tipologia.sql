-- Disegno automatico dei serramenti: l'articolo dice che cosa disegnare.
-- Vuoto = nessun disegno, l'articolo usa la foto come prima.
-- Valori: id di TIPOLOGIE_DISEGNO («finestra_2_ante», «porta_finestra_1_anta»…)
-- oppure «persiana:<codice configurazione>» («persiana:3_ante_2_1_sx»).
alter table public.article_families
  add column if not exists disegno_tipologia text;

comment on column public.article_families.disegno_tipologia is
  'Tipologia del disegno automatico (src/lib/serramenti). NULL = foto dell''articolo.';
