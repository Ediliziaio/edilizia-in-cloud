import type { ToolCtx } from "./tools/shared/types.ts";
import type { CommessaAperta } from "./tools/shared/cantieriAperti.ts";
import { cercaCommesseUfficio, commesseAperte, oggiARoma } from "./tools/shared/cantieriAperti.ts";
import { requireSiteAccess } from "./tools/shared/siteAccess.ts";
import { resolveCantiere } from "./tools/shared/resolve_cantiere.ts";
import { percorsoStorageSicuro } from "../_shared/storageAmmesso.ts";

export interface Bolla {
  id: string;
  source_key: string;
  created_by: string | null;
  employee_id: string | null;
  result: unknown;
  status: string;
}

export const IN_LAVORAZIONE = ["queued", "processing", "review", "da_leggere", "error"];
const TIPI_DOCUMENTO = ["image", "document"];
export const idWhatsAppValido = (id: unknown): id is string => typeof id === "string" && /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(id);
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

export function datiBolla(bolla: Pick<Bolla, "result">) {
  return {
    numero: campo(sezione(bolla.result, "intestazione"), "numero_ddt"),
    fornitore: campo(sezione(bolla.result, "mittente"), "ragione_sociale"),
    indirizzo: campo(sezione(bolla.result, "luogo_destinazione"), "indirizzo"),
    riferimento: campo(sezione(bolla.result, "riferimenti"), "ordine_acquisto")
      ?? campo(sezione(bolla.result, "riferimenti"), "ordine_cliente"),
  };
}

export function leggiDestinazioneBolla(testo: string, allegato = false, seguitoBolla = false) {
  const t = testo.trim().slice(0, 500);
  // Una frase di rapportino non diventa la destinazione della bolla precedente.
  if (/\b(ore|rapportino|abbiamo (?:fatto|posato|montato)|ha lavorato)\b/i.test(t)) return null;
  const conferma = /^confermo\s+/i.test(t);
  const senzaConferma = t.replace(/^confermo\s+/i, "");
  const ordineEsplicito = senzaConferma.match(/^(?:carica|salva|registra|collega|assegna|metti|manda)\s+(?:(?:la|questa|il|questo)\s+)?(?:bolla|ddt)\s+(?:in|nel|nella|su|sul|sulla|a|al|alla|per)\s+(.+)$/i);
  const rispostaEsplicita = senzaConferma.match(/^(?:(?:la|questa) bolla\s+)?(?:[èe]|va)\s+(?:per|nel|nella|al|alla|in)\s+(?:il\s+|la\s+)?(.+)$/i);
  const pulito = (ordineEsplicito?.[1] ?? rispostaEsplicita?.[1] ?? senzaConferma.replace(/^(?:la|questa) bolla[,\s:]*/i, ""))
    .replace(/^(?:(?:[èe]|va|mandala|scaricat[oa]|consegnat[oa])\s+)?(?:per|nel|nella|al|alla|in)\s+(?:il\s+|la\s+)?/i, "")
    .replace(/^(?:il|la)\s+/i, "").trim();
  const scarico = t.match(/^(?:confermo\s+)?scaricat[oa]\s+a\s+(.+)$/i);
  if (scarico) return { tipo: "luogo" as const, nome: scarico[1].trim(), conferma };
  const deposito = pulito.match(/^(?:magazzino|deposito)(?:\s+(?:di|a)\s+)?(.*)$/i);
  if (deposito) return { tipo: "magazzino" as const, nome: deposito[1].trim(), conferma };
  const cantiere = pulito.match(/^(?:cantiere|commessa)\s+(.+)$/i);
  if (cantiere) return { tipo: "cantiere" as const, nome: cantiere[1].trim(), conferma };
  const codice = pulito.match(/^([a-z]{1,12}-[a-z0-9-]+)[.!]?$/i);
  if (codice) return { tipo: "cantiere" as const, nome: codice[1], conferma };
  if ((ordineEsplicito || (seguitoBolla && (rispostaEsplicita || /^per\s+/i.test(senzaConferma)))) && normalizza(pulito)) {
    return { tipo: "luogo" as const, nome: pulito, conferma };
  }
  if (allegato) {
    const indicazione = t.match(/\b(?:per|al) (?:il )?(?:cantiere|commessa)\s+([^\n;]+)$/i);
    if (indicazione) return { tipo: "cantiere" as const, nome: indicazione[1].trim(), conferma };
  }
  return null;
}

export function conParole(nome: string, testo: string) {
  const parole = normalizza(nome).split(" ").filter(p => p && !["di", "del", "della"].includes(p));
  const paroleRecord = new Set(normalizza(testo).split(" "));
  return parole.length > 0 && parole.every(p => paroleRecord.has(p));
}

export function descriviCommessa(riga: CommessaAperta) {
  return [riga.client_name || riga.description, riga.indirizzo_lavori, riga.order_code].filter(Boolean).join(" · ");
}

export async function cercaDestinazione(ctx: ToolCtx, hint: string) {
  const commesse = await commesseAperte(ctx);
  const trova = (c: CommessaAperta) => conParole(hint, [c.client_name, c.description, c.indirizzo_lavori, c.order_code].join(" "));
  const trovate = commesse.filter(trova);
  const candidati = trovate.length || ctx.kind === "operaio" ? trovate : (await cercaCommesseUfficio(ctx, hint)).filter(trova);
  return { candidati, disponibili: commesse };
}

function messaggiConDocumento(ctx: ToolCtx) {
  return ctx.supabase.from("whatsapp_messages")
    .select("id, ai_extracted_data, message_type, media_storage_path, media_url")
    .eq("company_id", ctx.company_id).eq("wa_number_id", ctx.waNumberId).eq("from_phone", ctx.phone)
    .eq("direction", "inbound").in("message_type", TIPI_DOCUMENTO);
}

export async function riprendiOriginaleBolla(ctx: ToolCtx, fotoId?: string | null, riferimento?: string | null) {
  if (!fotoId && !riferimento) return null;
  const query = messaggiConDocumento(ctx);
  const { data, error } = await (riferimento ? query.eq("wa_message_id", riferimento) : query.eq("id", fotoId!)).maybeSingle();
  if (error) throw new Error("originale_bolla_non_reperibile");
  if (!data?.media_storage_path || !data.media_storage_path.startsWith(`${ctx.company_id}/`) || !percorsoStorageSicuro(data.media_storage_path)) return null;
  return { id: data.id as string, media: { storagePath: data.media_storage_path as string, url: data.media_url ?? "", tipo: data.message_type },
    estrazione: data.ai_extracted_data };
}

export async function magazziniPerBolla(ctx: ToolCtx): Promise<{ id: string; name: string }[]> {
  let query = ctx.supabase.from("warehouses").select("id, name")
    .eq("company_id", ctx.company_id).eq("is_active", true).order("name").limit(51);
  if (ctx.soloMieiMagazzini) {
    if (!ctx.user_id) return [];
    const assegnati = await ctx.supabase.from("warehouse_assignments").select("warehouse_id")
      .eq("user_id", ctx.user_id).eq("active", true);
    if (assegnati.error) throw new Error("assegnazioni_magazzino_non_reperibili");
    if (!assegnati.data?.length) return [];
    query = query.in("id", assegnati.data.map(r => r.warehouse_id));
  }
  const { data, error } = await query;
  if (error) throw new Error("magazzini_non_reperibili");
  return data ?? [];
}

export type SceltaDestinazioneBolla = { tipo: "cantiere" | "magazzino"; id: string };
export type DomandaDestinazioneBolla = { domandaDestinazione: string; fotoId: string; etichetta: string; posticipata?: boolean; invio?: boolean };

/** La stessa acquisizione resta nella coda DDT. Mai un movimento implicito. */
export async function trattaBollaInConversazione(ctx: ToolCtx, input: {
  id: string; tipo: string; testo: string; riferimento: string | null; ddtLetto: boolean;
  providerId?: string;
  fotoAssociata?: string | null;
  scelta?: SceltaDestinazioneBolla;
  mostraScelta?: boolean;
  posticipa?: (testo: string) => Promise<boolean>;
  onBollaIndividuata?: (id: string) => void;
}): Promise<string | DomandaDestinazioneBolla | null> {
  const allegato = TIPI_DOCUMENTO.includes(input.tipo);
  if (allegato ? !input.ddtLetto : !["text", "audio"].includes(input.tipo)) return null;
  const scelta = input.scelta;
  let destinazione = scelta ? { tipo: scelta.tipo, nome: "", conferma: true }
    : leggiDestinazioneBolla(input.testo, allegato, !!(input.fotoAssociata || input.riferimento));
  let vocaleId = input.tipo === "audio" && idWhatsAppValido(input.id) && ctx.requestId === input.id ? input.id : null;
  if (!allegato && !destinazione) return null;

  const recenti = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();
  const query = messaggiConDocumento(ctx);
  const messaggi = await (allegato ? query.eq("id", input.id)
    : input.riferimento ? query.eq("wa_message_id", input.riferimento)
    : input.fotoAssociata ? query.eq("id", input.fotoAssociata)
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
  const pratiche = () => ctx.supabase.from("ddt_document_jobs")
    .select("id, source_key, result, created_by, employee_id, status").eq("company_id", ctx.company_id)
    .eq("source", "whatsapp").in("status", IN_LAVORAZIONE)
    .is("order_id", null).is("warehouse_id", null).is("destinazione", null);
  const bollate = messaggi.data.map(r => r.ai_extracted_data?.ddt_job_id).filter(idWhatsAppValido);
  const perFoto = await pratiche().in("source_key", messaggi.data.map(r => r.id));
  const perId = bollate.length ? await pratiche().in("id", bollate) : null;
  if (perFoto.error || perId?.error) throw new Error("bolle_in_attesa_non_reperibili");
  const tutte = [...new Map([...(perFoto.data ?? []), ...(perId?.data ?? [])].map(r => [r.id, r])).values()];
  const ammesse = tutte.filter(r => ctx.user_id
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
  input.onBollaIndividuata?.(bolla.id);
  const d = datiBolla(bolla);
  const etichetta = d.numero ? `Bolla n. ${d.numero}` : "Bolla";
  const fotoId = String(messaggi.data.find(r => r.id === bolla.source_key || r.ai_extracted_data?.ddt_job_id === bolla.id)?.id ?? input.id);
  const scegli: DomandaDestinazioneBolla = { fotoId, etichetta,
    domandaDestinazione: `${etichetta} conservata in «DDT → Documenti in ingresso». Dove va la merce? Scrivi il cantiere o il magazzino.` };
  if (input.mostraScelta) return scegli;
  if (allegato && !destinazione && await input.posticipa?.(scegli.domandaDestinazione)) {
    return { ...scegli, posticipata: true };
  }
  if (!destinazione && allegato && input.providerId) {
    const attese = await ctx.supabase.from("whatsapp_messages").select("id, message_type, ai_extracted_data")
      .eq("company_id", ctx.company_id).eq("wa_number_id", ctx.waNumberId).eq("from_phone", ctx.phone)
      .eq("direction", "inbound").in("message_type", ["text", "audio"]).gte("created_at", recenti)
      .contains("metadata", { reply_to: input.providerId }).not("ai_extracted_data->>ddt_destinazione_in_attesa", "is", null).limit(3);
    if (attese.error) throw new Error("destinazione_anticipata_non_reperibile");
    const indicazioni = [...new Set((attese.data ?? []).map(r => campo(r.ai_extracted_data, "ddt_destinazione_in_attesa")).filter(Boolean))];
    if (indicazioni.length === 1) {
      destinazione = leggiDestinazioneBolla(indicazioni[0]!, false, true);
      vocaleId = attese.data?.find(r => r.message_type === "audio")?.id ?? null;
    }
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
    if (!orderId) return scegli;
    await requireSiteAccess(ctx, orderId);
    const nome = commessaIndirizzo ? descriviCommessa(commessaIndirizzo) : daOda?.cantiere_nome;
    descrizione = `cantiere ${nome ?? "indicato nel documento"}`;
  } else {
    const oggi = oggiARoma();
    const opzioni = destinazione.tipo === "magazzino" ? null : scelta
      ? { candidati: (await commesseAperte(ctx)).filter(c => c.id === scelta.id && (!c.work_start_date || c.work_start_date <= oggi)), disponibili: [] as CommessaAperta[] }
      : await cercaDestinazione(ctx, destinazione.nome);
    const candidati = opzioni?.candidati ?? [];
    const cercaDepositi = destinazione.tipo !== "cantiere";
    const depositi = cercaDepositi ? await magazziniPerBolla(ctx) : [];
    if (destinazione.tipo === "magazzino" && !depositi.length && ctx.soloMieiMagazzini) {
      return etichetta + " conservata. Chiedi all’ufficio di indicare il deposito.";
    }
    const scelti = depositi.filter(d => scelta ? d.id === scelta.id : !destinazione!.nome || conParole(destinazione!.nome, d.name));
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
      descrizione = `cantiere ${descriviCommessa(cantiere)}`;
    } else {
      if (scelti.length !== 1 || (!scelta && depositi.length === 51)) return `${etichetta} conservata. Quale magazzino? Scrivi «Magazzino» seguito dal nome del deposito.`;
      warehouseId = scelti[0].id;
      descrizione = `magazzino ${scelti[0].name}`;
    }
    const altro = commessaIndirizzo && commessaIndirizzo.id !== orderId
      ? descriviCommessa(commessaIndirizzo) : commessaOda && commessaOda !== orderId ? daOda?.cantiere_nome : null;
    if (altro) {
      return `La bolla indica ${altro}, ma hai indicato ${descrizione}. Se è corretto, scrivi «Confermo ${orderId ? "cantiere" : "magazzino"} ${destinazione.nome}» rispondendo alla bolla.`;
    }
  }

  let update = ctx.supabase.from("ddt_document_jobs").update({
    order_id: orderId, warehouse_id: warehouseId, destinazione: orderId ? "cantiere" : "magazzino", updated_at: new Date().toISOString(),
    ...(vocaleId ? { whatsapp_voice_message_id: vocaleId } : {}),
  }).eq("id", bolla.id).eq("company_id", ctx.company_id).eq("source_key", bolla.source_key)
    .in("status", IN_LAVORAZIONE).is("order_id", null).is("warehouse_id", null).is("destinazione", null);
  update = ctx.user_id ? update.eq("created_by", ctx.user_id) : update.is("created_by", null).eq("employee_id", ctx.employee_id!);
  const salvata = await update.select("id").maybeSingle();
  if (salvata.error) throw new Error("destinazione_bolla_non_salvata");
  if (!salvata.data) return `${etichetta} già aggiornata. Controlla la destinazione in «DDT → Documenti in ingresso».`;
  return `${etichetta} collegata al ${descrizione}. L’ufficio verifica le quantità prima di registrare la merce.`;
}
