-- ════════════════════════════════════════════════════════════════════════════
-- Tesoreria: il pagamento certo a un fornitore si collega da solo (23/11/2026)
-- ════════════════════════════════════════════════════════════════════════════
-- Su Impresa Vulcano quindici uscite di banca (20.198 €) erano già state
-- riconosciute dal motore — Enel, Agesp, Aemme Service, La C2, Wind: stesso
-- fornitore, importo uguale al residuo, un solo candidato, nessun conflitto —
-- e restavano «proposta» da confermare a mano. Nessuno le confermava, e nel
-- popup dei pagamenti quelle fatture risultavano ancora da pagare.
--
-- Il motivo: per dire «forte» il motore vuole il numero della fattura in
-- causale, o l'IBAN verificato, o il codice della commessa. Il nome del
-- fornitore, o l'IBAN in anagrafica, da soli valgono «media», e la conferma
-- automatica (private.tes_conferma_una) prende solo i candidati forti.
--
-- La regola nuova, approvata da Florin («sì, in automatico»): un pagamento in
-- USCITA che ha UN SOLO documento del fornitore con quell'importo esatto,
-- riconosciuto per nome o per IBAN, senza conflitti e senza un altro numero di
-- fattura citato in causale, è quel pagamento. Il candidato diventa forte; il
-- movimento si collega da solo dove l'azienda ha acceso il collegamento
-- automatico, e resta una proposta con un clic dove non l'ha acceso.
-- Le entrate (fatture emesse) non cambiano.
--
-- Il soggetto riconosciuto entra nel candidato (`soggetto`: nome, iban,
-- iban_verificato…), così la regola guarda il dato e non il testo dei motivi.
--
-- La funzione è lunga e viva: si cambiano i due punti che servono e si rifiuta
-- se uno dei due non c'è più. Idempotente: se la patch c'è già, non fa niente.
-- ════════════════════════════════════════════════════════════════════════════

DO $patch$
DECLARE
  d text := pg_get_functiondef('private.tes_classifica(uuid,uuid)'::regprocedure);
  n text;
  vecchio1 text := '''riferimenti'',riferita);';
  nuovo1   text := '''riferimenti'',riferita,''soggetto'',subj);';
  vecchio2 text := 'AND x->>''forza''=''media'';';
  nuovo2   text := 'AND x->>''forza''=''media'';
 -- 23/11/2026 (Florin: «sì, in automatico»). Un pagamento in USCITA che ha un solo documento del
 -- fornitore con quell''importo esatto, riconosciuto per nome o per IBAN, senza conflitti e senza un
 -- altro numero di fattura in causale, è quel pagamento: Enel, Agesp, Aemme, La C2 restavano
 -- «proposta» per settimane e nessuno le confermava.
 IF NOT cred AND jsonb_array_length(forti)=0 AND jsonb_array_length(medie)=1 AND jsonb_array_length(confl)=0
    AND cardinality(rif_fatture)=0 AND (medie->0->>''soggetto'') IN (''nome'',''iban'')
    AND (medie->0->>''tipo'') IN (''ricevuta'',''rata_fornitore'') THEN
  forti:=jsonb_build_array(jsonb_set(medie->0,''{forza}'',''"forte"''::jsonb)
           ||jsonb_build_object(''motivi'',(medie->0->''motivi'')||to_jsonb(''Unico documento del fornitore con questo importo''::text)));
  medie:=''[]''::jsonb;
 END IF;';
BEGIN
  IF position('Unico documento del fornitore con questo importo' in d) > 0 THEN RETURN; END IF;
  IF (length(d) - length(replace(d, vecchio1, ''))) / length(vecchio1) <> 1
     OR (length(d) - length(replace(d, vecchio2, ''))) / length(vecchio2) <> 1 THEN
    RAISE EXCEPTION 'tes_classifica: i punti da cambiare non ci sono più (o non sono unici), la patch va rifatta a mano';
  END IF;
  n := replace(replace(d, vecchio1, nuovo1), vecchio2, nuovo2);
  EXECUTE n;
END
$patch$;
