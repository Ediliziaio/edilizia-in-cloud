# AI che si paga e lavoro che non ne ha bisogno — piano del 15/11/2026

Due obiettivi che si tengono. Il primo: ogni chiamata a un servizio AI a pagamento
deve finire addebitata all'azienda che l'ha causata, oppure essere dichiarata, per
scritto, un costo della piattaforma. Il secondo: l'AI si usa solo per quello che regole,
parser, dati già presenti e riconciliazioni non sanno fare. Meno AI vuol dire meno
costo, meno errori e collegamenti spiegabili.

Il piano parte da una misura fatta sui dati di produzione (ultimi 30 giorni, query qui
sotto) e da un censimento del codice. I dettagli di ogni area li scrive la sessione
che la porta avanti, in un documento suo (vedi «Fasi e sessioni»).

## 1. Cosa abbiamo misurato

### Due registri di addebito, con ricarichi diversi

Ci sono **due** strade che addebitano l'AI all'azienda, e scrivono in due posti diversi:

| Strada | Chi la usa | Registro | Ricarico osservato |
|---|---|---|---|
| `aiRouterComplete` → `charge_ai_call` | quasi tutte le funzioni nuove | `ai_call_ledger` (+ `ai_credit_transactions`, `ai_credits`) | 350% su ogni compito |
| `chargeAndLogDirect` / `directAiLedger` | chiamate dirette (Whisper, Sonnet diretto, voce) | `ai_model_usage_log` | 80% (`vision_po`), 150–400%, fino a 753% medio (`lead_qualificazione`) |

Negli ultimi 30 giorni: `ai_call_ledger` 2.479 righe, 80,27 € addebitati;
`ai_model_usage_log` 361 righe, 3,40 €. Lo stesso tipo di lavoro può quindi costare
all'azienda il triplo o un quinto a seconda della strada che il codice ha preso, e
chi cerca «quanto ho speso» deve guardare in due tabelle. **Nessun prezzo va cambiato
senza il titolare**: va resa esplicita la regola (da dove viene il ricarico di ogni
compito) e unificata la lettura.

> Correzione rispetto all'analisi del 12/11: la lettura delle bolle (`pdf_vision_extract`)
> **è** addebitata — 96 addebiti su 107 letture, 1,13 € — in `ai_call_ledger`. Quel giorno
> era stato guardato solo `ai_model_usage_log`.

### Router: addebitato quasi tutto, con scarti da spiegare

| Compito | Chiamate | Addebiti | Scarto | Nota |
|---|---|---|---|---|
| `preventivo_genera` | 526 | 489 | 37 | 12,51 $ di costo, 34,30 € addebitati |
| `pdf_vision_extract` | 107 | 96 | 11 | lettura bolle |
| `silvio_commessa_lettura` | 32 | 23 | 9 | |
| `preventivo_analisi` | 3 | 1 | 2 | |
| `listino_abbina_voci` | 10 | 9 | 1 | |
| `outreach_reply_intent` | 3 | 0 | 3 | outreach della piattaforma |
| `silvio_admin_chat`, `silvio_chief_of_staff` | 60 | 0 | 60 | senza azienda: Silvio dei super admin |
| `planimetria_genera` | 145 | 0 | — | `skipCharge` di proposito: si paga in crediti render |

Lo scarto può essere giusto (un retry con la stessa chiave di idempotenza si paga una
volta, un risultato in cache non costa) o un buco. Va spiegato riga per riga.

### Crediti render: il rimborso restituisce crediti mai tolti

Su Demo Azienda 2 (illimitata di proposito) le planimetrie consumano **0** crediti, ma
16 rimborsi per errore hanno dato **+1** ciascuno («Refund automatico per render fallito
dopo addebito»). Il rimborso non guarda quanto il consumo aveva tolto davvero. Oggi si
vede solo su un'azienda illimitata; il percorso è lo stesso per tutte.

### Chiamate dirette ai provider fuori dal router

30 funzioni chiamano i provider direttamente. Di queste:

- **Addebitano per conto loro** (`chargeAndLogDirect` / `directAiLedger`):
  `ai-genera-preventivo-v2`, `ai-preventivo-conversazione`, `analyze-window-photo`,
  `detta-testo`, `email-ai-assistant`, `kb-ingest-batch`, `kb-test-rag`,
  `parse-matrix-image`, `parse-rapportino-ai`, `silvio-transcribe-audio`,
  `trascrizione-audio`, e in `_shared` `claudeProxy`, `fishAudio`, `outboundVoice`,
  `brainEmbed*`.
- **Nessun addebito trovato** — da verificare una per una, alcune possono addebitare
  in un modo che la ricerca non ha visto:
  `ai-ads-video-generate`, `ai-ads-video-status` (video: il costo unitario più alto),
  `elevenlabs-proxy`, `email-silvio-query`, `survey-ai-assistant`, `kb-sync`,
  `semantic-search-global`, `entity-embed-batch`, `email-ai-embed-backfill`,
  `_customer_os_shared`, `whatsapp-ai-processor`, `ai-conversations-sweeper`.
- **Interne della piattaforma** (diagnostica, catalogo, prove): `check-api-health`,
  `debug-ai-providers`, `get-openrouter-models`, `sync-openrouter-catalog`,
  `test-ai-models-suite`, `ops-canarino` (sonda del credito, ~0,01 $/giorno).
  Restano a carico nostro, ma devono essere **dichiarate** come tali e registrate.

Diverse funzioni non mostrano un controllo d'accesso riconoscibile
(`detta-testo`, `parse-matrix-image`, `semantic-search-global`, `debug-ai-providers`,
`get-openrouter-models`…): può essere un helper con un altro nome, o un buco. Va
verificato, perché una funzione AI raggiungibile senza autenticazione spende i nostri
soldi per chiunque.

### Query di misura

```sql
-- chiamate del router contro addebiti, per compito (30 giorni)
with r as (select task_key, count(*) n, sum(cost_usd) usd
             from ai_router_usage_log where created_at >= now()-interval '30 days' and status='success' group by 1),
     l as (select task_key, count(*) n, sum(cost_billed_eur) eur
             from ai_call_ledger where created_at >= now()-interval '30 days' and status='success' group by 1)
select coalesce(r.task_key,l.task_key), r.n chiamate, l.n addebiti, r.usd, l.eur
from r full join l using (task_key) order by r.usd desc nulls last;
```

## 2. Le regole che valgono ovunque

1. **L'azienda la decide il server**: dall'utente autenticato e dalla sua
   appartenenza, o dal record su cui si lavora (documento, commessa) per i lavori in
   background. Mai dal solo `company_id` che manda il browser.
2. **Prima il controllo, poi la chiamata**: permesso, piano, credito (`precheck_ai_credit`).
   Credito finito = messaggio chiaro, nessuna chiamata al provider.
3. **Una chiave di idempotenza per ogni lavoro** (documento + versione, richiesta):
   retry, webhook e riavvii non addebitano due volte; due richieste simultanee non
   spendono gli stessi crediti (il saldo si scala in una transazione con lock).
4. **Errore e timeout**: se il provider ha risposto con un costo, si addebita il costo
   reale anche se il nostro lavoro poi fallisce? La politica oggi non è scritta: va
   decisa col titolare e applicata uguale ovunque. Un timeout lato nostro non prova che
   il provider non abbia lavorato.
5. **Un solo modo di registrare**: compito, provider, modello, unità (token, minuti,
   pagine, immagini, secondi di video), costo reale, prezzo applicato e da quale regola
   viene, azienda, utente, chiave, esito.
6. **Interno = dichiarato**: un costo che paga la piattaforma ha un compito marcato
   `interno` e resta registrato con il suo costo, così si vede quanto spendiamo noi.
7. **Prima i dati, poi l'AI** (sezione 3).

## 3. Prima i dati, poi l'AI

Per ogni flusso, in quest'ordine:

1. azienda e permessi;
2. documento già elaborato? (impronta del file, idempotenza) → si riusa il risultato;
3. dati e collegamenti già presenti nel gestionale;
4. fonti strutturate (XML FatturaPA, CSV, file della banca);
5. testo del PDF quando c'è; OCR solo per le scansioni;
6. normalizzazione, parser, regole, calcoli;
7. ricerca delle corrispondenze e controllo di coerenza;
8. AI solo per quello che resta irrisolto, sulle sole pagine o campi necessari;
9. conferma automatica solo se i criteri espliciti sono soddisfatti;
10. eccezioni all'utente, con il perché;
11. aggiornamento dei moduli e traccia di ogni conseguenza.

**Estrarre un'informazione e confermare un collegamento sono due cose diverse.** L'AI
può leggere «commessa 25000068»; il sistema verifica che esista, sia dell'azienda e sia
compatibile prima di collegarla.

Un esempio già fatto e misurato: l'11/11 le 175 bolle di un cliente sono state abbinate
alle fatture **senza AI** — OCR locale, fornitore dalla P.IVA, numero e data confrontati
con i `DatiDDT` dell'XML, righe e importi presi dall'XML via `RiferimentoNumeroLinea`.
167 su 175 abbinate. È la forma che deve avere ogni flusso.

## 4. Esiti di una riconciliazione

| Esito | Cosa succede |
|---|---|
| Corrispondenza unica e verificata | Collegamento automatico, se la regola lo permette |
| Plausibile ma incompleta | Proposta da confermare |
| Più corrispondenze valide | L'utente sceglie fra alternative motivate |
| Riferimenti in conflitto | Niente collegamento, segnalazione del conflitto |
| Nessuna corrispondenza | Elemento da gestire, con i dati mancanti |

Niente punteggio unico che compensa: un conflitto su un identificativo essenziale
(P.IVA, numero d'ordine dello stesso fornitore) blocca, qualunque sia il resto. La
sicurezza dichiarata da un modello AI non è un criterio. Un numero di DDT o d'ordine
non è unico nel mondo: vale insieme a fornitore, anno, serie e data.

Ogni collegamento conserva: azienda, documenti e righe, quantità e importi allocati,
regola usata, prove, utente o processo, data, stato e storia. Gli stati «collegato»,
«verificato», «approvato per il pagamento» e «pagato» restano distinti.

## 5. Fasi e sessioni

Le aree si lavorano in parallelo, ognuna nel suo ramo e con il suo documento di
dettaglio (mappa dei flussi, matrice della §7.17 della richiesta, regole, test). Ogni
sessione parte dalla ricognizione di **quello che c'è già**: molto esiste
(riconciliazione ripartita in tesoreria, bolla ↔ più ordini, listini nei rapportini,
SAL da capo a fondo, abbinamento fatture ↔ commesse) e va esteso, non rifatto.

| # | Area | Documento di dettaglio | Dipende da |
|---|---|---|---|
| A | **Addebito AI** (sezioni 1–6 della richiesta, più §7.16) | `docs/ai-addebiti-censimento.md` | — |
| B | **Ciclo acquisti**: anagrafiche, ordine → DDT → fattura → commessa, ordinato/consegnato/fatturato, ripartizioni, magazzino (§7.4–7.8) | `docs/automazioni-acquisti.md` | — |
| C | **Tesoreria e controllo di gestione**: partite, pagamenti, acconti, previsioni senza doppi conteggi (§7.10, §7.15) | `docs/automazioni-tesoreria-cdg.md` | B per le fatture ricevute già collegate; lavora sulle partite esistenti |
| D | **Subappalti, rapportini, bollette, listini** (§7.9, §7.11, §7.12) | `docs/automazioni-subappalti-operativita.md` | — |

La sessione già aperta «Fatture, Scadenzario e Tesoreria: colonne e popup» resta
proprietaria delle **schermate** di Fatture emesse, Scadenzario e Dettaglio movimento:
la C lavora sul motore (regole, dati, funzioni SQL) e le passa i risultati da mostrare.

**Componenti comuni** (§7.2) — normalizzazione di P.IVA/CF, nomi e forme societarie,
date, importi e unità; risoluzione delle anagrafiche; traccia dei collegamenti — li
costruisce la B, che è la prima a servirsene. C e D usano quello che c'è già su
`main` e, quando la B pubblica i componenti nuovi, ci passano sopra.

**Ottimizzazione** (fase 6 della richiesta): ogni area riduce le chiamate AI nei suoi
flussi; la A tiene il conto (percentuale di lavori chiusi senza AI, costo medio,
chiamate per tipo) e lo mette dove il titolare lo vede.

## 6. Regole di lavoro comuni a tutte le sessioni

- Dati storici: ogni associazione massiva si fa **prima in anteprima** (cosa
  cambierebbe, quante righe), poi a lotti con `lock_timeout` e `statement_timeout`.
- Migrazioni secondo `CLAUDE.md`; tabelle esistenti si estendono, non si ricreano.
- Test con provider finti: nessuna chiamata a pagamento, nessun addebito reale,
  nessuna fattura emessa. Prove a video e scritture di prova solo su Demo Azienda 2.
- Nessun prezzo, ricarico o piano cambiato senza il titolare: le decisioni commerciali
  si scrivono come domande nel documento di dettaglio.
- Un flusso è chiuso quando il collegamento è giusto, le conseguenze (quantità
  residue, scadenze, magazzino, costi di commessa, cassa) sono coerenti e niente è
  contato due volte — non quando il documento è stato letto.

## 7. Decisioni commerciali aperte

1. **Ricarico per compito**: oggi 350% fisso nel router, 80–753% nelle chiamate dirette.
   Si unifica? Con quale regola?
2. **Errore dopo che il provider ha lavorato**: si addebita il costo reale o niente?
3. **Utilizzo incluso nel piano**: quante letture/chiamate/minuti include ogni piano,
   e cosa succede oltre (blocco, credito, avviso)?
4. **AI dei super admin** (`silvio_admin_chat`, `silvio_chief_of_staff`): resta a carico
   della piattaforma? (proposta: sì, dichiarata come interna)
5. **Demo e aziende illimitate**: restano a costo zero, ma con il consumo registrato.
