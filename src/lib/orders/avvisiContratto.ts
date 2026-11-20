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

/**
 * La regola delle voci, mandata con ogni lettura (17/11/2026). Misura su 4 preventivi veri, 3 letture
 * ciascuno: senza, 11 letture complete su 12 (e nella finestra una volta 1 riga su 56); con, 12 su 12.
 */
export const REGOLA_VOCI = "Ogni voce: codice,unita,quantita,prezzo_unitario_eur,tipo,capitolo; null se assenti. Lotto+righe: estrai il dettaglio senza duplicare il lotto. Quantita fisiche esplicite anche nelle tabelle tecniche. Le tappe degli acconti non sono fasi.";

/** L'indicazione per la seconda lettura: entra nella chiave della cache, quindi è una lettura nuova. */
export const RILEGGI_VOCI = "Il documento ha il dettaglio: estrai OGNI riga con codice, quantita e prezzo come voce, non solo la riga del totale a corpo.";

/**
 * L'AI ha letto solo il totale (17/11/2026): lo stesso preventivo da 56 voci una volta è tornato con 56
 * voci, un'altra con la sola riga «Ristrutturazione… a corpo». Se il testo del PDF ha molti importi e le
 * voci lette sono una o due, la lettura è incompleta: si dice e si propone di rileggere.
 */
export function soloIlTotale(extract: ContractExtract, testoDocumento: string | null): boolean {
  if (!testoDocumento || extract.voci.length > 2) return false;
  const importi = testoDocumento.match(/€\s*\d{1,3}(?:\.\d{3})*,\d{2}|\d{1,3}(?:\.\d{3})*,\d{2}\s*€/g) ?? [];
  return importi.length >= 15;
}
