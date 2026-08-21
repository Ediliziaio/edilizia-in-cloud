// MP02 — Registra presenza entrata/uscita/pausa.
//
// Scriveva su hr_giornate colonne che NON ESISTONO (`user_id`, `ora_entrata`,
// `ora_uscita`, `inizio_pausa`, `fine_pausa`, `gps_lat`, `gps_lng`): lo schema
// vero ha profilo_id/prima_entrata/ultima_uscita e le ore le calcola un
// trigger. Il tool falliva quindi alla prima query, sempre, da sempre.
//
// Ora fa la cosa giusta e la fa come tutti gli altri canali: scrive una
// TIMBRATURA in hr_timbrature: è quella che il trigger calcola_giornata_hr
// consolida in hr_giornate (ore lavorate, pause, presenza). Una sola verità,
// che sia WhatsApp, app di cantiere, totem o ufficio.

import type { ToolCtx, ToolResult, ToolDef } from "../shared/types.ts";
import { errResult, okResult } from "../shared/types.ts";

export const registraPresenzaDef: Omit<ToolDef, "handler"> = {
  name: "registra_presenza",
  description:
    "Registra entrata/uscita/pausa dell'operaio con ora e coordinate opzionali. " +
    "Scrive una timbratura nel registro HR: le ore della giornata si ricalcolano da sole.",
  parameters: {
    type: "object",
    properties: {
      tipo: {
        type: "string",
        enum: ["entrata", "uscita", "inizio_pausa", "fine_pausa"],
      },
      ora: { type: "string", description: "HH:MM (default ora corrente)" },
      lat: { type: "number" },
      lng: { type: "number" },
      note: { type: "string" },
    },
    required: ["tipo"],
    additionalProperties: false,
  },
  requires_grants: ["presenze.write"],
  requires_confirmation: true,
};

interface Args {
  tipo: "entrata" | "uscita" | "inizio_pausa" | "fine_pausa";
  ora?: string;
  lat?: number;
  lng?: number;
  note?: string;
}

// Il tool parla la lingua dell'operaio; la tabella ha i suoi valori nel CHECK.
const TIPO_DB: Record<Args["tipo"], string> = {
  entrata: "entrata",
  uscita: "uscita",
  inizio_pausa: "pausa_inizio",
  fine_pausa: "pausa_fine",
};

/**
 * "HH:MM" di oggi in Europe/Rome → istante ISO assoluto.
 * L'edge gira in UTC: senza questa conversione una timbrata delle 07:00 finiva
 * alle 09:00 italiane, e data_evento/ora_evento (GENERATED in Europe/Rome) lo
 * avrebbero fedelmente registrato sbagliato.
 */
function istanteItaliano(ora: string): string {
  const oggi = new Date().toLocaleDateString("en-CA", { timeZone: "Europe/Rome" });
  const comeSeUTC = new Date(`${oggi}T${ora}:00Z`);
  // Che ora segna Roma in quell'istante? La differenza È l'offset del giorno.
  const aRoma = comeSeUTC.toLocaleString("sv-SE", { timeZone: "Europe/Rome" });
  const offsetMs = new Date(`${aRoma.replace(" ", "T")}Z`).getTime() - comeSeUTC.getTime();
  return new Date(comeSeUTC.getTime() - offsetMs).toISOString();
}

export async function registraPresenza(
  ctx: ToolCtx,
  args: Args,
): Promise<ToolResult<{ id: string; tipo: string }>> {
  if (!ctx.user_id) return errResult("no_user_id", "Non riesco a identificarti.");

  const oraCorrente = new Date().toLocaleTimeString("it-IT", {
    timeZone: "Europe/Rome",
    hour: "2-digit",
    minute: "2-digit",
  });
  const ora = args.ora ?? oraCorrente;

  // Stessa risoluzione del trigger che specchia le timbrature di cantiere:
  // profilo HR diretto, oppure via anagrafica dipendente.
  const { data: profiloId, error: profErr } = await ctx.supabase.rpc("hr_profilo_da_user", {
    p_user_id: ctx.user_id,
    p_company_id: ctx.company_id,
  });
  if (profErr) return errResult(profErr.message, "Errore cercando il tuo profilo HR.");
  if (!profiloId) {
    return errResult(
      "no_hr_profilo",
      "Non risulti collegato a un profilo del personale: chiedi all'ufficio di crearlo, poi riprova.",
    );
  }

  const { data: inserted, error } = await ctx.supabase
    .from("hr_timbrature")
    .insert({
      company_id: ctx.company_id,
      profilo_id: profiloId,
      tipo: TIPO_DB[args.tipo],
      timestamp: istanteItaliano(ora),
      lat: args.lat ?? null,
      lng: args.lng ?? null,
      fonte: "app",
      note: args.note ?? null,
    })
    .select("id")
    .single();

  if (error) return errResult(error.message, "Errore registrando la presenza.");

  return okResult(
    { id: inserted.id, tipo: args.tipo },
    `✅ ${args.tipo.replace("_", " ")} registrata alle ${ora}.`,
  );
}
