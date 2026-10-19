// «Assegna questa fattura al cliente Rossi» da WhatsApp (19/10/2026).
//
// Due passi, come farebbe una persona: prima si trova la fattura (per numero,
// fornitore o cliente), poi la commessa. La commessa la trova il sistema da ciò
// che ha scritto il titolare («Rossi», «via Verdi», il codice): se è una la
// propone con Sì / Altro cantiere / No, se sono più di una mostra l'elenco coi
// nomi. Nel riepilogo la fattura è descritta dal database, non dal modello.
//
// Fattura emessa → invoices.order_id (come «Abbina alle commesse»).
// Fattura ricevuta → costo della commessa (contabilizzata se serve).
// La scrittura la fa fattura_assegna_commessa, solo per l'amministratore.

import type { ToolCtx, ToolDef, ToolResult } from "../shared/types.ts";
import { errResult, okResult } from "../shared/types.ts";

export type TipoFattura = "ricevuta" | "emessa";

export interface FatturaTrovata {
  fattura_id: string;
  tipo: TipoFattura;
  descrizione: string;
}

const euro = (n: unknown) => Number.isFinite(Number(n))
  ? new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR" }).format(Number(n))
  : "importo non indicato";
const data = (v: unknown) => {
  const m = String(v ?? "").match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : "";
};
const pulisci = (t: string) => t.replace(/[%,()*\\]/g, " ").replace(/\s+/g, " ").trim();

async function codiciCommesse(ctx: ToolCtx, ids: Array<string | null>): Promise<Map<string, string>> {
  const unici = [...new Set(ids.filter((x): x is string => !!x))];
  if (!unici.length) return new Map();
  const { data: righe } = await ctx.supabase.from("orders").select("id, order_code, client_name, description")
    .eq("company_id", ctx.company_id).in("id", unici);
  return new Map(((righe ?? []) as Array<{ id: string; order_code: string | null; client_name: string | null; description: string | null }>)
    .map((o) => [o.id, [o.order_code, o.client_name || o.description].filter(Boolean).join(" · ") || "una commessa"]));
}

interface Ricevuta { id: string; numero_fattura: string | null; data_fattura: string | null; cedente_ragione_sociale: string | null; totale_documento: number | null; company_cost_id: string | null }
interface Emessa { id: string; invoice_number: string | null; issue_date: string | null; client_company_name: string | null; total: number | null; order_id: string | null }

async function descriviRicevute(ctx: ToolCtx, righe: Ricevuta[]): Promise<FatturaTrovata[]> {
  const costi = righe.map((r) => r.company_cost_id).filter((x): x is string => !!x);
  const commessaDelCosto = new Map<string, string | null>();
  if (costi.length) {
    const { data: c } = await ctx.supabase.from("company_costs").select("id, order_id, allocations")
      .eq("company_id", ctx.company_id).in("id", costi);
    for (const x of (c ?? []) as Array<{ id: string; order_id: string | null; allocations: unknown }>) {
      const ripartita = Array.isArray(x.allocations) && x.allocations.length === 1 ? (x.allocations[0] as { order_id?: string })?.order_id ?? null : null;
      commessaDelCosto.set(x.id, x.order_id ?? ripartita);
    }
  }
  const codici = await codiciCommesse(ctx, [...commessaDelCosto.values()]);
  return righe.map((r) => {
    const su = r.company_cost_id ? commessaDelCosto.get(r.company_cost_id) : null;
    return {
      fattura_id: r.id, tipo: "ricevuta" as const,
      descrizione: [`Fattura ricevuta n. ${r.numero_fattura ?? "s/n"}${r.data_fattura ? ` del ${data(r.data_fattura)}` : ""}`,
        r.cedente_ragione_sociale ?? "fornitore non indicato", euro(r.totale_documento),
        su ? `ora su ${codici.get(su) ?? "un'altra commessa"}` : "su nessuna commessa"].join(" · "),
    };
  });
}

async function descriviEmesse(ctx: ToolCtx, righe: Emessa[]): Promise<FatturaTrovata[]> {
  const codici = await codiciCommesse(ctx, righe.map((r) => r.order_id));
  return righe.map((r) => ({
    fattura_id: r.id, tipo: "emessa" as const,
    descrizione: [`Fattura emessa n. ${r.invoice_number ?? "s/n"}${r.issue_date ? ` del ${data(r.issue_date)}` : ""}`,
      r.client_company_name ?? "cliente non indicato", euro(r.total),
      r.order_id ? `ora su ${codici.get(r.order_id) ?? "un'altra commessa"}` : "su nessuna commessa"].join(" · "),
  }));
}

const COL_RICEVUTE = "id, numero_fattura, data_fattura, cedente_ragione_sociale, totale_documento, company_cost_id";
const COL_EMESSE = "id, invoice_number, issue_date, client_company_name, total, order_id";

/** Le fatture che corrispondono a numero, fornitore o cliente scritti. */
export async function cercaFatture(ctx: ToolCtx, testo: string, tipo?: TipoFattura): Promise<FatturaTrovata[]> {
  const t = pulisci(testo);
  if (t.length < 2) return [];
  const like = `%${t}%`;
  const [ric, emi] = await Promise.all([
    tipo === "emessa" ? Promise.resolve({ data: [] as Ricevuta[], error: null }) :
      ctx.supabase.from("fatture_ricevute").select(COL_RICEVUTE).eq("company_id", ctx.company_id)
        .or(`numero_fattura.ilike.${like},cedente_ragione_sociale.ilike.${like}`)
        .order("data_fattura", { ascending: false }).limit(5),
    tipo === "ricevuta" ? Promise.resolve({ data: [] as Emessa[], error: null }) :
      ctx.supabase.from("invoices").select(COL_EMESSE).eq("company_id", ctx.company_id).is("deleted_at", null)
        .neq("status", "cancelled")
        .or(`invoice_number.ilike.${like},client_company_name.ilike.${like}`)
        .order("issue_date", { ascending: false }).limit(5),
  ]);
  if (ric.error || emi.error) throw new Error("fatture_non_leggibili");
  return [...await descriviRicevute(ctx, (ric.data ?? []) as Ricevuta[]), ...await descriviEmesse(ctx, (emi.data ?? []) as Emessa[])];
}

/** La riga che descrive QUESTA fattura, letta dal database (per il riepilogo della conferma). */
export async function descriviFattura(ctx: ToolCtx, tipo: TipoFattura, id: string): Promise<string | null> {
  if (tipo === "ricevuta") {
    const { data: r } = await ctx.supabase.from("fatture_ricevute").select(COL_RICEVUTE)
      .eq("company_id", ctx.company_id).eq("id", id).maybeSingle();
    return r ? (await descriviRicevute(ctx, [r as Ricevuta]))[0].descrizione : null;
  }
  const { data: e } = await ctx.supabase.from("invoices").select(COL_EMESSE)
    .eq("company_id", ctx.company_id).eq("id", id).is("deleted_at", null).maybeSingle();
  return e ? (await descriviEmesse(ctx, [e as Emessa]))[0].descrizione : null;
}

export const cercaFatturaDef: Omit<ToolDef, "handler"> = {
  name: "cerca_fattura",
  description:
    "Trova una fattura per numero, fornitore o cliente, prima di assegnarla a una commessa. Cerca fra le fatture ricevute " +
    "dai fornitori e quelle emesse ai clienti. Se ne trova UNA, passa subito ad assegna_fattura; se ne trova di più, " +
    "mostra l'elenco numerato e chiedi quale. Per una foto o un PDF di fattura, cerca col numero e il fornitore letti.",
  parameters: {
    type: "object",
    properties: {
      testo: { type: "string", description: "Numero della fattura, oppure nome del fornitore o del cliente." },
      tipo: { type: "string", enum: ["ricevuta", "emessa"], description: "Se è chiaro: ricevuta (da un fornitore) o emessa (a un cliente)." },
    },
    required: ["testo"],
    additionalProperties: false,
  },
  requires_grants: ["fatture.assegna"],
};

export async function cercaFattura(ctx: ToolCtx, args: Record<string, unknown>): Promise<ToolResult> {
  const testo = typeof args.testo === "string" ? args.testo : "";
  const tipo = args.tipo === "ricevuta" || args.tipo === "emessa" ? args.tipo : undefined;
  let trovate: FatturaTrovata[];
  try { trovate = await cercaFatture(ctx, testo, tipo); }
  catch { return errResult("fatture_non_leggibili", "Non riesco a leggere le fatture adesso: riprova tra poco."); }
  if (trovate.length === 0) {
    return okResult({ fatture: [] }, `Non trovo fatture per «${pulisci(testo)}». Dimmi il numero esatto o il nome del fornitore o del cliente.`);
  }
  return okResult({ fatture: trovate });
}

export const assegnaFatturaDef: Omit<ToolDef, "handler"> = {
  name: "assegna_fattura",
  description:
    "Mette una fattura su una commessa: una fattura RICEVUTA diventa costo della commessa, una EMESSA si collega alla " +
    "commessa del cliente. Prima trova la fattura con cerca_fattura. In cantiere_hint passa ciò che ha scritto la persona " +
    "per la commessa («Rossi», «via Verdi», il codice): la commessa la trova e la propone il sistema nella conferma.",
  parameters: {
    type: "object",
    properties: {
      fattura_id: { type: "string", description: "Id restituito da cerca_fattura." },
      tipo: { type: "string", enum: ["ricevuta", "emessa"] },
      cantiere_hint: { type: "string", description: "Cliente, indirizzo o codice della commessa, come l'ha scritto la persona." },
      order_id: { type: "string", description: "Commessa scelta nella conferma." },
      fattura: { type: "string", description: "Lo scrive il sistema nella conferma: non serve passarlo." },
    },
    required: ["fattura_id", "tipo"],
    additionalProperties: false,
  },
  requires_grants: ["fatture.assegna"],
  requires_confirmation: true,
};

export async function assegnaFattura(ctx: ToolCtx, args: Record<string, unknown>): Promise<ToolResult> {
  if (!ctx.user_id || ctx.kind !== "admin") return errResult("non_ammesso", "Le fatture le assegna l'amministratore dell'azienda.");
  const tipo = args.tipo === "ricevuta" || args.tipo === "emessa" ? args.tipo : null;
  if (!tipo || typeof args.fattura_id !== "string") return errResult("invalid_args", "Dimmi quale fattura: cercala prima per numero o fornitore.");
  if (typeof args.order_id !== "string") return errResult("site_missing", "Dimmi su quale commessa: il cliente, l'indirizzo o il codice.");
  const { data: esito, error } = await ctx.supabase.rpc("fattura_assegna_commessa", {
    p_company_id: ctx.company_id, p_user_id: ctx.user_id, p_tipo: tipo, p_fattura_id: args.fattura_id, p_order_id: args.order_id,
  });
  if (error) {
    // I motivi scritti dal database («ripartita su più commesse», «non risulta») si dicono così come sono.
    const motivo = (error as { code?: string; message?: string }).code === "P0001" ? (error as { message: string }).message : null;
    return errResult("assegnazione_fallita", motivo ?? "Non sono riuscito ad assegnare la fattura. Nessuna modifica fatta: riprova dall'app.");
  }
  const e = (esito ?? {}) as { commessa?: string; era_su?: string | null; order_id?: string };
  const spostata = e.era_su && e.era_su !== e.order_id ? " Prima era su un'altra commessa." : "";
  const cosa = tipo === "ricevuta" ? "Il costo è sulla commessa" : "La fattura è collegata alla commessa";
  return okResult(esito, `✅ ${cosa} ${e.commessa ?? ""}.${spostata}`);
}
