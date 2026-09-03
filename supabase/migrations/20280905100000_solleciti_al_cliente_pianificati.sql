-- ════════════════════════════════════════════════════════════════════════════
-- Ondata 5.6 — i solleciti al cliente in ritardo
-- ════════════════════════════════════════════════════════════════════════════
--
-- L'impianto c'era già tutto: `dunning_policies` con gli intervalli e i canali
-- per passo, `dunning_actions` per le azioni, `dunning_email_templates` con i
-- testi, e perfino uno strumento dell'assistente
-- (`silvio_tool_pianifica_dunning_step`). Tre aziende hanno una politica
-- attiva con step_days [0, 7, 15, 30, 45].
--
-- `dunning_actions` ha zero righe. Da sempre. Nessuno la scrive: né `src/`, né
-- una edge function, né un cron. `process-dunning` — che gira ogni giorno —
-- lavora su `subscription_invoices`, cioè sugli abbonamenti alla piattaforma,
-- non sulle fatture che le aziende emettono ai loro clienti. Sono due cose con
-- lo stesso nome.
--
-- Nel frattempo, solo nell'azienda demo, ci sono 188 fatture scadute con un
-- residuo aperto.
--
-- ── Cosa fa questa funzione, e cosa NON fa ─────────────────────────────────
-- Decide chi è in ritardo e a che passo del sollecito è arrivato, e scrive
-- l'azione in `dunning_actions` con `executed_at` NULL. Non manda niente.
--
-- Non è timidezza: accendere l'invio oggi significherebbe spedire centottanta
-- solleciti su fatture ferme dal 2024. Chi conosce quei clienti deve poter
-- guardare la coda prima che parta. L'invio è un passo separato, e deliberato.

-- Due azioni per lo stesso passo della stessa fattura non devono esistere:
-- l'idempotenza dev'essere un vincolo, non una buona intenzione.
CREATE UNIQUE INDEX IF NOT EXISTS ux_dunning_actions_fattura_passo
  ON public.dunning_actions (invoice_id, step_n)
  WHERE invoice_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.dunning_pianifica(
  p_company_id uuid DEFAULT NULL,
  p_max        integer DEFAULT 500
)
RETURNS TABLE(company_id uuid, azioni_create integer, fatture_valutate integer, nota text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  pol record;
  v_create int;
  v_viste  int;
  v_passi  int;
BEGIN
  IF p_company_id IS NOT NULL AND public.user_can_access_company(p_company_id) IS NOT TRUE THEN
    RAISE EXCEPTION 'Accesso negato' USING ERRCODE = '42501';
  END IF;

  FOR pol IN
    SELECT dp.* FROM public.dunning_policies dp
     WHERE dp.enabled IS TRUE
       AND (p_company_id IS NULL OR dp.company_id = p_company_id)
  LOOP
    -- I passi sono tanti quanti i canali definiti: step_days ne dichiara cinque
    -- ma preferred_channels ne descrive quattro, e un passo senza canale non è
    -- un passo. Si prende il minimo dei due invece di inventare.
    v_passi := least(
      coalesce(array_length(pol.step_days, 1), 0),
      (SELECT count(*)::int FROM jsonb_object_keys(coalesce(pol.preferred_channels, '{}'::jsonb)) k
        WHERE k LIKE 'step\_%'));

    IF v_passi = 0 THEN
      company_id := pol.company_id; azioni_create := 0; fatture_valutate := 0;
      nota := 'politica senza passi utilizzabili: step_days o preferred_channels vuoti';
      RETURN NEXT; CONTINUE;
    END IF;

    WITH scadute AS (
      SELECT i.id, i.company_id, i.client_id, i.client_email, i.due_date,
             coalesce(i.total, 0)
               - coalesce(i.paid_amount, 0)
               - coalesce((SELECT sum(coalesce(nc.total, 0)) FROM public.invoices nc
                            WHERE nc.credited_invoice_id = i.id
                              AND nc.document_type = 'credit_note'
                              AND nc.deleted_at IS NULL), 0) AS residuo,
             (CURRENT_DATE - i.due_date) AS giorni
        FROM public.invoices i
       WHERE i.company_id = pol.company_id
         AND i.deleted_at IS NULL
         AND coalesce(i.document_type, 'invoice') = 'invoice'
         AND coalesce(i.status, '') <> 'paid'
         AND i.due_date IS NOT NULL
         AND i.due_date <= CURRENT_DATE
    ),
    aperte AS (
      SELECT * FROM scadute WHERE residuo > 0
    ),
    -- Il passo dovuto è l'ultimo il cui intervallo è già trascorso.
    con_passo AS (
      SELECT a.*,
             (SELECT max(n) FROM generate_series(1, v_passi) n
               WHERE a.giorni >= pol.step_days[n]) AS passo
        FROM aperte a
    ),
    da_creare AS (
      SELECT c.*,
             coalesce(
               nullif(pol.preferred_channels -> ('step_' || c.passo) ->> 0, ''),
               'email') AS canale_voluto
        FROM con_passo c
       WHERE c.passo IS NOT NULL
         AND NOT EXISTS (SELECT 1 FROM public.dunning_actions da
                          WHERE da.invoice_id = c.id AND da.step_n = c.passo)
       ORDER BY c.giorni DESC
       LIMIT p_max
    )
    INSERT INTO public.dunning_actions (
      company_id, invoice_id, customer_id, step_n, scheduled_at, channel, ai_tone
    )
    SELECT
      -- customer_id resta NULL, e non è una dimenticanza:
      --   invoices.client_id          -> marketing_contacts(id)
      --   dunning_actions.customer_id -> profiles(id)
      -- Le due tabelle sono state disegnate su due modelli di cliente diversi
      -- e non si incontrano mai: su 201 fatture con client_id, zero
      -- corrispondono a un profilo. Scriverci dentro il contatto CRM
      -- violerebbe la chiave esterna. Il cliente lo identifica la fattura.
      d.company_id, d.id, NULL::uuid, d.passo,
      (d.due_date + pol.step_days[d.passo])::timestamptz,
      CASE
        -- Un canale disattivato in politica non si usa: si ripiega sull'email.
        WHEN d.canale_voluto = 'voice'        AND pol.enable_auto_voice_call IS NOT TRUE THEN 'email'
        WHEN d.canale_voluto = 'letter_legal' AND pol.enable_legal_letter    IS NOT TRUE THEN 'email'
        -- Senza un indirizzo non è un invio automatico: è un promemoria per una persona.
        WHEN d.canale_voluto = 'email' AND coalesce(d.client_email, '') = ''             THEN 'manual'
        ELSE d.canale_voluto
      END,
      (ARRAY['gentile','formale','fermo','urgente','finale'])[least(d.passo, 5)]
    FROM da_creare d
    ON CONFLICT DO NOTHING;

    GET DIAGNOSTICS v_create = ROW_COUNT;
    SELECT count(*)::int INTO v_viste FROM public.invoices i
     WHERE i.company_id = pol.company_id AND i.deleted_at IS NULL
       AND coalesce(i.document_type,'invoice') = 'invoice'
       AND coalesce(i.status,'') <> 'paid'
       AND i.due_date IS NOT NULL AND i.due_date <= CURRENT_DATE;

    company_id := pol.company_id;
    azioni_create := v_create;
    fatture_valutate := v_viste;
    nota := format('%s passi in politica; le azioni restano da eseguire (executed_at NULL): nessun messaggio è stato inviato', v_passi);
    RETURN NEXT;
  END LOOP;
END $function$;

COMMENT ON FUNCTION public.dunning_pianifica(uuid, integer) IS
  'Decide chi è in ritardo e a che passo del sollecito è arrivato, e lo scrive in dunning_actions con executed_at NULL. Non invia nulla: l''invio è un passo separato e deliberato.';

REVOKE ALL ON FUNCTION public.dunning_pianifica(uuid, integer) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.dunning_pianifica(uuid, integer) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.dunning_pianifica(uuid, integer) TO service_role;
