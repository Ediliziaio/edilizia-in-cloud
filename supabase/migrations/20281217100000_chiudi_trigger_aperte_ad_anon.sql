-- Tre funzioni di trigger erano eseguibili da anon (e da PUBLIC).
--
-- `v_funzioni_aperte_ad_anon` le dava per `NON CLASSIFICATA: da chiudere o da
-- motivare`, cioè il caso che la vista esiste per scoprire: funzioni nuove
-- rimaste aperte per sbaglio. Sono funzioni di trigger — ritornano `trigger` e
-- sono agganciate a warehouse_movements e support_messages — e per quelle il
-- privilegio EXECUTE non viene nemmeno controllato allo scatto: il GRANT non
-- serviva a niente e toglierlo non cambia il comportamento dei trigger.

REVOKE ALL ON FUNCTION public.magazzino_annota_rincaro() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.magazzino_valorizza_medio() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.notifica_messaggio_assistenza() FROM PUBLIC, anon, authenticated;

COMMENT ON FUNCTION public.magazzino_annota_rincaro() IS
  'Trigger su warehouse_movements. Nessun EXECUTE: i trigger non lo controllano.';
COMMENT ON FUNCTION public.magazzino_valorizza_medio() IS
  'Trigger su warehouse_movements. Nessun EXECUTE: i trigger non lo controllano.';
COMMENT ON FUNCTION public.notifica_messaggio_assistenza() IS
  'Trigger su support_messages. Nessun EXECUTE: i trigger non lo controllano.';
