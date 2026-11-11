// Deterministic, fictional examples. These are workflow previews, not LLM calls.
export const scenarios = [
  { id: "appointment", title: "Appuntamento", description: "Il cliente chiede un sopralluogo." },
  { id: "order", title: "Stato del lavoro", description: "L’assistente consulta una commessa dimostrativa." },
  { id: "handoff", title: "Passaggio a una persona", description: "Operatore disponibile oppure richiesta di richiamo." },
  { id: "callback", title: "Chiamata in uscita", description: "Anteprima di una richiamata, senza comporre numeri." },
];

export function simulateScenario(id, operatorAvailable = true) {
  const scenario = scenarios.find(s => s.id === id);
  if (!scenario) throw new Error("Scenario non riconosciuto.");
  const base = {
    simulation: true, engine: "regole locali, senza LLM", companyId: "azienda-demo",
    customer: { id: "cliente-demo", name: "Cliente dimostrativo", verified: false },
    direction: id === "callback" ? "outbound" : "inbound",
    transcript: [{ role: "assistant", content: "Buongiorno, sono l’assistente virtuale dell’azienda. Come posso aiutarla?" }],
    actions: [],
  };
  if (id === "appointment") {
    base.transcript.push({ role: "user", content: "Vorrei prenotare un sopralluogo." },
      { role: "assistant", content: "Verifico gli orari disponibili. Prima di confermare le riepilogo giorno, luogo e recapito." });
    base.actions = [{ tool: "disponibilita", mode: "demo", result: "Due orari dimostrativi disponibili" },
      { tool: "fissa_appuntamento", mode: "anteprima", result: "Richiede la conferma del cliente; nessun appuntamento reale creato" }];
    base.outcome = "Conferma dell’appuntamento da raccogliere";
  } else if (id === "order") {
    base.transcript.push({ role: "user", content: "A che punto è il mio lavoro?" },
      { role: "assistant", content: "Prima verifico a quale commessa si riferisce e i dati necessari per identificarla. Poi posso consultare lo stato presente nel gestionale." });
    base.actions = [{ tool: "stato_consegna", mode: "demo", result: "Commessa dimostrativa: preparazione materiali. I dati reali richiedono identificazione e autorizzazione." }];
    base.outcome = "Esempio di lettura dal gestionale";
  } else if (id === "handoff") {
    base.transcript.push({ role: "user", content: "Vorrei parlare con una persona." });
    if (operatorAvailable) {
      base.transcript.push({ role: "assistant", content: "Controllo chi è disponibile e preparo un riepilogo per l’operatore prima del passaggio." });
      base.actions = [{ tool: "passa_a_operatore", mode: "demo", result: "Disponibilità verificata; riepilogo privato; accettazione dell’operatore da raccogliere" }];
      base.outcome = "Trasferimento assistito da confermare";
    } else {
      base.transcript.push({ role: "assistant", content: "Al momento nessun operatore è disponibile. Vuole lasciare il motivo e un recapito per essere richiamato?" });
      base.actions = [{ tool: "richiesta_richiamo", mode: "anteprima", result: "Nessun trasferimento tentato; richiesta da confermare con il cliente" }];
      base.outcome = "Proposta di richiamo";
    }
  } else {
    base.transcript = [{ role: "assistant", content: "Buongiorno, sono l’assistente virtuale dell’azienda. La contatto per il richiamo concordato. È un momento adatto?" }];
    base.actions = [{ tool: "outbound", mode: "anteprima", result: "Verificare richiesta di richiamo, fascia oraria, saldo e numero abilitato; usare una chiave idempotente per il tentativo" }];
    base.outcome = "Preparazione della richiamata, nessuna chiamata effettuata";
  }
  return base;
}
