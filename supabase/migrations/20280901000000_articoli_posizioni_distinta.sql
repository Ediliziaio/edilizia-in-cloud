-- ============================================================================
-- Distinta dentro l'articolo di commessa (abaco serramenti).
--
-- "1 finestra 2 ante 1000x1000, 2 finestre 2 ante 1500x1500, 1 portafinestra":
-- oggi ogni misura e' un articolo a se'. Il ripiego naturale — un articolo
-- solo con le posizioni scritte nella descrizione — perdeva i pezzi due volte:
-- la descrizione e' troncata a una riga in lista e NON viene passata all'OdA,
-- quindi il fornitore riceveva "Fornitura serramenti x4" senza le misure.
--
-- Qui nasce il posto giusto: order_items.posizioni, un array JSON di righe
--   { "descrizione": "2 ante", "misure": "1000x1000", "quantita": 1 }
-- La UI le mostra sotto il nome, la quantita' dell'articolo e' la somma, e
-- alla creazione dell'OdA (o della RDO) ogni posizione diventa una riga sua:
-- il fornitore vede l'abaco, come su un ordine vero.
--
-- JSONB e non tabella figlia, per scelta: le posizioni vivono e muoiono con
-- l'articolo (niente join, niente RLS in piu' — valgono le policy di
-- order_items), non hanno stati propri e non vengono interrogate da sole.
-- NULL = articolo senza distinta: tutto il pregresso resta com'e'.
-- ============================================================================

ALTER TABLE public.order_items
  ADD COLUMN IF NOT EXISTS posizioni jsonb;

COMMENT ON COLUMN public.order_items.posizioni IS
  'Distinta/abaco: array di {descrizione, misure, quantita}. NULL = senza distinta. Ogni posizione diventa una riga OdA/RDO.';
