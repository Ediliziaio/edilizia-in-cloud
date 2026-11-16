-- Ricarico AI per compito: i prezzi (decisione del titolare del 16/11/2026).
--
-- Riempie `ai_ricarico_compito` (nata con 20290417120000). Da qui router e strada
-- diretta addebitano costo vero × moltiplicatore del compito, mai sotto 3×.
-- `ai_pricing_tiers` (listino a token) e `ai_pricing_markup` restano solo come
-- ripiego per il costo sconosciuto e per gli override per azienda (oggi nessuno).
--
-- Valori: il ricarico effettivo di oggi per compito, misurato con
-- `ai_ricarico_anteprima(30)` (poi 180 giorni per i compiti rari; per quelli mai
-- visti, il listino del tier sul modello configurato o il ricarico di
-- ai_pricing_markup), arrotondato e mai sotto 3×. Per i clienti cambia solo dove
-- oggi si sta sotto 3×.
--
-- Idempotente: ON CONFLICT aggiorna il valore.

SET LOCAL lock_timeout = '3s';
SET LOCAL statement_timeout = '60s';

INSERT INTO public.ai_ricarico_compito (compito, moltiplicatore, origine) VALUES
  ('default', 3, 'minimo per i compiti senza riga'),
  ('ai_allocazione_operai', 10.00, 'misurato 30 giorni (2 chiamate)'),
  ('ai_pricing_suggest', 10.00, 'stima: listino del tier sul modello configurato'),
  ('assistenza_clienti', 3, 'ai_pricing_markup (compito)'),
  ('audio_transcription', 3, 'misurato 30 giorni (15 chiamate)'),
  ('automation_generate', 3.21, 'stima: listino del tier sul modello configurato'),
  ('automation_message_generate', 13.95, 'misurato 180 giorni (3 chiamate)'),
  ('bank_categorize', 3, 'ai_pricing_markup (compito)'),
  ('bank_statement_ocr', 10.00, 'stima: listino del tier sul modello configurato'),
  ('biz_card_ocr', 13.95, 'stima: listino del tier sul modello configurato'),
  ('bot_operativo_operaio', 3, 'misurato 180 giorni (4 chiamate)'),
  ('bot_operativo_titolare', 3.02, 'misurato 30 giorni (8 chiamate)'),
  ('chat_routine', 3, 'misurato 30 giorni (2 chiamate)'),
  ('computo_extract', 13.95, 'misurato 30 giorni (2 chiamate)'),
  ('computo_metrico', 5.00, 'ai_pricing_markup (compito)'),
  ('contratto_compliance_review', 3.21, 'stima: listino del tier sul modello configurato'),
  ('council_synthesis', 13.95, 'misurato 30 giorni (1 chiamate)'),
  ('customer_ltv_predict', 10.00, 'stima: listino del tier sul modello configurato'),
  ('customers_extract', 10.00, 'stima: listino del tier sul modello configurato'),
  ('ddt_ocr', 10.00, 'misurato 30 giorni (1 chiamate)'),
  ('documento_contratto', 24.82, 'misurato 30 giorni (1 chiamate)'),
  ('documento_pos', 3.60, 'misurato 30 giorni (3 chiamate)'),
  ('duvri_generate', 3.21, 'stima: listino del tier sul modello configurato'),
  ('email_ai_digest', 3, 'misurato 30 giorni (2 chiamate)'),
  ('email_ai_l3_batch', 3, 'misurato 30 giorni (2 chiamate)'),
  ('email_classify', 4.50, 'misurato 180 giorni (24 chiamate)'),
  ('email_compose', 3.09, 'misurato 30 giorni (24 chiamate)'),
  ('email_opportunita', 3, 'misurato 30 giorni (3 chiamate)'),
  ('email_triage', 13.63, 'misurato 30 giorni (731 chiamate)'),
  ('fattura_classify', 10.00, 'misurato 30 giorni (25 chiamate)'),
  ('fattura_ricevuta_ocr', 13.95, 'stima: listino del tier sul modello configurato'),
  ('fattura_riconcilia', 10.00, 'misurato 30 giorni (41 chiamate)'),
  ('foto_cantiere_quality', 13.95, 'stima: listino del tier sul modello configurato'),
  ('fraud_anomaly_review', 10.00, 'stima: listino del tier sul modello configurato'),
  ('generale_documenti_estrai', 4.21, 'misurato 30 giorni (3 chiamate)'),
  ('generale_documenti_ocr', 4.31, 'misurato 30 giorni (1 chiamate)'),
  ('lead_qualificazione', 4.00, 'misurato 30 giorni (111 chiamate)'),
  ('lead_qualify', 10.00, 'stima: listino del tier sul modello configurato'),
  ('lead_score', 10.00, 'misurato 30 giorni (11 chiamate)'),
  ('listino_abbina_voci', 10.00, 'misurato 30 giorni (9 chiamate)'),
  ('listino_extract', 10.00, 'stima: listino del tier sul modello configurato'),
  ('memory_extraction', 10.00, 'misurato 30 giorni (33 chiamate)'),
  ('message_analysis', 13.95, 'stima: listino del tier sul modello configurato'),
  ('parse_rapportino', 3, 'misurato 30 giorni (1 chiamate)'),
  ('pdf_vision_extract', 4.09, 'misurato 30 giorni (106 chiamate)'),
  ('persona_capocantiere', 15.75, 'misurato 180 giorni (5 chiamate)'),
  ('persona_cfo', 20.93, 'misurato 180 giorni (6 chiamate)'),
  ('persona_direttore_marketing', 18.53, 'misurato 30 giorni (2 chiamate)'),
  ('persona_direttore_vendite', 18.32, 'misurato 180 giorni (4 chiamate)'),
  ('persona_hr', 18.37, 'misurato 180 giorni (2 chiamate)'),
  ('persona_pm_cantiere', 18.23, 'misurato 180 giorni (2 chiamate)'),
  ('persona_sales', 18.55, 'misurato 30 giorni (2 chiamate)'),
  ('persona_silvio', 3.32, 'misurato 30 giorni (154 chiamate)'),
  ('persona_silvio_lettura', 6.09, 'misurato 30 giorni (15 chiamate)'),
  ('playbook_advisor', 3.21, 'stima: listino del tier sul modello configurato'),
  ('preventivo_analisi', 3.09, 'misurato 30 giorni (1 chiamate)'),
  ('preventivo_genera', 3.06, 'misurato 30 giorni (491 chiamate)'),
  ('public_chat', 6.34, 'misurato 180 giorni (7 chiamate)'),
  ('query_classifier', 13.95, 'misurato 30 giorni (55 chiamate)'),
  ('rapportini_da_documento', 5.19, 'misurato 30 giorni (2 chiamate)'),
  ('rapportino_parse', 10.00, 'misurato 180 giorni (1 chiamate)'),
  ('render_image_edit', 4.00, 'ai_pricing_markup (compito)'),
  ('render_image_qa', 3, 'ai_pricing_markup (compito)'),
  ('render_scene_analysis', 3, 'ai_pricing_markup (compito)'),
  ('render_window_photo_analysis', 3, 'misurato 30 giorni (1 chiamate)'),
  ('report_executive', 3.21, 'stima: listino del tier sul modello configurato'),
  ('serramenti_photo_to_quote', 24.09, 'stima: listino del tier sul modello configurato'),
  ('serramenti_text_to_quote', 3.21, 'misurato 30 giorni (4 chiamate)'),
  ('silvio_commessa_chat', 14.23, 'misurato 30 giorni (12 chiamate)'),
  ('silvio_commessa_lettura', 15.04, 'misurato 30 giorni (23 chiamate)'),
  ('structured_extraction', 5.00, 'misurato 30 giorni (1 chiamate)'),
  ('tabella_finanziamento_extract', 4.52, 'stima: listino del tier sul modello configurato'),
  ('template_fotovoltaico', 3.86, 'misurato 180 giorni (3 chiamate)'),
  ('template_tetti', 13.95, 'misurato 180 giorni (2 chiamate)'),
  ('text_summarize', 10.00, 'misurato 30 giorni (46 chiamate)'),
  ('vision_cantiere', 13.95, 'stima: listino del tier sul modello configurato'),
  ('vision_ddt', 5.00, 'ai_pricing_markup (compito)'),
  ('vision_po', 3, 'misurato 30 giorni (5 chiamate)')
ON CONFLICT (compito) DO UPDATE
  SET moltiplicatore = EXCLUDED.moltiplicatore,
      origine        = EXCLUDED.origine,
      regalato       = false,
      aggiornato_il  = now()
  WHERE NOT public.ai_ricarico_compito.regalato;
