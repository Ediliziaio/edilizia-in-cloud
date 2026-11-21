import { percorsoStorageSicuro } from "../../../_shared/storageAmmesso.ts";
import { errResult, okResult, type ToolCtx, type ToolDef, type ToolResult } from "../shared/types.ts";

interface Args {
  descrizione?: string;
  mezzo?: string;
  tipo?: "guasto" | "danno" | "manutenzione";
}
interface Mezzo {
  id: string; nome: string; targa: string | null; codice: string | null;
  tipo: string | null; modello: string | null; assegnato_hr_profilo_id: string | null;
}

export const segnalaMezzoDef: Omit<ToolDef, "handler"> = {
  name: "segnala_mezzo",
  description: "Registra guasti, danni e richieste di manutenzione sulla scheda del mezzo o dell'attrezzatura. Usa targa, codice o nome detti dalla persona. Con un solo mezzo assegnato puoi omettere il nome. Se ci sono più corrispondenze chiedi quale usando i nomi restituiti. Non pianifica una manutenzione.",
  parameters: {
    type: "object",
    properties: {
      descrizione: { type: "string" },
      mezzo: { type: "string", description: "Targa, codice o nome, se indicato" },
      tipo: { type: "string", enum: ["guasto", "danno", "manutenzione"] },
    },
    required: ["descrizione"],
    additionalProperties: false,
  },
  requires_grants: ["segnalazione.write"],
};

const norm = (v: string | null | undefined) => (v ?? "").toLowerCase().normalize("NFD").replace(/\p{M}/gu, "")
  .replace(/[^a-z0-9]+/g, " ").trim();
const etichetta = (m: Mezzo) => [m.nome, m.targa || m.codice].filter(Boolean).join(" · ");
const colonne = "id,nome,targa,codice,tipo,modello,assegnato_hr_profilo_id";

export async function segnalaMezzo(ctx: ToolCtx, args: Args): Promise<ToolResult> {
  const descrizione = args.descrizione?.trim().slice(0, 5000) ?? "";
  if (descrizione.length < 5) return errResult("descrizione", "Dimmi che problema ha il mezzo.");
  if (!ctx.role_grants.includes("segnalazione.write") || (!ctx.user_id && !ctx.employee_id)) {
    return errResult("mezzi_non_abilitato", "Chiedi all’ufficio di verificare il tuo accesso alla scheda del mezzo.");
  }
  const [profili, permesso] = await Promise.all([
    ctx.supabase.from("hr_profili").select("id").eq("company_id", ctx.company_id).or("attivo.is.null,attivo.eq.true")
      .eq(ctx.user_id ? "user_id" : "employee_id", ctx.user_id ?? ctx.employee_id!),
    ctx.user_id && ctx.kind !== "operaio" ? ctx.supabase.rpc("has_permission_for_company", {
      _user_id: ctx.user_id, _permission: "can_edit_mezzi", _company_id: ctx.company_id,
    }) : Promise.resolve({ data: false, error: null }),
  ]);
  if (profili.error || permesso.error) return errResult("mezzi_non_disponibili", "Non riesco a verificare i mezzi disponibili. La segnalazione resta nella chat.");
  const profiloIds = (profili.data ?? []).map(p => p.id);
  const ricerca = () => ctx.supabase.from("mezzi").select(colonne).eq("company_id", ctx.company_id).is("deleted_at", null);
  const aziendali = permesso.data === true && !!norm(args.mezzo);
  const base = aziendali ? await ricerca()
    : profiloIds.length ? await ricerca().in("assegnato_hr_profilo_id", profiloIds) : { data: [] as Mezzo[], error: null };
  if (base.error) return errResult("mezzi_non_disponibili", "Non riesco a verificare i mezzi disponibili.");
  const assegnati = (base.data ?? []) as Mezzo[];
  const inCarico = assegnati.map(m => m.id);
  const trasportati = !aziendali && inCarico.length ? await ricerca().in("su_mezzo_id", inCarico) : { data: [], error: null };
  if (trasportati.error) return errResult("mezzi_non_disponibili", "Non riesco a verificare le attrezzature in carico.");
  const mezzi = [...new Map([...assegnati, ...(trasportati.data ?? []) as Mezzo[]].map(m => [m.id, m])).values()];
  const hint = norm(args.mezzo);
  const compatto = (v: string | null) => norm(v).replace(/ /g, "");
  const indicati = hint ? mezzi.filter(m => [m.targa, m.codice].some(v => v && compatto(v) === hint.replace(/ /g, ""))
      || [m.nome, m.tipo, m.modello].some(v => norm(v).includes(hint)))
    : mezzi.filter(m => [m.targa, m.codice].some(v => v && (" " + norm(descrizione) + " ").includes(" " + norm(v) + " ")));
  const candidati = indicati.length || hint ? indicati : mezzi;
  if (candidati.length !== 1) {
    const elenco = candidati.length > 1 ? candidati : mezzi;
    return errResult("mezzo_da_indicare", elenco.length
      ? "Quale mezzo? Rispondi con targa o nome e descrivi il problema.\n" + elenco.slice(0, 6).map(m => "• " + etichetta(m)).join("\n")
      : "Non trovo un mezzo corrispondente in carico. La segnalazione resta nella chat. Indica la targa all’ufficio.");
  }
  const [mezzo] = candidati;
  const nota = args.tipo === "manutenzione" ? "Richiesta manutenzione. " + descrizione : descrizione;
  const id = ctx.sourceMessageId ?? crypto.randomUUID();
  const { data, error } = await ctx.supabase.from("mezzi_segnalazioni").insert({
    id, company_id: ctx.company_id, mezzo_id: mezzo.id, tipo: args.tipo === "guasto" || args.tipo == null ? "guasto" : args.tipo === "danno" ? "danno" : "altro",
    descrizione: nota, created_by: ctx.user_id,
    hr_profilo_id: profiloIds.includes(mezzo.assegnato_hr_profilo_id) ? mezzo.assegnato_hr_profilo_id : profiloIds[0] ?? null,
  }).select("id").single();
  if (error || !data?.id) return errResult("segnalazione_mezzo_non_creata", "Non sono riuscito a salvare la segnalazione del mezzo. La trovi nella chat WhatsApp del gestionale.");

  const media = ctx.mediaCorrente;
  let fotoCollegata = false;
  if (media?.tipo === "image" && media.storagePath.startsWith(ctx.company_id + "/") && percorsoStorageSicuro(media.storagePath)) {
    const { data: file } = await ctx.supabase.storage.from("whatsapp-media").download(media.storagePath);
    if (file) {
      const path = [ctx.company_id, mezzo.id, "foto", id + "." + (media.storagePath.split(".").at(-1) ?? "jpg")].join("/");
      const { error: upload } = await ctx.supabase.storage.from("mezzi-documenti").upload(path, file, { contentType: file.type || "image/jpeg", upsert: false });
      if (!upload) {
        const { error: collegamento } = await ctx.supabase.from("mezzi_foto").insert({
          company_id: ctx.company_id, mezzo_id: mezzo.id, segnalazione_id: id, file_path: path, created_by: ctx.user_id,
        });
        fotoCollegata = !collegamento;
      }
    }
  }
  return okResult({ id, mezzo_id: mezzo.id, foto_collegata: fotoCollegata },
    "Segnalazione salvata sulla scheda di " + etichetta(mezzo) + " in Mezzi e attrezzature." +
    (media?.tipo === "image" && !fotoCollegata ? " La foto è disponibile in WhatsApp del gestionale." : ""));
}
