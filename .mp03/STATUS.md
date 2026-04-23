# MP03 — STATUS

## Identità
- Branch: feature/mp03-handlers-assistenza-lead-marketing-notifiche
- Base: feature/mp02 (che porta MP01+MP02)

## Fasi
- [x] P0 migration applicata (6 tabelle + extensions marketing_contacts)
- [x] P1 handler production 4/4 (assistenza/lead/marketing/notifiche)
- [x] P2 sub-processor assistenza-ai (6 tool) + lead-ai (4 tool)
- [x] P3 cron function 3/3 deploy + smoke test (HTTP 200)
- [x] Helper _contact.ts condiviso
- [x] System prompts dedicati

## Decisioni
1. marketing_contacts estesa invece di crm_contacts (che non esiste)
2. support_tickets creata da zero + RLS via profiles.company_id
3. JWT role=service_role check al posto del confronto stretto con SERVICE_ROLE_KEY
4. Event-driven notifiche rinviati a MP4 (richiedono DB triggers)
