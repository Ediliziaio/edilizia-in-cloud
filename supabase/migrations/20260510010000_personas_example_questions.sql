-- ════════════════════════════════════════════════════════════════════════════
-- GAP 1 (Discoverability) — example_questions per le 18 personas azienda
-- ────────────────────────────────────────────────────────────────────────────
-- Aggiunge una colonna `example_questions text[]` a ai_personas e popola
-- con 3-5 domande di esempio per ognuna delle 18 personas. Le domande sono
-- mostrate:
--   - in chat empty state (chip cliccabili → invia direttamente la domanda)
--   - nel Command Palette globale (Cmd+K) come preview "cosa puoi chiedere"
--   - nella card discovery primo accesso
--
-- L'imprenditore edile non capisce la differenza tra cfo/controller/
-- commercialista solo dal nome → vedere esempi concreti rende discoverable
-- la funzionalità che altrimenti resterebbe sepolta.
-- ════════════════════════════════════════════════════════════════════════════

BEGIN;

-- ─── 1) Schema: aggiungi colonna se mancante ────────────────────────────────
ALTER TABLE public.ai_personas
  ADD COLUMN IF NOT EXISTS example_questions text[] NOT NULL DEFAULT '{}';

COMMENT ON COLUMN public.ai_personas.example_questions IS
  'Lista di 3-5 domande esempio mostrate in empty state chat e Command Palette. Italiano.';

-- ─── 2) Seed example_questions per le 18 personas ───────────────────────────

-- FINANCE
UPDATE public.ai_personas SET example_questions = ARRAY[
  'Come va la cassa questo mese?',
  'Genera il P&L del trimestre',
  'Quali sono i clienti che pagano in ritardo?',
  'Ho liquidità per pagare F24 il 16?',
  'Stima cash flow a 90 giorni'
] WHERE persona_key = 'cfo';

UPDATE public.ai_personas SET example_questions = ARRAY[
  'Margine sui cantieri attivi',
  'Confronta costi previsti vs reali ultimo cantiere',
  'Quale cantiere ha meno marginalità?',
  'Vai delle ore lavorate per dipendente',
  'Costo medio ora cantiere XYZ'
] WHERE persona_key = 'controller';

UPDATE public.ai_personas SET example_questions = ARRAY[
  'Riconcilia i pagamenti del mese',
  'Quali fatture sono ancora da inviare a SDI?',
  'Mostrami le scadenze IVA prossimi 30gg',
  'Genera il sollecito per il cliente Mario Rossi',
  'Lista DDT non ancora fatturati'
] WHERE persona_key = 'amministrazione';

UPDATE public.ai_personas SET example_questions = ARRAY[
  'Genera la LIPE trimestrale',
  'Quali deduzioni edilizie posso ancora applicare?',
  'Verifica le quadrature contabili',
  'Calcola F24 mese corrente',
  'CU annuale per dipendente Mario Rossi'
] WHERE persona_key = 'commercialista';

-- OPERATIONS
UPDATE public.ai_personas SET example_questions = ARRAY[
  'Quali cantieri sono in ritardo?',
  'Pianifica la squadra per il cantiere XYZ',
  'Identifica conflitti di allocazione settimana prossima',
  'Stima data fine cantiere ABC',
  'Genera il piano recovery per il cantiere in ritardo'
] WHERE persona_key = 'pm_cantiere';

UPDATE public.ai_personas SET example_questions = ARRAY[
  'Crea il rapportino di oggi del cantiere XYZ',
  'Quali operai sono in cantiere oggi?',
  'Foto del cantiere ultimi 7 giorni',
  'Materiali consegnati questa settimana',
  'Aggiungi attività al rapportino corrente'
] WHERE persona_key = 'capocantiere';

UPDATE public.ai_personas SET example_questions = ARRAY[
  'Genera POS per il cantiere XYZ',
  'Identifica il tipo di pratica per intervento ristrutturazione',
  'Checklist documenti per la SCIA',
  'Verifica completezza pratica cantiere ABC',
  'Genera relazione tecnica conformità'
] WHERE persona_key = 'tecnico';

UPDATE public.ai_personas SET example_questions = ARRAY[
  'Crea ordine acquisto per Materiali Edili Spa',
  'Confronta prezzi fornitori per cemento',
  'DDT in ricezione da approvare',
  'Quali fornitori hanno DURC in scadenza?',
  'Storico ordini ultimo trimestre'
] WHERE persona_key = 'acquisti';

-- SALES
UPDATE public.ai_personas SET example_questions = ARRAY[
  'Forecast pipeline trimestre',
  'Quali quote hanno alta probabilità di chiusura?',
  'Sales activity ultimo mese',
  'Top 10 venditori per fatturato',
  'Identifica deal a rischio'
] WHERE persona_key = 'direttore_vendite';

UPDATE public.ai_personas SET example_questions = ARRAY[
  'Quali clienti sono dormienti da 90gg?',
  'Genera proposta commerciale per Mario Rossi',
  'Suggerisci followup per quote pending',
  'Stima probabilità di chiusura quote XYZ',
  'Lead score top 20 prospect'
] WHERE persona_key = 'sales';

-- CLIENT
UPDATE public.ai_personas SET example_questions = ARRAY[
  'A che punto è il cantiere del cliente Mario Rossi?',
  'Quali clienti hanno ticket aperti urgenti?',
  'Scrivi email cordiale per sollecitare un pagamento',
  'Genera report stato cantiere per il committente',
  'Quali clienti meriterebbero un check-in?'
] WHERE persona_key = 'cliente_tutor';

UPDATE public.ai_personas SET example_questions = ARRAY[
  'Rispondi a domanda cliente: quando arriva il prossimo SAL?',
  'Spiega al cliente la voce X della fattura',
  'Bozza messaggio per chiedere foto stato lavori al cliente',
  'Cliente vuole modifica preventivo: come gestisco?',
  'Dammi il riassunto delle ultime conversazioni con cliente XYZ'
] WHERE persona_key = 'assistente_cliente';

-- MARKETING
UPDATE public.ai_personas SET example_questions = ARRAY[
  'Idee contenuti Instagram settimana prossima',
  'Analisi performance ads ultimo mese',
  'Quale segmento ha il più alto LTV?',
  'Bozza email newsletter clienti dormienti',
  'Genera piano editoriale mensile'
] WHERE persona_key = 'direttore_marketing';

-- HR
UPDATE public.ai_personas SET example_questions = ARRAY[
  'Suggerisci squadra per cantiere XYZ in base alle competenze',
  'Quali operai hanno formazioni in scadenza?',
  'Top performer su lavorazione cappotto',
  'Genera modulo consegna DPI per Mario Rossi',
  'Stato sicurezza operaio Giovanni Bianchi'
] WHERE persona_key = 'hr';

-- COMPLIANCE
UPDATE public.ai_personas SET example_questions = ARRAY[
  'Quali DURC scadono nei prossimi 30 giorni?',
  'Operai non conformi per la sicurezza',
  'Ultime normative UE su edilizia',
  'Genera DUVRI per cantiere XYZ',
  'Verifica conformità subappaltatore Bianchi Srl'
] WHERE persona_key = 'compliance';

UPDATE public.ai_personas SET example_questions = ARRAY[
  'Verifica clausole contratto fornitore',
  'Riassumi modifiche normative degli ultimi 30gg',
  'Lettera diffida pagamento cliente moroso',
  'Bozza accordo riservatezza',
  'Quali cause sono pendenti?'
] WHERE persona_key = 'legale';

-- META / EXECUTIVE
UPDATE public.ai_personas SET example_questions = ARRAY[
  'Brief mattutino: cosa devo fare oggi?',
  'Sintesi situazione azienda ultima settimana',
  'Quali decisioni strategiche sono pendenti?',
  'Cosa vedi di anomalo nei numeri?',
  'Preparami per la riunione delle 14'
] WHERE persona_key = 'assistente_imprenditore';

UPDATE public.ai_personas SET example_questions = ARRAY[
  'Cerca nei documenti aziendali: clausola garanzia 10 anni',
  'Sintesi fatture cliente Rossi ultimo anno',
  'Trova tutti i cantieri con problemi DURC',
  'Storico messaggi con fornitore Bianchi',
  'Estrai dati chiave da contratto allegato'
] WHERE persona_key = 'brain';

-- ─── 3) Aggiorna VIEW ai_personas_public per esporre example_questions ─────
-- La VIEW filtrata pubblica deve includere il nuovo campo, altrimenti il
-- frontend non può leggerlo (la VIEW è il solo endpoint accessibile da
-- authenticated, la tabella ai_personas è bloccata da RLS).

DROP VIEW IF EXISTS public.ai_personas_public CASCADE;
CREATE VIEW public.ai_personas_public AS
SELECT
  persona_key,
  display_name,
  short_label,
  mission,
  category,
  recommended_tier_key,
  icon,
  color,
  enabled,
  is_system,
  allowed_roles,
  sort_order,
  example_questions
FROM public.ai_personas
WHERE enabled = true AND is_system = false;

GRANT SELECT ON public.ai_personas_public TO authenticated, anon;

-- ─── 4) Verifica seed ───────────────────────────────────────────────────────
DO $$
DECLARE
  v_count_with_examples INT;
  v_total_personas INT;
BEGIN
  SELECT COUNT(*) INTO v_count_with_examples
  FROM public.ai_personas
  WHERE array_length(example_questions, 1) >= 3;

  SELECT COUNT(*) INTO v_total_personas FROM public.ai_personas WHERE enabled = true;

  RAISE NOTICE '[GAP-1] example_questions seedate su % personas su % totali abilitate',
    v_count_with_examples, v_total_personas;
END $$;

COMMIT;
