import { errResult, okResult, type ToolCtx, type ToolDef } from "../shared/types.ts";

export const apriFattureClienteDef: Omit<ToolDef, "handler"> = {
  name: "apri_fatture_cliente",
  description: "Cerca fatture emesse per nome cliente o numero e restituisce i link al dettaglio riservato nell’app. Usa quando chi scrive chiede di vedere, aprire o ricevere le fatture di un cliente. Riporta i link del risultato, senza crearne altri. Non invia nulla al cliente.",
  parameters: {
    type: "object",
    properties: { ricerca: { type: "string", maxLength: 100, description: "Nome del cliente o numero della fattura." } },
    required: ["ricerca"],
    additionalProperties: false,
  },
  requires_grants: ["fatture.read"],
};

export async function apriFattureCliente(ctx: ToolCtx, args: Record<string, unknown>) {
  if (!ctx.user_id || !["admin", "ufficio"].includes(ctx.kind) || !ctx.role_grants.includes("fatture.read")) {
    return errResult("fatture_non_autorizzate", "Può vedere le fatture chi ha accesso ai Documenti fiscali.");
  }
  const ricerca = typeof args.ricerca === "string" ? args.ricerca.replace(/[%,()*"\\]/g, " ").replace(/\s+/g, " ").trim() : "";
  if (ricerca.length < 2 || ricerca.length > 100) return errResult("fattura_da_identificare", "Scrivimi il nome del cliente o il numero della fattura.");
  const filtro = `%${ricerca}%`;
  const { data, error } = await ctx.supabase.from("documenti_fiscali_elenco_con_importate")
    .select("id, origine, numero, elenco_cliente, data_emissione, stato")
    .eq("company_id", ctx.company_id).eq("tipo", "fattura").is("deleted_at", null)
    .not("stato", "in", "(bozza,annullata)")
    .or(`numero.ilike.${filtro},elenco_cliente.ilike.${filtro}`)
    .order("data_emissione", { ascending: false }).order("id").limit(6);
  if (error) return errResult("fatture_non_leggibili", "Non riesco a leggere le fatture ora. Le trovi in Documenti fiscali.");
  const base = (Deno.env.get("APP_URL") ?? "https://app.ediliziaincloud.com").replace(/\/$/, "");
  const righe = data ?? [];
  const fatture = righe.slice(0, 5).map(f => ({
    numero: f.numero, cliente: f.elenco_cliente, data: f.data_emissione, stato: f.stato,
    link: base + (f.origine === "importata" ? `/azienda/documenti/importata/${f.id}` : `/azienda/documenti/${f.id}/dettaglio`),
  }));
  return okResult({ fatture, altri_risultati: righe.length > 5 },
    fatture.length ? "I link si aprono con l’accesso al gestionale." : "Non ho trovato fatture emesse per questa ricerca.");
}
