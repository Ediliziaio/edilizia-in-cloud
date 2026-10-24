-- ════════════════════════════════════════════════════════════════════════════
-- AI: i registri dei costi accettano il «contesto di sistema»
-- ════════════════════════════════════════════════════════════════════════════
-- Il triage delle email (email-triage-ai) chiama il router AI senza un utente
-- vero: il router vuole comunque un userId non vuoto (guardProviderRequest), e
-- chi chiama passa l'UUID tutto zeri «system context». Poi il router scrive il
-- costo in ai_call_ledger (RPC charge_ai_call) e in ai_router_usage_log, e
-- user_id ha una chiave esterna verso auth.users: lo zero-UUID non esiste, la
-- scrittura fallisce e il router blocca la risposta «per non lasciare un uso
-- AI non fatturato» (AiRouterBillingError). Il 24/10/2026 alle 11:16: 12
-- chiamate bloccate in un giro, e per ogni azienda con la carta registrata.
--
-- Nei due registri l'utente assente si scrive NULL (colonna nullable; 2.088 e
-- 1.966 righe già così, ON DELETE SET NULL). Un trigger converte lo zero-UUID
-- in NULL all'inserimento: vale per ogni punto di scrittura (la RPC e gli
-- insert diretti del router) senza toccare il codice del router, che è di tutte
-- le funzioni AI. Il costo resta addebitato all'azienda: cambia solo l'utente.
--
-- Solo schema: nessuna riga esistente viene toccata. Idempotente.
-- ════════════════════════════════════════════════════════════════════════════

SET LOCAL lock_timeout = '3s';
SET LOCAL statement_timeout = '60s';

CREATE OR REPLACE FUNCTION public.ai_registro_utente_di_sistema()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
begin
  if new.user_id = '00000000-0000-0000-0000-000000000000'::uuid then
    new.user_id := null;
  end if;
  return new;
end;
$function$;

-- Le funzioni di trigger non hanno bisogno di EXECUTE.
REVOKE ALL ON FUNCTION public.ai_registro_utente_di_sistema() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS ai_call_ledger_utente_di_sistema ON public.ai_call_ledger;
CREATE TRIGGER ai_call_ledger_utente_di_sistema
  BEFORE INSERT OR UPDATE OF user_id ON public.ai_call_ledger
  FOR EACH ROW EXECUTE FUNCTION public.ai_registro_utente_di_sistema();

DROP TRIGGER IF EXISTS ai_router_usage_log_utente_di_sistema ON public.ai_router_usage_log;
CREATE TRIGGER ai_router_usage_log_utente_di_sistema
  BEFORE INSERT OR UPDATE OF user_id ON public.ai_router_usage_log
  FOR EACH ROW EXECUTE FUNCTION public.ai_registro_utente_di_sistema();
