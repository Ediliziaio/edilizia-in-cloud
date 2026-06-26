-- Editor layout pannelli (stile Reonic) sulla foto satellitare: l'installatore
-- trascina/ruota l'array di moduli sul tetto reale. La trasformazione
-- (offset x/y in %, rotazione in gradi, n. colonne) si salva sul progetto così
-- da ricomparire identica in modifica e nel PDF. Nullable: i progetti senza
-- editor manuale non la usano (overlay indicativo centrato di default).
ALTER TABLE public.fv_progetti
  ADD COLUMN IF NOT EXISTS layout_overlay jsonb;

COMMENT ON COLUMN public.fv_progetti.layout_overlay IS 'FV editor layout manuale moduli su satellite: { x, y (offset %), rot (gradi), cols }';
