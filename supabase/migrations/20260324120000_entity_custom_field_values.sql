-- Tabella generica per i valori dei campi personalizzati su qualsiasi entità
-- Permette di estendere il sistema custom fields a: ordini_variazione,
-- giornale_lavori, pos_documents, duvri_documents (e futuri entity type)

CREATE TABLE public.entity_custom_field_values (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id   UUID        NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  entity_type  TEXT        NOT NULL, -- es. 'ordini_variazione', 'giornale_lavori', 'pos_document', 'duvri_document'
  entity_id    UUID        NOT NULL,
  field_id     UUID        NOT NULL REFERENCES public.marketing_custom_fields(id) ON DELETE CASCADE,
  value        TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (entity_type, entity_id, field_id)
);
