import type { ToolCtx } from "./tools/shared/types.ts";
import type { CommessaAperta } from "./tools/shared/cantieriAperti.ts";
import { cercaCommesseUfficio, commesseAperte } from "./tools/shared/cantieriAperti.ts";
import { requireSiteAccess } from "./tools/shared/siteAccess.ts";
import { resolveCantiere } from "./tools/shared/resolve_cantiere.ts";

interface Bolla {
  id: string;
  source_key: string;
  created_by: string | null;
  employee_id: string | null;
  result: unknown;
  status: string;
}

const IN_LAVORAZIONE = ["queued", "processing", "review", "da_leggere", "error"];
const normalizza = (value: string) => value.toLowerCase().normalize("NFD").replace(/\p{M}/gu, "")
  .replace(/[^a-z0-9]+/g, " ").trim();

function campo(value: unknown, key: string): string | null {
  if (!value || typeof value !== "object" || !(key in value)) return null;
  const raw = (value as Record<string, unknown>)[key];
  return typeof raw === "string" && raw.trim() ? raw.trim() : null;
}

function sezione(value: unknown, key: string): unknown {
  return value && typeof value === "object" ? (value as Record<string, unknown>)[key] : null;
}

function datiBolla(bolla: Bolla) {
  return {
    numero: campo(sezione(bolla.result, "intestazione"), "numero_ddt"),
    fornitore: campo(sezione(bolla.result, "mittente"), "ragione_sociale"),
    indirizzo: campo(sezione(bolla.result, "luogo_destinazione"), "indirizzo"),
    riferimento: campo(sezione(bolla.result, "riferimenti"), "ordine_cliente"),
  };
}

export function leggiDestinazioneBolla(testo: string, allegato = false) {
  const t = testo.trim().slice(0, 500);
  // Una frase di rapportino non diventa la destinazione della bolla precedente.
  if (/\b(ore|rapportino|abbiamo (?:fatto|posato|montato)|ha lavorato)\b/i.test(t)) return null;
  const conferma = /^confermo\s+/i.test(t);
  const pulito = t.replace(/^confermo\s+/i, "").replace(/^(?:la|questa) bolla\s*/i, "")
    .replace(/^(?:(?:[èe]|va|mandala|scaricat[oa]|consegnat[oa])\s+)?(?:per|nel|nella|al|alla|in)\s+(?:il\s+|la\s+)?/i, "");
  const scarico = t.match(/^(?:confermo\s+)?scaricat[oa]\s+a\s+(.+)$/i);
  if (scarico) return { tipo: "luogo" as const, nome: scarico[1].trim(), conferma };
  const deposito = pulito.match(/^(?:magazzino|deposito)(?:\s+(?:di|a)\s+)?(.*)$/i);
  if (deposito) return { tipo: "magazzino" as const, nome: deposito[1].trim(), conferma };
  const cantiere = pulito.match(/^(?:cantiere|commessa)\s+(.+)$/i);
  if (cantiere) return { tipo: "cantiere" as const, nome: cantiere[1].trim(), conferma };
  const codice = pulito.match(/^([a-z]{1,12}-[a-z0-9-]+)[.!]?$/i);
  if (codice) return { tipo: "cantiere" as const, nome: codice[1], conferma };
  if (allegato) {
    const indicazione = t.match(/\b(?:per|al) (?:il )?(?:cantiere|commessa)\s+([^\n;]+)$/i);
    if (indicazione) return { tipo: "cantiere" as const, nome: indicazione[1].trim(), conferma };
  }
  return null;
}

function conParole(nome: string, testo: string) {
  const parole = normalizza(nome).split(" ").filter(p => p && !["di", "del", "della"].includes(p));
  const paroleRecord = new Set(normalizza(testo).split(" "));
  return parole.length > 0 && parole.every(p => paroleRecord.has(p));
}

function descriviCommessa(riga: CommessaAperta) {
  return [riga.client_name || riga.description, riga.indirizzo_lavori, riga.order_code].filter(Boolean).join(" · ");
}

async function cercaDestinazione(ctx: ToolCtx, hint: string) {
  const commesse = await commesseAperte(ctx);
  const trova = (c: CommessaAperta) => conParole(hint, [c.client_name, c.description, c.indirizzo_lavori, c.order_code].join(" "));
  const trovate = commesse.filter(trova);
  const candidati = trovate.length || ctx.kind === "operaio" ? trovate : (await cercaCommesseUfficio(ctx, hint)).filter(trova);
  return { candidati, disponibili: commesse };
}

/** La stessa acquisizione resta nella coda DDT. Mai un movimento implicito. */
export async function trattaBollaInConversazione(ctx: ToolCtx, input: {
  id: string; tipo: string; testo: string; riferimento: string | null; ddtLetto: boolean;
  providerId?: string;
}): Promise<string | { domandaDestinazione: string } | null> {
  const allegato = ["image", "document"].includes(input.tipo);
  if (allegato ? !input.ddtLetto : !["text", "audio"].includes(input.tipo)) return null;
  let destinazione = leggiDestinazioneBolla(input.testo, allegato);
  if (!allegato && !destinazione) return null;

  const recenti = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();
  const query = ctx.supabase.from("whatsapp_messages").select("id")
    .eq("company_id", ctx.company_id).eq("wa_number_id", ctx.waNumberId).eq("from_phone", ctx.phone)
    .eq("direction", "inbound").in("message_type", ["image", "document"]);
  const messaggi = await (allegato ? query.eq("id", input.id)
    : input.riferimento ? query.eq("wa_message_id", input.riferimento)
    : query.gte("created_at", recenti).order("created_at", { ascending: false }).limit(30));
  if (messaggi.error) throw new Error("bolle_in_conversazione_non_reperibili");
  if (!messaggi.data?.length) {
    if (allegato || !input.riferimento || !destinazione) return null;
    // Una risposta citata può arrivare prima del webhook dell'allegato.
    const corrente = await ctx.supabase.from("whatsapp_messages").select("ai_extracted_data")
      .eq("id", input.id).eq("company_id", ctx.company_id).eq("wa_number_id", ctx.waNumberId).maybeSingle();
    if (corrente.error || !corrente.data) throw new Error("destinazione_anticipata_non_verificabile");
    const salvata = await ctx.supabase.from("whatsapp_messages").update({
      ai_extracted_data: { ...corrente.data.ai_extracted_data, ddt_destinazione_in_attesa: input.testo.slice(0, 500) },
    }).eq("id", input.id).eq("company_id", ctx.company_id).eq("wa_number_id", ctx.waNumberId);
    if (salvata.error) throw new Error("destinazione_anticipata_non_salvata");
    return "Ho ricevuto la destinazione. La collego quando arriva il documento a cui hai risposto.";
  }
  const bolle = await ctx.supabase.from("ddt_document_jobs")
    .select("id, source_key, result, created_by, employee_id, status").eq("company_id", ctx.company_id)
    .eq("source", "whatsapp").in("source_key", messaggi.data.map(r => r.id)).in("status", IN_LAVORAZIONE)
    .is("order_id", null).is("warehouse_id", null).is("destinazione", null);
  if (bolle.error) throw new Error("bolle_in_attesa_non_reperibili");
  const ammesse = (bolle.data ?? []).filter(r => ctx.user_id
    ? r.created_by === ctx.user_id : ctx.employee_id && r.employee_id === ctx.employee_id) as Bolla[];
  if (!ammesse.length) return null;
  if (ammesse.length > 1) {
    const etichette = ammesse.slice(0, 4).map(r => {
      const d = datiBolla(r);
      return [d.numero ? `n. ${d.numero}` : null, d.fornitore].filter(Boolean).join(" · ");
    }).filter(Boolean);
    return `Ci sono ${ammesse.length} bolle da destinare.${etichette.length ? ` ${etichette.join(" / ")}.` : ""} Rispondi direttamente alla foto o al PDF della bolla giusta, indicando cantiere o magazzino.`;
  }

  const [bolla] = ammesse;
  const d = datiBolla(bolla);
  const etichetta = d.numero ? `Bolla n. ${d.numero}` : "Bolla";
  if (!destinazione && allegato && input.providerId) {
    const attese = await ctx.supabase.from("whatsapp_messages").select("ai_extracted_data")
      .eq("company_id", ctx.company_id).eq("wa_number_id", ctx.waNumberId).eq("from_phone", ctx.phone)
      .eq("direction", "inbound").in("message_type", ["text", "audio"]).gte("created_at", recenti)
      .contains("metadata", { reply_to: input.providerId }).not("ai_extracted_data->>ddt_destinazione_in_attesa", "is", null).limit(3);
    if (attese.error) throw new Error("destinazione_anticipata_non_reperibile");
    const indicazioni = [...new Set((attese.data ?? []).map(r => campo(r.ai_extracted_data, "ddt_destinazione_in_attesa")).filter(Boolean))];
    if (indicazioni.length === 1) destinazione = leggiDestinazioneBolla(indicazioni[0]!);
    if (indicazioni.length > 1) return `${etichetta} conservata. Ho ricevuto più destinazioni: rispondi alla bolla con quella corretta.`;
  }
  const daOda = d.riferimento && !destinazione?.conferma
    ? await resolveCantiere(ctx, undefined, { riferimento_ordine: d.riferimento }) : null;
  const commessaOda = daOda?.source === "oda" ? daOda.cantiere_id : null;
  const indirizzoLetto = normalizza(d.indirizzo ?? "");
  const indirizzi = !destinazione?.conferma && /\b\d+[a-z]?\b/.test(indirizzoLetto)
    ? (await commesseAperte(ctx)).filter(c => normalizza(c.indirizzo_lavori ?? "") === indirizzoLetto) : [];
  const commessaIndirizzo = indirizzi.length === 1 ? indirizzi[0] : null;
  if (!destinazione && commessaOda && commessaIndirizzo && commessaOda !== commessaIndirizzo.id) {
    return `${etichetta} conservata. Il numero d’ordine e l’indirizzo indicano cantieri diversi. Rispondi alla bolla con «Confermo Cantiere» e il codice corretto.`;
  }
  let orderId: string | null = null;
  let warehouseId: string | null = null;
  let descrizione: string;
  if (!destinazione) {
    orderId = d.indirizzo ? commessaIndirizzo?.id ?? null : commessaOda;
    if (!orderId) return { domandaDestinazione: `${etichetta} conservata in «DDT → Documenti in ingresso». Dove va la merce? Scrivi il cantiere o il magazzino.` };
    await requireSiteAccess(ctx, orderId);
    const nome = commessaIndirizzo ? descriviCommessa(commessaIndirizzo) : daOda?.cantiere_nome;
    descrizione = `sul cantiere ${nome ?? "indicato nel documento"}`;
  } else {
    const opzioni = destinazione.tipo === "magazzino" ? null : await cercaDestinazione(ctx, destinazione.nome);
    const candidati = opzioni?.candidati ?? [];
    let dep = ctx.supabase.from("warehouses").select("id, name")
      .eq("company_id", ctx.company_id).eq("is_active", true).order("name").limit(51);
    const cercaDepositi = destinazione.tipo !== "cantiere";
    if (cercaDepositi && ctx.soloMieiMagazzini) {
      const assegnati = await ctx.supabase.from("warehouse_assignments").select("warehouse_id")
        .eq("user_id", ctx.user_id!).eq("active", true);
      if (assegnati.error) throw new Error("assegnazioni_magazzino_non_reperibili");
      if (!assegnati.data?.length) return `${etichetta} conservata. Nessun deposito è assegnato al tuo profilo.`;
      dep = dep.in("id", assegnati.data.map(r => r.warehouse_id));
    }
    const depositi: { data: { id: string; name: string }[] | null; error: unknown } =
      cercaDepositi ? await dep : { data: [], error: null };
    if (depositi.error) throw new Error("magazzini_non_reperibili");
    const scelti = (depositi.data ?? []).filter(d => !destinazione!.nome || conParole(destinazione!.nome, d.name));
    if (destinazione.tipo === "luogo" && candidati.length + scelti.length !== 1) {
      return `${etichetta} conservata. Scrivi «Cantiere» o «Magazzino» seguito dal codice o dal nome.`;
    }
    if (destinazione.tipo === "cantiere" || candidati.length === 1) {
      if (candidati.length > 1) return `Quale cantiere?${candidati.slice(0, 5).map(c => `\n• ${descriviCommessa(c)}`).join("")}\nScrivi «Cantiere» seguito dal codice o dall’indirizzo.`;
      if (!candidati.length) {
        const codici = opzioni?.disponibili.flatMap(c => c.order_code ? [`Cantiere ${c.order_code}`] : []).slice(0, 4) ?? [];
        return codici.length
          ? `${etichetta} conservata. Per scegliere la destinazione, rispondi con uno di questi codici disponibili:\n${codici.map(codice => `• ${codice}`).join("\n")}`
          : `${etichetta} conservata. Chiedi all’ufficio di indicare la commessa in «DDT → Documenti in ingresso».`;
      }
      const cantiere = candidati[0];
      await requireSiteAccess(ctx, cantiere.id);
      orderId = cantiere.id;
      descrizione = `sul cantiere ${descriviCommessa(cantiere)}`;
    } else {
      if (scelti.length !== 1 || depositi.data?.length === 51) return `${etichetta} conservata. Quale magazzino? Scrivi «Magazzino» seguito dal nome del deposito.`;
      warehouseId = scelti[0].id;
      descrizione = `nel magazzino ${scelti[0].name}`;
    }
    const altro = commessaIndirizzo && commessaIndirizzo.id !== orderId
      ? descriviCommessa(commessaIndirizzo) : commessaOda && commessaOda !== orderId ? daOda?.cantiere_nome : null;
    if (altro) {
      return `La bolla indica ${altro}, ma hai indicato ${descrizione}. Se è corretto, scrivi «Confermo ${orderId ? "cantiere" : "magazzino"} ${destinazione.nome}» rispondendo alla bolla.`;
    }
  }

  let update = ctx.supabase.from("ddt_document_jobs").update({
    order_id: orderId, warehouse_id: warehouseId, destinazione: orderId ? "cantiere" : "magazzino", updated_at: new Date().toISOString(),
  }).eq("id", bolla.id).eq("company_id", ctx.company_id).eq("source_key", bolla.source_key)
    .in("status", IN_LAVORAZIONE).is("order_id", null).is("warehouse_id", null).is("destinazione", null);
  update = ctx.user_id ? update.eq("created_by", ctx.user_id) : update.is("created_by", null).eq("employee_id", ctx.employee_id!);
  const salvata = await update.select("id").maybeSingle();
  if (salvata.error) throw new Error("destinazione_bolla_non_salvata");
  if (!salvata.data) return `${etichetta} già aggiornata. Controlla la destinazione in «DDT → Documenti in ingresso».`;
  return `${etichetta} salvata ${descrizione}. L’ufficio trova l’originale e verifica le quantità prima della registrazione della merce.`;
}
