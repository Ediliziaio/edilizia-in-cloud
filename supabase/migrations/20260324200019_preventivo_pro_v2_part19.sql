-- Indice primario per lookup griglia (prodotto + dimensioni)
CREATE INDEX IF NOT EXISTS idx_lg_prodotto ON public.listino_griglia(prodotto_id);
