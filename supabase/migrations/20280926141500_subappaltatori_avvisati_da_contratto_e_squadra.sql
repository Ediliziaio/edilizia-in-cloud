-- Subappaltatori: avvisati quando ricevono un lavoro da contratto o da squadra (26/09/2026).
--
-- L'app del campo mostra a un subappaltatore le commesse da quattro fonti
-- (src/lib/campo/assignments.ts): assegnazione diretta (order_campo_assignments),
-- manodopera (order_employees), contratto di subappalto attivo
-- (contratti_subappalto) e squadra esterna (order_external_teams). Solo la
-- prima avvisava («Nuovo cantiere: …») e aggiungeva alla chat di cantiere: chi
-- riceveva il lavoro con un contratto (26 contratti il 26/09) o come squadra
-- se ne accorgeva aprendo l'app, e in chat non c'era.
--
-- Stesso avviso e stessa chat, con le stesse funzioni dell'assegnazione
-- diretta (campo_notifica, che non ripete lo stesso avviso entro 12 ore;
-- add_user_to_order_channel):
-- - contratto che diventa attivo (anche creato già attivo, lo stato di serie),
--   o attivo che cambia commessa o subappaltatore → il login del subappaltatore
--   (subappaltatori.user_id);
-- - squadra esterna messa su una commessa → il capo squadra con login
--   (external_teams.leader_user_id) e il login del suo subappaltatore.
-- Non si avvisa chi ha fatto l'operazione, e niente per i contratti vecchi.
-- Un errore qui diventa un WARNING: non deve mai bloccare il salvataggio.

SET LOCAL lock_timeout = '3s';

CREATE OR REPLACE FUNCTION public.campo_avvisa_lavoro(p_company uuid, p_order uuid, p_user uuid, p_da uuid DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_code text; v_desc text; v_ind text;
BEGIN
  IF p_user IS NULL OR p_order IS NULL OR p_company IS NULL OR p_user = p_da THEN RETURN; END IF;
  SELECT o.order_code, left(coalesce(o.description, ''), 80), o.indirizzo_lavori
    INTO v_code, v_desc, v_ind
    FROM public.orders o WHERE o.id = p_order;
  PERFORM public.campo_notifica(p_company, p_user, 'campo_assegnazione',
    'Nuovo cantiere: ' || coalesce(v_code, 'un cantiere'),
    trim(both from concat_ws(' · ', nullif(v_desc, ''), nullif(v_ind, ''))),
    'order', p_order, '/campo/lavoro/' || p_order::text);
  PERFORM public.add_user_to_order_channel(p_order, p_user, p_company);
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'campo_avvisa_lavoro: %', SQLERRM;
END;
$$;

REVOKE ALL ON FUNCTION public.campo_avvisa_lavoro(uuid, uuid, uuid, uuid) FROM PUBLIC, anon, authenticated;

-- ─── Contratto di subappalto ────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.tg_contratto_subappalto_avvisa()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_user uuid;
BEGIN
  IF NEW.stato IS DISTINCT FROM 'attivo' OR NEW.order_id IS NULL OR NEW.subappaltatore_id IS NULL THEN
    RETURN NEW;
  END IF;
  -- Già attivo, stessa commessa e stesso subappaltatore: niente di nuovo.
  IF TG_OP = 'UPDATE' AND OLD.stato = 'attivo'
     AND OLD.order_id IS NOT DISTINCT FROM NEW.order_id
     AND OLD.subappaltatore_id IS NOT DISTINCT FROM NEW.subappaltatore_id THEN
    RETURN NEW;
  END IF;
  SELECT s.user_id INTO v_user
    FROM public.subappaltatori s
   WHERE s.id = NEW.subappaltatore_id AND coalesce(s.is_active, true);
  PERFORM public.campo_avvisa_lavoro(NEW.company_id, NEW.order_id, v_user, auth.uid());
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.tg_contratto_subappalto_avvisa() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_contratto_subappalto_avvisa ON public.contratti_subappalto;
CREATE TRIGGER trg_contratto_subappalto_avvisa
  AFTER INSERT OR UPDATE OF stato, order_id, subappaltatore_id ON public.contratti_subappalto
  FOR EACH ROW EXECUTE FUNCTION public.tg_contratto_subappalto_avvisa();

-- ─── Squadra esterna su una commessa ────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.tg_squadra_esterna_avvisa()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_company uuid; r record;
BEGIN
  SELECT o.company_id INTO v_company FROM public.orders o WHERE o.id = NEW.order_id;
  IF v_company IS NULL THEN RETURN NEW; END IF;
  FOR r IN
    SELECT DISTINCT x.uid FROM (
      SELECT t.leader_user_id AS uid FROM public.external_teams t WHERE t.id = NEW.external_team_id
      UNION
      SELECT s.user_id FROM public.external_teams t
        JOIN public.subappaltatori s ON s.id = t.subappaltatore_id AND coalesce(s.is_active, true)
       WHERE t.id = NEW.external_team_id
    ) x
    WHERE x.uid IS NOT NULL
  LOOP
    PERFORM public.campo_avvisa_lavoro(v_company, NEW.order_id, r.uid, auth.uid());
  END LOOP;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.tg_squadra_esterna_avvisa() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_squadra_esterna_avvisa ON public.order_external_teams;
CREATE TRIGGER trg_squadra_esterna_avvisa
  AFTER INSERT ON public.order_external_teams
  FOR EACH ROW EXECUTE FUNCTION public.tg_squadra_esterna_avvisa();
