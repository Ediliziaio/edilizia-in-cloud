# Piano — Condizioni contrattuali: pagine, PDF, esempi

**Stato (9 novembre 2026):** lotti 1, 2, 3, 4, 6, 8 fatti; lotto 7 fatto per il subappalto. Restano: lotto 5 (fissare le condizioni dei preventivi all'invio, serve una migrazione), gli ordini che leggono il modello (hanno solo il piè), manutenzione e contratti di lavoro (non stampano ancora), lotto 9.
**Cambiato rispetto al piano:** il piè con i dati societari è centrato e sta su tutte le pagine di tutti i documenti (copertine e fattura escluse), non solo sui fogli delle condizioni.
**Base dell'analisi:** `origin/main` a `221befbaa` e letture SQL sul database di produzione.
La cartella locale è su un `main` divergente (35 commit suoi, 345 di origin) e non contiene l'archivio delle condizioni.

Le affermazioni sono marcate così:
**[V]** verificato nel codice o nel database · **[I]** ipotesi, da controllare nel lotto indicato.

---

## 1. In breve

1. **Le due pagine non sono collegate.** Scrivono su tabelle diverse e nessuna legge l'altra.
2. **«Piano dei lavori · Preventivo» viene dall'anteprima**, che disegna qualunque modello come se fosse un preventivo.
   Il tipo scelto in alto non cambia il foglio.
3. **Il difetto più grave non si vede nell'anteprima.** Solo 3 tipi su 8 leggono davvero il modello: preventivo, contratto col committente, fattura.
   Un modello «Lavori extra e varianti» oggi non finisce su nessuna variante.
4. **Il contratto col committente non ha un PDF.** Si scarica solo in `.md`. L'anteprima mostra un documento che non esiste.
5. **Il capitale sociale ha già il suo campo**, ma è compilato solo per 2 aziende. Il REA per 3 o 4.

Proposta: un **foglio condizioni unico** (solo testo delle clausole e piè di pagina con i dati societari), prima nell'anteprima e poi nei documenti veri, a lotti.

---

## 2. Domanda 1 — Le due pagine sono collegate?

**No.** Sono due archivi distinti, con permessi distinti. **[V]**

| | Modelli PDF `…/modelli-pdf?modello=richiesta` | Contratti e condizioni `…/contratti-e-condizioni` |
|---|---|---|
| A cosa serve | L'aspetto dei documenti operativi: titolo, colori, margini, logo, testi | Il testo delle clausole, per tipo di documento |
| Dove scrive | `company_document_templates.config` | `condizioni_modelli`, `condizioni_clausole`, `condizioni_modelli_versioni` |
| Documenti | Ordine materiali, richiesta offerta, servizi, trasporti, economia, rapportino, fine lavori | 8 tipi (vedi §4) |
| Chi stampa | `src/lib/documentiOperativi/pdf.ts` (jsPDF) | Solo preventivi, contratto, fattura |
| Permesso | `canViewSettingsOrders` | `canViewCondizioni` |

**Dove si pestano i piedi** **[V]**

- La pagina Contratti e condizioni dichiara che il tipo «Ordini e richieste d'offerta» esce negli ordini. **Non è vero:** nessun codice legge quel tipo.
- Su una richiesta d'offerta vince, in ordine: la condizione scritta sul documento → il campo «Condizioni predefinite» di Modelli PDF → il testo fisso in `condizioniDocumento`.
  Il modello dell'archivio non entra mai.
- Quel campo «Condizioni predefinite» è **vuoto in tutte le 8 righe** di `company_document_templates`: toglierlo non perde niente.
- L'ottava scheda di Modelli PDF si chiama anch'essa «Contratti e condizioni» (`?modello=contratti`), ma scrive su un terzo posto: `quote_templates`. L'archivio ne può fare solo una copia una tantum con «Portali nell'archivio».

**Chi deve vincere dopo:** Modelli PDF decide *come appare* un documento operativo; Contratti e condizioni decide *cosa dicono le clausole*. Un testo solo per tipo, in un posto solo. Vedi lotti 7 e 9.

---

## 3. Da dove arriva quello che vedi nell'anteprima

Tutto da due file. **[V]**

| Cosa si vede | Da dove viene |
|---|---|
| «DEMO AZIENDA 2 S.R.L.» in alto a sinistra (o il logo) | `Intestazione`, `DocumentoEdilePDF.tsx:342` |
| «PIANO DEI LAVORI · PREVENTIVO» | Stessa funzione: testo fisso + `modulo.etichetta`. L'anteprima passa sempre `etichetta: "Preventivo"` (`anteprimaPdf.tsx:50`) |
| «PREVENTIVO N. PRV-2026-001 · data» | Stessa funzione, numero d'esempio fisso (`anteprimaPdf.tsx:22`) |
| «ALLEGATO» e «Condizioni *contrattuali*.» | `DocumentoEdilePDF.tsx:1929-1930`, corpo 21 |
| Pagina «ACCETTAZIONE PROPOSTA», con «Preventivo PRV-…» | `paginaAccettazione`, stesso file |
| Piè di pagina: nome e «emesso tramite EdiliziaInCloud · Domus Group S.r.l.» | `PieDiPagina`. P.IVA e recapiti escono solo con `show_footer_legal === true`, che l'anteprima non imposta |

`anteprimaCondizioniUrl` riceve anche il tipo di documento (`ambito`), ma non lo usa. Per questo varianti e contratto escono uguali.

**Cosa si cambia una volta sola:** `anteprimaPdf.tsx` e una nuova funzione di `DocumentoEdilePDF` (il foglio del §5). La stessa funzione serve 8 preventivatori edili, l'anteprima e il bot del bagno.

---

## 4. Cosa esce davvero, tipo per tipo

| Tipo (`ambito`) | Documento vero oggi | Legge il modello? | Intestazione vera | Piè di pagina vero |
|---|---|---|---|---|
| `preventivo` — 8 edili | `DocumentoEdilePDF` | **Sì** [V] | Piano dei lavori · modulo, titolo grande | Nome; legale solo con l'opzione |
| `preventivo` — classico | Stesso componente, stile `sobrio`, via `generate-quote-pdf` | **Sì** [V] | Titolino piccolo, «PREVENTIVO N.» | Come sopra |
| `preventivo` — serramenti | `SerramentoPDF` | **Sì** [V] | Sua | REA e capitale, ma opzionali |
| `preventivo` — fotovoltaico | `fvHtmlTemplate` | **Sì** [V] | Sua | Sua |
| `appalto` | `contratti_documents.contenuto_md`: **solo «Scarica .md», nessun PDF** (3 righe, tutte bozze) | **Sì**, in coda al testo [V] | — | — |
| `commessa` (varianti) | `variationPreviewPdf.ts`, jsPDF | **No** [V] — 4 frasi fisse + note del documento | Logo, dati, fascia colorata | Nome e «Proposta non firmata» |
| `subappalto` | `ContrattoSubappaltoPDF` | **No** [V] — usa `subappalto_modello_contratto` | Logo o nome | Nome, numero, commessa |
| `acquisto` | `documentiOperativi/pdf.ts` | **No** [V] | Da Modelli PDF | `footerAzienda`: tutto tranne REA e capitale |
| `fattura` | `generate-native-pdf` | **Sì**, solo da «Crea fattura» in commessa [V] | Logo | REA e capitale già presenti |
| `manutenzione` | Nessun PDF trovato che legga il tipo [V]; se esista un contratto di manutenzione **[I]** | **No** [V] | — | — |
| `lavoro` | Come sopra **[I]** | **No** [V] | — | — |

---

## 5. Layout proposto: il foglio condizioni

**Una sola impaginazione, uguale per tutti i tipi e tutte le aziende.**

```
(in alto: niente)

Modalità di pagamento                      ← titolo clausola, grassetto normale
Il corrispettivo è dovuto secondo…

Garanzia sulle opere
Le opere sono garantite…

──────────────────────────────────────────────
Demo Azienda 2 S.r.l. · Sede legale Via dei Cantieri 24, 20099 Sesto San Giovanni (MI)
P.IVA 99999999999 · C.F. 99999999999 · REA MI-… · Capitale sociale versato € … · PEC …
                                                        Pag. 1 / 2
```

- **Via:** logo, nome in alto, «Piano dei lavori · …», numero preventivo, barra colorata, «ALLEGATO», titolo grande, «emesso tramite EdiliziaInCloud».
- **Restano:** i titoli delle singole clausole, un solo carattere e un solo corpo, il numero di pagina.
- **Non cambia:** il blocco di firma e la seconda firma dell'art. 1341 c.c. nei documenti che si firmano. Nell'anteprima del modello non serve la pagina «Accettazione», che parla di un preventivo: la si toglie lì.
- **Da conservare:** l'ancora `edileSectionDestination("condizioni")` dell'indice, spostata sul primo blocco.
- **Filtri:** il testo passa già da `testoPerPdf`; solo WinAnsi; `paddingBottom` ≥ 90 per il piè (trappole di react-pdf già pagate il 20/09).

**Vincolo tecnico** **[V]**: nel preventivo classico le condizioni scorrono nella stessa `<Page>` del resto (`unFlussoSolo`). Lì l'intestazione è fissa per tutto il documento e non si può togliere solo alle condizioni. Il classico è già sobrio: cambia soltanto il piè.

### Dati del piè di pagina

Un'unica funzione pura, `righeSocietarie()`, in `_shared/datiSocietari.ts`: quel modulo esiste già e viene usato sia dal browser sia dal server. **[V]**

| Dato | Colonna | Stato |
|---|---|---|
| Ragione sociale | `companies.business_name`, poi `name` | C'è |
| Sede legale | `companies.legal_address / postal_code / city / province` | C'è |
| P.IVA | `companies.vat_number` | 32 aziende su 45; 0 discordanze con l'anagrafica |
| Codice fiscale | `companies.fiscal_code` | C'è |
| PEC | `anagrafica_azienda.pec`, poi `companies.pec` | 15 su 45. **Una discordanza: proprio Demo 2** |
| REA numero | `anagrafica_azienda.codice_rea`, poi `companies.numero_rea` | 3 e 4 aziende: **quasi vuoto** |
| Ufficio REA | `anagrafica_azienda.rea_ufficio` | Quasi vuoto |
| Capitale sociale | **solo** `anagrafica_azienda.capitale_sociale` | **2 aziende** |
| Socio unico, liquidazione | `anagrafica_azienda.socio_unico`, `stato_liquidazione` | Campo c'è; si stampa solo se serve |

**Non manca nessuna colonna: mancano i dati.** Non serve alcuna migrazione. **[V]**

- 38 aziende attive su 45 non hanno la riga in `anagrafica_azienda`. Il piè deve funzionare anche solo con `companies` e saltare ciò che non c'è: mai «REA —».
- Non usare `patrimonio_netto.capitale_sociale`: è un dato contabile.
- L'art. 2250 c.c. chiede questi dati negli atti e nella corrispondenza delle società: `iscrizioneRea` e `datiReaMancanti` esistono già e vanno riusate. Sulla pagina, un avviso: «Per le S.r.l. mancano REA e capitale» con il link a Impostazioni → Fatturazione → Dati Fiscali.
- `anagrafica_azienda` ha la regola `permessi_solo_ufficio`: chi non è d'ufficio potrebbe generare un PDF senza capitale. **[I]**, da provare nel lotto 1. Se è così, serve una lettura dedicata dei soli dati societari.
- `costruisciDatiEdile` ha 15 chiamanti: i dati vanno caricati in un punto solo, non in ognuno. **[V]**

---

## 6. Pagina più semplice

Il termine dettato è ambiguo: lo leggo come «più semplice» (domanda D1).

**Elenco (`SettingsCondizioni.tsx`)**

- Una riga per tipo di documento: nome · modello in uso (tendina) · stato · Modifica. «+ Modello» resta sulla riga.
- Gli altri modelli dello stesso tipo si aprono solo su richiesta.
- Via le due righe di spiegazione in alto e la frase lunga sotto ogni tipo: un tooltip «?».
- La banda ambra diventa lo stato di ogni riga, e dice la verità:
  - «In uso sui documenti»
  - «Modello pronto, ma il documento non lo legge ancora» (per i tipi non collegati, finché non arriva il loro lotto)
  - «Nessun modello»
- L'anteprima a destra resta.
- Il riquadro «Le condizioni che hai già» resta, chiuso in una riga.

**Editor (`SettingsCondizioniModello.tsx`)**

- Via dalla barra «Dimensione» e «Carattere»: il foglio è uguale per tutti e il PDF decide da solo. `RichTextEditor` oggi li mostra sempre: serve una proprietà nuova per nasconderli.
- I titoli restano; grassetto, corsivo ed elenchi pure.
- Il testo sotto la barra si accorcia a una riga.

**Modelli PDF:** vedi lotto 9.

---

## 7. Simulazioni

Si fanno in vitest generando il PDF vero, leggendone il testo, più un'immagine per pagina da guardare a occhio (`pdfseparate` + `sips`, non `pdftoppm`).
Il **modello** è quello di Demo Azienda 2 descritto al §8.

### Per tipo

| # | Tipo | Modello applicato | Deve uscire | Non deve uscire | Stato a fine piano |
|---|---|---|---|---|---|
| 1 | Preventivo edile | Condizioni e termini legali (predefinito) | Clausole, piè societario, firma con 1341 | Logo e titolo grande sui fogli condizioni | Lotto 4 |
| 2 | Preventivo classico | Lo stesso | Come oggi, con il piè nuovo | — | Lotto 4 |
| 3 | Preventivo serramenti | Lo stesso | Clausole, piè nuovo | Doppio piè | Lotto 4 |
| 4 | Preventivo FV | Lo stesso | Clausole, piè nuovo | Doppio piè | Lotto 4 |
| 5 | Contratto col committente | Appalto privato 2026 | Contratto + «Condizioni generali dell'impresa», piè societario | «Preventivo», «Piano dei lavori» | Lotto 8 (D4) |
| 6 | Lavori extra e varianti | Esempio · Varianti | Dati della variante, poi le clausole del modello, firme, piè | «Piano dei lavori» | Lotto 6 |
| 7 | Subappalto | Esempio · Subappalto | Articoli del contratto, piè societario | — | Lotto 7 |
| 8 | Ordine materiali | Esempio · Ordini | Istruzioni operative + clausole, piè con REA e capitale | Doppie condizioni | Lotto 7 |
| 9 | Richiesta d'offerta | Lo stesso | **Sempre** «rispondete lasciando il riferimento» | Perdita delle istruzioni di risposta | Lotto 7 |
| 10 | Ordine servizi | Lo stesso | Come 8 | — | Lotto 7 |
| 11 | Fattura | Condizioni in fattura 2026 | Clausola in causale, grafica fiscale invariata | Foglio condizioni: **la fattura non si tocca** | Già così |
| 12 | Manutenzione | Esempio · Manutenzione | Foglio condizioni, in anteprima | — | Lotto 8 |
| 13 | Contratti di lavoro | Esempio · Lavoro | Foglio condizioni, in anteprima | — | Lotto 8 |
| 14 | Trasporti, economia, rapportino, fine lavori | Nessuno: fuori dall'archivio per scelta del 07/11 | Come oggi | — | — |

### Casi limite

| # | Caso | Atteso |
|---|---|---|
| 15 | Bozza con modello associato e predefinito diverso | Vince l'associato |
| 16 | Documento con testo riscritto per il cliente | Vince il testo del documento |
| 17 | Preventivo inviato, modello cambiato dopo | Resta il testo inviato (oggi **non garantito**, vedi §9) |
| 18 | Nessun modello per quel tipo | Testo di sistema, o niente; lo stato lo dice |
| 19 | Clausola «da approvare a parte» | Seconda firma presente |
| 20 | Contratto importato da 30 pagine (Renova, Dimora) in Markdown | Stesse righe di prima, con il solo piè diverso |
| 21 | Ditta individuale senza capitale | Nessun campo vuoto, nessun avviso |
| 22 | S.r.l. senza REA | PDF senza quella voce, avviso sulla pagina |
| 23 | Ragione sociale lunghissima | Il piè va a capo senza sovrapporsi al testo |
| 24 | Azienda senza riga in `anagrafica_azienda` | Piè da `companies` |
| 25 | Utente non d'ufficio genera un PDF | Stesso piè di un amministratore |

---

## 8. Esempi su Demo Azienda 2 (`d2000000-0000-4000-a000-000000000002`)

Oggi ha: `appalto` 1 (predefinito), `fattura` 1 (predefinito), `preventivo` 9 (1 predefinito e 7 copie «Prova — …»). **[V]**
L'indice unico consente un solo predefinito per tipo: gli esistenti non si toccano.

| Tipo | Azione | Nome | Clausole |
|---|---|---|---|
| Preventivi | Niente | Condizioni e termini legali | Già presente |
| Contratto committente | Niente | Appalto privato 2026 | Già presenti, 3 |
| Fatture | Niente | Condizioni in fattura 2026 | Già presente |
| Lavori extra | **Nuovo**, predefinito | Esempio · Varianti e lavori extra | Oggetto ed efficacia; prezzo e pagamento; tempi aggiuntivi; opere non comprese |
| Subappaltatori | **Nuovo**, predefinito | Esempio · Subappalto | Divieto di ulteriore subappalto (a parte); sicurezza e DURC; pagamenti; danni; foro (a parte) |
| Ordini e offerte | **Nuovo**, predefinito | Esempio · Ordini ai fornitori | Conferma d'ordine; consegna e DDT; pagamento; difetti e resi |
| Manutenzione | **Nuovo**, predefinito | Esempio · Manutenzione | Oggetto e canone; interventi compresi; durata e disdetta; esclusioni |
| Contratti di lavoro | **Nuovo**, predefinito | Esempio · Rapporto di lavoro | Mansione e sede; orario; riservatezza; rinvio al CCNL |

Inoltre, valori **fittizi** su `anagrafica_azienda` di Demo 2, così il piè è completo: `codice_rea`, `rea_ufficio` MI, `capitale_sociale` 10.000. Oggi sono vuoti. La PEC va allineata tra le due tabelle.

- **Come:** scrittura dati mirata, `insert … where not exists`, una transazione, con `lock_timeout`. **Non è una migrazione:** nessun file in `supabase/migrations/`.
- **Serve il via esplicito di Florin.**
- I testi sono esempi da demo, non pareri legali. Quelli di lavoro e subappalto vanno riletti da un consulente prima di usarli altrove.

---

## 9. Rischi

| Rischio | Stato | Come si tiene |
|---|---|---|
| **Le condizioni non si fissano all'invio.** `daCongelare` non ha chiamanti, `condizioni_origine` lo scrive solo il contratto, il trigger `20281222110000` non è sul database né nel repository. Un preventivo partito senza versione fissata salta l'archivio e torna al testo del modulo o di sistema: il PDF rigenerato può dire altro dalla bozza. | **[V]** per il codice; quanti documenti siano toccati **[I]** | Lotto 5, prima di collegare altri tipi. I 4 clienti associati il 07/11 hanno testi identici (md5), gli altri no |
| PDF già spediti o firmati | Salvati a parte: non cambiano. Varianti con `document_hash` e `approved_document_hash` **[V]** | Mai rigenerare un PDF archiviato; un test lo controlla |
| Un preventivo rigenerato dopo cambia aspetto (non testo) | Atteso | Annunciarlo. Il piè usa i dati di oggi |
| Firma e art. 1341 | `condizioniDelPreventivoTuttiIPreventivatori.test.ts` è la guardia **[V]** | Non toccare `paginaAccettazione` nei documenti che si firmano |
| Test che aspettano il vecchio foglio | `condizioniAnteprimaPdf.test.tsx` cerca «Condizioni contrattuali» e «ACCETTAZIONE PROPOSTA» **[V]** | Si aggiornano nel lotto 1, dichiarandolo |
| Pacchetti precompilati | `bgn-genera-pdf/_render.mjs` e `_shared/preventivoRenderer.mjs` non si aggiornano da soli **[V]** | Lotto 4: `node scripts/bgn-render/build.mjs` e `node scripts/preventivi-render/build.mjs`, committarli, toccare `index.ts` delle funzioni |
| Istruzioni operative degli ordini scambiate per clausole | `condizioniDocumento` contiene «rispondete a questa email»: l'abbinamento della risposta dipende da quel riferimento **[V]** | Le istruzioni restano; le clausole si aggiungono sotto |
| Dati societari quasi vuoti | **[V]** | Avviso sulla pagina; nessuna compilazione automatica |
| Cartella condivisa | Altre sessioni e `main` locale divergente **[V]** | Lavorare in una worktree da `origin/main`; niente stash |
| Variante a jsPDF, resto a react-pdf | **[V]** | `righeSocietarie` comune; test di testo uguale per entrambi |

---

## 10. Lotti

Ogni lotto si prova e si pubblica da solo. **Fermarsi a quelli che servono.**

| # | Cosa | File principali | Si verifica con | Tocca il DB? |
|---|---|---|---|---|
| **1** | **Foglio condizioni nell'anteprima**, per tutti i tipi; `righeSocietarie`; carico dei dati societari. Risponde ai punti 3, 5 e 7 di Florin | `anteprimaPdf.tsx`, `DocumentoEdilePDF.tsx`, `_shared/datiSocietari.ts` | Simulazioni 21-24 e immagini di 8 tipi; nessun documento vero cambia | No |
| **2** | **Pagina più semplice**, con stato onesto per tipo e avviso REA/capitale | `SettingsCondizioni*.tsx`, `rich-text-editor.tsx` | Test pagina; prova con Demo 2 | No |
| **3** | **Esempi su Demo 2** e dati societari fittizi | Solo dati (§8) | Conteggio per tipo; anteprima di ognuno | Sì, dati, **col via** |
| **4** | Foglio nei **preventivi veri**: 8 edili con pagine proprie, piè su classico, serramenti, FV; pacchetti rigenerati | `DocumentoEdilePDF`, `SerramentoPDF`, `fvHtmlTemplate`, 2 bundle | Simulazioni 1-4, 19, 20; contratti veri di Renova e Dimora riga per riga | No |
| **5** | **Fissare le condizioni all'invio** (`condizioni_origine`) | Da decidere se trigger o codice all'invio; rileggere `20281222110000` | Simulazione 17; provato in transazione annullata | Sì, **col via** |
| **6** | **Varianti collegate** al tipo `commessa`, copia sul documento, piè societario; anteprima col generatore vero (`variationTemplateExamplePdf`) | `variationPreviewPdf.ts`, `OdVSection`, `variationDraft.ts` | Simulazione 6; le 7 varianti archiviate restano uguali | Forse (colonna testo) |
| **7** | **Subappalto e ordini collegati** | `ContrattoSubappaltoPDF`, `documentiOperativi/pdf.ts` | Simulazioni 7-10 | No |
| **8** | **PDF del contratto col committente**, manutenzione, lavoro | Da definire dopo D4 e D5 | Simulazioni 5, 12, 13 | Forse |
| **9** | **Riordino Modelli PDF:** via la scheda «Contratti e condizioni» (un link) e il campo «Condizioni predefinite» (vuoto ovunque) | `SettingsModelliPdf.tsx` e test collegati | `?modello=contratti` porta alla pagina giusta | No |

Ordine consigliato: **1 → 3 → 2**, così Florin vede subito il risultato; poi 4, 5, 6 e il resto.

---

## 11. Domande per Florin

| # | Domanda | Consiglio |
|---|---|---|
| **D1** | «Più lasca» vuol dire «più semplice», o più spazio tra le righe del PDF? | Più semplice |
| **D2** | Via anche «Piano dei lavori» dalle **pagine commerciali** dei preventivi edili, o solo dai fogli condizioni? | Solo dai fogli condizioni: quel nome l'avevi scelto il 20/09 |
| **D3** | Il logo va via solo dai fogli condizioni, o anche dalla prima pagina di varianti, subappalti e ordini? | Solo dai fogli condizioni |
| **D4** | Il contratto col committente deve avere un PDF vero? Oggi si scarica solo il `.md` | Sì, con questo stesso foglio |
| **D5** | Manutenzione e contratti di lavoro servono ora? | Tenerli solo come modello, per il momento |
| **D6** | «Pag. 1 / 2» resta nel piè, o «solo i dati» significa togliere anche quello? | Resta: in un contratto serve |
| **D7** | Nel piè anche telefono ed email, o solo i dati societari? | Solo societari, PEC compresa |
| **D8** | Il lotto 3 può scrivere su Demo 2, compresi REA e capitale fittizi? Le 7 copie «Prova — …» restano? | Sì; restano: documentano le prove del 07/11 |

---

## 12. Verificato e ipotesi

**Verificato [V]**

- Tabelle, indirizzi, permessi e colonne delle due pagine.
- Origine di intestazione, titolo e piè nell'anteprima.
- Quali tipi hanno un lettore: `useCondizioniDocumento` (solo fattura), `caricaArchivioDelDocumento` (preventivi), `genera-contratto-ai` (appalto).
- Assenza di PDF per `contratti_documents`.
- Dati: conteggi di §2, §5 e §8; nessun trigger di congelamento; registro senza `20281222110000`.
- Il file `20281222110000` non è né su `origin/main` né nella cartella locale.

**Ipotesi [I]**

- Che esistano contratti di manutenzione o di lavoro stampati altrove con testi propri.
- Quanti preventivi già partiti stampino oggi un testo diverso dalla bozza.
- Che la regola `permessi_solo_ufficio` tolga i dati societari agli utenti di campo.
- Che Florin intendesse l'anteprima e non anche un PDF vero: su una variante vera «Piano dei lavori» non compare, secondo il codice. Non ho aperto schermate dal vivo.
- Che i font scritti in passato nell'editor (span con carattere e dimensione) vengano ignorati dal PDF: da controllare nel lotto 2.
