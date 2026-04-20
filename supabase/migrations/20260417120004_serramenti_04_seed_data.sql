-- ════════════════════════════════════════════════════════════════════
-- FASE 3 — Seed serramentista (categorie + famiglie template + tariffe)
-- ════════════════════════════════════════════════════════════════════

-- ═══ Categorie serramentista ═══
INSERT INTO public.vertical_category_templates
  (vertical, nome, descrizione, icona, modalita_prezzo_suggerita, margine_target_percentuale, sort_order) VALUES
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
ON CONFLICT DO NOTHING;

-- ═══ Finestre ═══
WITH cat AS (SELECT id FROM public.vertical_category_templates WHERE vertical='serramentista' AND nome='Finestre' LIMIT 1)
INSERT INTO public.vertical_family_templates
  (vertical, categoria_template_id, nome, descrizione, modalita_prezzo_base, unit_of_measure, griglia_asse_x_label, griglia_asse_y_label, assi_default, sort_order)
SELECT 'serramentista', cat.id, 'Finestra PVC Standard',
  'Famiglia finestre PVC colori standard, vetrocamera base','griglia','pz','Larghezza (mm)','Altezza (mm)',
  '[
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
  ]'::jsonb, 10 FROM cat
ON CONFLICT DO NOTHING;

WITH cat AS (SELECT id FROM public.vertical_category_templates WHERE vertical='serramentista' AND nome='Finestre' LIMIT 1)
INSERT INTO public.vertical_family_templates
  (vertical, categoria_template_id, nome, descrizione, modalita_prezzo_base, unit_of_measure, griglia_asse_x_label, griglia_asse_y_label, assi_default, sort_order)
SELECT 'serramentista', cat.id, 'Finestra Alluminio Taglio Termico',
  'Finestre in alluminio a taglio termico, profilo premium','griglia','pz','Larghezza (mm)','Altezza (mm)',
  '[
    {"codice":"apertura","nome":"Apertura","tipo":"discrete","obbligatorio":true,"valori":[
      {"valore":"1_anta","label":"1 anta","is_default":true},
      {"valore":"2_ante","label":"2 ante"},
      {"valore":"oscillo_battente","label":"Oscillo-battente"}
    ]},
    {"codice":"colore","nome":"Colore RAL","tipo":"discrete","obbligatorio":true,"valori":[
      {"valore":"bianco","label":"RAL 9010 Bianco","is_default":true},
      {"valore":"nero","label":"RAL 9005 Nero"},
      {"valore":"grigio","label":"RAL 7016 Antracite"},
      {"valore":"ral_custom","label":"RAL a scelta"}
    ]},
    {"codice":"vetro","nome":"Vetro","tipo":"discrete","obbligatorio":true,"valori":[
      {"valore":"basso_emissivo","label":"Basso emissivo","is_default":true},
      {"valore":"triplo","label":"Triplo vetro"},
      {"valore":"acustico","label":"Acustico stratificato"}
    ]},
    {"codice":"ferramenta","nome":"Ferramenta","tipo":"discrete","obbligatorio":true,"valori":[
      {"valore":"standard","label":"Standard","is_default":true},
      {"valore":"rc2","label":"Antieffrazione RC2"}
    ]}
  ]'::jsonb, 20 FROM cat
ON CONFLICT DO NOTHING;

WITH cat AS (SELECT id FROM public.vertical_category_templates WHERE vertical='serramentista' AND nome='Finestre' LIMIT 1)
INSERT INTO public.vertical_family_templates
  (vertical, categoria_template_id, nome, descrizione, modalita_prezzo_base, unit_of_measure, griglia_asse_x_label, griglia_asse_y_label, assi_default, sort_order)
SELECT 'serramentista', cat.id, 'Finestra Legno-Alluminio',
  'Finestre in legno-alluminio, legno interno alluminio esterno','griglia','pz','Larghezza (mm)','Altezza (mm)',
  '[
    {"codice":"apertura","nome":"Apertura","tipo":"discrete","obbligatorio":true,"valori":[
      {"valore":"1_anta","label":"1 anta","is_default":true},
      {"valore":"2_ante","label":"2 ante"}
    ]},
    {"codice":"essenza","nome":"Essenza legno","tipo":"discrete","obbligatorio":true,"valori":[
      {"valore":"rovere","label":"Rovere","is_default":true},
      {"valore":"abete","label":"Abete lamellare"},
      {"valore":"pino","label":"Pino lamellare"}
    ]},
    {"codice":"colore_esterno","nome":"Colore esterno","tipo":"discrete","obbligatorio":true,"valori":[
      {"valore":"bianco","label":"RAL 9010","is_default":true},
      {"valore":"nero","label":"RAL 9005"},
      {"valore":"ral_custom","label":"RAL a scelta"}
    ]},
    {"codice":"vetro","nome":"Vetro","tipo":"discrete","obbligatorio":true,"valori":[
      {"valore":"triplo","label":"Triplo vetro","is_default":true},
      {"valore":"acustico","label":"Acustico"}
    ]}
  ]'::jsonb, 30 FROM cat
ON CONFLICT DO NOTHING;

-- ═══ Porte finestre ═══
WITH cat AS (SELECT id FROM public.vertical_category_templates WHERE vertical='serramentista' AND nome='Porte finestre' LIMIT 1)
INSERT INTO public.vertical_family_templates
  (vertical, categoria_template_id, nome, descrizione, modalita_prezzo_base, unit_of_measure, griglia_asse_x_label, griglia_asse_y_label, assi_default, sort_order)
SELECT 'serramentista', cat.id, 'Porta finestra PVC',
  'Porta finestra PVC 1 o 2 ante','griglia','pz','Larghezza (mm)','Altezza (mm)',
  '[
    {"codice":"apertura","nome":"Apertura","tipo":"discrete","obbligatorio":true,"valori":[
      {"valore":"1_anta","label":"1 anta","is_default":true},
      {"valore":"2_ante","label":"2 ante"},
      {"valore":"2_ante_fissa","label":"2 ante con fissa"}
    ]},
    {"codice":"colore","nome":"Colore","tipo":"discrete","obbligatorio":true,"valori":[
      {"valore":"bianco","label":"Bianco","is_default":true},
      {"valore":"ral","label":"RAL a scelta"},
      {"valore":"effetto_legno","label":"Effetto legno"}
    ]},
    {"codice":"vetro","nome":"Vetro","tipo":"discrete","obbligatorio":true,"valori":[
      {"valore":"basso_emissivo","label":"Basso emissivo","is_default":true},
      {"valore":"triplo","label":"Triplo vetro"},
      {"valore":"acustico","label":"Acustico"}
    ]},
    {"codice":"soglia","nome":"Soglia","tipo":"discrete","obbligatorio":true,"valori":[
      {"valore":"standard","label":"Standard","is_default":true},
      {"valore":"ribassata","label":"Ribassata"},
      {"valore":"termica","label":"Termica ridotta"}
    ]}
  ]'::jsonb, 10 FROM cat
ON CONFLICT DO NOTHING;

-- ═══ Scorrevoli ═══
WITH cat AS (SELECT id FROM public.vertical_category_templates WHERE vertical='serramentista' AND nome='Scorrevoli' LIMIT 1)
INSERT INTO public.vertical_family_templates
  (vertical, categoria_template_id, nome, descrizione, modalita_prezzo_base, unit_of_measure, griglia_asse_x_label, griglia_asse_y_label, assi_default, sort_order)
SELECT 'serramentista', cat.id, 'Alzante Scorrevole Alluminio',
  'Scorrevole alzante in alluminio taglio termico','griglia','pz','Larghezza (mm)','Altezza (mm)',
  '[
    {"codice":"ante","nome":"Configurazione ante","tipo":"discrete","obbligatorio":true,"valori":[
      {"valore":"2a","label":"2 ante (1 scorrevole)","is_default":true},
      {"valore":"3a","label":"3 ante"},
      {"valore":"4a","label":"4 ante"}
    ]},
    {"codice":"colore","nome":"Colore","tipo":"discrete","obbligatorio":true,"valori":[
      {"valore":"bianco","label":"RAL 9010","is_default":true},
      {"valore":"nero","label":"RAL 9005"},
      {"valore":"ral","label":"RAL a scelta"}
    ]},
    {"codice":"vetro","nome":"Vetro","tipo":"discrete","obbligatorio":true,"valori":[
      {"valore":"triplo","label":"Triplo vetro","is_default":true},
      {"valore":"acustico","label":"Acustico"}
    ]},
    {"codice":"motorizzazione","nome":"Motorizzazione","tipo":"discrete","obbligatorio":false,"valori":[
      {"valore":"no","label":"Manuale","is_default":true},
      {"valore":"si","label":"Motorizzato"}
    ]}
  ]'::jsonb, 10 FROM cat
ON CONFLICT DO NOTHING;

-- ═══ Persiane ═══
WITH cat AS (SELECT id FROM public.vertical_category_templates WHERE vertical='serramentista' AND nome='Persiane' LIMIT 1)
INSERT INTO public.vertical_family_templates
  (vertical, categoria_template_id, nome, descrizione, modalita_prezzo_base, unit_of_measure, griglia_asse_x_label, griglia_asse_y_label, assi_default, sort_order)
SELECT 'serramentista', cat.id, 'Persiana Alluminio Stecche Orientabili',
  'Persiana in alluminio con stecche orientabili','griglia','pz','Larghezza (mm)','Altezza (mm)',
  '[
    {"codice":"ante","nome":"Ante","tipo":"discrete","obbligatorio":true,"valori":[
      {"valore":"1","label":"1 anta","is_default":true},
      {"valore":"2","label":"2 ante"},
      {"valore":"4","label":"4 ante"}
    ]},
    {"codice":"colore","nome":"Colore","tipo":"discrete","obbligatorio":true,"valori":[
      {"valore":"bianco","label":"RAL 9010","is_default":true},
      {"valore":"verde","label":"Verde tradizionale"},
      {"valore":"marrone","label":"Marrone"},
      {"valore":"ral","label":"RAL a scelta"}
    ]},
    {"codice":"motorizzazione","nome":"Motorizzazione","tipo":"discrete","obbligatorio":false,"valori":[
      {"valore":"no","label":"Manuale","is_default":true},
      {"valore":"si","label":"Motorizzata"}
    ]}
  ]'::jsonb, 10 FROM cat
ON CONFLICT DO NOTHING;

-- ═══ Tapparelle ═══
WITH cat AS (SELECT id FROM public.vertical_category_templates WHERE vertical='serramentista' AND nome='Tapparelle e avvolgibili' LIMIT 1)
INSERT INTO public.vertical_family_templates
  (vertical, categoria_template_id, nome, descrizione, modalita_prezzo_base, unit_of_measure, griglia_asse_x_label, griglia_asse_y_label, assi_default, sort_order)
SELECT 'serramentista', cat.id, 'Tapparella PVC',
  'Tapparella avvolgibile in PVC','mq','mq','Larghezza (mm)','Altezza (mm)',
  '[
    {"codice":"colore","nome":"Colore","tipo":"discrete","obbligatorio":true,"valori":[
      {"valore":"bianco","label":"Bianco","is_default":true},
      {"valore":"marrone","label":"Marrone"},
      {"valore":"grigio","label":"Grigio"}
    ]},
    {"codice":"motorizzazione","nome":"Motorizzazione","tipo":"discrete","obbligatorio":true,"valori":[
      {"valore":"manuale","label":"Manuale (argano)","is_default":true},
      {"valore":"motore","label":"Motore elettrico"},
      {"valore":"motore_smart","label":"Motore smart/radiocomando"}
    ]}
  ]'::jsonb, 10 FROM cat
ON CONFLICT DO NOTHING;

WITH cat AS (SELECT id FROM public.vertical_category_templates WHERE vertical='serramentista' AND nome='Tapparelle e avvolgibili' LIMIT 1)
INSERT INTO public.vertical_family_templates
  (vertical, categoria_template_id, nome, descrizione, modalita_prezzo_base, unit_of_measure, griglia_asse_x_label, griglia_asse_y_label, assi_default, sort_order)
SELECT 'serramentista', cat.id, 'Tapparella Alluminio Coibentata',
  'Tapparella in alluminio coibentata, maggiore sicurezza','mq','mq','Larghezza (mm)','Altezza (mm)',
  '[
    {"codice":"colore","nome":"Colore","tipo":"discrete","obbligatorio":true,"valori":[
      {"valore":"bianco","label":"Bianco","is_default":true},
      {"valore":"grigio","label":"Grigio antracite"},
      {"valore":"ral","label":"RAL a scelta"}
    ]},
    {"codice":"motorizzazione","nome":"Motorizzazione","tipo":"discrete","obbligatorio":true,"valori":[
      {"valore":"motore","label":"Motore elettrico","is_default":true},
      {"valore":"motore_smart","label":"Motore smart"}
    ]},
    {"codice":"sicurezza","nome":"Classe sicurezza","tipo":"discrete","obbligatorio":false,"valori":[
      {"valore":"standard","label":"Standard","is_default":true},
      {"valore":"rc2","label":"Antieffrazione RC2"}
    ]}
  ]'::jsonb, 20 FROM cat
ON CONFLICT DO NOTHING;

-- ═══ Zanzariere ═══
WITH cat AS (SELECT id FROM public.vertical_category_templates WHERE vertical='serramentista' AND nome='Zanzariere' LIMIT 1)
INSERT INTO public.vertical_family_templates
  (vertical, categoria_template_id, nome, descrizione, modalita_prezzo_base, unit_of_measure, griglia_asse_x_label, griglia_asse_y_label, assi_default, sort_order)
SELECT 'serramentista', cat.id, 'Zanzariera a Rullo',
  'Zanzariera con cassonetto e rullo avvolgibile','mq','mq','Larghezza (mm)','Altezza (mm)',
  '[
    {"codice":"apertura","nome":"Direzione apertura","tipo":"discrete","obbligatorio":true,"valori":[
      {"valore":"verticale","label":"Verticale","is_default":true},
      {"valore":"laterale","label":"Laterale"}
    ]},
    {"codice":"colore","nome":"Colore cassonetto","tipo":"discrete","obbligatorio":true,"valori":[
      {"valore":"bianco","label":"Bianco","is_default":true},
      {"valore":"marrone","label":"Marrone"},
      {"valore":"grigio","label":"Grigio"}
    ]},
    {"codice":"rete","nome":"Tipo rete","tipo":"discrete","obbligatorio":false,"valori":[
      {"valore":"standard","label":"Standard","is_default":true},
      {"valore":"antipolline","label":"Antipolline"},
      {"valore":"antimicro","label":"Anti-microinsetti"}
    ]}
  ]'::jsonb, 10 FROM cat
ON CONFLICT DO NOTHING;

-- ═══ Portoncini blindati ═══
WITH cat AS (SELECT id FROM public.vertical_category_templates WHERE vertical='serramentista' AND nome='Portoncini blindati' LIMIT 1)
INSERT INTO public.vertical_family_templates
  (vertical, categoria_template_id, nome, descrizione, modalita_prezzo_base, unit_of_measure, griglia_asse_x_label, griglia_asse_y_label, assi_default, sort_order)
SELECT 'serramentista', cat.id, 'Portoncino Blindato Classe RC3',
  'Portoncino ingresso blindato classe RC3','griglia','pz','Larghezza (mm)','Altezza (mm)',
  '[
    {"codice":"finitura_est","nome":"Finitura esterna","tipo":"discrete","obbligatorio":true,"valori":[
      {"valore":"laminato","label":"Laminato","is_default":true},
      {"valore":"legno","label":"Legno massello"},
      {"valore":"metallo","label":"Metallo verniciato"}
    ]},
    {"codice":"finitura_int","nome":"Finitura interna","tipo":"discrete","obbligatorio":true,"valori":[
      {"valore":"liscia","label":"Liscia","is_default":true},
      {"valore":"pantografata","label":"Pantografata"}
    ]},
    {"codice":"serratura","nome":"Serratura","tipo":"discrete","obbligatorio":true,"valori":[
      {"valore":"europea","label":"Cilindro europeo","is_default":true},
      {"valore":"doppia_mappa","label":"Doppia mappa"},
      {"valore":"elettronica","label":"Elettronica smart"}
    ]}
  ]'::jsonb, 10 FROM cat
ON CONFLICT DO NOTHING;

-- ═══ Vetrate e verande ═══
WITH cat AS (SELECT id FROM public.vertical_category_templates WHERE vertical='serramentista' AND nome='Vetrate e verande' LIMIT 1)
INSERT INTO public.vertical_family_templates
  (vertical, categoria_template_id, nome, descrizione, modalita_prezzo_base, unit_of_measure, griglia_asse_x_label, griglia_asse_y_label, assi_default, sort_order)
SELECT 'serramentista', cat.id, 'Vetrata Fissa Alluminio',
  'Vetrata panoramica fissa in alluminio','mq','mq','Larghezza (mm)','Altezza (mm)',
  '[
    {"codice":"colore","nome":"Colore profilo","tipo":"discrete","obbligatorio":true,"valori":[
      {"valore":"nero","label":"Nero","is_default":true},
      {"valore":"bianco","label":"Bianco"},
      {"valore":"grigio","label":"Grigio"}
    ]},
    {"codice":"vetro","nome":"Vetro","tipo":"discrete","obbligatorio":true,"valori":[
      {"valore":"basso_emissivo","label":"Basso emissivo","is_default":true},
      {"valore":"triplo","label":"Triplo vetro"},
      {"valore":"antinfortunistico","label":"Antinfortunistico"}
    ]}
  ]'::jsonb, 10 FROM cat
ON CONFLICT DO NOTHING;

-- ═══ Inferriate ═══
WITH cat AS (SELECT id FROM public.vertical_category_templates WHERE vertical='serramentista' AND nome='Inferriate' LIMIT 1)
INSERT INTO public.vertical_family_templates
  (vertical, categoria_template_id, nome, descrizione, modalita_prezzo_base, unit_of_measure, griglia_asse_x_label, griglia_asse_y_label, assi_default, sort_order)
SELECT 'serramentista', cat.id, 'Inferriata Scorrevole',
  'Inferriata scorrevole con guide superiori e inferiori','griglia','pz','Larghezza (mm)','Altezza (mm)',
  '[
    {"codice":"modello","nome":"Modello","tipo":"discrete","obbligatorio":true,"valori":[
      {"valore":"semplice","label":"Semplice","is_default":true},
      {"valore":"decorato","label":"Decorato"}
    ]},
    {"codice":"colore","nome":"Colore","tipo":"discrete","obbligatorio":true,"valori":[
      {"valore":"nero","label":"Nero","is_default":true},
      {"valore":"bianco","label":"Bianco"},
      {"valore":"grigio","label":"Grigio"}
    ]}
  ]'::jsonb, 10 FROM cat
ON CONFLICT DO NOTHING;

-- ═══ Tariffe template serramentista ═══
INSERT INTO public.vertical_tariffa_templates
  (vertical, nome, tipo, unita_fatturazione, descrizione, is_default, sort_order) VALUES
  ('serramentista','Posa serramento standard','posa','pz','Posa in opera serramenti fino a 2mq',true,10),
  ('serramentista','Posa serramento grande','posa','pz','Posa serramenti oltre i 2mq',false,20),
  ('serramentista','Posa persiana','posa','pz','Posa persiane e scuri',false,30),
  ('serramentista','Posa zanzariera','posa','pz','Posa zanzariera a rullo/plissé',false,40),
  ('serramentista','Smontaggio serramento esistente','smaltimento','pz','Smontaggio e rimozione infisso esistente',false,50),
  ('serramentista','Smaltimento infisso vecchio','smaltimento','pz','Smaltimento in discarica',false,60),
  ('serramentista','Trasporto materiali','trasporto','a_corpo','Trasporto forfettario in cantiere',false,70),
  ('serramentista','Sovrapprezzo km aggiuntivi','trasporto','km','Costo per km oltre franchigia',false,80),
  ('serramentista','Tiro al piano','tiro_piano','piano','Sollevamento per piani superiori',false,90),
  ('serramentista','Ponteggio','nolo','a_corpo','Ponteggio a giornata',false,100),
  ('serramentista','Sigillatura silicone','sigillatura','ml','Sigillatura perimetrale',false,110),
  ('serramentista','Manodopera posatore (gg)','manodopera','gg','Manodopera posatore giornaliera',false,120),
  ('serramentista','Manodopera posatore (h)','manodopera','h','Manodopera posatore oraria',false,130),
  ('serramentista','Contorno / coprifilo','contorno','ml','Coprifilo interno perimetrale',false,140),
  ('serramentista','Falso telaio','falso_telaio','pz','Falso telaio metallico',false,150),
  ('serramentista','Sopralluogo tecnico','sopralluogo','a_corpo','Sopralluogo cantiere',false,160)
ON CONFLICT DO NOTHING;
