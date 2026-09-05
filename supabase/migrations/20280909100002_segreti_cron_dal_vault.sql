-- Ventinove job su cinquantotto portavano il segreto `x-cron-secret` scritto in
-- chiaro dentro `cron.job.command`. Gli altri ventinove lo leggevano già dal
-- Vault: la metà buona del lavoro c'era, non è mai stata finita.
--
-- `cron.job` è una tabella come le altre: chiunque possa leggerla — un backup,
-- una connessione con troppi privilegi, un dump finito nel posto sbagliato — si
-- porta via la chiave che apre tutte le edge function interne.
--
-- Il valore non compare in questo file: viene letto dal comando del job stesso
-- e spostato nel Vault, così la migrazione si può committare senza esporre nulla.
--
-- Gli header non hanno una forma sola: alcuni job usano jsonb_build_object, altri
-- una stringa JSON costante, con e senza spazi dopo i due punti. Invece di
-- inseguire le varianti con una regex, la stringa costante viene interpretata
-- come JSON e ricostruita chiave per chiave: quello che non si riesce a leggere
-- fa fallire la migrazione invece di essere riscritto alla cieca.

DO $$
DECLARE
  r        RECORD;
  v_val    text;
  v_nome   text;
  v_nuovo  text;
  v_lit    text;
  v_coppie text;
  v_fatti  int := 0;
BEGIN
  FOR r IN
    SELECT jobid, jobname, command
      FROM cron.job
     WHERE command ~ 'cron-secret'
       AND command !~ 'decrypted_secret'
  LOOP
    -- Forma 1: jsonb_build_object('x-cron-secret', '<valore>')
    v_val  := substring(r.command from 'x-cron-secret''\s*,\s*''([0-9a-fA-F]{32,128})''');
    v_nome := NULL;

    IF v_val IS NOT NULL THEN
      SELECT name INTO v_nome FROM vault.decrypted_secrets WHERE decrypted_secret = v_val LIMIT 1;
      IF v_nome IS NULL THEN
        v_nome := 'proactive_cron_secret';
        IF EXISTS (SELECT 1 FROM vault.secrets WHERE name = v_nome) THEN
          RAISE EXCEPTION 'Il nome Vault % esiste già con un altro valore: fermarsi invece di sovrascrivere', v_nome;
        END IF;
        PERFORM vault.create_secret(v_val, v_nome,
          'Header x-cron-secret dei job pg_cron verso le edge function che leggono PROACTIVE_CRON_SECRET');
      END IF;

      -- Posizione di espressione: il letterale si sostituisce direttamente.
      v_nuovo := replace(
        r.command,
        '''' || v_val || '''',
        '(select decrypted_secret from vault.decrypted_secrets where name = ''' || v_nome || ''')'
      );
      PERFORM cron.alter_job(r.jobid, command => v_nuovo);
      v_fatti := v_fatti + 1;
      CONTINUE;
    END IF;

    -- Forma 2: headers := '{...}'::jsonb — il segreto è dentro una costante,
    -- sostituirlo lascerebbe testo. Si ricostruisce l'intero argomento.
    --
    -- Il JSON non contiene apici singoli, quindi il letterale si delimita con
    -- [^''] invece che con un quantificatore non goloso: in Postgres la
    -- golosità è un attributo dell'intera espressione, non del singolo pezzo,
    -- e un `.*?` dopo uno `\s*` torna goloso senza dirlo.
    v_val := substring(r.command from '"x-cron-secret"\s*:\s*"([0-9a-fA-F]{32,128})"');
    IF v_val IS NOT NULL THEN
      SELECT name INTO v_nome FROM vault.decrypted_secrets WHERE decrypted_secret = v_val LIMIT 1;
      IF v_nome IS NULL THEN
        v_nome := 'cron_secret';
        IF EXISTS (SELECT 1 FROM vault.secrets WHERE name = v_nome) THEN
          RAISE EXCEPTION 'Il nome Vault % esiste già con un altro valore: fermarsi invece di sovrascrivere', v_nome;
        END IF;
        PERFORM vault.create_secret(v_val, v_nome,
          'Header x-cron-secret dei job pg_cron verso le edge function che leggono CRON_SECRET');
      END IF;

      v_lit := substring(r.command from 'headers\s*:?=\s*''(\{[^'']*\})''::jsonb');
      IF v_lit IS NULL THEN
        RAISE EXCEPTION 'Job %: header in una forma che non so leggere', r.jobname;
      END IF;

      SELECT string_agg(
               quote_literal(k) || ',' ||
               CASE WHEN lower(k) IN ('x-cron-secret', 'x-internal-cron-secret')
                    THEN '(select decrypted_secret from vault.decrypted_secrets where name = ' || quote_literal(v_nome) || ')'
                    ELSE quote_literal(v) END,
               ',' ORDER BY ord)
        INTO v_coppie
        FROM jsonb_each_text(v_lit::jsonb) WITH ORDINALITY AS t(k, v, ord);

      v_nuovo := replace(r.command, '''' || v_lit || '''::jsonb',
                         'jsonb_build_object(' || v_coppie || ')');
      IF v_nuovo = r.command THEN
        RAISE EXCEPTION 'Job %: sostituzione degli header non riuscita', r.jobname;
      END IF;

      PERFORM cron.alter_job(r.jobid, command => v_nuovo);
      v_fatti := v_fatti + 1;
      CONTINUE;
    END IF;

    RAISE EXCEPTION 'Job %: contiene "cron-secret" in una forma non riconosciuta', r.jobname;
  END LOOP;

  RAISE NOTICE 'Job riscritti: %', v_fatti;
END $$;
