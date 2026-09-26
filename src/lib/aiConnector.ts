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
 * - «operativo»: in più agisce (crea contatti/opportunità/attività/commesse,
 *   listino, proposte d'ordine). Gli invii veri solo con l'opt-in separato.
 *
 * Client (verificato il 26/09/2026 sulle guide ufficiali): la chiave va in un
 * header, e oggi lo accettano Claude Code, Claude Desktop (via mcp-remote) e
 * claude.ai solo per le organizzazioni con «Request headers» (beta). ChatGPT
 * accetta soltanto connettori con accesso OAuth: finché il server non lo offre,
 * con ChatGPT non si collega.
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
    descrizione: "Oltre a leggere: crea contatti, opportunità, attività e commesse, carica voci di listino e prepara proposte d'ordine.",
    esempi: [
      "Crea un contatto per Mario Rossi e un'opportunità da 12.000 €",
      "Apri una commessa «Ristrutturazione via Roma 5» da 45.000 €",
      "Aggiungi al listino «Posa piastrelle» a 28 €/mq",
    ],
  },
];

/** L'endpoint del server MCP: lo stesso per tutti i client. */
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
 * Passi per claude.ai (web, app desktop e telefono condividono i connettori).
 * La chiave in un header si può inserire solo dove l'organizzazione ha
 * «Request headers» (beta di Anthropic, per ora non per tutti): la aggiunge il
 * proprietario dell'organizzazione, una volta, e vale per tutti i membri.
 */
export function passiClaudeWeb(chiave: string): { url: string; header: string; note: string[] } {
  return {
    url: MCP_ENDPOINT,
    header: `x-api-key: ${chiave}`,
    note: [
      "Il proprietario dell'organizzazione Claude apre Impostazioni organizzazione → Connettori → Aggiungi → Personalizzato.",
      "Incolla l'URL qui sotto e, in «Request headers», il nome x-api-key con la chiave come valore.",
      "Se «Request headers» non c'è, la tua organizzazione non ha ancora questa opzione: usa Claude Desktop o Claude Code.",
      "Una volta aggiunto, il connettore si usa anche dall'app Claude sul telefono.",
    ],
  };
}

/** ChatGPT accetta solo connettori con accesso OAuth (niente chiavi negli header). */
export const NOTA_CHATGPT =
  "ChatGPT per ora non si collega: accetta solo connettori con accesso OAuth, che il gestionale non offre ancora. Nel frattempo usa Claude.";
