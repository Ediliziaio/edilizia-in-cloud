-- L'offerta fornitore letta dall'AI da un PDF (ContractImportDialog) si puo'
-- registrare come risposta a una RDO: serve un valore di provenienza dedicato
-- 'ai_pdf' accanto a codice/mittente/manuale. Idempotente: drop+add.
alter table public.supplier_rfq_suppliers
  drop constraint if exists rfq_suppliers_aggancio_da_check;

alter table public.supplier_rfq_suppliers
  add constraint rfq_suppliers_aggancio_da_check
  check (
    aggancio_da is null
    or aggancio_da in ('codice', 'mittente', 'manuale', 'ai_pdf')
  );
