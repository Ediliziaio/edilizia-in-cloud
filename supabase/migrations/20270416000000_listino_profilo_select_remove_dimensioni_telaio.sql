-- ═══════════════════════════════════════════════════════════════════════════
-- Profilo serramento: select con sezioni standard (60/66/70/76/80/82/88 mm)
-- ═══════════════════════════════════════════════════════════════════════════
-- Correzione semantica della migration precedente (20270415000000):
-- l'utente non voleva "Dimensioni telaio" (ingombro Lxh) ma il *Profilo* —
-- ovvero la sezione costruttiva del profilo telaio in mm di profondita'.
-- I cataloghi PVC indicano valori standard: 60, 66, 70, 76, 80, 82, 88 mm.
--
-- Modifiche:
--   1. DROP del campo 'dimensioni_telaio' creato nella migration precedente.
--   2. UPDATE del campo 'spessore_profilo' esistente:
--        - field_label: "Spessore profilo" -> "Profilo"
--        - field_type:  number -> select
--        - field_options: lista sezioni PVC standard
--        - show_in_picker: false -> true
--   3. CREATE OR REPLACE seed_macro_fields_from_vertical() coerente
--      (mantiene integralmente le altre verticali fotovoltaico/bagno/tetti).
--
-- Idempotente.

-- ─── 1) Rimozione dimensioni_telaio (era prematuro) ──────────────────────
DELETE FROM public.listino_macrocategoria_fields
WHERE field_key = 'dimensioni_telaio';

-- ─── 2) Aggiornamento campo 'profilo' (era 'spessore_profilo') ───────────
-- NB: field_key resta 'spessore_profilo' per compatibilita' con i valori
-- gia' salvati. Cambia solo label, tipo e opzioni.
UPDATE public.listino_macrocategoria_fields
SET
  field_label = 'Profilo',
  field_type = 'select',
  field_unit = 'mm',
  field_options = '[
    {"value":"60","label":"60 mm"},
    {"value":"66","label":"66 mm"},
    {"value":"70","label":"70 mm"},
    {"value":"76","label":"76 mm"},
    {"value":"80","label":"80 mm"},
    {"value":"82","label":"82 mm"},
    {"value":"88","label":"88 mm"}
  ]'::jsonb,
  field_placeholder = 'Seleziona sezione',
  field_help = 'Sezione costruttiva del profilo telaio. PVC standard: 70/76/82 mm. Maggiore = piu'' camere e migliore isolamento.',
  show_in_picker = true,
  required = false,
  updated_at = now()
WHERE field_key = 'spessore_profilo';

-- ─── 3) Aggiornamento seed function per future macrocategorie ────────────

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
        'Camere d''aria del profilo. Piu'' camere = maggiore isolamento termico.',
        false, true, true, 20),
      (p_macro_id, 'spessore_profilo', 'Profilo', 'select', 'mm',
        '[{"value":"60","label":"60 mm"},
          {"value":"66","label":"66 mm"},
          {"value":"70","label":"70 mm"},
          {"value":"76","label":"76 mm"},
          {"value":"80","label":"80 mm"},
          {"value":"82","label":"82 mm"},
          {"value":"88","label":"88 mm"}]'::jsonb,
        'Seleziona sezione',
        'Sezione costruttiva del profilo telaio. PVC standard: 70/76/82 mm. Maggiore = piu'' camere e migliore isolamento.',
        false, true, true, 25),
      (p_macro_id, 'tipo_vetro', 'Tipo vetro', 'select', NULL,
        '[{"value":"doppio","label":"Doppio"},
          {"value":"doppio_be","label":"Doppio basso-emissivo"},
          {"value":"triplo","label":"Triplo basso-emissivo"},
          {"value":"antifurto_p4a","label":"Antifurto P4A"},
          {"value":"antifurto_p5a","label":"Antifurto P5A"},
          {"value":"acustico","label":"Acustico Rw >= 38 dB"},
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
        'Es. <1.3, <= 1.1 oppure 0.9. Accetta confronti e simboli del certificato. < 1.4 = ecobonus, < 1.1 = top di gamma.',
        false, true, true, 40),
      (p_macro_id, 'trasmittanza_ug', 'Trasmittanza Ug (solo vetro)', 'text', 'W/m²K',
        '[]'::jsonb,
        '<1.1 oppure 0.6',
        'Es. <1.1, <= 0.8 oppure 0.6. Isolamento del solo pacchetto vetro (escluso telaio).',
        false, false, true, 50),
      (p_macro_id, 'fattore_g', 'Fattore solare g', 'number', NULL,
        '[]'::jsonb, NULL,
        'Frazione di energia solare trasmessa (0-1). Piu'' alto = piu'' caldo d''estate.',
        false, false, true, 55),
      (p_macro_id, 'permeabilita_aria', 'Permeabilita'' aria', 'select', NULL,
        '[{"value":"classe_1","label":"Classe 1"},
          {"value":"classe_2","label":"Classe 2"},
          {"value":"classe_3","label":"Classe 3"},
          {"value":"classe_4","label":"Classe 4 (massima tenuta)"}]'::jsonb,
        NULL,
        'EN 12207. Classe 4 = ermeticita'' top.',
        false, false, true, 60),
      (p_macro_id, 'isolamento_acustico', 'Isolamento acustico Rw', 'number', 'dB',
        '[]'::jsonb, NULL,
        'Riduzione rumore. >= 38 dB consigliato per case su strada.',
        false, false, true, 65),
      (p_macro_id, 'guarnizioni', 'Numero guarnizioni', 'select', NULL,
        '[{"value":"2","label":"2 (standard)"},
          {"value":"3","label":"3 (medio)"},
          {"value":"4","label":"4 (premium con guarnizione centrale)"}]'::jsonb,
        NULL,
        'Piu'' guarnizioni = miglior tenuta aria/acqua e acustica.',
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
        'Potenza in condizioni STC. Moduli residenziali tipici: 400-500 Wp.',
        true, true, true, 10),
      (p_macro_id, 'efficienza_pct', 'Efficienza modulo', 'number', '%',
        '[]'::jsonb,
        'Rendimento conversione luce-energia. > 21% = alta efficienza.',
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
        'Perdita di potenza per °C oltre 25°C. -0.30%/°C e'' ottimo.',
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
        'Garanzia su difetti fabbricazione. Marchi premium: 25-30 anni.',
        false, true, true, 60),
      (p_macro_id, 'garanzia_potenza_anni', 'Garanzia potenza lineare', 'number', 'anni',
        '[]'::jsonb,
        'Anni di garanzia sulla curva di degradazione (es. 25 anni a 87%).',
        false, false, true, 65),
      (p_macro_id, 'dimensioni', 'Dimensioni (LxAxP)', 'text', 'mm',
        '[]'::jsonb,
        'Ingombro modulo. Tipico: 1722x1134x30 mm.',
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
        'Larghezza x Profondita'' x Altezza in cm.',
        false, true, true, 20),
      (p_macro_id, 'installazione', 'Tipo installazione', 'select', NULL,
        '[{"value":"sospeso","label":"Sospeso a parete"},
          {"value":"pavimento","label":"A pavimento"},
          {"value":"semi_incasso","label":"Semi-incasso"},
          {"value":"incasso","label":"Incasso totale"},
          {"value":"appoggio","label":"Da appoggio"}]'::jsonb,
        'Modalita'' di montaggio. Sospeso = pulizia facile, design premium.',
        false, true, true, 30),
      (p_macro_id, 'tipo_scarico', 'Tipo scarico', 'select', NULL,
        '[{"value":"parete","label":"A parete"},
          {"value":"pavimento","label":"A pavimento"},
          {"value":"universale","label":"Universale"}]'::jsonb,
        'Verificare la predisposizione idraulica esistente.',
        false, true, true, 40),
      (p_macro_id, 'spessore_cristallo', 'Spessore cristallo', 'number', 'mm',
        '[]'::jsonb,
        'Solo per box doccia. 6-8 mm standard, 10 mm premium.',
        false, false, true, 50),
      (p_macro_id, 'trattamento_anticalcare', 'Trattamento anticalcare', 'boolean', NULL,
        '[]'::jsonb,
        'Vetro/superficie trattata contro depositi di calcare.',
        false, true, true, 60),
      (p_macro_id, 'rubinetteria_inclusa', 'Rubinetteria inclusa', 'boolean', NULL,
        '[]'::jsonb,
        'Indica se la rubinetteria e'' compresa nel prezzo.',
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
      (p_macro_id, 'isolamento_lambda', 'Conducibilita'' termica lambda', 'number', 'W/mK',
        '[]'::jsonb,
        'Solo per isolanti. Piu'' basso = miglior isolamento (0.022-0.040).',
        false, false, true, 30),
      (p_macro_id, 'spessore', 'Spessore', 'number', 'mm',
        '[]'::jsonb,
        'Spessore del materiale/pannello isolante.',
        false, true, true, 40),
      (p_macro_id, 'resistenza_termica', 'Resistenza termica R', 'number', 'm²K/W',
        '[]'::jsonb,
        'Capacita'' isolante (spessore/lambda). > 4.5 per cappotti termici.',
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
        '[{"value":"zona_a","label":"Zona A (<= 25 m/s)"},
          {"value":"zona_b","label":"Zona B (<= 30 m/s)"},
          {"value":"zona_c","label":"Zona C (<= 35 m/s)"},
          {"value":"zona_d","label":"Zona D (> 35 m/s)"}]'::jsonb,
        'Zona di esposizione. Vedere mappa NTC 2018.',
        false, false, true, 60),
      (p_macro_id, 'gelivita', 'Resistenza al gelo', 'boolean', NULL,
        '[]'::jsonb,
        'Tegole certificate gelive per zone climatiche fredde.',
        false, false, true, 70),
      (p_macro_id, 'pezzi_per_mq', 'Pezzi per m²', 'number', 'pz/m²',
        '[]'::jsonb,
        'Densita'' di posa. Utile per calcolo materiale.',
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
