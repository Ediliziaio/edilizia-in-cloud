-- Freno dei rimbalzi (24/09/2026): un flusso con più di 3 rimbalzi veri sulle
-- ultime 100 prime email va in pausa da solo, e al titolare arriva l'avviso.
--
-- Oltre il 3% di indirizzi inesistenti i provider mandano in spam anche le
-- email buone, e le caselle dei brand sono giovani. Le liste comprate (Excel
-- settori, aziende.it, export CRM) rimbalzano del 3,4-3,8% per indirizzo
-- nuovo: un flusso che scrive a una lista sporca va fermato prima che rovini la
-- reputazione di tutto il brand.
--
-- Come conta outreach_freno_rimbalzi():
--   • solo le PRIME email di quel flusso (primo_contatto): è lì che si scopre se
--     un indirizzo esiste. Vale anche il rifiuto del server all'invio;
--   • rimbalzo = iscrizione finita «bounced» dopo quell'email;
--   • più di 3 sulle ultime 100, o sulle ultime N se sono meno di 100: servono
--     comunque 4 rimbalzi, così uno sulle prime 20 email non ferma niente;
--   • da `freno_rimbalzi_da`, cioè da quando il freno guarda quel flusso (per i
--     flussi di oggi: da adesso) o dall'ultima volta che l'ha fermato. Chi
--     riattiva un flusso riparte da zero.
-- Il dispatcher la chiama a ogni giro, prima di spedire, e avvisa per ogni
-- flusso che ha fermato.
--
-- Con il freno un flusso in pausa non è più un caso raro, e il dispatcher non
-- lo reggeva: leggeva la coda di ogni brand per scadenza, e le righe di un
-- flusso in pausa (migliaia di primi contatti arretrati) riempivano il giro e
-- si prendevano le caselle, fermando anche gli altri flussi del brand.
-- outreach_coda_da_spedire() legge la coda senza le righe dei flussi e delle
-- iscrizioni in pausa, con lo stesso indice di prima.

SET LOCAL lock_timeout = '3s';
SET LOCAL statement_timeout = '60s';

-- Da quando il freno guarda il flusso. Il default riempie i flussi esistenti
-- con l'ora di adesso (valore stabile: niente riscrittura della tabella) e i
-- nuovi con la loro creazione.
ALTER TABLE public.outreach_sequences
  ADD COLUMN IF NOT EXISTS freno_rimbalzi_da timestamptz DEFAULT now();
COMMENT ON COLUMN public.outreach_sequences.freno_rimbalzi_da IS
  'Da quando il freno dei rimbalzi conta le prime email del flusso: la sua accensione (24/09/2026), la creazione del flusso o l''ultima volta che il freno l''ha fermato.';

-- Registro delle fermate: il perché di una pausa resta scritto.
CREATE TABLE IF NOT EXISTS public.outreach_freni_rimbalzi (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sequence_id uuid NOT NULL REFERENCES public.outreach_sequences(id) ON DELETE CASCADE,
  brand_id    uuid,
  fermato_at  timestamptz NOT NULL DEFAULT now(),
  prime_email integer NOT NULL,
  rimbalzi    integer NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_outreach_freni_rimbalzi_flusso
  ON public.outreach_freni_rimbalzi (sequence_id, fermato_at DESC);

ALTER TABLE public.outreach_freni_rimbalzi ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.outreach_freni_rimbalzi FROM anon;

DROP POLICY IF EXISTS outreach_freni_rimbalzi_super ON public.outreach_freni_rimbalzi;
CREATE POLICY outreach_freni_rimbalzi_super ON public.outreach_freni_rimbalzi
  FOR SELECT TO authenticated USING (is_super_admin());

DROP POLICY IF EXISTS blocco_utente_bloccato ON public.outreach_freni_rimbalzi;
CREATE POLICY blocco_utente_bloccato ON public.outreach_freni_rimbalzi
  AS RESTRICTIVE FOR ALL TO authenticated USING (NOT (SELECT utente_bloccato()));

CREATE OR REPLACE FUNCTION public.outreach_freno_rimbalzi(
  p_finestra integer DEFAULT 100,
  p_massimo  integer DEFAULT 3
) RETURNS TABLE (id_flusso uuid, nome_flusso text, id_brand uuid, prime integer, tornate integer)
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_da timestamptz;
  r    record;
BEGIN
  -- Meglio saltare un giro che fermare il dispatcher.
  PERFORM set_config('lock_timeout', '3s', true);

  SELECT min(coalesce(s.freno_rimbalzi_da, s.created_at)) INTO v_da
    FROM outreach_sequences s
   WHERE s.status = 'active';
  IF v_da IS NULL THEN
    RETURN;
  END IF;

  FOR r IN
    WITH invii AS (
      -- Prime email partite: sono le righe dell'indice parziale
      -- outreach_send_queue_primi_oggi_idx (primo_contatto, status 'sent').
      SELECT q.enrollment_id, q.sent_at AS t
        FROM outreach_send_queue q
       WHERE q.primo_contatto AND q.status = 'sent' AND q.sent_at >= v_da
      UNION ALL
      -- Prime email rifiutate dal server all'invio: l'iscrizione è già
      -- «bounced», la riga resta «skipped» e senza sent_at. Non quelle fermate
      -- dal linter dei testi, che non sono mai uscite.
      SELECT q.enrollment_id, q.updated_at
        FROM outreach_enrollments e
        JOIN outreach_send_queue q
          ON q.enrollment_id = e.id AND q.status = 'skipped' AND q.primo_contatto
       WHERE e.status = 'bounced' AND e.updated_at >= v_da
         AND coalesce(q.channel, 'email') = 'email'
         AND coalesce(q.last_error, '') NOT LIKE 'copy bloccata%'
    ), per_flusso AS (
      SELECT s.id, s.name, s.brand_id, e.status AS esito,
             row_number() OVER (PARTITION BY s.id ORDER BY i.t DESC) AS n
        FROM invii i
        JOIN outreach_enrollments e ON e.id = i.enrollment_id
        JOIN outreach_sequences s ON s.id = e.sequence_id AND s.status = 'active'
       WHERE i.t >= coalesce(s.freno_rimbalzi_da, s.created_at)
    )
    SELECT pf.id, pf.name, pf.brand_id,
           count(*)::int AS quante,
           count(*) FILTER (WHERE pf.esito = 'bounced')::int AS rimbalzate
      FROM per_flusso pf
     WHERE pf.n <= greatest(p_finestra, 1)
     GROUP BY pf.id, pf.name, pf.brand_id
    HAVING count(*) FILTER (WHERE pf.esito = 'bounced') > greatest(p_massimo, 0)
  LOOP
    UPDATE outreach_sequences s
       SET status = 'paused', freno_rimbalzi_da = now()
     WHERE s.id = r.id AND s.status = 'active';
    IF FOUND THEN
      INSERT INTO outreach_freni_rimbalzi (sequence_id, brand_id, prime_email, rimbalzi)
      VALUES (r.id, r.brand_id, r.quante, r.rimbalzate);
      id_flusso := r.id;
      nome_flusso := r.name;
      id_brand := r.brand_id;
      prime := r.quante;
      tornate := r.rimbalzate;
      RETURN NEXT;
    END IF;
  END LOOP;
END;
$$;

REVOKE ALL ON FUNCTION public.outreach_freno_rimbalzi(integer, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.outreach_freno_rimbalzi(integer, integer) TO service_role;

-- La coda dovuta di un brand (o delle righe senza brand, o di tutte), come la
-- leggeva il dispatcher, senza le righe dei flussi e delle iscrizioni in pausa.
CREATE OR REPLACE FUNCTION public.outreach_coda_da_spedire(
  p_primo  boolean,
  p_limite integer,
  p_brand  uuid DEFAULT NULL,
  p_modo   text DEFAULT 'brand'
) RETURNS SETOF public.outreach_send_queue
LANGUAGE plpgsql
STABLE
SET search_path = public
AS $$
DECLARE
  -- Pochi o nessuno: confrontati riga per riga sull'iscrizione (chiave
  -- primaria), non con un join su tutte le iscrizioni.
  v_ferme uuid[] := ARRAY(SELECT s.id FROM outreach_sequences s WHERE s.status IN ('paused', 'archived'));
  v_limite integer := greatest(coalesce(p_limite, 1), 1);
BEGIN
  IF p_modo = 'brand' THEN
    RETURN QUERY
      SELECT q.* FROM outreach_send_queue q
       WHERE q.status = 'queued' AND q.kind = 'send' AND q.channel = 'email'
         AND q.brand_id = p_brand AND q.primo_contatto = p_primo
         AND q.scheduled_for <= now()
         AND NOT EXISTS (SELECT 1 FROM outreach_enrollments e
                          WHERE e.id = q.enrollment_id
                            AND (e.status = 'paused' OR e.sequence_id = ANY (v_ferme)))
       ORDER BY q.scheduled_for
       LIMIT v_limite;
  ELSIF p_modo = 'senza_brand' THEN
    RETURN QUERY
      SELECT q.* FROM outreach_send_queue q
       WHERE q.status = 'queued' AND q.kind = 'send' AND q.channel = 'email'
         AND q.brand_id IS NULL AND q.primo_contatto = p_primo
         AND q.scheduled_for <= now()
         AND NOT EXISTS (SELECT 1 FROM outreach_enrollments e
                          WHERE e.id = q.enrollment_id
                            AND (e.status = 'paused' OR e.sequence_id = ANY (v_ferme)))
       ORDER BY q.scheduled_for
       LIMIT v_limite;
  ELSE
    RETURN QUERY
      SELECT q.* FROM outreach_send_queue q
       WHERE q.status = 'queued' AND q.kind = 'send' AND q.channel = 'email'
         AND q.primo_contatto = p_primo
         AND q.scheduled_for <= now()
         AND NOT EXISTS (SELECT 1 FROM outreach_enrollments e
                          WHERE e.id = q.enrollment_id
                            AND (e.status = 'paused' OR e.sequence_id = ANY (v_ferme)))
       ORDER BY q.scheduled_for
       LIMIT v_limite;
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.outreach_coda_da_spedire(boolean, integer, uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.outreach_coda_da_spedire(boolean, integer, uuid, text) TO service_role;
