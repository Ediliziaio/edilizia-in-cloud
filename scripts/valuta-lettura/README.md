# Misurare la lettura dei documenti

Dice **quanto bene** l'AI legge i documenti: confronta ciò che ha letto con ciò
che era scritto davvero. Non chiama l'AI e non spende crediti: lavora su due
cartelle di file JSON, una per documento, con lo stesso nome.

```
atteso/fattura-01.json    ← cosa c'è scritto nel documento (lo scrivi/correggi tu)
letto/fattura-01.json     ← cosa ha letto l'AI (la risposta della funzione)
```

## Provare subito

```bash
bun run scripts/valuta-lettura/cli.ts --atteso=scripts/valuta-lettura/esempio/atteso --letto=scripts/valuta-lettura/esempio/letto
```

Funziona anche con `node --experimental-strip-types` (Node 22.6 o più recente).
Opzioni: `--json=<file>` salva il rapporto completo, `--soglia=0.9` esce con
errore se i campi giusti sono meno del 90% (utile prima di cambiare un prompt).

## Come si prepara un insieme di prova

1. Scegli 20–30 documenti veri per tipo (fatture, DDT, computi…), di fornitori
   e impaginazioni diverse, **compresi quelli difficili** (foto storte, scansioni).
2. Fai leggere i documenti con il sistema com'è oggi e salva la risposta in `letto/`.
   Per documenti già analizzati dall'app puoi partire dal database:

   ```sql
   select file_name, doc_type, parser_used, structured_fields
   from document_analysis_results
   where company_id = '<azienda>' and doc_type = 'fattura_passiva'
     and status in ('success', 'review_required')
   order by created_at desc limit 30;
   ```

   Per le bozze estratte dalle email (il flusso automatico più usato):

   ```sql
   select id, tipo, campi
   from email_documento_estratto
   where company_id = '<azienda>' and tipo in ('fattura', 'ddt')
   order by created_at desc limit 30;
   ```

   I campi di quelle bozze sono scritti come `{ "valore": …, "conf": … }`: lo strumento
   guarda solo il valore.

3. Copia quei file in `atteso/` e **correggi a mano** ogni valore sbagliato guardando
   il documento. Aggiungi `"tipo": "fattura_passiva"` e metti i campi sotto `"campi"`.
   Un campo che il documento non riporta lascialo `null`: se l'AI ci scrive un valore,
   è un valore inventato e il rapporto lo conta.
4. Lancia il comando qui sopra.

I file dell'AI possono avere la forma con cui rispondono le funzioni (`extracted`,
`ddt`), quella della riga di `document_analysis_results` (`structured_fields`) o i
soli campi.

**Non mettere nel repository documenti o dati dei clienti.** Tieni `atteso/` e
`letto/` in una cartella tua; qui c'è solo l'esempio, con dati inventati.

## Come si legge il rapporto

| esito | significato |
| --- | --- |
| esatto | lo stesso valore, scritto allo stesso modo |
| equivalente | lo stesso valore in un altro formato: `12/10/2026` e `2026-10-12`, `1.220,00` e `1220`, `IT 0123…` e `0123…`, maiuscole e punteggiatura |
| errato | c'è un valore, ma non è quello scritto (anche una sola cifra: è un errore vero) |
| mancante | il documento lo riporta e l'AI non l'ha letto |
| inventato | il documento non lo riporta e l'AI ha scritto un valore |

I **campi giusti** sono esatti + equivalenti su quelli che il documento riporta;
gli inventati non entrano in quella percentuale ma tolgono la qualifica di
«perfetto» al documento. Le righe delle liste si abbinano per posizione: righe
scambiate contano come errate.

## Confrontare due versioni (un prompt nuovo, un altro modello)

Fai leggere gli **stessi documenti** con la versione nuova, salva le risposte in
una seconda cartella `letto-B/` e lancia il comando due volte contro lo stesso
`atteso/`. Si cambia solo se la versione nuova non peggiora i campi che contano
(totali, partite IVA, quantità) e migliora il resto.

## Correzioni degli utenti

Lo stesso confronto serve a contare quanto l'utente ha corretto prima di
confermare: `correzioniUtente(letto, confermato)` in
`supabase/functions/_shared/valutaLettura.ts` restituisce i campi cambiati.
Oggi nessuna schermata la chiama: le conferme avvengono nei moduli di
destinazione (fattura, DDT, ordine…) e ognuno andrebbe collegato.
