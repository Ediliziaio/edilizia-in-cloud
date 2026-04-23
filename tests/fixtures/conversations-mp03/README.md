# MP03 — Fixture conversazionali (20 scenari)

5 fixture per ogni handler (assistenza, lead, marketing, notifiche).
Ogni file specifica: identity + conversation + expected_tool_calls / expected_db_state.

## Mapping scenari al runner

| # | Handler | Scenario | Tool attesi |
|---|---------|----------|-------------|
| 01 | assistenza | Cliente nuovo saluta | (none — solo persist contact) |
| 02 | assistenza | Cliente chiede stato lavori | stato_mio_ordine |
| 03 | assistenza | Urgenza acqua | apri_ticket urgenza=alta + segnala_urgente |
| 04 | assistenza | STOP opt-out | (none, opt_out=true) |
| 05 | assistenza | Chiede callback | richiedi_callback |
| 06 | lead | Lead nuovo ristruttura | salva_dato_qualificazione (servizio) |
| 07 | lead | Fornisce nome+budget | 2× salva_dato |
| 08 | lead | Completa 5 campi | verifica + handoff |
| 09 | lead | No grazie | (stato=lead_non_interessato) |
| 10 | lead | Chiede prezzo | proponi_appuntamento |
| 11 | marketing | Risposta a broadcast | recipient.replied + route ad assistenza |
| 12 | marketing | STOP dopo broadcast | opt_out |
| 13 | marketing | Inbound senza broadcast match | ticket generico |
| 14 | marketing | Broadcast scheduled→sending | cron process-broadcasts |
| 15 | marketing | Broadcast outside window | skip |
| 16 | notifiche | Fattura scaduta firata | check-wa-notifiche + log |
| 17 | notifiche | Cooldown stessa fattura | skip |
| 18 | notifiche | SAL 50% raggiunto | event_queue → notifiche |
| 19 | notifiche | Preventivo inviato | event_queue |
| 20 | notifiche | Trigger disabilitato | skip |
