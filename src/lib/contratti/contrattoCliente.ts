/**
 * I dati del contratto col committente (09/11/2026), senza React né database: dalla commessa col testo scritto
 * dall'AI, oppure dall'accordo col committente col suo listino. Il disegno sta in `ContrattoClientePDF`.
 */
import type { RigaContratto } from "../../../supabase/functions/_shared/testoRiccoContratto";
import { righeSocietarie, type DatiSocietari } from "../../../supabase/functions/_shared/datiSocietari";
import { TITOLO_CONDIZIONI_CONTRATTO, TITOLO_CLAUSOLE_1341 } from "../../../supabase/functions/_shared/condizioniArchivio";
import { righeDelContratto } from "@/lib/orders/contrattoCommittentePdf";
import { euroContratto, type RigaElencoLavori } from "@/lib/subappaltatori/contrattoSubappaltoHtml";

export interface ArticoloCliente { titolo: string; paragrafi: string[]; fascia?: boolean }
export interface RigaEconomica { label: string; valore: string; forte?: boolean }

export interface DatiContrattoCliente {
  titolo: string;
  numero: string | null;
  sottotitolo: string;
  etichettaImpresa: string;
  impresa: { ragioneSociale: string; partitaIva: string; codiceFiscale?: string; sede: string; pec?: string };
  committente: { nome: string; partitaIva?: string; codiceFiscale?: string; indirizzo: string; email?: string; telefono?: string; rappresentante?: string };
  cantiere: Array<[string, string]>;
  economico: { titolo: string; destra?: string; righe: RigaEconomica[]; nota?: string };
  articoli: ArticoloCliente[];
  daApprovare: string[];
  elenco: RigaElencoLavori[];
  titoloElenco: string;
  sottoElenco: string;
  /** Il listino dell'accordo: si concordano i prezzi, le quantità verranno dai lavori. */
  soloPrezzi?: boolean;
  firme: { sinistra: string; destra: string };
  societarie: string[];
  companyId?: string | null;
}

/** «2. OGGETTO DEI LAVORI» → «Oggetto dei lavori»: il numero lo mette il documento. */
export function titoloArticolo(testo: string): string {
  const t = testo.replace(/^\s*(?:art(?:icolo)?\.?\s*)?\d+\s*[.)\-–:]*\s*/i, "").trim();
  return t === t.toUpperCase() ? t.charAt(0) + t.slice(1).toLowerCase() : t;
}

const eTitolo = (r: RigaContratto) => r.tipo === "h1" || r.tipo === "h2";
/** Le parti stanno già nei riquadri in alto: l'intestazione scritta dall'AI sarebbe un doppione. */
const eIntestazione = (t: string) => /^(intestazione|parti( contraenti)?|tra le parti)\b/i.test(t);
const eTitoloCondizioni = (t: string) => t === TITOLO_CONDIZIONI_CONTRATTO.replace(/^#+\s*/, "");

/** Dal testo del contratto agli articoli; la seconda firma a parte. */
export function articoliDalContratto(md: string | null | undefined): { articoli: ArticoloCliente[]; daApprovare: string[] } {
  const articoli: ArticoloCliente[] = [];
  const daApprovare: string[] = [];
  let corrente: ArticoloCliente | null = null;
  let scarta = true; // prima del primo titolo: il titolo del contratto e il numero, già nella fascia
  let approvazione = false;
  for (const r of righeDelContratto(md)) {
    if (eTitolo(r)) {
      approvazione = r.testo === TITOLO_CLAUSOLE_1341;
      corrente = null;
      scarta = r.tipo === "h1" || eIntestazione(titoloArticolo(r.testo));
      if (approvazione || scarta) continue;
      if (eTitoloCondizioni(r.testo)) { articoli.push({ titolo: r.testo, paragrafi: [], fascia: true }); continue; }
      corrente = { titolo: titoloArticolo(r.testo), paragrafi: [] };
      articoli.push(corrente);
      continue;
    }
    if (approvazione) { if (r.tipo === "li") daApprovare.push(r.testo); continue; }
    if (scarta || !corrente) continue;
    corrente.paragrafi.push(r.tipo === "li" && !/^\d+\./.test(r.testo) ? `• ${r.testo}` : r.testo);
  }
  return { articoli, daApprovare };
}

const giorno = (iso: string | null | undefined): string => {
  const d = iso ? new Date(iso) : null;
  return d && !Number.isNaN(d.getTime()) ? d.toLocaleDateString("it-IT", { timeZone: "Europe/Rome" }) : "—";
};
// deno-lint-ignore no-explicit-any
type Riga = Record<string, any>;
const num = (v: unknown): number => { const n = Number(v); return Number.isFinite(n) ? n : 0; };
const testo = (v: unknown): string => String(v ?? "").trim();

function impresaDa(d: DatiSocietari | null): DatiContrattoCliente["impresa"] {
  return { ragioneSociale: d?.ragioneSociale ?? "", partitaIva: d?.partitaIva ?? "", codiceFiscale: d?.codiceFiscale ?? undefined, sede: d?.sede ?? "", pec: d?.pec ?? undefined };
}

function committenteDa(p: Riga | null | undefined, ripiego: Riga = {}): DatiContrattoCliente["committente"] {
  const persona = [testo(p?.first_name), testo(p?.last_name)].filter(Boolean).join(" ");
  const luogo = [[testo(p?.postal_code), testo(p?.city)].filter(Boolean).join(" "), testo(p?.province) ? `(${testo(p?.province)})` : ""].filter(Boolean).join(" ");
  return {
    nome: testo(ripiego.nome) || testo(p?.business_name) || persona,
    partitaIva: testo(p?.vat_number) || undefined, codiceFiscale: testo(p?.fiscal_code) || undefined,
    indirizzo: testo(ripiego.indirizzo) || [testo(p?.address), luogo].filter(Boolean).join(", "),
    email: testo(ripiego.email) || testo(p?.email) || undefined, telefono: testo(ripiego.telefono) || testo(p?.phone) || undefined,
  };
}

/** Il contratto di una commessa: il testo dell'AI, i dati della commessa e le sue voci in Allegato A. */
export function datiDaCommessa(a: { contratto: Riga; md: string; ordine: Riga; voci: Riga[]; societari: DatiSocietari | null; companyId?: string | null }): DatiContrattoCliente {
  const { ordine: o, contratto: c } = a;
  const { articoli, daApprovare } = articoliDalContratto(a.md);
  const imponibile = num(o.total_amount);
  const ivaPct = num(o.vat_rate);
  const iva = Math.round(imponibile * ivaPct) / 100;
  const rate: Array<[string, unknown]> = [["Acconto", o.deposit_amount], ["Secondo acconto", o.deposit_2_amount], ["Saldo", o.balance_amount]];
  const elenco: RigaElencoLavori[] = a.voci.map((v) => {
    const quantita = num(v.quantity) || 1;
    const prezzo = num(v.unit_price) * (1 - num(v.discount_percent) / 100);
    return { fase: testo(v.categoria) || "Lavori", descrizione: [testo(v.name), testo(v.description)].filter(Boolean).join(" – "), unita: testo(v.unita_misura) || null, quantita, prezzo, importo: Math.round(quantita * prezzo * 100) / 100 };
  });
  return {
    titolo: "Contratto d'appalto", numero: testo(c.numero_contratto) || null,
    sottotitolo: [testo(c.numero_contratto) && `N. ${testo(c.numero_contratto)}`, `del ${giorno(c.created_at)}`, testo(o.order_code) && `commessa ${testo(o.order_code)}`].filter(Boolean).join("  ·  "),
    etichettaImpresa: "APPALTATORE", impresa: impresaDa(a.societari),
    committente: committenteDa(o.customer, { nome: testo(o.client_company) || testo(o.client_name), indirizzo: o.client_address, email: o.client_email, telefono: o.client_phone }),
    cantiere: [["Commessa", [testo(o.order_code), testo(o.description)].filter(Boolean).join(" · ") || "—"], ["Cantiere", testo(o.work_address) || testo(o.client_address) || "—"],
      ["Lavori", `dal ${giorno(o.work_start_date)} al ${giorno(o.expected_date)}`]],
    economico: {
      titolo: "Corrispettivo e pagamenti", destra: "importi in euro",
      righe: [{ label: "Imponibile dei lavori", valore: euroContratto(imponibile), forte: true },
        { label: `IVA ${ivaPct}%`, valore: euroContratto(iva) },
        { label: "Totale", valore: euroContratto(imponibile + iva), forte: true },
        ...rate.filter(([, v]) => num(v) > 0).map(([label, v]) => ({ label, valore: euroContratto(num(v)) }))],
    },
    articoli, daApprovare, elenco, titoloElenco: "ALLEGATO A – ELENCO DEI LAVORI",
    sottoElenco: `Commessa ${testo(o.order_code)} · ${elenco.length} voci · prezzi IVA esclusa`,
    firme: { sinistra: "L'Appaltatore", destra: "Il Committente" }, societarie: righeSocietarie(a.societari), companyId: a.companyId,
  };
}

const UNITA_LEGGIBILI: Record<string, string> = { uomo_giorno: "uomo/giorno", mq: "m²", ml: "m", mc: "m³", corpo: "a corpo" };

/** L'accordo col committente: condizioni concordate, clausole e listino in Allegato A. */
export function datiDaAccordo(a: {
  accordo: Riga; committente: Riga; tariffe: Riga[]; societari: DatiSocietari | null; companyId?: string | null;
  /** I titoli delle clausole «da approvare a parte» del modello: valgono se l'accordo le contiene ancora. */
  vessatorie?: string[];
}): DatiContrattoCliente {
  const c = a.accordo;
  const paragrafi = testo(c.condizioni).split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean);
  const articoli: ArticoloCliente[] = [];
  let corrente: ArticoloCliente | null = null;
  for (const blocco of paragrafi) {
    // «Titolo» a capo «testo»: è la forma in cui arrivano le clausole di «Contratti e condizioni».
    const [prima, ...resto] = blocco.split("\n");
    if (resto.length && prima.length < 90) { corrente = { titolo: titoloArticolo(prima), paragrafi: [resto.join(" ").trim()] }; articoli.push(corrente); }
    else if (corrente) corrente.paragrafi.push(blocco);
    else { corrente = { titolo: "Condizioni concordate", paragrafi: [blocco] }; articoli.push(corrente); }
  }
  const elenco: RigaElencoLavori[] = a.tariffe.filter((t) => t.attivo !== false).map((t) => ({
    fase: testo(t.tipo).replace(/^./, (x) => x.toUpperCase()) || "Listino", descrizione: testo(t.descrizione), unita: UNITA_LEGGIBILI[testo(t.unita_misura)] ?? (testo(t.unita_misura) || null), quantita: 1, prezzo: num(t.prezzo_unitario), importo: num(t.prezzo_unitario),
  }));
  return {
    titolo: "Contratto d'appalto", numero: null,
    sottotitolo: [testo(c.nome), `valido dal ${giorno(c.valido_dal)}${c.valido_al ? ` al ${giorno(c.valido_al)}` : ""}`].join("  ·  "),
    etichettaImpresa: "APPALTATORE", impresa: impresaDa(a.societari), committente: { ...committenteDa(a.committente), rappresentante: testo(c.firmatario_committente) || undefined },
    cantiere: ([["Oggetto", testo(c.oggetto_lavori)], ["Luogo dei lavori", testo(c.luogo_lavori)], ["Riferimento del committente", testo(c.riferimento_committente)]] as Array<[string, string]>).filter(([, v]) => v),
    economico: { titolo: "Condizioni economiche", righe: [
      { label: "Pagamento", valore: `${num(c.giorni_pagamento)} giorni` },
      { label: "Ritenuta a garanzia", valore: `${num(c.ritenuta_pct)}%` },
      { label: "Maggiorazione straordinario", valore: `+${num(c.maggiorazione_straordinario_pct)}%` },
      { label: "Maggiorazione festivo", valore: `+${num(c.maggiorazione_festivo_pct)}%` },
      { label: "Fatturazione", valore: c.modo_fatturazione === "mensile_cumulativa" ? "Mensile, tutte le commesse" : "Per commessa" },
      { label: "Fornitura dei materiali", valore: c.include_fornitura ? "Compresa" : "Sola manodopera" },
      { label: "IVA", valore: c.regime_iva === "reverse_charge" ? "Inversione contabile (reverse charge)" : "Ordinaria" },
    ] },
    articoli, daApprovare: articoli.filter((x) => a.vessatorie?.includes(x.titolo)).map((x) => x.titolo), elenco, soloPrezzi: true, titoloElenco: "ALLEGATO A – LISTINO CONCORDATO",
    sottoElenco: `${elenco.length} voci · prezzi IVA esclusa`,
    firme: { sinistra: "L'Appaltatore", destra: "Il Committente" }, societarie: righeSocietarie(a.societari), companyId: a.companyId,
  };
}
