-- ════════════════════════════════════════════════════════════════════════════
-- Tesoreria: la natura di un movimento senza documento si legge dalla causale,
-- in un posto solo e con una regola per riga (lotto B, 28/11/2026)
-- ════════════════════════════════════════════════════════════════════════════
-- Quando nessuna fattura, rata o scadenza combacia (R-NESSUNO), private.tes_classifica
-- dice comunque di che cosa si tratta: «spesa bancaria», «rata di finanziamento»… Fino
-- a oggi lo diceva un CASE scritto due volte dentro la funzione (natura e «cosa manca»),
-- con quattro modelli. Misurati i movimenti aperti degli ultimi 120 giorni (4 aziende),
-- restavano «Da capire» causali che la banca scrive sempre allo stesso modo:
--
--   COMM. RICHIESTA INCASSO SEPA B2C/B2B     commissione dell'addebito SEPA (1,50 €)
--   SDD CORE - RICHIESTA INCASSO SEPA …      addebito diretto di un fornitore
--   PAGAMENTO UTENZE CBILL/PAGOPA, MAV/RAV,  bollettini e avvisi pagoPA
--     BOLLETTINO BANCARIO FRECCIA
--   DISPOSIZIONE PER EMOLUMENTI, STIPENDI    stipendi
--   RICARICA CARTA PREPAGATA                 giroconto verso la carta
--   ACCREDITI EFFETTI/DOC. S.B.F.,           anticipo salvo buon fine
--     ACCREDITO RIBA AL SBF
--   RITENUTA BONIFICI, RIT. D'ACCONTO SU     ritenuta dell'8% sul bonifico per detrazioni
--     BONIFICI
--   PAGAMENTO SU CIRCUITO INTERNAZIONALE,    spesa con carta
--     CARTA DEL CREDITO COOPERATIVO
--   ADDEBITO SDD FINANZIAMENTI, SDD di una   rata di finanziamento
--     società finanziaria
--
-- private.tes_natura_causale decide la natura con regole in ordine, ognuna con il suo
-- codice e la sua versione (N-…/vN), e restituisce anche la frase di «cosa manca».
-- Le regole già esistenti restano prime e identiche (N-FINANZ/1, N-ANTICIPO/1, N-SPESE/1,
-- N-CARTA/1): un movimento già riconosciuto non cambia natura, salvo la ricarica di una
-- carta, che prima poteva passare per spesa con carta. Le nuove stanno dopo.
--
-- Nature nuove: 'stipendi', 'ritenuta_bonifico', 'bollettino', 'addebito_diretto'.
-- Le altre si riusano: 'finanziamento', 'anticipo_fatture', 'spesa_bancaria',
-- 'spesa_carta', 'giroconto'.
--
-- La funzione è pura (IMMUTABLE, nessuna tabella): si prova da sola
-- (src/test/security/tesoreriaNaturaCausale.test.ts). La usa tes_classifica dopo la
-- migrazione 20290701200100. Chiusa a tutti: la chiamano solo le funzioni del motore.
-- ════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION private.tes_natura_causale(
  p_ncaus text,        -- causale + riferimento + controparte, già passata da private.tes_norm
  p_cred boolean,      -- true = entrata
  p_tx_iban text,      -- IBAN della controparte, se la banca lo dà
  p_tx_nome text,      -- nome della controparte, se la banca lo dà
  p_descrizione text   -- descrizione grezza (per sapere se è vuota)
) RETURNS jsonb
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO ''
AS $function$
 WITH x AS (SELECT coalesce(p_ncaus,'') n, coalesce(p_cred,false) cred,
                   regexp_replace(coalesce(p_ncaus,''),'\mspese \d+ \d+ eur\M','','g') senza_spese_eur)
 SELECT CASE
  -- ── Regole di prima (identiche) ───────────────────────────────────────────
  WHEN NOT cred AND n~'\m(rata mutuo|rata prestito|mutuo|prestito|leasing)\M' THEN
   jsonb_build_object('natura','finanziamento','regola','N-FINANZ','versione',1,
    'mancante','Rata di un finanziamento: quota capitale e interessi, non una fattura')
  WHEN n~'\m(anticipo su|anticipi su|rientro anticipo|rimborso anticipo|ft anticipate)\M' THEN
   jsonb_build_object('natura','anticipo_fatture','regola','N-ANTICIPO','versione',1,
    'mancante','Anticipo su fatture: è un finanziamento della banca, non l''incasso del cliente')
  -- ── Nuove, prima delle spese: finanziamenti con addebito SDD, accrediti SBF ─
  WHEN NOT cred AND (n~'\maddebito sdd finanziament' OR (n~'\msdd\M' AND n~'\m(servizi finanziari|financial|leasing)\M')) THEN
   jsonb_build_object('natura','finanziamento','regola','N-FINANZ-SDD','versione',1,
    'mancante','Rata di un finanziamento addebitata con SDD: quota capitale e interessi, non una fattura')
  WHEN cred AND n~'\maccredit[oi]\M' AND n~'\m(s b f|sbf|salvo buon fine)\M' THEN
   jsonb_build_object('natura','anticipo_fatture','regola','N-SBF','versione',1,
    'mancante','Accredito salvo buon fine: la banca anticipa gli effetti, l''incasso del cliente arriva alla scadenza')
  -- ── Spese bancarie: le parole di sempre, più la «COMM.» abbreviata in testa ─
  WHEN senza_spese_eur~'\m(commissioni|commissione|canone|spese|bollo|interessi|competenze|imposta|fx)\M' THEN
   jsonb_build_object('natura','spesa_bancaria','regola','N-SPESE','versione',1,
    'mancante','Spesa bancaria: si registra come movimento senza fattura')
  WHEN n~'^comm\M' THEN
   jsonb_build_object('natura','spesa_bancaria','regola','N-SPESE-COMM','versione',1,
    'mancante','Commissione della banca («COMM.»): si registra come movimento senza fattura')
  -- ── Ricarica di una carta: soldi che restano dell'azienda ─────────────────
  WHEN NOT cred AND n~'\mricaric[ah]e?\M' AND n~'\m(carta|prepagata)\M' THEN
   jsonb_build_object('natura','giroconto','regola','N-RICARICA','versione',1,
    'mancante','Ricarica di una carta dell''azienda: non è un costo, le spese vere sono sulla carta')
  WHEN NOT cred AND nullif(p_tx_iban,'') IS NULL AND nullif(p_tx_nome,'') IS NOT NULL
       AND (btrim(coalesce(p_descrizione,''))='' OR n~'\m(pos|carta|card)\M') THEN
   jsonb_build_object('natura','spesa_carta','regola','N-CARTA','versione',1,
    'mancante','Acquisto con carta: serve la ricevuta o la fattura del negozio')
  -- ── Nuove ──────────────────────────────────────────────────────────────────
  WHEN NOT cred AND n~'\m(emolumenti|stipendi|stipendio)\M' THEN
   jsonb_build_object('natura','stipendi','regola','N-STIPENDI','versione',1,
    'mancante','Stipendi: il costo è nelle buste paga, si chiude senza fattura')
  WHEN NOT cred AND n~'^(ritenuta|rit)( d acconto)?( su)? bonifici\M' THEN
   jsonb_build_object('natura','ritenuta_bonifico','regola','N-RITENUTA','versione',1,
    'mancante','Ritenuta d''acconto trattenuta dalla banca su un bonifico per detrazioni: va sulla fattura del cliente ordinante')
  WHEN NOT cred AND n~'\m(cbill|pagopa|pago pa|mav|rav|bollettino|freccia)\M' THEN
   jsonb_build_object('natura','bollettino','regola','N-BOLLETTINO','versione',1,
    'mancante','Bollettino, pagoPA o MAV: serve l''avviso o la ricevuta dell''ente')
  WHEN NOT cred AND n~'\msdd\M' THEN
   jsonb_build_object('natura','addebito_diretto','regola','N-SDD','versione',1,
    'mancante','Addebito diretto SEPA di un fornitore: serve la sua fattura (bolletta, canone, abbonamento)')
  WHEN NOT cred AND n~'^(pagamento su circuito internaz|carta del credito cooperativo|pagamenti diversi .*\mpos\M)' THEN
   jsonb_build_object('natura','spesa_carta','regola','N-CARTA-CIRCUITO','versione',1,
    'mancante','Acquisto con carta: serve la ricevuta o la fattura del negozio')
  ELSE jsonb_build_object('natura','sconosciuta','regola','N-NESSUNA','versione',1,'mancante',NULL)
 END FROM x
$function$;

REVOKE ALL ON FUNCTION private.tes_natura_causale(text,boolean,text,text,text) FROM PUBLIC, anon, authenticated;
