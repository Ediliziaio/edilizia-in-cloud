-- Wizard FV "kit-based": quando un progetto parte da un Bundle/kit (Fase 5), si
-- memorizza la scelta sul progetto così che, riaprendolo in modifica, il wizard
-- sappia che è un kit (e non ricostruisca i componenti dal pannello/inverter,
-- cancellando la voce kit). Tutti nullable: i progetti "su misura" non li usano.
ALTER TABLE public.fv_progetti
  ADD COLUMN IF NOT EXISTS kit_bundle_id uuid,
  ADD COLUMN IF NOT EXISTS kit_nome text,
  ADD COLUMN IF NOT EXISTS kit_prezzo numeric;

COMMENT ON COLUMN public.fv_progetti.kit_bundle_id IS 'FV kit: id del bundle_prodotti scelto come kit (NULL = impianto su misura)';
COMMENT ON COLUMN public.fv_progetti.kit_prezzo IS 'FV kit: prezzo offerta del kit usato come investimento (chiavi in mano)';
