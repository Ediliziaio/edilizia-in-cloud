# Macro-commessa: movimenti collegati, design, Demo Azienda 1 — 14/11/2026

Domanda di Florin: quando creo una nuova operazione funziona tutto? Rapportini, ordini, fatture
fornitori, DDT e ogni altro movimento si possono collegare anche alla macro-commessa, non solo
alla commessa singola? Cosa migliorare nel design, cosa c'è di troppo, e com'è la struttura dei
grandi appalti in Demo Azienda 1.

## Come stanno le cose

**Il database è già pronto.** La commessa generale è una riga di `orders` come le altre: ogni
tabella dei movimenti (130 con `order_id`) può puntare alla generale o a una figlia, e nessun
vincolo lo impedisce. Le figlie hanno `commessa_generale_id`.

**I conti salgono già, per costo.** Costi, ore dei rapportini approvati (diventano
`order_employees`), ODA, magazzino, squadre esterne arrivano alla generale attraverso il costo
di ogni figlia (`economia_commesse`). I costi messi sulla generale contano come «costi comuni» e
si possono ripartire (millesimi, m², importo, parti uguali) senza contarli due volte.

**Quello che mancava o manca:**

| # | Problema | Stato |
|---|---|---|
| 1 | Riepilogo della generale lento (1,4 s): calcolava tutte le commesse dell'azienda | **FATTO** 21db7cf59 — 86 ms, numeri identici su 40 figlie di Demo 1 |
| 2 | Selettori di commessa piatti: generale e figlie mescolate, senza etichetta. Nel selettore di DDT / fatture ricevute / magazzino / mezzi la generale si trovava solo per codice e mai fra i «Prossimi 30gg» | **FATTO** a10006da5 — etichetta «Generale», figlie rientrate sotto, «in O-0003 · Via Lotti», filtro «Grandi lavori», ricerca per nome |
| 3 | Scheda Cantiere: rapportini, ODA, DDT, fatture, costi, pagamenti si vedono una commessa alla volta (selettore «Registra e consulta su»). Manca «Tutta l'operazione» | da fare — lotto B |
| 4 | Mai letti dalla generale: mezzi (`mezzi_giornate`: nemmeno nel costo delle commesse singole), timbrature, giornale lavori, rate non ancora fatturate (`order_installments`) | da fare — lotto C |
| 5 | Ricavi del piano: leggono `invoices` + unità, non le fatture del modulo fiscale (`documenti_fiscali`), che invece contano nel «fatturato» della Panoramica | da fare — lotto C |
| 6 | Subappalti registrati sulla generale stessa esclusi dall'elenco e dalla soglia subappaltabile (contano solo le figlie) | da fare — lotto C |
| 7 | Avanzamento: le fasi lette solo sulla generale, l'avanzamento solo dalle figlie | da fare — lotto C |
| 8 | 18 selettori fatti a mano (prima nota, scadenze: solo 50 commesse; costi, giornale, attività, appuntamenti: anche le commesse cancellate) | da fare — lotto D, passarli ai due selettori condivisi |

Da decidere (D1): su quali movimenti la generale si può scegliere. Proposta: **sì** per costi
comuni, fatture fornitori, ODA, DDT, subappalti, SAL di contratto; **sì anche per i rapportini**
quando l'operazione non ha figlie di cantiere (URBAN VISION: le figlie sono unità in vendita,
il cantiere è uno solo, sulla generale).

## Design della macro-commessa (Via Lotti, operazione in costruzione)

**Di troppo**
- Lo stesso messaggio «mancano le stime» ripetuto sei volte: due «—» nella testata, il percorso
  «Completa l'operazione», due righe nel riquadro Piano, e nella scheda Piano quattro numeri a
  «—» più due avvisi gialli più il grafico «Da completare» più «Prima completa il budget».
  Basta un avviso solo, con il bottone; i numeri che non si possono calcolare non si mostrano.
- «Capitale investito 202.674 €» e «Margine —» compaiono due volte nella stessa Panoramica.
- Testata blu con numeri da vendita (Da incassare 0 €, Fatturato 0 %, Incassato 0 %) su
  un'operazione che sta costruendo e non vende ancora.
- Ciambella «Composizione dei costi» con una fetta al 98,7 %: non dice niente.
- Nella scheda Cantiere il testo sulle SPV («per una SPV diversa seleziona la sua azienda»):
  per URBAN VISION la risposta è arrivata, restano tutte in URBAN VISION.

**Da migliorare**
- Testata per fase: in costruzione → speso / budget, capitale impegnato, avanzamento lavori,
  uscite dei prossimi 60 giorni; in vendita → venduto, incassato, da incassare.
- Al posto della ciambella: barre «budget / speso» per gruppo di costo (terreno, progettazione,
  costruzione…), con lo scostamento in rosso solo dove si sfora.
- «Ricavi stimati —» nella scheda Piano anche se il listino (4.480.000 €) c'è: i ricavi non
  dipendono dalle stime dei costi.
- Bottone principale della testata secondo la fase: «Nuova unità» serve in vendita; in
  costruzione servono «Registra un costo» / «Scrivi rapportino».
- «Uscite di nov 2026 201.560 €, il piano non ha uscite per questo mese»: l'acconto del terreno
  pagato a novembre e previsto altrove; serve un'azione («sposta nel piano»), non solo l'avviso.

**Animazioni.** Nessuna da togliere né da aggiungere: la pagina non ne ha di decorative, ed è
giusto così per un gestionale. L'unica attesa visibile era lo scheletro di caricamento di
~1,5 s, sparito col punto 1.

## Demo Azienda 1

22 commesse generali, ma 11 sono residui di prove («[Test locale]», «[Audit 11/11]»,
«[DEMO IMPORT 11/11]», «[DEMO AI 12/11]»), quasi tutte senza figlie. O-0096 («[DEMO AI 12/11]
Simulazione da PDF») resta: è quella presa a modello per URBAN VISION. Nessuna generale ha
fasi, nessuna ha rapportini; gli appalti hanno al massimo 3 SAL e nessun ODA o DDT. Chi apre la
demo non vede mai la catena completa di un grande appalto.

Proposta (lotto E):
1. Le 10 generali di prova nel cestino (tutte tranne O-0096) (`deleted_at`, recuperabili), con le loro figlie.
2. Un esempio completo di grande appalto: «[Esempio] Riqualificazione complesso scolastico —
   tre lotti». Generale appalto con contratto ed elenco prezzi, tre figlie (lotto A, B, C), fasi
   e lavorazioni, una squadra, rapportini approvati, due ODA con DDT e fattura del fornitore, un
   subappalto con il suo SAL, due SAL di contratto (uno fatturato e incassato), costi comuni
   (sicurezza, direzione lavori) ripartiti sui tre lotti.
3. Lo stesso per lo sviluppo immobiliare: «[Esempio] Residenza Via Roma» ha già unità e piano;
   si aggiungono fasi, rapportini e fatture fornitori sulla generale, come URBAN VISION.

## Ordine dei lotti

- **B** — Cantiere «Tutta l'operazione»: elenchi unici di rapportini, ODA, DDT, fatture
  fornitori, costi e pagamenti su generale + figlie, con la colonna «Commessa».
- **C** — Quello che non sale: mezzi, timbrature, giornale, rate, fatture fiscali nel piano,
  subappalti sulla generale, avanzamento.
- **Design** — testata per fase, un avviso solo, barre al posto della ciambella, «Ricavi
  stimati».
- **D** — I 18 selettori fatti a mano sui due condivisi.
- **E** — Demo Azienda 1.
