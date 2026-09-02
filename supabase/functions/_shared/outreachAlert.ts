/**
 * outreachAlert — avvisi al super admin per il motore outreach (casella in
 * errore, giro bloccato, token OAuth scaduto, poll in errore). Prima tutto
 * finiva solo nei log del cron: nessuno se ne accorgeva.
 * Dedup: stesso `chiave` non piu' di una volta ogni `ogniOre` (default 6).
 */
// deno-lint-ignore-file no-explicit-any
import { avvisaSuperAdmin } from "./avvisaSuperAdmin.ts";

export async function alertOutreach(admin: any, p: {
  chiave: string; titolo: string; testo: string; url?: string; tipo?: string; ogniOre?: number;
}): Promise<boolean> {
  const key = `outreach_alert:${p.chiave}`.slice(0, 120);
  const ore = p.ogniOre ?? 6;
  try {
    const { data } = await admin.from("platform_settings").select("value").eq("key", key).maybeSingle();
    const ultimo = data?.value ? Date.parse(String(data.value)) : NaN;
    if (Number.isFinite(ultimo) && Date.now() - ultimo < ore * 3_600_000) return false;
    await admin.from("platform_settings").upsert({ key, value: new Date().toISOString(), updated_at: new Date().toISOString() }, { onConflict: "key" });
  } catch { /* la dedup e' un'ottimizzazione */ }
  try {
    await avvisaSuperAdmin(admin, {
      tipo: p.tipo ?? "outreach_avviso",
      titolo: p.titolo,
      testo: p.testo,
      url: p.url ?? "/admin/marketing",
      tag: key,
    });
    return true;
  } catch (e) {
    console.warn("[outreachAlert] avviso non inviato:", e instanceof Error ? e.message : e);
    return false;
  }
}

/** Registra un giro del motore (dispatch/poll/warmup) per la card "ultimo giro". */
export async function logRun(admin: any, funzione: string, startedAt: Date, esito: unknown, errore?: string | null): Promise<void> {
  try {
    await admin.from("outreach_runs").insert({
      funzione, started_at: startedAt.toISOString(), finished_at: new Date().toISOString(),
      esito: esito ?? null, errore: errore ?? null,
    });
  } catch { /* tabella assente pre-migrazione: nessun blocco */ }
}
