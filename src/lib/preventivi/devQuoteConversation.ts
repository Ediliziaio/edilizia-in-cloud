// Scripted local UX trial, NOT an LLM or a regional price estimator.
export type LabScenario = "bagno" | "cappotto" | "tennis";
export type LabConversation = { scenario: LabScenario; step: "request" | "firstQuantity" | "secondQuantity" | "price" | "ready"; secondQuantity?: number };
export type LabRow = { name: string; quantity: number; unit_price: number; unit_of_measure: string };
type Turn = { next: LabConversation; reply: string; row?: { index: number; value: LabRow }; discount?: number };

const definitions = {
  bagno: { first: "Rivestimenti del bagno di prova", second: "Demolizione del bagno di prova", firstPrice: 30, secondPrice: 18, unit: "mq", question: "Quanti m² di rivestimenti vuoi prevedere?", secondQuestion: "Quanti m² di demolizioni prevediamo? Non li deduco dai rivestimenti." },
  cappotto: { first: "Cappotto di prova", second: "Ponteggio di prova", firstPrice: 50, secondPrice: 8, unit: "mq", question: "Quanti m² di facciata vuoi isolare?", secondQuestion: "Quanti m² di ponteggio sono previsti? La superficie va confermata separatamente." },
  tennis: { first: "Superficie del campo di prova", second: "Recinzione di prova", firstPrice: 40, secondPrice: null as number | null, unit: "ml", question: "Quanti m² di superficie del campo prevediamo?", secondQuestion: "Quanti metri lineari di recinzione vuoi prevedere?" },
} as const;

function positiveNumber(text: string, unit: "mq" | "ml" | "eur") {
  const suffix = unit === "eur" ? "(?:€|euro|eur)?" : unit === "mq" ? "(?:mq|m²|m2|metri quadrati)?" : "(?:ml|m|metri|metri lineari)?";
  const match = text.trim().toLowerCase().match(new RegExp(`^([0-9]+(?:[.,][0-9]{1,2})?)\\s*${suffix}$`));
  const n = match ? Number(match[1].replace(",", ".")) : NaN;
  return Number.isFinite(n) && n >= 0.01 && n <= 1e6 ? n : null;
}

export function advanceLabConversation(state: LabConversation, raw: string): Turn {
  const text = raw.trim().slice(0, 3000);
  const same = (reply: string): Turn => ({ next: state, reply });
  if (!text) return same("Scrivi una risposta per continuare.");
  if (state.step === "request") {
    const scenario = /tennis/i.test(text) ? "tennis" : /cappotto|facciata/i.test(text) ? "cappotto" : /bagno/i.test(text) ? "bagno" : null;
    if (!scenario) return same("Questa chat locale prova tre casi guidati: bagno, cappotto o campo da tennis. Quale vuoi preparare? Il dialogo AI libero non è ancora collegato qui.");
    return { next: { scenario, step: "firstQuantity" }, reply: `Prepariamo una bozza di prova, con prezzi fittizi. ${definitions[scenario].question}` };
  }
  const d = definitions[state.scenario];
  if (state.step === "ready") {
    const discount = text.toLowerCase().match(/^(?:applica\s+)?(?:uno?\s+)?sconto(?:\s+del)?\s+(\d+(?:[.,]\d{1,2})?)\s*%?$/);
    if (discount) {
      const n = Number(discount[1].replace(",", "."));
      if (n > 100) return same("Lo sconto deve essere tra 0 e 100%. Nessun importo è stato modificato.");
      return { next: state, discount: n, reply: `Sconto del ${n}% applicato alla bozza locale. I totali a fianco sono ricalcolati dal motore del gestionale.` };
    }
    return same("La bozza di prova è pronta e resta modificabile nei campi a fianco. Puoi anche scrivere «sconto del 10%». Questa chat guidata non interpreta ancora altre modifiche libere; non salva né invia documenti.");
  }
  const unit = state.step === "price" ? "eur" : state.step === "secondQuantity" ? d.unit : "mq";
  const n = positiveNumber(text, unit);
  if (n == null) return same(`Non ho applicato modifiche: indica un solo valore positivo, per esempio «${unit === "eur" ? "50 euro" : unit === "ml" ? "100 metri" : "24 mq"}». Se la misura non è disponibile, lasciala da verificare.`);
  if (state.step === "firstQuantity") return {
    next: { ...state, step: "secondQuantity" },
    row: { index: 0, value: { name: d.first, quantity: n, unit_price: d.firstPrice, unit_of_measure: "mq" } },
    reply: `Prima lavorazione aggiunta alla bozza a fianco. ${d.secondQuestion}`,
  };
  if (state.step === "secondQuantity" && d.secondPrice == null) return {
    next: { ...state, step: "price", secondQuantity: n },
    reply: `Recinzione: ${n} metri confermati. Manca il prezzo unitario: la voce non è ancora nel totale. Quale prezzo netto al metro vuoi usare per questa prova?`,
  };
  const quantity = state.step === "price" ? state.secondQuantity : n;
  if (quantity == null) return same("La quantità della recinzione manca: ricomincia la prova per confermarla.");
  return {
    next: { ...state, step: "ready" },
    row: { index: 1, value: { name: d.second, quantity, unit_price: state.step === "price" ? n : d.secondPrice!, unit_of_measure: d.unit } },
    reply: "Seconda lavorazione aggiunta: la bozza si è aggiornata automaticamente. Puoi modificare quantità, prezzi e costi nei campi oppure chiedere «sconto del 10%». Sono esempi, non un computo tecnico completo o un’offerta da inviare.",
  };
}
