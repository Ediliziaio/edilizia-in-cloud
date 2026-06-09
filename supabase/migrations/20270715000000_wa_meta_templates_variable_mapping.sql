-- Mappatura posizione variabile {{n}} → campo del contatto, definita in EiC
-- alla creazione/modifica del template. Es: {"1":"nome","2":"telefono","3":"cf:<uuid>"}.
-- Permette di auto-compilare le variabili dal contatto al momento dell'invio.
-- NB: il sync da Meta NON scrive questa colonna (upsert sui soli campi sincronizzati),
-- quindi la mappatura sopravvive alle sincronizzazioni periodiche.
ALTER TABLE public.wa_meta_templates
  ADD COLUMN IF NOT EXISTS variable_mapping jsonb;

COMMENT ON COLUMN public.wa_meta_templates.variable_mapping IS
  'Mappa posizione variabile template ({{n}}) → chiave campo contatto (nome, telefono, cf:<id>...). Definita in EiC, preservata dal sync.';
