# MP01 — Fixture webhook Meta

12 fixture JSON che riproducono payload Meta reali + file `.expected` con
lo status e db_check attesi. Lo script `tests/wa-webhook/run-tests.sh` li
esegue uno per uno e confronta il risultato.

Phone number ID usati (tutti con prefisso `TEST_`):
- `TEST_PHONE_ID_BOT_OPERATIVO_001` — azienda demo, purpose=bot_operativo, stato=active
- `TEST_PHONE_ID_ASSISTENZA_001` — stessa azienda, purpose=assistenza
- `TEST_PHONE_ID_LEAD_001` — stessa azienda, purpose=lead
- `TEST_PHONE_ID_DISABLED_001` — stessa azienda, purpose=marketing, stato=suspended
- `TEST_PHONE_ID_NON_ESISTE_999` — NON presente (per test unknown_phone_number_id)
