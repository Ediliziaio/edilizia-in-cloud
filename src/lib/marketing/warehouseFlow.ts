/** Illustrative marketing data. No database writes, billing or inventory calculations. */
export const warehouseScenarios = [
  { id: "fornitore", name: "Consegna del fornitore", description: "Il materiale arriva direttamente al cantiere.",
    steps: [
      { title: "Materiale richiesto", owner: "Ufficio / capocantiere", status: "Da ordinare", detail: "Indichi cosa serve e a quale commessa. Le lavorazioni restano nelle fasi, i materiali negli articoli da acquistare.", document: "100 sacchi di legante · Cantiere Roma", note: "Una richiesta non dimostra né una consegna né un costo definitivo." },
      { title: "Ordine al fornitore", owner: "Ufficio", status: "Ordine confermato", detail: "Colleghi l’ordine alla commessa. Dal suo dettaglio puoi consultare bolle e fatture collegate, senza cercarle in elenchi separati.", document: "Ordine dimostrativo · 100 sacchi", note: "Ordinato, ricevuto e fatturato sono informazioni diverse." },
      { title: "Consegna e bolla", owner: "Operaio / capocantiere", status: "Prezzo da completare", detail: "Raccogli il DDT con fornitore, numero, data, descrizioni, quantità e unità. Se il prezzo manca, resta da completare: non diventa un costo di zero euro.", document: "DDT 124 · 100 sacchi consegnati", note: "Controlla la merce effettivamente arrivata, anche se differisce dall’ordine." },
      { title: "Fattura ricevuta", owner: "Ufficio", status: "Da verificare", detail: "Arriva la fattura del mese: l’ufficio verifica i riferimenti alle bolle e i prezzi. La sola somiglianza di un documento non basta per attribuirlo a un cantiere.", document: "Fattura dimostrativa · 3.600 € netti", note: "100 sacchi di Roma × 12 € = 1.200 €. Le altre righe appartengono al Cantiere Milano." },
      { title: "Costo sulla commessa", owner: "Ufficio", status: "Ripartizione verificata", detail: "La quota verificata va alla commessa corretta. Il costo della stessa fornitura si considera una volta: ordine, DDT e fattura non diventano tre acquisti.", document: "Roma 1.200 € · Milano 2.400 €", note: "La somma delle quote è 3.600 €, come la fattura. Il pagamento resta un’informazione distinta dal costo." },
    ],
  },
  { id: "operaio", name: "Acquisto dell’operaio", description: "La merce viene ritirata al banco, sul conto dell’azienda.",
    steps: [
      { title: "Acquisto al banco", owner: "Operaio", status: "Merce ritirata", detail: "L’operaio seleziona la commessa e indica come ha ritirato la merce. Non serve fingere un nuovo ordine da inviare quando l’acquisto è già avvenuto.", document: "100 sacchi · sul conto dell’azienda", note: "Nell’app sono distinti: pagato da me, conto azienda e ritiro di un ordine già fatto." },
      { title: "Foto del documento", owner: "Operaio", status: "Da verificare", detail: "Carica la foto della bolla e controlla i dati letti: fornitore, riferimento, materiali, quantità e unità. L’ufficio verifica la registrazione.", document: "Bolla del negozio · Cantiere Roma", note: "La lettura assistita può essere incompleta: i dati mancanti vanno controllati, non inventati." },
      { title: "Verifica del ritiro", owner: "Ufficio", status: "Prezzo da completare", detail: "L’ufficio verifica commessa e modalità d’acquisto. Una bolla senza importi documenta la merce ritirata, non il suo costo definitivo.", document: "100 sacchi · prezzo non indicato", note: "L’acquisto pagato dall’operaio richiede anche la verifica del rimborso: non si confonde con l’addebito sul conto azienda." },
      { title: "Fattura del negozio", owner: "Ufficio", status: "Da verificare", detail: "Quando arriva la fattura, controlli le bolle del mese e attribuisci le righe alle commesse interessate, prima di confermare il costo.", document: "Fattura dimostrativa · 3.600 € netti", note: "Nel nostro esempio la merce di Roma vale 1.200 €; gli altri 2.400 € riguardano Milano." },
      { title: "Attribuzione del costo", owner: "Ufficio", status: "Ripartizione verificata", detail: "Il materiale compare nel costo della commessa una sola volta. Una registrazione dell’operaio e la fattura successiva non devono raddoppiare la medesima fornitura.", document: "Roma 1.200 € · Milano 2.400 €", note: "L’esempio illustra la verifica dei collegamenti: non dimostra un abbinamento automatico senza controllo." },
    ],
  },
  { id: "magazzino", name: "Prelievo dal magazzino", description: "Il materiale è già dell’impresa: non è un nuovo acquisto.",
    steps: [
      { title: "Disponibilità", owner: "Magazziniere / ufficio", status: "Da prelevare", detail: "Verifichi gli articoli già disponibili prima di acquistare di nuovo. Indichi la destinazione del materiale sulla commessa.", document: "100 sacchi · dal magazzino centrale", note: "Disponibilità fisica e costo attribuito al cantiere rispondono a domande diverse." },
      { title: "Prelievo", owner: "Magazziniere", status: "Quantità da verificare", detail: "Registri articolo, quantità, unità e destinazione. Il movimento distingue il materiale già posseduto dalla merce che devi ancora ordinare.", document: "100 sacchi prelevati · Cantiere Roma", note: "Non occorre inventare una nuova fattura per descrivere un prelievo." },
      { title: "Movimento al cantiere", owner: "Magazziniere / capocantiere", status: "Destinazione da controllare", detail: "Controlli il movimento del materiale e il cantiere destinatario. Un trasferimento e un utilizzo vanno distinti: portare il materiale in cantiere non prova che sia stato consumato tutto.", document: "Magazzino centrale → Cantiere Roma", note: "Le quantità effettivamente utilizzate devono corrispondere ai movimenti registrati." },
      { title: "Costo del materiale", owner: "Ufficio", status: "Costo da verificare", detail: "Verifichi il costo attribuibile al materiale prelevato. Il valore dell’esempio è un’ipotesi: non dichiara un particolare metodo contabile di valorizzazione.", document: "Ipotesi: 100 sacchi × 12 €", note: "Se il costo non è disponibile, non lo presentiamo come zero. Non simuliamo una nuova uscita bancaria." },
      { title: "Costo attribuito", owner: "Ufficio", status: "Attribuzione verificata", detail: "Nell’esempio i 1.200 € sono attribuiti al Cantiere Roma. Non sono un secondo acquisto: il documento del fornitore e il movimento interno devono essere letti senza duplicazioni.", document: "Costo illustrativo Roma · 1.200 €", note: "Nessuna nuova fattura nell’esempio. Il costo effettivo va verificato nei movimenti e nei dati disponibili." },
    ],
  },
] as const;

export const warehouseExample = {
  unitCount: 100,
  unitCostCents: 1200,
  invoiceCents: 360000,
  otherSiteCents: 240000,
} as const;

export function warehouseExampleCost(step: number): number | null {
  // A delivery without a known price remains unknown, not zero.
  return step >= 4 ? warehouseExample.unitCount * warehouseExample.unitCostCents : null;
}
