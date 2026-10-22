-- ════════════════════════════════════════════════════════════════════════════
-- Conteggi dai disegni CAD (DXF, e DWG salvato come DXF)
-- ════════════════════════════════════════════════════════════════════════════
-- In un disegno CAD i simboli sono blocchi con un nome (PRESA_10A, LUCE_LED…):
-- contarli è esatto, non serve l'AI. Il browser legge il file, conta i blocchi
-- per locale e misura le linee dei layer scelti (corrugati, cavi). Qui:
--
--   1. planimetrie_conteggi accetta il metodo 'dwg' (confidenza 1: conteggio
--      esatto, da confermare comunque come gli altri) e un'unità di misura
--      ('pz' per i pezzi, 'm' per le lunghezze; vuota = pezzi, come prima);
--   2. dwg_mappa_blocchi: per ogni azienda, «nome del blocco → simbolo» deciso
--      una volta sola. La volta dopo lo stesso blocco si riconosce da solo, e
--      se la mappa indica una scomposizione il conteggio la porta con sé.
--
-- Solo schema: nessuna riga esistente viene toccata. Le regole di accesso sono
-- le stesse delle tabelle dei materiali per fase (20281023011000).
-- ════════════════════════════════════════════════════════════════════════════

SET LOCAL lock_timeout = '3s';
SET LOCAL statement_timeout = '60s';

-- ─── 1. Metodo 'dwg' e unità nei conteggi ─────────────────────────────────

ALTER TABLE public.planimetrie_conteggi DROP CONSTRAINT IF EXISTS planimetrie_conteggi_metodo_check;
ALTER TABLE public.planimetrie_conteggi ADD CONSTRAINT planimetrie_conteggi_metodo_check
  CHECK (metodo IN ('testo', 'vettoriale', 'ai_immagine', 'manuale', 'dwg'));

ALTER TABLE public.planimetrie_conteggi ADD COLUMN IF NOT EXISTS unita text;
ALTER TABLE public.planimetrie_conteggi DROP CONSTRAINT IF EXISTS planimetrie_conteggi_unita_check;
ALTER TABLE public.planimetrie_conteggi ADD CONSTRAINT planimetrie_conteggi_unita_check
  CHECK (unita IS NULL OR unita IN ('pz', 'm'));

COMMENT ON COLUMN public.planimetrie_conteggi.unita IS
  'pz = pezzi (vuota vale pezzi); m = lunghezza misurata sul disegno CAD (percorso disegnato più la maggiorazione scelta).';

-- ─── 2. Mappa «nome blocco → simbolo» per azienda ──────────────────────────

CREATE TABLE IF NOT EXISTS public.dwg_mappa_blocchi (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  -- Nome del blocco come lo scrive il CAD, in maiuscolo (es. PRESA_10A).
  nome_blocco text NOT NULL,
  -- Il simbolo/materiale che diventa conteggio (es. «Punto presa 10/16A»).
  simbolo text NOT NULL,
  descrizione text,
  -- Facoltativa: la scomposizione che trasforma il simbolo in materiali.
  scomposizione_id uuid REFERENCES public.scomposizioni_voce(id) ON DELETE SET NULL,
  -- Blocco da non contare mai (cartiglio, frecce, nord…).
  ignora boolean NOT NULL DEFAULT false,
  creato_da uuid DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT dwg_mappa_blocchi_nome_check CHECK (length(btrim(nome_blocco)) > 0),
  CONSTRAINT dwg_mappa_blocchi_simbolo_check CHECK (length(btrim(simbolo)) > 0)
);

COMMENT ON TABLE public.dwg_mappa_blocchi IS
  'Per ogni azienda: quale simbolo/materiale è un blocco dei disegni CAD. Si decide una volta, poi il conteggio dei DWG/DXF è automatico.';

CREATE UNIQUE INDEX IF NOT EXISTS dwg_mappa_blocchi_azienda_nome_key ON public.dwg_mappa_blocchi (company_id, nome_blocco);

-- Il nome si salva in maiuscolo e senza spazi ai lati; la scomposizione deve
-- essere della stessa azienda.
CREATE OR REPLACE FUNCTION public.dwg_mappa_blocco_coerente()
 RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
begin
  new.updated_at := now();
  if tg_op = 'UPDATE' then
    new.company_id := old.company_id;
  end if;
  new.nome_blocco := upper(btrim(new.nome_blocco));
  new.simbolo := btrim(new.simbolo);
  if new.scomposizione_id is not null and not exists (
    select 1 from public.scomposizioni_voce s where s.id = new.scomposizione_id and s.company_id = new.company_id) then
    raise exception 'La scomposizione non è di questa azienda' using errcode = '42501';
  end if;
  return new;
end;
$function$;

-- Le funzioni di trigger non hanno bisogno di EXECUTE.
REVOKE ALL ON FUNCTION public.dwg_mappa_blocco_coerente() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS dwg_mappa_blocchi_coerente ON public.dwg_mappa_blocchi;
CREATE TRIGGER dwg_mappa_blocchi_coerente BEFORE INSERT OR UPDATE ON public.dwg_mappa_blocchi
  FOR EACH ROW EXECUTE FUNCTION public.dwg_mappa_blocco_coerente();

-- ─── 3. RLS: come le tabelle dei materiali per fase ────────────────────────
-- Lettura: tutti nell'azienda. Scrittura: chi modifica le commesse o valida
-- i materiali.

ALTER TABLE public.dwg_mappa_blocchi ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS dwg_mappa_blocchi_select ON public.dwg_mappa_blocchi;
CREATE POLICY dwg_mappa_blocchi_select ON public.dwg_mappa_blocchi FOR SELECT TO authenticated
  USING ((SELECT public.materiali_utente_in_azienda(company_id)));

DROP POLICY IF EXISTS blocco_utente_bloccato ON public.dwg_mappa_blocchi;
CREATE POLICY blocco_utente_bloccato ON public.dwg_mappa_blocchi AS RESTRICTIVE FOR ALL TO authenticated
  USING (NOT (SELECT public.utente_bloccato()))
  WITH CHECK (NOT (SELECT public.utente_bloccato()));

DROP POLICY IF EXISTS dwg_mappa_blocchi_insert ON public.dwg_mappa_blocchi;
CREATE POLICY dwg_mappa_blocchi_insert ON public.dwg_mappa_blocchi FOR INSERT TO authenticated
  WITH CHECK ((SELECT public.materiali_utente_in_azienda(company_id))
              AND ((SELECT public.materiali_puo('can_edit_orders', company_id))
                   OR (SELECT public.materiali_puo('can_validate_bom', company_id))));

DROP POLICY IF EXISTS dwg_mappa_blocchi_update ON public.dwg_mappa_blocchi;
CREATE POLICY dwg_mappa_blocchi_update ON public.dwg_mappa_blocchi FOR UPDATE TO authenticated
  USING ((SELECT public.materiali_utente_in_azienda(company_id))
         AND ((SELECT public.materiali_puo('can_edit_orders', company_id))
              OR (SELECT public.materiali_puo('can_validate_bom', company_id))))
  WITH CHECK ((SELECT public.materiali_utente_in_azienda(company_id)));

DROP POLICY IF EXISTS dwg_mappa_blocchi_delete ON public.dwg_mappa_blocchi;
CREATE POLICY dwg_mappa_blocchi_delete ON public.dwg_mappa_blocchi FOR DELETE TO authenticated
  USING ((SELECT public.materiali_utente_in_azienda(company_id))
         AND ((SELECT public.materiali_puo('can_edit_orders', company_id))
              OR (SELECT public.materiali_puo('can_validate_bom', company_id))));

REVOKE ALL ON public.dwg_mappa_blocchi FROM anon;
GRANT ALL ON public.dwg_mappa_blocchi TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.dwg_mappa_blocchi TO authenticated;
