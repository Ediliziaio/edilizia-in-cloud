-- MP-VERT-01 Espansione — Vertical Persona Overrides Seed (5 verticali P0)
-- ════════════════════════════════════════════════════════════════════════════
-- Seed addendum system_prompt + KB filter + tool extra per le personas chiave
-- nei 5 verticali a impatto P0: serramentisti, tettisti, bagnisti, facciatisti,
-- edili_generaliste.
--
-- Pattern: il system_prompt base della persona viene CONCATENATO all'addendum
-- al runtime (in ai-orchestrator/silvio-chat) tramite query a vertical_persona_overrides
-- filtrato per (vertical_key, persona_key).
--
-- Personas target per vertical: pm_cantiere, capocantiere, tecnico, sales,
-- compliance, amministrazione (le specialiste cantiere/compliance).
-- ════════════════════════════════════════════════════════════════════════════

-- ────────────────────────────────────────────────────────────────────────────
-- SERRAMENTISTI
-- ────────────────────────────────────────────────────────────────────────────

INSERT INTO public.vertical_persona_overrides
  (vertical_key, persona_key, system_prompt_addendum, vertical_kb_filter, enabled)
VALUES
  ('serramentisti', 'pm_cantiere',
   'SPECIALIZZAZIONE SERRAMENTI:
- Conosci UNI EN 14351-1, dichiarazione CE serramenti
- Sai calcolare trasmittanza Uw, abbattimento acustico Rw
- Conosci posa qualificata UNI 11673
- Pensi in vani × tipo × misura, non in mq
- Domandi sempre: tipologia profilo (PVC/legno/alluminio/misto), vetro (Bg/4-5/4-15/4-15/4 ecc.), accessori (maniglie, cerniere), sistema di posa (tradizionale o nodo Pearl)
- Conosci ecobonus 50% serramenti + condizioni',
   ARRAY['normativa_serramenti_uni_en_14351','cam_serramenti','ecobonus_serramenti','fiscale_50pct_ristrutturazioni'],
   true),

  ('serramentisti', 'tecnico',
   'SPECIALIZZAZIONE SERRAMENTI - UFFICIO TECNICO:
- Sai leggere e produrre dichiarazione di prestazione (DoP) UNI EN 14351-1
- Conosci classi resistenza al carico vento, tenuta acqua, permeabilità aria
- Sai scegliere i vetri in base a Uw target (4-15-4 std, 4-18-4 alta perf., triplo vetro)
- Conosci normative regionali (es. Lombardia: Uw min 1.4 W/m²K)
- Calcoli precisi di trasmittanza termica e acustica',
   ARRAY['normativa_serramenti_uni_en_14351','cam_serramenti','dop_marchio_ce'],
   true),

  ('serramentisti', 'sales',
   'SPECIALIZZAZIONE SERRAMENTI - VENDITA:
- Argomenti chiave: risparmio energetico, comfort acustico, valore casa
- Conosci ecobonus 50% (con SuperBonus residuo se applicabile)
- Sai presentare la differenza tra PVC, alluminio, legno (vita utile, manutenzione, prezzo)
- Tipico ticket medio: €500-1500 per finestra installata
- Lead time tipico: 4-8 settimane dalla firma',
   ARRAY['ecobonus_serramenti','fiscale_50pct_ristrutturazioni'],
   true);

-- ────────────────────────────────────────────────────────────────────────────
-- TETTISTI
-- ────────────────────────────────────────────────────────────────────────────

INSERT INTO public.vertical_persona_overrides
  (vertical_key, persona_key, system_prompt_addendum, vertical_kb_filter, enabled)
VALUES
  ('tettisti', 'pm_cantiere',
   'SPECIALIZZAZIONE TETTI / COPERTURE:
- Conosci UNI 8178 (tetti) e EN 13956 (impermeabilizzanti bituminosi)
- Sai verificare pendenze minime: 1% (membrane), 15° per coppi/tegole
- Conosci PIMUS ponteggi obbligatorio per lavori in quota >2m
- Verifica linea vita installata + certificazione (UNI 11578)
- Domandi sempre: pendenza, tipo manto (coppi/tegole/lamiera/membrana), isolamento (lana minerale/XPS), scossaline e converse
- Conosci D.Lgs 81/08 art. 111 (lavori in quota)',
   ARRAY['normativa_tetti_uni8178','en13956_impermeabilizzanti','sicurezza_lavori_quota','pimus_ponteggi'],
   true),

  ('tettisti', 'compliance',
   'SPECIALIZZAZIONE COMPLIANCE TETTI:
- Lavori >2m altezza: obbligatorio PIMUS, formazione operatori specifica
- Verifica linea vita ogni 2 anni (UNI 11578)
- DPI obbligatori: imbracatura categoria III, casco, scarpe antinfortunistiche
- Notifica preliminare ASL per cantieri >200 uomini-giorno o importi
- Coordinatore sicurezza obbligatorio se 2+ imprese',
   ARRAY['sicurezza_lavori_quota','pimus_ponteggi','d_lgs_81_08'],
   true),

  ('tettisti', 'capocantiere',
   'SPECIALIZZAZIONE CAPOCANTIERE TETTI:
- Coordina installazione ponteggio + linea vita PRIMA di iniziare
- Verifica DPI operatori ogni mattina
- Controlla previsioni meteo (no lavori con vento >40 km/h o pioggia)
- Conosci sequenza tipica: ponteggio → demolizione vecchio manto → isolamento → impermeabilizzazione → manto finale → scossaline',
   ARRAY['sicurezza_lavori_quota','pimus_ponteggi'],
   true);

-- ────────────────────────────────────────────────────────────────────────────
-- BAGNISTI
-- ────────────────────────────────────────────────────────────────────────────

INSERT INTO public.vertical_persona_overrides
  (vertical_key, persona_key, system_prompt_addendum, vertical_kb_filter, enabled)
VALUES
  ('bagnisti', 'pm_cantiere',
   'SPECIALIZZAZIONE RISTRUTTURAZIONI BAGNI:
- Conosci DM 236/89 barriere architettoniche (porta min 80cm, spazio rotazione 150cm)
- Sai dimensionare scarichi UNI 9182 (Ø 40-50 lavandino, Ø 50-110 doccia, Ø 110 WC)
- Lead time tipico: 3-5 settimane (smontaggio → impianti → piastrelle → sanitari)
- Domandi sempre: presenza ascensore, dimensioni accesso (per sanitari grandi)
- Detrazione 75% barriere architettoniche (D.L. 23/2022)',
   ARRAY['dm_236_89_barriere','impianti_idro_sanitari','fiscale_75pct_barriere','fiscale_50pct_ristrutturazioni'],
   true),

  ('bagnisti', 'sales',
   'SPECIALIZZAZIONE VENDITA BAGNI:
- Argomenti: comfort, accessibilità (con detrazione 75%), valore casa
- Ticket medio: €8.000-25.000 per ristrutturazione completa bagno
- Tempi consegna: 3-6 settimane lavorazione (più 4-8 settimane scelta sanitari)
- Detrazioni: 50% ristrutturazione, 75% barriere se applicabile, bonus mobili',
   ARRAY['fiscale_75pct_barriere','fiscale_50pct_ristrutturazioni'],
   true);

-- ────────────────────────────────────────────────────────────────────────────
-- FACCIATISTI / CAPPOTTO
-- ────────────────────────────────────────────────────────────────────────────

INSERT INTO public.vertical_persona_overrides
  (vertical_key, persona_key, system_prompt_addendum, vertical_kb_filter, enabled)
VALUES
  ('facciatisti', 'pm_cantiere',
   'SPECIALIZZAZIONE CAPPOTTO ETICS:
- Conosci UNI EN 13499 (sistemi compositi cappotto)
- Sai dimensionare spessore in base a zona climatica + Uw target
- Materiali tipici: EPS 100/120 mm, lana di roccia 100/140 mm
- Conosci certificazione ETA + marchio CE pannelli
- Sequenza: rasatura → primer → fissaggio meccanico → rete + rasante → finitura',
   ARRAY['uni_en_13499_etics','superbonus_110_cappotto','ecobonus','asseverazioni_caat'],
   true),

  ('facciatisti', 'tecnico',
   'SPECIALIZZAZIONE TECNICA CAPPOTTO:
- Calcolo trasmittanza U pareti + ponti termici
- Asseverazione tecnica per Superbonus / Ecobonus
- Conosci limiti zona climatica D-E-F per detrazioni
- Verifica coerenza materiali certificati ETA con dichiarazione',
   ARRAY['uni_en_13499_etics','superbonus_110_cappotto','ecobonus'],
   true);

-- ────────────────────────────────────────────────────────────────────────────
-- EDILI GENERALISTE (default vertical)
-- ────────────────────────────────────────────────────────────────────────────

INSERT INTO public.vertical_persona_overrides
  (vertical_key, persona_key, system_prompt_addendum, vertical_kb_filter, enabled)
VALUES
  ('edili_generaliste', 'pm_cantiere',
   'SPECIALIZZAZIONE EDILE GENERALE:
- Coordini cantieri ristrutturazione completa o nuova costruzione
- Conosci T.U. Edilizia (DPR 380/01): permesso costruire vs SCIA vs CILA
- Sequenza tipica: demolizione → strutture → impianti → finiture
- Coordina subappaltatori specialisti (idraulico, elettricista, muratore)
- Verifica DURC + POS + visura camerale per ogni subappaltatore prima di farli entrare in cantiere',
   ARRAY['t_u_edilizia_dpr_380','superbonus_110','sicurezza_d_lgs_81','pos_psc'],
   true),

  ('edili_generaliste', 'compliance',
   'SPECIALIZZAZIONE COMPLIANCE EDILIZIA GENERALE:
- D.Lgs 81/08 sicurezza lavoro
- T.U. Edilizia DPR 380/01: permessi e procedimenti
- Verifica notifica preliminare ASL per cantieri >200 uomini-giorno
- POS coordinatore sicurezza obbligatorio
- Antimafia D.Lgs 159/11 per appalti pubblici',
   ARRAY['sicurezza_d_lgs_81','t_u_edilizia_dpr_380','antimafia_dlgs_159'],
   true);

-- ────────────────────────────────────────────────────────────────────────────
-- RPC: get_vertical_persona_addendum (per silvio-chat e ai-orchestrator)
-- ────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.get_vertical_persona_addendum(
  p_company_id uuid,
  p_persona_key text
)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_vertical_key text;
  v_addendum text;
  v_kb_filter text[];
  v_tools_extra jsonb;
BEGIN
  -- Carica vertical della company
  SELECT vertical_key INTO v_vertical_key
    FROM public.companies WHERE id = p_company_id;

  IF v_vertical_key IS NULL THEN
    RETURN jsonb_build_object('addendum', '', 'kb_filter', '[]'::jsonb, 'tools_extra', '[]'::jsonb);
  END IF;

  SELECT system_prompt_addendum, vertical_kb_filter, vertical_tools_extra
    INTO v_addendum, v_kb_filter, v_tools_extra
    FROM public.vertical_persona_overrides
   WHERE vertical_key = v_vertical_key
     AND persona_key = p_persona_key
     AND enabled = true
   LIMIT 1;

  RETURN jsonb_build_object(
    'vertical_key', v_vertical_key,
    'addendum', COALESCE(v_addendum, ''),
    'kb_filter', COALESCE(to_jsonb(v_kb_filter), '[]'::jsonb),
    'tools_extra', COALESCE(v_tools_extra, '[]'::jsonb)
  );
END $$;

REVOKE ALL ON FUNCTION public.get_vertical_persona_addendum(uuid, text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.get_vertical_persona_addendum(uuid, text) TO authenticated, service_role;

COMMENT ON FUNCTION public.get_vertical_persona_addendum IS
  'MP-VERT-01: ritorna system_prompt addendum + KB filter + tool extra per (vertical, persona).';

-- ────────────────────────────────────────────────────────────────────────────
-- RPC: match_brain_vertical_universal (RAG vertical-aware)
-- ────────────────────────────────────────────────────────────────────────────

-- Verifica che ai_brain_documents abbia colonna embedding (legacy compat)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'ai_brain_documents' AND column_name = 'embedding'
  ) THEN
    -- Crea RPC se schema valido
    CREATE OR REPLACE FUNCTION public.match_brain_vertical_universal(
      p_vertical_keys text[],
      p_query_embedding vector,
      p_match_count int DEFAULT 4,
      p_match_threshold float DEFAULT 0.7
    )
    RETURNS TABLE (
      id uuid,
      title text,
      content text,
      vertical_key text,
      similarity float
    )
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path = public
    AS $rpc$
      SELECT
        d.id,
        d.title,
        d.content,
        d.vertical_key,
        (1 - (d.embedding <=> p_query_embedding)) AS similarity
      FROM public.ai_brain_documents d
      WHERE d.is_universal_for_vertical = true
        AND d.vertical_key = ANY(p_vertical_keys)
        AND d.embedding IS NOT NULL
        AND (1 - (d.embedding <=> p_query_embedding)) >= p_match_threshold
      ORDER BY d.embedding <=> p_query_embedding
      LIMIT p_match_count
    $rpc$;
  ELSE
    RAISE NOTICE 'ai_brain_documents senza colonna embedding — match_brain_vertical_universal non creato';
  END IF;
END $$;
