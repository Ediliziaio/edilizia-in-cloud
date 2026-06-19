-- F16: persistenza dati geometrici del tetto sul progetto FV.
-- Azimut (orientamento prevalente), inclinazione (pendenza falda) e layout
-- reale dei pannelli oggi vivevano solo nello stato locale del wizard e si
-- perdevano al reload. Aggiungiamo le 3 colonne nullable a fv_progetti così
-- l'analisi tetto (Solar API / PVGIS) viene idratata dal DB alla riapertura.
--
-- Additiva + idempotente. NON ancora applicata (solo file locale).
-- ALTER separati per idempotenza chirurgica (uno per colonna).
ALTER TABLE public.fv_progetti
  ADD COLUMN IF NOT EXISTS azimut_tetto numeric;

ALTER TABLE public.fv_progetti
  ADD COLUMN IF NOT EXISTS inclinazione_tetto numeric;

ALTER TABLE public.fv_progetti
  ADD COLUMN IF NOT EXISTS layout_tetto jsonb;

COMMENT ON COLUMN public.fv_progetti.azimut_tetto IS
  'F16 — Orientamento prevalente della falda in gradi (0=Nord, 90=Est, 180=Sud, 270=Ovest). Da Google Solar API.';
COMMENT ON COLUMN public.fv_progetti.inclinazione_tetto IS
  'F16 — Inclinazione (pendenza) della falda prevalente in gradi. Da Google Solar API.';
COMMENT ON COLUMN public.fv_progetti.layout_tetto IS
  'F16 — Layout reale dei pannelli (coordinate/segmenti) suggerito dalla Solar API. Usato dalla vista "Disposizione reale dei pannelli".';
