-- Libreria Prezzari Regionali — tabelle CONDIVISE (cross-company), read-only per le
-- aziende, scrivibili solo dal super-admin. Vedi docs/superpowers/specs/2026-06-20-prezzari-regionali-design.md
-- Idempotente. NON applicata automaticamente (vincolo locale): applicare via MCP in "pubblica".

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. FONTE (un prezzario regionale, versionato per anno)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.prezzario_fonte (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  regione     text NOT NULL,
  anno        int  NOT NULL,
  versione    text,
  nome        text NOT NULL,
  url_fonte   text,
  licenza     text,
  stato       text NOT NULL DEFAULT 'bozza'
              CHECK (stato IN ('bozza', 'pubblicato', 'archiviato')),
  note        text,
  created_by  uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_prezzario_fonte_regione_anno_ver
  ON public.prezzario_fonte (regione, anno, COALESCE(versione, ''));
CREATE INDEX IF NOT EXISTS idx_prezzario_fonte_stato
  ON public.prezzario_fonte (stato, regione, anno);

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. CAPITOLO (gerarchia: capitolo → sotto-capitolo)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.prezzario_capitolo (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  fonte_id   uuid NOT NULL REFERENCES public.prezzario_fonte(id) ON DELETE CASCADE,
  codice     text,
  titolo     text NOT NULL,
  parent_id  uuid REFERENCES public.prezzario_capitolo(id) ON DELETE CASCADE,
  livello    int NOT NULL DEFAULT 0,
  ordine     int NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_prezzario_capitolo_fonte
  ON public.prezzario_capitolo (fonte_id, parent_id, ordine);

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. VOCE (articolo del prezzario)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.prezzario_voce (
  id                        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  fonte_id                  uuid NOT NULL REFERENCES public.prezzario_fonte(id) ON DELETE CASCADE,
  capitolo_id               uuid REFERENCES public.prezzario_capitolo(id) ON DELETE SET NULL,
  codice                    text,
  descrizione               text NOT NULL,
  unita_misura              text,
  prezzo                    numeric NOT NULL DEFAULT 0,
  incidenza_manodopera_pct  numeric,  -- 0..1, incidenza % manodopera (obbligo base d'asta)
  incidenza_sicurezza_pct   numeric,  -- 0..1, eventuale incidenza oneri sicurezza
  note                      text,
  ordine                    int NOT NULL DEFAULT 0,
  search                    tsvector GENERATED ALWAYS AS (
                              to_tsvector('italian',
                                coalesce(descrizione, '') || ' ' || coalesce(codice, ''))
                            ) STORED
);
CREATE INDEX IF NOT EXISTS idx_prezzario_voce_fonte_codice
  ON public.prezzario_voce (fonte_id, codice);
CREATE INDEX IF NOT EXISTS idx_prezzario_voce_capitolo
  ON public.prezzario_voce (fonte_id, capitolo_id);
CREATE INDEX IF NOT EXISTS idx_prezzario_voce_search
  ON public.prezzario_voce USING GIN (search);

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. MANODOPERA — costo orario edile ufficiale (creata in v1, popolata in v2)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.manodopera_tariffa (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  regione       text,
  provincia     text,
  anno          int,
  qualifica     text CHECK (qualifica IN ('comune', 'qualificato', 'specializzato', 'quarto_livello')),
  costo_orario  numeric,
  fonte         text,
  created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_manodopera_tariffa_geo
  ON public.manodopera_tariffa (regione, provincia, anno);

-- ─────────────────────────────────────────────────────────────────────────────
-- RLS: lettura del pubblicato a tutti gli autenticati; scrittura solo super-admin.
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE public.prezzario_fonte      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.prezzario_capitolo   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.prezzario_voce       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.manodopera_tariffa   ENABLE ROW LEVEL SECURITY;

-- FONTE
DROP POLICY IF EXISTS pz_fonte_select ON public.prezzario_fonte;
CREATE POLICY pz_fonte_select ON public.prezzario_fonte
  FOR SELECT TO authenticated
  USING (stato = 'pubblicato' OR public.is_super_admin());
DROP POLICY IF EXISTS pz_fonte_write ON public.prezzario_fonte;
CREATE POLICY pz_fonte_write ON public.prezzario_fonte
  FOR ALL TO authenticated
  USING (public.is_super_admin()) WITH CHECK (public.is_super_admin());

-- CAPITOLO (visibilità derivata dalla fonte)
DROP POLICY IF EXISTS pz_capitolo_select ON public.prezzario_capitolo;
CREATE POLICY pz_capitolo_select ON public.prezzario_capitolo
  FOR SELECT TO authenticated
  USING (public.is_super_admin() OR EXISTS (
    SELECT 1 FROM public.prezzario_fonte f
    WHERE f.id = prezzario_capitolo.fonte_id AND f.stato = 'pubblicato'));
DROP POLICY IF EXISTS pz_capitolo_write ON public.prezzario_capitolo;
CREATE POLICY pz_capitolo_write ON public.prezzario_capitolo
  FOR ALL TO authenticated
  USING (public.is_super_admin()) WITH CHECK (public.is_super_admin());

-- VOCE (visibilità derivata dalla fonte)
DROP POLICY IF EXISTS pz_voce_select ON public.prezzario_voce;
CREATE POLICY pz_voce_select ON public.prezzario_voce
  FOR SELECT TO authenticated
  USING (public.is_super_admin() OR EXISTS (
    SELECT 1 FROM public.prezzario_fonte f
    WHERE f.id = prezzario_voce.fonte_id AND f.stato = 'pubblicato'));
DROP POLICY IF EXISTS pz_voce_write ON public.prezzario_voce;
CREATE POLICY pz_voce_write ON public.prezzario_voce
  FOR ALL TO authenticated
  USING (public.is_super_admin()) WITH CHECK (public.is_super_admin());

-- MANODOPERA (dato di riferimento pubblico)
DROP POLICY IF EXISTS pz_manodopera_select ON public.manodopera_tariffa;
CREATE POLICY pz_manodopera_select ON public.manodopera_tariffa
  FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS pz_manodopera_write ON public.manodopera_tariffa;
CREATE POLICY pz_manodopera_write ON public.manodopera_tariffa
  FOR ALL TO authenticated
  USING (public.is_super_admin()) WITH CHECK (public.is_super_admin());

COMMENT ON TABLE public.prezzario_fonte IS 'Prezzari regionali ufficiali (condivisi, read-only aziende). Solo fonti ufficiali con attribuzione; mai aggregati commerciali.';
COMMENT ON TABLE public.prezzario_voce IS 'Voci/articoli di un prezzario regionale, con incidenza manodopera. prezzo = base; l''azienda applica il suo margine in adozione.';
