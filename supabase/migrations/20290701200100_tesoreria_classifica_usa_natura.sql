-- ════════════════════════════════════════════════════════════════════════════
-- Tesoreria: tes_classifica usa private.tes_natura_causale (lotto B, 28/11/2026)
-- ════════════════════════════════════════════════════════════════════════════
-- Nel ramo R-NESSUNO (nessun documento combacia) la natura e la frase di «cosa manca»
-- non sono più due CASE copiati: le dà private.tes_natura_causale (20290701200000),
-- con le regole nuove per commissioni SEPA, SDD, pagoPA/MAV/bollettini, stipendi,
-- ricariche delle carte, accrediti SBF, ritenute sui bonifici, carte e finanziamenti SDD.
-- L'esito porta anche `regola_natura` («N-SPESE-COMM/v1»): dice quale riga ha deciso.
-- R-NESSUNO passa alla versione 2: cambia l'impronta, e il ricalcolo riscrive l'esito.
--
-- Cosa cambia per i movimenti già classificati: niente per chi ha un documento (le
-- regole prima di R-NESSUNO non sono toccate). Fra i R-NESSUNO cambiano solo i
-- «sconosciuta» che una regola nuova riconosce e le ricariche di carta che prima
-- passavano per «spesa con carta». La frase di «cosa manca» diventa una sola: prima,
-- per una causale con «anticipo» e «mutuo», ne comparivano due.
--
-- Il ricalcolo NON è qui: questa migrazione non scrive righe. Lo fa
-- tesoreria_classifica_movimenti (giro del mattino, 100 per azienda a giro, dai più
-- vecchi) o il dettaglio del movimento quando si apre.
--
-- La funzione è lunga e viva: si cambiano tre punti e si rifiuta se uno non c'è più o
-- non è unico. Idempotente: se la patch c'è già, non fa niente.
-- ════════════════════════════════════════════════════════════════════════════

DO $patch$
DECLARE
  d text := pg_get_functiondef('private.tes_classifica(uuid,uuid)'::regprocedure);
  vecchio1 text := $v1$   'natura',CASE WHEN NOT cred AND ncaus~'\m(rata mutuo|rata prestito|mutuo|prestito|leasing)\M' THEN 'finanziamento'
                 WHEN ncaus~'\m(anticipo su|anticipi su|rientro anticipo|rimborso anticipo|ft anticipate)\M' THEN 'anticipo_fatture'
                 WHEN regexp_replace(ncaus,'\mspese \d+ \d+ eur\M','','g')~'\m(commissioni|commissione|canone|spese|bollo|interessi|competenze|imposta|fx)\M' THEN 'spesa_bancaria'
                 WHEN NOT cred AND tx_iban IS NULL AND tx_nome IS NOT NULL AND (btrim(coalesce(t.description,''))='' OR ncaus~'\m(pos|carta|card)\M') THEN 'spesa_carta'
                 ELSE 'sconosciuta' END,
$v1$;
  nuovo1 text := $n1$   'natura',private.tes_natura_causale(ncaus,cred,tx_iban,tx_nome,t.description)->>'natura',
   -- 28/11/2026 (lotto B): la natura viene da private.tes_natura_causale, una regola per riga (N-…/vN).
   'regola_natura',(SELECT concat(z->>'regola','/v',z->>'versione') FROM (SELECT private.tes_natura_causale(ncaus,cred,tx_iban,tx_nome,t.description) z) zn),
$n1$;
  vecchio2 text := $v2$     CASE WHEN NOT cred AND ncaus~'\m(rata mutuo|rata prestito|mutuo|prestito|leasing)\M' THEN 'Rata di un finanziamento: quota capitale e interessi, non una fattura' END,
     CASE WHEN ncaus~'\m(anticipo su|anticipi su|rientro anticipo|rimborso anticipo|ft anticipate)\M' THEN 'Anticipo su fatture: è un finanziamento della banca, non l''incasso del cliente' END,
     CASE WHEN NOT (NOT cred AND ncaus~'\m(rata mutuo|rata prestito|mutuo|prestito|leasing)\M')
           AND regexp_replace(ncaus,'\mspese \d+ \d+ eur\M','','g')~'\m(commissioni|commissione|canone|spese|bollo|interessi|competenze|imposta|fx)\M' THEN 'Spesa bancaria: si registra come movimento senza fattura' END,
     CASE WHEN NOT cred AND tx_iban IS NULL AND tx_nome IS NOT NULL AND (btrim(coalesce(t.description,''))='' OR ncaus~'\m(pos|carta|card)\M') AND NOT ncaus~'\m(commissioni|commissione|canone|fx)\M' THEN 'Acquisto con carta: serve la ricevuta o la fattura del negozio' END$v2$;
  nuovo2 text := $n2$     private.tes_natura_causale(ncaus,cred,tx_iban,tx_nome,t.description)->>'mancante'$n2$;
  vecchio3 text := $v3$'regola','R-NESSUNO','versione',1,$v3$;
  nuovo3 text := $n3$'regola','R-NESSUNO','versione',2,$n3$;
BEGIN
  IF position('private.tes_natura_causale(' in d) > 0 THEN RETURN; END IF;
  IF (length(d) - length(replace(d, vecchio1, ''))) / length(vecchio1) <> 1
     OR (length(d) - length(replace(d, vecchio2, ''))) / length(vecchio2) <> 1
     OR (length(d) - length(replace(d, vecchio3, ''))) / length(vecchio3) <> 1 THEN
    RAISE EXCEPTION 'tes_classifica: i punti da cambiare non ci sono più (o non sono unici), la patch va rifatta a mano';
  END IF;
  EXECUTE replace(replace(replace(d, vecchio1, nuovo1), vecchio2, nuovo2), vecchio3, nuovo3);
END
$patch$;
