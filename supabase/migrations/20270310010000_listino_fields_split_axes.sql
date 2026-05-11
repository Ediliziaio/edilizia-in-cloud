-- ═══════════════════════════════════════════════════════════════════════════
-- Separazione scheda tecnica vs variabili di preventivo (ex "assi")
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Razionale UX: alcuni campi nello seed "serramentista" della scheda tecnica
-- variano per ogni preventivo (colore_interno, colore_esterno, tipo_apertura)
-- e sono già gestiti dalla feature "Variabili Prodotto" (ex "Assi di variazione"),
-- che permette al commerciale di scegliere il valore in fase di preventivo
-- con eventuale maggiorazione di prezzo.
--
-- Manteniamo la scheda tecnica per le caratteristiche INTRINSECHE del modello
-- (materiale profilo, vetro, Uw, numero camere) — quelle costanti per quel
-- prodotto. Le "variazioni" (colore, apertura) restano negli assi.
--
-- Idempotente.

-- ─── 1. Aggiorna la funzione seed per non più includere i 3 campi mossi ──

CREATE OR REPLACE FUNCTION public.seed_macro_fields_from_vertical(
  p_macro_id UUID,
  p_vertical TEXT
) RETURNS INTEGER AS $$
DECLARE v_inserted INTEGER := 0;
BEGIN
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
      (p_macro_id, 'trasmittanza_ug', 'Trasmittanza Ug (vetro)', 'number', 'W/m²K', '[]'::jsonb, false, false, true, 50)
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
      (p_macro_id, 'rubinetteria_inclusa', 'Rubinetteria inclusa', 'boolean', NULL, '[]'::jsonb, false, true, true, 40)
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
      (p_macro_id, 'isolamento_lambda', 'Conducibilità termica lambda', 'number', 'W/mK', '[]'::jsonb, false, false, true, 30),
      (p_macro_id, 'spessore', 'Spessore', 'number', 'mm', '[]'::jsonb, false, true, true, 40),
      (p_macro_id, 'reazione_fuoco', 'Reazione al fuoco', 'select', NULL,
        '[{"value":"a1","label":"A1"},{"value":"a2","label":"A2"},{"value":"b","label":"B"},{"value":"c","label":"C"},{"value":"d","label":"D"},{"value":"e","label":"E"},{"value":"f","label":"F"}]'::jsonb,
        false, false, true, 50)
    ON CONFLICT (macrocategoria_id, field_key) DO NOTHING;
    GET DIAGNOSTICS v_inserted = ROW_COUNT;

  -- Bagno: rimosso "colore" (variazione di preventivo, gestita via variabili prodotto).
  END IF;

  RETURN v_inserted;
END;
$$ LANGUAGE plpgsql SECURITY INVOKER;

-- ─── 2. Pulizia record già seedati: rimuovi i campi che diventano "variabili" ──
-- I valori eventualmente compilati su singoli articoli per questi campi vanno persi:
-- è il comportamento atteso perché sono ora gestiti come variabili di prodotto.

DELETE FROM public.listino_macrocategoria_fields
WHERE field_key IN ('colore_interno', 'colore_esterno', 'tipo_apertura', 'colore');

NOTIFY pgrst, 'reload schema';
