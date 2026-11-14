/**
 * Preventivi al committente (10/11/2026, approvato da Florin).
 *
 * Il preventivo è quello classico: stesso preventivatore, numerazione, invio, firma e PDF sobrio. Qui c'è solo
 * quello che il legame col committente aggiunge, in funzioni pure:
 *
 *  - i dati del committente che riempiono il preventivo (la sua riga di `profiles`);
 *  - le voci prese dal listino del suo contratto, col prezzo proposto e modificabile, e la nota di riga;
 *  - i cinque stati che la scheda mostra (bozza, inviato, accettato, rifiutato, scaduto) dai sei del preventivo;
 *  - il rifiuto col motivo, il preventivo scaduto da richiamare, il lavoro extra che nasce da uno accettato.
 */
import type { QuoteItemPro } from "@/types/quoteItem";
import type { VariationDraft } from "@/lib/orders/variationDraft";

/* ─── Dati del committente nel preventivo ─────────────────────────── */

/** Chi l'email non l'ha data ha in `profiles` un segnaposto: non è un indirizzo a cui mandare un preventivo. */
const DOMINIO_SENZA_EMAIL = "@no-email.ediliziaincloud.local";

export interface ProfiloCliente {
  id: string;
  first_name: string | null;
  last_name: string | null;
  business_name: string | null;
  email: string | null;
  phone: string | null;
  address: string | null;
  postal_code: string | null;
  city: string | null;
  province: string | null;
  fiscal_code: string | null;
  vat_number: string | null;
}

export interface DatiClientePreventivo {
  clientName: string;
  clientCompany: string;
  clientEmail: string;
  clientPhone: string;
  clientFiscalCode: string;
  clientVatNumber: string;
  clientAddress: string;
}

/** Un nome scritto come «—» o «-» (i committenti senza referente) non è un nome. */
const parteNome = (x: string | null | undefined) => {
  const v = (x ?? "").trim();
  return v === "—" || v === "-" ? "" : v;
};

export function datiClienteDaProfilo(p: ProfiloCliente): DatiClientePreventivo {
  const referente = [parteNome(p.first_name), parteNome(p.last_name)].filter(Boolean).join(" ");
  const email = (p.email ?? "").trim();
  return {
    // Il preventivo è intestato a chi lo legge: il referente, se no l'impresa.
    clientName: referente || (p.business_name ?? "").trim(),
    clientCompany: (p.business_name ?? "").trim(),
    clientEmail: email && !email.endsWith(DOMINIO_SENZA_EMAIL) ? email : "",
    clientPhone: (p.phone ?? "").trim(),
    clientFiscalCode: (p.fiscal_code ?? "").trim(),
    clientVatNumber: (p.vat_number ?? "").trim(),
    clientAddress: [p.address, p.postal_code, p.city, p.province].map((x) => (x ?? "").trim()).filter(Boolean).join(", "),
  };
}

/**
 * A chi appartiene il preventivo che si sta salvando. Solo alla creazione e solo se il cliente arrivato dalla
 * scheda è stato letto (cioè è di questa azienda): in modifica il legame resta quello che c'è.
 */
export function clienteDaCollegare(isEdit: boolean, profiloDaScheda: { id: string } | null | undefined): { customer_id: string } | Record<string, never> {
  return !isEdit && profiloDaScheda?.id ? { customer_id: profiloDaScheda.id } : {};
}

/* ─── Voci dal listino del contratto ──────────────────────────────── */

export interface TariffaContratto {
  id: string;
  tipo: string;
  codice: string | null;
  descrizione: string;
  unita_misura: string;
  prezzo_unitario: number;
  qualifica?: string | null;
  note?: string | null;
  attivo: boolean;
}

export interface SceltaVoce {
  tariffa: TariffaContratto;
  quantita: number;
  /** Il prezzo che va nel preventivo: parte da quello del contratto, chi scrive lo cambia. */
  prezzo: number;
  /** Nota di riga: va nella descrizione della riga, che il PDF stampa sotto il nome. */
  nota: string;
}

/** Le categorie che `quote_items` ammette: la manodopera e le lavorazioni sono lavori («posa»). */
export function categoriaVoce(tipo: string): "posa" | "trasporto" | "nolo" {
  return tipo === "trasporto" ? "trasporto" : tipo === "nolo" ? "nolo" : "posa";
}

const UNITA: Record<string, string> = { uomo_giorno: "uomo/giorno", corpo: "corpo" };
export function unitaVoce(unita: string): string {
  return UNITA[unita] ?? (unita || "corpo");
}

const arrotonda = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

export function sceltaIniziale(t: TariffaContratto): SceltaVoce {
  return { tariffa: t, quantita: 1, prezzo: Number(t.prezzo_unitario) || 0, nota: "" };
}

/** Le righe del preventivo dalle voci scelte. Il prezzo è quello scritto nella scelta, non quello del listino. */
export function righeDaContratto(scelte: SceltaVoce[], opts: { iva: number; ordine: number }): QuoteItemPro[] {
  return scelte.map((s, i) => {
    const corpo = s.tariffa.unita_misura === "corpo";
    const quantita = Number(s.quantita);
    return {
      item_type: "service",
      item_category: categoriaVoce(s.tariffa.tipo),
      name: [s.tariffa.descrizione.trim(), (s.tariffa.qualifica ?? "").trim()].filter(Boolean).join(" — "),
      description: s.nota.trim(),
      quantity: corpo ? 1 : Number.isFinite(quantita) && quantita > 0 ? quantita : 1,
      unit_price: arrotonda(Number(s.prezzo) || 0),
      discount_percent: 0,
      vat_rate: opts.iva,
      unit_of_measure: unitaVoce(s.tariffa.unita_misura),
      sort_order: opts.ordine + i,
      article_template_id: null as string | null,
      // L'id della tariffa del contratto NON va in tariffa_id: quella colonna punta alle tariffe aziendali.
      tariffa_id: null as string | null,
      prezzo_acquisto: 0,
      mostra_nel_pdf: true,
      is_optional: false,
    };
  });
}

/* ─── Stati come li legge la scheda ───────────────────────────────── */

export type StatoCommittente = "bozza" | "inviato" | "accettato" | "rifiutato" | "scaduto";

export const STATI_COMMITTENTE: Record<StatoCommittente, { label: string; className: string }> = {
  bozza: { label: "Bozza", className: "border-slate-300 bg-slate-100 text-slate-700" },
  inviato: { label: "Inviato", className: "border-blue-300 bg-blue-100 text-blue-800" },
  accettato: { label: "Accettato", className: "border-emerald-300 bg-emerald-100 text-emerald-800" },
  rifiutato: { label: "Rifiutato", className: "border-red-300 bg-red-100 text-red-800" },
  scaduto: { label: "Scaduto", className: "border-amber-300 bg-amber-100 text-amber-800" },
};

export interface PreventivoCommittente {
  id: string;
  quote_number: string | null;
  title: string | null;
  total: number | null;
  status: string | null;
  created_at: string;
  sent_at: string | null;
  expires_at: string | null;
  signed_at: string | null;
  revision_number: number | null;
  parent_quote_id: string | null;
  refused_motivo: string | null;
  refused_reason: string | null;
  variante_id: string | null;
  version: number | null;
}

/** Lo stato del preventivo nella scheda. Un inviato oltre la validità è scaduto anche prima del cron delle 4:15. */
export function statoCommittente(q: Pick<PreventivoCommittente, "status" | "expires_at">, oggi: string): StatoCommittente {
  const s = (q.status ?? "").trim().toLowerCase();
  if (["accettata", "accettato", "firmata", "firmato", "convertita", "convertito"].includes(s)) return "accettato";
  if (["rifiutata", "rifiutato"].includes(s)) return "rifiutato";
  if (["scaduta", "scaduto"].includes(s)) return "scaduto";
  if (["inviata", "inviato", "visualizzata", "visualizzato", "sent", "viewed"].includes(s)) {
    return q.expires_at && q.expires_at.slice(0, 10) < oggi ? "scaduto" : "inviato";
  }
  return "bozza";
}

/** Accettato e non ancora usato: si sceglie se diventa una commessa nuova o un lavoro extra. */
export function daDecidere(q: Pick<PreventivoCommittente, "status" | "variante_id">, haCommessa: boolean): boolean {
  return (q.status ?? "") === "accettata" && !q.variante_id && !haCommessa;
}

export function numeroPreventivo(q: Pick<PreventivoCommittente, "quote_number" | "revision_number">): string {
  const n = q.quote_number ?? "—";
  return Number(q.revision_number ?? 0) > 0 ? `${n} · Rev. ${q.revision_number}` : n;
}

/* ─── Rifiuto ─────────────────────────────────────────────────────── */

export type MotivoRifiuto = "prezzo" | "tempi" | "altro";
export const MOTIVI_RIFIUTO: Array<{ v: MotivoRifiuto; label: string }> = [
  { v: "prezzo", label: "Prezzo" },
  { v: "tempi", label: "Tempi" },
  { v: "altro", label: "Altro" },
];

export function datiRifiuto(motivo: MotivoRifiuto | null, testo: string, adesso = new Date()) {
  if (!motivo) throw new Error("Scegli il motivo del rifiuto.");
  const t = testo.trim();
  if (motivo === "altro" && !t) throw new Error("Scrivi il motivo.");
  return { status: "rifiutata", refused_motivo: motivo, refused_reason: t || null, refused_at: adesso.toISOString() };
}

export function etichettaRifiuto(motivo: string | null, testo: string | null): string {
  const m = MOTIVI_RIFIUTO.find((x) => x.v === motivo)?.label;
  return [m, (testo ?? "").trim()].filter(Boolean).join(" · ");
}

/* ─── Scaduto: da richiamare ──────────────────────────────────────── */

function giorniTra(da: string, a: string): number {
  const g = (s: string) => Date.UTC(+s.slice(0, 4), +s.slice(5, 7) - 1, +s.slice(8, 10));
  return Math.max(0, Math.round((g(a) - g(da)) / 86_400_000));
}

export interface PreventivoDaRichiamare {
  tipo: "preventivo";
  id: string;
  numero: string | null;
  giorni: number;
  totale: number | null;
  scadutoIl: string;
}

/**
 * Il preventivo scaduto senza risposta da richiamare: il più recente. Non quello già sostituito da una
 * revisione più nuova (si richiama per quella), né uno di cui non si sa quando è scaduto.
 */
export function preventivoDaRichiamare(lista: PreventivoCommittente[], oggi: string, vedeImporti: boolean): PreventivoDaRichiamare | null {
  const radice = (q: PreventivoCommittente) => q.parent_quote_id ?? q.id;
  const sostituito = (q: PreventivoCommittente) =>
    lista.some((altro) => altro.id !== q.id && radice(altro) === radice(q) && altro.created_at > q.created_at);
  const scaduti = lista
    .filter((q) => statoCommittente(q, oggi) === "scaduto" && !sostituito(q))
    .map((q) => ({ q, il: (q.expires_at ?? q.sent_at ?? "").slice(0, 10) }))
    .filter((x) => x.il)
    .sort((a, b) => (a.il < b.il ? 1 : -1));
  const primo = scaduti[0];
  if (!primo) return null;
  return {
    tipo: "preventivo",
    id: primo.q.id,
    numero: numeroPreventivo(primo.q),
    giorni: giorniTra(primo.il, oggi),
    totale: vedeImporti ? primo.q.total : null,
    scadutoIl: primo.il,
  };
}

/* ─── Accettato → lavoro extra su una commessa già aperta ──────────── */

export interface TestataPerVariante {
  quote_number: string | null;
  title: string | null;
  description: string | null;
  signed_at: string | null;
  signed_by_name: string | null;
  subtotal: number | null;
  discount_amount: number | null;
  total: number | null;
  vat_amount: number | null;
}

export interface RigaPerVariante {
  name: string | null;
  description: string | null;
  quantity: number | null;
  unit_price: number | null;
  unit_of_measure: string | null;
  item_category: string | null;
  is_optional: boolean | null;
  discount_percent: number | null;
}

const virgola = (n: number) => String(arrotonda(n)).replace(".", ",");
const dueDecimali = (n: number) => Math.abs(arrotonda(n) - n) < 1e-9;
const giornoIT = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`;

/**
 * La bozza del lavoro extra dal preventivo accettato. Le voci passano una per una se la loro somma è l'imponibile
 * del preventivo; con sconti, prezzo a mano o quantità con più di due decimali si passa all'importo a corpo
 * (l'imponibile), con le voci scritte nella descrizione: il committente ha accettato quel totale, non un altro.
 */
export function bozzaLavoroExtra(q: TestataPerVariante, righe: RigaPerVariante[], base: VariationDraft): VariationDraft {
  const numero = q.quote_number ?? "";
  const vere = righe.filter((r) =>
    !r.is_optional && !["nota", "subtotale", "sconto"].includes(r.item_category ?? "") && Number(r.quantity ?? 0) > 0 && (r.name ?? "").trim());
  const imponibile = Number(q.subtotal) > 0
    ? arrotonda(Number(q.subtotal) - Number(q.discount_amount ?? 0))
    : arrotonda(Number(q.total ?? 0) - Number(q.vat_amount ?? 0));
  const prezzoNetto = (r: RigaPerVariante) => Number(r.unit_price ?? 0) * (1 - Number(r.discount_percent ?? 0) / 100);
  const somma = arrotonda(vere.reduce((s, r) => s + arrotonda(Number(r.quantity) * prezzoNetto(r)), 0));
  const perVoci = vere.length > 0
    && Math.abs(somma - imponibile) < 0.01
    && !righe.some((r) => r.item_category === "sconto")
    && vere.every((r) => dueDecimali(Number(r.quantity)) && dueDecimali(prezzoNetto(r)) && prezzoNetto(r) >= 0);
  const accettato = q.signed_at ? ` accettato il ${giornoIT(q.signed_at)}` : " accettato";
  const elenco = vere.map((r) => `- ${(r.name ?? "").trim()}: ${virgola(Number(r.quantity))} ${(r.unit_of_measure ?? "").trim()}`.trim());
  return {
    ...base,
    kind: "aggiunta",
    title: (q.title ?? "").trim() || `Preventivo ${numero}`.trim(),
    description: [
      (q.description ?? "").trim() || `Lavori del preventivo ${numero}${accettato}.`,
      perVoci || elenco.length === 0 ? "" : `Voci del preventivo:\n${elenco.join("\n")}`,
    ].filter(Boolean).join("\n\n"),
    pricing: perVoci ? "voci" : "corpo",
    amount: perVoci ? "" : virgola(imponibile),
    lines: perVoci
      ? vere.map((r, i) => ({
          // Un uuid, come ogni voce di variante: variante-commessa rifiuta altro («Voce della variante non valida»).
          id: crypto.randomUUID(),
          description: [(r.name ?? "").trim(), (r.description ?? "").trim()].filter(Boolean).join(" — "),
          quantity: virgola(Number(r.quantity)),
          price: virgola(prezzoNetto(r)),
          unit: (r.unit_of_measure ?? "").trim() || undefined,
        }))
      : [],
    contractReference: `Preventivo ${numero}${accettato}`.trim(),
    requester: (q.signed_by_name ?? "").trim() || base.requester,
    destinazione: "nuova",
  };
}

/* ─── Dentro la commessa: quali preventivi si possono ancora importare ── */

/**
 * I preventivi che una commessa può importare come lavoro extra (14/11/2026): accettati, mai diventati un lavoro
 * extra (`variante_id`) né una commessa (un preventivo convertito in commessa resta «accettata», con
 * `orders.quote_id` che lo ricorda). Così nessun preventivo si usa due volte.
 */
export function preventiviImportabili<T extends Pick<PreventivoCommittente, "id" | "status" | "variante_id">>(
  lista: readonly T[],
  usatiDaCommesse: Iterable<string | null | undefined>,
): T[] {
  const usati = new Set<string>();
  for (const id of usatiDaCommesse) if (id) usati.add(id);
  return lista.filter((q) => (q.status ?? "") === "accettata" && !q.variante_id && !usati.has(q.id));
}
