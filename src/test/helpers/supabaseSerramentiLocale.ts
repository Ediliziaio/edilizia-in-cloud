import { execFileSync } from "node:child_process";
import { createClient } from "@supabase/supabase-js";

export const CARTELLA_BACKEND_SR = "services/serramenti-test-locale";
export const CONTENITORE_DB_SR = "supabase_db_serramenti-test-locale";
export function sqlSerramentiLocale(sql: string) {
  return execFileSync("docker", ["exec", "-i", CONTENITORE_DB_SR, "psql", "-U", "postgres", "-d", "postgres", "-v", "ON_ERROR_STOP=1", "-q", "-t", "-A"], { input: sql, encoding: "utf8", maxBuffer: 4 * 1024 * 1024 });
}
export function clientSerramentiLocali() {
  const s = JSON.parse(execFileSync("npx", ["--yes", "supabase", "status", "--workdir", CARTELLA_BACKEND_SR, "--output", "json"], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }));
  const url = new URL(s.API_URL);
  if (url.origin !== "http://127.0.0.1:54321" || !s.SERVICE_ROLE_KEY || !s.ANON_KEY) throw new Error("Backend locale isolato non disponibile");
  const fetchLocale: typeof fetch = (input, init) => {
    const richiesta = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url);
    if (richiesta.origin !== url.origin) throw new Error("Il test non puo accedere a servizi remoti");
    return fetch(input, init);
  };
  const options = { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false }, global: { fetch: fetchLocale } };
  return { admin: createClient(url.href, s.SERVICE_ROLE_KEY, options), utente: createClient(url.href, s.ANON_KEY, options) };
}

const json = new Set(["modello_snapshot", "valori_assi", "scelte_assi", "disegno_config", "esigenze", "soluzione", "perche_noi", "incluso_investimento", "testimonianze", "prossimi_passi", "fin_piani", "varianti", "pagamento_milestones", "cantiere_vincoli", "custom_field_values"]);
/** Test schema inferred from the real renderer fixture; production migrations are not replayed. */
export function tabellaDaFixture(nome: string, fixture: Record<string, unknown>, extra: Record<string, string> = {}) {
  if (!/^[a-z_]+$/.test(nome)) throw new Error("Tabella non valida");
  const fields: Record<string, string> = { id: "uuid primary key default gen_random_uuid()" };
  for (const [k, v] of Object.entries(fixture)) {
    if (!/^[a-z_][a-z_0-9]*$/.test(k)) throw new Error("Colonna non valida");
    if (k === "id" || k === "analisi_intervento") continue;
    fields[k] = json.has(k) || (v != null && typeof v === "object") ? "jsonb" :
      k.endsWith("_id") || k === "created_by" ? "uuid" : typeof v === "boolean" ? "boolean" : typeof v === "number" ? "numeric" : "text";
  }
  Object.assign(fields, extra);
  return `create table if not exists public.${nome} (${Object.entries(fields).map(([k, t]) => `"${k}" ${t}`).join(",")});`;
}
