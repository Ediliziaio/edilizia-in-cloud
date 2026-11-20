# Collaudo fotovoltaico · 20 novembre 2026

## 📊 BASELINE vs FINALE

| Metrica | Prima | Dopo |
|---|---|---|
| Errori TypeScript nell'ambito modificato | 0 nel controllo iniziale ristretto | 0, inclusi i nuovi test e le dipendenze del wizard |
| Controllo TypeScript completo | Non misurato sul codice base | PASS nel controllo completo locale e in CI; zero errori alla soglia zero |
| Lint wizard | 11 errori e 2 warning | 10 errori e 2 warning residui preesistenti nel wizard dopo la rimozione della vista duplicata; nuove superfici senza errori lint |
| Warning build | Non misurati in build base | Avvisi Rollup su chunk/import dinamici e annotazioni di dipendenze, documentati nel log locale |
| Vulnerabilità dipendenze | Nessuna dipendenza modificata | `bun audit --json`: nessuna vulnerabilità segnalata |
| File rimossi | — | 0 |
| Bundle gzip | Non misurato | Compilazione finale riuscita, dimensioni nei log locali; nessun confronto numerico inventato |
| Lighthouse Performance | — | Non misurato |
| Lighthouse A11Y | — | Non misurato |

## 🗑️ RIMOSSO

| Tipo | Path esatto | Motivo |
|---|---|---|
| — | — | Nessun file o dato esistente rimosso |

## 🔒 SECURITY FIX

| Problema | Severità | Fix |
|---|---|---|
| Nuove fonti documentali sensibili | Alta | Bucket privato, JWT/RLS/visibilità staff e progetto, edit permission prima dell'AI, hash del contenuto e limiti di formato/dimensione |
| Policy Storage permissive preesistenti | Alta | Guard restrittivi del nuovo bucket, provati con policy ampie già presenti |
| Riferimenti a file di progetti nascosti | Alta | Trigger valida la provenienza e consente solo le copie autorizzate |
| Prezzi e dati nuovi modificabili dopo emissione | Media | Protezione dei nuovi progetti emessi e delle righe collegate; copia in bozza per modificarli |
| Testo documentale non fidato | Media | Solo estrazione dati; nessuna esecuzione di istruzioni; risposta strutturata validata prima della revisione |

Le protezioni SQL sono state applicate in produzione via MCP il 20 novembre 2026, con immediato allineamento del registro alla versione `20290430140000`. Gli advisor precedenti alla modifica segnalano debito di sicurezza preesistente su oggetti esterni all'ambito FV; non è stato alterato con questa attività.

## 🐛 BUG CORRETTI

| Problema | File:Riga | Root cause | Fix applicato |
|---|---|---|---|
| Spesa totale usata come risparmio unitario | `supabase/functions/_shared/fvBollette.ts` | Quote fisse e importi particolari confusi con acquisti evitabili | Importi distinti e conferma dei costi proporzionali |
| Consumi ripetuti o mescolati fra forniture | `supabase/functions/_shared/fvBollette.ts` | Storico annuo, periodi e POD senza regola di aggregazione | Fonte unica, periodi compatibili, POD selezionato e correzioni per POD |
| Perdite batteria conteggiate come energia immessa | `supabase/functions/_shared/fvSimulazioneEnergetica.ts` | Differenza fra produzione e autoconsumo usata integralmente come export | Bilancio orario con perdite e residuo distinti |
| Divergenza fra scenario, finanza e PDF aziendale | `supabase/functions/_shared/fvHtmlTemplate.ts` | Percorso del documento ricostruiva consumi e flussi annuali | Stesso motore orario, inclusi consumi futuri e accumulo |
| Conteggio del tetto non collegato al modulo reale | `src/components/fotovoltaico/FvScenariEnergia.tsx` | Capacità teorica e quantità commerciali separate | Conteggio dalla posa fisica e aggiornamento dei soli campi dello scenario |

Il controllo globale dei conflitti ha rilevato nella prima versione della RPC il codice serializzabile `40001`, che induce PostgREST a riprovare un salvataggio già rifiutato per versione obsoleta. La migrazione della PR è stata corretta per restituire `PT409`, già riconosciuto dal client, e il test verifica che il dato del collega rimanga invariato. Dopo il verde del commit corretto si riapplica la migrazione idempotente e si riconcilia unicamente la sua voce nel registro, prima del merge.

## ♿ ACCESSIBILITÀ

| Problema | Fix |
|---|---|
| Origine della bolletta dentro un'etichetta non azionabile correttamente | Etichetta associata al campo e pulsante pagina separato |
| Vertici piccoli sulla mappa | Alternative numeriche Est/Nord e spostamento da tastiera |
| Controlli nuovi su telefono | Target dei controlli principali di almeno 44 px; griglie adattive |
| Errori e attese | Etichette italiane, `role=status/alert`, `aria-busy`, controlli disabilitati durante le operazioni pertinenti |

## ✨ UX MIGLIORATA

| Area | Problema | Fix |
|---|---|---|
| Bolletta | Dati letti da ridigitare e troppi campi esposti | Riepilogo automatico, conferma unica; originali, fonti e correzioni espandibili |
| Consumi | Valori cambiati senza aggiornare il simulatore | Conferma unica, uso rapido e nuove utenze modificabili; verifica prima del calcolo economico |
| Tetto | Edificio geocodificato diverso dal tetto e strumenti poco diretti | Pin trascinabile e separato dalla ricerca; trascinamento mappa, chiusura sul primo vertice e strumenti guidati |
| Posa | Misure in pianta confuse con area inclinata | Superfici, lati e posa su piano inclinato distinti |
| Scenari | Potenza massima scambiata con proposta | Massimo fisico e criterio della potenza consigliata espliciti |
| Prezzi | Rientro con posa non valorizzata | Prezzo delle voci inserite e dato insufficiente per il rientro finché i costi non sono completi |
| Errori servizi | Percorso interrotto | Compilazione manuale per documenti e misure |

## ⚡ PERFORMANCE

| Ottimizzazione | Impatto stimato |
|---|---|
| Testo PDF nativo completo senza AI | Prova reale: zero chiamate OCR/AI per due pagine leggibili |
| Cache di otto profili orari normalizzati | Riduce la ricostruzione dell'anno nei confronti e nelle proiezioni pluriennali |
| Cache/idempotenza aziendale per hash e fase | Evita letture AI ripetute del medesimo documento |
| Limiti file, pagine OCR, falde, moduli e tentativi di posa | Lavoro e memoria limitati; errore esplicito o percorso manuale |
| PVGIS per falda in gruppi di tre e timeout | Richieste limitate e risultato non riutilizzato per un altro tetto |

## ✅ CHECKLIST TEST FINALE

- [x] Build dell'applicazione (`build:fast`): PASS.
- [x] TypeScript ambito interessato e nuovi test: PASS.
- [x] Deno check dei quattro endpoint interessati: PASS prima dell’ultima revisione UX; successivamente PASS del core e dei tre endpoint FV in sola verifica dei tipi sulla cache. Il controllo con lock ha rilevato un checksum differente del bundle PDF.js 4.0.379 servito da esm.sh; lockfile e dipendenze non modificati, nessuna esecuzione di quel codice nel typecheck.
- [x] Audit dipendenze: PASS, nessuna dipendenza nuova.
- [x] Build di produzione in CI: PASS; il prerender locale aveva raggiunto il limite di 15 minuti.
- [ ] Lint globale pulito: FAIL preesistente; 11 errori nel wizard già presenti in base, nessuna bonifica generale inclusa.
- [x] Suite fotovoltaico finale: 1002 PASS, 12 esclusi preesistenti, 67 file passati e un file escluso; controlli Storage aggiuntivi PASS.
- [x] Test nuovi: 92 PASS fra logica, UI, endpoint e SQL.
- [x] Autorizzazioni e SQL: 409 PASS, inclusa doppia applicazione SQL nel database di prova.
- [x] Smoke test locale: Consumi → Tetto → Impianto → Preventivo → salva → reload, PASS con backend sintetico.
- [x] PDF nativo multipagina reale: PASS, pagina e valori riconosciuti senza AI.
- [x] Interazioni nuove: conferma unica della lettura non ancora confermata, proiezione ancora esplicita, preset orari, aggiunta/rimozione utenze e ricalcolo sulla base, chiusura del poligono e spostamento vista senza alterare il tetto.
- [x] Edge case: periodi sovrapposti, POD diversi, dati invalidi, storico parziale, modulo cambiato, falde duplicate, accumulo e consumi futuri, PASS.
- [x] Servizio indisponibile/credito: PASS con risposte simulate; inserimento manuale disponibile.
- [x] Mobile 375 px e larghezze 768/1280/1920: PASS in Chromium e WebKit, nessun overflow.
- [x] Console locale: 0 errori JavaScript nei percorsi provati.
- [x] PDF A4 e tavola vettoriale: generati dal template reale e controllati visivamente con Poppler.
- [ ] Safari fisico: non provato; WebKit locale PASS.
- [ ] Firefox: non avviabile per errore sandbox/compositore dell'installazione locale.
- [ ] Lighthouse Performance/A11Y: non misurati.
- [ ] Test AI su bollette reali di fornitori e risposta positiva Google Static Maps: da verificare dopo attivazione, senza dichiarare questi risultati sulla base dei mock.
- [x] Migrazione applicata via MCP e registro riallineato dopo il verde completo di CI, Supabase Preview e Cloudflare Pages.
- [ ] Merge e rilascio frontend/edge: in corso, dopo ulteriore verifica del commit finale.

## 🔴 PROBLEMI NON RISOLTI

| Problema | Motivo blocco | Soluzione proposta | Sprint stimato |
|---|---|---|---|
| Google Static Maps e campionamento OCR reale | Verificata configurazione server e percorso manuale, non l'esito positivo del provider per ogni formato/sede | Collaudo successivo all'attivazione con documenti autorizzati e controllo del provider effettivo | Collaudo di attivazione |
| Prerender SEO/Lighthouse/Firefox fisico | Limiti e dipendenze dell'ambiente locale | Build completa già verde in CI; browser e dispositivi dedicati per gli altri controlli | Verifica separata |
| Debito lint globale | Preesistente ed esterno alle nuove superfici | Intervento distinto senza modificare i calcoli durante la consegna FV | Da pianificare |

**VERDETTO FINALE: implementazione collaudata localmente, rilascio subordinato a migrazione e controlli CI.**
