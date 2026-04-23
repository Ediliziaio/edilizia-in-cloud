# MP02 — Fixture conversazionali

8 scenari essenziali (MVP, ridotti da 20 del masterprompt per efficienza).
Ogni file contiene: identity_mock + conversation + expected_tool_calls.

**Come eseguirli:**

I test richiedono OpenAI API key live + un company seed. In CI futuro:
1. Applica seed (company + employee con user_id reale + orders)
2. Per ogni fixture:
   - inserisce un `whatsapp_messages` con `content_text` = ultimo turno user
   - POST al processor `/whatsapp-ai-processor` con `message_id`
   - Verifica `wa_tool_calls` per il `message_id`
   - Controlla che i tool attesi siano stati invocati con argomenti coerenti
3. Cleanup

La creazione di rapportini reali richiede un `auth.users` user vero
(employee.user_id NOT NULL in campo_rapportini). In questa release MP02
MVP i test positivi con DB write sono smoke-only contro prod.

**Scenari coperti:**

| ID | Kind | Scenario | Tool attesi |
| --- | --- | --- | --- |
| 01 | operaio | "oggi 8h villa rossi" | crea_rapportino |
| 02 | operaio | "cantieri oggi?" | elenca_miei_cantieri_oggi |
| 03 | operaio | segnalazione urgente | crea_segnalazione (alta) |
| 04 | titolare | "come va villa rossi?" | stato_cantiere |
| 05 | titolare | "chi mi deve pagare?" | scadenze_fatture (solo_scadute) |
| 06 | titolare | "quanto ho speso questo mese?" | costi_mese |
| 07 | unknown | "ciao" | nessuno → unknown_user |
| 08 | operaio (injection) | chiede tool titolare | nessuno → filter grants |
