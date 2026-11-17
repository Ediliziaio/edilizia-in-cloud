-- «Ordina entro»: l'anticipo tipico del materiale quando il fornitore non lo dice (17/11/2026).
--
-- Il fabbisogno dei materiali calcola «ordina entro» = data in cui serve (o inizio della fase) meno
-- i giorni di consegna: quelli del fornitore, altrimenti quelli predefiniti dell'azienda, altrimenti
-- 7. Un serramento su misura senza fornitore risultava «da ordinare 7 giorni prima della posa»; ne
-- servono 8-12 settimane dal rilievo. Ora, fra il fornitore e il valore dell'azienda, conta l'anticipo
-- tipico del tipo di materiale (su misura e macchine). Il fornitore, quando lo dice, vince sempre.

CREATE OR REPLACE FUNCTION public.materiale_anticipo_tipico(p_nome text)
 RETURNS integer
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'public'
AS $function$
  select case
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

-- Il resto di _materiali_riconciliazione_righe resta com'è: si cambia solo la riga dei giorni di
-- consegna, sul testo attuale della funzione (idempotente: se è già cambiata non fa niente).
DO $$
DECLARE
  d text := pg_get_functiondef('public._materiali_riconciliazione_righe(uuid, uuid)'::regprocedure);
  vecchio constant text := 'coalesce(nullif(s.lead_time_days, 0), imp.giorni_consegna_predefiniti, 7) as giorni_consegna';
  nuovo constant text := 'coalesce(nullif(s.lead_time_days, 0), public.materiale_anticipo_tipico(r.name), imp.giorni_consegna_predefiniti, 7) as giorni_consegna';
BEGIN
  IF position(nuovo in d) > 0 THEN
    RETURN;
  END IF;
  IF position(vecchio in d) = 0 THEN
    RAISE EXCEPTION '_materiali_riconciliazione_righe: la riga dei giorni di consegna non è quella attesa';
  END IF;
  EXECUTE replace(d, vecchio, nuovo);
END $$;
