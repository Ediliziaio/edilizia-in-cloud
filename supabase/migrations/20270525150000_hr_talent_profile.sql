BEGIN;

CREATE OR REPLACE FUNCTION public.hr_talent_set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.hr_talent_company_allowed(p_company_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    auth.uid() IS NOT NULL
    AND (
      p_company_id = public.get_my_company_id()
      OR public.is_super_admin(auth.uid())
    );
$$;

CREATE TABLE IF NOT EXISTS public.hr_talent_questions (
  assessment_version TEXT NOT NULL DEFAULT 'v5',
  question_id INTEGER NOT NULL,
  question_text TEXT NOT NULL,
  trait_code TEXT NOT NULL CHECK (trait_code IN ('ORG','AUT','GP','ADS','DET','VEN','HRM','LDR','PRO','COM','ESP','RC','FIN','SUC','PRI','CTRL')),
  polarity TEXT NOT NULL CHECK (polarity IN ('+','-','S','C')),
  theme_block INTEGER NOT NULL CHECK (theme_block > 0),
  display_order INTEGER NOT NULL CHECK (display_order > 0),
  custom_answers JSONB,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (assessment_version, question_id),
  CONSTRAINT hr_talent_questions_text_not_blank CHECK (length(trim(question_text)) > 0)
);

CREATE TABLE IF NOT EXISTS public.hr_talent_candidates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  hr_profilo_id UUID REFERENCES public.hr_profili(id) ON DELETE SET NULL,
  nome TEXT NOT NULL,
  cognome TEXT NOT NULL,
  email TEXT,
  telefono TEXT,
  ruolo_richiesto TEXT NOT NULL DEFAULT 'Da definire',
  funzione TEXT,
  seniority TEXT,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','invited','in_progress','completed','archived')),
  assessment_version TEXT NOT NULL DEFAULT 'v5',
  token_hash TEXT,
  invite_sent_at TIMESTAMPTZ,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ,
  privacy_accepted_at TIMESTAMPTZ,
  source TEXT NOT NULL DEFAULT 'selezioni',
  notes TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT hr_talent_candidates_nome_not_blank CHECK (length(trim(nome)) > 0),
  CONSTRAINT hr_talent_candidates_cognome_not_blank CHECK (length(trim(cognome)) > 0)
);

CREATE TABLE IF NOT EXISTS public.hr_talent_answers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  candidate_id UUID NOT NULL REFERENCES public.hr_talent_candidates(id) ON DELETE CASCADE,
  assessment_version TEXT NOT NULL DEFAULT 'v5',
  question_id INTEGER NOT NULL,
  answer_value TEXT NOT NULL CHECK (answer_value IN ('A','B','C','D')),
  answered_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (candidate_id, assessment_version, question_id),
  FOREIGN KEY (assessment_version, question_id)
    REFERENCES public.hr_talent_questions(assessment_version, question_id)
    ON UPDATE CASCADE
    ON DELETE RESTRICT
);

CREATE TABLE IF NOT EXISTS public.hr_talent_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  candidate_id UUID NOT NULL REFERENCES public.hr_talent_candidates(id) ON DELETE CASCADE,
  assessment_version TEXT NOT NULL DEFAULT 'v5',
  reliability_index TEXT NOT NULL CHECK (reliability_index IN ('YES','CAUTION','NO','ZERO','FORCED')),
  control_unexpected_count INTEGER NOT NULL DEFAULT 0 CHECK (control_unexpected_count >= 0),
  profile_type TEXT NOT NULL,
  traits_v5 JSONB NOT NULL DEFAULT '{}'::jsonb,
  macro_areas JSONB NOT NULL DEFAULT '{}'::jsonb,
  role_requested TEXT,
  role_match JSONB NOT NULL DEFAULT '{}'::jsonb,
  all_roles JSONB NOT NULL DEFAULT '[]'::jsonb,
  syndromes_detected JSONB NOT NULL DEFAULT '[]'::jsonb,
  strengths TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  improvements TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  valleys TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  generated_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  generated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (candidate_id, assessment_version)
);

CREATE INDEX IF NOT EXISTS idx_hr_talent_candidates_company_status
  ON public.hr_talent_candidates(company_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_hr_talent_candidates_company_role
  ON public.hr_talent_candidates(company_id, ruolo_richiesto);
CREATE INDEX IF NOT EXISTS idx_hr_talent_candidates_token_hash
  ON public.hr_talent_candidates(token_hash)
  WHERE token_hash IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_hr_talent_answers_candidate
  ON public.hr_talent_answers(candidate_id, question_id);
CREATE INDEX IF NOT EXISTS idx_hr_talent_reports_company_generated
  ON public.hr_talent_reports(company_id, generated_at DESC);

ALTER TABLE public.hr_talent_questions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.hr_talent_candidates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.hr_talent_answers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.hr_talent_reports ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS hr_talent_questions_read_active ON public.hr_talent_questions;
CREATE POLICY hr_talent_questions_read_active ON public.hr_talent_questions
  FOR SELECT
  USING (active = true);

DROP POLICY IF EXISTS hr_talent_candidates_company ON public.hr_talent_candidates;
CREATE POLICY hr_talent_candidates_company ON public.hr_talent_candidates
  FOR ALL TO authenticated
  USING (public.hr_talent_company_allowed(company_id))
  WITH CHECK (public.hr_talent_company_allowed(company_id));

DROP POLICY IF EXISTS hr_talent_answers_company ON public.hr_talent_answers;
CREATE POLICY hr_talent_answers_company ON public.hr_talent_answers
  FOR ALL TO authenticated
  USING (public.hr_talent_company_allowed(company_id))
  WITH CHECK (public.hr_talent_company_allowed(company_id));

DROP POLICY IF EXISTS hr_talent_reports_company ON public.hr_talent_reports;
CREATE POLICY hr_talent_reports_company ON public.hr_talent_reports
  FOR ALL TO authenticated
  USING (public.hr_talent_company_allowed(company_id))
  WITH CHECK (public.hr_talent_company_allowed(company_id));

DROP TRIGGER IF EXISTS trg_hr_talent_questions_updated_at ON public.hr_talent_questions;
CREATE TRIGGER trg_hr_talent_questions_updated_at
  BEFORE UPDATE ON public.hr_talent_questions
  FOR EACH ROW EXECUTE FUNCTION public.hr_talent_set_updated_at();

DROP TRIGGER IF EXISTS trg_hr_talent_candidates_updated_at ON public.hr_talent_candidates;
CREATE TRIGGER trg_hr_talent_candidates_updated_at
  BEFORE UPDATE ON public.hr_talent_candidates
  FOR EACH ROW EXECUTE FUNCTION public.hr_talent_set_updated_at();

DROP TRIGGER IF EXISTS trg_hr_talent_reports_updated_at ON public.hr_talent_reports;
CREATE TRIGGER trg_hr_talent_reports_updated_at
  BEFORE UPDATE ON public.hr_talent_reports
  FOR EACH ROW EXECUTE FUNCTION public.hr_talent_set_updated_at();

INSERT INTO public.hr_talent_questions (
  assessment_version,
  question_id,
  question_text,
  trait_code,
  polarity,
  theme_block,
  display_order,
  custom_answers
)
VALUES
  ('v5', 1, 'Ti capita di sentirti incerto riguardo ai tuoi progetti per il futuro?', 'ORG', '-', 1, 1, NULL::jsonb),
  ('v5', 2, 'Quando leggi, ti sorprendi spesso a fantasticare invece di proseguire la lettura?', 'ADS', '-', 1, 2, NULL::jsonb),
  ('v5', 3, 'Ripensando al passato, vorresti aver affrontato alcune situazioni con maggiore determinazione?', 'GP', '-', 1, 3, NULL::jsonb),
  ('v5', 4, 'Prendi decisioni rapidamente e le rivedi se necessario?', 'ADS', '+', 1, 4, NULL::jsonb),
  ('v5', 5, 'Ritieni che impegnarsi nel lavoro sia un valore fondamentale?', 'AUT', '+', 1, 5, NULL::jsonb),
  ('v5', 6, 'Ti esprimi in modo chiaro e diretto con gli altri?', 'DET', '+', 1, 6, NULL::jsonb),
  ('v5', 7, 'Credi che una singola persona possa davvero influenzare la società?', 'PRI', '+', 1, 7, NULL::jsonb),
  ('v5', 8, 'Tendi ad essere analitico e a notare ciò che non funziona?', 'RC', '+', 1, 8, NULL::jsonb),
  ('v5', 9, 'Mantieni una certa distanza con le persone che non conosci bene?', 'ESP', '-', 1, 9, NULL::jsonb),
  ('v5', 10, 'Riesci facilmente a conversare con sconosciuti in situazioni informali?', 'ESP', '+', 1, 10, NULL::jsonb),
  ('v5', 11, 'Organizzi le tue attività pensando al giorno successivo?', 'ORG', '+', 1, 11, NULL::jsonb),
  ('v5', 12, 'Ti senti soddisfatto di ciò che hai realizzato finora nella vita?', 'SUC', '+', 1, 12, NULL::jsonb),
  ('v5', 13, 'Dormi bene e a sufficienza?', 'GP', '+', 1, 13, NULL::jsonb),
  ('v5', 14, 'Nel confronto con altri, ti capita di riconsiderare le tue posizioni?', 'COM', '+', 1, 14, NULL::jsonb),
  ('v5', 15, 'Pensi sia giusto dedicare molte energie al proprio lavoro?', 'AUT', '+', 1, 15, NULL::jsonb),
  ('v5', 16, 'Gli altri ti descrivono come una persona comunicativa e decisa?', 'DET', '+', 1, 16, NULL::jsonb),
  ('v5', 17, 'Credi di poter risolvere qualsiasi problema che ti si presenta?', 'PRO', '+', 1, 17, NULL::jsonb),
  ('v5', 18, 'L''ordine e la precisione sono molto importanti per te?', 'ADS', '+', 1, 18, NULL::jsonb),
  ('v5', 19, 'Diffidi delle prime impressioni e preferisci verificare prima di fidarti?', 'RC', '+', 1, 19, NULL::jsonb),
  ('v5', 20, 'Senti il bisogno di esprimere sempre la tua opinione?', 'LDR', '+', 1, 20, NULL::jsonb),
  ('v5', 21, 'Hai obiettivi chiari che guidano le tue azioni quotidiane?', 'ORG', '+', 1, 21, NULL::jsonb),
  ('v5', 22, 'Di fronte ai problemi, tendi a vederne soprattutto gli aspetti negativi?', 'PRO', '-', 1, 22, NULL::jsonb),
  ('v5', 23, 'Ti capita di perdere il controllo in situazioni stressanti?', 'GP', '-', 1, 23, NULL::jsonb),
  ('v5', 24, 'La lealtà è un valore fondamentale per te?', 'PRI', '+', 1, 24, NULL::jsonb),
  ('v5', 25, 'Saresti a tuo agio in un lavoro prevalentemente sedentario?', 'ADS', '+', 1, 25, NULL::jsonb),
  ('v5', 26, 'Quando difendi le tue idee, hai piena fiducia in te stesso?', 'AUT', '+', 2, 26, NULL::jsonb),
  ('v5', 27, 'Pensi che la situazione economica possa limitare la crescita personale?', 'PRI', '-', 2, 27, NULL::jsonb),
  ('v5', 28, 'Credi che le persone tendano a presentarsi in modo migliore di come sono?', 'RC', '+', 2, 28, NULL::jsonb),
  ('v5', 29, 'Esprimi apertamente ciò che pensi nella maggior parte delle situazioni?', 'DET', '+', 2, 29, NULL::jsonb),
  ('v5', 30, 'Condividi sempre il tuo punto di vista, anche quando non richiesto?', 'LDR', '+', 2, 30, NULL::jsonb),
  ('v5', 31, 'Le tue azioni quotidiane sono orientate anche al tuo futuro?', 'ORG', '+', 2, 31, NULL::jsonb),
  ('v5', 32, 'Tendi a ingigantire i problemi quando si presentano?', 'PRO', '-', 2, 32, NULL::jsonb),
  ('v5', 33, 'Soffri di tensione o nervosismo frequente?', 'GP', '-', 2, 33, NULL::jsonb),
  ('v5', 34, 'Cerchi sempre le cause di ciò che accade e difficilmente cambi idea?', 'RC', '+', 2, 34, NULL::jsonb),
  ('v5', 35, 'Ti capita di non rispettare le scadenze prefissate?', 'ADS', '-', 2, 35, NULL::jsonb),
  ('v5', 36, 'Quando dai un''indicazione, ti assicuri che venga seguita?', 'DET', '+', 2, 36, NULL::jsonb),
  ('v5', 37, 'Credi di poter trovare una soluzione a qualsiasi situazione?', 'PRO', '+', 2, 37, NULL::jsonb),
  ('v5', 38, 'Quando qualcuno sbaglia, glielo fai notare direttamente?', 'DET', '+', 2, 38, NULL::jsonb),
  ('v5', 39, 'Ti mostri agli altri per quello che sei veramente?', 'ESP', '+', 2, 39, NULL::jsonb),
  ('v5', 40, 'Hai bisogno di conoscere bene una persona prima di aprirti?', 'ESP', '-', 2, 40, NULL::jsonb),
  ('v5', 41, 'Hai una visione chiara di come vorresti il tuo futuro?', 'AUT', '+', 2, 41, NULL::jsonb),
  ('v5', 42, 'Di fronte a un problema, individui sempre più soluzioni possibili?', 'PRO', '+', 2, 42, NULL::jsonb),
  ('v5', 43, 'Ti senti spesso in tensione anche senza una ragione specifica?', 'GP', '-', 2, 43, NULL::jsonb),
  ('v5', 44, 'Hai chiaro come vorresti essere ricordato dalle persone care?', 'AUT', '+', 2, 44, NULL::jsonb),
  ('v5', 45, 'Mangi rapidamente, senza dedicare molto tempo ai pasti?', 'GP', '-', 2, 45, NULL::jsonb),
  ('v5', 46, 'Ti capita di sentirti superiore agli altri?', 'LDR', '-', 2, 46, NULL::jsonb),
  ('v5', 47, 'Le critiche dirette ti feriscono più del normale?', 'PRO', '-', 2, 47, NULL::jsonb),
  ('v5', 48, 'Sei generalmente paziente e comprensivo con gli altri?', 'COM', '+', 2, 48, NULL::jsonb),
  ('v5', 49, 'Tendi a tenere per te i tuoi pensieri e sentimenti?', 'ESP', '-', 2, 49, NULL::jsonb),
  ('v5', 50, 'Ci sono segreti tuoi o di altri che non hai mai condiviso?', 'COM', '-', 2, 50, NULL::jsonb),
  ('v5', 51, 'Hai cambiato lavoro più di due volte negli ultimi due anni?', 'SUC', '-', 3, 51, NULL::jsonb),
  ('v5', 52, 'Ti capita spesso di sentirti felice anche senza un motivo preciso?', 'AUT', '+', 3, 52, NULL::jsonb),
  ('v5', 53, 'Lo stress fa parte costante della tua vita quotidiana?', 'GP', '-', 3, 53, NULL::jsonb),
  ('v5', 54, 'Credi che pianificare troppo tolga spontaneità alla vita?', 'ADS', '-', 3, 54, NULL::jsonb),
  ('v5', 55, 'Sei tanto attivo da svolgere i tuoi compiti rapidamente?', 'ADS', '+', 3, 55, NULL::jsonb),
  ('v5', 56, 'Ti capita di scontrarti con gli altri per far valere le tue idee?', 'DET', '+', 3, 56, NULL::jsonb),
  ('v5', 57, 'È molto importante per te portare a termine ogni impegno assunto?', 'ADS', '+', 3, 57, NULL::jsonb),
  ('v5', 58, 'Provi risentimento anche dopo tempo verso chi ti ha trattato male?', 'PRO', '-', 3, 58, NULL::jsonb),
  ('v5', 59, 'Tendi a sorridere spontaneamente anche in situazioni formali?', 'VEN', '+', 3, 59, NULL::jsonb),
  ('v5', 60, 'Ti piacciono le persone con un forte senso pratico?', 'RC', '+', 3, 60, NULL::jsonb),
  ('v5', 61, 'Hai sempre una lista di cose da fare aggiornata?', 'ORG', '+', 3, 61, NULL::jsonb),
  ('v5', 62, 'Se uno dei tuoi cari è in difficoltà, ti lasci coinvolgere emotivamente?', 'COM', '+', 3, 62, NULL::jsonb),
  ('v5', 63, 'Ti senti spesso sotto pressione per colpa di altri?', 'GP', '-', 3, 63, NULL::jsonb),
  ('v5', 64, 'Analizzi in modo critico ogni notizia o informazione che ricevi?', 'RC', '+', 3, 64, NULL::jsonb),
  ('v5', 65, 'Riesci a portare avanti più attività contemporaneamente?', 'ORG', '+', 3, 65, NULL::jsonb),
  ('v5', 66, 'Ti piace organizzare attività sociali per i tuoi amici o colleghi?', 'ESP', '+', 3, 66, NULL::jsonb),
  ('v5', 67, 'Ti capita spesso di fare cose che non avresti voluto fare?', 'DET', '-', 3, 67, NULL::jsonb),
  ('v5', 68, 'Ti senti a tuo agio nel parlare davanti a un gruppo di persone?', 'VEN', '+', 3, 68, NULL::jsonb),
  ('v5', 69, 'Sei abituato a misurare le tue prestazioni con numeri e obiettivi?', 'ADS', '+', 3, 69, NULL::jsonb),
  ('v5', 70, 'Credi che seguire dei metodi collaudati sia la strada migliore?', 'RC', '+', 3, 70, NULL::jsonb),
  ('v5', 71, 'Nella tua vita hai dovuto affrontare situazioni finanziarie molto difficili?', 'FIN', '-', 3, 71, NULL::jsonb),
  ('v5', 72, 'A che età hai iniziato a guadagnare denaro?', 'SUC', 'S', 3, 72, '{"a":"Prima dei 21 anni","b":"Tra i 21 e i 23 anni","c":"Dopo i 23 anni"}'::jsonb),
  ('v5', 73, 'Che percentuale del tuo reddito annuo riesci a mettere da parte?', 'FIN', 'S', 3, 73, '{"a":"Meno del 5%","b":"Tra il 5% e il 15%","c":"Più del 15%"}'::jsonb),
  ('v5', 74, 'Le persone spesso si accendono e si entusiasmano per le tue parole?', 'VEN', '+', 3, 74, NULL::jsonb),
  ('v5', 75, 'A volte hai la sensazione di essere osservato o che si stia parlando di te?', 'GP', '-', 3, 75, NULL::jsonb),
  ('v5', 76, 'Ti ritieni una persona creativa?', 'AUT', '+', 4, 76, NULL::jsonb),
  ('v5', 77, 'Ti capita spesso di dover interagire con persone esterne al tuo team di lavoro?', 'VEN', '+', 4, 77, NULL::jsonb),
  ('v5', 78, 'Tecnicamente parlando ti consideri parte del 20% più esperto del tuo settore?', 'SUC', '+', 4, 78, NULL::jsonb),
  ('v5', 79, 'Stai costruendo una riserva finanziaria per il tuo futuro?', 'FIN', '+', 4, 79, NULL::jsonb),
  ('v5', 80, 'Hai aderito a un piano di accumulo per il futuro (PAC, Fondo Pensione, ecc.)?', 'FIN', '+', 4, 80, NULL::jsonb),
  ('v5', 81, 'Hai qualche persona nel tuo ambiente che ti causa preoccupazioni?', 'GP', '-', 4, 81, NULL::jsonb),
  ('v5', 82, 'Le persone guardano spesso a te prima di prendere le decisioni?', 'LDR', '+', 4, 82, NULL::jsonb),
  ('v5', 83, 'Hai già incontrato la "grande opportunità" della tua vita?', 'SUC', '+', 4, 83, NULL::jsonb),
  ('v5', 84, 'In una cena con sconosciuti sei il primo che va a presentarsi?', 'ESP', '+', 4, 84, NULL::jsonb),
  ('v5', 85, 'A volte ti senti l''unico che si assume la responsabilità?', 'HRM', '+', 4, 85, NULL::jsonb),
  ('v5', 86, 'Lavori abitualmente con un ritmo rapido e costante?', 'ADS', '+', 4, 86, NULL::jsonb),
  ('v5', 87, 'Ti capita di pensare che ormai sia troppo tardi per migliorare?', 'AUT', '-', 4, 87, NULL::jsonb),
  ('v5', 88, 'Credi che gli accordi possano cambiare se cambiano le situazioni?', 'COM', '+', 4, 88, NULL::jsonb),
  ('v5', 89, 'È importante far rispettare la propria privacy?', 'ESP', '-', 4, 89, NULL::jsonb),
  ('v5', 90, 'Riesci a stare anche per ore senza parlare con nessuno?', 'ESP', '-', 4, 90, NULL::jsonb),
  ('v5', 91, 'Sapresti dire con certezza cosa farai fra tre anni?', 'ORG', '+', 4, 91, NULL::jsonb),
  ('v5', 92, 'Hai avuto molte vittorie e successi nel tuo passato?', 'SUC', '+', 4, 92, NULL::jsonb),
  ('v5', 93, 'Pensi spesso a un problema che non riesci a risolvere?', 'GP', '-', 4, 93, NULL::jsonb),
  ('v5', 94, 'Cambi spesso idea tornando su decisioni già prese?', 'ADS', '-', 4, 94, NULL::jsonb),
  ('v5', 95, 'Quando possibile, pratichi sport con piacere?', 'AUT', '+', 4, 95, NULL::jsonb),
  ('v5', 96, 'Senti di essere nato per guidare e vuoi sempre dire la tua?', 'LDR', '+', 4, 96, NULL::jsonb),
  ('v5', 97, 'Non tutte le colpe di ciò che ti è successo sono tue?', 'PRO', '-', 4, 97, NULL::jsonb),
  ('v5', 98, 'Sai accettare serenamente una sconfitta?', 'PRO', '+', 4, 98, NULL::jsonb),
  ('v5', 99, 'Sei considerato una persona fredda e distaccata?', 'COM', '-', 4, 99, NULL::jsonb),
  ('v5', 100, 'Sei sempre il primo a esprimere la tua opinione?', 'LDR', '+', 4, 100, NULL::jsonb),
  ('v5', 101, 'Ti convincono le collaborazioni a lungo termine?', 'PRI', '+', 5, 101, NULL::jsonb),
  ('v5', 102, 'Hai avuto grandi successi nel tuo passato professionale?', 'SUC', '+', 5, 102, NULL::jsonb),
  ('v5', 103, 'Hai spesso un problema ricorrente che ti torna in mente?', 'GP', '-', 5, 103, NULL::jsonb),
  ('v5', 104, 'Credi che le eccezioni siano difficili da spiegare?', 'RC', '+', 5, 104, NULL::jsonb),
  ('v5', 105, 'Ti piace completare i lavori meglio di chiunque altro?', 'ADS', '+', 5, 105, NULL::jsonb),
  ('v5', 106, 'Pensi che alla fine debba esserci sempre uno che decide?', 'LDR', '+', 5, 106, NULL::jsonb),
  ('v5', 107, 'Credi che gli astri possano influenzare il nostro destino?', 'PRI', '-', 5, 107, NULL::jsonb),
  ('v5', 108, 'In una disputa, individui sempre chiaramente gli errori altrui?', 'DET', '+', 5, 108, NULL::jsonb),
  ('v5', 109, 'Cerchi di chiamare per nome anche persone appena conosciute?', 'ESP', '+', 5, 109, NULL::jsonb),
  ('v5', 110, 'Ti capita di interrompere chi sta parlando con te?', 'VEN', '+', 5, 110, NULL::jsonb),
  ('v5', 111, 'Hai regole fisse e precise per il tuo modo di vivere?', 'RC', '+', 5, 111, NULL::jsonb),
  ('v5', 112, 'Pensi che il tuo futuro sarà sempre più difficile?', 'AUT', '-', 5, 112, NULL::jsonb),
  ('v5', 113, 'Sei molto spesso in uno stato di tensione?', 'GP', '-', 5, 113, NULL::jsonb),
  ('v5', 114, 'Ti capita spesso di improvvisare nella vita quotidiana?', 'ORG', '-', 5, 114, NULL::jsonb),
  ('v5', 115, 'Ti considerano una persona pigra?', 'ADS', '-', 5, 115, NULL::jsonb),
  ('v5', 116, 'Ti trovi a tuo agio in mezzo a molte persone?', 'ESP', '+', 5, 116, NULL::jsonb),
  ('v5', 117, 'Gli altri non fanno sempre il possibile, per questo hai più problemi?', 'PRO', '-', 5, 117, NULL::jsonb),
  ('v5', 118, 'Parli prima con i colleghi che con il capo quando c''è un problema?', 'DET', '-', 5, 118, NULL::jsonb),
  ('v5', 119, 'Stai molto bene anche quando sei da solo?', 'COM', '+', 5, 119, NULL::jsonb),
  ('v5', 120, 'Dici sempre quello che pensi apertamente?', 'DET', '+', 5, 120, NULL::jsonb),
  ('v5', 121, 'Sai riorganizzare le idee anche in momenti di grande confusione?', 'ORG', '+', 5, 121, NULL::jsonb),
  ('v5', 122, 'È difficile per te mantenerti sempre emotivamente positivo?', 'AUT', '-', 5, 122, NULL::jsonb),
  ('v5', 123, 'Ti aspetti sempre qualcosa di imprevisto che potevi prevenire?', 'GP', '-', 5, 123, NULL::jsonb),
  ('v5', 124, 'Credi che ogni situazione abbia cause ben precise?', 'RC', '+', 5, 124, NULL::jsonb),
  ('v5', 125, 'Nel tempo libero preferisci oziare piuttosto che fare attività fisica?', 'ADS', '-', 5, 125, NULL::jsonb),
  ('v5', 126, 'Parli spesso con orgoglio dei tuoi successi?', 'VEN', '+', 6, 126, NULL::jsonb),
  ('v5', 127, 'Credi che le persone abbiano idee impossibili da modificare?', 'COM', '-', 6, 127, NULL::jsonb),
  ('v5', 128, 'Quando uno sbaglia bisogna farglielo notare per evitare ripetizioni?', 'DET', '+', 6, 128, NULL::jsonb),
  ('v5', 129, 'Fai molti complimenti agli altri ogni volta che puoi?', 'COM', '+', 6, 129, NULL::jsonb),
  ('v5', 130, 'Rispondi spesso senza aver ascoltato bene l''ultima frase?', 'COM', '-', 6, 130, NULL::jsonb),
  ('v5', 131, 'Dai un apporto stabilizzante all''ambiente che frequenti?', 'HRM', '+', 6, 131, NULL::jsonb),
  ('v5', 132, 'Ti senti generalmente insoddisfatto della tua situazione?', 'AUT', '-', 6, 132, NULL::jsonb),
  ('v5', 133, 'Pensi spesso che dovresti avere meno responsabilità?', 'HRM', '-', 6, 133, NULL::jsonb),
  ('v5', 134, 'Sei così certo delle tue idee da non metterle mai in discussione?', 'RC', '+', 6, 134, NULL::jsonb),
  ('v5', 135, 'Segui un problema fino alla sua completa risoluzione?', 'ADS', '+', 6, 135, NULL::jsonb),
  ('v5', 136, 'Parli con un tono di voce tendenzialmente alto?', 'VEN', '+', 6, 136, NULL::jsonb),
  ('v5', 137, 'Credi che ogni persona abbia un destino già scritto?', 'PRI', '-', 6, 137, NULL::jsonb),
  ('v5', 138, 'Quando insegni, sei molto attento a far notare gli errori?', 'HRM', '+', 6, 138, NULL::jsonb),
  ('v5', 139, 'Prima di parlare, cerchi di capire cosa si aspetta l''altro?', 'COM', '+', 6, 139, NULL::jsonb),
  ('v5', 140, 'Staresti volentieri in un lavoro che richiede silenzio assoluto?', 'ESP', '-', 6, 140, NULL::jsonb),
  ('v5', 141, 'Hai le idee chiare su come organizzare un progetto?', 'ORG', '+', 6, 141, NULL::jsonb),
  ('v5', 142, 'Sogni molto anche ad occhi aperti durante la giornata?', 'AUT', '-', 6, 142, NULL::jsonb),
  ('v5', 143, 'Ti capita di tollerare e poi arrabbiarti per non essere stato deciso?', 'DET', '-', 6, 143, NULL::jsonb),
  ('v5', 144, 'Credi di conoscerti perfettamente?', 'RC', '+', 6, 144, NULL::jsonb),
  ('v5', 145, 'Sei spesso preso da molte attività contemporaneamente?', 'ORG', '+', 6, 145, NULL::jsonb),
  ('v5', 146, 'Credi che i problemi vadano affrontati direttamente, di petto?', 'DET', '+', 6, 146, NULL::jsonb),
  ('v5', 147, 'Può un capo influenzare davvero tutti i suoi collaboratori?', 'LDR', '+', 6, 147, NULL::jsonb),
  ('v5', 148, 'Ripensi ancora con fastidio a torti subiti in passato?', 'PRO', '-', 6, 148, NULL::jsonb),
  ('v5', 149, 'Metti sempre in secondo piano i tuoi interessi per gli altri?', 'COM', '+', 6, 149, NULL::jsonb),
  ('v5', 150, 'Hai un repertorio di storie e aneddoti per intrattenere gli altri?', 'VEN', '+', 6, 150, NULL::jsonb),
  ('v5', 151, 'Ti capita spesso di immaginare come vorresti il tuo futuro?', 'AUT', '+', 7, 151, NULL::jsonb),
  ('v5', 152, 'Ti trovi spesso a sorridere anche senza un motivo preciso?', 'AUT', '+', 7, 152, NULL::jsonb),
  ('v5', 153, 'Hai un problema che ti ronza in testa già da un po'' di tempo?', 'GP', '-', 7, 153, NULL::jsonb),
  ('v5', 154, 'Ti capita di essere sempre coinvolto emotivamente nelle situazioni?', 'PRO', '-', 7, 154, NULL::jsonb),
  ('v5', 155, 'Abbandoni un incarico se non riesci a portarlo a termine?', 'ADS', '-', 7, 155, NULL::jsonb),
  ('v5', 156, 'Quando comunichi le tue idee, metti pressione su chi hai davanti?', 'VEN', '+', 7, 156, NULL::jsonb),
  ('v5', 157, 'Ti capitano spesso guai o inconvenienti per colpa di altri?', 'PRO', '-', 7, 157, NULL::jsonb),
  ('v5', 158, 'Quando noti un errore, lo correggi subito anche se non è compito tuo?', 'HRM', '+', 7, 158, NULL::jsonb),
  ('v5', 159, 'Sei molto interessato ai bisogni e alle esigenze degli altri?', 'COM', '+', 7, 159, NULL::jsonb),
  ('v5', 160, 'Tieni banco durante cene, feste e riunioni in generale?', 'VEN', '+', 7, 160, NULL::jsonb),
  ('v5', 161, 'Hai le idee chiare su come comportarsi in ogni occasione?', 'RC', '+', 7, 161, NULL::jsonb),
  ('v5', 162, 'Sei un vulcano di idee nuove continuamente?', 'AUT', '+', 7, 162, NULL::jsonb),
  ('v5', 163, 'Ti stanchi facilmente quando devi restare concentrato a lungo?', 'ADS', '-', 7, 163, NULL::jsonb),
  ('v5', 164, 'Analizzi sempre con grande attenzione ogni situazione?', 'RC', '+', 7, 164, NULL::jsonb),
  ('v5', 165, 'È opportuno dare sempre il meglio di sé in ogni circostanza?', 'PRI', '+', 7, 165, NULL::jsonb),
  ('v5', 166, 'Se ostacolato nei progetti, puoi arrivare ad esplodere?', 'PRO', '-', 7, 166, NULL::jsonb),
  ('v5', 167, 'Sei suscettibile e sensibile alle critiche dirette?', 'PRO', '-', 7, 167, NULL::jsonb),
  ('v5', 168, 'Ti capita di parlare di disaccordi anche giorni dopo con amarezza?', 'PRO', '-', 7, 168, NULL::jsonb),
  ('v5', 169, 'Ti piacciono molto i bambini e stare con loro?', 'COM', '+', 7, 169, NULL::jsonb),
  ('v5', 170, 'Preferisci che l''altro si accorga da solo dell''errore piuttosto che dirglielo?', 'DET', '-', 7, 170, NULL::jsonb),
  ('v5', 171, 'Porti a termine i progetti anche per dimostrare quanto vali?', 'ADS', '+', 7, 171, NULL::jsonb),
  ('v5', 172, 'A volte ti mancano gli stimoli per essere davvero motivato?', 'AUT', '-', 7, 172, NULL::jsonb),
  ('v5', 173, 'Affronti il futuro con un certo grado di ansia?', 'GP', '-', 7, 173, NULL::jsonb),
  ('v5', 174, 'Nella vita incontri molte eccezioni alle regole?', 'RC', '-', 7, 174, NULL::jsonb),
  ('v5', 175, 'Nel lavoro è importante essere veloci nell''esecuzione?', 'ADS', '+', 7, 175, NULL::jsonb),
  ('v5', 176, 'Sei una persona diplomatica nelle relazioni?', 'COM', '+', 8, 176, NULL::jsonb),
  ('v5', 177, 'Per quanto tu faccia, gli altri sembrano non prendersi responsabilità?', 'HRM', '-', 8, 177, NULL::jsonb),
  ('v5', 178, 'Preferisci chiarire le aspettative piuttosto che criticare gli errori?', 'HRM', '+', 8, 178, NULL::jsonb),
  ('v5', 179, 'Comunichi enfatizzando toni e gestualità per essere più efficace?', 'VEN', '+', 8, 179, NULL::jsonb),
  ('v5', 180, 'Senti sempre il bisogno di dire la tua in ogni discussione?', 'LDR', '+', 8, 180, NULL::jsonb),
  ('v5', 181, 'Aspiri a raggiungere un tenore di vita molto elevato?', 'AUT', '+', 8, 181, NULL::jsonb),
  ('v5', 182, 'È inutile illudersi: bisogna essere molto concreti nella vita?', 'RC', '+', 8, 182, NULL::jsonb),
  ('v5', 183, 'Sei sempre all''erta perché senti che i problemi sono in agguato?', 'GP', '-', 8, 183, NULL::jsonb),
  ('v5', 184, 'Ti consideri una persona molto flessibile e adattabile?', 'COM', '+', 8, 184, NULL::jsonb),
  ('v5', 185, 'Ami i lavori che ti permettono di muoverti fisicamente?', 'ADS', '+', 8, 185, NULL::jsonb),
  ('v5', 186, 'Ti piace primeggiare e distinguerti dagli altri?', 'AUT', '+', 8, 186, NULL::jsonb),
  ('v5', 187, 'Richiami collaboratori o familiari facendo presente i loro errori?', 'DET', '+', 8, 187, NULL::jsonb),
  ('v5', 188, 'Difficilmente spendi per cose che non siano strettamente necessarie?', 'FIN', '+', 8, 188, NULL::jsonb),
  ('v5', 189, 'Hai le idee molto chiare su quello che vorresti nella vita?', 'AUT', '+', 8, 189, NULL::jsonb),
  ('v5', 190, 'Prima di comprare qualcosa fai molta attenzione a cosa ti serve?', 'FIN', '+', 8, 190, NULL::jsonb),
  ('v5', 191, 'Ti capita di preferire il lavoro in solitaria rispetto al lavoro di squadra?', 'COM', '-', 8, 191, NULL::jsonb),
  ('v5', 192, 'Hai raggiunto risultati economici di rilievo nella tua vita?', 'SUC', '+', 8, 192, NULL::jsonb),
  ('v5', 193, 'Credi che ognuno debba svolgere la sua parte di lavoro?', 'PRI', '+', 8, 193, NULL::jsonb),
  ('v5', 194, 'Quando le cose vanno male pensi spesso a tutti i problemi?', 'GP', '-', 8, 194, NULL::jsonb),
  ('v5', 195, 'Ti aspetti che le cose vengano fatte secondo le tue indicazioni?', 'DET', '+', 8, 195, NULL::jsonb),
  ('v5', 196, 'Quando qualcuno non rispetta le regole ti dà molto fastidio?', 'PRI', '+', 8, 196, NULL::jsonb),
  ('v5', 197, 'In ogni discussione cerchi sempre di capire le ragioni dell''altro?', 'COM', '+', 8, 197, NULL::jsonb),
  ('v5', 198, 'Sei orientato al risultato anche a costo di qualche sacrificio?', 'ADS', '+', 8, 198, NULL::jsonb),
  ('v5', 199, 'I tuoi successi ti danno la conferma di essere sulla strada giusta?', 'SUC', '+', 8, 199, NULL::jsonb),
  ('v5', 200, 'Credi sia importante che le persone sappiano cosa pensi?', 'DET', '+', 8, 200, NULL::jsonb),
  ('v5', 201, 'Riesci spesso a convincere gli altri ad accettare le tue proposte?', 'VEN', '+', 9, 201, NULL::jsonb),
  ('v5', 202, 'Ti capita di sentirti a disagio quando devi far valere il tuo punto di vista?', 'VEN', '-', 9, 202, NULL::jsonb),
  ('v5', 203, 'Riesci a mantenere relazioni professionali solide nel lungo periodo?', 'VEN', '+', 9, 203, NULL::jsonb),
  ('v5', 204, 'Ti senti a tuo agio nel gestire le obiezioni quando presenti un''idea?', 'VEN', '+', 9, 204, NULL::jsonb),
  ('v5', 205, 'Sei bravo a capire cosa vogliono veramente le persone con cui interagisci?', 'VEN', '+', 9, 205, NULL::jsonb),
  ('v5', 206, 'Ti capita di rinunciare a un vantaggio personale per mantenere la tua integrità?', 'PRI', '+', 9, 206, NULL::jsonb),
  ('v5', 207, 'Riesci a motivare gli altri ad agire rapidamente sulle tue proposte?', 'VEN', '+', 9, 207, NULL::jsonb),
  ('v5', 208, 'Ti piace costruire una rete di contatti professionali?', 'VEN', '+', 9, 208, NULL::jsonb),
  ('v5', 209, 'Sei bravo a presentare le tue idee in modo convincente?', 'VEN', '+', 9, 209, NULL::jsonb),
  ('v5', 210, 'Ti capita di fare acquisti impulsivi di cui poi ti penti?', 'FIN', '-', 9, 210, NULL::jsonb),
  ('v5', 211, 'Dedichi regolarmente del tempo alla gestione dei tuoi investimenti?', 'FIN', 'S', 9, 211, '{"a":"Sì, regolarmente","b":"Meno del dovuto","c":"No, per niente"}'::jsonb),
  ('v5', 212, 'Le tue riserve finanziarie coprono...', 'FIN', 'S', 9, 212, '{"a":"Meno di 3 mesi di spese","b":"Tra 3 e 6 mesi di spese","c":"Più di 9 mesi di spese"}'::jsonb),
  ('v5', 213, 'A quanti mesi ammonta la tua autonomia finanziaria attuale?', 'FIN', 'S', 9, 213, '{"a":"Meno di 3 mesi","b":"Tra 3 e 9 mesi","c":"Più di 9 mesi"}'::jsonb),
  ('v5', 214, 'Monitori regolarmente le tue entrate e uscite?', 'FIN', '+', 9, 214, NULL::jsonb),
  ('v5', 215, 'Hai mai avuto debiti che ti hanno causato stress?', 'FIN', '-', 9, 215, NULL::jsonb),
  ('v5', 216, 'Ti senti sicuro delle tue decisioni finanziarie?', 'FIN', '+', 9, 216, NULL::jsonb),
  ('v5', 217, 'Hai raggiunto gli obiettivi professionali che ti eri prefissato?', 'SUC', '+', 9, 217, NULL::jsonb),
  ('v5', 218, 'Le persone ti considerano una persona di successo?', 'SUC', '+', 9, 218, NULL::jsonb),
  ('v5', 219, 'Ti senti realizzato nella tua carriera attuale?', 'SUC', '+', 9, 219, NULL::jsonb),
  ('v5', 220, 'Hai ottenuto riconoscimenti importanti nel tuo campo?', 'SUC', '+', 9, 220, NULL::jsonb),
  ('v5', 221, 'Sei soddisfatto del tuo livello di reddito attuale?', 'SUC', '+', 9, 221, NULL::jsonb),
  ('v5', 222, 'Hai raggiunto una posizione di responsabilità nel tuo lavoro?', 'SUC', '+', 9, 222, NULL::jsonb),
  ('v5', 223, 'Ti consideri un modello da seguire per gli altri?', 'PRI', '+', 9, 223, NULL::jsonb),
  ('v5', 224, 'Credi che il duro lavoro venga sempre ricompensato?', 'PRI', '+', 9, 224, NULL::jsonb),
  ('v5', 225, 'Ti senti in linea con i tuoi valori personali nel lavoro?', 'PRI', '+', 9, 225, NULL::jsonb),
  ('v5', 226, 'Sei disposto a fare sacrifici oggi per un futuro migliore?', 'PRI', '+', 10, 226, NULL::jsonb),
  ('v5', 227, 'Credi che l''onestà sia sempre la migliore politica?', 'PRI', '+', 10, 227, NULL::jsonb),
  ('v5', 228, 'Rispetto alla media delle persone, quanto potenziale di successo ritieni di avere?', 'AUT', 'S', 10, 228, '{"a":"Molto più della media","b":"Nella media","c":"Un po'' meno della media"}'::jsonb),
  ('v5', 229, 'Ti consideri una persona che rispetta sempre gli impegni presi?', 'PRI', '+', 10, 229, NULL::jsonb),
  ('v5', 230, 'Credi che la fiducia sia fondamentale in ogni relazione?', 'PRI', '+', 10, 230, NULL::jsonb),
  ('v5', 231, 'Ti senti in dovere di restituire ciò che hai ricevuto?', 'PRI', '+', 10, 231, NULL::jsonb),
  ('v5', 232, 'Credi che le regole siano importanti per una società civile?', 'PRI', '+', 10, 232, NULL::jsonb),
  ('v5', 233, 'Ti consideri una persona rispettosa delle tradizioni?', 'RC', '+', 10, 233, NULL::jsonb),
  ('v5', 234, 'Sei una persona che preferisce la stabilità ai cambiamenti?', 'RC', '+', 10, 234, NULL::jsonb),
  ('v5', 235, 'Ti piace avere certezze piuttosto che vivere nell''incertezza?', 'RC', '+', 10, 235, NULL::jsonb),
  ('v5', 236, 'Preferisci i metodi collaudati rispetto alle novità?', 'RC', '+', 10, 236, NULL::jsonb),
  ('v5', 237, 'Ti senti a tuo agio con le procedure standard?', 'RC', '+', 10, 237, NULL::jsonb),
  ('v5', 238, 'A volte hai dovuto dire una bugia?', 'CTRL', 'C', 10, 238, NULL::jsonb),
  ('v5', 239, 'Hai mai conosciuto una persona antipatica?', 'CTRL', 'C', 10, 239, NULL::jsonb),
  ('v5', 240, 'Qualche volta ti capita di pensare a cose che poi non dici?', 'CTRL', 'C', 10, 240, NULL::jsonb),
  ('v5', 241, 'Qualche volta hai l''impressione di parlare troppo?', 'CTRL', 'C', 10, 241, NULL::jsonb),
  ('v5', 242, 'Qualche volta ti capita di avere pensieri critici riguardo a qualcuno?', 'CTRL', 'C', 10, 242, NULL::jsonb)
ON CONFLICT (assessment_version, question_id) DO UPDATE
SET
  question_text = EXCLUDED.question_text,
  trait_code = EXCLUDED.trait_code,
  polarity = EXCLUDED.polarity,
  theme_block = EXCLUDED.theme_block,
  display_order = EXCLUDED.display_order,
  custom_answers = EXCLUDED.custom_answers,
  active = true,
  updated_at = now();

COMMIT;
