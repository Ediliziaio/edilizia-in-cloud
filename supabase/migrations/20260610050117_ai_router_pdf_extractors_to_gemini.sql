-- Applicata direttamente in produzione dal pannello Supabase e ricostruita
-- qui dal registro migrazioni (supabase_migrations.schema_migrations),
-- per riallineare la cartella del repo alla storia reale del database.

-- I 3 estrattori di documenti PDF instradavano a modelli che NON leggono i PDF
-- (deepseek-chat-v3.1 text-only per listino/customers; gpt-4o-mini per tabella)
-- → output vuoto/spazzatura su PDF reali. Li ripuntiamo al modello PDF-native
-- gemini-2.5-flash (lo stesso usato con successo da pdf_vision_extract / ddt /
-- generic-doc). Insieme alla correzione del formato messaggio (image_url →
-- type:file) nelle edge function, questo fa funzionare l'estrazione sui PDF.
UPDATE public.ai_router_config
SET primary_model = 'google/gemini-2.5-flash', updated_at = now()
WHERE task_key IN ('listino_extract', 'customers_extract', 'tabella_finanziamento_extract');
