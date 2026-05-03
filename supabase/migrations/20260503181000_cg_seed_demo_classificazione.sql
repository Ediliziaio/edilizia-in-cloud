-- MP-CG audit — Seed classificazione voci per Demo Azienda
-- Replica il contenuto della edge function cg-bootstrap-classificazione
-- direttamente in SQL per non dipendere da una chiamata esterna.
--
-- 45 voci preset per imprese edili italiane.

INSERT INTO public.cg_classificazione_voci (
  company_id, voce_chiave, voce_descrizione, macro_voce, tipo,
  source_table, source_field, source_value, ordering, is_active
)
VALUES
  -- Costo personale
  ('778a2c76-1253-49f2-a5e8-283363ac3e29','salari_stipendi',     'Salari e stipendi (banca)',  'costo_personale',     'F','bank_transactions','category','Stipendi',        100,true),
  ('778a2c76-1253-49f2-a5e8-283363ac3e29','salari_stipendi_cc',  'Salari e stipendi (costi)',  'costo_personale',     'F','company_costs',    'category','stipendi',        101,true),
  ('778a2c76-1253-49f2-a5e8-283363ac3e29','inps',                'Contributi INPS',             'costo_personale',     'F','company_costs',    'category','INPS',            110,true),
  ('778a2c76-1253-49f2-a5e8-283363ac3e29','inail',               'Contributi INAIL',            'costo_personale',     'F','company_costs',    'category','INAIL',           111,true),
  ('778a2c76-1253-49f2-a5e8-283363ac3e29','tfr',                 'Accantonamento TFR',          'costo_personale',     'F','company_costs',    'category','TFR',             120,true),
  ('778a2c76-1253-49f2-a5e8-283363ac3e29','trasferte_personale', 'Trasferte personale',         'costo_personale',     'F','company_costs',    'category','trasferte',       130,true),
  -- Acquisti
  ('778a2c76-1253-49f2-a5e8-283363ac3e29','materie_prime',       'Materie prime / merci',       'acquisti_materie',    'V','company_costs',    'category','merci',           200,true),
  ('778a2c76-1253-49f2-a5e8-283363ac3e29','materie_prime_bt',    'Materie prime (banca)',       'acquisti_materie',    'V','bank_transactions','category','Fornitori',       201,true),
  -- Costi produttivi
  ('778a2c76-1253-49f2-a5e8-283363ac3e29','subappalti',          'Subappalti / lavorazioni',    'costi_produttivi',    'V','company_costs',    'category','subappalti',      300,true),
  ('778a2c76-1253-49f2-a5e8-283363ac3e29','carburanti_furg',     'Carburanti automezzi',        'costi_produttivi',    'V','bank_transactions','category','carburante',      310,true),
  ('778a2c76-1253-49f2-a5e8-283363ac3e29','carburanti_cc',       'Carburanti (costi)',          'costi_produttivi',    'V','company_costs',    'category','carburante',      311,true),
  ('778a2c76-1253-49f2-a5e8-283363ac3e29','manutenzioni',        'Manutenzioni e riparazioni',  'costi_produttivi',    'V','company_costs',    'category','manutenzione',    320,true),
  ('778a2c76-1253-49f2-a5e8-283363ac3e29','noleggi_attrezzi',    'Noleggio attrezzature',       'costi_produttivi',    'V','company_costs',    'category','noleggi',         330,true),
  ('778a2c76-1253-49f2-a5e8-283363ac3e29','affitti',             'Affitti immobili',            'costi_produttivi',    'F','bank_transactions','category','affitti',         340,true),
  ('778a2c76-1253-49f2-a5e8-283363ac3e29','affitti_cc',          'Affitti (costi)',             'costi_produttivi',    'F','company_costs',    'category','affitti',         341,true),
  ('778a2c76-1253-49f2-a5e8-283363ac3e29','leasing',             'Leasing',                     'costi_produttivi',    'F','bank_transactions','category','leasing',         342,true),
  ('778a2c76-1253-49f2-a5e8-283363ac3e29','assicurazioni',       'Assicurazioni',               'costi_produttivi',    'F','bank_transactions','category','Assicurazioni',   350,true),
  ('778a2c76-1253-49f2-a5e8-283363ac3e29','utenze_acqua',        'Utenze (acqua/luce/gas)',     'costi_produttivi',    'V','bank_transactions','category','utenze',          360,true),
  ('778a2c76-1253-49f2-a5e8-283363ac3e29','utenze_telefonia',    'Telefonia / connettività',    'costi_produttivi',    'F','company_costs',    'category','telefonia',       361,true),
  ('778a2c76-1253-49f2-a5e8-283363ac3e29','smaltimento_rifiuti', 'Smaltimento rifiuti',         'costi_produttivi',    'V','company_costs',    'category','rifiuti',         370,true),
  -- Costi commerciali
  ('778a2c76-1253-49f2-a5e8-283363ac3e29','pubblicita',          'Pubblicità',                  'costi_commerciali',   'F','company_costs',    'category','pubblicita',      400,true),
  ('778a2c76-1253-49f2-a5e8-283363ac3e29','marketing_digital',   'Marketing digitale (Meta/Google)','costi_commerciali','F','company_costs', 'category','marketing',       401,true),
  ('778a2c76-1253-49f2-a5e8-283363ac3e29','provvigioni',         'Provvigioni venditori',       'costi_commerciali',   'V','company_costs',    'category','provvigioni',     410,true),
  ('778a2c76-1253-49f2-a5e8-283363ac3e29','fiere_congressi',     'Fiere e congressi',           'costi_commerciali',   'F','company_costs',    'category','fiere',           420,true),
  ('778a2c76-1253-49f2-a5e8-283363ac3e29','rappresentanza',      'Spese di rappresentanza',     'costi_commerciali',   'V','company_costs',    'category','rappresentanza',  430,true),
  -- Costi amministrativi
  ('778a2c76-1253-49f2-a5e8-283363ac3e29','consulenze_fiscali',  'Commercialista',              'costi_amministrativi','F','company_costs',    'category','commercialista',  500,true),
  ('778a2c76-1253-49f2-a5e8-283363ac3e29','consulenze_legali',   'Studio legale',               'costi_amministrativi','F','company_costs',    'category','legale',          510,true),
  ('778a2c76-1253-49f2-a5e8-283363ac3e29','consulenze_lavoro',   'Consulenza del lavoro',       'costi_amministrativi','F','company_costs',    'category','consulenza_lavoro',511,true),
  ('778a2c76-1253-49f2-a5e8-283363ac3e29','software_sw',         'Software / SaaS',             'costi_amministrativi','F','company_costs',    'category','software',        520,true),
  ('778a2c76-1253-49f2-a5e8-283363ac3e29','cancelleria',         'Cancelleria / ufficio',       'costi_amministrativi','F','company_costs',    'category','cancelleria',     530,true),
  ('778a2c76-1253-49f2-a5e8-283363ac3e29','formazione',          'Formazione personale',        'costi_amministrativi','F','company_costs',    'category','formazione',      540,true),
  -- Oneri finanziari
  ('778a2c76-1253-49f2-a5e8-283363ac3e29','spese_bancarie',      'Spese bancarie',              'oneri_finanziari',    'F','bank_transactions','category','Bancario',        600,true),
  ('778a2c76-1253-49f2-a5e8-283363ac3e29','interessi_passivi',   'Interessi passivi',           'oneri_finanziari',    'F','company_costs',    'category','interessi',       610,true),
  ('778a2c76-1253-49f2-a5e8-283363ac3e29','commissioni_pos',     'Commissioni POS / circuiti',  'oneri_finanziari',    'V','bank_transactions','category','commissioni',     620,true),
  -- Oneri tributari
  ('778a2c76-1253-49f2-a5e8-283363ac3e29','f24_iva',             'F24 IVA',                     'oneri_tributari',     'F','bank_transactions','category','Tasse',           700,true),
  ('778a2c76-1253-49f2-a5e8-283363ac3e29','f24_irpef',           'F24 IRPEF / IRES',            'oneri_tributari',     'F','company_costs',    'category','f24',             710,true),
  ('778a2c76-1253-49f2-a5e8-283363ac3e29','imu_tari',            'IMU / TARI',                  'oneri_tributari',     'F','company_costs',    'category','imu',             720,true),
  -- Ammortamenti
  ('778a2c76-1253-49f2-a5e8-283363ac3e29','amm_immobili',        'Ammortamento immobili',       'ammortamenti',        'F','manual',           NULL,      'amm_immobili',    800,true),
  ('778a2c76-1253-49f2-a5e8-283363ac3e29','amm_macchinari',      'Ammortamento macchinari',     'ammortamenti',        'F','manual',           NULL,      'amm_macchinari',  810,true),
  ('778a2c76-1253-49f2-a5e8-283363ac3e29','amm_automezzi',       'Ammortamento automezzi',      'ammortamenti',        'F','manual',           NULL,      'amm_automezzi',   820,true),
  ('778a2c76-1253-49f2-a5e8-283363ac3e29','amm_software',        'Ammortamento software',       'ammortamenti',        'F','manual',           NULL,      'amm_software',    830,true),
  -- Extra-gestionale
  ('778a2c76-1253-49f2-a5e8-283363ac3e29','sopravv_attive',      'Sopravvenienze attive',       'ricavi_extra',        'Z','prima_nota',       'category','sopravvenienze',  900,true),
  ('778a2c76-1253-49f2-a5e8-283363ac3e29','sopravv_passive',     'Sopravvenienze passive',      'costi_extra',         'Z','prima_nota',       'category','sopravvenienze_p',901,true),
  ('778a2c76-1253-49f2-a5e8-283363ac3e29','plusvalenze',         'Plusvalenze',                 'ricavi_extra',        'Z','prima_nota',       'category','plusvalenze',     910,true),
  ('778a2c76-1253-49f2-a5e8-283363ac3e29','minusvalenze',        'Minusvalenze',                'costi_extra',         'Z','prima_nota',       'category','minusvalenze',    911,true),
  ('778a2c76-1253-49f2-a5e8-283363ac3e29','donazioni',           'Donazioni',                   'costi_extra',         'Z','company_costs',    'category','donazioni',       920,true)
ON CONFLICT (company_id, voce_chiave, source_table, source_value) DO NOTHING;

REFRESH MATERIALIZED VIEW public.mv_cg_storico_24m;
