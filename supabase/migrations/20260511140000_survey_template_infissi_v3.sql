-- ═══════════════════════════════════════════════════════════════════════════
-- Template Infissi v3 — adattamento sul cantiere reale
-- ---------------------------------------------------------------------------
-- Modifiche da v2 (in base al test utente):
--   1. Tempistica: da select "entro N giorni" a NUMBER "giorni medi"
--   2. Area definition: rimossi mq stanza ed esposizione (irrilevanti per
--      rilievo infissi). Tenuta solo la foto panoramica come obbligatoria.
--   3. Infisso element: sezione "Dettagli nuovo" (colori, vetri, apertura,
--      maniglie) spostata PRIMA delle misure foro, così l'utente compila
--      subito i dettagli chiave senza scrollare
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
        {"key": "anno_costruzione", "label": "Anno costruzione", "type": "number", "width": 3, "min": 1900, "max": 2030, "placeholder": "es. 1985"},
        {"key": "piano", "label": "Piano", "type": "text", "width": 3, "placeholder": "es. 3° con ascensore"},
        {"key": "condominio", "label": "In condominio", "type": "boolean", "width": 6},
        {"key": "vincolo_paesaggistico", "label": "Vincoli paesaggistici / storici", "type": "boolean", "width": 6, "help": "Se sì, verificare colore obbligatorio"}
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
        {"key": "trasporto", "label": "Mezzo di trasporto idoneo", "type": "select", "width": 6,
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
        {"key": "tempistica_giorni_medi", "label": "Giorni medi necessari per il lavoro", "type": "number", "width": 6, "min": 1, "max": 365, "placeholder": "Es. 15",
          "help": "Numero di giorni operativi mediamente necessari per completare il lavoro"},
        {"key": "tempistica_note", "label": "Note tempistica", "type": "textarea", "width": 12, "placeholder": "Eventuali vincoli (ferie cliente, periodi specifici, urgenze...)"}
      ]
    }
  ],
  "area_definition": {
    "label": "Stanza",
    "label_plural": "Stanze",
    "name_suggestions": ["Soggiorno", "Cucina", "Camera da letto", "Camera ospiti", "Bagno", "Studio", "Mansarda", "Sala", "Disimpegno", "Ingresso"],
    "fields": [],
    "required_photos": [
      {"key": "panoramica", "label": "Foto panoramica stanza", "required": true, "hint": "Vista d'insieme che mostra tutti gli infissi della stanza"}
    ]
  },
  "element_types": [
    {
      "key": "infisso",
      "label": "Infisso",
      "label_plural": "Infissi",
      "icon": "RectangleVertical",
      "description": "Finestre, portefinestre. Multiselect Complementi attiva le sezioni opzionali per tapparella/cassonetto/zanzariera/persiana.",
      "allow_quantity": true,
      "sections": [
        {
          "key": "dettagli_nuovo",
          "label": "Dettagli nuovo infisso (in alto: i dati richiesti)",
          "default_open": true,
          "fields": [
            {"key": "tipologia", "label": "Tipologia infisso", "type": "select", "required": true, "width": 12,
              "options": [
                {"value": "finestra_1anta", "label": "Finestra 1 anta"},
                {"value": "finestra_2ante", "label": "Finestra 2 ante"},
                {"value": "finestra_3ante", "label": "Finestra 3 ante"},
                {"value": "finestra_4ante", "label": "Finestra 4 ante"},
                {"value": "finestra_vasistas", "label": "Finestra vasistas (a ribalta)"},
                {"value": "finestra_basculante", "label": "Finestra basculante"},
                {"value": "portafinestra_1anta", "label": "Portafinestra 1 anta"},
                {"value": "portafinestra_2ante", "label": "Portafinestra 2 ante"},
                {"value": "portafinestra_3ante", "label": "Portafinestra 3 ante"},
                {"value": "alzante_scorrevole", "label": "Alzante-scorrevole"},
                {"value": "scorrevole", "label": "Scorrevole"},
                {"value": "a_libro", "label": "A libro / pieghevole"},
                {"value": "bow_window", "label": "Bow-window (curva)"},
                {"value": "fisso", "label": "Fisso"},
                {"value": "lucernario", "label": "Lucernario"},
                {"value": "tonda_ovale", "label": "Tonda / ovale"}
              ]},
            {"key": "materiale_richiesto", "label": "Materiale nuovo", "type": "select", "required": true, "width": 6,
              "options": [
                {"value": "pvc", "label": "PVC"},
                {"value": "alluminio", "label": "Alluminio"},
                {"value": "alluminio_legno", "label": "Alluminio-legno"},
                {"value": "legno", "label": "Legno"}
              ]},
            {"key": "apertura", "label": "Tipo apertura", "type": "select", "width": 6,
              "options": [
                {"value": "anta_ribalta", "label": "Anta-ribalta"},
                {"value": "battente", "label": "Solo battente"},
                {"value": "scorrevole", "label": "Scorrevole"},
                {"value": "fisso", "label": "Fisso"},
                {"value": "vasistas", "label": "Vasistas"}
              ]},
            {"key": "colore_interno", "label": "Colore interno", "type": "text", "width": 6, "placeholder": "Es. RAL 9010 bianco / Noce"},
            {"key": "colore_esterno", "label": "Colore esterno", "type": "text", "width": 6, "placeholder": "Es. RAL 7016 grigio antracite"},
            {"key": "vetro", "label": "Tipo vetro", "type": "select", "width": 6,
              "options": [
                {"value": "doppio_camera", "label": "Doppio vetro camera"},
                {"value": "triplo_camera", "label": "Triplo vetro camera"},
                {"value": "satinato", "label": "Satinato"},
                {"value": "basso_emissivo", "label": "Basso emissivo"},
                {"value": "antisfondamento", "label": "Antisfondamento (P1A/P2A/P4A)"}
              ]},
            {"key": "maniglie", "label": "Tipo maniglie", "type": "text", "width": 6, "placeholder": "Es. Hoppe Tokyo cromata"},
            {"key": "n_ante", "label": "N. ante apribili", "type": "number", "min": 1, "max": 6, "width": 6}
          ]
        },
        {
          "key": "materiale_attuale",
          "label": "Stato attuale (sostituzione)",
          "fields": [
            {"key": "materiale_attuale", "label": "Materiale infisso attuale", "type": "select", "width": 6,
              "options": [
                {"value": "legno", "label": "Legno"}, {"value": "pvc", "label": "PVC"},
                {"value": "alluminio", "label": "Alluminio"},
                {"value": "alluminio_legno", "label": "Alluminio-legno"},
                {"value": "ferro", "label": "Ferro"}, {"value": "non_presente", "label": "Non presente (foro nuovo)"}
              ]},
            {"key": "stato_attuale", "label": "Stato infisso attuale", "type": "select", "width": 6,
              "options": [
                {"value": "buono", "label": "Buono"},
                {"value": "discreto", "label": "Discreto"},
                {"value": "scadente", "label": "Scadente / da sostituire"},
                {"value": "compromesso", "label": "Compromesso / rotto"}
              ]}
          ]
        },
        {
          "key": "misure_foro",
          "label": "Misure foro",
          "fields": [
            {"key": "larghezza_foro", "label": "Larghezza foro", "type": "dimension", "unit": "cm", "required": true, "width": 6},
            {"key": "altezza_foro", "label": "Altezza foro", "type": "dimension", "unit": "cm", "required": true, "width": 6},
            {"key": "spessore_muro", "label": "Spessore muro", "type": "dimension", "unit": "cm", "width": 4, "help": "Misurato sul foro"},
            {"key": "mazzetta_sx", "label": "Mazzetta sinistra", "type": "dimension", "unit": "cm", "width": 4},
            {"key": "mazzetta_dx", "label": "Mazzetta destra", "type": "dimension", "unit": "cm", "width": 4},
            {"key": "ha_davanzale", "label": "Davanzale presente", "type": "boolean", "width": 6},
            {"key": "lunghezza_davanzale", "label": "Lunghezza davanzale", "type": "dimension", "unit": "cm", "width": 6, "show_if": {"field": "ha_davanzale", "operator": "truthy"}}
          ]
        },
        {
          "key": "telaio",
          "label": "Telaio",
          "fields": [
            {"key": "tipo_telaio", "label": "Tipo telaio", "type": "select", "required": true, "width": 6,
              "options": [
                {"value": "l", "label": "A L (telaio piatto)"},
                {"value": "z_30", "label": "A Z 30 mm"},
                {"value": "z_35", "label": "A Z 35 mm"},
                {"value": "z_60", "label": "A Z 60 mm"},
                {"value": "z_65", "label": "A Z 65 mm"}
              ]},
            {"key": "lati_con_z", "label": "Lati con Z presente", "type": "multiselect", "width": 12,
              "help": "Spunta i lati dove la Z viene applicata (lascia tutti se profilo completo)",
              "show_if": {"field": "tipo_telaio", "operator": "in", "value": ["z_30", "z_35", "z_60", "z_65"]},
              "options": [
                {"value": "alto", "label": "Alto"},
                {"value": "basso", "label": "Basso"},
                {"value": "dx", "label": "Destro"},
                {"value": "sx", "label": "Sinistro"}
              ]},
            {"key": "note_telaio", "label": "Note telaio", "type": "textarea", "width": 12,
              "placeholder": "Eventuali specifiche su mazzette, soglia ribassata, ecc."}
          ]
        },
        {
          "key": "complementi",
          "label": "Cosa rilevo (complementi)",
          "description": "Spunta i complementi presenti per questo infisso. Si attiveranno automaticamente le rispettive sezioni di misura.",
          "default_open": true,
          "fields": [
            {"key": "complementi", "label": "Complementi presenti", "type": "multiselect", "width": 12,
              "help": "Lascia vuoto se rilevi solo l'infisso senza complementi",
              "options": [
                {"value": "tapparella", "label": "Tapparella"},
                {"value": "cassonetto", "label": "Cassonetto"},
                {"value": "zanzariera", "label": "Zanzariera"},
                {"value": "persiana", "label": "Persiana / Scuro"}
              ]}
          ]
        },
        {
          "key": "sez_tapparella",
          "label": "Tapparella",
          "show_if": {"field": "complementi", "operator": "contains", "value": "tapparella"},
          "fields": [
            {"key": "tap_larghezza", "label": "Larghezza", "type": "dimension", "unit": "cm", "required": true, "width": 4},
            {"key": "tap_altezza", "label": "Altezza", "type": "dimension", "unit": "cm", "required": true, "width": 4},
            {"key": "tap_materiale", "label": "Materiale", "type": "select", "width": 4,
              "options": [
                {"value": "pvc", "label": "PVC"},
                {"value": "alluminio_coibentato", "label": "Alluminio coibentato"},
                {"value": "acciaio_blindato", "label": "Acciaio blindato"},
                {"value": "legno", "label": "Legno"}
              ]},
            {"key": "tap_colore", "label": "Colore (RAL)", "type": "color", "width": 6},
            {"key": "tap_tipo_motore", "label": "Tipo motore/comando", "type": "select", "width": 6,
              "options": [
                {"value": "manuale", "label": "Manuale (cinghia)"},
                {"value": "motorizzata_filo", "label": "Motorizzata a filo"},
                {"value": "motorizzata_radio", "label": "Motorizzata radiocomando"},
                {"value": "domotica", "label": "Domotica (Wifi/KNX)"}
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
              ]},
            {"key": "tap_note", "label": "Note tapparella", "type": "textarea", "width": 12}
          ]
        },
        {
          "key": "sez_cassonetto",
          "label": "Cassonetto",
          "show_if": {"field": "complementi", "operator": "contains", "value": "cassonetto"},
          "fields": [
            {"key": "cas_altezza", "label": "Altezza cassonetto", "type": "dimension", "unit": "cm", "required": true, "width": 3},
            {"key": "cas_larghezza", "label": "Larghezza cassonetto", "type": "dimension", "unit": "cm", "required": true, "width": 3},
            {"key": "cas_profondita", "label": "Profondità cassonetto", "type": "dimension", "unit": "cm", "required": true, "width": 3},
            {"key": "cas_cilindro", "label": "Diametro cilindro", "type": "dimension", "unit": "cm", "width": 3, "help": "Solo se presente cilindro avvolgitore"},
            {"key": "cas_tipo", "label": "Tipo cassonetto", "type": "select", "width": 6,
              "options": [
                {"value": "esterno", "label": "Esterno"},
                {"value": "interno", "label": "Interno (in muratura)"},
                {"value": "monoblocco", "label": "Monoblocco"},
                {"value": "coibentato_nuovo", "label": "Sostituzione con coibentato"}
              ]},
            {"key": "cas_accessibilita", "label": "Accessibilità", "type": "select", "width": 6,
              "options": [
                {"value": "facile", "label": "Apertura facile (dall'interno)"},
                {"value": "media", "label": "Media"},
                {"value": "difficile", "label": "Difficile (smontare intonaco)"}
              ]},
            {"key": "cas_note", "label": "Note cassonetto", "type": "textarea", "width": 12}
          ]
        },
        {
          "key": "sez_zanzariera",
          "label": "Zanzariera",
          "show_if": {"field": "complementi", "operator": "contains", "value": "zanzariera"},
          "fields": [
            {"key": "zan_larghezza", "label": "Larghezza foro", "type": "dimension", "unit": "cm", "required": true, "width": 4},
            {"key": "zan_altezza", "label": "Altezza foro", "type": "dimension", "unit": "cm", "required": true, "width": 4},
            {"key": "zan_larghezza_telaio", "label": "Larghezza telaio zanz.", "type": "dimension", "unit": "cm", "required": true, "width": 4, "help": "Spessore profilo telaio"},
            {"key": "zan_tipo", "label": "Tipo zanzariera", "type": "select", "width": 6,
              "options": [
                {"value": "fissa", "label": "Fissa"},
                {"value": "avvolgibile_verticale", "label": "Avvolgibile verticale"},
                {"value": "avvolgibile_laterale", "label": "Avvolgibile laterale"},
                {"value": "plissettata", "label": "Plissettata"},
                {"value": "doppia_anta", "label": "Doppia anta a battente"}
              ]},
            {"key": "zan_colore", "label": "Colore profilo (RAL)", "type": "color", "width": 6},
            {"key": "zan_rete", "label": "Tipologia rete", "type": "select", "width": 6,
              "options": [
                {"value": "standard", "label": "Standard fibra di vetro"},
                {"value": "pet", "label": "PET resistente"},
                {"value": "antipolline", "label": "Anti-polline"},
                {"value": "antimoscerini", "label": "Anti-moscerini fine"},
                {"value": "petfriendly", "label": "Pet-friendly (rinforzata)"}
              ]},
            {"key": "zan_note", "label": "Note zanzariera", "type": "textarea", "width": 12}
          ]
        },
        {
          "key": "sez_persiana",
          "label": "Persiana / Scuro",
          "show_if": {"field": "complementi", "operator": "contains", "value": "persiana"},
          "fields": [
            {"key": "per_larghezza", "label": "Larghezza", "type": "dimension", "unit": "cm", "required": true, "width": 4},
            {"key": "per_altezza", "label": "Altezza", "type": "dimension", "unit": "cm", "required": true, "width": 4},
            {"key": "per_aletta", "label": "Misura aletta", "type": "select", "required": true, "width": 4,
              "options": [
                {"value": "35", "label": "35 mm"},
                {"value": "60", "label": "60 mm"}
              ]},
            {"key": "per_tipo", "label": "Tipo apertura", "type": "select", "required": true, "width": 6,
              "options": [
                {"value": "battente", "label": "A battente"},
                {"value": "scorrevole", "label": "Scorrevole"}
              ]},
            {"key": "per_n_ante", "label": "Numero ante", "type": "number", "min": 1, "max": 6, "width": 6},
            {"key": "per_materiale", "label": "Materiale", "type": "select", "width": 6,
              "options": [
                {"value": "legno", "label": "Legno"},
                {"value": "alluminio", "label": "Alluminio"},
                {"value": "alluminio_effetto_legno", "label": "Alluminio effetto legno"},
                {"value": "pvc", "label": "PVC"}
              ]},
            {"key": "per_colore", "label": "Colore (RAL)", "type": "color", "width": 6},
            {"key": "per_note", "label": "Note persiana", "type": "textarea", "width": 12}
          ]
        },
        {
          "key": "criticita",
          "label": "Note e criticità",
          "fields": [
            {"key": "criticita_posa", "label": "Criticità di posa rilevate", "type": "textarea", "width": 12, "placeholder": "Es. soglia ribassata, mazzetta storta, intonaco da rifare attorno al foro"},
            {"key": "note_finali", "label": "Note finali", "type": "textarea", "width": 12}
          ]
        }
      ],
      "required_photos": [
        {"key": "frontale_interna", "label": "Frontale interna (con metro)", "required": true},
        {"key": "frontale_esterna", "label": "Frontale esterna (con metro)", "required": true},
        {"key": "cassonetto_aperto", "label": "Cassonetto aperto (se presente)", "required": false},
        {"key": "mazzetta_dettaglio", "label": "Dettaglio mazzetta", "required": false},
        {"key": "soglia_davanzale", "label": "Soglia / davanzale", "required": false},
        {"key": "vista_esterna_ambiente", "label": "Vista esterna ambiente (contesto)", "required": false}
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
          "key": "specifiche",
          "label": "Specifiche",
          "fields": [
            {"key": "tipologia", "label": "Tipologia", "type": "select", "required": true, "width": 6,
              "options": [
                {"value": "1_anta", "label": "1 anta"},
                {"value": "2_ante", "label": "2 ante (anta + ribalta)"},
                {"value": "doppia_anta", "label": "Doppia anta"}
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
            {"key": "finitura_interna", "label": "Finitura interna", "type": "text", "width": 6, "placeholder": "Es. Noce nazionale"},
            {"key": "finitura_esterna", "label": "Finitura esterna", "type": "text", "width": 6, "placeholder": "Es. RAL 7016"},
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
        {"key": "frontale_interna", "label": "Frontale interna", "required": true},
        {"key": "serratura_attuale", "label": "Serratura attuale", "required": false}
      ]
    },
    {
      "key": "tapparella_standalone",
      "label": "Solo Tapparella (standalone)",
      "label_plural": "Tapparelle standalone",
      "icon": "Layers",
      "description": "Per rilievo solo tapparelle senza infisso",
      "allow_quantity": true,
      "sections": [
        {
          "key": "specifiche",
          "label": "Specifiche",
          "fields": [
            {"key": "tipo", "label": "Tipo", "type": "select", "required": true, "width": 6,
              "options": [
                {"value": "manuale", "label": "Manuale (cinghia)"},
                {"value": "motorizzata_filo", "label": "Motorizzata a filo"},
                {"value": "motorizzata_radio", "label": "Motorizzata radiocomando"},
                {"value": "domotica", "label": "Domotica (Wifi/KNX)"}
              ]},
            {"key": "materiale", "label": "Materiale", "type": "select", "width": 6,
              "options": [
                {"value": "pvc", "label": "PVC"},
                {"value": "alluminio_coibentato", "label": "Alluminio coibentato"},
                {"value": "acciaio_blindato", "label": "Acciaio blindato"}
              ]},
            {"key": "larghezza", "label": "Larghezza", "type": "dimension", "unit": "cm", "required": true, "width": 6},
            {"key": "altezza", "label": "Altezza", "type": "dimension", "unit": "cm", "required": true, "width": 6},
            {"key": "colore", "label": "Colore (RAL)", "type": "color", "width": 6},
            {"key": "accessori", "label": "Accessori inclusi", "type": "multiselect", "width": 12,
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
        }
      ],
      "required_photos": [
        {"key": "vista_esterna", "label": "Vista esterna", "required": true},
        {"key": "cassonetto", "label": "Cassonetto aperto", "required": false}
      ]
    },
    {
      "key": "persiana_standalone",
      "label": "Solo Persiana (standalone)",
      "label_plural": "Persiane standalone",
      "icon": "Columns",
      "allow_quantity": true,
      "sections": [
        {
          "key": "specifiche",
          "label": "Specifiche",
          "fields": [
            {"key": "tipo", "label": "Tipo apertura", "type": "select", "required": true, "width": 6,
              "options": [
                {"value": "battente", "label": "A battente"},
                {"value": "scorrevole", "label": "Scorrevole"}
              ]},
            {"key": "aletta", "label": "Misura aletta", "type": "select", "required": true, "width": 6,
              "options": [
                {"value": "35", "label": "35 mm"},
                {"value": "60", "label": "60 mm"}
              ]},
            {"key": "materiale", "label": "Materiale", "type": "select", "width": 6,
              "options": [
                {"value": "legno", "label": "Legno"},
                {"value": "alluminio", "label": "Alluminio"},
                {"value": "alluminio_effetto_legno", "label": "Alluminio effetto legno"},
                {"value": "pvc", "label": "PVC"}
              ]},
            {"key": "larghezza", "label": "Larghezza", "type": "dimension", "unit": "cm", "required": true, "width": 3},
            {"key": "altezza", "label": "Altezza", "type": "dimension", "unit": "cm", "required": true, "width": 3},
            {"key": "n_ante", "label": "Numero ante", "type": "number", "min": 1, "max": 6, "width": 3},
            {"key": "colore", "label": "Colore (RAL)", "type": "color", "width": 6}
          ]
        }
      ],
      "required_photos": [
        {"key": "vista_esterna_aperta", "label": "Vista esterna aperta", "required": true},
        {"key": "vista_chiusa", "label": "Vista chiusa", "required": false}
      ]
    },
    {
      "key": "zanzariera_standalone",
      "label": "Solo Zanzariera (standalone)",
      "label_plural": "Zanzariere standalone",
      "icon": "Grid",
      "allow_quantity": true,
      "sections": [
        {
          "key": "specifiche",
          "label": "Specifiche",
          "fields": [
            {"key": "tipo", "label": "Tipo", "type": "select", "required": true, "width": 6,
              "options": [
                {"value": "fissa", "label": "Fissa"},
                {"value": "avvolgibile_verticale", "label": "Avvolgibile verticale"},
                {"value": "avvolgibile_laterale", "label": "Avvolgibile laterale"},
                {"value": "plissettata", "label": "Plissettata"},
                {"value": "doppia_anta", "label": "Doppia anta a battente"}
              ]},
            {"key": "larghezza", "label": "Larghezza foro", "type": "dimension", "unit": "cm", "required": true, "width": 4},
            {"key": "altezza", "label": "Altezza foro", "type": "dimension", "unit": "cm", "required": true, "width": 4},
            {"key": "larghezza_telaio", "label": "Larghezza telaio zanz.", "type": "dimension", "unit": "cm", "required": true, "width": 4},
            {"key": "colore", "label": "Colore profilo (RAL)", "type": "color", "width": 6},
            {"key": "rete", "label": "Tipologia rete", "type": "select", "width": 6,
              "options": [
                {"value": "standard", "label": "Standard"},
                {"value": "pet", "label": "PET resistente"},
                {"value": "antipolline", "label": "Anti-polline"},
                {"value": "antimoscerini", "label": "Anti-moscerini fine"},
                {"value": "petfriendly", "label": "Pet-friendly"}
              ]}
          ]
        }
      ],
      "required_photos": [
        {"key": "vano_installazione", "label": "Vano installazione con metro", "required": true}
      ]
    },
    {
      "key": "cassonetto_standalone",
      "label": "Solo Cassonetto (standalone)",
      "label_plural": "Cassonetti standalone",
      "icon": "Box",
      "description": "Rilievo solo cassonetto senza sostituzione tapparella/infisso",
      "allow_quantity": true,
      "sections": [
        {
          "key": "specifiche",
          "label": "Specifiche",
          "fields": [
            {"key": "altezza", "label": "Altezza", "type": "dimension", "unit": "cm", "required": true, "width": 3},
            {"key": "larghezza", "label": "Larghezza", "type": "dimension", "unit": "cm", "required": true, "width": 3},
            {"key": "profondita", "label": "Profondità", "type": "dimension", "unit": "cm", "required": true, "width": 3},
            {"key": "cilindro", "label": "Diametro cilindro", "type": "dimension", "unit": "cm", "width": 3},
            {"key": "tipo", "label": "Tipo cassonetto", "type": "select", "width": 6,
              "options": [
                {"value": "esterno", "label": "Esterno"},
                {"value": "interno", "label": "Interno (in muratura)"},
                {"value": "monoblocco", "label": "Monoblocco"},
                {"value": "coibentato", "label": "Coibentato nuovo"}
              ]},
            {"key": "accessibilita", "label": "Accessibilità", "type": "select", "width": 6,
              "options": [
                {"value": "facile", "label": "Apertura facile"},
                {"value": "media", "label": "Media"},
                {"value": "difficile", "label": "Difficile (smontare intonaco)"}
              ]}
          ]
        }
      ],
      "required_photos": [
        {"key": "cassonetto_aperto", "label": "Cassonetto aperto con metro", "required": true},
        {"key": "vano_interno", "label": "Vano interno", "required": false}
      ]
    }
  ],
  "general_required_photos": [
    {"key": "panoramica_immobile", "label": "Vista panoramica immobile", "required": false},
    {"key": "ingresso_cantiere", "label": "Ingresso cantiere", "required": false}
  ],
  "output_mapping": {
    "estimate_lines": {
      "infisso": {
        "description_template": "Infisso {tipologia} {materiale_richiesto} {larghezza_foro}x{altezza_foro} cm — telaio {tipo_telaio} — {colore_interno}/{colore_esterno}",
        "unit": "pz",
        "quantity_field": "quantity"
      },
      "portoncino_blindato": {
        "description_template": "Portoncino blindato {tipologia} {larghezza}x{altezza} cm Classe {classe_antieffrazione}",
        "unit": "pz",
        "quantity_field": "quantity"
      },
      "tapparella_standalone": {
        "description_template": "Tapparella {tipo} {materiale} {larghezza}x{altezza} cm",
        "unit": "pz",
        "quantity_field": "quantity"
      },
      "persiana_standalone": {
        "description_template": "Persiana {tipo} {materiale} {larghezza}x{altezza} cm — aletta {aletta} mm",
        "unit": "pz",
        "quantity_field": "quantity"
      },
      "zanzariera_standalone": {
        "description_template": "Zanzariera {tipo} {larghezza}x{altezza} cm — telaio {larghezza_telaio} cm",
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
version = 3
WHERE category = 'infissi' AND is_system = true;

COMMIT;
