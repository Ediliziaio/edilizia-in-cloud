-- Fatture dei fornitori da openapi.it, importate da sole (24/09/2026).
--
-- Con openapi si inviava, ma le fatture passive entravano solo a mano (un file
-- o uno zip dalla pagina Fatture ricevute). La funzione openapi-fatture-ricevute
-- ora le va a prendere: ogni ora la prima pagina dell'elenco, una volta al
-- giorno l'elenco intero, e subito quando openapi chiama (callback registrata
-- da sdi-onboarding). Arrivano a openapi solo se l'azienda registra
-- all'Agenzia delle Entrate il codice destinatario PIC7CPS.
--
-- Qui:
--   1. sdi_cedente_config: com'è configurata la ricezione e com'è andato
--      l'ultimo giro (lo mostra Impostazioni → Fatturazione);
--   2. fatture_ricevute.openapi_id: l'id della fattura su openapi, unico per
--      azienda. È ciò che il giro confronta per non riscaricare niente;
--   3. fattura_ricevuta_impronta(): una fattura arrivata firmata (.p7m) ha in
--      xml_raw il contenuto della busta, in chiaro. Senza guardare il file
--      originale risultava «firma assente»;
--   4. il job orario, al minuto 23 (lontano dal minuto 0, dove si accalcano
--      gli altri), con il segreto dal Vault e un'attesa di 15 secondi.
--
-- Idempotente: si può rieseguire.

-- Colonne e indice sono istantanei (colonne vuote, 7.210 righe), ma un ALTER
-- in coda dietro un lock altrui fermerebbe tutti: meglio fallire.
set local lock_timeout = '5s';

-- 1 ──────────────────────────────────────────────────────────────────────────
alter table public.sdi_cedente_config
  add column if not exists ricezione_openapi text,
  add column if not exists ricevute_controllate_at timestamptz,
  add column if not exists ricevute_giro_completo_at timestamptz,
  add column if not exists ricevute_ultimo_errore text;

comment on column public.sdi_cedente_config.ricezione_openapi is
  'Come sdi-onboarding ha configurato la ricezione su openapi: con_callback, senza_callback (solo il giro orario), solo_invio (registrazione senza ricezione), non_aggiornata.';
comment on column public.sdi_cedente_config.ricevute_controllate_at is
  'Ultimo giro di openapi-fatture-ricevute su questa azienda.';
comment on column public.sdi_cedente_config.ricevute_giro_completo_at is
  'Ultimo giro arrivato in fondo all''elenco delle fatture ricevute su openapi (si rifà dopo 20 ore).';
comment on column public.sdi_cedente_config.ricevute_ultimo_errore is
  'Errore dell''ultimo giro, null se è andato bene. Il dettaglio per fattura è in sdi_log (ricevuta_openapi_errore).';

-- 2 ──────────────────────────────────────────────────────────────────────────
alter table public.fatture_ricevute
  add column if not exists openapi_id text;

comment on column public.fatture_ricevute.openapi_id is
  'Id della fattura su openapi.it (GET /IT-invoices/{id}), se è arrivata da lì.';

create unique index if not exists ux_fatture_ricevute_openapi
  on public.fatture_ricevute (company_id, openapi_id)
  where openapi_id is not null;

-- 3 ──────────────────────────────────────────────────────────────────────────
create or replace function public.fattura_ricevuta_impronta()
 returns trigger
 language plpgsql
 security definer
 set search_path to 'public', 'extensions'
as $function$
BEGIN
  -- Il contenuto di una fattura ricevuta non si modifica. Se è sbagliata, il
  -- fornitore emette una nota di credito: non la si riscrive qui.
  IF TG_OP = 'UPDATE'
     AND OLD.xml_raw IS NOT NULL
     AND NEW.xml_raw IS DISTINCT FROM OLD.xml_raw THEN
    RAISE EXCEPTION
      'il contenuto di una fattura ricevuta non si modifica: è il documento di un altro soggetto (impronta %)',
      left(coalesce(OLD.xml_sha256, '?'), 12)
      USING ERRCODE = '42501';
  END IF;

  -- Anche l'impronta non si detta da fuori: la calcola il database.
  IF NEW.xml_raw IS NULL THEN
    NEW.xml_sha256 := NULL;
    NEW.xml_bytes  := NULL;
    NEW.firma_stato := NULL;
    NEW.impronta_at := NULL;
    RETURN NEW;
  END IF;

  NEW.xml_sha256 := encode(extensions.digest(NEW.xml_raw, 'sha256'), 'hex');
  NEW.xml_bytes  := octet_length(NEW.xml_raw);
  NEW.impronta_at := now();

  -- Riconoscimento della busta, dichiarato per quello che è: un indizio.
  --   file originale .p7m        → arrivata firmata; in xml_raw c'è il
  --                                contenuto della busta (24/09/2026, openapi)
  --   '<' iniziale (dopo eventuale BOM/spazi) → XML in chiaro
  --   'MII' → DER in base64, la forma tipica di un involucro PKCS#7/CAdES
  NEW.firma_stato := CASE
    WHEN lower(coalesce(NEW.xml_url, '')) LIKE '%.p7m' THEN 'busta_firmata_non_verificata'
    WHEN btrim(NEW.xml_raw) LIKE '<%'   THEN 'assente'
    WHEN btrim(NEW.xml_raw) LIKE 'MII%' THEN 'busta_firmata_non_verificata'
    ELSE 'sconosciuto'
  END;

  RETURN NEW;
END $function$;

-- 4 ──────────────────────────────────────────────────────────────────────────
do $$
begin
  perform cron.unschedule(jobid) from cron.job where jobname = 'openapi-fatture-ricevute-ora';
  perform cron.schedule(
    'openapi-fatture-ricevute-ora',
    '23 * * * *',
    $cmd$
    select net.http_post(
      url := 'https://rsbrguhkodgnqfomrevo.supabase.co/functions/v1/openapi-fatture-ricevute',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'silvio_internal_cron_secret')
      ),
      body := '{}'::jsonb,
      timeout_milliseconds := 15000
    );
    $cmd$
  );
end $$;
