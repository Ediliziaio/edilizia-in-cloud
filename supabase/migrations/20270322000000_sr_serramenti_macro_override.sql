-- Aggiunge sr_serramenti_progetto.macrocategoria_override_id per consentire
-- il fallback foto + pagina dedicata anche per BOM creati manualmente (senza
-- family_id).
--
-- Use case: consulente crea un serramento "Finestra a 2 ante" senza usare il
-- listino → niente family_id → niente foto, niente macro page dedicata.
-- Con questo campo l'utente può selezionare manualmente la macrocategoria a
-- cui il serramento "appartiene" (es. INFISSI WND) → il PDF mostra foto e
-- pagina dedicata.
--
-- Idempotente.

ALTER TABLE public.sr_serramenti_progetto
  ADD COLUMN IF NOT EXISTS macrocategoria_override_id UUID
  REFERENCES public.listino_macrocategorie(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.sr_serramenti_progetto.macrocategoria_override_id IS
  'Macrocategoria selezionata manualmente quando il serramento non è collegato '
  'a una family del listino. Usata per fallback foto prodotto e per generare '
  'la pagina dedicata macrocategoria nel PDF. NULL = nessun override.';

NOTIFY pgrst, 'reload schema';
