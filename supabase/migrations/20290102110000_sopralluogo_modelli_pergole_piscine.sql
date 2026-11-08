-- I due modelli di sopralluogo che mancavano: pergole e tende, piscine (08/11/2026).
-- Le misure hanno l'unità nel modello: da lì le legge il passaggio alle righe della commessa.
set local lock_timeout = '3s';
set local statement_timeout = '60s';

alter table public.survey_templates drop constraint if exists survey_templates_category_check;
alter table public.survey_templates add constraint survey_templates_category_check
  check (category = any (array['infissi', 'fotovoltaico', 'ristrutturazione', 'bagno', 'cucina', 'cappotto', 'tetto',
                               'impianti', 'pavimentazioni', 'porte_interne', 'climatizzazione', 'custom',
                               'pergole', 'piscine']::text[]));

insert into public.survey_templates
  (company_id, category, name, description, is_system, is_active, area_label, area_label_plural, element_label, schema)
select null, 'pergole', 'Rilievo Pergole e Tende',
       'Misure, colore, motori e fissaggio di pergole, tende da sole e chiusure laterali.',
       true, true, 'Zona', 'Zone', 'Elemento',
       $json$
{
  "version": 1,
  "header_schema": [
    {"key": "contesto", "label": "Contesto", "icon": "home", "default_open": true, "fields": [
      {"key": "tipo_immobile", "type": "select", "label": "Tipo immobile", "width": 6, "options": [
        {"value": "appartamento", "label": "Appartamento"}, {"value": "villa", "label": "Villa"},
        {"value": "commerciale", "label": "Commerciale"}]},
      {"key": "condominio", "type": "boolean", "label": "In condominio", "width": 6},
      {"key": "permessi_necessari", "type": "boolean", "label": "Servono permessi o autorizzazioni", "width": 6},
      {"key": "accesso_mezzi", "type": "select", "label": "Accesso per il montaggio", "width": 6, "options": [
        {"value": "buono", "label": "Buono"}, {"value": "limitato", "label": "Limitato"}]}
    ]}
  ],
  "area_definition": {
    "label": "Zona", "label_plural": "Zone",
    "name_suggestions": ["Terrazzo", "Giardino", "Veranda", "Ingresso"],
    "fields": [
      {"key": "esposizione", "type": "select", "label": "Esposizione", "width": 6, "options": [
        {"value": "nord", "label": "Nord"}, {"value": "est", "label": "Est"}, {"value": "sud", "label": "Sud"}, {"value": "ovest", "label": "Ovest"}]},
      {"key": "fondo", "type": "select", "label": "Fondo di appoggio", "width": 6, "options": [
        {"value": "piastrelle", "label": "Piastrelle"}, {"value": "cemento", "label": "Cemento"},
        {"value": "terra", "label": "Terra o prato"}, {"value": "legno", "label": "Legno"}]}
    ],
    "required_photos": [{"key": "panoramica", "label": "Panoramica della zona", "required": true, "multiple": true}]
  },
  "element_types": [
    {"key": "pergola", "icon": "layout-grid", "label": "Pergola", "label_plural": "Pergole", "estimate_category": "pergole",
     "sections": [
       {"key": "misure", "label": "Misure", "default_open": true, "fields": [
         {"key": "larghezza", "type": "dimension", "unit": "cm", "label": "Larghezza", "width": 4, "required": true},
         {"key": "profondita", "type": "dimension", "unit": "cm", "label": "Profondità", "width": 4, "required": true},
         {"key": "altezza", "type": "dimension", "unit": "cm", "label": "Altezza", "width": 4, "required": true}
       ]},
       {"key": "tipo", "label": "Tipo e finiture", "default_open": true, "fields": [
         {"key": "tipologia", "type": "select", "label": "Tipologia", "width": 6, "required": true, "options": [
           {"value": "bioclimatica", "label": "Bioclimatica"}, {"value": "addossata", "label": "Addossata"},
           {"value": "autoportante", "label": "Autoportante"}, {"value": "telo", "label": "Con telo"}]},
         {"key": "colore_ral", "type": "text", "label": "Colore RAL", "width": 6},
         {"key": "fissaggio", "type": "select", "label": "Fissaggio", "width": 6, "options": [
           {"value": "parete", "label": "A parete"}, {"value": "pavimento", "label": "A pavimento"}, {"value": "plinti", "label": "Su plinti"}]},
         {"key": "motori", "type": "number", "label": "Numero motori", "width": 6, "min": 0},
         {"key": "illuminazione", "type": "boolean", "label": "Illuminazione integrata", "width": 6},
         {"key": "scarico_acqua", "type": "boolean", "label": "Scarico dell'acqua da prevedere", "width": 6}
       ]}
     ],
     "required_photos": [{"key": "punto_fissaggio", "label": "Punti di fissaggio", "required": true, "multiple": true}]
    },
    {"key": "tenda", "icon": "sun", "label": "Tenda da sole", "label_plural": "Tende da sole", "allow_quantity": true, "estimate_category": "pergole",
     "sections": [
       {"key": "misure", "label": "Misure", "default_open": true, "fields": [
         {"key": "larghezza", "type": "dimension", "unit": "cm", "label": "Larghezza", "width": 4, "required": true},
         {"key": "profondita", "type": "dimension", "unit": "cm", "label": "Sporgenza", "width": 4, "required": true},
         {"key": "altezza", "type": "dimension", "unit": "cm", "label": "Altezza di fissaggio", "width": 4}
       ]},
       {"key": "tipo", "label": "Tipo e finiture", "default_open": true, "fields": [
         {"key": "tipologia", "type": "select", "label": "Tipologia", "width": 6, "options": [
           {"value": "bracci", "label": "A bracci"}, {"value": "caduta", "label": "A caduta"}, {"value": "cassonata", "label": "Cassonata"}]},
         {"key": "colore_telo", "type": "text", "label": "Colore del telo", "width": 6},
         {"key": "colore_ral", "type": "text", "label": "Colore RAL struttura", "width": 6},
         {"key": "motorizzata", "type": "boolean", "label": "Motorizzata", "width": 6}
       ]}
     ],
     "required_photos": [{"key": "parete_fissaggio", "label": "Parete di fissaggio", "required": true}]
    },
    {"key": "chiusura_laterale", "icon": "square", "label": "Chiusura laterale", "label_plural": "Chiusure laterali", "allow_quantity": true, "estimate_category": "pergole",
     "sections": [
       {"key": "misure", "label": "Misure", "default_open": true, "fields": [
         {"key": "larghezza", "type": "dimension", "unit": "cm", "label": "Larghezza", "width": 6, "required": true},
         {"key": "altezza", "type": "dimension", "unit": "cm", "label": "Altezza", "width": 6, "required": true},
         {"key": "materiale", "type": "select", "label": "Materiale", "width": 6, "options": [
           {"value": "vetro", "label": "Vetro"}, {"value": "telo", "label": "Telo"}, {"value": "frangisole", "label": "Frangisole"}]},
         {"key": "colore_ral", "type": "text", "label": "Colore RAL", "width": 6}
       ]}
     ],
     "required_photos": []
    }
  ],
  "output_mapping": {"estimate_lines": {
    "pergola": {"unit": "pz", "description_template": "Pergola {tipologia} {larghezza}x{profondita}"},
    "tenda": {"unit": "pz", "description_template": "Tenda {tipologia} {larghezza}x{profondita}"},
    "chiusura_laterale": {"unit": "pz", "description_template": "Chiusura laterale {materiale} {larghezza}x{altezza}"}
  }},
  "general_required_photos": []
}
$json$::jsonb
where not exists (select 1 from public.survey_templates t where t.is_system and t.category = 'pergole');

insert into public.survey_templates
  (company_id, category, name, description, is_system, is_active, area_label, area_label_plural, element_label, schema)
select null, 'piscine', 'Rilievo Piscine',
       'Misure della vasca, liner su misura, bordi e accessori.',
       true, true, 'Piscina', 'Piscine', 'Elemento',
       $json$
{
  "version": 1,
  "header_schema": [
    {"key": "contesto", "label": "Contesto", "icon": "home", "default_open": true, "fields": [
      {"key": "tipo_intervento", "type": "select", "label": "Tipo intervento", "width": 6, "required": true, "options": [
        {"value": "nuova", "label": "Piscina nuova"}, {"value": "rifacimento", "label": "Rifacimento"}, {"value": "solo_liner", "label": "Solo liner"}]},
      {"key": "accesso_mezzi", "type": "select", "label": "Accesso mezzi", "width": 6, "options": [
        {"value": "buono", "label": "Buono"}, {"value": "limitato", "label": "Limitato"}, {"value": "assente", "label": "Assente"}]},
      {"key": "scavo_necessario", "type": "boolean", "label": "Scavo necessario", "width": 6},
      {"key": "permessi_necessari", "type": "boolean", "label": "Servono permessi", "width": 6}
    ]}
  ],
  "area_definition": {
    "label": "Piscina", "label_plural": "Piscine",
    "name_suggestions": ["Piscina principale", "Vasca idromassaggio"],
    "fields": [
      {"key": "forma", "type": "select", "label": "Forma", "width": 6, "options": [
        {"value": "rettangolare", "label": "Rettangolare"}, {"value": "ovale", "label": "Ovale"}, {"value": "libera", "label": "Forma libera"}]},
      {"key": "terreno", "type": "select", "label": "Terreno", "width": 6, "options": [
        {"value": "piano", "label": "Piano"}, {"value": "pendenza", "label": "In pendenza"}]}
    ],
    "required_photos": [{"key": "panoramica", "label": "Panoramica", "required": true, "multiple": true}]
  },
  "element_types": [
    {"key": "vasca_piscina", "icon": "droplet", "label": "Vasca", "label_plural": "Vasche", "estimate_category": "piscine",
     "sections": [
       {"key": "misure", "label": "Misure", "default_open": true, "fields": [
         {"key": "larghezza", "type": "dimension", "unit": "cm", "label": "Larghezza", "width": 4, "required": true},
         {"key": "profondita", "type": "dimension", "unit": "cm", "label": "Lunghezza", "width": 4, "required": true},
         {"key": "altezza", "type": "dimension", "unit": "cm", "label": "Profondità della vasca", "width": 4, "required": true},
         {"key": "struttura", "type": "select", "label": "Struttura", "width": 6, "options": [
           {"value": "cemento", "label": "Cemento armato"}, {"value": "pannelli", "label": "Pannelli"}, {"value": "vetroresina", "label": "Vetroresina"}]},
         {"key": "skimmer", "type": "number", "label": "Numero skimmer", "width": 6, "min": 0}
       ]}
     ],
     "required_photos": [{"key": "vasca", "label": "Vasca o area di scavo", "required": true, "multiple": true}]
    },
    {"key": "liner", "icon": "layers", "label": "Liner su misura", "label_plural": "Liner", "estimate_category": "piscine",
     "sections": [
       {"key": "misure", "label": "Misure", "default_open": true, "fields": [
         {"key": "larghezza", "type": "dimension", "unit": "cm", "label": "Larghezza", "width": 4, "required": true},
         {"key": "profondita", "type": "dimension", "unit": "cm", "label": "Lunghezza", "width": 4, "required": true},
         {"key": "altezza", "type": "dimension", "unit": "cm", "label": "Altezza", "width": 4, "required": true},
         {"key": "colore", "type": "text", "label": "Colore", "width": 6},
         {"key": "spessore_mm", "type": "number", "label": "Spessore (mm)", "width": 6, "min": 0}
       ]}
     ],
     "required_photos": []
    },
    {"key": "bordo", "icon": "square", "label": "Bordo", "label_plural": "Bordi", "estimate_category": "piscine",
     "sections": [
       {"key": "misure", "label": "Misure", "default_open": true, "fields": [
         {"key": "ml", "type": "dimension", "unit": "ml", "label": "Metri lineari", "width": 6, "required": true},
         {"key": "materiale", "type": "text", "label": "Materiale", "width": 6}
       ]}
     ],
     "required_photos": []
    },
    {"key": "solarium", "icon": "layout-grid", "label": "Solarium", "label_plural": "Solarium", "estimate_category": "piscine",
     "sections": [
       {"key": "misure", "label": "Misure", "default_open": true, "fields": [
         {"key": "mq", "type": "dimension", "unit": "mq", "label": "Superficie", "width": 6, "required": true},
         {"key": "materiale", "type": "text", "label": "Materiale", "width": 6}
       ]}
     ],
     "required_photos": []
    },
    {"key": "accessorio_piscina", "icon": "wrench", "label": "Accessorio", "label_plural": "Accessori", "allow_quantity": true, "estimate_category": "piscine",
     "sections": [
       {"key": "dati", "label": "Dati", "default_open": true, "fields": [
         {"key": "tipologia", "type": "select", "label": "Tipo", "width": 12, "required": true, "options": [
           {"value": "scaletta", "label": "Scaletta"}, {"value": "faro", "label": "Faro"}, {"value": "pompa", "label": "Pompa"},
           {"value": "filtro", "label": "Filtro"}, {"value": "copertura", "label": "Copertura"}]}
       ]}
     ],
     "required_photos": []
    }
  ],
  "output_mapping": {"estimate_lines": {
    "vasca_piscina": {"unit": "pz", "description_template": "Vasca {larghezza}x{profondita}x{altezza}"},
    "liner": {"unit": "pz", "description_template": "Liner {larghezza}x{profondita}x{altezza} {colore}"},
    "bordo": {"unit": "ml", "description_template": "Bordo {materiale}"},
    "solarium": {"unit": "mq", "description_template": "Solarium {materiale}"},
    "accessorio_piscina": {"unit": "pz", "description_template": "{tipologia}"}
  }},
  "general_required_photos": []
}
$json$::jsonb
where not exists (select 1 from public.survey_templates t where t.is_system and t.category = 'piscine');
