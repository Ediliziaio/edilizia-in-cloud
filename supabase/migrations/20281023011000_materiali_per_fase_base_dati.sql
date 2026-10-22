-- ════════════════════════════════════════════════════════════════════════════
-- Materiali della commessa per fase: dal computo e dalle tavole, validati dal
-- tecnico, poi all'ufficio acquisti — base dati
-- ════════════════════════════════════════════════════════════════════════════
-- Richiesta di un cliente (22/10/2026, lavori pubblici): dal computo metrico e
-- dalle planimetrie il sistema prepara la «lista della spesa» dei materiali,
-- con quantità e specifiche; un tecnico la verifica e la valida; l'ufficio
-- acquisti chiede le offerte e fa gli ordini.
--
-- I materiali sono quelli che la commessa ha già (order_items con
-- natura_riga 'materiale'), divisi per fase di lavoro (phase_id). Qui:
--   - due permessi su staff_permissions: can_validate_bom («Validare i
--     materiali») e can_manage_purchasing («Ufficio acquisti»).
--     has_permission e has_permission_for_company leggono la colonna per nome;
--     la «Sola lettura» li spegne come gli altri poteri;
--   - order_items: unità di misura (prima non c'era: gli ordini la
--     scrivevano sempre «pz»), specifiche tecniche e la provenienza della
--     riga generata (voce di computo, scomposizione, tavola e locale,
--     quantità calcolata con lo sfrido);
--   - materiali_fasi_validazione: lo stato dei materiali di UNA fase
--     (bozza → da validare → validati), chi li ha inviati e chi validati;
--   - materiali_generazioni: ogni generazione salvata, con le voci escluse e
--     il motivo, gli avvisi;
--   - scomposizioni_voce (+ componenti): la libreria dell'azienda che dice
--     come una voce di computo o un simbolo di tavola diventa materiali;
--   - planimetrie_conteggi: quante sigle/simboli ci sono in una tavola, per
--     locale, con metodo e affidabilità: bozze finché non si confermano.
--
-- Regole nel database (trigger), non solo nell'interfaccia:
--   - i materiali di una fase inviata al tecnico li modifica solo chi valida;
--     quelli di una fase validata non si toccano (nome, quantità, unità,
--     specifiche, fase) finché il tecnico non la rimette in bozza; fornitore,
--     stato e acquisti restano liberi, come oggi;
--   - una scomposizione proposta dall'AI non si usa finché non la approva chi
--     valida i materiali.
-- Le fasi senza riga in materiali_fasi_validazione funzionano come prima.
--
-- Colonne nuove senza default (o con default costante) e tabelle nuove:
-- nessuna riga riscritta. Idempotente.
-- ════════════════════════════════════════════════════════════════════════════

SET LOCAL lock_timeout = '3s';
SET LOCAL statement_timeout = '60s';

-- ─── 1. Permessi ────────────────────────────────────────────────────────────

ALTER TABLE public.staff_permissions
  ADD COLUMN IF NOT EXISTS can_validate_bom boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS can_manage_purchasing boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.staff_permissions.can_validate_bom IS
  'Validare i materiali: il tecnico verifica i materiali di una fase (quantità e specifiche), li valida o li rimanda indietro; approva le scomposizioni proposte dall''AI.';
COMMENT ON COLUMN public.staff_permissions.can_manage_purchasing IS
  'Ufficio acquisti: vede i materiali validati di tutte le commesse, chiede offerte e crea gli ordini ai fornitori.';

CREATE OR REPLACE FUNCTION public.permessi_modifica_segue_visibilita()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
declare
  scrive boolean := not coalesce(new.sola_lettura, false);
begin
  new.can_edit_orders                  := coalesce(new.can_view_orders, false) and scrive;
  new.can_edit_warehouse               := coalesce(new.can_view_warehouse, false) and scrive;
  new.can_edit_mezzi                   := coalesce(new.can_view_mezzi, false) and scrive;
  new.can_edit_operai                  := coalesce(new.can_view_operai, false) and scrive;
  new.can_edit_customers               := coalesce(new.can_view_customers, false) and scrive;
  new.can_edit_tickets                 := coalesce(new.can_view_tickets, false) and scrive;
  new.can_edit_giornale_lavori         := coalesce(new.can_view_giornale_lavori, false) and scrive;
  new.can_edit_marketing_contacts      := coalesce(new.can_view_marketing_contacts, false) and scrive;
  new.can_edit_marketing_opportunities := coalesce(new.can_view_marketing_opportunities, false) and scrive;
  new.can_edit_preventivi              := coalesce(new.can_view_preventivi, false) and scrive;
  new.can_edit_marketing               := new.can_edit_marketing_contacts or new.can_edit_marketing_opportunities;

  if not scrive then
    new.can_edit_settings                := false;
    new.can_edit_settings_profile        := false;
    new.can_edit_settings_orders         := false;
    new.can_edit_settings_customization  := false;
    new.can_edit_settings_people         := false;
    new.can_edit_settings_pricing        := false;
    new.can_edit_settings_scontistica    := false;
    new.can_edit_settings_finanziamenti  := false;
    new.can_edit_settings_bundle         := false;
    new.can_edit_settings_suppliers      := false;
    new.can_edit_settings_integrations   := false;
    new.can_manage_payments              := false;
    new.can_manage_suppliers             := false;
    new.can_manage_warehouse_items       := false;
    new.can_manage_portal                := false;
    new.can_approve_orders               := false;
    new.can_approve_discounts            := false;
    new.can_delete_orders                := false;
    new.can_validate_bom                 := false;
    new.can_manage_purchasing            := false;
  end if;

  return new;
end;
$function$;

-- Chi è nell'azienda (come computo_voci_misure) e non è un cliente esterno.
CREATE OR REPLACE FUNCTION public.materiali_utente_in_azienda(_company uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT _company IS NOT NULL
     AND EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = (SELECT auth.uid()) AND p.company_id = _company)
     AND NOT public.utente_e_cliente_esterno();
$function$;

-- Il permesso dell'utente corrente in quell'azienda (gli amministratori li hanno tutti).
CREATE OR REPLACE FUNCTION public.materiali_puo(_permesso text, _company uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT (SELECT auth.uid()) IS NOT NULL
     AND _permesso IN ('can_validate_bom', 'can_manage_purchasing', 'can_edit_orders', 'can_view_orders')
     AND public.has_permission_for_company((SELECT auth.uid()), _permesso, _company);
$function$;

REVOKE ALL ON FUNCTION public.materiali_utente_in_azienda(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.materiali_puo(text, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.materiali_utente_in_azienda(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.materiali_puo(text, uuid) TO authenticated, service_role;

-- ─── 2. Libreria delle scomposizioni ───────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.scomposizioni_voce (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  nome text NOT NULL,
  -- Riconoscimento: codice di prezzario esatto e/o parole chiave (tutte
  -- presenti nella descrizione), più l'unità di misura se indicata.
  codice_prezzario text,
  parole_chiave text[] NOT NULL DEFAULT '{}',
  unita_misura text,
  categoria text,
  attiva boolean NOT NULL DEFAULT true,
  origine text NOT NULL DEFAULT 'manuale',
  note text,
  approvata_da uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  approvata_il timestamptz,
  creata_da uuid DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT scomposizioni_voce_origine_check CHECK (origine IN ('manuale', 'ai')),
  CONSTRAINT scomposizioni_voce_criterio_check CHECK (
    nullif(btrim(coalesce(codice_prezzario, '')), '') IS NOT NULL OR cardinality(parole_chiave) > 0)
);

COMMENT ON TABLE public.scomposizioni_voce IS
  'Come una voce di computo (o un simbolo di tavola) si traduce in materiali da acquistare. Libreria dell''azienda.';

CREATE INDEX IF NOT EXISTS scomposizioni_voce_company_idx ON public.scomposizioni_voce (company_id, attiva);
CREATE INDEX IF NOT EXISTS scomposizioni_voce_codice_idx ON public.scomposizioni_voce (company_id, codice_prezzario) WHERE codice_prezzario IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.scomposizioni_voce_componenti (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  scomposizione_id uuid NOT NULL REFERENCES public.scomposizioni_voce(id) ON DELETE CASCADE,
  ordine integer NOT NULL DEFAULT 0,
  descrizione text NOT NULL,
  specifiche text,
  unita_misura text NOT NULL DEFAULT 'pz',
  quantita_per_unita numeric(16,4) NOT NULL,
  sfrido_percentuale numeric(6,2) NOT NULL DEFAULT 0,
  categoria text,
  article_template_id uuid REFERENCES public.article_templates(id) ON DELETE SET NULL,
  supplier_id uuid REFERENCES public.suppliers(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT scomposizioni_componenti_quantita_check CHECK (quantita_per_unita >= 0),
  CONSTRAINT scomposizioni_componenti_sfrido_check CHECK (sfrido_percentuale >= 0 AND sfrido_percentuale <= 100)
);

CREATE INDEX IF NOT EXISTS scomposizioni_componenti_padre_idx ON public.scomposizioni_voce_componenti (scomposizione_id, ordine);
CREATE INDEX IF NOT EXISTS scomposizioni_componenti_company_idx ON public.scomposizioni_voce_componenti (company_id);

-- ─── 3. Materiali della commessa: unità, specifiche, provenienza ───────────

ALTER TABLE public.order_items
  ADD COLUMN IF NOT EXISTS unita_misura text,
  ADD COLUMN IF NOT EXISTS specifiche text,
  ADD COLUMN IF NOT EXISTS origine_materiale text,
  ADD COLUMN IF NOT EXISTS quantita_netta numeric(18,4),
  ADD COLUMN IF NOT EXISTS quantita_calcolata numeric(18,4),
  ADD COLUMN IF NOT EXISTS sfrido numeric(6,2),
  ADD COLUMN IF NOT EXISTS origini jsonb,
  ADD COLUMN IF NOT EXISTS chiave_materiale text,
  ADD COLUMN IF NOT EXISTS computo_voce_id uuid REFERENCES public.computo_voci_estratte(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS scomposizione_id uuid REFERENCES public.scomposizioni_voce(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS planimetria_documento_id uuid REFERENCES public.order_attachments(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS locale text,
  ADD COLUMN IF NOT EXISTS supplier_rfq_item_id uuid REFERENCES public.supplier_rfq_items(id) ON DELETE SET NULL;

DO $$ BEGIN
  ALTER TABLE public.order_items
    ADD CONSTRAINT order_items_origine_materiale_check
    CHECK (origine_materiale IS NULL OR origine_materiale IN ('computo', 'planimetria', 'manuale'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

COMMENT ON COLUMN public.order_items.unita_misura IS 'Unità di misura del materiale (pz, m, mq, kg…). Vuota = pezzi, come prima.';
COMMENT ON COLUMN public.order_items.specifiche IS 'Specifiche tecniche da passare al fornitore (sezione, diametro, potenza, norma…).';
COMMENT ON COLUMN public.order_items.origine_materiale IS 'Riga generata dal computo o dalle tavole (o aggiunta a mano nella generazione). Vuota = riga inserita come prima.';
COMMENT ON COLUMN public.order_items.quantita_calcolata IS 'Quantità calcolata (con lo sfrido): quantity è quella confermata, intera per eccesso.';
COMMENT ON COLUMN public.order_items.origini IS 'Da dove viene la riga: voci di computo e conteggi delle tavole, con le quantità.';
COMMENT ON COLUMN public.order_items.supplier_rfq_item_id IS 'Riga della richiesta d''offerta in cui il materiale è stato chiesto ai fornitori.';

CREATE INDEX IF NOT EXISTS order_items_rfq_item_idx ON public.order_items (supplier_rfq_item_id) WHERE supplier_rfq_item_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS order_items_phase_idx ON public.order_items (phase_id) WHERE phase_id IS NOT NULL;

-- ─── 4. Stato dei materiali di una fase ────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.materiali_fasi_validazione (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  order_id uuid NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  phase_id uuid NOT NULL REFERENCES public.order_work_phases(id) ON DELETE CASCADE,
  stato text NOT NULL DEFAULT 'bozza',
  inviata_da uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  inviata_il timestamptz,
  validata_da uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  validata_il timestamptz,
  note_validazione text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT materiali_fasi_validazione_stato_check CHECK (stato IN ('bozza', 'da_validare', 'validata')),
  CONSTRAINT materiali_fasi_validazione_fase_unica UNIQUE (phase_id)
);

COMMENT ON TABLE public.materiali_fasi_validazione IS
  'Stato dei materiali di una fase: bozza → da validare (dal tecnico) → validati. Solo i validati arrivano all''ufficio acquisti. Una fase senza riga qui funziona come prima.';

CREATE INDEX IF NOT EXISTS materiali_fasi_validazione_order_idx ON public.materiali_fasi_validazione (order_id);
CREATE INDEX IF NOT EXISTS materiali_fasi_validazione_company_stato_idx ON public.materiali_fasi_validazione (company_id, stato);

-- ─── 5. Generazioni salvate ────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.materiali_generazioni (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  order_id uuid NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  computo_upload_id uuid REFERENCES public.computo_uploads(id) ON DELETE SET NULL,
  righe integer NOT NULL DEFAULT 0,
  escluse jsonb NOT NULL DEFAULT '[]'::jsonb,
  avvisi jsonb NOT NULL DEFAULT '[]'::jsonb,
  creata_da uuid DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.materiali_generazioni IS
  'Ogni volta che i materiali della commessa sono generati dal computo e dalle tavole: quante righe, le voci escluse col motivo, gli avvisi.';

CREATE INDEX IF NOT EXISTS materiali_generazioni_order_idx ON public.materiali_generazioni (order_id, created_at DESC);

-- ─── 6. Conteggi dalle planimetrie ─────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.planimetrie_conteggi (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  order_id uuid NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  phase_id uuid REFERENCES public.order_work_phases(id) ON DELETE SET NULL,
  documento_id uuid REFERENCES public.order_attachments(id) ON DELETE SET NULL,
  documento_nome text,
  documento_path text,
  pagina integer NOT NULL DEFAULT 1,
  simbolo text NOT NULL,
  descrizione_legenda text,
  locale text,
  quantita numeric(14,2) NOT NULL,
  metodo text NOT NULL,
  confidenza numeric(4,3),
  confermato boolean NOT NULL DEFAULT false,
  confermato_da uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  confermato_il timestamptz,
  scomposizione_id uuid REFERENCES public.scomposizioni_voce(id) ON DELETE SET NULL,
  dettaglio jsonb,
  creato_da uuid DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT planimetrie_conteggi_metodo_check CHECK (metodo IN ('testo', 'vettoriale', 'ai_immagine', 'manuale')),
  CONSTRAINT planimetrie_conteggi_quantita_check CHECK (quantita >= 0),
  CONSTRAINT planimetrie_conteggi_confidenza_check CHECK (confidenza IS NULL OR (confidenza >= 0 AND confidenza <= 1))
);

COMMENT ON TABLE public.planimetrie_conteggi IS
  'Quanti simboli o sigle ci sono in una tavola, per locale. Bozza finché qualcuno non conferma: solo i confermati diventano materiali.';

CREATE INDEX IF NOT EXISTS planimetrie_conteggi_order_idx ON public.planimetrie_conteggi (order_id, documento_id);
CREATE INDEX IF NOT EXISTS planimetrie_conteggi_company_idx ON public.planimetrie_conteggi (company_id);

-- ─── 7. Trigger ────────────────────────────────────────────────────────────

-- Componenti: l'azienda è quella della scomposizione.
CREATE OR REPLACE FUNCTION public.scomposizione_componente_coerente()
 RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
begin
  select s.company_id into new.company_id from public.scomposizioni_voce s where s.id = new.scomposizione_id;
  if new.company_id is null then
    raise exception 'Scomposizione inesistente' using errcode = '23503';
  end if;
  return new;
end;
$function$;

-- Una scomposizione proposta dall'AI entra in uso solo con l'approvazione di
-- chi valida i materiali; chi la attiva resta scritto.
CREATE OR REPLACE FUNCTION public.scomposizione_approvazione()
 RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
declare
  attivazione boolean;
begin
  new.updated_at := now();
  attivazione := new.attiva and (tg_op = 'INSERT' or not coalesce(old.attiva, false));
  if new.origine = 'ai' and attivazione then
    if auth.uid() is not null and not public.materiali_puo('can_validate_bom', new.company_id) then
      raise exception 'Solo chi valida i materiali può approvare una scomposizione proposta dall''AI'
        using errcode = '42501';
    end if;
    new.approvata_da := coalesce(auth.uid(), new.approvata_da);
    new.approvata_il := now();
  end if;
  if tg_op = 'UPDATE' then
    new.company_id := old.company_id;
    new.creata_da := old.creata_da;
  end if;
  return new;
end;
$function$;

-- Stato della fase: si cambia solo con materiali_fase_cambia_stato() (che
-- imposta app.materiali_transizione); azienda e commessa sono quelle della fase.
CREATE OR REPLACE FUNCTION public.materiali_fase_proteggi()
 RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
declare
  da_rpc boolean := coalesce(current_setting('app.materiali_transizione', true), '') = 'on';
begin
  select f.company_id, f.order_id into new.company_id, new.order_id
    from public.order_work_phases f where f.id = new.phase_id;
  if new.order_id is null then
    raise exception 'Fase inesistente' using errcode = '23503';
  end if;
  new.updated_at := now();
  if auth.uid() is null or da_rpc then
    return new;
  end if;
  if tg_op = 'INSERT' and new.stato = 'bozza' and new.validata_da is null and new.inviata_da is null then
    return new;
  end if;
  if tg_op = 'UPDATE'
     and new.stato is not distinct from old.stato
     and new.validata_da is not distinct from old.validata_da
     and new.validata_il is not distinct from old.validata_il
     and new.inviata_da is not distinct from old.inviata_da
     and new.inviata_il is not distinct from old.inviata_il
     and new.note_validazione is not distinct from old.note_validazione then
    return new;
  end if;
  raise exception 'Lo stato dei materiali della fase si cambia con i pulsanti (invia, valida, rimanda)'
    using errcode = '42501';
end;
$function$;

-- Materiali di una fase in verifica o validata: nome, quantità, unità,
-- specifiche e fase non si cambiano (in verifica: solo chi valida). Fornitore,
-- stato e acquisti restano liberi come oggi.
CREATE OR REPLACE FUNCTION public.materiali_riga_proteggi()
 RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
declare
  fasi uuid[];
  f uuid;
  st text;
  azienda uuid;
  natura text := case when tg_op = 'DELETE' then old.natura_riga else new.natura_riga end;
begin
  if auth.uid() is null or coalesce(current_setting('app.materiali_sistema', true), '') = 'on' then
    return case when tg_op = 'DELETE' then old else new end;
  end if;

  if tg_op = 'INSERT' then
    fasi := array[new.phase_id];
  elsif tg_op = 'DELETE' then
    fasi := array[old.phase_id];
  else
    if new.name is not distinct from old.name
       and new.quantity is not distinct from old.quantity
       and new.unita_misura is not distinct from old.unita_misura
       and new.specifiche is not distinct from old.specifiche
       and new.phase_id is not distinct from old.phase_id
       and new.natura_riga is not distinct from old.natura_riga then
      return new;
    end if;
    fasi := array[old.phase_id, new.phase_id];
  end if;

  foreach f in array fasi loop
    continue when f is null;
    select v.stato, v.company_id into st, azienda from public.materiali_fasi_validazione v where v.phase_id = f;
    continue when st is null or st = 'bozza';
    -- La fase sta sparendo (cancellata o a cascata con la commessa).
    continue when not exists (select 1 from public.order_work_phases w where w.id = f);
    if natura <> 'materiale' and (tg_op <> 'UPDATE' or old.natura_riga <> 'materiale') then
      continue;
    end if;
    if st = 'da_validare' and public.materiali_puo('can_validate_bom', azienda) then
      continue;
    end if;
    if st = 'da_validare' then
      raise exception 'I materiali di questa fase sono in verifica: li modifica solo chi li valida' using errcode = '42501';
    end if;
    raise exception 'I materiali di questa fase sono validati: per cambiarli il tecnico rimette la fase in bozza' using errcode = '42501';
  end loop;

  return case when tg_op = 'DELETE' then old else new end;
end;
$function$;

-- Conteggi: commessa dell'azienda, tavola della commessa; chi conferma resta scritto.
CREATE OR REPLACE FUNCTION public.planimetria_conteggio_coerente()
 RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
begin
  new.updated_at := now();
  if tg_op = 'UPDATE' then
    new.company_id := old.company_id;
    new.order_id := old.order_id;
  end if;
  if not exists (select 1 from public.orders o where o.id = new.order_id and o.company_id = new.company_id) then
    raise exception 'La commessa non è di questa azienda' using errcode = '42501';
  end if;
  if new.documento_id is not null and not exists (
    select 1 from public.order_attachments a where a.id = new.documento_id and a.order_id = new.order_id) then
    raise exception 'La tavola non è un documento di questa commessa' using errcode = '42501';
  end if;
  if new.phase_id is not null and not exists (
    select 1 from public.order_work_phases w where w.id = new.phase_id and w.order_id = new.order_id) then
    raise exception 'La fase non è di questa commessa' using errcode = '42501';
  end if;
  if new.confermato and (tg_op = 'INSERT' or not old.confermato) then
    new.confermato_da := auth.uid();
    new.confermato_il := now();
  elsif not new.confermato then
    new.confermato_da := null;
    new.confermato_il := null;
  end if;
  return new;
end;
$function$;

-- Generazioni: azienda della commessa.
CREATE OR REPLACE FUNCTION public.materiali_generazione_coerente()
 RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
begin
  if not exists (select 1 from public.orders o where o.id = new.order_id and o.company_id = new.company_id) then
    raise exception 'La commessa non è di questa azienda' using errcode = '42501';
  end if;
  return new;
end;
$function$;

-- Le funzioni di trigger non hanno bisogno di EXECUTE.
REVOKE ALL ON FUNCTION public.scomposizione_componente_coerente() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.scomposizione_approvazione() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.materiali_fase_proteggi() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.materiali_riga_proteggi() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.planimetria_conteggio_coerente() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.materiali_generazione_coerente() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS scomposizioni_voce_approvazione ON public.scomposizioni_voce;
CREATE TRIGGER scomposizioni_voce_approvazione BEFORE INSERT OR UPDATE ON public.scomposizioni_voce
  FOR EACH ROW EXECUTE FUNCTION public.scomposizione_approvazione();

DROP TRIGGER IF EXISTS scomposizioni_componenti_coerenti ON public.scomposizioni_voce_componenti;
CREATE TRIGGER scomposizioni_componenti_coerenti BEFORE INSERT OR UPDATE ON public.scomposizioni_voce_componenti
  FOR EACH ROW EXECUTE FUNCTION public.scomposizione_componente_coerente();

DROP TRIGGER IF EXISTS materiali_fasi_validazione_proteggi ON public.materiali_fasi_validazione;
CREATE TRIGGER materiali_fasi_validazione_proteggi BEFORE INSERT OR UPDATE ON public.materiali_fasi_validazione
  FOR EACH ROW EXECUTE FUNCTION public.materiali_fase_proteggi();

DROP TRIGGER IF EXISTS materiali_riga_proteggi ON public.order_items;
CREATE TRIGGER materiali_riga_proteggi BEFORE INSERT OR UPDATE OR DELETE ON public.order_items
  FOR EACH ROW EXECUTE FUNCTION public.materiali_riga_proteggi();

DROP TRIGGER IF EXISTS planimetrie_conteggi_coerenti ON public.planimetrie_conteggi;
CREATE TRIGGER planimetrie_conteggi_coerenti BEFORE INSERT OR UPDATE ON public.planimetrie_conteggi
  FOR EACH ROW EXECUTE FUNCTION public.planimetria_conteggio_coerente();

DROP TRIGGER IF EXISTS materiali_generazioni_coerenti ON public.materiali_generazioni;
CREATE TRIGGER materiali_generazioni_coerenti BEFORE INSERT ON public.materiali_generazioni
  FOR EACH ROW EXECUTE FUNCTION public.materiali_generazione_coerente();

-- ─── 8. RLS ────────────────────────────────────────────────────────────────
-- Lettura: tutti nell'azienda dell'utente, niente clienti esterni (come il
-- computo). Scrittura: chi modifica le commesse o valida i materiali. Lo
-- stato della fase lo scrive solo materiali_fase_cambia_stato (SECURITY
-- DEFINER): agli utenti resta la lettura.

ALTER TABLE public.scomposizioni_voce ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.scomposizioni_voce_componenti ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.materiali_fasi_validazione ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.materiali_generazioni ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.planimetrie_conteggi ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['scomposizioni_voce', 'scomposizioni_voce_componenti', 'materiali_fasi_validazione',
                           'materiali_generazioni', 'planimetrie_conteggi'] LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t || '_select', t);
    EXECUTE format($p$CREATE POLICY %I ON public.%I FOR SELECT TO authenticated
      USING ((SELECT public.materiali_utente_in_azienda(company_id)))$p$, t || '_select', t);

    EXECUTE format('DROP POLICY IF EXISTS blocco_utente_bloccato ON public.%I', t);
    EXECUTE format($p$CREATE POLICY blocco_utente_bloccato ON public.%I AS RESTRICTIVE FOR ALL TO authenticated
      USING (NOT (SELECT public.utente_bloccato()))
      WITH CHECK (NOT (SELECT public.utente_bloccato()))$p$, t);

    EXECUTE format('REVOKE ALL ON public.%I FROM anon', t);
    EXECUTE format('GRANT ALL ON public.%I TO service_role', t);

    IF t = 'materiali_fasi_validazione' THEN
      EXECUTE format('REVOKE INSERT, UPDATE, DELETE ON public.%I FROM authenticated', t);
      EXECUTE format('GRANT SELECT ON public.%I TO authenticated', t);
      CONTINUE;
    END IF;

    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t || '_insert', t);
    EXECUTE format($p$CREATE POLICY %I ON public.%I FOR INSERT TO authenticated
      WITH CHECK ((SELECT public.materiali_utente_in_azienda(company_id))
                  AND ((SELECT public.materiali_puo('can_edit_orders', company_id))
                       OR (SELECT public.materiali_puo('can_validate_bom', company_id))))$p$, t || '_insert', t);

    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t || '_update', t);
    EXECUTE format($p$CREATE POLICY %I ON public.%I FOR UPDATE TO authenticated
      USING ((SELECT public.materiali_utente_in_azienda(company_id))
             AND ((SELECT public.materiali_puo('can_edit_orders', company_id))
                  OR (SELECT public.materiali_puo('can_validate_bom', company_id))))
      WITH CHECK ((SELECT public.materiali_utente_in_azienda(company_id)))$p$, t || '_update', t);

    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t || '_delete', t);
    EXECUTE format($p$CREATE POLICY %I ON public.%I FOR DELETE TO authenticated
      USING ((SELECT public.materiali_utente_in_azienda(company_id))
             AND ((SELECT public.materiali_puo('can_edit_orders', company_id))
                  OR (SELECT public.materiali_puo('can_validate_bom', company_id))))$p$, t || '_delete', t);

    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON public.%I TO authenticated', t);
  END LOOP;
END $$;
