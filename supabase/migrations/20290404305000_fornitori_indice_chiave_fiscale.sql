-- Rubrica fornitori: indici per chiave fiscale (15/11/2026).
-- fornitore_unico_per_cedente confronta partner_tax_key(vat_number) e partner_tax_key(fiscal_code) di ogni
-- fornitore dell'azienda, e la chiamano i trigger delle fatture una volta per fattura: senza indice ogni
-- fattura rileggeva tutta la rubrica. Il lotto storico dei fornitori automatici rallentava man mano che la
-- rubrica cresceva (da 0,1 a 0,65 s per fornitore). Tabella piccola: indici in pochi istanti.
set local lock_timeout = '3s';

create index if not exists suppliers_company_chiave_piva
  on public.suppliers (company_id, (public.partner_tax_key(vat_number)));
create index if not exists suppliers_company_chiave_cf
  on public.suppliers (company_id, (public.partner_tax_key(fiscal_code)));
