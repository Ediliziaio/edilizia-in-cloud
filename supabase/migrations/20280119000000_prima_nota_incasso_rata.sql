-- Incasso rata commessa → Prima Nota, in un tap e senza doppioni.
--
-- Le rate delle commesse (order_installments) vivevano in un mondo e la Prima
-- Nota in un altro: segnare una rata "pagata" non lasciava traccia in
-- contabilita', e chi teneva la Prima Nota doveva ricopiare a mano importo,
-- data e commessa. Il collegamento e' la colonna installment_id: la
-- registrazione nasce dalla rata e resta agganciata.
--
-- L'indice UNIQUE parziale e' la garanzia che conta: una rata puo' generare
-- UNA sola registrazione — doppio tap, doppia finestra aperta o race non
-- possono raddoppiare l'incasso, perche' e' il database a dire no.
--
-- on delete set null: se la rata viene rifatta (le rate legacy vengono
-- rimigrate), la scrittura contabile sopravvive senza link — un movimento di
-- cassa registrato non sparisce mai da solo.

alter table public.prima_nota_entries
  add column if not exists installment_id uuid
  references public.order_installments(id) on delete set null;

create unique index if not exists uq_prima_nota_installment
  on public.prima_nota_entries (installment_id)
  where installment_id is not null;

comment on column public.prima_nota_entries.installment_id is
  'Rata della commessa (order_installments) da cui nasce questa registrazione di incasso. UNIQUE parziale: una rata, una registrazione.';
