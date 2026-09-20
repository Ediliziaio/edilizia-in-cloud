/**
 * company-restore — rimette dentro un backup di company-backup, o prova a farlo.
 *
 * Tre azioni:
 *   elenca  → i file di backup disponibili, per azienda o per tutte
 *   prova   → scarica il file e lo ripristina in uno schema a parte: conta le
 *             righe che entrano, riporta quelle che non entrano, e butta via
 *             lo schema. È la prova che il backup è ripristinabile, non un
 *             ripristino.
 *   reale   → ripristino in public, solo per un'azienda purgata; tutto o niente.
 *
 * I backup a blocchi (20/09/2026). Le aziende grandi non si salvano più in un
 * file solo ma in una cartella <azienda>/<data>/ con un indice e un file per
 * blocco (vedi company-backup). «elenca» li mostra leggendo l'indice; la prova
 * di ripristino per questo formato non c'è ancora, e lo si dice invece di
 * passare l'indice ad admin_ripristina_backup, che risponderebbe con un errore
 * incomprensibile.
 *
 * Chiamabile dal super admin dalla pagina o dal cron con x-cron-secret.
 * La logica di ripristino sta nel database (admin_ripristina_backup): qui si
 * scarica il file e si passa il testimone.
 */
import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { serveConMetriche } from "../_shared/withMetrics.ts";

const BUCKET = "company-exports";
const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-cron-secret",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

async function autorizzato(req: Request, db: SupabaseClient): Promise<boolean> {
  // Tre nomi per lo stesso concetto, ereditati da tre epoche: si accettano
  // tutti, come fa cronAuth per il resto delle funzioni.
  const inviato = req.headers.get("x-cron-secret") ?? "";
  const segreti = ["INTERNAL_CRON_SECRET", "PROACTIVE_CRON_SECRET", "CRON_SECRET"]
    .map((n) => Deno.env.get(n) ?? "").filter(Boolean);
  if (inviato && segreti.includes(inviato)) return true;
  const auth = req.headers.get("authorization") ?? "";
  const jwt = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  if (!jwt) return false;
  const { data: utente } = await db.auth.getUser(jwt);
  if (!utente?.user) return false;
  const { data: ruoli } = await db.from("user_roles").select("role").eq("user_id", utente.user.id);
  return (ruoli ?? []).some((r: { role: string }) => r.role === "super_admin");
}

function json(corpo: unknown, status = 200): Response {
  return new Response(JSON.stringify(corpo), { status, headers: { ...CORS, "Content-Type": "application/json" } });
}

serveConMetriche("company-restore", async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });

  const db = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );

  try {
    if (!await autorizzato(req, db)) return json({ error: "Non autorizzato" }, 401);

    const corpo = await req.json().catch(() => ({}));
    const azione = String(corpo.azione ?? "prova");

    if (azione === "elenca") {
      const prefisso = corpo.companyId ? `${corpo.companyId}` : "";
      const cartelle = prefisso
        ? [prefisso]
        : ((await db.storage.from(BUCKET).list("", { limit: 500 })).data ?? [])
            .filter((o) => !o.name.includes(".")).map((o) => o.name);
      const file: Array<{
        percorso: string; dimensione: number; creato_il: string | null;
        a_blocchi?: boolean; completo?: boolean; righe?: number; tabelle?: number;
      }> = [];
      for (const cartella of cartelle) {
        const { data } = await db.storage.from(BUCKET).list(cartella, { limit: 100, sortBy: { column: "name", order: "desc" } });
        // Le cartelle con una data per nome sono backup a blocchi: si legge
        // l'indice (piccolo) per dire quante righe tiene e se è completo.
        // Solo le ultime sei: ogni indice è un file da scaricare.
        const aBlocchi = (data ?? []).filter((o) => /^\d{4}-\d{2}-\d{2}$/.test(o.name)).slice(0, 6);
        for (const o of aBlocchi) {
          const percorso = `${cartella}/${o.name}/indice.json`;
          const { data: blob } = await db.storage.from(BUCKET).download(percorso);
          if (!blob) continue; // cartella senza indice: backup mai arrivato in fondo
          try {
            const indice = JSON.parse(await blob.text()) as {
              esportato_il?: string; completo?: boolean; tabelle?: Array<{ righe_salvate?: number }>;
            };
            file.push({
              percorso,
              dimensione: 0,
              creato_il: indice.esportato_il ?? null,
              a_blocchi: true,
              completo: indice.completo === true,
              righe: (indice.tabelle ?? []).reduce((n, t) => n + Number(t.righe_salvate ?? 0), 0),
              tabelle: (indice.tabelle ?? []).length,
            });
          } catch {
            // indice illeggibile: non lo si mostra come backup
          }
        }
        for (const o of data ?? []) {
          if (!o.name.endsWith(".json")) continue;
          file.push({
            percorso: `${cartella}/${o.name}`,
            dimensione: Number((o.metadata as Record<string, unknown> | null)?.size ?? 0),
            creato_il: o.created_at ?? null,
          });
        }
      }
      return json({ ok: true, file });
    }

    const percorso = String(corpo.percorso ?? "");
    if (!percorso || percorso.includes("..")) return json({ error: "percorso obbligatorio" }, 400);
    if (percorso.endsWith("/indice.json")) {
      return json({
        ok: false,
        percorso,
        error: "Questo è un backup a blocchi: i dati ci sono, ma la prova di ripristino per questo formato non è ancora disponibile.",
      }, 422);
    }
    const modo = azione === "reale" ? "reale" : "prova";

    const { data: blob, error: errFile } = await db.storage.from(BUCKET).download(percorso);
    if (errFile || !blob) return json({ error: `File non trovato: ${errFile?.message ?? percorso}` }, 404);

    let dump: unknown;
    try {
      dump = JSON.parse(await blob.text());
    } catch {
      return json({ error: "Il file non è un JSON valido" }, 422);
    }

    const { data, error } = await db.rpc("admin_ripristina_backup", {
      p_dump: dump, p_modo: modo, p_conserva_schema: corpo.conserva_schema === true,
    });
    if (error) return json({ ok: false, modo, percorso, error: error.message }, 500);

    return json({ ok: true, percorso, ...(data as Record<string, unknown>) });
  } catch (e) {
    console.error("[company-restore]", e);
    return json({ ok: false, error: (e as Error).message }, 500);
  }
});
