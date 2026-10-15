// Two foreign keys link fields to templates (one also enforces tenant ownership).
// PostgREST needs the explicit relation, otherwise embedding fails with PGRST201.
export const DOCUMENTO_TEMPLATE_SELECT = '*, campi:documento_template_fields!documento_template_fields_template_id_fkey(*)';
