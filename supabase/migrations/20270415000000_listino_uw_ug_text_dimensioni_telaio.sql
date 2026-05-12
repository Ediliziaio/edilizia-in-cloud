-- ═══════════════════════════════════════════════════════════════════════════
-- Listino serramentista — Uw/Ug come testo + nuovo campo dimensioni_telaio
-- ═══════════════════════════════════════════════════════════════════════════
-- Motivazione: i commerciali inseriscono le trasmittanze nel formato dichiarato
-- dal produttore, spesso con comparatori ("<1.3", "≤ 1.1") perché i certificati
-- riportano un *limite garantito* invece di un valore puntuale.
--   Es. cataloghi PVC scrivono "Uw < 1.3 W/m²K" → con field_type='number' il
--   commerciale era costretto a smarrire il "<" e digitare un valore arbitrario
--   (1.3 oppure 1.29) che non corrispondeva al certificato.
--
-- Soluzione: cambiare field_type da 'number' a 'text' per trasmittanza_uw e
-- trasmittanza_ug. Il field_unit (W/m²K) e l'help guida resta, il rendering
-- diventa <Input> di testo libero. Il valore in scheda PDF è già renderizzato
-- via formatDisplayValue() che fa toString() ed è compatibile.
--
-- Inoltre: nuovo campo 'dimensioni_telaio' non obbligatorio (es. "70×80 mm" o
-- "1200×1500 mm"), utile per l'anteprima tecnica nel picker e nel PDF.
--
-- Idempotente: UPDATE + INSERT ON CONFLICT DO NOTHING su (macro_id, field_key).

-- ─── 1) Macrocategorie esistenti: cambio field_type a 'text' ──────────────
UPDATE public.listino_macrocategoria_fields
SET
  field_type = 'text',
  field_help = 'Es. <1.3, ≤ 1.1 oppure 0.9. Accetta confronti e simboli del certificato.',
  field_placeholder = '<1.3 oppure 0.9',
  updated_at = now()
WHERE field_key IN ('trasmittanza_uw', 'trasmittanza_ug');

-- ─── 2) Macrocategorie esistenti: nuovo campo dimensioni_telaio ───────────
-- Inserito solo per macrocategorie con vertical 'serramentista'.
-- sort_order=28 lo posiziona dopo spessore_profilo (25) e prima di tipo_vetro (30).
INSERT INTO public.listino_macrocategoria_fields
  (macrocategoria_id, field_key, field_label, field_type, field_unit,
   field_options, field_placeholder, field_help, required, show_in_picker,
   show_in_pdf, sort_order)
SELECT
  id, 'dimensioni_telaio', 'Dimensioni telaio',
  'text', 'mm',
  '[]'::jsonb,
  'Es. 70×80 mm oppure 1200×1500 mm',
  'Sezione del profilo telaio o ingombro tipico del serramento. Indicativo: le misure reali si rilevano in sopralluogo.',
  false, false, true, 28
FROM public.listino_macrocategorie
WHERE 'serramentista' = ANY(verticali_abilitati)
ON CONFLICT (macrocategoria_id, field_key) DO NOTHING;

-- ─── 3) Aggiorna seed function per future macrocategorie serramentista ───
-- Stessa logica della v2 (20270311010000), modifiche:
--   - trasmittanza_uw/ug: 'number' → 'text', help/placeholder aggiornati
--   - aggiunto 'dimensioni_telaio' (sort 28)
-- Le altre verticali (fotovoltaico, bagno, tetti) restano invariate.

CREATE OR REPLACE FUNCTION public.seed_macro_fields_from_vertical(
  p_macro_id UUID,
  p_vertical TEXT
) RETURNS INTEGER AS $$
DECLARE v_inserted INTEGER := 0;
BEGIN

  IF p_vertical = 'serramentista' THEN
    INSERT INTO public.listino_macrocategoria_fields
      (macrocategoria_id, field_key, field_label, field_type, field_unit,
       field_options, field_placeholder, field_help, required, show_in_picker, show_in_pdf, sort_order)
    VALUES
      (p_macro_id, 'materiale_profilo', 'Materiale profilo', 'select', NULL,
        '[{"value":"pvc","label":"PVC"},
          {"value":"pvc_alluminio","label":"PVC-alluminio"},
          {"value":"alluminio","label":"Alluminio"},
          {"value":"alluminio_tt","label":"Alluminio taglio termico"},
          {"value":"legno","label":"Legno"},
          {"value":"legno_alluminio","label":"Legno-alluminio"}]'::jsonb,
        NULL,
        'Materiale del telaio. PVC=isolamento alto, Alluminio TT=design+slim, Legno=naturale.',
        true, true, true, 10),
      (p_macro_id, 'num_camere', 'Numero camere profilo', 'number', NULL,
        '[]'::jsonb, NULL,
        'Camere d''aria del profilo. Più camere = maggiore isolamento termico.',
        false, true, true, 20),
      (p_macro_id, 'spessore_profilo', 'Spessore profilo', 'number', 'mm',
        '[]'::jsonb, NULL,
        'Spessore costruttivo del telaio (60–88 mm tipico per PVC).',
        false, false, true, 25),
      (p_macro_id, 'dimensioni_telaio', 'Dimensioni telaio', 'text', 'mm',
        '[]'::jsonb,
        'Es. 70×80 mm oppure 1200×1500 mm',
        'Sezione del profilo telaio o ingombro tipico del serramento. Indicativo: le misure reali si rilevano in sopralluogo.',
        false, false, true, 28),
      (p_macro_id, 'tipo_vetro', 'Tipo vetro', 'select', NULL,
        '[{"value":"doppio","label":"Doppio"},
          {"value":"doppio_be","label":"Doppio basso-emissivo"},
          {"value":"triplo","label":"Triplo basso-emissivo"},
          {"value":"antifurto_p4a","label":"Antifurto P4A"},
          {"value":"antifurto_p5a","label":"Antifurto P5A"},
          {"value":"acustico","label":"Acustico Rw ≥ 38 dB"},
          {"value":"satinato","label":"Satinato/decorato"}]'::jsonb,
        NULL,
        'Stratigrafia vetro. Triplo basso-em. = top per Uw < 1.0.',
        true, true, true, 30),
      (p_macro_id, 'spessore_vetro', 'Stratigrafia vetro', 'text', NULL,
        '[]'::jsonb, NULL,
        'Es. 4-16-4 (doppio) o 4-12-4-12-4 (triplo). Numeri in mm.',
        false, false, true, 35),
      (p_macro_id, 'trasmittanza_uw', 'Trasmittanza Uw (serramento)', 'text', 'W/m²K',
        '[]'::jsonb,
        '<1.3 oppure 0.9',
        'Es. <1.3, ≤ 1.1 oppure 0.9. Accetta confronti e simboli del certificato. < 1.4 = ecobonus, < 1.1 = top di gamma.',
        false, true, true, 40),
      (p_macro_id, 'trasmittanza_ug', 'Trasmittanza Ug (solo vetro)', 'text', 'W/m²K',
        '[]'::jsonb,
        '<1.1 oppure 0.6',
        'Es. <1.1, ≤ 0.8 oppure 0.6. Isolamento del solo pacchetto vetro (escluso telaio).',
        false, false, true, 50),
      (p_macro_id, 'fattore_g', 'Fattore solare g', 'number', NULL,
        '[]'::jsonb, NULL,
        'Frazione di energia solare trasmessa (0-1). Più alto = più caldo d''estate.',
        false, false, true, 55),
      (p_macro_id, 'permeabilita_aria', 'Permeabilità aria', 'select', NULL,
        '[{"value":"classe_1","label":"Classe 1"},
          {"value":"classe_2","label":"Classe 2"},
          {"value":"classe_3","label":"Classe 3"},
          {"value":"classe_4","label":"Classe 4 (massima tenuta)"}]'::jsonb,
        NULL,
        'EN 12207. Classe 4 = ermeticità top.',
        false, false, true, 60),
      (p_macro_id, 'isolamento_acustico', 'Isolamento acustico Rw', 'number', 'dB',
        '[]'::jsonb, NULL,
        'Riduzione rumore. ≥ 38 dB consigliato per case su strada.',
        false, false, true, 65),
      (p_macro_id, 'guarnizioni', 'Numero guarnizioni', 'select', NULL,
        '[{"value":"2","label":"2 (standard)"},
          {"value":"3","label":"3 (medio)"},
          {"value":"4","label":"4 (premium con guarnizione centrale)"}]'::jsonb,
        NULL,
        'Più guarnizioni = miglior tenuta aria/acqua e acustica.',
        false, false, true, 70),
      (p_macro_id, 'marcatura_ce', 'Marcatura CE', 'boolean', NULL,
        '[]'::jsonb, NULL,
        'Obbligatoria per legge sui serramenti destinati a edifici.',
        false, false, true, 80)
    ON CONFLICT (macrocategoria_id, field_key) DO NOTHING;
    GET DIAGNOSTICS v_inserted = ROW_COUNT;

  ELSIF p_vertical = 'fotovoltaico' THEN
    INSERT INTO public.listino_macrocategoria_fields
      (macrocategoria_id, field_key, field_label, field_type, field_unit,
       field_options, field_help, required, show_in_picker, show_in_pdf, sort_order)
    VALUES
      (p_macro_id, 'potenza_wp', 'Potenza nominale', 'number', 'Wp',
        '[]'::jsonb,
        'Potenza in condizioni STC. Moduli residenziali tipici: 400–500 Wp.',
        true, true, true, 10),
      (p_macro_id, 'efficienza_pct', 'Efficienza modulo', 'number', '%',
        '[]'::jsonb,
        'Rendimento conversione luce→energia. > 21% = alta efficienza.',
        false, true, true, 20),
      (p_macro_id, 'tecnologia_celle', 'Tecnologia celle', 'select', NULL,
        '[{"value":"mono_perc","label":"Monocristallino PERC"},
          {"value":"topcon","label":"TOPCon (N-type)"},
          {"value":"hjt","label":"Eterogiunzione HJT"},
          {"value":"ibc","label":"IBC (back-contact)"},
          {"value":"bifacciale","label":"Bifacciale"},
          {"value":"poli","label":"Policristallino"}]'::jsonb,
        'TOPCon/HJT = generazione recente, alta efficienza e bassa degradazione.',
        false, true, true, 30),
      (p_macro_id, 'num_celle', 'Numero celle', 'number', NULL,
        '[]'::jsonb,
        'Tipico: 108-120-132 celle per modulo residenziale.',
        false, false, true, 35),
      (p_macro_id, 'coefficiente_temp', 'Coefficiente temperatura Pmax', 'number', '%/°C',
        '[]'::jsonb,
        'Perdita di potenza per °C oltre 25°C. -0.30%/°C è ottimo.',
        false, false, true, 40),
      (p_macro_id, 'tensione_voc', 'Tensione Voc (circuito aperto)', 'number', 'V',
        '[]'::jsonb,
        'Necessaria per dimensionare le stringhe sull''inverter.',
        false, false, true, 45),
      (p_macro_id, 'corrente_isc', 'Corrente Isc (corto circuito)', 'number', 'A',
        '[]'::jsonb,
        'Necessaria per i calcoli MPPT inverter.',
        false, false, true, 50),
      (p_macro_id, 'garanzia_prodotto_anni', 'Garanzia prodotto', 'number', 'anni',
        '[]'::jsonb,
        'Garanzia su difetti fabbricazione. Marchi premium: 25–30 anni.',
        false, true, true, 60),
      (p_macro_id, 'garanzia_potenza_anni', 'Garanzia potenza lineare', 'number', 'anni',
        '[]'::jsonb,
        'Anni di garanzia sulla curva di degradazione (es. 25 anni a 87%).',
        false, false, true, 65),
      (p_macro_id, 'dimensioni', 'Dimensioni (LxAxP)', 'text', 'mm',
        '[]'::jsonb,
        'Ingombro modulo. Tipico: 1722×1134×30 mm.',
        false, false, true, 70),
      (p_macro_id, 'peso', 'Peso modulo', 'number', 'kg',
        '[]'::jsonb,
        'Importante per dimensionare la struttura del tetto.',
        false, false, true, 75),
      (p_macro_id, 'certificazioni', 'Certificazioni', 'multiselect', NULL,
        '[{"value":"iec61215","label":"IEC 61215"},
          {"value":"iec61730","label":"IEC 61730"},
          {"value":"iec61701","label":"IEC 61701 (resistenza salina)"},
          {"value":"iec62716","label":"IEC 62716 (ammoniaca)"},
          {"value":"ul1703","label":"UL 1703"}]'::jsonb,
        'Certificazioni internazionali del modulo.',
        false, false, true, 85)
    ON CONFLICT (macrocategoria_id, field_key) DO NOTHING;
    GET DIAGNOSTICS v_inserted = ROW_COUNT;

  ELSIF p_vertical = 'bagno' THEN
    INSERT INTO public.listino_macrocategoria_fields
      (macrocategoria_id, field_key, field_label, field_type, field_unit,
       field_options, field_help, required, show_in_picker, show_in_pdf, sort_order)
    VALUES
      (p_macro_id, 'materiale', 'Materiale', 'select', NULL,
        '[{"value":"ceramica","label":"Ceramica"},
          {"value":"porcellana","label":"Porcellana (vitreous china)"},
          {"value":"fireclay","label":"Fireclay"},
          {"value":"acrilico","label":"Acrilico"},
          {"value":"vetroresina","label":"Vetroresina"},
          {"value":"acciaio_smaltato","label":"Acciaio smaltato"},
          {"value":"cristallo_temperato","label":"Cristallo temperato"},
          {"value":"corian","label":"Corian / pietra acrilica"}]'::jsonb,
        'Materiale principale. Porcellana = top per sanitari, cristallo temperato per box doccia.',
        true, true, true, 10),
      (p_macro_id, 'dimensioni', 'Dimensioni (LxPxH)', 'text', 'cm',
        '[]'::jsonb,
        'Larghezza × Profondità × Altezza in cm.',
        false, true, true, 20),
      (p_macro_id, 'installazione', 'Tipo installazione', 'select', NULL,
        '[{"value":"sospeso","label":"Sospeso a parete"},
          {"value":"pavimento","label":"A pavimento"},
          {"value":"semi_incasso","label":"Semi-incasso"},
          {"value":"incasso","label":"Incasso totale"},
          {"value":"appoggio","label":"Da appoggio"}]'::jsonb,
        'Modalità di montaggio. Sospeso = pulizia facile, design premium.',
        false, true, true, 30),
      (p_macro_id, 'tipo_scarico', 'Tipo scarico', 'select', NULL,
        '[{"value":"parete","label":"A parete"},
          {"value":"pavimento","label":"A pavimento"},
          {"value":"universale","label":"Universale"}]'::jsonb,
        'Verificare la predisposizione idraulica esistente.',
        false, true, true, 40),
      (p_macro_id, 'spessore_cristallo', 'Spessore cristallo', 'number', 'mm',
        '[]'::jsonb,
        'Solo per box doccia. 6–8 mm standard, 10 mm premium.',
        false, false, true, 50),
      (p_macro_id, 'trattamento_anticalcare', 'Trattamento anticalcare', 'boolean', NULL,
        '[]'::jsonb,
        'Vetro/superficie trattata contro depositi di calcare.',
        false, true, true, 60),
      (p_macro_id, 'rubinetteria_inclusa', 'Rubinetteria inclusa', 'boolean', NULL,
        '[]'::jsonb,
        'Indica se la rubinetteria è compresa nel prezzo.',
        false, true, true, 70),
      (p_macro_id, 'garanzia_anni', 'Garanzia', 'number', 'anni',
        '[]'::jsonb,
        'Garanzia del produttore.',
        false, false, true, 80)
    ON CONFLICT (macrocategoria_id, field_key) DO NOTHING;
    GET DIAGNOSTICS v_inserted = ROW_COUNT;

  ELSIF p_vertical = 'tetti' THEN
    INSERT INTO public.listino_macrocategoria_fields
      (macrocategoria_id, field_key, field_label, field_type, field_unit,
       field_options, field_help, required, show_in_picker, show_in_pdf, sort_order)
    VALUES
      (p_macro_id, 'tipo_copertura', 'Tipo copertura', 'select', NULL,
        '[{"value":"tegole_marsigliesi","label":"Tegole marsigliesi"},
          {"value":"tegole_portoghesi","label":"Tegole portoghesi"},
          {"value":"coppi","label":"Coppi"},
          {"value":"lamiera_grecata","label":"Lamiera grecata"},
          {"value":"lamiera_aggraffata","label":"Lamiera aggraffata"},
          {"value":"membrana_bituminosa","label":"Membrana bituminosa"},
          {"value":"membrana_pvc","label":"Membrana PVC"},
          {"value":"ardesia","label":"Ardesia naturale"},
          {"value":"verde","label":"Tetto verde"}]'::jsonb,
        'Tipologia di manto di copertura.',
        true, true, true, 10),
      (p_macro_id, 'materiale_base', 'Materiale base', 'select', NULL,
        '[{"value":"cotto","label":"Cotto / terracotta"},
          {"value":"cemento","label":"Cemento"},
          {"value":"alluminio","label":"Alluminio"},
          {"value":"zinco_titanio","label":"Zinco-titanio"},
          {"value":"acciaio","label":"Acciaio"},
          {"value":"rame","label":"Rame"},
          {"value":"pietra","label":"Pietra"}]'::jsonb,
        'Materia prima del manto.',
        false, true, true, 20),
      (p_macro_id, 'isolamento_lambda', 'Conducibilità termica λ', 'number', 'W/mK',
        '[]'::jsonb,
        'Solo per isolanti. Più basso = miglior isolamento (0.022–0.040).',
        false, false, true, 30),
      (p_macro_id, 'spessore', 'Spessore', 'number', 'mm',
        '[]'::jsonb,
        'Spessore del materiale/pannello isolante.',
        false, true, true, 40),
      (p_macro_id, 'resistenza_termica', 'Resistenza termica R', 'number', 'm²K/W',
        '[]'::jsonb,
        'Capacità isolante (spessore/λ). > 4.5 per cappotti termici.',
        false, false, true, 45),
      (p_macro_id, 'reazione_fuoco', 'Reazione al fuoco', 'select', NULL,
        '[{"value":"a1","label":"A1 (incombustibile)"},
          {"value":"a2","label":"A2"},
          {"value":"b","label":"B"},
          {"value":"c","label":"C"},
          {"value":"d","label":"D"},
          {"value":"e","label":"E"},
          {"value":"f","label":"F"}]'::jsonb,
        'EN 13501-1. A1/A2 obbligatori per edifici pubblici.',
        false, false, true, 50),
      (p_macro_id, 'resistenza_vento', 'Resistenza al vento', 'select', NULL,
        '[{"value":"zona_a","label":"Zona A (≤ 25 m/s)"},
          {"value":"zona_b","label":"Zona B (≤ 30 m/s)"},
          {"value":"zona_c","label":"Zona C (≤ 35 m/s)"},
          {"value":"zona_d","label":"Zona D (> 35 m/s)"}]'::jsonb,
        'Zona di esposizione. Vedere mappa NTC 2018.',
        false, false, true, 60),
      (p_macro_id, 'gelivita', 'Resistenza al gelo', 'boolean', NULL,
        '[]'::jsonb,
        'Tegole certificate gelive per zone climatiche fredde.',
        false, false, true, 70),
      (p_macro_id, 'pezzi_per_mq', 'Pezzi per m²', 'number', 'pz/m²',
        '[]'::jsonb,
        'Densità di posa. Utile per calcolo materiale.',
        false, false, true, 80),
      (p_macro_id, 'garanzia_anni', 'Garanzia', 'number', 'anni',
        '[]'::jsonb,
        'Garanzia del produttore.',
        false, false, true, 90)
    ON CONFLICT (macrocategoria_id, field_key) DO NOTHING;
    GET DIAGNOSTICS v_inserted = ROW_COUNT;

  END IF;

  RETURN v_inserted;
END;
$$ LANGUAGE plpgsql SECURITY INVOKER;

NOTIFY pgrst, 'reload schema';
