-- Preventivatore Verticalizzato Serramentisti — FASE 3.2
-- Seed data completo per il vertical 'serramentista':
--   - 11 categorie (Appendice A masterprompt)
--   - 38 famiglie template con assi_default JSONB (nessun prezzo)
--
-- Idempotente: ON CONFLICT (vertical, nome) DO NOTHING sia su categorie sia su famiglie.
-- Rieseguibile in qualunque ambiente. I prezzi li caricherà l'azienda post-install.

-- ═══════════════════════════════════════════════════════════════════════════
-- 1. CATEGORIE (11 righe)
-- ═══════════════════════════════════════════════════════════════════════════

INSERT INTO public.vertical_category_templates
  (vertical, nome, descrizione, icona, modalita_prezzo_suggerita, margine_target_percentuale, sort_order)
VALUES
  ('serramentista','Finestre','Finestre di ogni tipologia e apertura','Square','griglia',32,10),
  ('serramentista','Porte finestre','Porte finestre a 1, 2 o più ante','DoorOpen','griglia',32,20),
  ('serramentista','Scorrevoli','Scorrevoli tradizionali, alzanti e complanari','MoveHorizontal','griglia',34,30),
  ('serramentista','Persiane','Persiane, scuri, antoni in varie tipologie','Blinds','griglia',30,40),
  ('serramentista','Tapparelle e avvolgibili','Avvolgibili, cassonetti coibentati','ChevronDown','mq',28,50),
  ('serramentista','Zanzariere','Zanzariere a rullo, plissè, battente','Grid','pz',35,60),
  ('serramentista','Cassonetti e falsi telai','Falsi telai, controtelai, monoblocchi','PackageOpen','pz',30,70),
  ('serramentista','Portoncini blindati','Portoncini ingresso blindati classe RC1-RC4','Shield','pz',28,80),
  ('serramentista','Vetrate e verande','Vetrate fisse, verande, vetrofusioni','Square','mq',30,90),
  ('serramentista','Inferriate','Inferriate fisse, scorrevoli, pieghevoli','LayoutGrid','pz',35,100),
  ('serramentista','Accessori','Maniglie, cerniere, serrature, componenti','Wrench','pz',40,110)
ON CONFLICT (vertical, nome) DO NOTHING;

-- ═══════════════════════════════════════════════════════════════════════════
-- 2. FAMIGLIE — Categoria: Finestre (6 famiglie)
-- ═══════════════════════════════════════════════════════════════════════════

INSERT INTO public.vertical_family_templates
  (vertical, categoria_template_id, nome, descrizione, modalita_prezzo_base,
   unit_of_measure, griglia_asse_x_label, griglia_asse_y_label, assi_default, sort_order)
SELECT 'serramentista', cat.id, 'Finestra PVC Standard',
  'Famiglia finestre in PVC, colori standard, vetrocamera base','griglia','pz',
  'Larghezza (mm)','Altezza (mm)',
  $json$[
    {"codice":"apertura","nome":"Apertura","tipo":"discrete","obbligatorio":true,"valori":[
      {"valore":"1_anta","label":"1 anta","is_default":true},
      {"valore":"2_ante","label":"2 ante"},
      {"valore":"2_ante_fissa","label":"2 ante con fissa"},
      {"valore":"oscillo_battente","label":"Oscillo-battente"},
      {"valore":"vasistas","label":"Vasistas"}
    ]},
    {"codice":"colore","nome":"Colore","tipo":"discrete","obbligatorio":true,"valori":[
      {"valore":"bianco","label":"Bianco","is_default":true},
      {"valore":"ral","label":"RAL a scelta"},
      {"valore":"effetto_legno_chiaro","label":"Effetto legno chiaro"},
      {"valore":"effetto_legno_scuro","label":"Effetto legno scuro"},
      {"valore":"bicolore","label":"Bicolore (int/est)"}
    ]},
    {"codice":"vetro","nome":"Vetro","tipo":"discrete","obbligatorio":true,"valori":[
      {"valore":"basso_emissivo","label":"Basso emissivo 4/16/4","is_default":true},
      {"valore":"triplo","label":"Triplo vetro 4/12/4/12/4"},
      {"valore":"acustico","label":"Acustico stratificato"},
      {"valore":"antinfortunistico","label":"Antinfortunistico 33.1"},
      {"valore":"blindato","label":"Blindato P4A/P6B"}
    ]},
    {"codice":"ferramenta","nome":"Ferramenta","tipo":"discrete","obbligatorio":true,"valori":[
      {"valore":"standard","label":"Standard","is_default":true},
      {"valore":"antieffrazione_rc2","label":"Antieffrazione RC2"},
      {"valore":"antieffrazione_rc3","label":"Antieffrazione RC3"}
    ]},
    {"codice":"maniglia","nome":"Maniglia","tipo":"discrete","obbligatorio":false,"valori":[
      {"valore":"standard","label":"Standard","is_default":true},
      {"valore":"secustik","label":"Secustik"},
      {"valore":"con_chiave","label":"Con chiave"}
    ]}
  ]$json$::jsonb, 10
FROM public.vertical_category_templates cat
WHERE cat.vertical='serramentista' AND cat.nome='Finestre'
ON CONFLICT (vertical, nome) DO NOTHING;

INSERT INTO public.vertical_family_templates
  (vertical, categoria_template_id, nome, descrizione, modalita_prezzo_base,
   unit_of_measure, griglia_asse_x_label, griglia_asse_y_label, assi_default, sort_order)
SELECT 'serramentista', cat.id, 'Finestra PVC Premium',
  'Linea premium PVC, triplo vetro di serie, ferramenta antieffrazione RC2','griglia','pz',
  'Larghezza (mm)','Altezza (mm)',
  $json$[
    {"codice":"apertura","nome":"Apertura","tipo":"discrete","obbligatorio":true,"valori":[
      {"valore":"1_anta","label":"1 anta","is_default":true},
      {"valore":"2_ante","label":"2 ante"},
      {"valore":"2_ante_fissa","label":"2 ante con fissa"},
      {"valore":"oscillo_battente","label":"Oscillo-battente"}
    ]},
    {"codice":"colore","nome":"Colore","tipo":"discrete","obbligatorio":true,"valori":[
      {"valore":"bianco","label":"Bianco","is_default":true},
      {"valore":"ral","label":"RAL a scelta"},
      {"valore":"effetto_legno_chiaro","label":"Effetto legno chiaro"},
      {"valore":"effetto_legno_scuro","label":"Effetto legno scuro"},
      {"valore":"bicolore","label":"Bicolore (int/est)"}
    ]},
    {"codice":"vetro","nome":"Vetro","tipo":"discrete","obbligatorio":true,"valori":[
      {"valore":"triplo","label":"Triplo vetro 4/12/4/12/4","is_default":true},
      {"valore":"acustico","label":"Acustico stratificato"},
      {"valore":"antinfortunistico","label":"Antinfortunistico 33.1"},
      {"valore":"blindato","label":"Blindato P4A/P6B"}
    ]},
    {"codice":"ferramenta","nome":"Ferramenta","tipo":"discrete","obbligatorio":true,"valori":[
      {"valore":"antieffrazione_rc2","label":"Antieffrazione RC2","is_default":true},
      {"valore":"antieffrazione_rc3","label":"Antieffrazione RC3"}
    ]},
    {"codice":"maniglia","nome":"Maniglia","tipo":"discrete","obbligatorio":false,"valori":[
      {"valore":"secustik","label":"Secustik","is_default":true},
      {"valore":"con_chiave","label":"Con chiave"}
    ]}
  ]$json$::jsonb, 20
FROM public.vertical_category_templates cat
WHERE cat.vertical='serramentista' AND cat.nome='Finestre'
ON CONFLICT (vertical, nome) DO NOTHING;

INSERT INTO public.vertical_family_templates
  (vertical, categoria_template_id, nome, descrizione, modalita_prezzo_base,
   unit_of_measure, griglia_asse_x_label, griglia_asse_y_label, assi_default, sort_order)
SELECT 'serramentista', cat.id, 'Finestra Alluminio Standard',
  'Finestre in alluminio profilo standard, colori a magazzino','griglia','pz',
  'Larghezza (mm)','Altezza (mm)',
  $json$[
    {"codice":"apertura","nome":"Apertura","tipo":"discrete","obbligatorio":true,"valori":[
      {"valore":"1_anta","label":"1 anta","is_default":true},
      {"valore":"2_ante","label":"2 ante"},
      {"valore":"2_ante_fissa","label":"2 ante con fissa"},
      {"valore":"oscillo_battente","label":"Oscillo-battente"},
      {"valore":"vasistas","label":"Vasistas"}
    ]},
    {"codice":"colore","nome":"Colore","tipo":"discrete","obbligatorio":true,"valori":[
      {"valore":"bianco","label":"Bianco","is_default":true},
      {"valore":"nero","label":"Nero"},
      {"valore":"bronzo","label":"Bronzo"},
      {"valore":"ral","label":"RAL a scelta"}
    ]},
    {"codice":"vetro","nome":"Vetro","tipo":"discrete","obbligatorio":true,"valori":[
      {"valore":"basso_emissivo","label":"Basso emissivo 4/16/4","is_default":true},
      {"valore":"triplo","label":"Triplo vetro"},
      {"valore":"acustico","label":"Acustico stratificato"},
      {"valore":"antinfortunistico","label":"Antinfortunistico 33.1"}
    ]},
    {"codice":"ferramenta","nome":"Ferramenta","tipo":"discrete","obbligatorio":true,"valori":[
      {"valore":"standard","label":"Standard","is_default":true},
      {"valore":"antieffrazione_rc2","label":"Antieffrazione RC2"},
      {"valore":"antieffrazione_rc3","label":"Antieffrazione RC3"}
    ]},
    {"codice":"maniglia","nome":"Maniglia","tipo":"discrete","obbligatorio":false,"valori":[
      {"valore":"standard","label":"Standard","is_default":true},
      {"valore":"design","label":"Design"},
      {"valore":"con_chiave","label":"Con chiave"}
    ]}
  ]$json$::jsonb, 30
FROM public.vertical_category_templates cat
WHERE cat.vertical='serramentista' AND cat.nome='Finestre'
ON CONFLICT (vertical, nome) DO NOTHING;

INSERT INTO public.vertical_family_templates
  (vertical, categoria_template_id, nome, descrizione, modalita_prezzo_base,
   unit_of_measure, griglia_asse_x_label, griglia_asse_y_label, assi_default, sort_order)
SELECT 'serramentista', cat.id, 'Finestra Alluminio Taglio Termico',
  'Finestre in alluminio a taglio termico, profilo isolante classe A','griglia','pz',
  'Larghezza (mm)','Altezza (mm)',
  $json$[
    {"codice":"apertura","nome":"Apertura","tipo":"discrete","obbligatorio":true,"valori":[
      {"valore":"1_anta","label":"1 anta","is_default":true},
      {"valore":"2_ante","label":"2 ante"},
      {"valore":"2_ante_fissa","label":"2 ante con fissa"},
      {"valore":"oscillo_battente","label":"Oscillo-battente"}
    ]},
    {"codice":"colore_ral","nome":"Colore RAL","tipo":"discrete","obbligatorio":true,"valori":[
      {"valore":"ral9010","label":"RAL 9010 Bianco","is_default":true},
      {"valore":"ral9005","label":"RAL 9005 Nero"},
      {"valore":"ral7016","label":"RAL 7016 Antracite"},
      {"valore":"ral8019","label":"RAL 8019 Marrone"},
      {"valore":"ral_custom","label":"RAL a scelta cliente"}
    ]},
    {"codice":"vetro","nome":"Vetro","tipo":"discrete","obbligatorio":true,"valori":[
      {"valore":"basso_emissivo","label":"Basso emissivo 4/18/4","is_default":true},
      {"valore":"triplo","label":"Triplo vetro 4/14/4/14/4"},
      {"valore":"acustico","label":"Acustico stratificato"},
      {"valore":"selettivo","label":"Selettivo solare"}
    ]},
    {"codice":"ferramenta","nome":"Ferramenta","tipo":"discrete","obbligatorio":true,"valori":[
      {"valore":"standard","label":"Standard","is_default":true},
      {"valore":"antieffrazione_rc2","label":"Antieffrazione RC2"},
      {"valore":"antieffrazione_rc3","label":"Antieffrazione RC3"}
    ]},
    {"codice":"maniglia","nome":"Maniglia","tipo":"discrete","obbligatorio":false,"valori":[
      {"valore":"standard","label":"Standard","is_default":true},
      {"valore":"design","label":"Design"},
      {"valore":"con_chiave","label":"Con chiave"}
    ]}
  ]$json$::jsonb, 40
FROM public.vertical_category_templates cat
WHERE cat.vertical='serramentista' AND cat.nome='Finestre'
ON CONFLICT (vertical, nome) DO NOTHING;

INSERT INTO public.vertical_family_templates
  (vertical, categoria_template_id, nome, descrizione, modalita_prezzo_base,
   unit_of_measure, griglia_asse_x_label, griglia_asse_y_label, assi_default, sort_order)
SELECT 'serramentista', cat.id, 'Finestra Legno',
  'Finestre in legno massello, finitura verniciata','griglia','pz',
  'Larghezza (mm)','Altezza (mm)',
  $json$[
    {"codice":"apertura","nome":"Apertura","tipo":"discrete","obbligatorio":true,"valori":[
      {"valore":"1_anta","label":"1 anta","is_default":true},
      {"valore":"2_ante","label":"2 ante"},
      {"valore":"2_ante_fissa","label":"2 ante con fissa"},
      {"valore":"oscillo_battente","label":"Oscillo-battente"}
    ]},
    {"codice":"essenza","nome":"Essenza","tipo":"discrete","obbligatorio":true,"valori":[
      {"valore":"pino","label":"Pino","is_default":true},
      {"valore":"rovere","label":"Rovere"},
      {"valore":"douglas","label":"Douglas"},
      {"valore":"meranti","label":"Meranti"},
      {"valore":"larice","label":"Larice"}
    ]},
    {"codice":"finitura","nome":"Finitura","tipo":"discrete","obbligatorio":true,"valori":[
      {"valore":"trasparente","label":"Trasparente","is_default":true},
      {"valore":"noce_chiaro","label":"Noce chiaro"},
      {"valore":"noce_scuro","label":"Noce scuro"},
      {"valore":"bianco","label":"Bianco laccato"},
      {"valore":"ral","label":"RAL a scelta"}
    ]},
    {"codice":"vetro","nome":"Vetro","tipo":"discrete","obbligatorio":true,"valori":[
      {"valore":"basso_emissivo","label":"Basso emissivo 4/16/4","is_default":true},
      {"valore":"triplo","label":"Triplo vetro"},
      {"valore":"acustico","label":"Acustico stratificato"}
    ]},
    {"codice":"ferramenta","nome":"Ferramenta","tipo":"discrete","obbligatorio":true,"valori":[
      {"valore":"standard","label":"Standard","is_default":true},
      {"valore":"antieffrazione_rc2","label":"Antieffrazione RC2"}
    ]}
  ]$json$::jsonb, 50
FROM public.vertical_category_templates cat
WHERE cat.vertical='serramentista' AND cat.nome='Finestre'
ON CONFLICT (vertical, nome) DO NOTHING;

INSERT INTO public.vertical_family_templates
  (vertical, categoria_template_id, nome, descrizione, modalita_prezzo_base,
   unit_of_measure, griglia_asse_x_label, griglia_asse_y_label, assi_default, sort_order)
SELECT 'serramentista', cat.id, 'Finestra Legno-Alluminio',
  'Finestre legno interno + alluminio esterno, massima durata','griglia','pz',
  'Larghezza (mm)','Altezza (mm)',
  $json$[
    {"codice":"apertura","nome":"Apertura","tipo":"discrete","obbligatorio":true,"valori":[
      {"valore":"1_anta","label":"1 anta","is_default":true},
      {"valore":"2_ante","label":"2 ante"},
      {"valore":"2_ante_fissa","label":"2 ante con fissa"},
      {"valore":"oscillo_battente","label":"Oscillo-battente"}
    ]},
    {"codice":"essenza_interno","nome":"Essenza interno","tipo":"discrete","obbligatorio":true,"valori":[
      {"valore":"rovere","label":"Rovere","is_default":true},
      {"valore":"pino","label":"Pino"},
      {"valore":"larice","label":"Larice"},
      {"valore":"noce","label":"Noce"}
    ]},
    {"codice":"colore_esterno","nome":"Colore esterno","tipo":"discrete","obbligatorio":true,"valori":[
      {"valore":"ral9010","label":"RAL 9010 Bianco","is_default":true},
      {"valore":"ral7016","label":"RAL 7016 Antracite"},
      {"valore":"ral9005","label":"RAL 9005 Nero"},
      {"valore":"ral_custom","label":"RAL a scelta"}
    ]},
    {"codice":"vetro","nome":"Vetro","tipo":"discrete","obbligatorio":true,"valori":[
      {"valore":"basso_emissivo","label":"Basso emissivo 4/18/4","is_default":true},
      {"valore":"triplo","label":"Triplo vetro"},
      {"valore":"acustico","label":"Acustico stratificato"}
    ]},
    {"codice":"ferramenta","nome":"Ferramenta","tipo":"discrete","obbligatorio":true,"valori":[
      {"valore":"standard","label":"Standard","is_default":true},
      {"valore":"antieffrazione_rc2","label":"Antieffrazione RC2"},
      {"valore":"antieffrazione_rc3","label":"Antieffrazione RC3"}
    ]}
  ]$json$::jsonb, 60
FROM public.vertical_category_templates cat
WHERE cat.vertical='serramentista' AND cat.nome='Finestre'
ON CONFLICT (vertical, nome) DO NOTHING;

-- ═══════════════════════════════════════════════════════════════════════════
-- 3. FAMIGLIE — Categoria: Porte finestre (3 famiglie)
-- ═══════════════════════════════════════════════════════════════════════════

INSERT INTO public.vertical_family_templates
  (vertical, categoria_template_id, nome, descrizione, modalita_prezzo_base,
   unit_of_measure, griglia_asse_x_label, griglia_asse_y_label, assi_default, sort_order)
SELECT 'serramentista', cat.id, 'Porta finestra PVC',
  'Porte finestre in PVC a 1, 2 ante o 2 ante con fissa','griglia','pz',
  'Larghezza (mm)','Altezza (mm)',
  $json$[
    {"codice":"apertura","nome":"Apertura","tipo":"discrete","obbligatorio":true,"valori":[
      {"valore":"1_anta","label":"1 anta","is_default":true},
      {"valore":"2_ante","label":"2 ante"},
      {"valore":"2_ante_fissa","label":"2 ante con fissa"}
    ]},
    {"codice":"colore","nome":"Colore","tipo":"discrete","obbligatorio":true,"valori":[
      {"valore":"bianco","label":"Bianco","is_default":true},
      {"valore":"ral","label":"RAL a scelta"},
      {"valore":"effetto_legno_chiaro","label":"Effetto legno chiaro"},
      {"valore":"effetto_legno_scuro","label":"Effetto legno scuro"}
    ]},
    {"codice":"vetro","nome":"Vetro","tipo":"discrete","obbligatorio":true,"valori":[
      {"valore":"basso_emissivo","label":"Basso emissivo 4/16/4","is_default":true},
      {"valore":"triplo","label":"Triplo vetro"},
      {"valore":"acustico","label":"Acustico stratificato"},
      {"valore":"antinfortunistico","label":"Antinfortunistico 33.1"}
    ]},
    {"codice":"ferramenta","nome":"Ferramenta","tipo":"discrete","obbligatorio":true,"valori":[
      {"valore":"standard","label":"Standard","is_default":true},
      {"valore":"antieffrazione_rc2","label":"Antieffrazione RC2"},
      {"valore":"antieffrazione_rc3","label":"Antieffrazione RC3"}
    ]},
    {"codice":"maniglia","nome":"Maniglia","tipo":"discrete","obbligatorio":false,"valori":[
      {"valore":"standard","label":"Standard","is_default":true},
      {"valore":"secustik","label":"Secustik"},
      {"valore":"con_chiave","label":"Con chiave"}
    ]},
    {"codice":"soglia","nome":"Soglia","tipo":"discrete","obbligatorio":true,"valori":[
      {"valore":"standard","label":"Standard","is_default":true},
      {"valore":"ribassata","label":"Ribassata"},
      {"valore":"a_scomparsa","label":"A scomparsa"}
    ]}
  ]$json$::jsonb, 10
FROM public.vertical_category_templates cat
WHERE cat.vertical='serramentista' AND cat.nome='Porte finestre'
ON CONFLICT (vertical, nome) DO NOTHING;

INSERT INTO public.vertical_family_templates
  (vertical, categoria_template_id, nome, descrizione, modalita_prezzo_base,
   unit_of_measure, griglia_asse_x_label, griglia_asse_y_label, assi_default, sort_order)
SELECT 'serramentista', cat.id, 'Porta finestra Alluminio Taglio Termico',
  'Porte finestre in alluminio a taglio termico, colorazione RAL','griglia','pz',
  'Larghezza (mm)','Altezza (mm)',
  $json$[
    {"codice":"apertura","nome":"Apertura","tipo":"discrete","obbligatorio":true,"valori":[
      {"valore":"1_anta","label":"1 anta","is_default":true},
      {"valore":"2_ante","label":"2 ante"},
      {"valore":"2_ante_fissa","label":"2 ante con fissa"}
    ]},
    {"codice":"colore_ral","nome":"Colore RAL","tipo":"discrete","obbligatorio":true,"valori":[
      {"valore":"ral9010","label":"RAL 9010 Bianco","is_default":true},
      {"valore":"ral7016","label":"RAL 7016 Antracite"},
      {"valore":"ral9005","label":"RAL 9005 Nero"},
      {"valore":"ral_custom","label":"RAL a scelta"}
    ]},
    {"codice":"vetro","nome":"Vetro","tipo":"discrete","obbligatorio":true,"valori":[
      {"valore":"basso_emissivo","label":"Basso emissivo 4/18/4","is_default":true},
      {"valore":"triplo","label":"Triplo vetro"},
      {"valore":"acustico","label":"Acustico stratificato"}
    ]},
    {"codice":"ferramenta","nome":"Ferramenta","tipo":"discrete","obbligatorio":true,"valori":[
      {"valore":"standard","label":"Standard","is_default":true},
      {"valore":"antieffrazione_rc2","label":"Antieffrazione RC2"},
      {"valore":"antieffrazione_rc3","label":"Antieffrazione RC3"}
    ]},
    {"codice":"maniglia","nome":"Maniglia","tipo":"discrete","obbligatorio":false,"valori":[
      {"valore":"standard","label":"Standard","is_default":true},
      {"valore":"design","label":"Design"},
      {"valore":"con_chiave","label":"Con chiave"}
    ]},
    {"codice":"soglia","nome":"Soglia","tipo":"discrete","obbligatorio":true,"valori":[
      {"valore":"standard","label":"Standard","is_default":true},
      {"valore":"ribassata","label":"Ribassata"},
      {"valore":"a_scomparsa","label":"A scomparsa"}
    ]}
  ]$json$::jsonb, 20
FROM public.vertical_category_templates cat
WHERE cat.vertical='serramentista' AND cat.nome='Porte finestre'
ON CONFLICT (vertical, nome) DO NOTHING;

INSERT INTO public.vertical_family_templates
  (vertical, categoria_template_id, nome, descrizione, modalita_prezzo_base,
   unit_of_measure, griglia_asse_x_label, griglia_asse_y_label, assi_default, sort_order)
SELECT 'serramentista', cat.id, 'Porta finestra Legno-Alluminio',
  'Porte finestre legno interno + alluminio esterno','griglia','pz',
  'Larghezza (mm)','Altezza (mm)',
  $json$[
    {"codice":"apertura","nome":"Apertura","tipo":"discrete","obbligatorio":true,"valori":[
      {"valore":"1_anta","label":"1 anta","is_default":true},
      {"valore":"2_ante","label":"2 ante"},
      {"valore":"2_ante_fissa","label":"2 ante con fissa"}
    ]},
    {"codice":"essenza","nome":"Essenza interno","tipo":"discrete","obbligatorio":true,"valori":[
      {"valore":"rovere","label":"Rovere","is_default":true},
      {"valore":"pino","label":"Pino"},
      {"valore":"larice","label":"Larice"},
      {"valore":"noce","label":"Noce"}
    ]},
    {"codice":"colore_esterno","nome":"Colore esterno","tipo":"discrete","obbligatorio":true,"valori":[
      {"valore":"ral9010","label":"RAL 9010 Bianco","is_default":true},
      {"valore":"ral7016","label":"RAL 7016 Antracite"},
      {"valore":"ral_custom","label":"RAL a scelta"}
    ]},
    {"codice":"vetro","nome":"Vetro","tipo":"discrete","obbligatorio":true,"valori":[
      {"valore":"basso_emissivo","label":"Basso emissivo 4/18/4","is_default":true},
      {"valore":"triplo","label":"Triplo vetro"},
      {"valore":"acustico","label":"Acustico stratificato"}
    ]},
    {"codice":"ferramenta","nome":"Ferramenta","tipo":"discrete","obbligatorio":true,"valori":[
      {"valore":"standard","label":"Standard","is_default":true},
      {"valore":"antieffrazione_rc2","label":"Antieffrazione RC2"}
    ]}
  ]$json$::jsonb, 30
FROM public.vertical_category_templates cat
WHERE cat.vertical='serramentista' AND cat.nome='Porte finestre'
ON CONFLICT (vertical, nome) DO NOTHING;

-- ═══════════════════════════════════════════════════════════════════════════
-- 4. FAMIGLIE — Categoria: Scorrevoli (4 famiglie)
-- ═══════════════════════════════════════════════════════════════════════════

INSERT INTO public.vertical_family_templates
  (vertical, categoria_template_id, nome, descrizione, modalita_prezzo_base,
   unit_of_measure, griglia_asse_x_label, griglia_asse_y_label, assi_default, sort_order)
SELECT 'serramentista', cat.id, 'Scorrevole tradizionale PVC',
  'Scorrevole PVC tradizionale a 2 o più ante','griglia','pz',
  'Larghezza (mm)','Altezza (mm)',
  $json$[
    {"codice":"ante","nome":"Numero ante","tipo":"discrete","obbligatorio":true,"valori":[
      {"valore":"2","label":"2 ante","is_default":true},
      {"valore":"3","label":"3 ante"},
      {"valore":"4","label":"4 ante"}
    ]},
    {"codice":"colore","nome":"Colore","tipo":"discrete","obbligatorio":true,"valori":[
      {"valore":"bianco","label":"Bianco","is_default":true},
      {"valore":"ral","label":"RAL a scelta"},
      {"valore":"effetto_legno","label":"Effetto legno"}
    ]},
    {"codice":"vetro","nome":"Vetro","tipo":"discrete","obbligatorio":true,"valori":[
      {"valore":"basso_emissivo","label":"Basso emissivo 4/16/4","is_default":true},
      {"valore":"triplo","label":"Triplo vetro"},
      {"valore":"acustico","label":"Acustico stratificato"}
    ]},
    {"codice":"ferramenta","nome":"Ferramenta","tipo":"discrete","obbligatorio":true,"valori":[
      {"valore":"standard","label":"Standard","is_default":true},
      {"valore":"antieffrazione","label":"Antieffrazione"}
    ]}
  ]$json$::jsonb, 10
FROM public.vertical_category_templates cat
WHERE cat.vertical='serramentista' AND cat.nome='Scorrevoli'
ON CONFLICT (vertical, nome) DO NOTHING;

INSERT INTO public.vertical_family_templates
  (vertical, categoria_template_id, nome, descrizione, modalita_prezzo_base,
   unit_of_measure, griglia_asse_x_label, griglia_asse_y_label, assi_default, sort_order)
SELECT 'serramentista', cat.id, 'Scorrevole Alzante PVC',
  'Scorrevole alzante in PVC, facile manovra su anta pesante','griglia','pz',
  'Larghezza (mm)','Altezza (mm)',
  $json$[
    {"codice":"ante","nome":"Numero ante","tipo":"discrete","obbligatorio":true,"valori":[
      {"valore":"2","label":"2 ante","is_default":true},
      {"valore":"3","label":"3 ante"},
      {"valore":"4","label":"4 ante"}
    ]},
    {"codice":"colore","nome":"Colore","tipo":"discrete","obbligatorio":true,"valori":[
      {"valore":"bianco","label":"Bianco","is_default":true},
      {"valore":"ral","label":"RAL a scelta"},
      {"valore":"effetto_legno","label":"Effetto legno"}
    ]},
    {"codice":"vetro","nome":"Vetro","tipo":"discrete","obbligatorio":true,"valori":[
      {"valore":"basso_emissivo","label":"Basso emissivo 4/18/4","is_default":true},
      {"valore":"triplo","label":"Triplo vetro"},
      {"valore":"acustico","label":"Acustico stratificato"}
    ]},
    {"codice":"ferramenta","nome":"Ferramenta","tipo":"discrete","obbligatorio":true,"valori":[
      {"valore":"manuale","label":"Manuale","is_default":true},
      {"valore":"motorizzato","label":"Motorizzato"}
    ]}
  ]$json$::jsonb, 20
FROM public.vertical_category_templates cat
WHERE cat.vertical='serramentista' AND cat.nome='Scorrevoli'
ON CONFLICT (vertical, nome) DO NOTHING;

INSERT INTO public.vertical_family_templates
  (vertical, categoria_template_id, nome, descrizione, modalita_prezzo_base,
   unit_of_measure, griglia_asse_x_label, griglia_asse_y_label, assi_default, sort_order)
SELECT 'serramentista', cat.id, 'Scorrevole Alzante Alluminio',
  'Scorrevole alzante in alluminio, profilo premium','griglia','pz',
  'Larghezza (mm)','Altezza (mm)',
  $json$[
    {"codice":"ante","nome":"Numero ante","tipo":"discrete","obbligatorio":true,"valori":[
      {"valore":"2","label":"2 ante","is_default":true},
      {"valore":"3","label":"3 ante"},
      {"valore":"4","label":"4 ante"}
    ]},
    {"codice":"colore_ral","nome":"Colore RAL","tipo":"discrete","obbligatorio":true,"valori":[
      {"valore":"ral9010","label":"RAL 9010 Bianco","is_default":true},
      {"valore":"ral7016","label":"RAL 7016 Antracite"},
      {"valore":"ral9005","label":"RAL 9005 Nero"},
      {"valore":"ral_custom","label":"RAL a scelta"}
    ]},
    {"codice":"vetro","nome":"Vetro","tipo":"discrete","obbligatorio":true,"valori":[
      {"valore":"basso_emissivo","label":"Basso emissivo 4/18/4","is_default":true},
      {"valore":"triplo","label":"Triplo vetro"},
      {"valore":"acustico","label":"Acustico stratificato"}
    ]},
    {"codice":"ferramenta","nome":"Ferramenta","tipo":"discrete","obbligatorio":true,"valori":[
      {"valore":"standard","label":"Standard","is_default":true},
      {"valore":"antieffrazione_rc2","label":"Antieffrazione RC2"}
    ]},
    {"codice":"motorizzazione","nome":"Motorizzazione","tipo":"boolean","obbligatorio":false,"valori":[
      {"valore":"no","label":"No","is_default":true},
      {"valore":"si","label":"Sì"}
    ]}
  ]$json$::jsonb, 30
FROM public.vertical_category_templates cat
WHERE cat.vertical='serramentista' AND cat.nome='Scorrevoli'
ON CONFLICT (vertical, nome) DO NOTHING;

INSERT INTO public.vertical_family_templates
  (vertical, categoria_template_id, nome, descrizione, modalita_prezzo_base,
   unit_of_measure, griglia_asse_x_label, griglia_asse_y_label, assi_default, sort_order)
SELECT 'serramentista', cat.id, 'Scorrevole Complanare Alluminio',
  'Scorrevole complanare alluminio, ante a filo su un piano','griglia','pz',
  'Larghezza (mm)','Altezza (mm)',
  $json$[
    {"codice":"ante","nome":"Numero ante","tipo":"discrete","obbligatorio":true,"valori":[
      {"valore":"2","label":"2 ante","is_default":true},
      {"valore":"3","label":"3 ante"},
      {"valore":"4","label":"4 ante"}
    ]},
    {"codice":"colore","nome":"Colore","tipo":"discrete","obbligatorio":true,"valori":[
      {"valore":"ral9010","label":"RAL 9010 Bianco","is_default":true},
      {"valore":"ral7016","label":"RAL 7016 Antracite"},
      {"valore":"ral_custom","label":"RAL a scelta"}
    ]},
    {"codice":"vetro","nome":"Vetro","tipo":"discrete","obbligatorio":true,"valori":[
      {"valore":"basso_emissivo","label":"Basso emissivo 4/18/4","is_default":true},
      {"valore":"triplo","label":"Triplo vetro"},
      {"valore":"acustico","label":"Acustico stratificato"}
    ]},
    {"codice":"ferramenta","nome":"Ferramenta","tipo":"discrete","obbligatorio":true,"valori":[
      {"valore":"standard","label":"Standard","is_default":true},
      {"valore":"antieffrazione","label":"Antieffrazione"}
    ]}
  ]$json$::jsonb, 40
FROM public.vertical_category_templates cat
WHERE cat.vertical='serramentista' AND cat.nome='Scorrevoli'
ON CONFLICT (vertical, nome) DO NOTHING;

-- ═══════════════════════════════════════════════════════════════════════════
-- 5. FAMIGLIE — Categoria: Persiane (5 famiglie)
-- ═══════════════════════════════════════════════════════════════════════════

INSERT INTO public.vertical_family_templates
  (vertical, categoria_template_id, nome, descrizione, modalita_prezzo_base,
   unit_of_measure, griglia_asse_x_label, griglia_asse_y_label, assi_default, sort_order)
SELECT 'serramentista', cat.id, 'Persiana Alluminio Stecche Orientabili',
  'Persiana in alluminio con stecche orientabili per regolare la luce','griglia','pz',
  'Larghezza (mm)','Altezza (mm)',
  $json$[
    {"codice":"ante","nome":"Numero ante","tipo":"discrete","obbligatorio":true,"valori":[
      {"valore":"1","label":"1 anta","is_default":true},
      {"valore":"2","label":"2 ante"},
      {"valore":"3","label":"3 ante"},
      {"valore":"4","label":"4 ante"}
    ]},
    {"codice":"colore","nome":"Colore","tipo":"discrete","obbligatorio":true,"valori":[
      {"valore":"ral9010","label":"RAL 9010 Bianco","is_default":true},
      {"valore":"ral7016","label":"RAL 7016 Antracite"},
      {"valore":"effetto_legno","label":"Effetto legno"},
      {"valore":"ral_custom","label":"RAL a scelta"}
    ]},
    {"codice":"motorizzazione","nome":"Motorizzazione","tipo":"boolean","obbligatorio":true,"valori":[
      {"valore":"no","label":"No (manuale)","is_default":true},
      {"valore":"si","label":"Sì (motorizzata)"}
    ]},
    {"codice":"comando","nome":"Comando","tipo":"discrete","obbligatorio":false,"valori":[
      {"valore":"radio","label":"Radiocomando","is_default":true},
      {"valore":"filare","label":"Filare"},
      {"valore":"domotica","label":"Integrazione domotica"}
    ]}
  ]$json$::jsonb, 10
FROM public.vertical_category_templates cat
WHERE cat.vertical='serramentista' AND cat.nome='Persiane'
ON CONFLICT (vertical, nome) DO NOTHING;

INSERT INTO public.vertical_family_templates
  (vertical, categoria_template_id, nome, descrizione, modalita_prezzo_base,
   unit_of_measure, griglia_asse_x_label, griglia_asse_y_label, assi_default, sort_order)
SELECT 'serramentista', cat.id, 'Persiana Alluminio Stecche Fisse',
  'Persiana in alluminio con stecche fisse','griglia','pz',
  'Larghezza (mm)','Altezza (mm)',
  $json$[
    {"codice":"ante","nome":"Numero ante","tipo":"discrete","obbligatorio":true,"valori":[
      {"valore":"1","label":"1 anta","is_default":true},
      {"valore":"2","label":"2 ante"},
      {"valore":"3","label":"3 ante"},
      {"valore":"4","label":"4 ante"}
    ]},
    {"codice":"colore","nome":"Colore","tipo":"discrete","obbligatorio":true,"valori":[
      {"valore":"ral9010","label":"RAL 9010 Bianco","is_default":true},
      {"valore":"ral7016","label":"RAL 7016 Antracite"},
      {"valore":"effetto_legno","label":"Effetto legno"},
      {"valore":"ral_custom","label":"RAL a scelta"}
    ]},
    {"codice":"motorizzazione","nome":"Motorizzazione","tipo":"boolean","obbligatorio":true,"valori":[
      {"valore":"no","label":"No (manuale)","is_default":true},
      {"valore":"si","label":"Sì (motorizzata)"}
    ]}
  ]$json$::jsonb, 20
FROM public.vertical_category_templates cat
WHERE cat.vertical='serramentista' AND cat.nome='Persiane'
ON CONFLICT (vertical, nome) DO NOTHING;

INSERT INTO public.vertical_family_templates
  (vertical, categoria_template_id, nome, descrizione, modalita_prezzo_base,
   unit_of_measure, griglia_asse_x_label, griglia_asse_y_label, assi_default, sort_order)
SELECT 'serramentista', cat.id, 'Persiana Blindata Alluminio',
  'Persiana in alluminio blindata, certificata antieffrazione','griglia','pz',
  'Larghezza (mm)','Altezza (mm)',
  $json$[
    {"codice":"ante","nome":"Numero ante","tipo":"discrete","obbligatorio":true,"valori":[
      {"valore":"1","label":"1 anta","is_default":true},
      {"valore":"2","label":"2 ante"}
    ]},
    {"codice":"colore","nome":"Colore","tipo":"discrete","obbligatorio":true,"valori":[
      {"valore":"ral9010","label":"RAL 9010 Bianco","is_default":true},
      {"valore":"ral7016","label":"RAL 7016 Antracite"},
      {"valore":"ral_custom","label":"RAL a scelta"}
    ]},
    {"codice":"classe_antieffrazione","nome":"Classe antieffrazione","tipo":"discrete","obbligatorio":true,"valori":[
      {"valore":"rc2","label":"RC2","is_default":true},
      {"valore":"rc3","label":"RC3"},
      {"valore":"rc4","label":"RC4"}
    ]},
    {"codice":"motorizzazione","nome":"Motorizzazione","tipo":"boolean","obbligatorio":false,"valori":[
      {"valore":"no","label":"No","is_default":true},
      {"valore":"si","label":"Sì"}
    ]}
  ]$json$::jsonb, 30
FROM public.vertical_category_templates cat
WHERE cat.vertical='serramentista' AND cat.nome='Persiane'
ON CONFLICT (vertical, nome) DO NOTHING;

INSERT INTO public.vertical_family_templates
  (vertical, categoria_template_id, nome, descrizione, modalita_prezzo_base,
   unit_of_measure, griglia_asse_x_label, griglia_asse_y_label, assi_default, sort_order)
SELECT 'serramentista', cat.id, 'Persiana Legno',
  'Persiana in legno tradizionale','griglia','pz',
  'Larghezza (mm)','Altezza (mm)',
  $json$[
    {"codice":"ante","nome":"Numero ante","tipo":"discrete","obbligatorio":true,"valori":[
      {"valore":"1","label":"1 anta","is_default":true},
      {"valore":"2","label":"2 ante"},
      {"valore":"3","label":"3 ante"},
      {"valore":"4","label":"4 ante"}
    ]},
    {"codice":"essenza","nome":"Essenza","tipo":"discrete","obbligatorio":true,"valori":[
      {"valore":"pino","label":"Pino","is_default":true},
      {"valore":"douglas","label":"Douglas"},
      {"valore":"rovere","label":"Rovere"},
      {"valore":"castagno","label":"Castagno"}
    ]},
    {"codice":"finitura","nome":"Finitura","tipo":"discrete","obbligatorio":true,"valori":[
      {"valore":"trasparente","label":"Trasparente","is_default":true},
      {"valore":"noce_chiaro","label":"Noce chiaro"},
      {"valore":"noce_scuro","label":"Noce scuro"},
      {"valore":"verde","label":"Verde"},
      {"valore":"ral","label":"RAL a scelta"}
    ]}
  ]$json$::jsonb, 40
FROM public.vertical_category_templates cat
WHERE cat.vertical='serramentista' AND cat.nome='Persiane'
ON CONFLICT (vertical, nome) DO NOTHING;

INSERT INTO public.vertical_family_templates
  (vertical, categoria_template_id, nome, descrizione, modalita_prezzo_base,
   unit_of_measure, griglia_asse_x_label, griglia_asse_y_label, assi_default, sort_order)
SELECT 'serramentista', cat.id, 'Scuro Legno Interno',
  'Scuro in legno per installazione interna','griglia','pz',
  'Larghezza (mm)','Altezza (mm)',
  $json$[
    {"codice":"ante","nome":"Numero ante","tipo":"discrete","obbligatorio":true,"valori":[
      {"valore":"1","label":"1 anta","is_default":true},
      {"valore":"2","label":"2 ante"}
    ]},
    {"codice":"essenza","nome":"Essenza","tipo":"discrete","obbligatorio":true,"valori":[
      {"valore":"pino","label":"Pino","is_default":true},
      {"valore":"abete","label":"Abete"},
      {"valore":"rovere","label":"Rovere"}
    ]},
    {"codice":"finitura","nome":"Finitura","tipo":"discrete","obbligatorio":true,"valori":[
      {"valore":"grezzo","label":"Grezzo","is_default":true},
      {"valore":"bianco","label":"Bianco laccato"},
      {"valore":"noce","label":"Noce"},
      {"valore":"ral","label":"RAL a scelta"}
    ]}
  ]$json$::jsonb, 50
FROM public.vertical_category_templates cat
WHERE cat.vertical='serramentista' AND cat.nome='Persiane'
ON CONFLICT (vertical, nome) DO NOTHING;

-- ═══════════════════════════════════════════════════════════════════════════
-- 6. FAMIGLIE — Categoria: Tapparelle e avvolgibili (3 famiglie)
-- ═══════════════════════════════════════════════════════════════════════════

INSERT INTO public.vertical_family_templates
  (vertical, categoria_template_id, nome, descrizione, modalita_prezzo_base,
   unit_of_measure, griglia_asse_x_label, griglia_asse_y_label, assi_default, sort_order)
SELECT 'serramentista', cat.id, 'Tapparella PVC',
  'Tapparella in PVC, leggera ed economica','mq','mq',
  NULL, NULL,
  $json$[
    {"codice":"colore","nome":"Colore","tipo":"discrete","obbligatorio":true,"valori":[
      {"valore":"bianco","label":"Bianco","is_default":true},
      {"valore":"beige","label":"Beige"},
      {"valore":"marrone","label":"Marrone"},
      {"valore":"grigio","label":"Grigio"},
      {"valore":"verde","label":"Verde"}
    ]},
    {"codice":"spessore_stecca","nome":"Spessore stecca","tipo":"discrete","obbligatorio":true,"valori":[
      {"valore":"14mm","label":"14 mm","is_default":true},
      {"valore":"25mm","label":"25 mm"}
    ]},
    {"codice":"motorizzazione","nome":"Motorizzazione","tipo":"boolean","obbligatorio":true,"valori":[
      {"valore":"no","label":"No (cinghia/manovella)","is_default":true},
      {"valore":"si","label":"Sì (motore)"}
    ]},
    {"codice":"comando","nome":"Comando","tipo":"discrete","obbligatorio":false,"valori":[
      {"valore":"filare","label":"Filare","is_default":true},
      {"valore":"radio","label":"Radiocomando"},
      {"valore":"domotica","label":"Integrazione domotica"}
    ]}
  ]$json$::jsonb, 10
FROM public.vertical_category_templates cat
WHERE cat.vertical='serramentista' AND cat.nome='Tapparelle e avvolgibili'
ON CONFLICT (vertical, nome) DO NOTHING;

INSERT INTO public.vertical_family_templates
  (vertical, categoria_template_id, nome, descrizione, modalita_prezzo_base,
   unit_of_measure, griglia_asse_x_label, griglia_asse_y_label, assi_default, sort_order)
SELECT 'serramentista', cat.id, 'Tapparella Alluminio Coibentata',
  'Tapparella alluminio coibentata, isolamento termico e acustico','mq','mq',
  NULL, NULL,
  $json$[
    {"codice":"colore","nome":"Colore","tipo":"discrete","obbligatorio":true,"valori":[
      {"valore":"bianco","label":"Bianco","is_default":true},
      {"valore":"grigio","label":"Grigio"},
      {"valore":"antracite","label":"Antracite"},
      {"valore":"marrone","label":"Marrone"},
      {"valore":"ral","label":"RAL a scelta"}
    ]},
    {"codice":"spessore","nome":"Spessore","tipo":"discrete","obbligatorio":true,"valori":[
      {"valore":"9mm","label":"9 mm","is_default":true},
      {"valore":"14mm","label":"14 mm"},
      {"valore":"18mm","label":"18 mm"}
    ]},
    {"codice":"motorizzazione","nome":"Motorizzazione","tipo":"boolean","obbligatorio":true,"valori":[
      {"valore":"si","label":"Sì (motore)","is_default":true},
      {"valore":"no","label":"No (manuale)"}
    ]},
    {"codice":"comando","nome":"Comando","tipo":"discrete","obbligatorio":false,"valori":[
      {"valore":"radio","label":"Radiocomando","is_default":true},
      {"valore":"filare","label":"Filare"},
      {"valore":"domotica","label":"Integrazione domotica"}
    ]},
    {"codice":"classe_sicurezza","nome":"Classe sicurezza","tipo":"discrete","obbligatorio":false,"valori":[
      {"valore":"standard","label":"Standard","is_default":true},
      {"valore":"rinforzata","label":"Rinforzata"}
    ]}
  ]$json$::jsonb, 20
FROM public.vertical_category_templates cat
WHERE cat.vertical='serramentista' AND cat.nome='Tapparelle e avvolgibili'
ON CONFLICT (vertical, nome) DO NOTHING;

INSERT INTO public.vertical_family_templates
  (vertical, categoria_template_id, nome, descrizione, modalita_prezzo_base,
   unit_of_measure, griglia_asse_x_label, griglia_asse_y_label, assi_default, sort_order)
SELECT 'serramentista', cat.id, 'Tapparella Blindata',
  'Tapparella blindata certificata antieffrazione','mq','mq',
  NULL, NULL,
  $json$[
    {"codice":"colore","nome":"Colore","tipo":"discrete","obbligatorio":true,"valori":[
      {"valore":"bianco","label":"Bianco","is_default":true},
      {"valore":"grigio","label":"Grigio"},
      {"valore":"antracite","label":"Antracite"},
      {"valore":"ral","label":"RAL a scelta"}
    ]},
    {"codice":"motorizzazione","nome":"Motorizzazione","tipo":"boolean","obbligatorio":true,"valori":[
      {"valore":"si","label":"Sì","is_default":true},
      {"valore":"no","label":"No"}
    ]},
    {"codice":"classe_antieffrazione","nome":"Classe antieffrazione","tipo":"discrete","obbligatorio":true,"valori":[
      {"valore":"rc2","label":"RC2","is_default":true},
      {"valore":"rc3","label":"RC3"},
      {"valore":"rc4","label":"RC4"}
    ]}
  ]$json$::jsonb, 30
FROM public.vertical_category_templates cat
WHERE cat.vertical='serramentista' AND cat.nome='Tapparelle e avvolgibili'
ON CONFLICT (vertical, nome) DO NOTHING;

-- ═══════════════════════════════════════════════════════════════════════════
-- 7. FAMIGLIE — Categoria: Zanzariere (4 famiglie)
-- ═══════════════════════════════════════════════════════════════════════════

INSERT INTO public.vertical_family_templates
  (vertical, categoria_template_id, nome, descrizione, modalita_prezzo_base,
   unit_of_measure, griglia_asse_x_label, griglia_asse_y_label, assi_default, sort_order)
SELECT 'serramentista', cat.id, 'Zanzariera a Rullo',
  'Zanzariera a rullo in cassonetto, apertura verticale o laterale','mq','mq',
  NULL, NULL,
  $json$[
    {"codice":"apertura","nome":"Apertura","tipo":"discrete","obbligatorio":true,"valori":[
      {"valore":"verticale","label":"Verticale","is_default":true},
      {"valore":"laterale","label":"Laterale"}
    ]},
    {"codice":"colore_cassonetto","nome":"Colore cassonetto","tipo":"discrete","obbligatorio":true,"valori":[
      {"valore":"bianco","label":"Bianco","is_default":true},
      {"valore":"grigio","label":"Grigio"},
      {"valore":"marrone","label":"Marrone"},
      {"valore":"ral","label":"RAL a scelta"}
    ]},
    {"codice":"tipo_rete","nome":"Tipo rete","tipo":"discrete","obbligatorio":true,"valori":[
      {"valore":"fibra_vetro","label":"Fibra di vetro","is_default":true},
      {"valore":"poliestere","label":"Poliestere"},
      {"valore":"antipolline","label":"Antipolline"},
      {"valore":"pet_resistente","label":"Pet-resistente"}
    ]}
  ]$json$::jsonb, 10
FROM public.vertical_category_templates cat
WHERE cat.vertical='serramentista' AND cat.nome='Zanzariere'
ON CONFLICT (vertical, nome) DO NOTHING;

INSERT INTO public.vertical_family_templates
  (vertical, categoria_template_id, nome, descrizione, modalita_prezzo_base,
   unit_of_measure, griglia_asse_x_label, griglia_asse_y_label, assi_default, sort_order)
SELECT 'serramentista', cat.id, 'Zanzariera Plissettata',
  'Zanzariera plissettata scorrevole, profilo ridotto','mq','mq',
  NULL, NULL,
  $json$[
    {"codice":"colore","nome":"Colore","tipo":"discrete","obbligatorio":true,"valori":[
      {"valore":"bianco","label":"Bianco","is_default":true},
      {"valore":"grigio","label":"Grigio"},
      {"valore":"marrone","label":"Marrone"},
      {"valore":"ral","label":"RAL a scelta"}
    ]},
    {"codice":"tipo_rete","nome":"Tipo rete","tipo":"discrete","obbligatorio":true,"valori":[
      {"valore":"fibra_vetro","label":"Fibra di vetro","is_default":true},
      {"valore":"poliestere","label":"Poliestere"},
      {"valore":"antipolline","label":"Antipolline"}
    ]},
    {"codice":"tipo_guida","nome":"Tipo guida","tipo":"discrete","obbligatorio":true,"valori":[
      {"valore":"inferiore_calpestabile","label":"Inferiore calpestabile","is_default":true},
      {"valore":"a_scomparsa","label":"A scomparsa"},
      {"valore":"rialzata","label":"Rialzata"}
    ]}
  ]$json$::jsonb, 20
FROM public.vertical_category_templates cat
WHERE cat.vertical='serramentista' AND cat.nome='Zanzariere'
ON CONFLICT (vertical, nome) DO NOTHING;

INSERT INTO public.vertical_family_templates
  (vertical, categoria_template_id, nome, descrizione, modalita_prezzo_base,
   unit_of_measure, griglia_asse_x_label, griglia_asse_y_label, assi_default, sort_order)
SELECT 'serramentista', cat.id, 'Zanzariera a Battente',
  'Zanzariera a telaio battente, per porte finestre e balconi','pz','pz',
  NULL, NULL,
  $json$[
    {"codice":"formato","nome":"Formato","tipo":"discrete","obbligatorio":true,"valori":[
      {"valore":"1_anta","label":"1 anta","is_default":true},
      {"valore":"2_ante","label":"2 ante"}
    ]},
    {"codice":"colore","nome":"Colore","tipo":"discrete","obbligatorio":true,"valori":[
      {"valore":"bianco","label":"Bianco","is_default":true},
      {"valore":"grigio","label":"Grigio"},
      {"valore":"marrone","label":"Marrone"},
      {"valore":"ral","label":"RAL a scelta"}
    ]},
    {"codice":"tipo_rete","nome":"Tipo rete","tipo":"discrete","obbligatorio":true,"valori":[
      {"valore":"fibra_vetro","label":"Fibra di vetro","is_default":true},
      {"valore":"poliestere","label":"Poliestere"},
      {"valore":"antipolline","label":"Antipolline"},
      {"valore":"pet_resistente","label":"Pet-resistente"}
    ]},
    {"codice":"cerniera","nome":"Cerniera","tipo":"discrete","obbligatorio":false,"valori":[
      {"valore":"standard","label":"Standard","is_default":true},
      {"valore":"rinforzata","label":"Rinforzata"}
    ]}
  ]$json$::jsonb, 30
FROM public.vertical_category_templates cat
WHERE cat.vertical='serramentista' AND cat.nome='Zanzariere'
ON CONFLICT (vertical, nome) DO NOTHING;

INSERT INTO public.vertical_family_templates
  (vertical, categoria_template_id, nome, descrizione, modalita_prezzo_base,
   unit_of_measure, griglia_asse_x_label, griglia_asse_y_label, assi_default, sort_order)
SELECT 'serramentista', cat.id, 'Zanzariera Magnetica',
  'Zanzariera magnetica, installazione rapida senza fori','pz','pz',
  NULL, NULL,
  $json$[
    {"codice":"colore","nome":"Colore","tipo":"discrete","obbligatorio":true,"valori":[
      {"valore":"bianco","label":"Bianco","is_default":true},
      {"valore":"grigio","label":"Grigio"},
      {"valore":"marrone","label":"Marrone"}
    ]},
    {"codice":"tipo_rete","nome":"Tipo rete","tipo":"discrete","obbligatorio":true,"valori":[
      {"valore":"fibra_vetro","label":"Fibra di vetro","is_default":true},
      {"valore":"poliestere","label":"Poliestere"}
    ]}
  ]$json$::jsonb, 40
FROM public.vertical_category_templates cat
WHERE cat.vertical='serramentista' AND cat.nome='Zanzariere'
ON CONFLICT (vertical, nome) DO NOTHING;

-- ═══════════════════════════════════════════════════════════════════════════
-- 8. FAMIGLIE — Categoria: Cassonetti e falsi telai (4 famiglie)
-- ═══════════════════════════════════════════════════════════════════════════

INSERT INTO public.vertical_family_templates
  (vertical, categoria_template_id, nome, descrizione, modalita_prezzo_base,
   unit_of_measure, griglia_asse_x_label, griglia_asse_y_label, assi_default, sort_order)
SELECT 'serramentista', cat.id, 'Cassonetto Coibentato',
  'Cassonetto coibentato per avvolgibili, isolamento termico','misura_libera','ml',
  NULL, NULL,
  $json$[
    {"codice":"altezza_cassonetto","nome":"Altezza cassonetto","tipo":"discrete","obbligatorio":true,"valori":[
      {"valore":"25cm","label":"25 cm","is_default":true},
      {"valore":"30cm","label":"30 cm"},
      {"valore":"35cm","label":"35 cm"},
      {"valore":"40cm","label":"40 cm"},
      {"valore":"45cm","label":"45 cm"}
    ]},
    {"codice":"materiale","nome":"Materiale","tipo":"discrete","obbligatorio":true,"valori":[
      {"valore":"pvc","label":"PVC","is_default":true},
      {"valore":"alluminio","label":"Alluminio"},
      {"valore":"legno","label":"Legno"}
    ]},
    {"codice":"finitura_interna","nome":"Finitura interna","tipo":"discrete","obbligatorio":true,"valori":[
      {"valore":"bianca","label":"Bianca","is_default":true},
      {"valore":"legno","label":"Effetto legno"},
      {"valore":"ral","label":"RAL a scelta"}
    ]},
    {"codice":"classe_isolamento","nome":"Classe isolamento","tipo":"discrete","obbligatorio":true,"valori":[
      {"valore":"standard","label":"Standard","is_default":true},
      {"valore":"premium","label":"Premium (alta efficienza)"}
    ]}
  ]$json$::jsonb, 10
FROM public.vertical_category_templates cat
WHERE cat.vertical='serramentista' AND cat.nome='Cassonetti e falsi telai'
ON CONFLICT (vertical, nome) DO NOTHING;

INSERT INTO public.vertical_family_templates
  (vertical, categoria_template_id, nome, descrizione, modalita_prezzo_base,
   unit_of_measure, griglia_asse_x_label, griglia_asse_y_label, assi_default, sort_order)
SELECT 'serramentista', cat.id, 'Monoblocco Termico',
  'Monoblocco termico: cassonetto + controtelaio + predisposizione accessori','misura_libera','ml',
  NULL, NULL,
  $json$[
    {"codice":"altezza","nome":"Altezza","tipo":"discrete","obbligatorio":true,"valori":[
      {"valore":"25cm","label":"25 cm","is_default":true},
      {"valore":"30cm","label":"30 cm"},
      {"valore":"35cm","label":"35 cm"},
      {"valore":"40cm","label":"40 cm"}
    ]},
    {"codice":"classe_isolamento","nome":"Classe isolamento","tipo":"discrete","obbligatorio":true,"valori":[
      {"valore":"standard","label":"Standard","is_default":true},
      {"valore":"premium","label":"Premium"},
      {"valore":"passivhaus","label":"Passivhaus"}
    ]},
    {"codice":"predisposizione_zanzariera","nome":"Predisposizione zanzariera","tipo":"boolean","obbligatorio":false,"valori":[
      {"valore":"no","label":"No","is_default":true},
      {"valore":"si","label":"Sì"}
    ]}
  ]$json$::jsonb, 20
FROM public.vertical_category_templates cat
WHERE cat.vertical='serramentista' AND cat.nome='Cassonetti e falsi telai'
ON CONFLICT (vertical, nome) DO NOTHING;

INSERT INTO public.vertical_family_templates
  (vertical, categoria_template_id, nome, descrizione, modalita_prezzo_base,
   unit_of_measure, griglia_asse_x_label, griglia_asse_y_label, assi_default, sort_order)
SELECT 'serramentista', cat.id, 'Falso Telaio in Legno',
  'Falso telaio in legno per predisposizione foro','misura_libera','ml',
  NULL, NULL,
  $json$[
    {"codice":"essenza","nome":"Essenza","tipo":"discrete","obbligatorio":true,"valori":[
      {"valore":"abete","label":"Abete","is_default":true},
      {"valore":"pino","label":"Pino"},
      {"valore":"rovere","label":"Rovere"}
    ]},
    {"codice":"sezione","nome":"Sezione","tipo":"discrete","obbligatorio":true,"valori":[
      {"valore":"50x70","label":"50x70 mm","is_default":true},
      {"valore":"60x80","label":"60x80 mm"},
      {"valore":"70x90","label":"70x90 mm"}
    ]}
  ]$json$::jsonb, 30
FROM public.vertical_category_templates cat
WHERE cat.vertical='serramentista' AND cat.nome='Cassonetti e falsi telai'
ON CONFLICT (vertical, nome) DO NOTHING;

INSERT INTO public.vertical_family_templates
  (vertical, categoria_template_id, nome, descrizione, modalita_prezzo_base,
   unit_of_measure, griglia_asse_x_label, griglia_asse_y_label, assi_default, sort_order)
SELECT 'serramentista', cat.id, 'Controtelaio Metallico',
  'Controtelaio metallico per serramenti','misura_libera','ml',
  NULL, NULL,
  $json$[
    {"codice":"altezza","nome":"Altezza","tipo":"discrete","obbligatorio":true,"valori":[
      {"valore":"80mm","label":"80 mm","is_default":true},
      {"valore":"100mm","label":"100 mm"},
      {"valore":"120mm","label":"120 mm"}
    ]},
    {"codice":"tipo_ancoraggio","nome":"Tipo ancoraggio","tipo":"discrete","obbligatorio":true,"valori":[
      {"valore":"zanche","label":"Zanche a murare","is_default":true},
      {"valore":"tasselli","label":"Tasselli"},
      {"valore":"chimico","label":"Ancoraggio chimico"}
    ]}
  ]$json$::jsonb, 40
FROM public.vertical_category_templates cat
WHERE cat.vertical='serramentista' AND cat.nome='Cassonetti e falsi telai'
ON CONFLICT (vertical, nome) DO NOTHING;

-- ═══════════════════════════════════════════════════════════════════════════
-- 9. FAMIGLIE — Categoria: Portoncini blindati (3 famiglie)
-- ═══════════════════════════════════════════════════════════════════════════

INSERT INTO public.vertical_family_templates
  (vertical, categoria_template_id, nome, descrizione, modalita_prezzo_base,
   unit_of_measure, griglia_asse_x_label, griglia_asse_y_label, assi_default, sort_order)
SELECT 'serramentista', cat.id, 'Portoncino Blindato Classe RC2',
  'Portoncino blindato classe antieffrazione RC2, uso residenziale base','griglia','pz',
  'Larghezza (mm)','Altezza (mm)',
  $json$[
    {"codice":"finitura_esterna","nome":"Finitura esterna","tipo":"discrete","obbligatorio":true,"valori":[
      {"valore":"liscia_bianca","label":"Liscia bianca","is_default":true},
      {"valore":"pantografata","label":"Pantografata"},
      {"valore":"rivestita_legno","label":"Rivestita legno"},
      {"valore":"ral","label":"RAL a scelta"}
    ]},
    {"codice":"finitura_interna","nome":"Finitura interna","tipo":"discrete","obbligatorio":true,"valori":[
      {"valore":"liscia_bianca","label":"Liscia bianca","is_default":true},
      {"valore":"rovere","label":"Rovere"},
      {"valore":"noce","label":"Noce"},
      {"valore":"wenge","label":"Wenge"}
    ]},
    {"codice":"serratura","nome":"Serratura","tipo":"discrete","obbligatorio":true,"valori":[
      {"valore":"doppia_mappa","label":"Doppia mappa","is_default":true},
      {"valore":"europea","label":"Cilindro europeo"},
      {"valore":"elettronica","label":"Elettronica"}
    ]},
    {"codice":"maniglia","nome":"Maniglia","tipo":"discrete","obbligatorio":false,"valori":[
      {"valore":"standard","label":"Standard","is_default":true},
      {"valore":"design","label":"Design"}
    ]},
    {"codice":"accessori","nome":"Accessori","tipo":"discrete","obbligatorio":false,"valori":[
      {"valore":"base","label":"Base (spioncino+paletto)","is_default":true},
      {"valore":"spioncino_digitale","label":"Spioncino digitale"},
      {"valore":"videocamera","label":"Videocamera integrata"}
    ]}
  ]$json$::jsonb, 10
FROM public.vertical_category_templates cat
WHERE cat.vertical='serramentista' AND cat.nome='Portoncini blindati'
ON CONFLICT (vertical, nome) DO NOTHING;

INSERT INTO public.vertical_family_templates
  (vertical, categoria_template_id, nome, descrizione, modalita_prezzo_base,
   unit_of_measure, griglia_asse_x_label, griglia_asse_y_label, assi_default, sort_order)
SELECT 'serramentista', cat.id, 'Portoncino Blindato Classe RC3',
  'Portoncino blindato classe antieffrazione RC3','griglia','pz',
  'Larghezza (mm)','Altezza (mm)',
  $json$[
    {"codice":"finitura_esterna","nome":"Finitura esterna","tipo":"discrete","obbligatorio":true,"valori":[
      {"valore":"liscia_bianca","label":"Liscia bianca","is_default":true},
      {"valore":"pantografata","label":"Pantografata"},
      {"valore":"rivestita_legno","label":"Rivestita legno"},
      {"valore":"ral","label":"RAL a scelta"}
    ]},
    {"codice":"finitura_interna","nome":"Finitura interna","tipo":"discrete","obbligatorio":true,"valori":[
      {"valore":"liscia_bianca","label":"Liscia bianca","is_default":true},
      {"valore":"rovere","label":"Rovere"},
      {"valore":"noce","label":"Noce"},
      {"valore":"wenge","label":"Wenge"}
    ]},
    {"codice":"serratura","nome":"Serratura","tipo":"discrete","obbligatorio":true,"valori":[
      {"valore":"europea","label":"Cilindro europeo","is_default":true},
      {"valore":"doppia_mappa","label":"Doppia mappa"},
      {"valore":"elettronica","label":"Elettronica"}
    ]},
    {"codice":"maniglia","nome":"Maniglia","tipo":"discrete","obbligatorio":false,"valori":[
      {"valore":"design","label":"Design","is_default":true},
      {"valore":"standard","label":"Standard"}
    ]},
    {"codice":"accessori","nome":"Accessori","tipo":"discrete","obbligatorio":false,"valori":[
      {"valore":"base","label":"Base","is_default":true},
      {"valore":"spioncino_digitale","label":"Spioncino digitale"},
      {"valore":"videocamera","label":"Videocamera integrata"}
    ]}
  ]$json$::jsonb, 20
FROM public.vertical_category_templates cat
WHERE cat.vertical='serramentista' AND cat.nome='Portoncini blindati'
ON CONFLICT (vertical, nome) DO NOTHING;

INSERT INTO public.vertical_family_templates
  (vertical, categoria_template_id, nome, descrizione, modalita_prezzo_base,
   unit_of_measure, griglia_asse_x_label, griglia_asse_y_label, assi_default, sort_order)
SELECT 'serramentista', cat.id, 'Portoncino Blindato Classe RC4',
  'Portoncino blindato classe antieffrazione RC4, massima sicurezza','griglia','pz',
  'Larghezza (mm)','Altezza (mm)',
  $json$[
    {"codice":"finitura_esterna","nome":"Finitura esterna","tipo":"discrete","obbligatorio":true,"valori":[
      {"valore":"pantografata","label":"Pantografata","is_default":true},
      {"valore":"liscia_bianca","label":"Liscia bianca"},
      {"valore":"rivestita_legno","label":"Rivestita legno"},
      {"valore":"ral","label":"RAL a scelta"}
    ]},
    {"codice":"finitura_interna","nome":"Finitura interna","tipo":"discrete","obbligatorio":true,"valori":[
      {"valore":"rovere","label":"Rovere","is_default":true},
      {"valore":"liscia_bianca","label":"Liscia bianca"},
      {"valore":"noce","label":"Noce"},
      {"valore":"wenge","label":"Wenge"}
    ]},
    {"codice":"serratura","nome":"Serratura","tipo":"discrete","obbligatorio":true,"valori":[
      {"valore":"elettronica","label":"Elettronica","is_default":true},
      {"valore":"europea","label":"Cilindro europeo"},
      {"valore":"doppia_mappa","label":"Doppia mappa"}
    ]},
    {"codice":"maniglia","nome":"Maniglia","tipo":"discrete","obbligatorio":false,"valori":[
      {"valore":"design","label":"Design","is_default":true},
      {"valore":"standard","label":"Standard"}
    ]},
    {"codice":"accessori","nome":"Accessori","tipo":"discrete","obbligatorio":false,"valori":[
      {"valore":"videocamera","label":"Videocamera integrata","is_default":true},
      {"valore":"base","label":"Base"},
      {"valore":"spioncino_digitale","label":"Spioncino digitale"}
    ]}
  ]$json$::jsonb, 30
FROM public.vertical_category_templates cat
WHERE cat.vertical='serramentista' AND cat.nome='Portoncini blindati'
ON CONFLICT (vertical, nome) DO NOTHING;

-- ═══════════════════════════════════════════════════════════════════════════
-- 10. FAMIGLIE — Categoria: Vetrate e verande (3 famiglie)
-- ═══════════════════════════════════════════════════════════════════════════

INSERT INTO public.vertical_family_templates
  (vertical, categoria_template_id, nome, descrizione, modalita_prezzo_base,
   unit_of_measure, griglia_asse_x_label, griglia_asse_y_label, assi_default, sort_order)
SELECT 'serramentista', cat.id, 'Vetrata Fissa Alluminio',
  'Vetrata fissa su telaio alluminio, grandi superfici','mq','mq',
  NULL, NULL,
  $json$[
    {"codice":"colore_profilo","nome":"Colore profilo","tipo":"discrete","obbligatorio":true,"valori":[
      {"valore":"ral9010","label":"RAL 9010 Bianco","is_default":true},
      {"valore":"ral7016","label":"RAL 7016 Antracite"},
      {"valore":"ral9005","label":"RAL 9005 Nero"},
      {"valore":"ral_custom","label":"RAL a scelta"}
    ]},
    {"codice":"tipo_vetro","nome":"Tipo vetro","tipo":"discrete","obbligatorio":true,"valori":[
      {"valore":"basso_emissivo","label":"Basso emissivo 4/18/4","is_default":true},
      {"valore":"triplo","label":"Triplo vetro"},
      {"valore":"acustico","label":"Acustico stratificato"},
      {"valore":"antinfortunistico","label":"Antinfortunistico 33.1"}
    ]},
    {"codice":"fissaggio","nome":"Fissaggio","tipo":"discrete","obbligatorio":true,"valori":[
      {"valore":"telaio_standard","label":"Telaio standard","is_default":true},
      {"valore":"a_strutturale","label":"Strutturale (a filo)"}
    ]}
  ]$json$::jsonb, 10
FROM public.vertical_category_templates cat
WHERE cat.vertical='serramentista' AND cat.nome='Vetrate e verande'
ON CONFLICT (vertical, nome) DO NOTHING;

INSERT INTO public.vertical_family_templates
  (vertical, categoria_template_id, nome, descrizione, modalita_prezzo_base,
   unit_of_measure, griglia_asse_x_label, griglia_asse_y_label, assi_default, sort_order)
SELECT 'serramentista', cat.id, 'Veranda Alluminio',
  'Veranda in alluminio, struttura completa tetto + pareti','mq','mq',
  NULL, NULL,
  $json$[
    {"codice":"configurazione","nome":"Configurazione","tipo":"discrete","obbligatorio":true,"valori":[
      {"valore":"3_pareti","label":"3 pareti + tetto","is_default":true},
      {"valore":"2_pareti","label":"2 pareti + tetto"},
      {"valore":"solo_tetto","label":"Solo tetto (pergola coperta)"}
    ]},
    {"codice":"colore","nome":"Colore","tipo":"discrete","obbligatorio":true,"valori":[
      {"valore":"ral9010","label":"RAL 9010 Bianco","is_default":true},
      {"valore":"ral7016","label":"RAL 7016 Antracite"},
      {"valore":"ral_custom","label":"RAL a scelta"}
    ]},
    {"codice":"vetro","nome":"Vetro","tipo":"discrete","obbligatorio":true,"valori":[
      {"valore":"basso_emissivo","label":"Basso emissivo 4/18/4","is_default":true},
      {"valore":"triplo","label":"Triplo vetro"},
      {"valore":"selettivo","label":"Selettivo solare"}
    ]},
    {"codice":"tetto","nome":"Tetto","tipo":"discrete","obbligatorio":true,"valori":[
      {"valore":"vetro","label":"Vetro","is_default":true},
      {"valore":"policarbonato","label":"Policarbonato"},
      {"valore":"sandwich","label":"Pannello sandwich"}
    ]}
  ]$json$::jsonb, 20
FROM public.vertical_category_templates cat
WHERE cat.vertical='serramentista' AND cat.nome='Vetrate e verande'
ON CONFLICT (vertical, nome) DO NOTHING;

INSERT INTO public.vertical_family_templates
  (vertical, categoria_template_id, nome, descrizione, modalita_prezzo_base,
   unit_of_measure, griglia_asse_x_label, griglia_asse_y_label, assi_default, sort_order)
SELECT 'serramentista', cat.id, 'Chiusura Balcone',
  'Chiusura balcone con profilo ridotto, scorrevole o a libro','mq','mq',
  NULL, NULL,
  $json$[
    {"codice":"configurazione","nome":"Configurazione","tipo":"discrete","obbligatorio":true,"valori":[
      {"valore":"scorrevole","label":"Scorrevole","is_default":true},
      {"valore":"a_libro","label":"A libro"},
      {"valore":"vetro_sottile","label":"Vetrate sottili (all glass)"}
    ]},
    {"codice":"colore","nome":"Colore","tipo":"discrete","obbligatorio":true,"valori":[
      {"valore":"ral9010","label":"RAL 9010 Bianco","is_default":true},
      {"valore":"ral7016","label":"RAL 7016 Antracite"},
      {"valore":"ral_custom","label":"RAL a scelta"}
    ]},
    {"codice":"vetro","nome":"Vetro","tipo":"discrete","obbligatorio":true,"valori":[
      {"valore":"temperato","label":"Temperato 8 mm","is_default":true},
      {"valore":"stratificato","label":"Stratificato 6+6"},
      {"valore":"camera","label":"Vetrocamera"}
    ]},
    {"codice":"apertura","nome":"Apertura","tipo":"discrete","obbligatorio":false,"valori":[
      {"valore":"totale","label":"Totale","is_default":true},
      {"valore":"parziale","label":"Parziale"}
    ]}
  ]$json$::jsonb, 30
FROM public.vertical_category_templates cat
WHERE cat.vertical='serramentista' AND cat.nome='Vetrate e verande'
ON CONFLICT (vertical, nome) DO NOTHING;

-- ═══════════════════════════════════════════════════════════════════════════
-- 11. FAMIGLIE — Categoria: Inferriate (3 famiglie)
-- ═══════════════════════════════════════════════════════════════════════════

INSERT INTO public.vertical_family_templates
  (vertical, categoria_template_id, nome, descrizione, modalita_prezzo_base,
   unit_of_measure, griglia_asse_x_label, griglia_asse_y_label, assi_default, sort_order)
SELECT 'serramentista', cat.id, 'Inferriata Fissa',
  'Inferriata fissa in ferro, installazione a muro','griglia','pz',
  'Larghezza (mm)','Altezza (mm)',
  $json$[
    {"codice":"modello","nome":"Modello","tipo":"discrete","obbligatorio":true,"valori":[
      {"valore":"quadra","label":"Quadra","is_default":true},
      {"valore":"decorata","label":"Decorata"},
      {"valore":"a_croce","label":"A croce"},
      {"valore":"custom","label":"Custom su disegno"}
    ]},
    {"codice":"colore","nome":"Colore","tipo":"discrete","obbligatorio":true,"valori":[
      {"valore":"nero","label":"Nero","is_default":true},
      {"valore":"bianco","label":"Bianco"},
      {"valore":"grigio","label":"Grigio"},
      {"valore":"ral","label":"RAL a scelta"}
    ]},
    {"codice":"diametro_ferro","nome":"Diametro ferro","tipo":"discrete","obbligatorio":true,"valori":[
      {"valore":"14mm","label":"14 mm","is_default":true},
      {"valore":"16mm","label":"16 mm"},
      {"valore":"20mm","label":"20 mm"}
    ]},
    {"codice":"trattamento","nome":"Trattamento","tipo":"discrete","obbligatorio":true,"valori":[
      {"valore":"zincato_verniciato","label":"Zincato + verniciato","is_default":true},
      {"valore":"solo_verniciato","label":"Solo verniciato"},
      {"valore":"inox","label":"Acciaio inox"}
    ]}
  ]$json$::jsonb, 10
FROM public.vertical_category_templates cat
WHERE cat.vertical='serramentista' AND cat.nome='Inferriate'
ON CONFLICT (vertical, nome) DO NOTHING;

INSERT INTO public.vertical_family_templates
  (vertical, categoria_template_id, nome, descrizione, modalita_prezzo_base,
   unit_of_measure, griglia_asse_x_label, griglia_asse_y_label, assi_default, sort_order)
SELECT 'serramentista', cat.id, 'Inferriata Scorrevole',
  'Inferriata scorrevole su guide, apertura rapida','griglia','pz',
  'Larghezza (mm)','Altezza (mm)',
  $json$[
    {"codice":"modello","nome":"Modello","tipo":"discrete","obbligatorio":true,"valori":[
      {"valore":"quadra","label":"Quadra","is_default":true},
      {"valore":"decorata","label":"Decorata"},
      {"valore":"custom","label":"Custom su disegno"}
    ]},
    {"codice":"colore","nome":"Colore","tipo":"discrete","obbligatorio":true,"valori":[
      {"valore":"nero","label":"Nero","is_default":true},
      {"valore":"bianco","label":"Bianco"},
      {"valore":"grigio","label":"Grigio"},
      {"valore":"ral","label":"RAL a scelta"}
    ]},
    {"codice":"diametro_ferro","nome":"Diametro ferro","tipo":"discrete","obbligatorio":true,"valori":[
      {"valore":"14mm","label":"14 mm","is_default":true},
      {"valore":"16mm","label":"16 mm"},
      {"valore":"20mm","label":"20 mm"}
    ]},
    {"codice":"guide","nome":"Guide","tipo":"discrete","obbligatorio":true,"valori":[
      {"valore":"superiori","label":"Solo superiori","is_default":true},
      {"valore":"sup_inf","label":"Sup + inf"},
      {"valore":"a_scomparsa","label":"A scomparsa"}
    ]}
  ]$json$::jsonb, 20
FROM public.vertical_category_templates cat
WHERE cat.vertical='serramentista' AND cat.nome='Inferriate'
ON CONFLICT (vertical, nome) DO NOTHING;

INSERT INTO public.vertical_family_templates
  (vertical, categoria_template_id, nome, descrizione, modalita_prezzo_base,
   unit_of_measure, griglia_asse_x_label, griglia_asse_y_label, assi_default, sort_order)
SELECT 'serramentista', cat.id, 'Inferriata Pieghevole',
  'Inferriata pieghevole a libro, compatta da aperta','griglia','pz',
  'Larghezza (mm)','Altezza (mm)',
  $json$[
    {"codice":"modello","nome":"Modello","tipo":"discrete","obbligatorio":true,"valori":[
      {"valore":"quadra","label":"Quadra","is_default":true},
      {"valore":"decorata","label":"Decorata"},
      {"valore":"custom","label":"Custom su disegno"}
    ]},
    {"codice":"colore","nome":"Colore","tipo":"discrete","obbligatorio":true,"valori":[
      {"valore":"nero","label":"Nero","is_default":true},
      {"valore":"bianco","label":"Bianco"},
      {"valore":"grigio","label":"Grigio"},
      {"valore":"ral","label":"RAL a scelta"}
    ]},
    {"codice":"numero_ante","nome":"Numero ante","tipo":"discrete","obbligatorio":true,"valori":[
      {"valore":"2","label":"2 ante","is_default":true},
      {"valore":"3","label":"3 ante"},
      {"valore":"4","label":"4 ante"},
      {"valore":"6","label":"6 ante"}
    ]},
    {"codice":"trattamento","nome":"Trattamento","tipo":"discrete","obbligatorio":true,"valori":[
      {"valore":"zincato_verniciato","label":"Zincato + verniciato","is_default":true},
      {"valore":"solo_verniciato","label":"Solo verniciato"},
      {"valore":"inox","label":"Acciaio inox"}
    ]}
  ]$json$::jsonb, 30
FROM public.vertical_category_templates cat
WHERE cat.vertical='serramentista' AND cat.nome='Inferriate'
ON CONFLICT (vertical, nome) DO NOTHING;

-- ═══════════════════════════════════════════════════════════════════════════
-- FINE SEED
-- Totale: 11 categorie + 38 famiglie template (prezzi a zero).
-- L'azienda li compila con l'Edge Function installa-template-vertical.
-- ═══════════════════════════════════════════════════════════════════════════
