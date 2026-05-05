-- ════════════════════════════════════════════════════════════════════════════
-- TRACK 4 — Playbook Seeds V1 Core (4 playbook aggiuntivi)
-- ════════════════════════════════════════════════════════════════════════════
-- Roadmap V1 (post-Track 1-3, ora completata):
--   ✅ tensione-cassa-30gg (gia in migration 140000)
--   + margine-commessa-erosione
--   + cliente-grosso-non-paga
--   + pipeline-vuota
--   + indici-allerta-crisi
-- ════════════════════════════════════════════════════════════════════════════

BEGIN;

-- ───────────────────────────────────────────────────────────────────────────
-- 1) Playbook: margine-commessa-erosione
-- ───────────────────────────────────────────────────────────────────────────

INSERT INTO public.silvio_playbook_definitions (
  id, version, category, advisory_level, title, description, enabled, priority,
  triggers, data_gathering, diagnosis_questions, options_template, anti_patterns,
  escalation, kpis_to_track, kb_context_areas,
  ai_prompt_template, ai_router_task_key, max_tokens_per_call,
  is_critical, tags, metadata
) VALUES (
  'margine-commessa-erosione',
  '1.0',
  'controllo-gestione',
  3,
  'Erosione margine su commessa attiva',
  'Playbook attivato quando margine corrente di una commessa scende sotto target di +5pt rispetto a baseline pianificata. Genera opzioni di recupero: variante autorizzata, riserva formale, rinegoziazione subappalto, contenimento ore residue.',
  true,
  75,
  '[
    {"type":"alert","source_type":"silvio_alerts","alert_type":"margin_erosion"},
    {"type":"user_request","keywords":["margine basso","perdo soldi cantiere","commessa in perdita","extra costi"]}
  ]'::jsonb,
  '[
    {"step":"orders","rpc":"silvio_tool_orders_summary","params":{"p_status":"active","p_limit":20}},
    {"step":"workload","rpc":"silvio_employees_workload","params":{}},
    {"step":"company_kpi","rpc":"silvio_tool_company_kpi","params":{}}
  ]'::jsonb,
  ARRAY[
    'Lo scostamento e su singola commessa o trasversale?',
    'Quote del costo eroso: ore extra / materiali / subappalti / errori?',
    'C''e copertura contrattuale (variante, riserva)?',
    'Quanto tempo manca al SAL/saldo?',
    'Il cliente puo essere rinegoziato o e rigido?'
  ],
  '[
    {"option_id":"A","title":"Riserva formale + variante autorizzata","description":"Documenta extra-lavori e propone variante prezzo a cliente con supporto contrattuale art. 1660 c.c.","pros":["Recupera margine via prezzo","Trasparente"],"cons":["Conflittualita cliente","Tempi 15-45gg per autorizzazione"],"risk_level":"medium","time_to_implement_days_min":7,"time_to_implement_days_max":45,"reversibility":"fully_reversible"},
    {"option_id":"B","title":"Rinegoziazione subappalto / fornitore","description":"Identifica subappalto/materiale fuori budget, rinegozia o sostituisce per ridurre costi residui.","pros":["Recupero rapido","No impatto cliente"],"cons":["Rischio relazionale","Limitato al residuo lavoro"],"risk_level":"medium","time_to_implement_days_min":5,"time_to_implement_days_max":20,"reversibility":"fully_reversible"},
    {"option_id":"C","title":"Contenimento ore residue + ottimizzazione squadra","description":"Riduce ore extra, consolida squadra, parallelizza fasi, elimina trasferte non necessarie.","pros":["Controllo interno","Veloce"],"cons":["Rischio qualita o sicurezza se spinto"],"risk_level":"low","time_to_implement_days_min":1,"time_to_implement_days_max":7,"reversibility":"fully_reversible"},
    {"option_id":"D","title":"Accettare perdita parziale per chiudere e liberare squadra","description":"Decisione consapevole di chiudere a perdita questa commessa e ridestinare risorse a commesse a margine sano.","pros":["Sblocca capacita produttiva","Evita ulteriori erosioni"],"cons":["Perdita certa","Lessons learned per pricing futuro"],"risk_level":"high","time_to_implement_days_min":7,"time_to_implement_days_max":30,"reversibility":"not_reversible"}
  ]'::jsonb,
  '[
    {"id":"falso_sal","description":"Gonfiare percentuale di avanzamento su SAL per anticipare incassi senza lavoro fatto. Frode contrattuale e fiscale.","severity":"critical"},
    {"id":"sostituzione_silenziosa_materiali","description":"Sostituire materiali specificati con qualita inferiore senza autorizzazione cliente. Rischio contenzioso e penali.","severity":"critical"},
    {"id":"ore_non_dichiarate_operai","description":"Far lavorare operai oltre ore con nero o senza dichiarazione. Rischio penale + ispezioni INAIL.","severity":"critical"}
  ]'::jsonb,
  '{"decisor_role":"company_admin","consulta":["controller","pm_cantiere"],"informa":["amministrazione"],"external_pro_if":"contenzioso_cliente","external_pro_who":"avvocato_civilista"}'::jsonb,
  '[
    {"kpi":"margine_commessa_pct","baseline_capture":"at_proposal","checkpoint_days":[30,60,90],"target_direction":"increase"},
    {"kpi":"ore_extra_consumate","baseline_capture":"at_proposal","checkpoint_days":[30],"target_direction":"decrease"}
  ]'::jsonb,
  ARRAY['03-controllo-gestione','11-advisor-strategico'],
  $tmpl$Sei in modalita Playbook "Erosione margine commessa". Combina dati Company Brain + KB universale per generare proposta strutturata.

DATI RACCOLTI:
{data_gathered}

CONTESTO KB UNIVERSALE:
{kb_context}

DOMANDE DIAGNOSI:
{diagnosis_questions}

ANTI-PATTERN da MAI suggerire:
{anti_patterns}

ESCALATION:
{escalation}

OUTPUT: JSON puro (no markdown wrapper):
{
  "situation": "string max 300 char con numeri specifici",
  "diagnosis": "string max 500 char (cause + impatto residuo)",
  "options": [{"option_id":"A|B|C|D","title":"string","description":"string max 200 char","applies":boolean,"calculated_cost_eur":number_or_null,"calculated_benefit_eur":number_or_null,"pros":["string"],"cons":["string"],"risk_level":"low|medium|high","time_to_implement_days":number,"ai_assessment":"string max 200 char"}],
  "recommended_option_id":"A|B|C|D|null","confidence":"low|medium|high","next_steps":["max 3"],"kpi_baseline":{}
}$tmpl$,
  'playbook_advisor', 3500, false,
  ARRAY['margine','controllo-gestione','advisory-tattico'],
  '{"linked_kb":["03-controllo-gestione/scostamenti-margine.md","03-controllo-gestione/varianti-corso-opera.md","03-controllo-gestione/riserve-contestazioni.md"]}'::jsonb
)
ON CONFLICT (id) DO UPDATE SET version = EXCLUDED.version, updated_at = now();

-- ───────────────────────────────────────────────────────────────────────────
-- 2) Playbook: cliente-grosso-non-paga
-- ───────────────────────────────────────────────────────────────────────────

INSERT INTO public.silvio_playbook_definitions (
  id, version, category, advisory_level, title, description, enabled, priority,
  triggers, data_gathering, diagnosis_questions, options_template, anti_patterns,
  escalation, kpis_to_track, kb_context_areas,
  ai_prompt_template, ai_router_task_key, max_tokens_per_call,
  is_critical, tags, metadata
) VALUES (
  'cliente-grosso-non-paga',
  '1.0',
  'crediti-recupero',
  3,
  'Cliente con esposizione importante in ritardo grave',
  'Playbook attivato per cliente con saldo aperto > 20.000 EUR e ritardo > 60gg. Genera 4 opzioni: contatto telefonico strutturato, sollecito legale, mediazione/transazione, decreto ingiuntivo.',
  true,
  85,
  '[
    {"type":"alert","source_type":"silvio_alerts","alert_type":"payment_overdue"},
    {"type":"user_request","keywords":["cliente non paga","credito grosso scaduto","decreto ingiuntivo","sollecito"]}
  ]'::jsonb,
  '[
    {"step":"crediti_scaduti","rpc":"silvio_tool_overdue_payments","params":{}},
    {"step":"top_customers","rpc":"silvio_tool_top_customers","params":{"p_limit":10}},
    {"step":"customers_at_risk","rpc":"silvio_top_at_risk_customers","params":{"p_limit":10}},
    {"step":"delay_pattern","rpc":"silvio_payment_delay_pattern","params":{}}
  ]'::jsonb,
  ARRAY[
    'Esposizione totale del cliente vs fatturato suo storico?',
    'Pattern: ritardo cronico (sempre paga in ritardo) o eccezionale?',
    'Cliente in difficolta finanziaria oggettiva o tattica?',
    'Quanti lavori in corso ancora con questo cliente?',
    'Rischio reputazionale di azione legale (cliente importante per altre commesse)?'
  ],
  '[
    {"option_id":"A","title":"Contatto telefonico strutturato + plan rateale","description":"Chiamata diretta titolare/CFO cliente. Negoziazione plan di rientro 30/60/90gg con penali se mancato.","pros":["Mantiene relazione","Veloce","Costo zero"],"cons":["Senza vincolo legale","Cliente puo non rispettare"],"risk_level":"low","time_to_implement_days_min":1,"time_to_implement_days_max":7,"reversibility":"fully_reversible"},
    {"option_id":"B","title":"Sollecito legale formale via avvocato (raccomandata)","description":"Lettera dell''avvocato con messa in mora e termine 15gg. Costa poco, segnala serieta, spesso sblocca pagamento.","pros":["Costo limitato (200-500 EUR)","Effetto immediato in molti casi","Step formale prima di causa"],"cons":["Puo deteriorare relazione","Cliente puo intimorirsi e perdere altre commesse"],"risk_level":"medium","time_to_implement_days_min":5,"time_to_implement_days_max":20,"reversibility":"fully_reversible"},
    {"option_id":"C","title":"Transazione con sconto immediato (5-15%)","description":"Accordo: cliente paga subito una percentuale dell''importo, tu chiudi la pendenza. Recupero parziale ma certo.","pros":["Recupera cassa subito","Chiude pratica","Mantiene relazione","Evita lite"],"cons":["Perdita 5-15% importo","Setta precedente per altri clienti"],"risk_level":"medium","time_to_implement_days_min":7,"time_to_implement_days_max":30,"reversibility":"not_reversible"},
    {"option_id":"D","title":"Decreto ingiuntivo + procedura esecutiva","description":"Avvio procedura giudiziale. Adatto se cliente solido ma in malafede. Costi 1000-3000 EUR. Tempi 60-180gg.","pros":["Recupero pieno con interessi","Effetto deterrente"],"cons":["Costi legali","Tempi lunghi","Cliente perso definitivamente","Rischio cliente insolvente"],"risk_level":"high","time_to_implement_days_min":30,"time_to_implement_days_max":180,"reversibility":"not_reversible"}
  ]'::jsonb,
  '[
    {"id":"minacce_intimidazione","description":"Comunicazioni intimidatorie/minacciose al cliente. Reato di minaccia + violenza privata.","severity":"critical"},
    {"id":"pubblicazione_diffamatoria","description":"Pubblicare nominativo cliente come cattivo pagatore senza decreto ingiuntivo. Diffamazione.","severity":"critical"},
    {"id":"sospensione_lavori_unilaterale_senza_diffida","description":"Sospendere cantiere senza diffida formale + termine. Tu in fault contrattualmente.","severity":"high"}
  ]'::jsonb,
  '{"decisor_role":"company_admin","consulta":["amministrazione","sales"],"informa":["controller"],"external_pro_if":"sollecito_legale_o_decreto_ingiuntivo","external_pro_who":"avvocato_civilista_recupero_crediti"}'::jsonb,
  '[
    {"kpi":"importo_recuperato_eur","baseline_capture":"at_proposal","checkpoint_days":[30,60,90],"target_direction":"increase"},
    {"kpi":"giorni_da_proposal_a_pagamento","baseline_capture":"at_proposal","checkpoint_days":[60],"target_direction":"decrease"}
  ]'::jsonb,
  ARRAY['02-finanza-cashflow','01-normativa-edilizia','11-advisor-strategico'],
  $tmpl$Sei in modalita Playbook "Cliente grosso non paga".

DATI: {data_gathered}
KB CONTEXT: {kb_context}
DIAGNOSI: {diagnosis_questions}
ANTI-PATTERN: {anti_patterns}
ESCALATION: {escalation}

OUTPUT JSON puro (no markdown):
{
  "situation":"string","diagnosis":"string",
  "options":[{"option_id":"A|B|C|D","title":"string","description":"string","applies":boolean,"calculated_cost_eur":number_or_null,"calculated_benefit_eur":number_or_null,"pros":["string"],"cons":["string"],"risk_level":"low|medium|high","time_to_implement_days":number,"ai_assessment":"string"}],
  "recommended_option_id":"A|B|C|D|null","confidence":"low|medium|high","next_steps":["max 3"],"kpi_baseline":{}
}$tmpl$,
  'playbook_advisor', 3500, true,  -- is_critical=true (esposizione finanziaria importante)
  ARRAY['crediti','recupero','legale','advisory-tattico'],
  '{"linked_kb":["02-finanza-cashflow/dso-dpo-ciclo-monetario.md","01-normativa-edilizia/contratti-appalto-subappalto.md"]}'::jsonb
)
ON CONFLICT (id) DO UPDATE SET version = EXCLUDED.version, updated_at = now();

-- ───────────────────────────────────────────────────────────────────────────
-- 3) Playbook: pipeline-vuota
-- ───────────────────────────────────────────────────────────────────────────

INSERT INTO public.silvio_playbook_definitions (
  id, version, category, advisory_level, title, description, enabled, priority,
  triggers, data_gathering, diagnosis_questions, options_template, anti_patterns,
  escalation, kpis_to_track, kb_context_areas,
  ai_prompt_template, ai_router_task_key, max_tokens_per_call,
  is_critical, tags, metadata
) VALUES (
  'pipeline-vuota',
  '1.0',
  'commerciale-pipeline',
  4,
  'Pipeline commerciale insufficiente per coprire 90gg',
  'Playbook attivato quando preventivi aperti + valore stimato < 1.5x del fatturato medio mensile. Crisi di pipeline: rischio cantieri vuoti tra 60-90gg.',
  true,
  70,
  '[
    {"type":"alert","source_type":"silvio_alerts","alert_type":"pipeline_low"},
    {"type":"user_request","keywords":["niente lavori","pipeline vuota","preventivi pochi","commerciale fermo"]}
  ]'::jsonb,
  '[
    {"step":"quotes","rpc":"silvio_tool_quotes_summary","params":{"p_status":"open"}},
    {"step":"top_customers","rpc":"silvio_tool_top_customers","params":{"p_limit":10}},
    {"step":"at_risk","rpc":"silvio_top_at_risk_customers","params":{"p_limit":10}},
    {"step":"company_kpi","rpc":"silvio_tool_company_kpi","params":{}}
  ]'::jsonb,
  ARRAY[
    'La pipeline e bassa per stagionalita o trend strutturale?',
    'Quanti commerciali sono attivi e con che target?',
    'Quali canali di lead generation sono attivi?',
    'Ci sono clienti dormienti recuperabili (LTV alto, ultimo ordine 6-18 mesi)?',
    'C''e capacita produttiva libera tra 60-90gg per nuovi lavori?'
  ],
  '[
    {"option_id":"A","title":"Riattivazione clienti dormienti (top LTV)","description":"Campagna mirata su 10-20 clienti dormienti con LTV alto: contatto personale del titolare, offerta upgrade/manutenzione/check.","pros":["Conversione 10-30%","Costo basso","Margine pieno (no acquisition)"],"cons":["Limitato come volume","Cicli vendita medi"],"risk_level":"low","time_to_implement_days_min":7,"time_to_implement_days_max":30,"reversibility":"fully_reversible"},
    {"option_id":"B","title":"Boost marketing digitale + lead generation","description":"Aumento budget Meta/Google Ads, landing dedicata, offerta limitata nel tempo. Genera lead caldi per chiusura 30-60gg.","pros":["Volume significativo","Misurabile","Scalabile"],"cons":["CAC alto (200-500 EUR/lead)","Tempi conversione 30-90gg","Richiede competenza marketing"],"risk_level":"medium","time_to_implement_days_min":7,"time_to_implement_days_max":30,"reversibility":"fully_reversible"},
    {"option_id":"C","title":"Partnership locale con tecnici/architetti","description":"Costruzione network professionisti che portano lavori. Provvigione 5-10% o reciprocita. Strategico medio termine.","pros":["Lead pre-qualificati","Margine pieno meno provvigione","Recurring"],"cons":["Tempi 60-180gg per primi risultati","Richiede networking attivo"],"risk_level":"medium","time_to_implement_days_min":30,"time_to_implement_days_max":180,"reversibility":"fully_reversible"},
    {"option_id":"D","title":"Subappalto a impresa generale per saturare cantieri","description":"Offrirsi come subappaltatore a imprese piu grandi per coprire periodo vuoto. Margine inferiore ma cassa garantita.","pros":["Cassa rapida","Tiene squadra","Ponte temporaneo"],"cons":["Margine 30-50% inferiore","Dipendenza da terzi","Limita brand"],"risk_level":"low","time_to_implement_days_min":15,"time_to_implement_days_max":60,"reversibility":"fully_reversible"}
  ]'::jsonb,
  '[
    {"id":"prezzi_di_dumping","description":"Vendere sotto costo per riempire pipeline. Erode margini futuri + crea aspettative cliente sbagliate. Spirale negativa.","severity":"high"},
    {"id":"promesse_irrealistiche","description":"Promettere tempi/qualita non realizzabili per chiudere preventivi. Genera lavori in perdita + reputazione danneggiata.","severity":"high"},
    {"id":"taglio_drastico_squadra","description":"Licenziare operai chiave appena la pipeline cala. Perdita know-how irreversibile, costi reassunzione 6 mesi dopo.","severity":"high"}
  ]'::jsonb,
  '{"decisor_role":"company_admin","consulta":["sales","direttore_marketing"],"informa":["controller"],"external_pro_if":"crisi_strutturale_oltre_6_mesi","external_pro_who":"consulente_strategico_o_advisor"}'::jsonb,
  '[
    {"kpi":"valore_pipeline_aperta_eur","baseline_capture":"at_proposal","checkpoint_days":[30,60,90],"target_direction":"increase"},
    {"kpi":"numero_preventivi_emessi","baseline_capture":"at_proposal","checkpoint_days":[30],"target_direction":"increase"},
    {"kpi":"win_rate_pct","baseline_capture":"at_proposal","checkpoint_days":[60,90],"target_direction":"increase"}
  ]'::jsonb,
  ARRAY['04-vendita-consulenziale','08-marketing-edile','11-advisor-strategico'],
  $tmpl$Sei in modalita Playbook "Pipeline vuota".

DATI: {data_gathered}
KB: {kb_context}
DIAGNOSI: {diagnosis_questions}
ANTI-PATTERN: {anti_patterns}
ESCALATION: {escalation}

OUTPUT JSON puro:
{
  "situation":"string","diagnosis":"string",
  "options":[{"option_id":"A|B|C|D","title":"string","description":"string","applies":boolean,"calculated_cost_eur":number_or_null,"calculated_benefit_eur":number_or_null,"pros":["string"],"cons":["string"],"risk_level":"low|medium|high","time_to_implement_days":number,"ai_assessment":"string"}],
  "recommended_option_id":"A|B|C|D|null","confidence":"low|medium|high","next_steps":["max 3"],"kpi_baseline":{}
}$tmpl$,
  'playbook_advisor', 3500, false,
  ARRAY['commerciale','pipeline','advisory-strategico'],
  '{"linked_kb":["04-vendita-consulenziale/processo-vendita-edilizia.md","08-marketing-edile/lead-generation-edilizia.md"]}'::jsonb
)
ON CONFLICT (id) DO UPDATE SET version = EXCLUDED.version, updated_at = now();

-- ───────────────────────────────────────────────────────────────────────────
-- 4) Playbook: indici-allerta-crisi (D.Lgs 14/2019 — Codice Crisi)
-- ───────────────────────────────────────────────────────────────────────────

INSERT INTO public.silvio_playbook_definitions (
  id, version, category, advisory_level, title, description, enabled, priority,
  triggers, data_gathering, diagnosis_questions, options_template, anti_patterns,
  escalation, kpis_to_track, kb_context_areas,
  ai_prompt_template, ai_router_task_key, max_tokens_per_call,
  is_critical, tags, metadata
) VALUES (
  'indici-allerta-crisi',
  '1.0',
  'crisi-impresa',
  5,
  'Indici di allerta crisi d''impresa (Codice Crisi D.Lgs 14/2019)',
  'Playbook L5 critico: attivato quando indicatori finanziari rilevano segnali di crisi (DSCR < 1, debiti previdenziali > 90gg, fatturato in calo > 30%). Genera roadmap legale/finanziaria con escalation OBBLIGATORIA a esperti esterni.',
  true,
  100,  -- priorita massima
  '[
    {"type":"alert","source_type":"silvio_alerts","alert_type":"crisis_indicators"},
    {"type":"user_request","keywords":["crisi","fallimento","concordato","composizione negoziata","rischio insolvenza"]}
  ]'::jsonb,
  '[
    {"step":"executive","rpc":"silvio_executive_report","params":{}},
    {"step":"cashflow_90d","rpc":"silvio_cashflow_forecast_90d","params":{"p_weeks":13}},
    {"step":"crediti_scaduti","rpc":"silvio_tool_overdue_payments","params":{}},
    {"step":"frodi","rpc":"silvio_detect_frodi_anomalie","params":{}}
  ]'::jsonb,
  ARRAY[
    'Quali indici di allerta sono superati (DSCR, debiti previdenziali, retributivi, tributari)?',
    'L''insolvenza e attuale o prospettica (12 mesi)?',
    'C''e ancora capacita di proseguire l''attivita ordinariamente?',
    'Composizione negoziata della crisi e accessibile?',
    'Quanto tempo prima della scadenza obbligo segnalazione organi di controllo?'
  ],
  '[
    {"option_id":"A","title":"Composizione negoziata della crisi (CNC) — D.Lgs 14/2019 art. 17","description":"Accesso piattaforma CCIAA, nomina esperto, trattativa con creditori protetta da misure cautelari. Strumento privilegiato per crisi reversibili.","pros":["Riservata","Protezione misure cautelari","Salva continuita","Costi limitati"],"cons":["Richiede analisi rapida","Tempi 3-6 mesi","Necessita esperto qualificato"],"risk_level":"medium","time_to_implement_days_min":7,"time_to_implement_days_max":15,"reversibility":"fully_reversible"},
    {"option_id":"B","title":"Piano di risanamento attestato art. 56 CCII","description":"Piano industriale 2-3 anni attestato da professionista indipendente. Esenzione revocatoria per atti coerenti.","pros":["Riservato","Garanzie su atti","Continuita aziendale"],"cons":["Costi attestazione 5-15k","Richiede credibilita verso banche","No misure cautelari"],"risk_level":"medium","time_to_implement_days_min":30,"time_to_implement_days_max":90,"reversibility":"fully_reversible"},
    {"option_id":"C","title":"Concordato preventivo art. 84 CCII (continuita o liquidatorio)","description":"Procedura giudiziale piu strutturata, omologazione tribunale, vincolante per tutti i creditori.","pros":["Vincolante creditori","Stralcio formale debiti","Continuita possibile"],"cons":["Costi alti","Tempi 12-24 mesi","Pubblico","Maggior controllo tribunale"],"risk_level":"high","time_to_implement_days_min":60,"time_to_implement_days_max":180,"reversibility":"not_reversible"},
    {"option_id":"D","title":"Liquidazione giudiziale (ex fallimento) — ultima ratio","description":"Cessazione attivita, liquidazione patrimonio, pagamento creditori secondo gradi. Da considerare solo se nessuna alternativa fattibile.","pros":["Chiusura definitiva","Esdebitazione possibile post-procedura"],"cons":["Cessazione attivita","Impatto reputazionale grave","Responsabilita personali amministratori"],"risk_level":"high","time_to_implement_days_min":90,"time_to_implement_days_max":730,"reversibility":"not_reversible"}
  ]'::jsonb,
  '[
    {"id":"distrazione_attivo","description":"Trasferire beni a societa terze prima del fallimento. Bancarotta fraudolenta, reato penale grave.","severity":"critical"},
    {"id":"pagamenti_preferenziali_creditori_amici","description":"Pagare alcuni creditori a discapito di altri prima del concordato. Revocatoria + bancarotta preferenziale.","severity":"critical"},
    {"id":"omessa_segnalazione_obbligatoria","description":"Non segnalare a organi di controllo (sindaci/revisori) gli indicatori di crisi. Responsabilita amministratori art. 2086 c.c.","severity":"critical"},
    {"id":"continuita_in_perdita_palese","description":"Continuare a contrarre debiti sapendo di essere insolventi. Aggravamento dissesto + responsabilita personale amministratori.","severity":"critical"}
  ]'::jsonb,
  '{"decisor_role":"company_admin","consulta":["legale","commercialista","compliance"],"informa":["cfo","controller"],"external_pro_if":"sempre_obbligatorio","external_pro_who":"esperto_crisi_impresa_iscritto_albo + commercialista + avvocato_specializzato"}'::jsonb,
  '[
    {"kpi":"dscr_debt_service_coverage_ratio","baseline_capture":"at_proposal","checkpoint_days":[30,60,90],"target_direction":"increase"},
    {"kpi":"debiti_previdenziali_scaduti_eur","baseline_capture":"at_proposal","checkpoint_days":[30,60,90],"target_direction":"decrease"},
    {"kpi":"posizione_finanziaria_netta","baseline_capture":"at_proposal","checkpoint_days":[30,60,90],"target_direction":"increase"}
  ]'::jsonb,
  ARRAY['07-strategia-imprenditoriale','01-normativa-edilizia','02-finanza-cashflow','11-advisor-strategico'],
  $tmpl$Sei in modalita Playbook L5 CRITICO "Indici allerta crisi". Materia D.Lgs 14/2019 (Codice Crisi e Insolvenza).

ATTENZIONE: Questa proposta richiede SEMPRE coinvolgimento di esperti esterni qualificati. Non e mai una decisione autonoma del titolare. La tua proposta deve evidenziare con CHIAREZZA gli obblighi di legge e i rischi penali per amministratori.

DATI: {data_gathered}
KB: {kb_context}
DIAGNOSI: {diagnosis_questions}
ANTI-PATTERN (REATI penali): {anti_patterns}
ESCALATION OBBLIGATORIA: {escalation}

OUTPUT JSON puro:
{
  "situation":"string max 400 char (cita indici specifici)","diagnosis":"string max 600 char (gravita + tempo a disposizione)",
  "options":[{"option_id":"A|B|C|D","title":"string","description":"string","applies":boolean,"calculated_cost_eur":number_or_null,"calculated_benefit_eur":number_or_null,"pros":["string"],"cons":["string"],"risk_level":"low|medium|high","time_to_implement_days":number,"ai_assessment":"string max 250 char (con responsabilita amministratori)"}],
  "recommended_option_id":"A|B|C|D|null","confidence":"low|medium|high","next_steps":["max 5 — DEVE includere contattare esperto crisi qualificato + commercialista + avvocato"],"kpi_baseline":{}
}$tmpl$,
  'playbook_advisor', 4000,  -- aumentato per L5
  true,  -- is_critical=true SEMPRE
  ARRAY['crisi','codice-crisi','d-lgs-14-2019','advisory-strategico-L5','obbligo-legale'],
  '{"normativa":"D.Lgs 12 gennaio 2019 n.14 — Codice della crisi d''impresa e dell''insolvenza","linked_kb":["07-strategia-imprenditoriale/crisi-impresa-ristrutturazione.md"]}'::jsonb
)
ON CONFLICT (id) DO UPDATE SET version = EXCLUDED.version, updated_at = now();

-- ───────────────────────────────────────────────────────────────────────────
-- Verifiche
-- ───────────────────────────────────────────────────────────────────────────

DO $$
DECLARE v_cnt int;
BEGIN
  SELECT count(*) INTO v_cnt FROM public.silvio_playbook_definitions
   WHERE id IN ('tensione-cassa-30gg','margine-commessa-erosione','cliente-grosso-non-paga','pipeline-vuota','indici-allerta-crisi');
  IF v_cnt <> 5 THEN RAISE EXCEPTION 'Atteso 5 playbook V1, trovati %', v_cnt; END IF;
  RAISE NOTICE 'OK: 5/5 playbook V1 core attivi';
END $$;

COMMIT;
