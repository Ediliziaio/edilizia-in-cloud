-- FV — prezzo di vendita libero in configurazione manuale (stile Reonic).
-- Il commerciale compone l'impianto (pannello/inverter/accumulo) e poi può
-- fissare un PREZZO DI VENDITA a corpo: quel valore diventa il prezzo finale
-- (imponibile), sostituisce la somma delle righe e BYPASSA lo sconto commerciale.
-- Le righe fv_componenti_progetto restano per la scheda tecnica del PDF e il
-- loro NETTO alimenta comunque costo_totale_netto (→ margine reale).
-- null / 0 = prezzo calcolato automaticamente dai componenti (comportamento storico).

ALTER TABLE public.fv_progetti
  ADD COLUMN IF NOT EXISTS prezzo_vendita_manuale numeric;

COMMENT ON COLUMN public.fv_progetti.prezzo_vendita_manuale IS
  'Prezzo di vendita libero (imponibile, IVA esclusa) impostato dal commerciale in configurazione manuale. Se > 0 sostituisce la somma delle righe e bypassa lo sconto; le righe restano per dettaglio tecnico e costo/margine. NULL = calcolo automatico dal listino.';
