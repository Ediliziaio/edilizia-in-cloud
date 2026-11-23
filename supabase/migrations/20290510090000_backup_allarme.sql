-- ════════════════════════════════════════════════════════════════════════════
-- Un backup che manca deve urlare, non comparire in un elenco (23/11/2026)
-- ════════════════════════════════════════════════════════════════════════════
-- Quattordici aziende sono rimaste senza una copia per quindici giorni —
-- Vulcano con 131 commesse, Renova, Bonarrigo, le Demo — e Consorzio Amalfi non
-- l'aveva mai avuta. L'avviso però C'ERA e ha funzionato: il rapporto del
-- mattino è partito tutte le mattine, quindici su quindici, e `ops_backup_mancanti`
-- legge lo storage dal vivo, non una fotografia vecchia. Ogni mattina l'elenco
-- era in quell'email.
--
-- Il difetto non era accorgersene: era COME lo diceva. Una riga fra i segnali
-- vitali della piattaforma, in mezzo a cron, code e metriche. Un backup che
-- manca merita il trattamento del credito AI finito: email dedicata col motivo
-- nell'oggetto, campanella, push, e promemoria finché non è risolto.
--
-- Qui c'è solo lo STATO, perché l'idempotenza e la cadenza stanno nel database
-- e non nel codice: due controlli in parallelo non mandano due email, e un
-- controllo che gira ogni ora non manda un'email all'ora.
--
-- `ops_backup_allarme` — un allarme aperto per volta (indice parziale), con
-- quando è cominciato, chi manca, quanti avvisi sono partiti e quando.
-- `ops_backup_allarme_controlla(giorni, ore_promemoria, anteprima)` — guarda,
-- apre, aggiorna, chiude, e dice al chiamante cosa deve spedire:
--   · «niente»   — tutte le aziende hanno una copia e non c'era nessun allarme;
--   · «avvisa»   — da spedire adesso (primo avviso o promemoria dovuto);
--   · «aspetta»  — allarme aperto ma l'ultimo avviso è troppo recente;
--   · «risolto»  — era aperto e adesso tutte le aziende hanno la copia.
-- Con `anteprima` non scrive niente: dice solo cosa farebbe.
--
-- Idempotente: CREATE TABLE IF NOT EXISTS su una tabella che non esiste
-- (verificato: zero righe in information_schema), indice e funzione con IF NOT
-- EXISTS / OR REPLACE.
-- ════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.ops_backup_allarme (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  aperto_il timestamptz NOT NULL DEFAULT now(),
  -- L'elenco dell'ultimo controllo, come lo dà ops_backup_mancanti().
  aziende jsonb NOT NULL DEFAULT '[]'::jsonb,
  ultima_vista timestamptz NOT NULL DEFAULT now(),
  ultima_notifica timestamptz,
  notifiche_inviate integer NOT NULL DEFAULT 0,
  chiuso_il timestamptz,
  chiuso_nota text
);

-- Un allarme aperto per volta: il secondo inserimento fallisce invece di
-- raddoppiare le email.
CREATE UNIQUE INDEX IF NOT EXISTS ops_backup_allarme_uno_aperto
  ON public.ops_backup_allarme ((chiuso_il IS NULL)) WHERE chiuso_il IS NULL;

ALTER TABLE public.ops_backup_allarme ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.ops_backup_allarme FROM PUBLIC, anon, authenticated;

COMMENT ON TABLE public.ops_backup_allarme IS
  'Lo stato dell''allarme «aziende senza backup»: un allarme aperto per volta, con quanti avvisi '
  'sono partiti e quando. La cadenza dei promemoria sta qui, non nel codice.';

CREATE OR REPLACE FUNCTION public.ops_backup_allarme_controlla(
  p_giorni integer DEFAULT 2,
  p_ore_promemoria integer DEFAULT 12,
  p_anteprima boolean DEFAULT false
) RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_mancanti jsonb := public.ops_backup_mancanti(greatest(p_giorni, 1));
  v_quante integer := jsonb_array_length(v_mancanti);
  v_ore integer := greatest(p_ore_promemoria, 1);
  v_aperto public.ops_backup_allarme;
  v_peggio integer;
BEGIN
  -- Il lock serializza due controlli in parallelo: solo uno prende in carico l'avviso.
  SELECT * INTO v_aperto FROM public.ops_backup_allarme WHERE chiuso_il IS NULL FOR UPDATE;

  IF v_quante = 0 THEN
    IF v_aperto.id IS NULL THEN
      RETURN jsonb_build_object('azione', 'niente', 'aziende', 0);
    END IF;
    IF p_anteprima THEN
      RETURN jsonb_build_object('azione', 'risolto', 'anteprima', true,
                                'aperto_il', v_aperto.aperto_il, 'aziende_prima', v_aperto.aziende);
    END IF;
    UPDATE public.ops_backup_allarme
       SET chiuso_il = now(), chiuso_nota = 'tutte le aziende hanno una copia'
     WHERE id = v_aperto.id;
    RETURN jsonb_build_object(
      'azione', 'risolto', 'allarme', v_aperto.id, 'aperto_il', v_aperto.aperto_il,
      'ore_aperto', round(extract(epoch FROM now() - v_aperto.aperto_il) / 3600),
      'aziende_prima', v_aperto.aziende, 'avvisi_mandati', v_aperto.notifiche_inviate);
  END IF;

  SELECT max((j->>'giorni_senza')::integer) INTO v_peggio FROM jsonb_array_elements(v_mancanti) j;

  -- Non c'era nessun allarme: si apre e si avvisa subito.
  IF v_aperto.id IS NULL THEN
    IF p_anteprima THEN
      RETURN jsonb_build_object('azione', 'avvisa', 'anteprima', true, 'primo', true,
                                'aziende', v_quante, 'giorni_peggiore', v_peggio, 'elenco', v_mancanti);
    END IF;
    INSERT INTO public.ops_backup_allarme (aziende, ultima_vista, ultima_notifica, notifiche_inviate)
    VALUES (v_mancanti, now(), now(), 1)
    RETURNING * INTO v_aperto;
    RETURN jsonb_build_object('azione', 'avvisa', 'primo', true, 'allarme', v_aperto.id,
                              'aziende', v_quante, 'giorni_peggiore', v_peggio, 'elenco', v_mancanti,
                              'aperto_il', v_aperto.aperto_il, 'avviso_numero', 1);
  END IF;

  -- Allarme già aperto: l'elenco si rinfresca sempre, l'avviso solo a cadenza.
  IF NOT p_anteprima THEN
    UPDATE public.ops_backup_allarme SET aziende = v_mancanti, ultima_vista = now() WHERE id = v_aperto.id;
  END IF;

  IF v_aperto.ultima_notifica IS NOT NULL
     AND v_aperto.ultima_notifica > now() - make_interval(hours => v_ore) THEN
    RETURN jsonb_build_object('azione', 'aspetta', 'allarme', v_aperto.id,
                              'aziende', v_quante, 'giorni_peggiore', v_peggio,
                              'prossimo_avviso', v_aperto.ultima_notifica + make_interval(hours => v_ore));
  END IF;

  IF p_anteprima THEN
    RETURN jsonb_build_object('azione', 'avvisa', 'anteprima', true, 'primo', false,
                              'aziende', v_quante, 'giorni_peggiore', v_peggio, 'elenco', v_mancanti);
  END IF;
  UPDATE public.ops_backup_allarme
     SET ultima_notifica = now(), notifiche_inviate = notifiche_inviate + 1
   WHERE id = v_aperto.id
  RETURNING * INTO v_aperto;
  RETURN jsonb_build_object('azione', 'avvisa', 'primo', false, 'allarme', v_aperto.id,
                            'aziende', v_quante, 'giorni_peggiore', v_peggio, 'elenco', v_mancanti,
                            'aperto_il', v_aperto.aperto_il, 'avviso_numero', v_aperto.notifiche_inviate);
END;
$function$;

REVOKE ALL ON FUNCTION public.ops_backup_allarme_controlla(integer, integer, boolean) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.ops_backup_allarme_controlla(integer, integer, boolean) TO service_role;

COMMENT ON FUNCTION public.ops_backup_allarme_controlla(integer, integer, boolean) IS
  'Guarda chi è senza backup, apre/aggiorna/chiude l''allarme e dice cosa spedire: '
  'niente | avvisa | aspetta | risolto. Con anteprima non scrive nulla.';
