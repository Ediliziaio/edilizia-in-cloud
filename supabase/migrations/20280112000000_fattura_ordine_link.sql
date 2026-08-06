-- Aggancio fattura fornitore → ordine d'acquisto.
--
-- PERCHE'
--   Il confronto a tre vie (ordine ↔ bolla ↔ fattura) e' il controllo che
--   impedisce di pagare merce mai arrivata o a un prezzo mai concordato.
--   Oggi non e' nemmeno esprimibile: fatture_ricevute non ha alcun campo che
--   punti a purchase_orders. L'unico aggancio esistente e' `order_id_suggerito`,
--   che punta alla COMMESSA (orders) e per giunta e' solo un suggerimento
--   dell'AI, non un legame confermato.
--
--   Con questa colonna la catena si chiude:
--     purchase_orders → ddt_ricezione → fatture_ricevute → scadenze
--   e diventa possibile sapere quale merce ricevuta non e' ancora fatturata
--   (il rateo passivo di fine anno, oggi ricostruito a mano dal commercialista).
--
-- ON DELETE SET NULL: cancellare un ordine non deve mai far sparire una
-- fattura, che e' un documento fiscale. Il legame si perde, il documento resta.
alter table public.fatture_ricevute
  add column if not exists purchase_order_id uuid
    references public.purchase_orders(id) on delete set null;

comment on column public.fatture_ricevute.purchase_order_id is
  'Ordine d''acquisto che questa fattura sta fatturando. Confermato, non suggerito: order_id_suggerito resta la proposta dell''AI sulla commessa.';

-- Ricerca tipica: "quali fatture ho per questo ordine?" — parziale perche'
-- la stragrande maggioranza delle righe non avra' un ordine collegato.
create index if not exists idx_fatture_ricevute_purchase_order
  on public.fatture_ricevute (purchase_order_id)
  where purchase_order_id is not null;
