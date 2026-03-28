-- Indice per ricerca nearest-neighbor (trovaPrezzoGriglia nel hook P03)
CREATE INDEX IF NOT EXISTS idx_lg_prodotto_xy ON public.listino_griglia(prodotto_id, valore_x, valore_y);
