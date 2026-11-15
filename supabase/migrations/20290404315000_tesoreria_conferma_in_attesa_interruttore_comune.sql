-- Tesoreria: niente interruttore proprio per la conferma automatica (15/11/2026).
-- Decisione del titolare: il collegamento automatico ha UN interruttore per azienda, comune a
-- tutti i collegamenti (acquisti, banca, …), spento di base; lo costruisce la sessione Acquisti
-- fra i componenti comuni. Acceso: l'esito «unico e verificato» si collega da solo; spento: lo
-- stesso esito è una proposta da confermare con un clic.
-- Quindi: si toglie la tabella tesoreria_conferma_automatica (creata poco prima, accesa solo su
-- Demo Azienda 2 per una prova e già spenta) e la sua funzione di impostazione. Il giro
-- tesoreria_conferma_automatica resta e risponde «spento» finché non legge l'interruttore comune;
-- private.tes_conferma_una (la conferma di un singolo esito, con i controlli) resta pronta.
SET LOCAL lock_timeout='3s';
SET LOCAL statement_timeout='60s';

CREATE OR REPLACE FUNCTION public.tesoreria_conferma_automatica(p_company uuid,p_limite int DEFAULT 50) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF coalesce(auth.role(),'')<>'service_role' THEN PERFORM private.bank_operativa_access(p_company,true); END IF;
 RETURN jsonb_build_object('attiva',false,'motivo','In attesa dell''interruttore comune del collegamento automatico','confermati','[]'::jsonb,'errori','[]'::jsonb);
END $$;
REVOKE ALL ON FUNCTION public.tesoreria_conferma_automatica(uuid,int) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.tesoreria_conferma_automatica(uuid,int) TO authenticated,service_role;

DROP FUNCTION IF EXISTS public.tesoreria_imposta_conferma_automatica(uuid,boolean,text[],uuid);
DROP TABLE IF EXISTS public.tesoreria_conferma_automatica;

NOTIFY pgrst,'reload schema';
