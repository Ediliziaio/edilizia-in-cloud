/**
 * Gli avvisi del contratto letto dall'AI, in un elenco solo (17/11/2026): conti che non tornano, valori
 * che non sono scritti nel PDF, avvisi dell'AI. Prima comparivano due volte, in alto e in fondo.
 */
import { contractCoherenceWarnings, type ContractExtract } from "./contractExtract";
import { daControllare, type VerificaNelTesto } from "./contrattoNelTesto";
import { readableContractWarning } from "./contractPreparation";

/**
 * L'avviso «il documento contiene istruzioni rivolte all'AI» l'AI lo copia dalle sue regole di sicurezza
 * anche quando non c'è niente (4 preventivi veri su 4 il 17/11/2026). Con il testo del PDF in mano si
 * tiene solo se il testo ha davvero frasi rivolte a un'AI; su una scansione (senza testo) resta.
 */
export function avvisoIstruzioniVero(avviso: string, testoDocumento: string | null): boolean {
  if (!/istruzioni rivolte all'?\s*AI/i.test(avviso)) return true;
  if (!testoDocumento || testoDocumento.replace(/\s+/g, "").length < 200) return true;
  // «ai» da sola no: è anche la preposizione («ai lavori», «AI SENSI DI LEGGE»).
  return /\b(ignora|ignore|istruzion\w* (precedent|sopra)|rispondi (che|solo)|scrivi che|sei un(?:'| )?assistente|chatgpt|prompt|intelligenza artificiale)/i.test(testoDocumento);
}

/** Gli avvisi da guardare, una volta sola: conti, valori non trovati nel PDF, avvisi dell'AI. */
export function avvisiDaControllare(extract: ContractExtract, verifica: VerificaNelTesto | null, testoDocumento: string | null, extra: string[] = []): string[] {
  const visti = new Set<string>();
  const out: string[] = [];
  const aggiungi = (t: string) => {
    const k = t.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim().slice(0, 80);
    if (!k || visti.has(k)) return;
    visti.add(k);
    out.push(t);
  };
  contractCoherenceWarnings(extract).forEach(aggiungi);
  if (verifica && !verifica.senzaTesto) {
    for (const c of daControllare(verifica)) aggiungi(`${c.etichetta} ${c.valore}: non è scritto nel documento. Controllalo.`);
  }
  extract.warnings.filter((w) => avvisoIstruzioniVero(w, testoDocumento)).map(readableContractWarning).forEach(aggiungi);
  extra.forEach(aggiungi);
  return out;
}
