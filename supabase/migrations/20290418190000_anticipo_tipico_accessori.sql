-- «Ordina entro»: gli accessori non prendono l'anticipo della macchina a cui servono (17/11/2026).
--
-- materiale_anticipo_tipico (20290418170000) riconosce il tipo di materiale dalle parole del nome:
-- «Cavo di collegamento comando-fancoil» conteneva «fancoil» e risultava da ordinare 50 giorni
-- prima, come il ventilconvettore; così «Comando a filo per fancoil» e «Sonda di temperatura
-- bollitore». Un nome che COMINCIA con un accessorio (cavo, comando, sonda, tubo, raccordo, staffa,
-- valvola, kit, griglia, filtro…) non ha un anticipo tipico: vale quello del fornitore o
-- dell'azienda. Su tutto il database cambiano 4 nomi (prova del 17/11/2026).
-- Idempotente (CREATE OR REPLACE); permessi come prima.

CREATE OR REPLACE FUNCTION public.materiale_anticipo_tipico(p_nome text)
 RETURNS integer
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'public'
AS $function$
  select case
    when regexp_replace(n, '^\s*n\.?\s*\d+\s*', '') ~ '^(cavo|cavi|comando|comandi|sonda|sonde|tubo|tubi|tubazion|raccord|staff|support|valvol|kit |guarnizion|canalin|scarico|termostat|cronotermostat|tassell|vit[ei] |nastro|collar|morsett|interruttor|cablaggio|minuteria|griglia|griglie|bocchett|plenum|filtro|filtri|guaina|telecomando)' then null
    when n ~ '(serrament|finestr|portafinestr|infiss|vetrat|avvolgibil|tapparell|persian|oscurant|scuri|cassonett|zanzarier|portoncin|porta blindat)' then 70
    when n ~ '(pompa di calore|pompe di calore|caldai|chiller|bollitor|vmc|recuperator|unita di ventilazion|ventilconvett|fancoil|fan coil|deumidificator)' then 50
    when n ~ '(inverter|batteri|accumulo|modul[io] fotovolt|pannell[io] fotovolt)' then 45
    when n ~ '(radiant|collettor)' then 35
    when n ~ '(travertin|marmo|granito|pietra|soglia|soglie|davanzal)' then 25
    when n ~ '(ascensor|montacaric|piattaforma elevatric)' then 90
    else null
  end
  from (select lower(translate(coalesce(p_nome, ''), 'àèéìòùÀÈÉÌÒÙ', 'aeeiouAEEIOU')) as n) x
$function$;

REVOKE ALL ON FUNCTION public.materiale_anticipo_tipico(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.materiale_anticipo_tipico(text) TO authenticated, service_role;
