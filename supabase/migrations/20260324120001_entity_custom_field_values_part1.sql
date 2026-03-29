-- Index per recupero veloce per entità
CREATE INDEX idx_entity_cfv_entity ON public.entity_custom_field_values (entity_type, entity_id);
