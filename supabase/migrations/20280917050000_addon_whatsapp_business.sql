-- Add-on WhatsApp Business (Meta) — 15/09/2026
--
-- Collegare i numeri WhatsApp Business costa 30 €/mese come add-on ed è
-- incluso nei piani da 247 €/mese in su (Pro ed Enterprise); il super admin
-- può sbloccarlo a mano per un'azienda. Chi può usarlo lo decide un posto
-- solo: la chiave "whatsapp" del feature gating (resolve_company_feature),
-- letta dall'app e dalle edge function (_shared/whatsappAddon.ts).
--
-- 1. Trigger degli override. Ricalcolava is_enabled da access_level a ogni
--    scrittura, e access_level vale 'enabled' di default: chi scriveva solo
--    is_enabled (l'interruttore della scheda azienda, i pacchetti, i bundle)
--    veniva ignorato in silenzio, e spegnere una funzione non la spegneva.
--    Ora conta il campo cambiato davvero. Solo per gli override: i default dei
--    piani tengono il trigger di prima (lì is_enabled ha default false, e un
--    insert col solo access_level va letto com'è).
-- 2. La chiave "whatsapp" diventa a pagamento: default spento, 30 €/mese.
-- 3. Piani: incluso da 247 €/mese; negli altri resta visibile come «Demo»,
--    con l'offerta dell'add-on.
-- 4. Sblocchi: Il Bagno Group gratis (decisione di Florin) e l'azienda della
--    piattaforma, che usa i suoi numeri per notifiche e outreach.

SET LOCAL lock_timeout = '3s';
SET LOCAL statement_timeout = '60s';

-- ── 1. Trigger degli override ─────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.sync_override_is_enabled_access_level()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public', 'pg_temp'
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    -- Insert col solo is_enabled=false: access_level è rimasto al default.
    IF NEW.is_enabled IS FALSE AND NEW.access_level = 'enabled' THEN
      NEW.access_level := 'disabled';
    END IF;
  ELSIF NEW.access_level IS NOT DISTINCT FROM OLD.access_level
    AND NEW.is_enabled IS DISTINCT FROM OLD.is_enabled
    AND NEW.is_enabled IS NOT NULL THEN
    -- Update del solo is_enabled: access_level lo segue.
    NEW.access_level := (CASE WHEN NEW.is_enabled THEN 'enabled' ELSE 'disabled' END)::public.feature_access_level;
  END IF;
  -- In ogni altro caso vince access_level, come prima.
  NEW.is_enabled := (NEW.access_level = 'enabled');
  RETURN NEW;
END
$$;

REVOKE ALL ON FUNCTION public.sync_override_is_enabled_access_level() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_cfo_sync_is_enabled ON public.company_feature_overrides;
CREATE TRIGGER trg_cfo_sync_is_enabled
  BEFORE INSERT OR UPDATE ON public.company_feature_overrides
  FOR EACH ROW EXECUTE FUNCTION public.sync_override_is_enabled_access_level();

-- ── 2. La chiave "whatsapp" diventa un add-on ─────────────────────────────
UPDATE public.platform_feature_flags
   SET default_value   = false,
       price_per_month = 30,
       plans_included  = ARRAY['pro', 'enterprise']::text[],
       description     = 'Numeri WhatsApp Business collegati a Meta: messaggi, broadcast, notifiche e risposte. Add-on da 30 €/mese, incluso nei piani da 247 €/mese.'
 WHERE key = 'whatsapp';

-- ── 3. Piani ──────────────────────────────────────────────────────────────
INSERT INTO public.plan_feature_defaults (plan_id, feature_key, access_level, is_enabled, notes)
SELECT sp.id,
       'whatsapp',
       (CASE WHEN sp.price_monthly >= 247 THEN 'enabled' ELSE 'preview' END)::public.feature_access_level,
       COALESCE(sp.price_monthly >= 247, false),
       CASE WHEN sp.price_monthly >= 247
            THEN 'WhatsApp Business incluso (piano da 247 €/mese in su)'
            ELSE 'WhatsApp Business: add-on a pagamento' END
  FROM public.subscription_plans sp
ON CONFLICT (plan_id, feature_key) DO UPDATE
   SET access_level = EXCLUDED.access_level,
       is_enabled   = EXCLUDED.is_enabled,
       notes        = EXCLUDED.notes;

-- ── 4. Sblocchi del super admin ───────────────────────────────────────────
INSERT INTO public.company_feature_overrides
       (company_id, feature_key, access_level, is_enabled, override_reason, notes)
SELECT c.id, 'whatsapp', 'enabled', true, s.motivo, s.nota
  FROM (VALUES
         ('acfc59e3-ad4e-40a7-b0f5-e006f7341508'::uuid,
          'Sbloccato gratis dal super admin',
          'Il Bagno Group: add-on WhatsApp Business regalato, decisione di Florin del 15/09/2026.'),
         ('00000000-0000-0000-0000-000000000001'::uuid,
          'Azienda della piattaforma',
          'Platform Admin CRM: numeri della piattaforma per notifiche e outreach, fuori dall''add-on.')
       ) AS s(azienda, motivo, nota)
  JOIN public.companies c ON c.id = s.azienda
ON CONFLICT (company_id, feature_key) DO UPDATE
   SET access_level    = 'enabled',
       is_enabled      = true,
       expires_at      = NULL,
       override_reason = EXCLUDED.override_reason,
       notes           = EXCLUDED.notes,
       updated_at      = now();

-- ── Controllo: se l'esito non è quello deciso, la migrazione non passa ────
DO $$
DECLARE
  v record;
  livello text;
BEGIN
  -- resolve_company_feature come la chiamano le edge function (chiave di servizio).
  PERFORM set_config('request.jwt.claims', '{"role":"service_role"}', true);
  FOR v IN
    SELECT s.azienda, s.atteso, s.nome
      FROM (VALUES
             ('acfc59e3-ad4e-40a7-b0f5-e006f7341508'::uuid, 'enabled', 'Il Bagno Group'),
             ('00000000-0000-0000-0000-000000000001'::uuid, 'enabled', 'Platform Admin CRM'),
             ('7ae0749c-5832-4523-953b-8ef59a7aba2a'::uuid, 'enabled', 'Bagni Milano (Pro)'),
             ('f2a16dd8-36c3-4d92-8d78-267d6374dcb5'::uuid, 'preview', 'Renova (127 €/mese)')
           ) AS s(azienda, atteso, nome)
      JOIN public.companies c ON c.id = s.azienda
  LOOP
    SELECT r.access_level::text INTO livello
      FROM public.resolve_company_feature(v.azienda, 'whatsapp') r;
    IF livello IS DISTINCT FROM v.atteso THEN
      RAISE EXCEPTION 'Add-on WhatsApp: % risulta %, atteso %', v.nome, livello, v.atteso;
    END IF;
  END LOOP;
END
$$;
