-- Il modulo fotovoltaico (20261027120000_fv_modulo_wave1) ha messo
-- ON DELETE CASCADE su ogni riferimento ai FIGLI (progetto_id) ma ha lasciato
-- al default — NO ACTION, cioe' "blocca" — ogni riferimento in USCITA:
-- cliente, opportunita', commessa, articolo di listino, tariffa, utente,
-- azienda. Risultato: cancellare una qualunque di quelle cose falliva con un
-- errore Postgres grezzo mostrato all'utente finale
-- ("violates foreign key constraint fv_progetti_opportunita_crm_id_fkey").
--
-- Regola applicata qui, una sola per tutte e quindici:
--   · cio' che il progetto FV cita ma a cui sopravvive  -> SET NULL
--   · cio' che al progetto FV appartiene (eventi, consumo API) -> CASCADE
--
-- Prima di poter scollegare il cliente ne salvo nome, telefono e mail nei
-- campi che il progetto ha gia' per questo scopo: erano vuoti su tutte le
-- righe, e senza questo passaggio un contatto cancellato avrebbe lasciato un
-- preventivo fotovoltaico senza intestatario.

SET LOCAL lock_timeout = '3s';
SET LOCAL statement_timeout = '60s';

UPDATE public.fv_progetti p
   SET cliente_nome     = coalesce(nullif(p.cliente_nome, ''), c.first_name),
       cliente_cognome  = coalesce(nullif(p.cliente_cognome, ''), c.last_name),
       cliente_telefono = coalesce(nullif(p.cliente_telefono, ''), c.phone),
       cliente_email    = coalesce(nullif(p.cliente_email, ''), c.email)
  FROM public.marketing_contacts c
 WHERE c.id = p.cliente_id
   AND (nullif(p.cliente_nome, '') IS NULL
     OR nullif(p.cliente_cognome, '') IS NULL
     OR nullif(p.cliente_telefono, '') IS NULL
     OR nullif(p.cliente_email, '') IS NULL);

-- ── fv_progetti: cita, non possiede ────────────────────────────────────────
ALTER TABLE public.fv_progetti DROP CONSTRAINT IF EXISTS fv_progetti_cliente_id_fkey;
ALTER TABLE public.fv_progetti ADD CONSTRAINT fv_progetti_cliente_id_fkey
  FOREIGN KEY (cliente_id) REFERENCES public.marketing_contacts(id) ON DELETE SET NULL;

ALTER TABLE public.fv_progetti DROP CONSTRAINT IF EXISTS fv_progetti_opportunita_crm_id_fkey;
ALTER TABLE public.fv_progetti ADD CONSTRAINT fv_progetti_opportunita_crm_id_fkey
  FOREIGN KEY (opportunita_crm_id) REFERENCES public.marketing_opportunities(id) ON DELETE SET NULL;

ALTER TABLE public.fv_progetti DROP CONSTRAINT IF EXISTS fv_progetti_ordine_id_fkey;
ALTER TABLE public.fv_progetti ADD CONSTRAINT fv_progetti_ordine_id_fkey
  FOREIGN KEY (ordine_id) REFERENCES public.orders(id) ON DELETE SET NULL;

ALTER TABLE public.fv_progetti DROP CONSTRAINT IF EXISTS fv_progetti_versione_padre_id_fkey;
ALTER TABLE public.fv_progetti ADD CONSTRAINT fv_progetti_versione_padre_id_fkey
  FOREIGN KEY (versione_padre_id) REFERENCES public.fv_progetti(id) ON DELETE SET NULL;

ALTER TABLE public.fv_progetti DROP CONSTRAINT IF EXISTS fv_progetti_created_by_fkey;
ALTER TABLE public.fv_progetti ADD CONSTRAINT fv_progetti_created_by_fkey
  FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL;

ALTER TABLE public.fv_progetti DROP CONSTRAINT IF EXISTS fv_progetti_ultima_modifica_by_fkey;
ALTER TABLE public.fv_progetti ADD CONSTRAINT fv_progetti_ultima_modifica_by_fkey
  FOREIGN KEY (ultima_modifica_by) REFERENCES auth.users(id) ON DELETE SET NULL;

-- ── fv_eventi: analytics, appartiene all'azienda e al progetto ──────────────
ALTER TABLE public.fv_eventi DROP CONSTRAINT IF EXISTS fv_eventi_company_id_fkey;
ALTER TABLE public.fv_eventi ADD CONSTRAINT fv_eventi_company_id_fkey
  FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE;

ALTER TABLE public.fv_eventi DROP CONSTRAINT IF EXISTS fv_eventi_progetto_id_fkey;
ALTER TABLE public.fv_eventi ADD CONSTRAINT fv_eventi_progetto_id_fkey
  FOREIGN KEY (progetto_id) REFERENCES public.fv_progetti(id) ON DELETE CASCADE;

ALTER TABLE public.fv_eventi DROP CONSTRAINT IF EXISTS fv_eventi_user_id_fkey;
ALTER TABLE public.fv_eventi ADD CONSTRAINT fv_eventi_user_id_fkey
  FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE SET NULL;

-- ── fv_solar_api_usage: consumo API dell'azienda ────────────────────────────
ALTER TABLE public.fv_solar_api_usage DROP CONSTRAINT IF EXISTS fv_solar_api_usage_company_id_fkey;
ALTER TABLE public.fv_solar_api_usage ADD CONSTRAINT fv_solar_api_usage_company_id_fkey
  FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE;

-- ── righe di preventivo: conservano descrizione e prezzi propri ─────────────
ALTER TABLE public.fv_componenti_progetto DROP CONSTRAINT IF EXISTS fv_componenti_progetto_articolo_id_fkey;
ALTER TABLE public.fv_componenti_progetto ADD CONSTRAINT fv_componenti_progetto_articolo_id_fkey
  FOREIGN KEY (articolo_id) REFERENCES public.articoli_native(id) ON DELETE SET NULL;

ALTER TABLE public.fv_manodopera_progetto DROP CONSTRAINT IF EXISTS fv_manodopera_progetto_tariffa_id_fkey;
ALTER TABLE public.fv_manodopera_progetto ADD CONSTRAINT fv_manodopera_progetto_tariffa_id_fkey
  FOREIGN KEY (tariffa_id) REFERENCES public.tariffe_aziendali(id) ON DELETE SET NULL;

-- ── log e audit: la riga resta, perde il nome di chi l'ha fatta ─────────────
ALTER TABLE public.fv_pdf_generation_log DROP CONSTRAINT IF EXISTS fv_pdf_generation_log_created_by_fkey;
ALTER TABLE public.fv_pdf_generation_log ADD CONSTRAINT fv_pdf_generation_log_created_by_fkey
  FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL;

ALTER TABLE public.fv_progetti_audit DROP CONSTRAINT IF EXISTS fv_progetti_audit_user_id_fkey;
ALTER TABLE public.fv_progetti_audit ADD CONSTRAINT fv_progetti_audit_user_id_fkey
  FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE SET NULL;

ALTER TABLE public.fv_parametri_calcolo DROP CONSTRAINT IF EXISTS fv_parametri_calcolo_modificato_da_fkey;
ALTER TABLE public.fv_parametri_calcolo ADD CONSTRAINT fv_parametri_calcolo_modificato_da_fkey
  FOREIGN KEY (modificato_da) REFERENCES auth.users(id) ON DELETE SET NULL;
