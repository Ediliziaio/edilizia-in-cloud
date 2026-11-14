# Genera dal computo: confezioni, prezzi, abbinamento al catalogo e nuova finestra

14/11/2026. Seguito di «Genera dal computo» (su main fino a c9297ccf8).

## Dove siamo

La finestra propone i materiali giusti (quantità, spessori, fasi, esclusioni), ma:

- **Collega poco.** Su Demo Azienda 2: 2 materiali collegati su 32. Il collegamento
  guarda codice, «già usato» e nome (≥ 2 radici in comune), solo dentro
  `collegaMateriali`, e l'utente non può né vedere le alternative né sceglierne una.
- **Non si può correggere l'articolo nella finestra.** Se il collegamento manca o è
  sbagliato, lo si sistema dopo, riga per riga, nei Materiali.
- **Le confezioni ci sono solo con un articolo collegato.** Senza, 2.520 kg di
  intonaco restano kg: al fornitore si ordinano 101 sacchi da 25 kg.
- **Il prezzo del listino fornitore si perde al salvataggio.** `materiali_salva_generazione`
  prende il prezzo solo dall'articolo (`article_templates`); una voce di
  `listino_fornitore_voci` collegata diventa 0 €.
- **La finestra è lunga e lenta da leggere** (vedi lo screenshot del 14/11): tre righe
  di spiegazione, tre blocchi prima del primo materiale, ogni riga alta quasi 100 px
  con la fonte scritta sotto l'etichetta, nessun totale in euro.

## Cosa c'è già e si riusa

| Dato | Dove | Uso |
|---|---|---|
| Catalogo materiali e prodotti | `article_templates` (`family_id` nullo = materiale), `supplier_id`, `prezzo_acquisto_netto`, `unit_of_measure`, `sku`, `marca`, `modello` | abbinamento principale |
| Listini dei fornitori | `listini_fornitore` + `listino_fornitore_voci` (codice, descrizione, unità, prezzo, sconto) | prezzo e fornitore |
| Nomi imparati | `product_aliases` (alias_normalized → article_template_id, `learned_from` ammette `voce_computo`), oggi vuota per i materiali | ricordare gli abbinamenti scelti |
| Acquisti passati | `order_items` di altre commesse, `materiali_ultimi_prezzi` | «già usato», ultimo prezzo |
| Magazzino | `warehouse_stock` (name, internal_code, unita_misura, quantity_available, unit_cost, supplier_id) | «disponibile in magazzino» |
| Prezzi proposti | `usePrezziProposti` / `prezziMateriali` nella pagina Materiali | resta com'è |
| Modello di interazione | `AbbinaListinoDialog` (propone con motivo, la persona conferma o sceglie, si ricorda) | stesso schema per i materiali |

## Lotto 1 — Confezioni e prezzo di listino

1. **Confezioni senza articolo.** Una tabella di confezioni d'uso comune per i materiali
   della libreria (premiscelati e cemento in sacchi da 25 kg, malte da 25 kg, colle da
   25 kg, stucchi da 5 kg, pitture in secchi da 14 l, fissativi da 5 l, primer da
   10 l). Il materiale a kg o litri si propone anche in confezioni: «2.520 kg = 101
   sacchi da 25 kg». L'articolo collegato, se dice un'altra confezione, vince.
2. **Prezzo dal listino fornitore al salvataggio.** Migrazione:
   `materiali_salva_generazione` legge anche `purchase_price` e `prezzo_fonte` della
   riga, quando l'articolo non ha un prezzo. Il client manda il prezzo netto del
   listino (sconto compreso, per l'unità d'acquisto) e `prezzo_fonte = 'listino'`.
   Provata in una transazione annullata, poi `apply_migration` e riallineamento della
   versione (CLAUDE.md).

## Lotto 2 — Abbinamento al catalogo (la «riconciliazione»)

1. **Candidati, non un solo colpo.** `candidatiArticolo(materiale)` restituisce i
   migliori 5 fra articoli, voci dei listini e magazzino, ognuno col motivo («stesso
   codice», «scelto l'ultima volta», «già comprato», «nome simile 80%») e con
   fornitore, prezzo per unità d'acquisto e confezione. Il primo sopra soglia si
   collega da solo, come oggi; gli altri restano a un clic.
2. **Punteggio migliore:** radici del nome, più marca/modello/sku dell'articolo, più
   le misure (80x120, 10 cm, Ø20) che devono coincidere, più la categoria; i
   conflitti di materia o misura (già fatti) escludono.
3. **Scelta nella finestra.** Sulla riga, l'articolo è un pulsante: apre la lista dei
   candidati con ricerca libera nel catalogo, più «Nessun articolo». La scelta cambia
   prezzo, fornitore e confezione della riga.
4. **Si ricorda.** Una scelta fatta a mano va in `product_aliases`
   (`learned_from = 'voce_computo'`, alias = nome del materiale): la prossima volta
   lo stesso materiale si collega con motivo «scelto l'ultima volta», sicurezza alta.
   Anche il «Nessun articolo» non si ricorda (non c'è un bersaglio).
5. **Magazzino.** Se in `warehouse_stock` c'è lo stesso materiale (codice interno o
   nome), la riga lo dice: «In magazzino: 40 sacchi». Solo informazione: prelevare
   resta un'azione dei Materiali.
6. **Riepilogo:** «18 su 32 collegati al vostro catalogo · 4 al listino di un
   fornitore · 10 senza articolo», con filtro rapido sui senza articolo.

## Lotto 3 — La finestra, a livello di design

Regole della casa (memoria «UX denso»): niente pannelli in più, i numeri dentro le
righe che ci sono, filtri come pastiglie in una riga.

1. **Testata in una riga:** titolo, nome del computo con «Apri» e «Carica un altro»,
   la scelta del computo (se più d'uno) e «8 capitoli → fasi» come pastiglia che apre
   l'abbinamento. La spiegazione lunga va in un suggerimento.
2. **Barra dei filtri:** Tutti 32 · Da controllare 2 · Senza articolo 10 · Senza prezzo
   12 · In magazzino 3, e il totale stimato dei selezionati.
3. **Righe da tabella, una riga alta 44-52 px:** spunta · materiale (nome, specifica
   in grigio, sotto in piccolo la voce di provenienza) · quantità d'acquisto («101
   sacchi», sotto «2.520 kg») · articolo e fornitore (pulsante di scelta) · prezzo
   unitario · totale · sicurezza come pallino colorato con la percentuale; la fonte e
   le note vanno nel suggerimento del pallino.
4. **Gruppi per fase** con intestazione appiccicosa: spunta della fase, nome, numero,
   totale in euro, «collegati 9/14».
5. **Piede fisso:** «32 materiali · stima 4.320 € · Ricorda per i prossimi computi ·
   Salva i materiali».
6. Telefono: le colonne vanno a capo come nella pagina Materiali (stessa grammatica).

## Prove

- Vitest: confezioni (con e senza articolo), prezzo di listino nella riga salvata,
  candidati e motivi, alias ricordato e riusato, conflitti, filtri e totali della
  finestra, scelta dell'articolo.
- Migrazione provata in una transazione annullata; `typecheck:ci` col lucchetto;
  `test:critical`.
- Browser su Demo Azienda 2 (mai aziende vere): i due computi di prova, scelta di un
  articolo a mano, nuovo import che lo ritrova, prezzo di listino salvato.

## Fuori da questo piano

- «Vista come» del super admin non vede `computo_uploads` (RLS per profilo): migrazione a parte.
- Prelevare dal magazzino dalla finestra: resta nei Materiali.
