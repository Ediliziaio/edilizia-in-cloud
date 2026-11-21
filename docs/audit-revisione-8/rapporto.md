# Audit della Revisione 8 di Edilizia in Cloud

Baseline esaminata `45db324e3c4bcf224dbe9a479d8c10f4d16d6a9e`, presa da `origin/main` all’avvio dell’audit. Le correzioni sono nel worktree locale `codex/audit-revisione-8-20261120`.

## Esito

| Esito delle 89 schede EIC | Totale |
| --- | ---: |
| Confermato end-to-end | 0 |
| Confermato con prova circoscritta, corretto in locale | 84 |
| Riscontrato da revisione statica, da riprodurre | 0 |
| Già risolto sulla baseline nel perimetro provato | 5 |
| Smentito | 0 |
| Non conclusivo | 0 |
| **Totale EIC** | **89** |

Le cinque schede MIG sono state implementate e verificate in locale nel lotto 15. [Registro leggibile](registro.md) · [Registro strutturato con criteri di accettazione e riferimenti](registro.json)

Il secondo lotto ha corretto in locale la chiusura delle firme congiunte (EIC009), la conservazione dei backup (EIC031) e la conversione da DDT a fattura (EIC088). I lotti successivi hanno svolto il collaudo locale con autenticazione e PostgreSQL. [Prove sulle firme, sui backup e sulle fatture da DDT](prove/firme-backup-ddt.md)

## Ambiente e perimetro

- Repository GitHub `Ediliziaio/edilizia-in-cloud`. Il manuale è basato su `ac062935a`. I riferimenti sono stati riportati dove possibile ai file del commit dell’audit. Il worktree di lavoro originale contiene anche modifiche di altre sessioni e il confronto con la produzione è riferito al commit fissato. Durante il lavoro è entrato su `main` `c8fa44681` (PR #195). Il confronto dei 52 file di quel commit non ha rilevato sovrapposizioni con i file corretti o con i riferimenti del registro.
- Il frontend React, TypeScript e Vite usa React Query per query e mutazioni. PostgREST chiama le tabelle e le viste protette, e le RPC Postgres gestiscono le scritture condivise. Le Edge Functions Deno gestiscono stampa, firme, integrazioni e job. Storage conserva file documentali, foto, allegati e backup; i riferimenti risiedono nelle tabelle applicative.
- Il database locale di prova per la ricerca è PGlite con dati sintetici. Le suite di applicazione usano DOM simulato, archivio in memoria e rimpiazzi locali di PostgREST, Storage e Stripe. I test delle Edge Functions eseguono i gestori TypeScript con adattatori simulati. Email, SMS, firme, SDI e banche sono rimasti fuori da scritture o invii reali.
- Le query al database ospitato hanno letto soltanto metadati delle definizioni installate. Sono stati controllati, fra gli altri, i predicati sul calendario ferie, l’azienda per scheda, il costo SAL e le definizioni di prima nota, cespiti, mezzi e documenti. Per i SAL la vista ospitata filtra tramite `private.office_visible_order` e il gestore ora la interroga come utente. [Impronte delle funzioni](prove/metadati-funzioni-ospitate.json)
- Il check GitHub Cloudflare Pages del commit fissato è riuscito. Il dominio pubblico, interrogato durante l’audit, ha servito un bundle diverso da quello dell’URL immutabile abbinato al commit. Questo confronto attesta il deploy della baseline, lasciando aperta l’attribuzione esatta del bundle osservato sul dominio. I controlli GitHub della baseline, compreso il replay offline, sono riusciti. Supabase Preview segnalava versioni remote senza file corrispondenti. Il replay CI dimostra che la sequenza si applica, mentre EIC056 riguarda il comportamento della funzione finale. [CI della baseline](https://github.com/Ediliziaio/edilizia-in-cloud/actions/runs/44784136005)
- Le correzioni sono locali. Il secondo lotto include prove concorrenti su PostgreSQL locale. Il collaudo dei flussi autenticati in staging rimane aperto. Il lotto 8 ha applicato tutte le 6.177 migrazioni in uno stack Supabase nativo isolato e ha collaudato corsi, attività ricorrenti e checklist offline via browser autenticato. [Prove del lotto 8](prove/lotto-8-replay-e-browser.md)

## Correzioni verificate

| ID | Prima | Dopo e controllo |
| --- | --- | --- |
| EIC001 | La seconda applicazione manteneva quantità 9 ma riportava la quantità calcolata a 2 e rimuoveva la conferma. | Conserva quantità e verifica della fonte invariata. Una quantità della fonte cambiata richiede revisione esplicita. Il salvataggio protegge la versione letta. [Persistenza del piano](../../src/lib/orders/salvaPianoOperativoContratto.ts) |
| EIC002 | La selezione dalla commessa inoltrava il totale di 10 a un preflight che si aspettava 6. | Il residuo è visibile nelle righe parzialmente coperte e il chiamante passa 6 al preflight. Se la copertura cambia il preflight ferma la bozza. Il controllo di transazione del server resta il punto di scrittura. [Materiali per fase](../../src/hooks/useMaterialiPerFase.ts) |
| EIC003 | Il caricatore consegnava 1.000 associazioni su 1.205. | Associazioni, fasi e ricette usano il lettore paginato già impiegato per gli acquisti. La prova vede anche l’ultima riga e ferma il calcolo al fallimento della seconda pagina. [Caricamento risorse](../../src/hooks/usePianoRisorseComputo.ts) |
| EIC006 | L’IBAN con cifre di controllo alterate superava il controllo. | Si usa la validazione completa di `ibantools` per i conti italiani. Il campione valido, anche normalizzato, è accettato. Il modulo applica la regola a conto principale e conti aggiuntivi. [Validazione IBAN](../../src/lib/fatturazione/contiAzienda.ts) |
| EIC010 | L’endpoint rispondeva 200 con un percorso anche se il file o il collegamento non erano stati confermati. | Verifica upload e riga aggiornata. In caso di secondo passo non confermato il file può già esistere. Un nuovo tentativo usa lo stesso percorso. L’anteprima senza scrittura passa. [Archiviazione fiscale](../../supabase/functions/generate-native-pdf/index.ts) |
| EIC014 | Una rilettura riuscita senza ruoli lasciava attivo il ruolo della cache. | Il ruolo risolto e la cache sono azzerati. Il rinnovo non recupera l’accesso revocato. I casi di rete lenta continuano a funzionare. [Provider di autenticazione](../../src/contexts/AuthContext.tsx) |
| EIC015 | La lettura fallita dei permessi poteva attivare gli indicatori economici nel nuovo contesto. | L’errore chiude la visibilità e la riga assente dà permessi vuoti. La rilettura riuscita usa i permessi della seconda azienda. Vale anche per Visualizza come. [Lettura permessi](../../src/hooks/usePermissions.ts) |
| EIC040 | La lettura simulata fallita poteva aprire il portale Stripe dell’azienda del profilo. | La schermata dichiara l’azienda, il server la convalida e si ferma su errore o difformità. Il caso di disdetta per la seconda azienda completa la chiamata al provider simulato. [Portale abbonamenti](../../supabase/functions/customer-portal/index.ts) |
| EIC048 | Il gestore arrivava alla lettura privilegiata della commessa anche nel caso simulato escluso. | Consulta la vista protetta prima di leggere il verbale e richiede la modifica della commessa prima di preparare il link. I casi negati terminano con 403 e quello consentito prosegue. [PDF SAL](../../supabase/functions/generate-sal-pdf/index.ts) |
| EIC068 | Cercare Rossi restituiva zero con il cognome sul profilo collegato e nome libero vuoto. | I due filtri usano il profilo collegato prima di contare o paginare. Rimangono i filtri per azienda e cestino. La fixture SQL recupera le 20 righe attese della prima pagina. [Lettore elenco](../../src/lib/orders/listQuery.ts) · [Misura locale](prove/EIC068-ricerca-sql-sintetica.json) |
| EIC083 | Il primo import dinamico fallito restava in cache e impediva ogni retry nel caricatore. | Un nuovo tentativo ricarica il generatore. Gli invii ravvicinati condividono l’import in corso. Il rendiconto usa la stessa correzione. [Motore DDT](../../src/hooks/useShipmentDDTPDF.ts) |
| EIC085 | La data nativa non arrivava al file importabile. Una data testuale impossibile poteva essere accettata. | Il file XLSX sintetico produce due righe da 100 e 20 euro con la data identica. Il dialogo conta e segnala la riga esclusa. Le chiavi di deduplica rimangono stabili. [Import estratto conto](../../src/components/tesoreria/BankStatementImportDialog.tsx) |
| EIC089 | La vista mobile risultava verde dopo il solo collegamento a una bozza. | Desktop e mobile prendono la decisione dallo stato effettivo di fatturazione. Il test renderizza i rami per bozza, fattura emessa e collegamento assente. [Elenco fiscale](../../src/pages/azienda/fatturazione/DocumentiFiscaliList.tsx) |

La misura EIC068 è relativa alla sola query su 40.000 righe sintetiche con 30.000 commesse dell’azienda selezionata. La mediana di nove esecuzioni è passata da **16,5 a 44,2 ms** con l’aggiunta del profilo collegato. Il lettore conserva una richiesta per pagina. Restano da misurare la latenza browser/PostgREST e il piano con policy reali su staging. L’implementazione usa gli alias delle relazioni secondo il filtro PostgREST sulle relazioni incorporate. [Documentazione PostgREST](https://docs.postgrest.org/en/stable/references/api/resource_embedding.html#or-filtering-across-embedded-resources)

## Rilievi emersi durante l’audit

| Rilievo | Impatto e prova | Priorità e stato |
| --- | --- | --- |
| AUD001 · Generatore rendiconto bloccato dopo errore | Il caricatore gemello del DDT restava bloccato sulla promessa rifiutata. Stesso test su entrambi i caricatori, fallito prima e riuscito dopo. | P2, corretto in locale. [Rendiconto appalto](../../src/hooks/useRendicontoAppaltoPDF.ts) |
| AUD002 · Controlli di censimento da aggiornare | `permessiConLettore` conta tre riferimenti a etichette del registro modifiche come letture funzionali. `salSoloConPermesso` si aspetta una scrittura diretta di `CreateLavoroAppaltatore` assente dal sorgente. Quattro fallimenti nelle due suite di baseline, distinti dai test funzionali. | P2 per l’affidabilità dei controlli. Rivedere gli assert senza indebolire le vere verifiche di autorizzazione. [Permessi](../../src/test/logic/permessiConLettore.test.ts) · [Scritture SAL](../../src/test/logic/salSoloConPermesso.test.ts) |
| AUD003 · Conferma immotivata di allegato DDT | `uploadAndAttach` controlla l’errore di update, ma non se una riga sia stata aggiornata. Con una scrittura ignorata il sorgente passa comunque al messaggio «PDF salvato». | P2, evidenza statica. Riprodurre update senza righe e riprendere la verifica di EIC010 nel percorso DDT. [Upload DDT](../../src/hooks/useShipmentDDTPDF.ts) |

Le cause da cercare anche nei moduli adiacenti sono quattro. Le operazioni di coda, i salvataggi di file e i provider devono esporre un esito verificabile. Export e riepiloghi devono applicare paginazione e proiezione economica coerenti. I tentativi ripetuti devono usare la stessa identità operativa. Le operazioni privilegiate devono verificare la risorsa con il contesto dell’utente. I casi specifici e le condizioni di riproduzione sono nel registro.

## Piano residuo

Il [piano di completamento](piano-completamento.md) conserva il quadro di partenza delle 70 schede. Il [registro](registro.md) riporta l’esito aggiornato di ciascuna e la prossima verifica. Restano 6 schede da riprodurre o correggere. Il registro indica le verifiche ancora aperte sui singoli flussi.

Le stime sono giorni di lavoro indicativi per prove e correzioni del lotto. Dipendono dal numero di casi confermati e dalle configurazioni effettive. Le verifiche ancora aperte hanno un’azione esplicita in ciascuna riga del registro.

| Ordine | Lotto | Stima | Dipendenze e criterio di rilascio |
| --- | --- | --- | --- |
| 1 | Accessi, firme, file originali, backup e checklist offline | 6–10 giorni | Due account a perimetri distinti, firme sandbox e archivi sintetici. Rettifiche e revoche sono tracciate, gli hash dei file firmati restano validi e il backup passa un ripristino isolato anche dopo un tentativo interrotto. |
| 2 | Fatture e DDT, rate, acquisti, prima nota e saldo | 7–12 giorni | Replay Postgres e fixture di contabilità e magazzino. Due scritture intercalate e una risposta persa non duplicano risorse. Gli importi previsti, incassati e persistiti coincidono con UI, esportazioni e giornale. |
| 3 | Concorrenza cantiere, seriali, mezzi, listini, ferie e pianificazione | 6–10 giorni | Verifica dei protocolli legacy e attuali. Prove mirate dopo replay della base e fixture con due sessioni, incluse rettifica, retry e storico. |
| 4 | Code, Silvio, notifiche, calendario, telefonia e invii | 6–11 giorni | Provider simulati o sandbox. Contabilizzare lo stato terminale, gestire l’ultima pagina, misurare errori definitivi e assicurare un solo effetto per operazione. Decidere la distinzione esplicita fra test sintattico e connessione verificata. |
| 5 | Liste, margini, export, allegati e UX residue | 4–7 giorni | Correttezza di filtro/selezione e dati completi prima di generare PDF o margini. Verifica separata dei tempi di query, browser e permessi con dati sintetici. |
| 6 | Migliorie di prodotto MIG001–MIG005 | 13–21 giorni | Le stime per proposta e le relative decisioni sono nel registro. Servono regole esplicite per retry, cestino, identità degli allegati, budget zero e workflow rimborsi. |

Il rilascio dei lotti richiede riesecuzione con il `main` corrente e confronto fra migrazioni del repo e registro remoto. Accompagnare le correzioni dei dati storici con un elenco verificato delle righe interessate, anteprima, prova di recupero e confronto dei totali. Dopo ogni rilascio misurare errori del flusso, differenze dei saldi, code residue e tempi rispetto alla baseline del lotto.

## Risultati tecnici dei lotti locali

Dopo il lotto 8 il registro riporta 56 correzioni locali, 5 casi già funzionanti nel perimetro provato e 28 schede aperte. Il lotto 7 è allineato a `094bbafef` e riguarda annullamento saldo, listini, attrezzature, richieste d’offerta e SAL. [Primi controlli](prove/controlli.md) · [Firme, backup e DDT](prove/firme-backup-ddt.md) · [Lotti 3–6](prove/lotti-3-6.md) · [Prove del lotto 7](prove/lotto-7-pagamenti-listini-concorrenza.md)

Il lotto 8 corregge nove schede e ripete cinque prove già circoscritte su PostgreSQL e Auth locali. [Prove e ambiente del lotto 8](prove/lotto-8-replay-e-browser.md)

Il lotto 9 porta il totale a 62 correzioni locali. Sono stati verificati revoche dei rapportini, calendario ferie, firma delle varianti, diagnostica delle integrazioni e ricerca numeri telefonici. Il database locale comprende 6.183 migrazioni. [Prove del lotto 9](prove/lotto-9-revoche-calendario-integrazioni.md)

Il lotto 10 verifica incassi e rate e aggiunge l’anteprima di revoca. Sono 63 le correzioni locali. Il database di collaudo comprende 6.186 migrazioni. [Prove del lotto 10](prove/lotto-10-rate-e-anteprima-annullo.md)

Il lotto 11 porta il totale a 66 correzioni locali. Verificati i piani senza contratto, il conteggio delle notifiche e i ticket lunghi. [Prove del lotto 11](prove/lotto-11-manutenzione-notifiche-ticket.md)

Il lotto 12 porta il totale a 71 correzioni locali. Verificati il recupero delle campagne oltre 200 destinatari, l’accredito SMS, la riapertura degli allegati, le letture concorrenti dei contatori dei mezzi e la revoca selettiva degli accessi Campo. Eliminati i tre errori ESLint del dettaglio ticket. [Prove del lotto 12](prove/lotto-12-campagne-ricariche-ticket.md)

Il lotto 13 ha collaudato il confronto economico con un anno indisponibile, il riparto dei costi comuni, l’IVA del prezzo manuale nei PDF, il recupero della copia di una bozza fiscale, il collegamento tra appuntamenti e ticket, la copia dei modelli di onboarding e la ripresa delle timbrature dopo un cambio luogo. [Prove del lotto 13](prove/lotto-13-confronti-iva-copie.md)

Il lotto 14 ha verificato le sei schede restanti. Il registro conta 84 correzioni locali, cinque casi già risolti nel perimetro della prova e zero schede EIC aperte. [Prove del lotto 14](prove/lotto-14-chiusura-audit.md)

Il lotto 15 ha completato le cinque proposte e risolto gli avvisi ESLint emersi nel lotto precedente. [Prove del lotto 15](prove/lotto-15-miglioramenti.md)
