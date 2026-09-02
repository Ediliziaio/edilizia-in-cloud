/**
 * outreach-email-check — qualita' dell'indirizzo PRIMA dell'arruolamento.
 * Parte pura (PEC, ruolo) + lookup MX con cache su outreach_mx_map.
 *
 * Perche': a 5-10 invii al giorno per casella, tre indirizzi morti bastano a
 * far marcare la casella come spammer. Meglio scartarli prima.
 */
// deno-lint-ignore-file no-explicit-any
import { classifyEmail } from "./email-quality.ts";

const PEC_RE = /(^|[.@-])pec([.@-]|$)|legalmail|arubapec|postacert|sicurezzapostale|mypec|pecimprese|ingpec|geopec|legalpec|cert\.legalmail|pec-?legal|postecert|actaliscertymail|cgn\.legalmail|pecmail/i;

export function isPecEmail(email: string): boolean {
  const dom = String(email ?? "").toLowerCase().split("@")[1] ?? "";
  return !!dom && PEC_RE.test(dom);
}

export function isRoleEmail(email: string): boolean {
  return classifyEmail(email).isRole;
}

export function domainOf(email: string): string {
  return String(email ?? "").toLowerCase().trim().split("@")[1] ?? "";
}

/**
 * Il dominio ha un MX (o almeno un A)? Cache in outreach_mx_map (30 giorni).
 * mx_host NULL con risolto_at recente = "senza MX". Best-effort: su errore DNS
 * si considera valido (mai bloccare l'arruolamento per un DNS lento).
 */
export async function domainHasMx(admin: any, domain: string, cache: Map<string, boolean>): Promise<boolean> {
  const d = domain.toLowerCase().trim();
  if (!d) return false;
  const hit = cache.get(d);
  if (hit !== undefined) return hit;
  try {
    const { data } = await admin.from("outreach_mx_map").select("mx_host,risolto_at").eq("email_domain", d).maybeSingle();
    if (data?.risolto_at && Date.now() - Date.parse(data.risolto_at) < 30 * 86_400_000) {
      const ok = !!data.mx_host;
      cache.set(d, ok);
      return ok;
    }
  } catch { /* prosegue con il DNS */ }
  let host: string | null = null;
  let errore = false;
  try {
    const rec = await Deno.resolveDns(d, "MX");
    host = rec.sort((a, b) => a.preference - b.preference)[0]?.exchange ?? null;
  } catch { errore = true; }
  if (!host && errore) {
    // niente MX: prova almeno un A (server che riceve direttamente)
    try { const a = await Deno.resolveDns(d, "A"); if (a.length) host = d; errore = false; } catch { errore = true; }
  }
  const ok = !!host || errore; // DNS in errore = non si blocca
  cache.set(d, ok);
  if (!errore) {
    try {
      const { data: g } = await admin.rpc("outreach_mx_group_of", { p_host: host });
      await admin.from("outreach_mx_map").upsert(
        { email_domain: d, mx_host: host, mx_group: String(g ?? "altro"), risolto_at: new Date().toISOString() },
        { onConflict: "email_domain" });
    } catch { /* cache best-effort */ }
  }
  return ok;
}
