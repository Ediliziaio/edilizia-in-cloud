-- La banca riconosce anche le rate di commessa, non solo le fatture.
--
-- bank_transactions marca gia' i movimenti consumati con linked_invoice_id
-- (incassi su fattura) e linked_scadenza_id (uscite su scadenza). Mancava il
-- terzo caso, comunissimo in edilizia: l'acconto o il saldo di una commessa
-- incassati con bonifico SENZA fattura emessa — il movimento restava per
-- sempre "da riconciliare" perche' l'unica cosa che il sistema sapeva
-- cercare erano le fatture.
--
-- linked_installment_id chiude il giro: il bonifico si aggancia alla rata
-- (order_installments), la rata risulta pagata alla data VERA del movimento,
-- e la registrazione in Prima Nota porta bank_transaction_id — banca, rata e
-- contabilita' raccontano la stessa storia.

alter table public.bank_transactions
  add column if not exists linked_installment_id uuid
  references public.order_installments(id) on delete set null;

create index if not exists idx_bank_tx_linked_installment
  on public.bank_transactions (linked_installment_id)
  where linked_installment_id is not null;

comment on column public.bank_transactions.linked_installment_id is
  'Rata di commessa (order_installments) riconciliata con questo movimento in entrata. Stessa famiglia di linked_invoice_id/linked_scadenza_id: un movimento consumato non viene riproposto.';
