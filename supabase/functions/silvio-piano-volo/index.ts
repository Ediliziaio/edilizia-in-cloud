// 12/11/2026: le rate del piano portano anche soglia e fase (shared/silvio-commessa/piano.ts). Questo commento fa ripubblicare la funzione.
// 11/11/2026: le rate del piano portano «a misura» (shared/silvio-commessa/piano.ts). Questo commento fa ripubblicare la funzione.
/**
 * silvio-piano-volo — il piano di volo delle commesse (1/11/2026, fase 5, lotto 5.3).
 * Vedi docs/piano-silvio-commessa-ai.md, sezione 4 e fase 5.
 *
 * Una volta al giorno (cron: supabase/migrations-pending/20281112142500_silvio_piano_volo_cron.sql, da accendere dopo
 * il deploy), per le aziende con «Crea con Silvio» acceso:
 *   · 3 giorni lavorativi prima di ogni fase, il controllo di persone, mezzi, ordini, DURC e
 *     meteo di stagione, con le azioni pronte (`controlloFase` di shared/silvio-commessa/pianoVolo.ts);
 *   · il giorno dopo la fine di una fase, la proposta del SAL (`propostaSal`), se la commessa ha
 *     le rate a SAL.
 * Il risultato va in `silvio_piano_volo` (una riga per fase e tipo) e una campanella al
 * responsabile e al capomastro della commessa. NIENTE PARTE DA SOLO: le azioni le esegue
 * `silvio_volo_conferma` quando la persona conferma dalla commessa. Nessuna email, nessun
 * WhatsApp, nessuna chiamata AI: solo regole e letture.
 *
 * L'autonomia dell'azienda conta: con «controllo_fase» o «proposta_sal» vietati il giro salta
 * quella parte; le azioni vietate (squadra, mezzi) non si propongono.
 *
 * Risponde a pg_net entro 5 secondi e finisce in background (`serveConMetricheRapida`, vedi
 * CLAUDE.md, «la coda è una sola»). Tetti per giro: 25 aziende, a rotazione, e 30 commesse per
 * azienda. Il giro di un'azienda sta in `giro.ts`, senza dipendenze da Deno, perché lo provano i test.
 *
 * Una lettura che non riesce non è un dato vuoto (revisione 2/11, D10): salta la commessa (o
 * l'azienda) e finisce in `errori` e nei log, invece di proporre «nessuno è assegnato».
 *
 * Corpo facoltativo: { company_id?: string, oggi?: "AAAA-MM-GG", anteprima?: true }.
 * Con `anteprima` legge e calcola, e restituisce cosa scriverebbe senza scrivere niente.
 *
 * Pubblicata con verify_jwt = false (supabase/config.toml): il cron porta x-cron-secret.
 *
 * Simulazioni del 2/11/2026: risorse.ts importa fondi.ts, che ora data le fasi con le durate.
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getCorsHeaders, errorResponse, jsonResponse } from "../_shared/headers.ts";
import { cronSecretValido } from "../_shared/cronAuth.ts";
import { serveConMetricheRapida } from "../_shared/withMetricsRapida.ts";
import { oggiInItalia } from "../../../shared/silvio-commessa/date.ts";
import type { ClientRisorse } from "../../../shared/silvio-commessa/contestoRisorse.ts";
import { aziendeDelGiro, giroAzienda, type ClientGiro, type EsitoGiro } from "./giro.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const FEATURE = "silvio_crea_commessa";
/** Le aziende con la funzione accesa: la rotazione ne sceglie 25 per giro. */
const LIMITE_AZIENDE = 1000;

serveConMetricheRapida("silvio-piano-volo", async (req) => {
  const cors = getCorsHeaders(req);
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  const token = (req.headers.get("Authorization") || "").replace("Bearer ", "");
  if (!cronSecretValido(req) && !(token && token === SERVICE_ROLE)) return errorResponse("Non autorizzato", 401, cors);

  const corpo = await req.json().catch(() => ({})) as { company_id?: string; oggi?: string; anteprima?: boolean };
  const oggi = typeof corpo.oggi === "string" && /^\d{4}-\d{2}-\d{2}$/.test(corpo.oggi) ? corpo.oggi : oggiInItalia();
  const anteprima = corpo.anteprima === true;
  const admin = createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { persistSession: false, autoRefreshToken: false } });
  const db = admin as unknown as ClientRisorse;
  const esito: EsitoGiro = { oggi, aziende: 0, commesse: 0, controlli: 0, sal: 0, notifiche: 0, scadute: 0, errori: [], ...(anteprima ? { anteprima: [] } : {}) };

  // Le aziende con «Crea con Silvio» acceso (un override: la chiave è spenta per tutti).
  let qAziende = admin.from("company_feature_overrides").select("company_id")
    .eq("feature_key", FEATURE).eq("is_enabled", true).neq("access_level", "disabled").limit(LIMITE_AZIENDE);
  if (corpo.company_id) qAziende = qAziende.eq("company_id", corpo.company_id);
  const { data: aziende, error: errAziende } = await qAziende;
  if (errAziende) return errorResponse(`Aziende: ${errAziende.message}`, 500, cors);

  if (!anteprima) {
    const { data: n } = await admin.rpc("silvio_volo_scadute", { p_oggi: oggi });
    esito.scadute = Number(n) || 0;
  }

  const ids = ((aziende ?? []) as { company_id: string }[]).map((a) => a.company_id);
  for (const companyId of aziendeDelGiro(ids, oggi)) {
    try {
      await giroAzienda(admin as unknown as ClientGiro, db, companyId, oggi, anteprima, esito);
      esito.aziende += 1;
    } catch (e) {
      const messaggio = `${companyId}: ${e instanceof Error ? e.message : String(e)}`;
      console.error(`[silvio-piano-volo] azienda saltata, ${messaggio}`);
      esito.errori.push(messaggio);
    }
  }
  return jsonResponse(esito, 200, cors);
});
