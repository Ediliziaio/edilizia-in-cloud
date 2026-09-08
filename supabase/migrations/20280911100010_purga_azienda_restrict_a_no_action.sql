-- Quinta natura di ostacolo alla purga (vedi …008): FK `ON DELETE RESTRICT`
-- fra tabelle che discendono ENTRAMBE da `companies`.
--
-- RESTRICT e NO ACTION sembrano sinonimi e non lo sono: RESTRICT e' verificato
-- SUBITO, NO ACTION a fine istruzione. Dentro il cascade di un'azienda le due
-- tabelle vengono cancellate nella stessa DELETE, ma l'ordine fra tabelle
-- sorelle non e' garantito: se tocca prima al fornitore, il RESTRICT degli
-- ordini d'acquisto scatta anche se quegli ordini stanno per sparire un
-- istante dopo. NO ACTION guarda alla fine, quando entrambi i lati sono gia'
-- spariti, e lascia passare.
--
-- Nessuna protezione viene tolta. Per l'utente che prova a cancellare un
-- fornitore con ordini aperti, o un tipo di impianto usato a listino, il
-- risultato resta lo stesso di prima: errore. Cambia solo il momento del
-- controllo. Anche il commento originale su tipi_impianto/tipi_intervento
-- ("B2 — FK ON DELETE RESTRICT + soft delete") resta valido.
--
-- Nove delle undici RESTRICT del database avevano gia' la sorgente dentro la
-- discendenza di `companies`. Le due che non ce l'avevano sono a parte:
-- `fea_audit_log` sta in …012, e `aedix_service_clients` e' qui sotto.

SET LOCAL lock_timeout = '3s';
SET LOCAL statement_timeout = '60s';

ALTER TABLE public.purchase_orders               DROP CONSTRAINT IF EXISTS purchase_orders_supplier_id_fkey;
ALTER TABLE public.purchase_orders               ADD  CONSTRAINT purchase_orders_supplier_id_fkey                                FOREIGN KEY (supplier_id) REFERENCES public.suppliers(id);
ALTER TABLE public.order_variable_compensations  DROP CONSTRAINT IF EXISTS order_variable_compensations_beneficiary_id_fkey;
ALTER TABLE public.order_variable_compensations  ADD  CONSTRAINT order_variable_compensations_beneficiary_id_fkey                FOREIGN KEY (beneficiary_id) REFERENCES public.compensation_beneficiaries(id);
ALTER TABLE public.compensation_settlement_items DROP CONSTRAINT IF EXISTS compensation_settlement_items_order_variable_compensation__fkey;
ALTER TABLE public.compensation_settlement_items ADD  CONSTRAINT compensation_settlement_items_order_variable_compensation__fkey FOREIGN KEY (order_variable_compensation_id) REFERENCES public.order_variable_compensations(id);
ALTER TABLE public.eic_tabelle_finanziamento     DROP CONSTRAINT IF EXISTS eic_tabelle_finanziamento_finanziaria_id_fkey;
ALTER TABLE public.eic_tabelle_finanziamento     ADD  CONSTRAINT eic_tabelle_finanziamento_finanziaria_id_fkey                   FOREIGN KEY (finanziaria_id) REFERENCES public.eic_finanziarie(id);
ALTER TABLE public.listino_prezzi                DROP CONSTRAINT IF EXISTS listino_prezzi_tipo_impianto_id_fkey;
ALTER TABLE public.listino_prezzi                ADD  CONSTRAINT listino_prezzi_tipo_impianto_id_fkey                            FOREIGN KEY (tipo_impianto_id) REFERENCES public.tipi_impianto(id);
ALTER TABLE public.listino_prezzi                DROP CONSTRAINT IF EXISTS listino_prezzi_tipo_intervento_id_fkey;
ALTER TABLE public.listino_prezzi                ADD  CONSTRAINT listino_prezzi_tipo_intervento_id_fkey                          FOREIGN KEY (tipo_intervento_id) REFERENCES public.tipi_intervento(id);
ALTER TABLE public.meta_ads                      DROP CONSTRAINT IF EXISTS meta_ads_creative_id_fkey;
ALTER TABLE public.meta_ads                      ADD  CONSTRAINT meta_ads_creative_id_fkey                                       FOREIGN KEY (creative_id) REFERENCES public.meta_creatives(id);
ALTER TABLE public.warehouse_transfers           DROP CONSTRAINT IF EXISTS warehouse_transfers_from_warehouse_id_fkey;
ALTER TABLE public.warehouse_transfers           ADD  CONSTRAINT warehouse_transfers_from_warehouse_id_fkey                      FOREIGN KEY (from_warehouse_id) REFERENCES public.warehouses(id);
ALTER TABLE public.warehouse_transfers           DROP CONSTRAINT IF EXISTS warehouse_transfers_to_warehouse_id_fkey;
ALTER TABLE public.warehouse_transfers           ADD  CONSTRAINT warehouse_transfers_to_warehouse_id_fkey                        FOREIGN KEY (to_warehouse_id) REFERENCES public.warehouses(id);

-- `aedix_service_clients.contact_id` e' NOT NULL: la riga non puo' esistere
-- senza il suo contatto, quindi quando il contatto se ne va deve andarsene
-- anche lei — non e' una scelta di prodotto, e' quello che dice lo schema.
-- Oggi la tabella e' vuota: era un blocco in attesa della prima riga.
ALTER TABLE public.aedix_service_clients         DROP CONSTRAINT IF EXISTS aedix_service_clients_contact_id_fkey;
ALTER TABLE public.aedix_service_clients         ADD  CONSTRAINT aedix_service_clients_contact_id_fkey                           FOREIGN KEY (contact_id) REFERENCES public.marketing_contacts(id) ON DELETE CASCADE;
