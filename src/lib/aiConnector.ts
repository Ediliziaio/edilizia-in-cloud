/**
 * Connettore assistente AI (Claude · ChatGPT).
 *
 * Un'azienda collega il proprio gestionale a Claude o a ChatGPT: l'assistente
 * parla direttamente con i dati della SUA azienda tramite il server MCP nativo
 * (edge function platform-mcp). La chiave creata qui è già limitata all'azienda
 * (api_keys.company_id), quindi l'ambito è forzato dal server, non dal client.
 *
 * Due livelli, come li ha descritti l'utente:
 * - «consulente»: legge ed estrae (contatti, opportunità, attività, commesse,
 *   statistiche) — non cambia niente;
 * - «operativo»: in più agisce (crea contatti/opportunità/attività, invia email).
 *
 * Gli scope corrispondono uno a uno a quelli che gli strumenti del server
 * controllano (vedi supabase/functions/platform-mcp/index.ts).
 */
import { MCP_ENDPOINT, claudeCodeCommand, claudeDesktopConfig } from "@/lib/platformApi";

export type LivelloConnettore = "consulente" | "operativo";

const SCOPE_LETTURA = [
  "contacts:read",
  "opportunities:read",
  "tasks:read",
  "orders:read",
  "products:read",
  "quotes:read",
  "warehouse:read",
  "hr:read",
  "safety:read",
  "email:read",
  "appointments:read",
  "stats:read",
] as const;

const SCOPE_AZIONI = [
  "contacts:write",
  "opportunities:write",
  "tasks:write",
  "orders:write",
  "products:write",
  "warehouse:write",
  "hr:write",
  "appointments:write",
] as const;

// Invii reali e strumenti a pagamento: solo se l'azienda lo attiva
// esplicitamente (spento di serie anche nel livello operativo).
const SCOPE_SENSIBILI = [
  "actions:sensitive",
  "email:send",
] as const;

/** Gli scope da assegnare alla chiave per il livello scelto. */
export function scopePerLivello(livello: LivelloConnettore, includiSensibili = false): string[] {
  const base = livello === "operativo" ? [...SCOPE_LETTURA, ...SCOPE_AZIONI] : [...SCOPE_LETTURA];
  return includiSensibili && livello === "operativo" ? [...base, ...SCOPE_SENSIBILI] : base;
}

export const LIVELLI: { id: LivelloConnettore; titolo: string; descrizione: string; esempi: string[] }[] = [
  {
    id: "consulente",
    titolo: "Consulente (sola lettura)",
    descrizione: "Fa domande sui tuoi dati e li estrae, senza cambiare niente.",
    esempi: [
      "Quanti preventivi aperti ho questo mese?",
      "Elenca le commesse in ritardo e il loro margine",
      "Chi sono i contatti che non sento da 30 giorni?",
    ],
  },
  {
    id: "operativo",
    titolo: "Operativo (lettura + azioni)",
    descrizione: "Oltre a leggere: crea contatti, opportunità, attività e commesse, carica voci di listino e invia email.",
    esempi: [
      "Crea un contatto per Mario Rossi e un'opportunità da 12.000 €",
      "Apri una commessa «Ristrutturazione via Roma 5» da 45.000 €",
      "Aggiungi al listino «Posa piastrelle» a 28 €/mq",
    ],
  },
];

/** L'endpoint del server MCP: lo stesso per Claude e ChatGPT. */
export { MCP_ENDPOINT };

/** Comando per Claude Code. */
export function comandoClaudeCode(chiave: string): string {
  return claudeCodeCommand(chiave);
}

/** Config JSON per Claude Desktop (Impostazioni → Sviluppatore → MCP). */
export function configClaudeDesktop(chiave: string): string {
  return claudeDesktopConfig(chiave);
}

/**
 * Passi per ChatGPT. I connettori/MCP remoti sono nella modalità sviluppatore
 * di ChatGPT (piani a pagamento): si aggiunge l'URL del server e l'header con la
 * chiave. Lo stesso endpoint MCP di Claude.
 */
export function passiChatGpt(chiave: string): { url: string; header: string; note: string[] } {
  return {
    url: MCP_ENDPOINT,
    header: `x-api-key: ${chiave}`,
    note: [
      "In ChatGPT apri Impostazioni → Connettori (o «Modalità sviluppatore»).",
      "Aggiungi un connettore MCP remoto con l'URL qui sopra.",
      "Come autenticazione scegli «Header» e incolla la riga x-api-key.",
      "Salva: da una nuova chat troverai gli strumenti di Edilizia in Cloud.",
    ],
  };
}
