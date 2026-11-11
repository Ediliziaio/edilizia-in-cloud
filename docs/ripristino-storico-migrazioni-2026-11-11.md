# Ripristino dello storico delle migrazioni — 11 novembre 2026

Il controllo Supabase sul commit 29facb8 segnalava `Remote migration versions not found in local migrations directory`. Il confronto tra il journal del progetto e i file del repository ha individuato nove versioni applicate il 10 novembre e assenti da Git.

I nove file SQL vengono recuperati integralmente da `supabase_migrations.schema_migrations.statements`, mantenendo versione, nome e testo originali. Non sono nuove migrazioni: il database di produzione ha già tutte le nove versioni nel journal. Non usare migration repair o ricreare le versioni con timestamp diversi.

Versioni recuperate:

- 20261110155749: fish_company_onboarding
- 20261110165759: fish_crm_live_trial
- 20261110182217: fish_ticket_conversations
- 20261110182246: fish_sales_and_operator_routing
- 20261110185334: fish_transcript_integrity
- 20261110192439: fish_customer_case_memory
- 20261110192455: fish_handoff_context
- 20261110202651: fish_lead_optout
- 20261110221044: solaria_workflow_compatibility

Validazione: confronto byte per byte con gli statement registrati, scansione degli accessi e regressioni sulle migrazioni prima dell’unione. I file consentono anche a un nuovo ambiente di ricostruire lo schema già applicato in produzione.
