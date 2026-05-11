-- ═══════════════════════════════════════════════════════════════════════════
-- Template Infissi v4 — semplificazione UX + colori globali + apertura DX/SX
-- ---------------------------------------------------------------------------
-- Modifiche da v3 (feedback utente "tecnico magari incapace di usare telefono"):
--   1. Tipo apertura: opzioni reali con direzione DX/SX (battente DX/SX,
--      anta-ribalta DX/SX, vasistas, scorrevole DX/SX/simmetrico, fisso,
--      a libro). Non più solo "battente"/"anta-ribalta".
--   2. COLORI GLOBALI: nuova sezione header "Colori e finiture (uguali per
--      tutti i pezzi)" con colore interno/esterno infissi + colore tapparelle/
--      cassonetti/zanzariere/persiane. Rimossi dalle singole sezioni elemento.
--   3. UX semplificata: sezione "Stato attuale" eliminata (poco usata),
--      "Maniglie" come campo opzionale a fondo pagina, "N. ante apribili"
--      eliminato (deducibile dalla tipologia)
--   4. Tutti i campi note opzionali alleggeriti, criticita unificata
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

UPDATE public.survey_templates
SET schema = $sch$
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
            {"value": "appartamento", "label": "Appartamento"},
            {"value": "villa", "label": "Villa"},
            {"value": "villetta", "label": "Villetta a schiera"},
            {"value": "ufficio", "label": "Ufficio"},
            {"value": "negozio", "label": "Negozio / locale commerciale"},
            {"value": "capannone", "label": "Capannone"},
            {"value": "altro", "label": "Altro"}
          ]},
        {"key": "piano", "label": "Piano", "type": "text", "width": 6, "placeholder": "es. 3° con ascensore"},
        {"key": "condominio", "label": "È in condominio", "type": "boolean", "width": 6},
        {"key": "vincolo_paesaggistico", "label": "Vincoli paesaggistici / storici", "type": "boolean", "width": 6, "help": "Se sì, colore facciata vincolato"}
      ]
    },
    {
      "key": "colori_globali",
      "label": "🎨 Colori e finiture (uguali per tutti i pezzi)",
      "description": "Compila qui i colori UNA VOLTA: vengono applicati a tutti gli infissi/tapparelle/persiane del sopralluogo. Se per qualche pezzo serve un colore diverso, segnalalo nelle note di quel pezzo.",
      "icon": "palette",
      "default_open": true,
      "fields": [
        {"key": "colore_interno_infissi", "label": "Colore interno infissi", "type": "text", "width": 6, "placeholder": "Es. Bianco RAL 9010 / Noce"},
        {"key": "colore_esterno_infissi", "label": "Colore esterno infissi", "type": "text", "width": 6, "placeholder": "Es. Antracite RAL 7016 / Quercia"},
        {"key": "colore_tapparelle", "label": "Colore tapparelle", "type": "text", "width": 6, "placeholder": "Es. Bianco / RAL grigio antracite", "help": "Lascia vuoto se non ci sono tapparelle"},
        {"key": "colore_cassonetti", "label": "Colore cassonetti", "type": "text", "width": 6, "placeholder": "Solitamente uguale tapparelle"},
        {"key": "colore_zanzariere", "label": "Colore profilo zanzariere", "type": "text", "width": 6, "placeholder": "Es. RAL 9010 bianco"},
        {"key": "colore_persiane", "label": "Colore persiane", "type": "text", "width": 6, "placeholder": "Es. Verde scuro RAL 6009"}
      ]
    },
    {
      "key": "logistica",
      "label": "Logistica e accesso",
      "icon": "truck",
      "fields": [
        {"key": "accesso", "label": "Accesso al cantiere", "type": "multiselect", "width": 12,
          "options": [
            {"value": "ascensore", "label": "Ascensore"},
            {"value": "scale", "label": "Solo scale"},
            {"value": "scala_esterna", "label": "Scala esterna / piattaforma"},
            {"value": "ztl", "label": "ZTL / accesso limitato"}
          ]},
        {"key": "trasporto", "label": "Trasporto idoneo", "type": "select", "width": 6,
          "options": [
            {"value": "camion", "label": "Camion grande"},
            {"value": "furgone", "label": "Furgone"},
            {"value": "furgone_piccolo", "label": "Furgone piccolo (vie strette)"}
          ]},
        {"key": "occupazione_suolo", "label": "Necessaria occupazione suolo pubblico", "type": "boolean", "width": 6}
      ]
    },
    {
      "key": "tempistica",
      "label": "Tempistica",
      "icon": "calendar",
      "fields": [
        {"key": "tempistica_giorni_medi", "label": "Giorni medi necessari per il lavoro", "type": "number", "width": 6, "min": 1, "max": 365, "placeholder": "Es. 15"},
        {"key": "tempistica_note", "label": "Note tempistica (opz.)", "type": "textarea", "width": 12, "placeholder": "Vincoli, ferie cliente, urgenze..."}
      ]
    }
  ],
  "area_definition": {
    "label": "Stanza",
    "label_plural": "Stanze",
    "name_suggestions": ["Soggiorno", "Cucina", "Camera da letto", "Camera ospiti", "Bagno", "Studio", "Mansarda", "Sala", "Disimpegno", "Ingresso"],
    "fields": [],
    "required_photos": [
      {"key": "panoramica", "label": "Foto panoramica stanza", "required": true, "hint": "Vista d'insieme con tutti gli infissi della stanza"}
    ]
  },
  "element_types": [
    {
      "key": "infisso",
      "label": "Infisso",
      "label_plural": "Infissi",
      "icon": "RectangleVertical",
      "description": "Finestre e portefinestre. Spunta i complementi (tapparella, cassonetto, ecc.) se da rilevare.",
      "allow_quantity": true,
      "sections": [
        {
          "key": "dati_chiave",
          "label": "1. Dati chiave",
          "description": "I dati più importanti per il preventivo",
          "default_open": true,
          "fields": [
            {"key": "tipologia", "label": "Che tipo di infisso è?", "type": "select", "required": true, "width": 12,
              "options": [
                {"value": "finestra_1anta", "label": "Finestra 1 anta"},
                {"value": "finestra_2ante", "label": "Finestra 2 ante"},
                {"value": "finestra_3ante", "label": "Finestra 3 ante"},
                {"value": "finestra_4ante", "label": "Finestra 4 ante"},
                {"value": "portafinestra_1anta", "label": "Portafinestra 1 anta"},
                {"value": "portafinestra_2ante", "label": "Portafinestra 2 ante"},
                {"value": "portafinestra_3ante", "label": "Portafinestra 3 ante"},
                {"value": "alzante_scorrevole", "label": "Alzante-scorrevole"},
                {"value": "scorrevole", "label": "Scorrevole"},
                {"value": "a_libro", "label": "A libro / pieghevole"},
                {"value": "bow_window", "label": "Bow-window (curva)"},
                {"value": "fisso", "label": "Fisso (non si apre)"},
                {"value": "lucernario", "label": "Lucernario"},
                {"value": "tonda_ovale", "label": "Tonda / ovale"}
              ]},
            {"key": "apertura", "label": "Come si apre?", "type": "select", "required": true, "width": 12,
              "help": "Mettiti DAVANTI all'infisso: la maniglia è a destra o a sinistra?",
              "options": [
                {"value": "battente_dx", "label": "🪟 Apertura a Destra (battente)"},
                {"value": "battente_sx", "label": "🪟 Apertura a Sinistra (battente)"},
                {"value": "anta_ribalta_dx", "label": "🪟 Anta-Ribalta a Destra"},
                {"value": "anta_ribalta_sx", "label": "🪟 Anta-Ribalta a Sinistra"},
                {"value": "due_ante_simmetriche", "label": "🪟 Due ante simmetriche (apertura centrale)"},
                {"value": "anta_ribalta_simmetrica", "label": "🪟 Due ante anta-ribalta"},
                {"value": "vasistas", "label": "🪟 Solo Ribalta (vasistas)"},
                {"value": "scorrevole_dx", "label": "↔️ Scorrevole verso Destra"},
                {"value": "scorrevole_sx", "label": "↔️ Scorrevole verso Sinistra"},
                {"value": "scorrevole_simmetrico", "label": "↔️ Scorrevole simmetrico"},
                {"value": "fisso", "label": "⬛ Fisso (non si apre)"},
                {"value": "a_libro_dx", "label": "📚 A libro verso Destra"},
                {"value": "a_libro_sx", "label": "📚 A libro verso Sinistra"}
              ]},
            {"key": "materiale_richiesto", "label": "Materiale nuovo", "type": "select", "required": true, "width": 6,
              "options": [
                {"value": "pvc", "label": "PVC"},
                {"value": "alluminio", "label": "Alluminio"},
                {"value": "alluminio_legno", "label": "Alluminio-legno"},
                {"value": "legno", "label": "Legno"}
              ]},
            {"key": "vetro", "label": "Tipo vetro", "type": "select", "width": 6,
              "options": [
                {"value": "doppio_camera", "label": "Doppio vetro camera (standard)"},
                {"value": "triplo_camera", "label": "Triplo vetro camera"},
                {"value": "satinato", "label": "Satinato (privacy)"},
                {"value": "basso_emissivo", "label": "Basso emissivo"},
                {"value": "antisfondamento", "label": "Antisfondamento"}
              ]}
          ]
        },
        {
          "key": "misure_foro",
          "label": "2. Misure foro",
          "description": "Misure prese SUL FORO vuoto (non sull'infisso esistente)",
          "default_open": true,
          "fields": [
            {"key": "larghezza_foro", "label": "Larghezza", "type": "dimension", "unit": "cm", "required": true, "width": 6, "placeholder": "Es. 120"},
            {"key": "altezza_foro", "label": "Altezza", "type": "dimension", "unit": "cm", "required": true, "width": 6, "placeholder": "Es. 150"},
            {"key": "spessore_muro", "label": "Spessore muro", "type": "dimension", "unit": "cm", "width": 4, "placeholder": "Es. 30"},
            {"key": "mazzetta_sx", "label": "Mazzetta SX", "type": "dimension", "unit": "cm", "width": 4, "placeholder": "Opzionale"},
            {"key": "mazzetta_dx", "label": "Mazzetta DX", "type": "dimension", "unit": "cm", "width": 4, "placeholder": "Opzionale"}
          ]
        },
        {
          "key": "telaio",
          "label": "3. Telaio (controtelaio nuovo)",
          "fields": [
            {"key": "tipo_telaio", "label": "Tipo telaio", "type": "select", "required": true, "width": 12,
              "options": [
                {"value": "l", "label": "A L (telaio piatto)"},
                {"value": "z_30", "label": "A Z 30 mm"},
                {"value": "z_35", "label": "A Z 35 mm"},
                {"value": "z_60", "label": "A Z 60 mm"},
                {"value": "z_65", "label": "A Z 65 mm"}
              ]},
            {"key": "lati_con_z", "label": "Su quali lati la Z?", "type": "multiselect", "width": 12,
              "help": "Spunta i lati dove va applicata la Z. Lascia tutti per Z completa.",
              "show_if": {"field": "tipo_telaio", "operator": "in", "value": ["z_30", "z_35", "z_60", "z_65"]},
              "options": [
                {"value": "alto", "label": "⬆️ Lato Alto"},
                {"value": "basso", "label": "⬇️ Lato Basso"},
                {"value": "dx", "label": "➡️ Lato Destro"},
                {"value": "sx", "label": "⬅️ Lato Sinistro"}
              ]}
          ]
        },
        {
          "key": "complementi",
          "label": "4. Cosa rilevo (complementi presenti?)",
          "description": "Spunta SOLO quello che è presente e da rilevare. Le sezioni di misura compaiono solo se attive.",
          "default_open": true,
          "fields": [
            {"key": "complementi", "label": "", "type": "multiselect", "width": 12,
              "options": [
                {"value": "tapparella", "label": "☑️ Tapparella"},
                {"value": "cassonetto", "label": "☑️ Cassonetto"},
                {"value": "zanzariera", "label": "☑️ Zanzariera"},
                {"value": "persiana", "label": "☑️ Persiana / Scuro"},
                {"value": "davanzale", "label": "☑️ Davanzale da rilevare"}
              ]}
          ]
        },
        {
          "key": "sez_tapparella",
          "label": "Tapparella",
          "description": "Colore: vedi sezione Colori in alto",
          "show_if": {"field": "complementi", "operator": "contains", "value": "tapparella"},
          "fields": [
            {"key": "tap_larghezza", "label": "Larghezza tapparella", "type": "dimension", "unit": "cm", "required": true, "width": 6},
            {"key": "tap_altezza", "label": "Altezza tapparella", "type": "dimension", "unit": "cm", "required": true, "width": 6},
            {"key": "tap_materiale", "label": "Materiale", "type": "select", "width": 6,
              "options": [
                {"value": "pvc", "label": "PVC"},
                {"value": "alluminio_coibentato", "label": "Alluminio coibentato"},
                {"value": "acciaio_blindato", "label": "Acciaio blindato"},
                {"value": "legno", "label": "Legno"}
              ]},
            {"key": "tap_tipo_motore", "label": "Comando", "type": "select", "width": 6,
              "options": [
                {"value": "manuale", "label": "🖐 Manuale (cinghia)"},
                {"value": "motorizzata_filo", "label": "⚡ Motorizzata a filo"},
                {"value": "motorizzata_radio", "label": "📡 Motorizzata radiocomando"},
                {"value": "domotica", "label": "📱 Domotica (Wifi/KNX)"}
              ]},
            {"key": "tap_accessori", "label": "Accessori inclusi", "type": "multiselect", "width": 12,
              "options": [
                {"value": "rulli", "label": "Rulli"},
                {"value": "guide", "label": "Guide laterali"},
                {"value": "calotte", "label": "Calotte"},
                {"value": "cinghia", "label": "Cinghia"},
                {"value": "motorino", "label": "Motorino"},
                {"value": "telecomando", "label": "Telecomando"},
                {"value": "tasselli", "label": "Tasselli fissaggio"},
                {"value": "molla_ricuperatore", "label": "Molla ricuperatore"}
              ]}
          ]
        },
        {
          "key": "sez_cassonetto",
          "label": "Cassonetto",
          "description": "Colore: vedi sezione Colori in alto",
          "show_if": {"field": "complementi", "operator": "contains", "value": "cassonetto"},
          "fields": [
            {"key": "cas_altezza", "label": "Altezza cassonetto", "type": "dimension", "unit": "cm", "required": true, "width": 4},
            {"key": "cas_larghezza", "label": "Larghezza cassonetto", "type": "dimension", "unit": "cm", "required": true, "width": 4},
            {"key": "cas_profondita", "label": "Profondità cassonetto", "type": "dimension", "unit": "cm", "required": true, "width": 4},
            {"key": "cas_cilindro", "label": "Diametro cilindro avvolgitore", "type": "dimension", "unit": "cm", "width": 6, "help": "Solo se presente"},
            {"key": "cas_tipo", "label": "Tipo cassonetto", "type": "select", "width": 6,
              "options": [
                {"value": "esterno", "label": "Esterno (visibile)"},
                {"value": "interno", "label": "Interno (in muratura)"},
                {"value": "monoblocco", "label": "Monoblocco"},
                {"value": "coibentato_nuovo", "label": "Da sostituire con coibentato"}
              ]}
          ]
        },
        {
          "key": "sez_zanzariera",
          "label": "Zanzariera",
          "description": "Colore profilo: vedi sezione Colori in alto",
          "show_if": {"field": "complementi", "operator": "contains", "value": "zanzariera"},
          "fields": [
            {"key": "zan_larghezza", "label": "Larghezza foro", "type": "dimension", "unit": "cm", "required": true, "width": 6},
            {"key": "zan_altezza", "label": "Altezza foro", "type": "dimension", "unit": "cm", "required": true, "width": 6},
            {"key": "zan_larghezza_telaio", "label": "Spessore profilo telaio zanz.", "type": "dimension", "unit": "cm", "width": 6, "help": "Larghezza del profilo della zanzariera, non del foro"},
            {"key": "zan_tipo", "label": "Tipo zanzariera", "type": "select", "width": 6,
              "options": [
                {"value": "fissa", "label": "Fissa"},
                {"value": "avvolgibile_verticale", "label": "Avvolgibile verticale"},
                {"value": "avvolgibile_laterale", "label": "Avvolgibile laterale"},
                {"value": "plissettata", "label": "Plissettata"},
                {"value": "doppia_anta", "label": "Doppia anta a battente"}
              ]}
          ]
        },
        {
          "key": "sez_persiana",
          "label": "Persiana / Scuro",
          "description": "Colore: vedi sezione Colori in alto",
          "show_if": {"field": "complementi", "operator": "contains", "value": "persiana"},
          "fields": [
            {"key": "per_larghezza", "label": "Larghezza persiana", "type": "dimension", "unit": "cm", "required": true, "width": 6},
            {"key": "per_altezza", "label": "Altezza persiana", "type": "dimension", "unit": "cm", "required": true, "width": 6},
            {"key": "per_aletta", "label": "Misura aletta (mm)", "type": "select", "required": true, "width": 6,
              "options": [
                {"value": "35", "label": "35 mm"},
                {"value": "60", "label": "60 mm"}
              ]},
            {"key": "per_tipo", "label": "Tipo apertura", "type": "select", "required": true, "width": 6,
              "options": [
                {"value": "battente", "label": "A battente"},
                {"value": "scorrevole", "label": "Scorrevole"}
              ]},
            {"key": "per_materiale", "label": "Materiale", "type": "select", "width": 6,
              "options": [
                {"value": "legno", "label": "Legno"},
                {"value": "alluminio", "label": "Alluminio"},
                {"value": "alluminio_effetto_legno", "label": "Alluminio effetto legno"},
                {"value": "pvc", "label": "PVC"}
              ]},
            {"key": "per_n_ante", "label": "Numero ante", "type": "number", "min": 1, "max": 6, "width": 6}
          ]
        },
        {
          "key": "sez_davanzale",
          "label": "Davanzale",
          "show_if": {"field": "complementi", "operator": "contains", "value": "davanzale"},
          "fields": [
            {"key": "dav_lunghezza", "label": "Lunghezza davanzale", "type": "dimension", "unit": "cm", "required": true, "width": 6},
            {"key": "dav_sporgenza", "label": "Sporgenza davanzale", "type": "dimension", "unit": "cm", "width": 6, "help": "Quanto sporge dal muro"},
            {"key": "dav_materiale", "label": "Materiale richiesto", "type": "select", "width": 12,
              "options": [
                {"value": "marmo", "label": "Marmo"},
                {"value": "granito", "label": "Granito"},
                {"value": "alluminio", "label": "Alluminio"},
                {"value": "pvc", "label": "PVC"},
                {"value": "esistente", "label": "Mantenere quello esistente"}
              ]}
          ]
        },
        {
          "key": "extra",
          "label": "5. Extra (opzionale)",
          "default_open": false,
          "fields": [
            {"key": "maniglie", "label": "Tipo maniglie (se specifico)", "type": "text", "width": 12, "placeholder": "Es. Hoppe Tokyo cromata. Lascia vuoto per maniglia standard."},
            {"key": "note_pezzo", "label": "Note specifiche per questo pezzo", "type": "textarea", "width": 12, "placeholder": "Solo se questo pezzo ha qualcosa di DIVERSO dagli altri (colore custom, vetro speciale, criticità di posa...)"}
          ]
        }
      ],
      "required_photos": [
        {"key": "frontale_interna", "label": "📸 Frontale dall'interno (con metro)", "required": true},
        {"key": "frontale_esterna", "label": "📸 Frontale dall'esterno (con metro)", "required": true},
        {"key": "cassonetto_aperto", "label": "Cassonetto aperto (se presente)", "required": false},
        {"key": "mazzetta_dettaglio", "label": "Dettaglio mazzetta (se serve)", "required": false},
        {"key": "soglia_davanzale", "label": "Soglia / davanzale (se presente)", "required": false}
      ]
    },
    {
      "key": "portoncino_blindato",
      "label": "Portoncino blindato",
      "label_plural": "Portoncini blindati",
      "icon": "DoorOpen",
      "allow_quantity": true,
      "sections": [
        {
          "key": "dati",
          "label": "Dati portoncino",
          "default_open": true,
          "fields": [
            {"key": "tipologia", "label": "Tipologia", "type": "select", "required": true, "width": 6,
              "options": [
                {"value": "1_anta", "label": "1 anta"},
                {"value": "2_ante", "label": "2 ante (anta + ribalta)"},
                {"value": "doppia_anta", "label": "Doppia anta"}
              ]},
            {"key": "apertura", "label": "Apertura", "type": "select", "required": true, "width": 6,
              "options": [
                {"value": "dx", "label": "A Destra"},
                {"value": "sx", "label": "A Sinistra"}
              ]},
            {"key": "classe_antieffrazione", "label": "Classe antieffrazione", "type": "select", "width": 6,
              "options": [
                {"value": "rc1", "label": "RC1 (base)"},
                {"value": "rc2", "label": "RC2"},
                {"value": "rc3", "label": "RC3 (consigliata)"},
                {"value": "rc4", "label": "RC4"},
                {"value": "rc5", "label": "RC5 (massima)"}
              ]},
            {"key": "larghezza", "label": "Larghezza foro", "type": "dimension", "unit": "cm", "required": true, "width": 4},
            {"key": "altezza", "label": "Altezza foro", "type": "dimension", "unit": "cm", "required": true, "width": 4},
            {"key": "spessore_muro", "label": "Spessore muro", "type": "dimension", "unit": "cm", "width": 4},
            {"key": "accessori", "label": "Accessori", "type": "multiselect", "width": 12,
              "options": [
                {"value": "spioncino", "label": "Spioncino"},
                {"value": "deviatore", "label": "Deviatore"},
                {"value": "pomolo_doppio", "label": "Pomolo doppio"},
                {"value": "chiusura_5_punti", "label": "Chiusura a 5 punti"},
                {"value": "soglia_taglio_termico", "label": "Soglia taglio termico"}
              ]}
          ]
        }
      ],
      "required_photos": [
        {"key": "frontale_esterna", "label": "Frontale esterna", "required": true},
        {"key": "frontale_interna", "label": "Frontale interna", "required": true}
      ]
    },
    {
      "key": "tapparella_standalone",
      "label": "Solo Tapparella (rilievo dedicato)",
      "label_plural": "Tapparelle standalone",
      "icon": "Layers",
      "description": "Usa SOLO se rilevi tapparelle senza infisso (es. cliente vuole solo cambiare tapparelle).",
      "allow_quantity": true,
      "sections": [
        {
          "key": "dati",
          "label": "Dati tapparella",
          "default_open": true,
          "fields": [
            {"key": "larghezza", "label": "Larghezza", "type": "dimension", "unit": "cm", "required": true, "width": 6},
            {"key": "altezza", "label": "Altezza", "type": "dimension", "unit": "cm", "required": true, "width": 6},
            {"key": "tipo", "label": "Comando", "type": "select", "required": true, "width": 6,
              "options": [
                {"value": "manuale", "label": "🖐 Manuale (cinghia)"},
                {"value": "motorizzata_filo", "label": "⚡ Motorizzata a filo"},
                {"value": "motorizzata_radio", "label": "📡 Motorizzata radiocomando"},
                {"value": "domotica", "label": "📱 Domotica"}
              ]},
            {"key": "materiale", "label": "Materiale", "type": "select", "width": 6,
              "options": [
                {"value": "pvc", "label": "PVC"},
                {"value": "alluminio_coibentato", "label": "Alluminio coibentato"},
                {"value": "acciaio_blindato", "label": "Acciaio blindato"}
              ]},
            {"key": "accessori", "label": "Accessori", "type": "multiselect", "width": 12,
              "options": [
                {"value": "rulli", "label": "Rulli"},
                {"value": "guide", "label": "Guide"},
                {"value": "calotte", "label": "Calotte"},
                {"value": "cinghia", "label": "Cinghia"},
                {"value": "motorino", "label": "Motorino"},
                {"value": "telecomando", "label": "Telecomando"}
              ]}
          ]
        }
      ],
      "required_photos": [
        {"key": "vista", "label": "Vista tapparella", "required": true}
      ]
    },
    {
      "key": "persiana_standalone",
      "label": "Solo Persiana (rilievo dedicato)",
      "label_plural": "Persiane standalone",
      "icon": "Columns",
      "description": "Usa SOLO se rilevi persiane senza infisso.",
      "allow_quantity": true,
      "sections": [
        {
          "key": "dati",
          "label": "Dati persiana",
          "default_open": true,
          "fields": [
            {"key": "larghezza", "label": "Larghezza", "type": "dimension", "unit": "cm", "required": true, "width": 4},
            {"key": "altezza", "label": "Altezza", "type": "dimension", "unit": "cm", "required": true, "width": 4},
            {"key": "n_ante", "label": "Numero ante", "type": "number", "min": 1, "max": 6, "width": 4},
            {"key": "tipo", "label": "Apertura", "type": "select", "required": true, "width": 6,
              "options": [
                {"value": "battente", "label": "A battente"},
                {"value": "scorrevole", "label": "Scorrevole"}
              ]},
            {"key": "aletta", "label": "Aletta", "type": "select", "required": true, "width": 6,
              "options": [
                {"value": "35", "label": "35 mm"},
                {"value": "60", "label": "60 mm"}
              ]},
            {"key": "materiale", "label": "Materiale", "type": "select", "width": 12,
              "options": [
                {"value": "legno", "label": "Legno"},
                {"value": "alluminio", "label": "Alluminio"},
                {"value": "alluminio_effetto_legno", "label": "Alluminio effetto legno"},
                {"value": "pvc", "label": "PVC"}
              ]}
          ]
        }
      ],
      "required_photos": [
        {"key": "aperta", "label": "Vista aperta", "required": true},
        {"key": "chiusa", "label": "Vista chiusa", "required": false}
      ]
    },
    {
      "key": "zanzariera_standalone",
      "label": "Solo Zanzariera (rilievo dedicato)",
      "label_plural": "Zanzariere standalone",
      "icon": "Grid",
      "description": "Usa SOLO se rilevi zanzariere senza infisso.",
      "allow_quantity": true,
      "sections": [
        {
          "key": "dati",
          "label": "Dati zanzariera",
          "default_open": true,
          "fields": [
            {"key": "larghezza", "label": "Larghezza foro", "type": "dimension", "unit": "cm", "required": true, "width": 4},
            {"key": "altezza", "label": "Altezza foro", "type": "dimension", "unit": "cm", "required": true, "width": 4},
            {"key": "larghezza_telaio", "label": "Spessore profilo", "type": "dimension", "unit": "cm", "width": 4},
            {"key": "tipo", "label": "Tipo zanzariera", "type": "select", "required": true, "width": 12,
              "options": [
                {"value": "fissa", "label": "Fissa"},
                {"value": "avvolgibile_verticale", "label": "Avvolgibile verticale"},
                {"value": "avvolgibile_laterale", "label": "Avvolgibile laterale"},
                {"value": "plissettata", "label": "Plissettata"},
                {"value": "doppia_anta", "label": "Doppia anta a battente"}
              ]}
          ]
        }
      ],
      "required_photos": [
        {"key": "vano", "label": "Vano installazione (con metro)", "required": true}
      ]
    },
    {
      "key": "cassonetto_standalone",
      "label": "Solo Cassonetto (rilievo dedicato)",
      "label_plural": "Cassonetti standalone",
      "icon": "Box",
      "allow_quantity": true,
      "sections": [
        {
          "key": "dati",
          "label": "Dati cassonetto",
          "default_open": true,
          "fields": [
            {"key": "altezza", "label": "Altezza", "type": "dimension", "unit": "cm", "required": true, "width": 3},
            {"key": "larghezza", "label": "Larghezza", "type": "dimension", "unit": "cm", "required": true, "width": 3},
            {"key": "profondita", "label": "Profondità", "type": "dimension", "unit": "cm", "required": true, "width": 3},
            {"key": "cilindro", "label": "Ø cilindro", "type": "dimension", "unit": "cm", "width": 3},
            {"key": "tipo", "label": "Tipo", "type": "select", "width": 12,
              "options": [
                {"value": "esterno", "label": "Esterno"},
                {"value": "interno", "label": "Interno (in muratura)"},
                {"value": "monoblocco", "label": "Monoblocco"},
                {"value": "coibentato", "label": "Coibentato nuovo"}
              ]}
          ]
        }
      ],
      "required_photos": [
        {"key": "aperto", "label": "Cassonetto aperto", "required": true}
      ]
    }
  ],
  "general_required_photos": [
    {"key": "facciata_immobile", "label": "Foto facciata immobile", "required": false},
    {"key": "ingresso", "label": "Ingresso cantiere", "required": false}
  ],
  "output_mapping": {
    "estimate_lines": {
      "infisso": {
        "description_template": "Infisso {tipologia} {materiale_richiesto} {larghezza_foro}x{altezza_foro} cm — {apertura} — telaio {tipo_telaio}",
        "unit": "pz",
        "quantity_field": "quantity"
      },
      "portoncino_blindato": {
        "description_template": "Portoncino blindato {tipologia} {larghezza}x{altezza} cm Classe {classe_antieffrazione} — apertura {apertura}",
        "unit": "pz",
        "quantity_field": "quantity"
      },
      "tapparella_standalone": {
        "description_template": "Tapparella {tipo} {materiale} {larghezza}x{altezza} cm",
        "unit": "pz",
        "quantity_field": "quantity"
      },
      "persiana_standalone": {
        "description_template": "Persiana {tipo} {materiale} {larghezza}x{altezza} cm — aletta {aletta} mm — {n_ante} ante",
        "unit": "pz",
        "quantity_field": "quantity"
      },
      "zanzariera_standalone": {
        "description_template": "Zanzariera {tipo} {larghezza}x{altezza} cm",
        "unit": "pz",
        "quantity_field": "quantity"
      },
      "cassonetto_standalone": {
        "description_template": "Cassonetto {tipo} {larghezza}x{altezza}x{profondita} cm",
        "unit": "pz",
        "quantity_field": "quantity"
      }
    }
  }
}
$sch$::jsonb,
version = 4
WHERE category = 'infissi' AND is_system = true;

COMMIT;
