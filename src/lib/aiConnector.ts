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
 * Client: con una CHIAVE nell'header si collegano Claude Code e Claude Desktop
 * (config con mcp-remote). Con l'ACCESSO OAuth (live dal 27/09/2026: pagina
 * /oauth/consent, registrazione dinamica dei client) si collegano claude.ai —
 * sito, app desktop e telefono — e ChatGPT, che accetta solo OAuth (connettore
 * personalizzato in Modalità sviluppatore). Con l'OAuth azienda e livello si
 * scelgono nella pagina di consenso, non qui.
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
      "Aggiungi al listino prodotti «Piastrella gres» a 28 €/mq",
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

/** Le due card di Integrazioni. */
export type AssistenteAi = "claude" | "chatgpt";

/**
 * A quale card appartiene un collegamento OAuth, dal nome che il client si è
 * registrato. Un nome sconosciuto non dimostra un collegamento con Claude.
 */
export function assistenteDelClient(clientName: string | null | undefined): AssistenteAi | null {
  const n = (clientName ?? "").toLowerCase();
  if (n.includes("chatgpt") || n.includes("openai")) return "chatgpt";
  return n.includes("claude") || n.includes("anthropic") ? "claude" : null;
}

export function statoCollegamentoAi(
  assistente: AssistenteAi,
  grants: { client_name: string | null; last_used_at: string | null }[],
  keys: { name: string; is_active: boolean; expires_at: string | null }[],
  now = Date.now(),
): { status: "connected" | "warning" | "disconnected"; detail: string | null } {
  const propri = grants.filter(g => assistenteDelClient(g.client_name) === assistente);
  const usati = propri.map(g => Date.parse(g.last_used_at ?? "")).filter(t => Number.isFinite(t) && t <= now);
  const ultimo = usati.length ? Math.max(...usati) : null;
  if (ultimo !== null) return {
    status: now - ultimo < 30 * 86400000 ? "connected" : "warning",
    detail: `Ultimo utilizzo ${new Date(ultimo).toLocaleDateString("it-IT")}`,
  };
  const chiaviClaude = assistente === "claude" && keys.some(k => k.is_active
    && (!k.expires_at || Date.parse(k.expires_at) > now) && /claude|assistente ai/i.test(k.name));
  return propri.length || chiaviClaude
    ? { status: "warning", detail: "Configurato · utilizzo da verificare" }
    : { status: "disconnected", detail: null };
}

/** Claude sito, app e telefono: connettore personalizzato con accesso, nessuna chiave. */
export const PASSI_CLAUDE_CONNETTORE: string[] = [
  "Su claude.ai apri Impostazioni → Connettori → «Aggiungi connettore personalizzato». Nei piani Team ed Enterprise lo aggiunge il proprietario, da Impostazioni organizzazione → Connettori.",
  "Dagli un nome (per esempio «Edilizia in Cloud») e incolla l'URL qui sotto.",
  "Premi «Connetti»: si apre Edilizia in Cloud, entri con il tuo account e scegli azienda e livello.",
  "Fatto: il connettore vale anche nell'app Claude sul telefono e in Claude Desktop.",
];

/** ChatGPT: connettore personalizzato in Modalità sviluppatore, accesso OAuth. */
export const PASSI_CHATGPT: string[] = [
  "Su chatgpt.com apri Impostazioni → Connettori (o «App e connettori») → Avanzate e attiva la «Modalità sviluppatore». Nei piani Business ed Enterprise può doverla abilitare l'amministratore dell'area di lavoro.",
  "Torna in Connettori e premi «Crea» (o «Aggiungi connettore personalizzato»).",
  "Nome: «Edilizia in Cloud» · URL del server MCP: quello qui sotto · Autenticazione: OAuth. Conferma che ti fidi dell'app e crea.",
  "Si apre Edilizia in Cloud: entri con il tuo account e scegli azienda e livello.",
  "In una nuova chat, dal «+» attiva la Modalità sviluppatore e scegli il connettore «Edilizia in Cloud».",
];

/**
 * Disponibilità e autorizzazioni dipendono dal piano e dall'area di lavoro.
 */
export const NOTA_PIANI_CHATGPT =
  "Verifica nelle impostazioni del tuo piano la disponibilità della Modalità sviluppatore e delle app personalizzate. L'amministratore dell'area di lavoro può limitarne creazione e azioni. Piani, menu e dispositivi supportati possono cambiare.";
