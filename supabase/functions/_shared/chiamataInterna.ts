/**
 * chiamataInterna — riconosce chi chiama una funzione che NON è fatta per gli
 * utenti: il cron, oppure un'altra nostra edge function.
 *
 * IL GUASTO CHE QUESTO FILE ESISTE PER EVITARE (20/09/2026)
 * --------------------------------------------------------
 * Otto funzioni erano pubblicate con verify_jwt = false (il gateway non chiede
 * nulla) e dentro non controllavano chi chiama. Lavorano con la chiave di
 * servizio, quindi bastava conoscere l'URL: chiunque poteva far partire il
 * report CFO di tutte le aziende, o far rispondere l'AI su WhatsApp a nome di
 * un'azienda consumandone il credito.
 *
 * verify_jwt = true da solo non è una difesa: la chiave anon è un JWT valido
 * ed è pubblica (sta nel pacchetto dell'app). Il controllo vero è questo, nel
 * codice, prima di qualunque lavoro.
 *
 * Si accettano due prove, e basta una:
 *   1. il segreto del cron (`x-cron-secret` o `x-internal-cron-secret`), con
 *      le regole di cronAuth.ts;
 *   2. `Authorization: Bearer <chiave di servizio>`, uguale carattere per
 *      carattere. È ciò che whatsapp-webhook manda già oggi ad
 *      assistenza-ai-processor e lead-ai-processor: accettarla permette di
 *      chiudere le funzioni senza ripubblicare il webhook di WhatsApp, che è
 *      passato dalla revisione di Meta e si tocca il meno possibile.
 *
 * NON si legge il ruolo dentro il JWT senza verificarne la firma: con
 * verify_jwt = false un token con `role: service_role` se lo scrive chiunque.
 */
import { cronSecretValido } from "./cronAuth.ts";

/** true se la richiesta arriva dal cron o da un'altra nostra funzione. */
export function chiamataInternaValida(req: Request): boolean {
  if (cronSecretValido(req)) return true;

  const chiaveDiServizio = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!chiaveDiServizio) return false;

  const autorizzazione = req.headers.get("Authorization") ?? "";
  if (!autorizzazione.startsWith("Bearer ")) return false;
  return confrontoCostante(autorizzazione.slice("Bearer ".length), chiaveDiServizio);
}

/**
 * La risposta per chi non ha superato il controllo. Volutamente muta sul
 * perché: a chi bussa senza titolo non si dice quale intestazione manca.
 */
export function rispostaNonAutorizzata(
  intestazioni: Record<string, string> = {},
): Response {
  return new Response(JSON.stringify({ error: "unauthorized" }), {
    status: 401,
    headers: { ...intestazioni, "Content-Type": "application/json" },
  });
}

// Confronto a tempo costante, come in cronAuth.ts: niente oracolo temporale a
// chi provasse a indovinare la chiave un carattere alla volta.
function confrontoCostante(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}
