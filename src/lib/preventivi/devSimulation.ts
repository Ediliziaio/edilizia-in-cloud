// Development-only simulated provider. No Supabase client, HTTP or telemetry.
export const demo = { scenario: "bagno", lenta: false, richieste: 0, eventi: [] as string[] };
const listeners = new Set<() => void>();
export function subscribe(callback: () => void) { listeners.add(callback); return () => { listeners.delete(callback); }; }
export function log(message: string) {
  demo.eventi = [`${new Date().toLocaleTimeString("it-IT")} · ${message}`, ...demo.eventi].slice(0, 12);
  listeners.forEach(fn => fn());
}
export function recordConversationRequest() {
  demo.richieste++;
  log("Messaggio alla chat simulata: nessuna chiamata AI reale.");
  return Date.now();
}
function riga(nome: string, quantita: number | null, unita: string, prezzo: number | null) {
  return { nome, descrizione: "Dati sintetici della simulazione, non un prezzo di mercato.", item_category: "posa", quantita, unita_misura: unita, unit_price: prezzo, tariffa_id: prezzo != null ? "tariffa-sintetica" : null };
}
export function proposta(scenario: string) {
  const righe = scenario === "cappotto"
    ? [riga("Cappotto di prova", 120, "mq", 50), riga("Ponteggio di prova", null, "mq", 8)]
    : scenario === "tennis"
      ? [riga("Superficie del campo di prova", 600, "mq", 40), riga("Recinzione di prova", 100, "ml", null)]
      : [riga("Rivestimenti del bagno di prova", 24, "mq", 30), riga("Demolizione del bagno di prova", null, "mq", 18)];
  return { schema_version: 1, sezioni: [{ nome: "Lavorazioni simulate", righe }], note: "Questa non è un’offerta utilizzabile: misure, tariffe, IVA e costi sono esempi fittizi.", avvertenze: [] as string[] };
}
export const supabase = {
  functions: {
    invoke: async (name: string, options: { signal?: AbortSignal }) => {
      if (name !== "ai-genera-preventivo-v2") throw new Error("Servizio non consentito nella simulazione.");
      if (options.signal?.aborted) throw new DOMException("Interrotta", "AbortError");
      const scenario = demo.scenario;
      demo.richieste++;
      log("Avviata un’analisi simulata. Chiamate AI reali: 0.");
      await new Promise<void>((resolve, reject) => {
        const aborted = () => { clearTimeout(timer); log("Analisi simulata interrotta senza inserire righe."); reject(new DOMException("Interrotta", "AbortError")); };
        const timer = setTimeout(() => { options.signal?.removeEventListener("abort", aborted); resolve(); }, demo.lenta ? 8000 : 900);
        options.signal?.addEventListener("abort", aborted, { once: true });
      });
      log("Proposta simulata disponibile: verifica i dati mancanti.");
      return { data: proposta(scenario), error: null as { message: string } | null };
    },
  },
};
export function captureVelocityEvent() { /* No telemetry in the demo. */ }
export function captureVelocityError() { /* No telemetry in the demo. */ }
