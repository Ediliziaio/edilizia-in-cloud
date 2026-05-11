-- ═══════════════════════════════════════════════════════════════════════════
-- Sprint S6 — 3 nuovi template sistema sopralluoghi
--   - Cappotto Termico
--   - Tetto / Coperture
--   - Climatizzazione (split + pompa di calore)
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

-- ═══════════════════════════════════════════════════════════════════════════
-- CAPPOTTO TERMICO
-- ═══════════════════════════════════════════════════════════════════════════

INSERT INTO public.survey_templates (
  company_id, category, name, description, is_system, is_active,
  area_label, area_label_plural, element_label, schema, version
)
SELECT
  NULL, 'cappotto',
  'Rilievo Cappotto Termico',
  'Sopralluogo per realizzazione cappotto termico esterno o interno. Misura facciate, individua ponti termici e vincoli.',
  true, true,
  'Facciata', 'Facciate', 'Sistema',
  $sch$
  {
    "version": 1,
    "header_schema": [
      {
        "key": "immobile",
        "label": "Immobile",
        "icon": "home",
        "default_open": true,
        "fields": [
          {"key": "tipo_immobile", "label": "Tipo immobile", "type": "select", "required": true, "width": 6,
            "options": [
              {"value": "villa", "label": "Villa singola"},
              {"value": "villetta_schiera", "label": "Villetta a schiera"},
              {"value": "condominio", "label": "Condominio"},
              {"value": "edificio_uso_misto", "label": "Edificio uso misto"}
            ]},
          {"key": "anno_costruzione", "label": "Anno costruzione", "type": "number", "min": 1900, "max": 2030, "width": 6},
          {"key": "n_piani", "label": "Numero piani fuori terra", "type": "number", "min": 1, "max": 20, "width": 6},
          {"key": "presenza_balconi", "label": "Presenza balconi", "type": "boolean", "width": 6},
          {"key": "vincolo_paesaggistico", "label": "Vincoli paesaggistici", "type": "boolean", "width": 6, "help": "Se sì, colore facciata obbligatorio"},
          {"key": "delibera_condominiale", "label": "Delibera condominiale acquisita", "type": "boolean", "width": 6}
        ]
      },
      {
        "key": "logistica",
        "label": "Logistica cantiere",
        "icon": "truck",
        "fields": [
          {"key": "spazio_ponteggio", "label": "Spazio disponibile per ponteggio", "type": "select", "width": 12,
            "options": [
              {"value": "ampio", "label": "Ampio (marciapiede esteso)"},
              {"value": "limitato", "label": "Limitato (marciapiede stretto)"},
              {"value": "rotaia", "label": "Su carreggiata stradale"},
              {"value": "facciata_interna", "label": "Solo facciata interna cortile"}
            ]},
          {"key": "occupazione_suolo_pubblico", "label": "Necessità occupazione suolo pubblico", "type": "boolean", "width": 6},
          {"key": "presenza_alberi_obstacles", "label": "Presenza alberi/ostacoli", "type": "boolean", "width": 6}
        ]
      }
    ],
    "area_definition": {
      "label": "Facciata",
      "label_plural": "Facciate",
      "name_suggestions": ["Facciata Sud", "Facciata Nord", "Facciata Est", "Facciata Ovest", "Cortile interno"],
      "fields": [
        {"key": "esposizione", "label": "Esposizione", "type": "select", "required": true, "width": 6,
          "options": [
            {"value": "sud", "label": "Sud"}, {"value": "nord", "label": "Nord"},
            {"value": "est", "label": "Est"}, {"value": "ovest", "label": "Ovest"},
            {"value": "sud_est", "label": "Sud-Est"}, {"value": "sud_ovest", "label": "Sud-Ovest"}
          ]},
        {"key": "superficie_mq", "label": "Superficie facciata", "type": "dimension", "unit": "mq", "required": true, "width": 6, "help": "Misurata al netto di finestre"},
        {"key": "n_finestre", "label": "N. finestre/aperture", "type": "number", "min": 0, "width": 4},
        {"key": "presenza_balconi_facciata", "label": "Balconi presenti", "type": "number", "min": 0, "width": 4},
        {"key": "altezza_max", "label": "Altezza massima", "type": "dimension", "unit": "m", "width": 4},
        {"key": "intonaco_attuale", "label": "Intonaco attuale", "type": "select", "width": 6,
          "options": [
            {"value": "buono", "label": "Buono stato"},
            {"value": "da_consolidare", "label": "Da consolidare"},
            {"value": "da_rimuovere", "label": "Da rimuovere completamente"},
            {"value": "ad_intonaco_armato", "label": "Già con intonaco armato"}
          ]},
        {"key": "ponti_termici_visibili", "label": "Ponti termici visibili (muffe, condensa)", "type": "boolean", "width": 6}
      ],
      "required_photos": [
        {"key": "vista_intera", "label": "Vista intera facciata", "required": true},
        {"key": "particolare_intonaco", "label": "Particolare intonaco esistente", "required": true},
        {"key": "ponti_termici", "label": "Ponti termici / muffe (se presenti)", "required": false}
      ]
    },
    "element_types": [
      {
        "key": "sistema_cappotto",
        "label": "Sistema cappotto",
        "label_plural": "Sistemi cappotto",
        "icon": "Layers",
        "sections": [
          {
            "key": "isolante",
            "label": "Materiale isolante",
            "fields": [
              {"key": "tipo_isolante", "label": "Tipo isolante", "type": "select", "required": true, "width": 6,
                "options": [
                  {"value": "eps_grafitato", "label": "EPS grafitato (neopor)"},
                  {"value": "eps_bianco", "label": "EPS bianco"},
                  {"value": "lana_roccia", "label": "Lana di roccia"},
                  {"value": "fibra_legno", "label": "Fibra di legno"},
                  {"value": "sughero", "label": "Sughero"},
                  {"value": "xps", "label": "XPS estruso"}
                ]},
              {"key": "spessore", "label": "Spessore", "type": "dimension", "unit": "cm", "required": true, "width": 6, "min": 6, "max": 20, "help": "Tipico: 8-16 cm"},
              {"key": "lambda", "label": "Conduttività lambda (W/mK)", "type": "number", "step": 0.001, "width": 6, "placeholder": "Es. 0.031"},
              {"key": "reazione_fuoco", "label": "Reazione al fuoco", "type": "select", "width": 6,
                "options": [
                  {"value": "a1", "label": "A1 (incombustibile)"},
                  {"value": "a2_s1_d0", "label": "A2-s1, d0"},
                  {"value": "b_s1_d0", "label": "B-s1, d0"},
                  {"value": "e", "label": "E"}
                ]}
            ]
          },
          {
            "key": "finitura",
            "label": "Finitura",
            "fields": [
              {"key": "rasante", "label": "Rasante", "type": "select", "width": 6,
                "options": [
                  {"value": "minerale", "label": "Minerale base calce"},
                  {"value": "cemento", "label": "Cementizio"},
                  {"value": "polimerico", "label": "Polimerico"}
                ]},
              {"key": "rete", "label": "Rete portarasante", "type": "select", "width": 6,
                "options": [
                  {"value": "fibra_vetro_standard", "label": "Fibra di vetro standard"},
                  {"value": "rinforzata", "label": "Rete rinforzata"}
                ]},
              {"key": "finitura_finale", "label": "Finitura finale", "type": "select", "width": 6,
                "options": [
                  {"value": "silossanico", "label": "Silossanico"},
                  {"value": "silicato", "label": "Silicato di potassio"},
                  {"value": "acril_silossanico", "label": "Acril-silossanico"},
                  {"value": "minerale_pittura", "label": "Pittura minerale"}
                ]},
              {"key": "colore", "label": "Colore (RAL/NCS)", "type": "color", "width": 6}
            ]
          }
        ],
        "required_photos": [
          {"key": "esempio_finitura", "label": "Riferimento finitura/colore", "required": false}
        ],
        "allow_quantity": false
      },
      {
        "key": "intervento_decorativi",
        "label": "Lavori decorativi/marcapiani",
        "label_plural": "Decorativi",
        "sections": [
          {
            "key": "specifica",
            "label": "Specifica",
            "fields": [
              {"key": "tipo_decorativo", "label": "Tipo", "type": "select", "width": 6,
                "options": [
                  {"value": "marcapiano", "label": "Marcapiano"},
                  {"value": "cornicione", "label": "Cornicione di gronda"},
                  {"value": "lesene", "label": "Lesene"},
                  {"value": "soglia_davanzale", "label": "Soglie e davanzali"}
                ]},
              {"key": "metri_lineari", "label": "Metri lineari", "type": "dimension", "unit": "ml", "required": true, "width": 6}
            ]
          }
        ],
        "required_photos": []
      }
    ],
    "general_required_photos": [
      {"key": "vista_generale", "label": "Vista generale immobile", "required": true},
      {"key": "ponteggio_accesso", "label": "Punto accesso ponteggio", "required": true},
      {"key": "vincoli_circostanti", "label": "Vincoli circostanti (alberi/cavi)", "required": false}
    ],
    "output_mapping": {
      "estimate_lines": {
        "sistema_cappotto": {
          "description_template": "Cappotto {tipo_isolante} sp. {spessore} cm + rasante {rasante} + finitura {finitura_finale} {colore}",
          "unit": "mq"
        },
        "intervento_decorativi": {
          "description_template": "{tipo_decorativo} - {metri_lineari} ml",
          "unit": "ml"
        }
      }
    }
  }
  $sch$::jsonb,
  1
WHERE NOT EXISTS (
  SELECT 1 FROM public.survey_templates
  WHERE is_system = true AND category = 'cappotto'
);

-- ═══════════════════════════════════════════════════════════════════════════
-- TETTO / COPERTURE
-- ═══════════════════════════════════════════════════════════════════════════

INSERT INTO public.survey_templates (
  company_id, category, name, description, is_system, is_active,
  area_label, area_label_plural, element_label, schema, version
)
SELECT
  NULL, 'tetto',
  'Rilievo Tetto e Coperture',
  'Sopralluogo per rifacimento manto di copertura, coibentazione sottotetto, linea vita, lattoneria.',
  true, true,
  'Falda', 'Falde', 'Intervento',
  $sch$
  {
    "version": 1,
    "header_schema": [
      {
        "key": "immobile",
        "label": "Immobile",
        "icon": "home",
        "default_open": true,
        "fields": [
          {"key": "tipo_tetto", "label": "Tipologia tetto", "type": "select", "required": true, "width": 6,
            "options": [
              {"value": "a_falde", "label": "A falde"},
              {"value": "piano", "label": "Piano (terrazza)"},
              {"value": "misto", "label": "Misto"},
              {"value": "mansardato", "label": "Mansardato"}
            ]},
          {"key": "n_falde", "label": "Numero falde", "type": "number", "min": 1, "max": 8, "width": 6},
          {"key": "presenza_terrazzo", "label": "Terrazzi accessibili", "type": "boolean", "width": 6},
          {"key": "altezza_gronda", "label": "Altezza gronda da terra", "type": "dimension", "unit": "m", "width": 6, "help": "Necessaria per dimensionare ponteggio"},
          {"key": "vincoli", "label": "Vincoli paesaggistici", "type": "boolean", "width": 6},
          {"key": "accesso_tetto", "label": "Accesso al tetto", "type": "select", "width": 6,
            "options": [
              {"value": "abbaino", "label": "Abbaino"},
              {"value": "lucernario", "label": "Lucernario"},
              {"value": "scala_esterna", "label": "Scala esterna"},
              {"value": "solo_ponteggio", "label": "Solo da ponteggio"}
            ]}
        ]
      }
    ],
    "area_definition": {
      "label": "Falda",
      "label_plural": "Falde",
      "name_suggestions": ["Falda Sud", "Falda Nord", "Falda Est", "Falda Ovest"],
      "fields": [
        {"key": "esposizione", "label": "Esposizione", "type": "select", "required": true, "width": 6,
          "options": [
            {"value": "sud", "label": "Sud"}, {"value": "nord", "label": "Nord"},
            {"value": "est", "label": "Est"}, {"value": "ovest", "label": "Ovest"}
          ]},
        {"key": "superficie_mq", "label": "Superficie falda", "type": "dimension", "unit": "mq", "required": true, "width": 6},
        {"key": "inclinazione", "label": "Inclinazione", "type": "dimension", "unit": "gradi", "min": 0, "max": 70, "width": 4},
        {"key": "manto_attuale", "label": "Manto attuale", "type": "select", "width": 8,
          "options": [
            {"value": "tegole_marsigliesi", "label": "Tegole marsigliesi"},
            {"value": "coppi", "label": "Coppi"},
            {"value": "lamiera", "label": "Lamiera"},
            {"value": "guaina", "label": "Guaina bituminosa"},
            {"value": "amianto", "label": "Amianto/Eternit (attenzione)"},
            {"value": "lastre_cemento", "label": "Lastre cemento"}
          ]},
        {"key": "stato_manto", "label": "Stato manto", "type": "select", "width": 6,
          "options": [
            {"value": "buono", "label": "Buono"},
            {"value": "da_manutenere", "label": "Da manutenere"},
            {"value": "da_rifare", "label": "Da rifare totalmente"}
          ]},
        {"key": "presenza_camini", "label": "N. camini/canne fumarie", "type": "number", "min": 0, "width": 6},
        {"key": "presenza_abbaini", "label": "N. abbaini/lucernari", "type": "number", "min": 0, "width": 6},
        {"key": "presenza_pannelli_fv", "label": "Pannelli FV esistenti", "type": "boolean", "width": 6, "help": "Se sì, prevedere smontaggio/rimontaggio"}
      ],
      "required_photos": [
        {"key": "vista_falda", "label": "Vista falda intera", "required": true},
        {"key": "particolare_manto", "label": "Particolare manto", "required": true},
        {"key": "punti_critici", "label": "Punti critici (gronda, camini)", "required": false}
      ]
    },
    "element_types": [
      {
        "key": "nuovo_manto",
        "label": "Nuovo manto di copertura",
        "label_plural": "Manti",
        "icon": "Layers",
        "sections": [
          {
            "key": "specifica",
            "label": "Specifica",
            "fields": [
              {"key": "tipo_manto", "label": "Tipologia nuovo manto", "type": "select", "required": true, "width": 6,
                "options": [
                  {"value": "tegole_portoghesi", "label": "Tegole portoghesi"},
                  {"value": "tegole_marsigliesi", "label": "Tegole marsigliesi"},
                  {"value": "coppi", "label": "Coppi tradizionali"},
                  {"value": "lamiera_aggraffata", "label": "Lamiera aggraffata"},
                  {"value": "tegola_canadese", "label": "Tegola canadese"}
                ]},
              {"key": "colore", "label": "Colore", "type": "select", "width": 6,
                "options": [
                  {"value": "rosso_naturale", "label": "Rosso naturale"},
                  {"value": "antichizzato", "label": "Antichizzato (mix)"},
                  {"value": "ardesia", "label": "Ardesia / antracite"},
                  {"value": "marrone", "label": "Marrone"}
                ]}
            ]
          }
        ],
        "required_photos": [
          {"key": "riferimento_colore", "label": "Riferimento colore voluto", "required": false}
        ],
        "allow_quantity": false
      },
      {
        "key": "coibentazione",
        "label": "Coibentazione",
        "label_plural": "Coibentazioni",
        "icon": "Layers",
        "sections": [
          {
            "key": "specifica",
            "label": "Specifica",
            "fields": [
              {"key": "tipo_intervento", "label": "Tipo intervento", "type": "select", "required": true, "width": 6,
                "options": [
                  {"value": "estradosso", "label": "Estradosso (sopra travatura)"},
                  {"value": "intradosso", "label": "Intradosso (sotto travatura)"},
                  {"value": "tra_travetti", "label": "Tra i travetti"}
                ]},
              {"key": "isolante", "label": "Isolante", "type": "select", "width": 6,
                "options": [
                  {"value": "fibra_legno", "label": "Fibra di legno"},
                  {"value": "lana_roccia", "label": "Lana di roccia"},
                  {"value": "xps", "label": "XPS"},
                  {"value": "pir", "label": "PIR poliuretano"}
                ]},
              {"key": "spessore", "label": "Spessore", "type": "dimension", "unit": "cm", "required": true, "width": 6, "min": 8, "max": 30}
            ]
          }
        ],
        "required_photos": [],
        "allow_quantity": false
      },
      {
        "key": "linea_vita",
        "label": "Linea vita anticaduta",
        "label_plural": "Linee vita",
        "icon": "ShieldCheck",
        "sections": [
          {
            "key": "specifica",
            "label": "Specifica",
            "fields": [
              {"key": "tipo", "label": "Tipologia", "type": "select", "width": 6,
                "options": [
                  {"value": "classe_a_punto", "label": "Classe A (punti fissi)"},
                  {"value": "classe_c_cavo", "label": "Classe C (cavo continuo)"},
                  {"value": "classe_d_binario", "label": "Classe D (binario)"}
                ]},
              {"key": "metri_lineari", "label": "Metri lineari", "type": "dimension", "unit": "ml", "width": 6},
              {"key": "n_ancoraggi", "label": "Numero ancoraggi", "type": "number", "min": 0, "width": 6}
            ]
          }
        ],
        "required_photos": []
      },
      {
        "key": "lattoneria",
        "label": "Lattoneria (grondaie, scossaline)",
        "label_plural": "Lattoneria",
        "icon": "Wrench",
        "sections": [
          {
            "key": "specifica",
            "label": "Specifica",
            "fields": [
              {"key": "elemento", "label": "Elemento", "type": "select", "required": true, "width": 6,
                "options": [
                  {"value": "grondaia", "label": "Grondaia"},
                  {"value": "pluviale", "label": "Pluviale (discendente)"},
                  {"value": "scossalina", "label": "Scossalina"},
                  {"value": "compluvio", "label": "Compluvio"},
                  {"value": "converso", "label": "Converso"}
                ]},
              {"key": "materiale", "label": "Materiale", "type": "select", "width": 6,
                "options": [
                  {"value": "rame", "label": "Rame"},
                  {"value": "alluminio", "label": "Alluminio preverniciato"},
                  {"value": "lamiera_zincata", "label": "Lamiera zincata"},
                  {"value": "pvc", "label": "PVC"}
                ]},
              {"key": "metri_lineari", "label": "Metri lineari", "type": "dimension", "unit": "ml", "required": true, "width": 6}
            ]
          }
        ],
        "required_photos": []
      }
    ],
    "general_required_photos": [
      {"key": "vista_generale", "label": "Vista generale tetto", "required": true},
      {"key": "punto_accesso", "label": "Punto accesso al tetto", "required": true},
      {"key": "vincoli_vicini", "label": "Vincoli edifici vicini", "required": false}
    ],
    "output_mapping": {
      "estimate_lines": {
        "nuovo_manto": {"description_template": "Nuovo manto {tipo_manto} {colore}", "unit": "mq"},
        "coibentazione": {"description_template": "Coibentazione {tipo_intervento} con {isolante} sp. {spessore} cm", "unit": "mq"},
        "linea_vita": {"description_template": "Linea vita {tipo} - {metri_lineari} ml", "unit": "ml"},
        "lattoneria": {"description_template": "{elemento} {materiale} - {metri_lineari} ml", "unit": "ml"}
      }
    }
  }
  $sch$::jsonb,
  1
WHERE NOT EXISTS (
  SELECT 1 FROM public.survey_templates
  WHERE is_system = true AND category = 'tetto'
);

-- ═══════════════════════════════════════════════════════════════════════════
-- CLIMATIZZAZIONE
-- ═══════════════════════════════════════════════════════════════════════════

INSERT INTO public.survey_templates (
  company_id, category, name, description, is_system, is_active,
  area_label, area_label_plural, element_label, schema, version
)
SELECT
  NULL, 'climatizzazione',
  'Rilievo Climatizzazione',
  'Sopralluogo per impianto di climatizzazione: split, multisplit, pompa di calore aria-acqua.',
  true, true,
  'Stanza', 'Stanze', 'Unità',
  $sch$
  {
    "version": 1,
    "header_schema": [
      {
        "key": "impianto_esistente",
        "label": "Impianto esistente",
        "icon": "wrench",
        "default_open": true,
        "fields": [
          {"key": "presente", "label": "Impianto esistente", "type": "select", "required": true, "width": 6,
            "options": [
              {"value": "nessuno", "label": "Nessuno"},
              {"value": "split_obsoleto", "label": "Split obsoleti"},
              {"value": "split_funzionante", "label": "Split funzionante (integrazione)"},
              {"value": "termoconvettori", "label": "Termoconvettori"},
              {"value": "caldaia_gas", "label": "Caldaia gas (sostituzione PdC)"}
            ]},
          {"key": "fluido_attuale", "label": "Fluido refrigerante attuale", "type": "select", "width": 6,
            "options": [
              {"value": "r32", "label": "R32 (moderno)"},
              {"value": "r410a", "label": "R410A"},
              {"value": "r22", "label": "R22 (vecchio, sostituire)"},
              {"value": "non_so", "label": "Non noto"}
            ]}
        ]
      },
      {
        "key": "unita_esterna",
        "label": "Unità esterna",
        "icon": "wind",
        "fields": [
          {"key": "posizione_esterna", "label": "Posizione UE prevista", "type": "select", "required": true, "width": 6,
            "options": [
              {"value": "terrazzo_giardino", "label": "Terrazzo/giardino"},
              {"value": "balcone", "label": "Balcone"},
              {"value": "tetto_piano", "label": "Tetto piano"},
              {"value": "facciata_staffa", "label": "Su staffa facciata"},
              {"value": "vano_tecnico", "label": "Vano tecnico"}
            ]},
          {"key": "spazio_disponibile", "label": "Spazio disponibile", "type": "select", "width": 6,
            "options": [
              {"value": "ampio", "label": "Ampio (>1 m3)"},
              {"value": "ridotto", "label": "Ridotto"},
              {"value": "molto_ridotto", "label": "Molto ridotto (vano tecnico)"}
            ]},
          {"key": "lunghezza_cavi", "label": "Lunghezza percorso cavi/tubi", "type": "dimension", "unit": "ml", "required": true, "width": 6, "help": "Da UE a unità interna più lontana"},
          {"key": "altezza_dislivello", "label": "Dislivello UE-UI", "type": "dimension", "unit": "m", "width": 6}
        ]
      }
    ],
    "area_definition": {
      "label": "Stanza",
      "label_plural": "Stanze",
      "name_suggestions": ["Soggiorno", "Camera da letto", "Cucina", "Studio", "Camera ospiti"],
      "fields": [
        {"key": "mq", "label": "Mq stanza", "type": "dimension", "unit": "mq", "required": true, "width": 6},
        {"key": "altezza_soffitto", "label": "Altezza soffitto", "type": "dimension", "unit": "cm", "width": 6},
        {"key": "esposizione", "label": "Esposizione", "type": "select", "width": 6,
          "options": [
            {"value": "sud", "label": "Sud"}, {"value": "nord", "label": "Nord"},
            {"value": "est", "label": "Est"}, {"value": "ovest", "label": "Ovest"}
          ]},
        {"key": "uso", "label": "Uso prevalente", "type": "select", "width": 6,
          "options": [
            {"value": "giorno", "label": "Zona giorno"},
            {"value": "notte", "label": "Zona notte"},
            {"value": "studio_lavoro", "label": "Studio/lavoro"}
          ]}
      ],
      "required_photos": [
        {"key": "vista_stanza", "label": "Vista stanza con metro", "required": true},
        {"key": "posizione_split_prevista", "label": "Posizione split prevista", "required": false}
      ]
    },
    "element_types": [
      {
        "key": "split",
        "label": "Split interno",
        "label_plural": "Split interni",
        "icon": "Snowflake",
        "sections": [
          {
            "key": "specifica",
            "label": "Specifica",
            "fields": [
              {"key": "potenza_btu", "label": "Potenza", "type": "select", "required": true, "width": 6,
                "options": [
                  {"value": "9000", "label": "9.000 BTU (~2,5 kW)"},
                  {"value": "12000", "label": "12.000 BTU (~3,5 kW)"},
                  {"value": "18000", "label": "18.000 BTU (~5 kW)"},
                  {"value": "24000", "label": "24.000 BTU (~7 kW)"}
                ]},
              {"key": "tipologia", "label": "Tipologia", "type": "select", "width": 6,
                "options": [
                  {"value": "parete_alta", "label": "A parete (alta)"},
                  {"value": "parete_bassa", "label": "A parete (bassa/console)"},
                  {"value": "cassetta", "label": "A cassetta (controsoffitto)"},
                  {"value": "canalizzato", "label": "Canalizzato"},
                  {"value": "soffitto_pavimento", "label": "Soffitto/pavimento"}
                ]},
              {"key": "classe_energetica", "label": "Classe energetica", "type": "select", "width": 6,
                "options": [
                  {"value": "a_plus_plus_plus", "label": "A+++"},
                  {"value": "a_plus_plus", "label": "A++"},
                  {"value": "a_plus", "label": "A+"},
                  {"value": "a", "label": "A"}
                ]},
              {"key": "wifi", "label": "Controllo WiFi", "type": "boolean", "width": 6}
            ]
          }
        ],
        "required_photos": [
          {"key": "parete_installazione", "label": "Parete installazione + interasse uscite", "required": true}
        ]
      },
      {
        "key": "pompa_calore",
        "label": "Pompa di calore aria-acqua",
        "label_plural": "Pompe di calore",
        "icon": "Zap",
        "sections": [
          {
            "key": "specifica",
            "label": "Specifica",
            "fields": [
              {"key": "potenza_kw", "label": "Potenza termica", "type": "dimension", "unit": "kw", "required": true, "width": 6},
              {"key": "tipo", "label": "Tipo", "type": "select", "width": 6,
                "options": [
                  {"value": "monoblocco", "label": "Monoblocco"},
                  {"value": "split", "label": "Split (UE + UI)"},
                  {"value": "ibrida", "label": "Ibrida (PdC + caldaia)"}
                ]},
              {"key": "scop", "label": "SCOP riscaldamento", "type": "number", "step": 0.1, "min": 2, "max": 6, "width": 6, "placeholder": "Es. 4.2"},
              {"key": "refrigerante", "label": "Refrigerante", "type": "select", "width": 6,
                "options": [
                  {"value": "r32", "label": "R32"},
                  {"value": "r290", "label": "R290 propano (eco)"},
                  {"value": "r410a", "label": "R410A"}
                ]},
              {"key": "produzione_acs", "label": "Produzione acqua calda sanitaria", "type": "boolean", "width": 12}
            ]
          }
        ],
        "required_photos": [
          {"key": "punto_installazione", "label": "Punto installazione UE", "required": true},
          {"key": "vano_tecnico", "label": "Vano tecnico per accumulo/bollitore", "required": false}
        ]
      }
    ],
    "general_required_photos": [
      {"key": "quadro_elettrico", "label": "Quadro elettrico + libero su barra DIN", "required": true, "hint": "Verificare presenza differenziale dedicato"},
      {"key": "punto_uscita_condense", "label": "Punto scarico condense previsto", "required": true},
      {"key": "facciata_passaggio_cavi", "label": "Facciata percorso cavi UE→UI", "required": false}
    ],
    "output_mapping": {
      "estimate_lines": {
        "split": {
          "description_template": "Split {tipologia} {potenza_btu} BTU classe {classe_energetica}",
          "unit": "pz",
          "quantity_field": "quantity"
        },
        "pompa_calore": {
          "description_template": "Pompa di calore {tipo} {potenza_kw} kW SCOP {scop}",
          "unit": "pz",
          "quantity_field": "quantity"
        }
      }
    }
  }
  $sch$::jsonb,
  1
WHERE NOT EXISTS (
  SELECT 1 FROM public.survey_templates
  WHERE is_system = true AND category = 'climatizzazione'
);

COMMIT;
