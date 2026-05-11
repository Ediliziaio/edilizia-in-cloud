-- ═══════════════════════════════════════════════════════════════════════════
-- Listino multi-verticale + scheda tecnica per macrocategoria
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Problema: oggi il listino è "flat" — quando un'azienda multi-verticale
-- (serramenti + fotovoltaico + bagno) apre il picker preventivo serramenti,
-- vede TUTTE le macrocategorie, anche pannelli FV e sanitari. Inoltre la
-- "scheda tecnica" di un prodotto è un singolo campo descrizione libera,
-- mentre infissi e pannelli hanno proprietà strutturate completamente diverse
-- (Uw/vetro vs Wp/efficienza).
--
-- Soluzione:
--   1) `listino_macrocategorie.verticali_abilitati TEXT[]` — array di verticali
--      a cui la macro è esposta. '{}' = visibile in tutti (retrocompat).
--   2) Tabella `listino_macrocategoria_fields` — schema tipizzato della scheda
--      tecnica per macro. I valori vivono già in
--      `article_families.custom_field_values JSONB` con chiave = field_key.
--   3) Seed dei field di default per i 4 verticali primari (serramenti, FV,
--      bagno, tetti) come "template di sistema" che ogni azienda può clonare.
--
-- Idempotente.

-- ─── 1. verticali_abilitati su macrocategorie ─────────────────────────────

ALTER TABLE public.listino_macrocategorie
  ADD COLUMN IF NOT EXISTS verticali_abilitati TEXT[] NOT NULL DEFAULT '{}';

COMMENT ON COLUMN public.listino_macrocategorie.verticali_abilitati IS
  'Verticali (moduli preventivo) a cui questa macro è esposta. '
  '{} = visibile in tutti i verticali. '
  'Valori coerenti con companies.vertical: serramentista, tetti, bagno, '
  'ristrutturazione, tende_da_sole, vetrate, caldaie, clima, fotovoltaico, generico.';

CREATE INDEX IF NOT EXISTS idx_listino_macro_verticali
  ON public.listino_macrocategorie USING GIN (verticali_abilitati);

-- ─── 2. Tabella scheda tecnica per macrocategoria ─────────────────────────

CREATE TABLE IF NOT EXISTS public.listino_macrocategoria_fields (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  macrocategoria_id UUID NOT NULL REFERENCES public.listino_macrocategorie(id) ON DELETE CASCADE,
  field_key         TEXT NOT NULL,        -- 'vetro', 'trasmittanza_uw', 'potenza_wp'
  field_label       TEXT NOT NULL,        -- 'Vetro', 'Trasmittanza Uw'
  field_type        TEXT NOT NULL
    CHECK (field_type IN ('text','textarea','number','select','multiselect','boolean','color')),
  field_unit        TEXT,                 -- 'W/m²K', 'Wp', 'mm', '%'
  field_options     JSONB DEFAULT '[]'::jsonb,  -- per select/multiselect: [{value,label}]
  field_placeholder TEXT,
  field_help        TEXT,                 -- testo di aiuto sotto il campo
  required          BOOLEAN NOT NULL DEFAULT false,
  show_in_picker    BOOLEAN NOT NULL DEFAULT true,  -- mostra nella card del picker
  show_in_pdf       BOOLEAN NOT NULL DEFAULT true,  -- stampa sul preventivo
  sort_order        INTEGER NOT NULL DEFAULT 0,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (macrocategoria_id, field_key)
);

CREATE INDEX IF NOT EXISTS idx_macro_fields_macro
  ON public.listino_macrocategoria_fields(macrocategoria_id, sort_order);

ALTER TABLE public.listino_macrocategoria_fields ENABLE ROW LEVEL SECURITY;

-- RLS: stessa logica delle macrocategorie (eredita company tramite FK)
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname='public'
      AND tablename='listino_macrocategoria_fields' AND policyname='macrofields_select'
  ) THEN
    CREATE POLICY macrofields_select ON public.listino_macrocategoria_fields
      FOR SELECT USING (
        EXISTS (
          SELECT 1 FROM public.listino_macrocategorie m
          WHERE m.id = macrocategoria_id
            AND (m.company_id = public.get_my_company_id()
                 OR public.has_role(auth.uid(), 'super_admin'::app_role))
        )
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname='public'
      AND tablename='listino_macrocategoria_fields' AND policyname='macrofields_insert'
  ) THEN
    CREATE POLICY macrofields_insert ON public.listino_macrocategoria_fields
      FOR INSERT WITH CHECK (
        EXISTS (
          SELECT 1 FROM public.listino_macrocategorie m
          WHERE m.id = macrocategoria_id
            AND m.company_id = public.get_my_company_id()
            AND public.has_role(auth.uid(), 'company_admin'::app_role)
        )
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname='public'
      AND tablename='listino_macrocategoria_fields' AND policyname='macrofields_update'
  ) THEN
    CREATE POLICY macrofields_update ON public.listino_macrocategoria_fields
      FOR UPDATE USING (
        EXISTS (
          SELECT 1 FROM public.listino_macrocategorie m
          WHERE m.id = macrocategoria_id
            AND m.company_id = public.get_my_company_id()
            AND public.has_role(auth.uid(), 'company_admin'::app_role)
        )
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname='public'
      AND tablename='listino_macrocategoria_fields' AND policyname='macrofields_delete'
  ) THEN
    CREATE POLICY macrofields_delete ON public.listino_macrocategoria_fields
      FOR DELETE USING (
        EXISTS (
          SELECT 1 FROM public.listino_macrocategorie m
          WHERE m.id = macrocategoria_id
            AND m.company_id = public.get_my_company_id()
            AND public.has_role(auth.uid(), 'company_admin'::app_role)
        )
      );
  END IF;
END $$;

-- Trigger updated_at
CREATE OR REPLACE FUNCTION public.tg_macrofields_set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_macrofields_updated_at ON public.listino_macrocategoria_fields;
CREATE TRIGGER trg_macrofields_updated_at
  BEFORE UPDATE ON public.listino_macrocategoria_fields
  FOR EACH ROW EXECUTE FUNCTION public.tg_macrofields_set_updated_at();

-- ─── 3. Funzione RPC per "etichettare" automaticamente per nome ───────────
-- Pratico per chi ha già macrocategorie esistenti e vuole bootstrap rapido.

CREATE OR REPLACE FUNCTION public.guess_vertical_from_name(p_nome TEXT)
RETURNS TEXT[] AS $$
DECLARE
  nome_lower TEXT := lower(coalesce(p_nome, ''));
BEGIN
  -- Heuristica: matching keyword → verticale
  IF nome_lower ~ '(infiss|serrament|finestr|portafinestr|porta blindat|persian|tapparell|cassonett|zanzarier|scuro|antone)' THEN
    RETURN ARRAY['serramentista'];
  ELSIF nome_lower ~ '(pannell|fotovoltaic|inverter|accumul|batteri|colonnin|wallbox|stringa)' THEN
    RETURN ARRAY['fotovoltaico'];
  ELSIF nome_lower ~ '(sanitar|wc|bidet|lavabo|piatto doccia|vasca|box doccia|miscelator|rubinett|piastrell)' THEN
    RETURN ARRAY['bagno'];
  ELSIF nome_lower ~ '(tegol|copertur|grondai|pluvial|lattoner|isolant.*tett|guain)' THEN
    RETURN ARRAY['tetti'];
  ELSIF nome_lower ~ '(tend.*sole|pergol|gazebo|bracci)' THEN
    RETURN ARRAY['tende_da_sole'];
  ELSIF nome_lower ~ '(caldai|condizionator|clima|pompa.*calor|split|fancoil)' THEN
    RETURN ARRAY['caldaie','clima'];
  ELSE
    RETURN ARRAY[]::TEXT[];  -- generico → visibile ovunque
  END IF;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

COMMENT ON FUNCTION public.guess_vertical_from_name IS
  'Inferisce i verticali abilitati da una stringa nome macrocategoria. '
  'Usato come fallback nel bootstrap di tenant esistenti.';

-- ─── 4. Backfill: applica heuristica alle macro esistenti SENZA verticali ──
-- Solo dove verticali_abilitati è vuoto (cioè default) e ha senso etichettare.

UPDATE public.listino_macrocategorie
SET verticali_abilitati = public.guess_vertical_from_name(nome)
WHERE cardinality(verticali_abilitati) = 0
  AND cardinality(public.guess_vertical_from_name(nome)) > 0;

-- ─── 5. Schema/Seed VERTICALI: helper RPC per clonare template ────────────
-- L'app può chiamare questa funzione per popolare la scheda tecnica di una
-- macro nuova con i campi tipici del suo verticale primario.

CREATE OR REPLACE FUNCTION public.seed_macro_fields_from_vertical(
  p_macro_id UUID,
  p_vertical TEXT
) RETURNS INTEGER AS $$
DECLARE
  v_inserted INTEGER := 0;
BEGIN
  -- Solo company_admin può seedare (security via INSERT policy)
  IF p_vertical = 'serramentista' THEN
    INSERT INTO public.listino_macrocategoria_fields
      (macrocategoria_id, field_key, field_label, field_type, field_unit, field_options, required, show_in_picker, show_in_pdf, sort_order)
    VALUES
      (p_macro_id, 'materiale_profilo', 'Materiale profilo', 'select', NULL,
        '[{"value":"pvc","label":"PVC"},{"value":"alluminio","label":"Alluminio"},{"value":"alluminio_tt","label":"Alluminio taglio termico"},{"value":"legno","label":"Legno"},{"value":"legno_alluminio","label":"Legno-alluminio"}]'::jsonb,
        true, true, true, 10),
      (p_macro_id, 'num_camere', 'Numero camere profilo', 'number', NULL, '[]'::jsonb, false, true, true, 20),
      (p_macro_id, 'tipo_vetro', 'Tipo vetro', 'select', NULL,
        '[{"value":"doppio","label":"Doppio"},{"value":"doppio_be","label":"Doppio basso-emissivo"},{"value":"triplo","label":"Triplo basso-emissivo"},{"value":"antifurto","label":"Antifurto/stratificato"},{"value":"acustico","label":"Acustico"}]'::jsonb,
        true, true, true, 30),
      (p_macro_id, 'trasmittanza_uw', 'Trasmittanza Uw', 'number', 'W/m²K', '[]'::jsonb, false, true, true, 40),
      (p_macro_id, 'trasmittanza_ug', 'Trasmittanza Ug (vetro)', 'number', 'W/m²K', '[]'::jsonb, false, false, true, 50),
      (p_macro_id, 'colore_interno', 'Colore interno', 'color', NULL, '[]'::jsonb, false, true, true, 60),
      (p_macro_id, 'colore_esterno', 'Colore esterno', 'color', NULL, '[]'::jsonb, false, true, true, 70),
      (p_macro_id, 'tipo_apertura', 'Tipo apertura', 'select', NULL,
        '[{"value":"battente","label":"Battente"},{"value":"anta_ribalta","label":"Anta-ribalta"},{"value":"scorrevole","label":"Scorrevole"},{"value":"alzante_scorrevole","label":"Alzante-scorrevole"},{"value":"vasistas","label":"Vasistas"},{"value":"fisso","label":"Fisso"}]'::jsonb,
        false, true, true, 80)
    ON CONFLICT (macrocategoria_id, field_key) DO NOTHING;
    GET DIAGNOSTICS v_inserted = ROW_COUNT;

  ELSIF p_vertical = 'fotovoltaico' THEN
    INSERT INTO public.listino_macrocategoria_fields
      (macrocategoria_id, field_key, field_label, field_type, field_unit, field_options, required, show_in_picker, show_in_pdf, sort_order)
    VALUES
      (p_macro_id, 'potenza_wp', 'Potenza nominale', 'number', 'Wp', '[]'::jsonb, true, true, true, 10),
      (p_macro_id, 'efficienza_pct', 'Efficienza modulo', 'number', '%', '[]'::jsonb, false, true, true, 20),
      (p_macro_id, 'tecnologia_celle', 'Tecnologia celle', 'select', NULL,
        '[{"value":"monocristallino","label":"Monocristallino"},{"value":"policristallino","label":"Policristallino"},{"value":"perc","label":"PERC"},{"value":"topcon","label":"TOPCon"},{"value":"hjt","label":"Eterogiunzione (HJT)"},{"value":"bifacciale","label":"Bifacciale"}]'::jsonb,
        false, true, true, 30),
      (p_macro_id, 'garanzia_prodotto_anni', 'Garanzia prodotto', 'number', 'anni', '[]'::jsonb, false, true, true, 40),
      (p_macro_id, 'garanzia_potenza_anni', 'Garanzia potenza lineare', 'number', 'anni', '[]'::jsonb, false, false, true, 50),
      (p_macro_id, 'tensione_voc', 'Tensione Voc', 'number', 'V', '[]'::jsonb, false, false, true, 60),
      (p_macro_id, 'corrente_isc', 'Corrente Isc', 'number', 'A', '[]'::jsonb, false, false, true, 70),
      (p_macro_id, 'dimensioni', 'Dimensioni (LxAxP)', 'text', 'mm', '[]'::jsonb, false, false, true, 80)
    ON CONFLICT (macrocategoria_id, field_key) DO NOTHING;
    GET DIAGNOSTICS v_inserted = ROW_COUNT;

  ELSIF p_vertical = 'bagno' THEN
    INSERT INTO public.listino_macrocategoria_fields
      (macrocategoria_id, field_key, field_label, field_type, field_unit, field_options, required, show_in_picker, show_in_pdf, sort_order)
    VALUES
      (p_macro_id, 'materiale', 'Materiale', 'select', NULL,
        '[{"value":"ceramica","label":"Ceramica"},{"value":"porcellana","label":"Porcellana"},{"value":"acrilico","label":"Acrilico"},{"value":"vetroresina","label":"Vetroresina"},{"value":"acciaio","label":"Acciaio smaltato"},{"value":"cristallo","label":"Cristallo"}]'::jsonb,
        true, true, true, 10),
      (p_macro_id, 'dimensioni', 'Dimensioni (LxAxP)', 'text', 'cm', '[]'::jsonb, false, true, true, 20),
      (p_macro_id, 'tipo_scarico', 'Tipo scarico', 'select', NULL,
        '[{"value":"parete","label":"A parete"},{"value":"pavimento","label":"A pavimento"},{"value":"sospeso","label":"Sospeso"}]'::jsonb,
        false, true, true, 30),
      (p_macro_id, 'colore', 'Colore/Finitura', 'text', NULL, '[]'::jsonb, false, true, true, 40),
      (p_macro_id, 'rubinetteria_inclusa', 'Rubinetteria inclusa', 'boolean', NULL, '[]'::jsonb, false, true, true, 50)
    ON CONFLICT (macrocategoria_id, field_key) DO NOTHING;
    GET DIAGNOSTICS v_inserted = ROW_COUNT;

  ELSIF p_vertical = 'tetti' THEN
    INSERT INTO public.listino_macrocategoria_fields
      (macrocategoria_id, field_key, field_label, field_type, field_unit, field_options, required, show_in_picker, show_in_pdf, sort_order)
    VALUES
      (p_macro_id, 'tipo_copertura', 'Tipo copertura', 'select', NULL,
        '[{"value":"tegole","label":"Tegole"},{"value":"coppi","label":"Coppi"},{"value":"lamiera","label":"Lamiera"},{"value":"membrana","label":"Membrana"},{"value":"ardesia","label":"Ardesia"}]'::jsonb,
        true, true, true, 10),
      (p_macro_id, 'materiale', 'Materiale', 'text', NULL, '[]'::jsonb, false, true, true, 20),
      (p_macro_id, 'isolamento_lambda', 'Conducibilità termica λ', 'number', 'W/mK', '[]'::jsonb, false, false, true, 30),
      (p_macro_id, 'spessore', 'Spessore', 'number', 'mm', '[]'::jsonb, false, true, true, 40),
      (p_macro_id, 'reazione_fuoco', 'Reazione al fuoco', 'select', NULL,
        '[{"value":"a1","label":"A1"},{"value":"a2","label":"A2"},{"value":"b","label":"B"},{"value":"c","label":"C"},{"value":"d","label":"D"},{"value":"e","label":"E"},{"value":"f","label":"F"}]'::jsonb,
        false, false, true, 50)
    ON CONFLICT (macrocategoria_id, field_key) DO NOTHING;
    GET DIAGNOSTICS v_inserted = ROW_COUNT;
  END IF;

  RETURN v_inserted;
END;
$$ LANGUAGE plpgsql SECURITY INVOKER;

COMMENT ON FUNCTION public.seed_macro_fields_from_vertical IS
  'Popola la scheda tecnica di una macrocategoria con i campi standard del '
  'verticale indicato. Idempotente (ON CONFLICT DO NOTHING). '
  'Chiamato dall''UI Impostazioni → "Genera scheda tecnica standard".';

-- ─── 6. Backfill seed: per le macro con vertical inferito, seedare i campi
-- standard se la macro non ha ancora field_schema definiti. Best-effort,
-- l'admin può sempre modificare/eliminare dopo.

DO $$
DECLARE
  r RECORD;
  v TEXT;
BEGIN
  FOR r IN
    SELECT m.id, m.verticali_abilitati
    FROM public.listino_macrocategorie m
    WHERE cardinality(m.verticali_abilitati) > 0
      AND NOT EXISTS (
        SELECT 1 FROM public.listino_macrocategoria_fields f
        WHERE f.macrocategoria_id = m.id
      )
  LOOP
    -- Prendiamo solo il primo verticale (quello primario) per il seed
    v := r.verticali_abilitati[1];
    PERFORM public.seed_macro_fields_from_vertical(r.id, v);
  END LOOP;
END $$;

-- ─── 7. Notifica reload schema PostgREST ───────────────────────────────────
NOTIFY pgrst, 'reload schema';
