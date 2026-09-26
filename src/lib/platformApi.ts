/**
 * API piattaforma & MCP — utilità chiavi.
 *
 * La chiave viene generata NEL BROWSER del super admin e mostrata una sola
 * volta: nel database finisce solo l'hash SHA-256 (+ il prefisso per
 * riconoscerla in lista). Il server MCP (edge fn platform-mcp) autentica
 * ricalcolando lo stesso hash dall'header x-api-key.
 */

const KEY_PREFIX = "eic_live_";
const KEY_RANDOM_LENGTH = 40;
const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";

/** Genera una nuova chiave in chiaro (mostrata una sola volta). */
export function generateApiKey(): string {
  const bytes = new Uint8Array(KEY_RANDOM_LENGTH);
  crypto.getRandomValues(bytes);
  let random = "";
  for (const b of bytes) random += ALPHABET[b % ALPHABET.length];
  return KEY_PREFIX + random;
}

/** SHA-256 esadecimale — identico al calcolo lato server. */
export async function hashApiKey(key: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(key));
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/** Prefisso salvato in chiaro per riconoscere la chiave in lista. */
export function apiKeyPrefix(key: string): string {
  return key.slice(0, KEY_PREFIX.length + 8);
}

export interface ScopeDef {
  value: string;
  label: string;
  description: string;
}

/** Catalogo scope — allineato al registry dei tool in platform-mcp. */
export const API_SCOPES: ScopeDef[] = [
  { value: "companies:read", label: "Aziende (lettura)", description: "lista_aziende — solo chiavi piattaforma" },
  { value: "stats:read", label: "Statistiche", description: "statistiche_azienda (KPI e fatturato)" },
  { value: "contacts:read", label: "Contatti (lettura)", description: "cerca_contatti" },
  { value: "contacts:write", label: "Contatti (scrittura)", description: "crea_contatto (include lettura)" },
  { value: "opportunities:read", label: "Opportunità (lettura)", description: "lista_opportunita" },
  { value: "opportunities:write", label: "Opportunità (scrittura)", description: "crea/aggiorna_opportunita (include lettura)" },
  { value: "tasks:read", label: "Attività (lettura)", description: "lista_attivita" },
  { value: "tasks:write", label: "Attività (scrittura)", description: "crea_attivita (include lettura)" },
  { value: "orders:read", label: "Commesse (lettura)", description: "cerca_commesse" },
  { value: "orders:write", label: "Commesse (scrittura)", description: "crea_commessa (include lettura)" },
  { value: "products:read", label: "Listino (lettura)", description: "lista_listino" },
  { value: "products:write", label: "Listino (scrittura)", description: "carica_voce_listino (include lettura)" },
  { value: "email:send", label: "Email (invio)", description: "invia_email — invio REALE, usare con criterio" },
];

export const ALL_SCOPES_VALUE = "*";

export const MCP_ENDPOINT = "https://rsbrguhkodgnqfomrevo.supabase.co/functions/v1/platform-mcp";

/** Comando pronto per Claude Code. */
export function claudeCodeCommand(key: string): string {
  return `claude mcp add edilizia --transport http ${MCP_ENDPOINT} --header "x-api-key: ${key}"`;
}

/** Config JSON per Claude Desktop (via bridge mcp-remote). */
export function claudeDesktopConfig(key: string): string {
  return JSON.stringify(
    {
      mcpServers: {
        edilizia: {
          command: "npx",
          args: ["-y", "mcp-remote", MCP_ENDPOINT, "--header", `x-api-key:${key}`],
        },
      },
    },
    null,
    2,
  );
}

/** Esempio curl (JSON-RPC tools/list) per test rapidi. */
export function curlExample(key: string): string {
  return [
    `curl -s ${MCP_ENDPOINT} \\`,
    `  -H "x-api-key: ${key}" -H "Content-Type: application/json" \\`,
    `  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}'`,
  ].join("\n");
}
