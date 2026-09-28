-- Arricchimento dei 3 template «scheletro»: Tetto, Cappotto, Climatizzazione
-- (28/09/2026). Erano fermi alla v1 con 2 sezioni e 2 tipi elemento: un
-- installatore ci trovava troppo poco. Li portiamo al livello degli altri
-- (infissi/FV): testata con immobile + cantiere/sicurezza + detrazioni, area
-- con i dati che si rilevano davvero, più tipi di elemento con i loro campi e
-- foto, e la mappatura verso il preventivo (output_mapping).
--
-- I sopralluoghi già creati non cambiano: ognuno conserva il proprio
-- template_schema_snapshot preso alla creazione. Qui si aggiorna solo il
-- template di sistema (schema JSONB + version), che vale per i nuovi.
-- JSON in dollar-quoting ($json$…$json$) per non dover raddoppiare gli apostrofi.

-- ── TETTO E COPERTURE (area: Falda) ─────────────────────────────────────────
update public.survey_templates
set version = version + 1, updated_at = now(),
    schema = $json$
{
  "version": 1,
  "header_schema": [
    {
      "key": "immobile", "label": "Immobile", "icon": "home", "default_open": true,
      "fields": [
        {"key": "tipo_immobile", "type": "select", "label": "Tipo immobile", "width": 6, "required": true,
         "options": [{"value": "residenziale", "label": "Residenziale"}, {"value": "commerciale", "label": "Commerciale"}, {"value": "industriale", "label": "Industriale / capannone"}, {"value": "agricolo", "label": "Agricolo"}]},
        {"key": "piani", "type": "number", "label": "Numero piani", "width": 3, "min": 1},
        {"key": "altezza_gronda", "type": "dimension", "unit": "m", "label": "Altezza alla gronda", "width": 3},
        {"key": "anno_costruzione", "type": "number", "label": "Anno costruzione", "width": 3, "min": 1900, "max": 2030}
      ]
    },
    {
      "key": "accesso_sicurezza", "label": "Accesso e sicurezza", "icon": "shield",
      "fields": [
        {"key": "accesso_mezzi", "type": "select", "label": "Accesso mezzi/gru", "width": 6,
         "options": [{"value": "buono", "label": "Buono"}, {"value": "limitato", "label": "Limitato"}, {"value": "assente", "label": "Assente"}]},
        {"key": "ponteggio_necessario", "type": "boolean", "label": "Ponteggio necessario", "width": 6},
        {"key": "linea_vita_presente", "type": "boolean", "label": "Linea vita già presente", "width": 6},
        {"key": "occupazione_suolo", "type": "boolean", "label": "Occupazione suolo pubblico", "width": 6},
        {"key": "note_sicurezza", "type": "textarea", "label": "Note sicurezza / accessi", "width": 12}
      ]
    },
    {
      "key": "stato_attuale", "label": "Stato attuale", "icon": "alert-triangle",
      "fields": [
        {"key": "eta_copertura", "type": "number", "label": "Età copertura (anni)", "width": 4, "min": 0},
        {"key": "coibentazione_presente", "type": "boolean", "label": "Coibentazione presente", "width": 4},
        {"key": "infiltrazioni", "type": "compound_boolean", "label": "Infiltrazioni", "width": 12, "toggle_label": "Infiltrazioni presenti",
         "nested_fields": [{"key": "infiltrazioni_dove", "type": "textarea", "label": "Dove / entità", "width": 12}]}
      ]
    },
    {
      "key": "fiscale", "label": "Bonus e detrazioni", "icon": "receipt",
      "fields": [
        {"key": "detrazione", "type": "select", "label": "Detrazione", "width": 6,
         "options": [{"value": "bonus_casa_50", "label": "Bonus Casa 50%"}, {"value": "ecobonus", "label": "Ecobonus (coibentazione)"}, {"value": "iva_10", "label": "IVA agevolata 10%"}, {"value": "nessuno", "label": "Nessuno"}]},
        {"key": "condominio", "type": "boolean", "label": "Condominio (richiede assemblea)", "width": 6}
      ]
    }
  ],
  "area_definition": {
    "label": "Falda", "label_plural": "Falde",
    "name_suggestions": ["Falda Sud", "Falda Nord", "Falda Est", "Falda Ovest", "Tetto piano", "Pensilina"],
    "fields": [
      {"key": "superficie_mq", "type": "dimension", "unit": "mq", "label": "Superficie falda", "width": 6, "required": true},
      {"key": "pendenza", "type": "dimension", "unit": "gradi", "label": "Pendenza", "width": 6, "min": 0, "max": 90},
      {"key": "manto_attuale", "type": "select", "label": "Manto attuale", "width": 6, "required": true,
       "options": [{"value": "coppi", "label": "Coppi"}, {"value": "tegole_marsigliesi", "label": "Tegole marsigliesi"}, {"value": "tegole_portoghesi", "label": "Tegole portoghesi"}, {"value": "tegole_canadesi", "label": "Tegole canadesi (bituminose)"}, {"value": "lamiera_grecata", "label": "Lamiera grecata"}, {"value": "lamiera_aggraffata", "label": "Lamiera aggraffata"}, {"value": "guaina", "label": "Guaina ardesiata"}, {"value": "eternit", "label": "Eternit / amianto"}, {"value": "altro", "label": "Altro"}]},
      {"key": "struttura", "type": "select", "label": "Struttura", "width": 6,
       "options": [{"value": "legno", "label": "Legno"}, {"value": "cemento", "label": "Cemento armato"}, {"value": "metallo", "label": "Metallo / capriate"}, {"value": "sconosciuta", "label": "Sconosciuta"}]},
      {"key": "stato_manto", "type": "select", "label": "Stato del manto", "width": 6, "required": true,
       "options": [{"value": "buono", "label": "Buono"}, {"value": "discreto", "label": "Discreto"}, {"value": "degradato", "label": "Degradato"}, {"value": "da_rifare", "label": "Da rifare"}]},
      {"key": "orditura_stato", "type": "select", "label": "Stato orditura/struttura", "width": 6,
       "options": [{"value": "buono", "label": "Buono"}, {"value": "da_verificare", "label": "Da verificare"}, {"value": "da_sostituire", "label": "Da sostituire in parte"}]},
      {"key": "gronde_stato", "type": "select", "label": "Stato gronde/pluviali", "width": 6,
       "options": [{"value": "buono", "label": "Buono"}, {"value": "da_sostituire", "label": "Da sostituire"}, {"value": "assenti", "label": "Assenti"}]},
      {"key": "n_lucernai", "type": "number", "label": "N° lucernai", "width": 4, "min": 0},
      {"key": "n_camini", "type": "number", "label": "N° camini/comignoli", "width": 4, "min": 0},
      {"key": "n_abbaini", "type": "number", "label": "N° abbaini", "width": 4, "min": 0}
    ],
    "required_photos": [
      {"key": "falda_da_terra", "label": "Falda da terra", "required": true},
      {"key": "manto_dettaglio", "label": "Dettaglio manto"},
      {"key": "gronde", "label": "Gronde / pluviali"},
      {"key": "sottotetto", "label": "Sottotetto / orditura"}
    ]
  },
  "element_types": [
    {"key": "manto_copertura", "label": "Manto di copertura", "label_plural": "Manti di copertura", "icon": "layers", "estimate_category": "copertura",
     "sections": [{"key": "dati", "label": "Nuovo manto", "default_open": true, "fields": [
       {"key": "tipo_nuovo", "type": "select", "label": "Tipo nuovo manto", "width": 6, "required": true,
        "options": [{"value": "coppi", "label": "Coppi"}, {"value": "tegole", "label": "Tegole"}, {"value": "lamiera_aggraffata", "label": "Lamiera aggraffata"}, {"value": "guaina", "label": "Guaina ardesiata"}]},
       {"key": "mq", "type": "dimension", "unit": "mq", "label": "Mq", "width": 6, "required": true},
       {"key": "rimozione_vecchio", "type": "boolean", "label": "Rimozione manto esistente", "width": 6},
       {"key": "smaltimento_amianto", "type": "boolean", "label": "Smaltimento amianto", "width": 6}]}],
     "required_photos": [{"key": "prima", "label": "Stato prima", "required": true}]},
    {"key": "coibentazione", "label": "Coibentazione", "label_plural": "Coibentazioni", "icon": "thermometer", "estimate_category": "coibentazione",
     "sections": [{"key": "dati", "label": "Isolamento", "default_open": true, "fields": [
       {"key": "tipo", "type": "select", "label": "Tipo isolante", "width": 6,
        "options": [{"value": "lana_roccia", "label": "Lana di roccia"}, {"value": "lana_legno", "label": "Fibra di legno"}, {"value": "eps", "label": "EPS"}, {"value": "xps", "label": "XPS"}, {"value": "sughero", "label": "Sughero"}]},
       {"key": "spessore", "type": "dimension", "unit": "cm", "label": "Spessore", "width": 3},
       {"key": "mq", "type": "dimension", "unit": "mq", "label": "Mq", "width": 3, "required": true}]}],
     "required_photos": []},
    {"key": "lattoneria", "label": "Lattoneria", "label_plural": "Lattoneria", "icon": "git-branch", "estimate_category": "lattoneria",
     "sections": [{"key": "dati", "label": "Gronde e pluviali", "default_open": true, "fields": [
       {"key": "materiale", "type": "select", "label": "Materiale", "width": 6,
        "options": [{"value": "rame", "label": "Rame"}, {"value": "lamiera_preverniciata", "label": "Lamiera preverniciata"}, {"value": "acciaio", "label": "Acciaio inox"}, {"value": "pvc", "label": "PVC"}]},
       {"key": "gronde_ml", "type": "dimension", "unit": "ml", "label": "Gronde (ml)", "width": 6},
       {"key": "pluviali_ml", "type": "dimension", "unit": "ml", "label": "Pluviali (ml)", "width": 6},
       {"key": "scossaline_ml", "type": "dimension", "unit": "ml", "label": "Scossaline (ml)", "width": 6}]}],
     "required_photos": []},
    {"key": "linea_vita", "label": "Linea vita", "label_plural": "Linee vita", "icon": "anchor", "estimate_category": "sicurezza",
     "sections": [{"key": "dati", "label": "Dispositivo anticaduta", "default_open": true, "fields": [
       {"key": "tipo", "type": "select", "label": "Tipo", "width": 6,
        "options": [{"value": "cavo", "label": "Linea a cavo (classe C)"}, {"value": "punti", "label": "Punti di ancoraggio (classe A)"}, {"value": "rotaia", "label": "Rotaia (classe D)"}]},
       {"key": "n_punti", "type": "number", "label": "N° punti/pali", "width": 3, "min": 0},
       {"key": "ml", "type": "dimension", "unit": "ml", "label": "Sviluppo (ml)", "width": 3}]}],
     "required_photos": []}
  ],
  "general_required_photos": [
    {"key": "tetto_4_lati", "label": "Tetto da 4 lati (terra)", "hint": "Da N, S, E, O", "multiple": true, "required": true},
    {"key": "vista_drone", "label": "Vista drone", "hint": "Se disponibile"},
    {"key": "panoramica_immobile", "label": "Panoramica immobile", "required": true}
  ],
  "output_mapping": {
    "estimate_lines": {
      "manto_copertura": {"unit": "mq", "description_template": "Rifacimento manto {tipo_nuovo} - {mq} mq", "quantity_field": "mq"},
      "coibentazione": {"unit": "mq", "description_template": "Coibentazione {tipo} sp. {spessore} cm - {mq} mq", "quantity_field": "mq"},
      "lattoneria": {"unit": "ml", "description_template": "Lattoneria {materiale} - gronde {gronde_ml} ml"},
      "linea_vita": {"unit": "ml", "description_template": "Linea vita {tipo} - {ml} ml"}
    }
  }
}
$json$::jsonb
where is_system = true and category = 'tetto';

-- ── CAPPOTTO TERMICO (area: Facciata) ───────────────────────────────────────
update public.survey_templates
set version = version + 1, updated_at = now(),
    schema = $json$
{
  "version": 1,
  "header_schema": [
    {
      "key": "immobile", "label": "Immobile", "icon": "home", "default_open": true,
      "fields": [
        {"key": "tipo_immobile", "type": "select", "label": "Tipo immobile", "width": 6, "required": true,
         "options": [{"value": "villetta", "label": "Villetta / unifamiliare"}, {"value": "condominio", "label": "Condominio"}, {"value": "commerciale", "label": "Commerciale"}, {"value": "industriale", "label": "Industriale"}]},
        {"key": "piani", "type": "number", "label": "Numero piani", "width": 3, "min": 1},
        {"key": "altezza_edificio", "type": "dimension", "unit": "m", "label": "Altezza edificio", "width": 3},
        {"key": "anno_costruzione", "type": "number", "label": "Anno costruzione", "width": 3, "min": 1900, "max": 2030}
      ]
    },
    {
      "key": "energetico", "label": "Dati energetici", "icon": "thermometer",
      "fields": [
        {"key": "classe_ape", "type": "select", "label": "Classe energetica (APE)", "width": 4,
         "options": [{"value": "a", "label": "A"}, {"value": "b", "label": "B"}, {"value": "c", "label": "C"}, {"value": "d", "label": "D"}, {"value": "e", "label": "E"}, {"value": "f", "label": "F"}, {"value": "g", "label": "G"}, {"value": "non_nota", "label": "Non nota"}]},
        {"key": "muratura", "type": "select", "label": "Muratura esistente", "width": 4,
         "options": [{"value": "mattone_pieno", "label": "Mattone pieno"}, {"value": "forato", "label": "Forato"}, {"value": "cassa_vuota", "label": "Cassa vuota"}, {"value": "cemento", "label": "Cemento / pannelli"}, {"value": "sasso", "label": "Sasso / pietra"}]},
        {"key": "spessore_muro", "type": "dimension", "unit": "cm", "label": "Spessore muro", "width": 4}
      ]
    },
    {
      "key": "cantiere_sicurezza", "label": "Cantiere e sicurezza", "icon": "shield",
      "fields": [
        {"key": "ponteggio_necessario", "type": "boolean", "label": "Ponteggio necessario", "width": 6},
        {"key": "accesso_mezzi", "type": "select", "label": "Accesso mezzi", "width": 6,
         "options": [{"value": "buono", "label": "Buono"}, {"value": "limitato", "label": "Limitato"}, {"value": "assente", "label": "Assente"}]},
        {"key": "occupazione_suolo", "type": "boolean", "label": "Occupazione suolo pubblico", "width": 6}
      ]
    },
    {
      "key": "fiscale", "label": "Bonus e detrazioni", "icon": "receipt",
      "fields": [
        {"key": "detrazione", "type": "select", "label": "Detrazione", "width": 6,
         "options": [{"value": "ecobonus_65", "label": "Ecobonus 65%"}, {"value": "bonus_casa_50", "label": "Bonus Casa 50%"}, {"value": "iva_10", "label": "IVA agevolata 10%"}, {"value": "nessuno", "label": "Nessuno"}]},
        {"key": "condominio", "type": "boolean", "label": "Condominio (richiede assemblea)", "width": 6}
      ]
    }
  ],
  "area_definition": {
    "label": "Facciata", "label_plural": "Facciate",
    "name_suggestions": ["Facciata Nord", "Facciata Sud", "Facciata Est", "Facciata Ovest", "Fronte strada", "Retro"],
    "fields": [
      {"key": "esposizione", "type": "select", "label": "Esposizione", "width": 4,
       "options": [{"value": "n", "label": "Nord"}, {"value": "s", "label": "Sud"}, {"value": "e", "label": "Est"}, {"value": "o", "label": "Ovest"}]},
      {"key": "superficie_lorda_mq", "type": "dimension", "unit": "mq", "label": "Superficie lorda", "width": 4, "required": true},
      {"key": "altezza", "type": "dimension", "unit": "m", "label": "Altezza", "width": 4},
      {"key": "n_finestre", "type": "number", "label": "N° finestre", "width": 3, "min": 0},
      {"key": "n_porte", "type": "number", "label": "N° porte", "width": 3, "min": 0},
      {"key": "superficie_aperture_mq", "type": "dimension", "unit": "mq", "label": "Mq aperture (da detrarre)", "width": 6},
      {"key": "stato_intonaco", "type": "select", "label": "Stato intonaco", "width": 6, "required": true,
       "options": [{"value": "buono", "label": "Buono"}, {"value": "fessurato", "label": "Fessurato"}, {"value": "distaccato", "label": "In distacco"}, {"value": "da_rifare", "label": "Da rifare"}]},
      {"key": "presenza_balconi", "type": "compound_boolean", "label": "Balconi", "width": 6, "toggle_label": "Balconi presenti",
       "nested_fields": [{"key": "n_balconi", "type": "number", "label": "N° balconi", "width": 6, "min": 0}]},
      {"key": "davanzali", "type": "select", "label": "Davanzali", "width": 6,
       "options": [{"value": "mantenere", "label": "Da mantenere"}, {"value": "prolungare", "label": "Da prolungare"}, {"value": "sostituire", "label": "Da sostituire"}]},
      {"key": "ponti_termici_note", "type": "textarea", "label": "Ponti termici / note", "width": 12}
    ],
    "required_photos": [
      {"key": "facciata_intera", "label": "Facciata intera", "required": true},
      {"key": "angolo", "label": "Dettaglio angolo"},
      {"key": "davanzale", "label": "Davanzali / soglie"},
      {"key": "balcone", "label": "Balconi"}
    ]
  },
  "element_types": [
    {"key": "sistema_cappotto", "label": "Sistema cappotto", "label_plural": "Sistemi cappotto", "icon": "layers", "estimate_category": "cappotto",
     "sections": [{"key": "dati", "label": "Isolante", "default_open": true, "fields": [
       {"key": "tipo_isolante", "type": "select", "label": "Tipo isolante", "width": 6, "required": true,
        "options": [{"value": "eps", "label": "EPS (polistirene)"}, {"value": "eps_grafite", "label": "EPS con grafite"}, {"value": "lana_roccia", "label": "Lana di roccia"}, {"value": "xps", "label": "XPS"}, {"value": "sughero", "label": "Sughero"}, {"value": "fibra_legno", "label": "Fibra di legno"}]},
       {"key": "spessore", "type": "dimension", "unit": "cm", "label": "Spessore", "width": 3, "required": true},
       {"key": "mq", "type": "dimension", "unit": "mq", "label": "Mq", "width": 3, "required": true},
       {"key": "lambda", "type": "number", "label": "Conducibilità lambda (W/mK)", "width": 6, "step": 0.001, "decimals": 3}]}],
     "required_photos": []},
    {"key": "rasatura_finitura", "label": "Rasatura e finitura", "label_plural": "Finiture", "icon": "paintbrush", "estimate_category": "finitura",
     "sections": [{"key": "dati", "label": "Finitura", "default_open": true, "fields": [
       {"key": "tipo_finitura", "type": "select", "label": "Finitura", "width": 6,
        "options": [{"value": "silossanica", "label": "Silossanica"}, {"value": "acrilica", "label": "Acrilica"}, {"value": "silicati", "label": "Ai silicati"}, {"value": "minerale", "label": "Minerale"}]},
       {"key": "colore", "type": "color", "label": "Colore (RAL)", "width": 3},
       {"key": "mq", "type": "dimension", "unit": "mq", "label": "Mq", "width": 3}]}],
     "required_photos": []},
    {"key": "zoccolatura", "label": "Zoccolatura", "label_plural": "Zoccolature", "icon": "minus", "estimate_category": "cappotto",
     "sections": [{"key": "dati", "label": "Zoccolo", "default_open": true, "fields": [
       {"key": "tipo", "type": "select", "label": "Tipo", "width": 6,
        "options": [{"value": "xps", "label": "XPS impermeabile"}, {"value": "eps_bianco", "label": "EPS idrofugo"}]},
       {"key": "altezza", "type": "dimension", "unit": "cm", "label": "Altezza", "width": 3},
       {"key": "ml", "type": "dimension", "unit": "ml", "label": "Sviluppo (ml)", "width": 3}]}],
     "required_photos": []},
    {"key": "accessori", "label": "Accessori", "label_plural": "Accessori", "icon": "package", "estimate_category": "accessori",
     "sections": [{"key": "dati", "label": "Profili e accessori", "default_open": true, "fields": [
       {"key": "paraspigoli_ml", "type": "dimension", "unit": "ml", "label": "Paraspigoli (ml)", "width": 6},
       {"key": "gocciolatoi_ml", "type": "dimension", "unit": "ml", "label": "Gocciolatoi (ml)", "width": 6},
       {"key": "profili_partenza_ml", "type": "dimension", "unit": "ml", "label": "Profili di partenza (ml)", "width": 6},
       {"key": "rete_rinforzo", "type": "boolean", "label": "Rete di rinforzo", "width": 6}]}],
     "required_photos": []}
  ],
  "general_required_photos": [
    {"key": "edificio_intero", "label": "Edificio intero", "required": true},
    {"key": "tutte_facciate", "label": "Tutte le facciate", "multiple": true, "required": true}
  ],
  "output_mapping": {
    "estimate_lines": {
      "sistema_cappotto": {"unit": "mq", "description_template": "Cappotto {tipo_isolante} sp. {spessore} cm - {mq} mq", "quantity_field": "mq"},
      "rasatura_finitura": {"unit": "mq", "description_template": "Rasatura e finitura {tipo_finitura} - {mq} mq", "quantity_field": "mq"},
      "zoccolatura": {"unit": "ml", "description_template": "Zoccolatura {tipo} h {altezza} cm - {ml} ml"},
      "accessori": {"unit": "ml", "description_template": "Accessori cappotto (paraspigoli, gocciolatoi, profili)"}
    }
  }
}
$json$::jsonb
where is_system = true and category = 'cappotto';

-- ── CLIMATIZZAZIONE (area: Stanza) ──────────────────────────────────────────
update public.survey_templates
set version = version + 1, updated_at = now(),
    schema = $json$
{
  "version": 1,
  "header_schema": [
    {
      "key": "immobile", "label": "Immobile", "icon": "home", "default_open": true,
      "fields": [
        {"key": "tipo_immobile", "type": "select", "label": "Tipo immobile", "width": 6, "required": true,
         "options": [{"value": "appartamento", "label": "Appartamento"}, {"value": "villetta", "label": "Villetta"}, {"value": "ufficio", "label": "Ufficio"}, {"value": "commerciale", "label": "Commerciale / negozio"}]},
        {"key": "mq_totali", "type": "dimension", "unit": "mq", "label": "Mq totali", "width": 3},
        {"key": "piani", "type": "number", "label": "Piano/i", "width": 3, "min": 0}
      ]
    },
    {
      "key": "impianto_elettrico", "label": "Impianto elettrico", "icon": "zap",
      "fields": [
        {"key": "potenza_contatore", "type": "dimension", "unit": "kw", "label": "Potenza contatore", "width": 4, "placeholder": "es. 3, 4.5, 6"},
        {"key": "quadro_adeguato", "type": "boolean", "label": "Quadro adeguato", "width": 4},
        {"key": "posizione_quadro", "type": "text", "label": "Posizione quadro", "width": 4}
      ]
    },
    {
      "key": "intervento", "label": "Intervento richiesto", "icon": "settings", "default_open": true,
      "fields": [
        {"key": "tipo_intervento", "type": "select", "label": "Tipo intervento", "width": 6, "required": true,
         "options": [{"value": "nuovo", "label": "Nuovo impianto"}, {"value": "sostituzione", "label": "Sostituzione esistente"}, {"value": "ampliamento", "label": "Ampliamento"}]},
        {"key": "uso", "type": "select", "label": "Uso", "width": 6,
         "options": [{"value": "raffrescamento", "label": "Solo raffrescamento"}, {"value": "caldo_freddo", "label": "Caldo/freddo"}, {"value": "riscaldamento", "label": "Riscaldamento (pompa di calore)"}]}
      ]
    },
    {
      "key": "fiscale", "label": "Bonus e detrazioni", "icon": "receipt",
      "fields": [
        {"key": "detrazione", "type": "select", "label": "Detrazione", "width": 6,
         "options": [{"value": "ecobonus_65", "label": "Ecobonus 65%"}, {"value": "bonus_casa_50", "label": "Bonus Casa 50%"}, {"value": "conto_termico", "label": "Conto Termico"}, {"value": "iva_10", "label": "IVA agevolata 10%"}, {"value": "nessuno", "label": "Nessuno"}]},
        {"key": "pdc_richiesta", "type": "boolean", "label": "Pompa di calore richiesta", "width": 6}
      ]
    }
  ],
  "area_definition": {
    "label": "Stanza", "label_plural": "Stanze",
    "name_suggestions": ["Soggiorno", "Cucina", "Camera", "Camera 2", "Studio", "Corridoio"],
    "fields": [
      {"key": "superficie_mq", "type": "dimension", "unit": "mq", "label": "Superficie", "width": 4, "required": true},
      {"key": "altezza", "type": "dimension", "unit": "m", "label": "Altezza", "width": 4},
      {"key": "esposizione", "type": "select", "label": "Esposizione", "width": 4,
       "options": [{"value": "n", "label": "Nord"}, {"value": "s", "label": "Sud"}, {"value": "e", "label": "Est"}, {"value": "o", "label": "Ovest"}]},
      {"key": "affaccio", "type": "select", "label": "Affaccio", "width": 6,
       "options": [{"value": "esterno", "label": "Su esterno"}, {"value": "cortile", "label": "Su cortile"}, {"value": "interno", "label": "Interno"}]},
      {"key": "isolamento", "type": "select", "label": "Isolamento", "width": 6,
       "options": [{"value": "buono", "label": "Buono"}, {"value": "medio", "label": "Medio"}, {"value": "scarso", "label": "Scarso"}]},
      {"key": "n_persone", "type": "number", "label": "N° persone (di solito)", "width": 6, "min": 0},
      {"key": "carico_note", "type": "textarea", "label": "Carichi / esposizione al sole / note", "width": 12}
    ],
    "required_photos": [
      {"key": "stanza", "label": "Foto stanza", "required": true}
    ]
  },
  "element_types": [
    {"key": "unita_interna", "label": "Unità interna", "label_plural": "Unità interne", "icon": "wind", "estimate_category": "climatizzazione",
     "sections": [{"key": "dati", "label": "Unità interna", "default_open": true, "fields": [
       {"key": "tipo", "type": "select", "label": "Tipo", "width": 6, "required": true,
        "options": [{"value": "split_parete", "label": "Split a parete"}, {"value": "canalizzato", "label": "Canalizzato"}, {"value": "cassette", "label": "Cassette a soffitto"}, {"value": "console", "label": "Console / pavimento"}, {"value": "colonna", "label": "Colonna"}]},
       {"key": "potenza_kw", "type": "dimension", "unit": "kw", "label": "Potenza (kW)", "width": 3},
       {"key": "btu", "type": "number", "label": "BTU", "width": 3},
       {"key": "posizione", "type": "text", "label": "Posizione", "width": 6},
       {"key": "altezza_installazione", "type": "dimension", "unit": "m", "label": "Altezza installazione", "width": 6}]}],
     "required_photos": [{"key": "posizione_interna", "label": "Posizione unità interna", "required": true}]},
    {"key": "unita_esterna", "label": "Unità esterna (motore)", "label_plural": "Unità esterne", "icon": "fan", "estimate_category": "climatizzazione",
     "sections": [{"key": "dati", "label": "Motore", "default_open": true, "fields": [
       {"key": "posizione", "type": "select", "label": "Posizione", "width": 6, "required": true,
        "options": [{"value": "balcone", "label": "Balcone / terrazzo"}, {"value": "terra", "label": "A terra"}, {"value": "parete", "label": "A parete (staffe)"}, {"value": "tetto", "label": "In copertura"}]},
       {"key": "tipo_supporto", "type": "select", "label": "Supporto", "width": 6,
        "options": [{"value": "staffe", "label": "Staffe a muro"}, {"value": "basamento", "label": "Basamento / piedini"}, {"value": "esistente", "label": "Riuso esistente"}]},
       {"key": "spazio_sufficiente", "type": "boolean", "label": "Spazio/aerazione sufficiente", "width": 6},
       {"key": "distanza_interne", "type": "dimension", "unit": "m", "label": "Distanza dalle interne", "width": 6}]}],
     "required_photos": [{"key": "posizione_esterna", "label": "Posizione unità esterna", "required": true}]},
    {"key": "linea_frigorifera", "label": "Linea frigorifera", "label_plural": "Linee frigorifere", "icon": "route", "estimate_category": "climatizzazione",
     "sections": [{"key": "dati", "label": "Percorso tubazioni", "default_open": true, "fields": [
       {"key": "lunghezza", "type": "dimension", "unit": "m", "label": "Lunghezza", "width": 4, "required": true},
       {"key": "dislivello", "type": "dimension", "unit": "m", "label": "Dislivello", "width": 4},
       {"key": "percorso", "type": "select", "label": "Percorso", "width": 4,
        "options": [{"value": "interno_traccia", "label": "Interno sotto traccia"}, {"value": "esterno_canalina", "label": "Esterno in canalina"}, {"value": "misto", "label": "Misto"}]},
       {"key": "opere_murarie", "type": "boolean", "label": "Necessarie opere murarie", "width": 12}]}],
     "required_photos": []},
    {"key": "scarico_condensa", "label": "Scarico condensa", "label_plural": "Scarichi condensa", "icon": "droplet", "estimate_category": "climatizzazione",
     "sections": [{"key": "dati", "label": "Scarico", "default_open": true, "fields": [
       {"key": "tipo", "type": "select", "label": "Tipo", "width": 6,
        "options": [{"value": "gravita", "label": "A gravità"}, {"value": "pompa", "label": "Con pompa condensa"}]},
       {"key": "lunghezza", "type": "dimension", "unit": "m", "label": "Lunghezza", "width": 6}]}],
     "required_photos": []},
    {"key": "pompa_calore", "label": "Pompa di calore", "label_plural": "Pompe di calore", "icon": "flame", "estimate_category": "pompa_calore",
     "sections": [{"key": "dati", "label": "Pompa di calore", "default_open": true, "fields": [
       {"key": "potenza_kw", "type": "dimension", "unit": "kw", "label": "Potenza (kW)", "width": 4},
       {"key": "tipo", "type": "select", "label": "Tipo", "width": 4,
        "options": [{"value": "monoblocco", "label": "Monoblocco"}, {"value": "split", "label": "Split (interna+esterna)"}]},
       {"key": "integrazione_esistente", "type": "boolean", "label": "Integra impianto esistente", "width": 4}]}],
     "required_photos": []}
  ],
  "general_required_photos": [
    {"key": "quadro_elettrico", "label": "Quadro elettrico", "required": true},
    {"key": "facciata_unita_esterna", "label": "Zona unità esterna", "required": true}
  ],
  "output_mapping": {
    "estimate_lines": {
      "unita_interna": {"unit": "pz", "description_template": "Unità interna {tipo} {potenza_kw} kW"},
      "unita_esterna": {"unit": "pz", "description_template": "Unità esterna - {posizione}"},
      "linea_frigorifera": {"unit": "m", "description_template": "Linea frigorifera - {lunghezza} m", "quantity_field": "lunghezza"},
      "pompa_calore": {"unit": "pz", "description_template": "Pompa di calore {tipo} {potenza_kw} kW"}
    }
  }
}
$json$::jsonb
where is_system = true and category = 'climatizzazione';
