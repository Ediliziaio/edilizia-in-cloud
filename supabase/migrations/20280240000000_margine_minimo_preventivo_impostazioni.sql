-- ============================================================================
-- preventivo_impostazioni: aggiunge margine_minimo_percentuale.
--
-- La pagina Impostazioni > Margini ha da sempre un campo "Margine minimo %"
-- (il semaforo rosso: sotto questa soglia il margine si evidenzia in rosso),
-- ma la colonna non è mai esistita. Il form scriveva margine_minimo_percentuale
-- e margine_target_percentuale (entrambe inesistenti) → upsert in 400, i
-- margini non si salvavano. margine_target_percentuale era in realtà
-- margine_target_default; il "minimo" invece non aveva casa.
--
-- È un concetto distinto da soglia_margine_visibile (che decide cosa vedono i
-- commerciali, non la qualità del margine): gli diamo la sua colonna.
-- ============================================================================

ALTER TABLE public.preventivo_impostazioni
  ADD COLUMN IF NOT EXISTS margine_minimo_percentuale numeric(5,2);

COMMENT ON COLUMN public.preventivo_impostazioni.margine_minimo_percentuale IS
  'Soglia del semaforo rosso: sotto questo margine % la riga si evidenzia. Distinta da soglia_margine_visibile (visibilità ai commerciali).';

NOTIFY pgrst, 'reload schema';
