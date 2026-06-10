-- I 3 estrattori di documenti PDF instradavano a modelli che NON leggono i PDF
-- (deepseek-chat-v3.1 text-only per listino/customers; gpt-4o-mini per tabella)
-- → output vuoto/spazzatura su PDF reali. Li ripuntiamo al modello PDF-native
-- gemini-2.5-flash (lo stesso usato da pdf_vision_extract / ddt / generic-doc).
-- In coppia con la correzione del formato messaggio (image_url → type:file)
-- nelle edge function, questo fa funzionare l'estrazione AI sui PDF.
UPDATE public.ai_router_config
SET primary_model = 'google/gemini-2.5-flash', updated_at = now()
WHERE task_key IN ('listino_extract', 'customers_extract', 'tabella_finanziamento_extract');
