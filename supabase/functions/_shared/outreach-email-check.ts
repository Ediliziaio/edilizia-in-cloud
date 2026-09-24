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
 * «Nessun record»: il dominio non esiste, o non ha quel tipo di record. Deno
 * lo segnala con NotFound («no record found for …»); un DNS che non risponde
 * dà TimedOut o un errore generico. Fino al 24/09/2026 le due cose erano la
 * stessa, e un dominio inesistente — «2x.webp» preso da un nome d'immagine,
 * «www.keynesia» troncato — passava per «DNS lento, non si blocca»: gli
 * indirizzi entravano nei flussi e il server di invio li rifiutava.
 */
export function nessunRecord(e: unknown): boolean {
  const nome = String((e as { name?: unknown } | null)?.name ?? "");
  const messaggio = String((e as { message?: unknown } | null)?.message ?? "");
  return nome === "NotFound" || /no records? found/i.test(messaggio);
}

/**
 * Dove arriva la posta del dominio, chiesto al DNS: il server MX, o il dominio
 * stesso se ha solo un A (server che riceve direttamente). `errore` = il DNS
 * non ha risposto, quindi non si sa. «Nessun record» invece è una risposta, e
 * vuol dire che lì la posta non arriva: host null ed errore false.
 */
export async function risolviPosta(dominio: string): Promise<{ host: string | null; errore: boolean }> {
  const d = dominio.toLowerCase().trim();
  let host: string | null = null;
  let errore = false;
  // Tre secondi per domanda: un DNS che non risponde conta come «non si sa»,
  // non tiene fermo chi aspetta (l'iscrizione, il giro d'invio).
  const entro = () => ({ signal: AbortSignal.timeout(3000) });
  try {
    const rec = (await Deno.resolveDns(d, "MX", entro())) as Array<{ preference: number; exchange: string }>;
    host = rec.sort((a, b) => a.preference - b.preference)[0]?.exchange ?? null;
  } catch (e) { errore = !nessunRecord(e); }
  if (!host) {
    // niente MX: prova almeno un A (server che riceve direttamente)
    try {
      const a = (await Deno.resolveDns(d, "A", entro())) as string[];
      if (a.length) { host = d; errore = false; }
    } catch (e) { errore = errore || !nessunRecord(e); }
  }
  return { host, errore };
}

/**
 * Il dominio ha un MX (o almeno un A)? Cache in outreach_mx_map (30 giorni).
 * mx_host NULL con risolto_at recente = "senza MX". Best-effort: un DNS che
 * non risponde non blocca l'arruolamento; un dominio che non esiste sì.
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
  const { host, errore } = await risolviPosta(d);
  const ok = !!host || errore; // DNS che non risponde = non si blocca
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
