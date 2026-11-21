import { secretCronConfigurati } from "../_shared/cronAuth.ts";

/** Il documento resta in coda anche se il risveglio immediato non riesce. */
export function avviaLetturaBolla(id: string): void {
  const nomeSecret = secretCronConfigurati()[0];
  const secret = nomeSecret && Deno.env.get(nomeSecret);
  if (!secret) return;
  const lavoro = (async () => {
    const risposta = await fetch(Deno.env.get("SUPABASE_URL") + "/functions/v1/ddt-documenti-processa", {
      method: "POST",
      headers: {
        "Authorization": "Bearer " + Deno.env.get("SUPABASE_SERVICE_ROLE_KEY"),
        "Content-Type": "application/json",
        "x-cron-secret": secret,
      },
      body: JSON.stringify({ id }),
      signal: AbortSignal.timeout(8_000),
    });
    await risposta.body?.cancel();
    if (!risposta.ok) throw new Error("risveglio_rifiutato");
  })().catch(() => console.warn("lettura_bolla_rinviata_al_worker", { id }));
  const runtime = (globalThis as { EdgeRuntime?: { waitUntil: (promise: Promise<unknown>) => void } }).EdgeRuntime;
  runtime?.waitUntil(lavoro);
}
