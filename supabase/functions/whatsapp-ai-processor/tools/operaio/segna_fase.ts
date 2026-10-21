// «Finito il massetto»: la fase del cantiere segnata come completata da
// WhatsApp (18/10/2026), come il tasto della pagina Avanzamento dell'app Campo.
//
// Stesse regole dell'app: la segna chi lavora sul cantiere (assegnazione
// diretta o squadra della commessa). Una fase con sottofasi si chiude
// spuntando le sottofasi dall'app (chi può spuntarle lo decide l'azienda): qui
// lo si dice invece di forzarla. La foto arrivata con il messaggio va sulla fase.

import type { ToolCtx, ToolDef, ToolResult } from "../shared/types.ts";
import { errResult, okResult } from "../shared/types.ts";

export const segnaFaseDef: Omit<ToolDef, "handler"> = {
  name: "segna_fase",
  description:
    "Segna come COMPLETATA una fase del cantiere (es. «finito il massetto», «fatto il getto del solaio»), " +
    "come il tasto dell'app Campo. Passa in fase il nome detto dall'operaio. Il cantiere lo propone il sistema nella conferma. " +
    "La foto mandata con il messaggio va sulla fase.",
  parameters: {
    type: "object",
    properties: {
      fase: { type: "string", description: "Nome della fase detto dall'operaio (es. «massetto», «impianto elettrico»)." },
      order_id: { type: "string", description: "Cantiere confermato nella conferma." },
    },
    required: ["fase"],
    additionalProperties: false,
  },
  requires_grants: ["fasi.write"],
  requires_confirmation: true,
};

function normalizza(t: unknown): string {
  return String(t ?? "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, " ").trim();
}

interface Fase { id: string; name: string; status: string | null; percentuale: number | null; position: number | null; foto_urls: unknown }

/** La fase nominata, fra quelle del cantiere: prima il nome esatto, poi quelle che lo contengono. */
export function faseNominata(fasi: Fase[], nome: string): { fase: Fase | null; candidate: Fase[] } {
  const n = normalizza(nome);
  if (!n) return { fase: null, candidate: [] };
  const esatte = fasi.filter((f) => normalizza(f.name) === n);
  if (esatte.length === 1) return { fase: esatte[0], candidate: esatte };
  const parole = n.split(" ").filter((p) => p.length >= 3);
  const simili = fasi.filter((f) => {
    const nf = normalizza(f.name);
    return nf.includes(n) || (parole.length > 0 && parole.every((p) => nf.includes(p)));
  });
  return { fase: simili.length === 1 ? simili[0] : null, candidate: simili };
}

export async function segnaFase(ctx: ToolCtx, args: { fase?: string; order_id?: string }): Promise<ToolResult> {
  if (!args.order_id) return errResult("site_missing", "Su quale cantiere? Rimandami il messaggio e scegli il cantiere.");
  const nome = String(args.fase ?? "").trim();
  if (nome.length < 2) return errResult("fase_mancante", "Quale fase hai finito?");

  const { data: righe, error } = await ctx.supabase.from("order_work_phases")
    .select("id, name, status, percentuale, position, foto_urls")
    .eq("company_id", ctx.company_id).eq("order_id", args.order_id)
    .order("position", { ascending: true });
  if (error) return errResult("fasi_non_lette", "Non riesco a leggere le fasi del cantiere adesso. Riprova tra poco.");
  const fasi = (righe ?? []) as Fase[];
  if (fasi.length === 0) return errResult("nessuna_fase", "Questo cantiere non ha fasi da segnare: l'avanzamento lo aggiorna l'ufficio.");

  const { fase, candidate } = faseNominata(fasi, nome);
  if (!fase) {
    const elenco = (candidate.length > 1 ? candidate : fasi).filter((f) => f.status !== "completata").slice(0, 10)
      .map((f) => `• ${f.name}`).join("\n");
    return errResult("fase_ambigua", candidate.length > 1
      ? `Quale di queste?\n${elenco}`
      : `Non trovo la fase «${nome}» su questo cantiere. Le fasi da fare sono:\n${elenco}`);
  }
  if (fase.status === "completata") return okResult({ fase_id: fase.id, gia_completata: true }, `La fase «${fase.name}» risulta già completata.`);

  const { data: aperte } = await ctx.supabase.from("order_work_subphases").select("id")
    .eq("phase_id", fase.id).eq("fatta", false).limit(100);
  const count = (aperte ?? []).length;
  if (count > 0) {
    return errResult("fase_con_sottofasi", `La fase «${fase.name}» ha ${count} sottofasi da spuntare: spuntale dall'app Campo (Avanzamento), la fase si chiude da sola.`);
  }

  // La foto del messaggio, nello stesso posto delle foto di fase dell'app.
  const foto: string[] = [];
  const media = ctx.mediaCorrente;
  if (media?.tipo === "image" && media.storagePath) {
    try {
      const { data: file } = await ctx.supabase.storage.from("whatsapp-media").download(media.storagePath);
      if (file) {
        const percorso = `${ctx.company_id}/${args.order_id}/fasi/${fase.id}/${Date.now()}_whatsapp.jpg`;
        const { data: up } = await ctx.supabase.storage.from("campo-rapportini").upload(percorso, file, { contentType: file.type || "image/jpeg", upsert: false });
        if (up?.path) foto.push(ctx.supabase.storage.from("campo-rapportini").getPublicUrl(up.path).data.publicUrl);
      }
    } catch { /* la fase si segna lo stesso: la foto si aggiunge dall'app */ }
  }
  const precedenti = Array.isArray(fase.foto_urls) ? (fase.foto_urls as string[]) : [];

  const { data: aggiornata, error: updError } = await ctx.supabase.from("order_work_phases")
    .update({
      status: "completata", percentuale: 100, completata_da: ctx.user_id, completata_il: new Date().toISOString(),
      ...(foto.length ? { foto_urls: [...precedenti, ...foto] } : {}),
    })
    .eq("id", fase.id).eq("company_id", ctx.company_id).neq("status", "completata")
    .select("id").maybeSingle();
  if (updError || !aggiornata) return errResult("fase_non_salvata", "Non sono riuscito a segnare la fase. Segnala dall'app Campo, in Avanzamento.");

  const { data: ordine } = await ctx.supabase.from("orders").select("order_code, description, client_name, percentuale_avanzamento")
    .eq("company_id", ctx.company_id).eq("id", args.order_id).maybeSingle();
  const cantiere = [ordine?.client_name || ordine?.description, ordine?.order_code].filter(Boolean).join(" · ") || "il cantiere";
  const avanzamento = typeof ordine?.percentuale_avanzamento === "number" ? ` Avanzamento del cantiere: ${ordine.percentuale_avanzamento}%.` : "";
  return okResult({ fase_id: fase.id, foto: foto.length },
    `✅ Fase «${fase.name}» completata su ${cantiere}${foto.length ? ", con la foto" : ""}.${avanzamento}`);
}
