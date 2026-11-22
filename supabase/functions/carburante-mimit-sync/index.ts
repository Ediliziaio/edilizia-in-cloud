import { cronSecretValido } from "../_shared/cronAuth.ts";
import { scaricaRilevazioneMimit } from "../../../shared/carburanti/mimit.ts";

Deno.serve(async (req) => {
  if (req.method !== "POST") return Response.json({ error: "Metodo non disponibile" }, { status: 405 });
  if (!cronSecretValido(req)) return Response.json({ error: "Accesso riservato al cron" }, { status: 401 });
  try {
    // Due tentativi brevi lasciano tempo al salvataggio entro i 15 s del cron.
    const { giorno, territori } = await scaricaRilevazioneMimit(5000).catch((error: unknown) => {
      if (!(error instanceof TypeError) && !(error instanceof DOMException && error.name === "TimeoutError")) throw error;
      return scaricaRilevazioneMimit(5000);
    });
    const url = Deno.env.get("SUPABASE_URL");
    const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!url || !key) throw new Error("Servizio di archiviazione non configurato");
    const salvataggio = await fetch(new URL("/rest/v1/rpc/carburante_mimit_importa", url), {
      method: "POST",
      headers: { "Content-Type": "application/json", apikey: key, Authorization: `Bearer ${key}` },
      body: JSON.stringify({ p_giorno: giorno, p_territori: territori }),
      redirect: "error", signal: AbortSignal.timeout(4000),
    });
    if (!salvataggio.ok) throw new Error(`Archivio MIMIT ha risposto HTTP ${salvataggio.status}`);
    const aggiornati = await salvataggio.json();
    if (typeof aggiornati !== "number" || !Number.isInteger(aggiornati) || aggiornati < 0) throw new Error("Risposta dell’archivio MIMIT non valida");
    const oggi = new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Rome", dateStyle: "short" }).format(new Date());
    return Response.json({ giorno, territori: territori.length, aggiornati, aggiornato_oggi: giorno === oggi });
  } catch (error) {
    console.error("Importazione MIMIT fallita", error instanceof Error ? error.message : error);
    return Response.json({ error: "Acquisizione prezzi MIMIT non riuscita" }, { status: 503 });
  }
});
