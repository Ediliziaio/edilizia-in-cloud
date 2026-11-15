-- Riepilogo commesse: il catalogo dei riquadri si allarga al fatturato, al pregresso e alle
-- commesse generali (appalti, sviluppo immobiliare e compravendita). I numeri delle generali
-- arrivano da cruscotto_commesse_generali, che li dà già filtrati per permesso.
-- Solo il vincolo cambia: tabella e funzione di salvataggio restano quelle di 20290329100000.

alter table public.company_riepilogo_commesse drop constraint if exists riepilogo_commesse_riquadri;
alter table public.company_riepilogo_commesse add constraint riepilogo_commesse_riquadri check (
  cardinality(riquadri) between 1 and 4
  and riquadri <@ array[
    'commesse', 'venduto', 'incassato', 'da_incassare', 'ticket_medio', 'costi', 'margine',
    'aperte', 'in_ritardo', 'assistenza', 'completate', 'fatturato', 'pregresso',
    'appalti_valore', 'appalti_da_eseguire', 'appalti_da_incassare', 'appalti_margine',
    'unita_vendute', 'unita_libere', 'operazioni_venduto', 'operazioni_incassato',
    'capitale_impegnato', 'operazioni_margine'
  ]::text[]);
