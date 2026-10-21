import type { Json } from "@/integrations/supabase/types";

/** Ruoli dei referenti: a chi va l'ordine, a chi la fattura, chi riceve il camion. */
export const RUOLI_REFERENTE = [
  { value: "ordini", label: "Ordini / commerciale" },
  { value: "amministrazione", label: "Amministrazione" },
  { value: "consegne", label: "Consegne / magazzino" },
  { value: "tecnico", label: "Tecnico" },
  { value: "altro", label: "Altro" },
] as const;
export type RuoloReferente = (typeof RUOLI_REFERENTE)[number]["value"];

// type e non interface: così passa come Json nelle scritture su suppliers.
export type ReferenteFornitore = {
  ruolo: RuoloReferente;
  nome: string;
  email: string;
  telefono: string;
};

/** Gli altri referenti come arrivano dal database (jsonb): solo righe sensate. */
export function referentiDi(valore: unknown): ReferenteFornitore[] {
  if (!Array.isArray(valore)) return [];
  return valore
    .filter((r): r is Record<string, unknown> => !!r && typeof r === "object")
    .map((r) => ({
      ruolo: RUOLI_REFERENTE.some((x) => x.value === r.ruolo) ? (r.ruolo as RuoloReferente) : "altro",
      nome: typeof r.nome === "string" ? r.nome : "",
      email: typeof r.email === "string" ? r.email : "",
      telefono: typeof r.telefono === "string" ? r.telefono : "",
    }));
}

export function etichettaRuoloReferente(ruolo: string | null | undefined): string {
  return RUOLI_REFERENTE.find((r) => r.value === ruolo)?.label ?? "Altro";
}

export interface Supplier {
  id: string;
  name: string;
  vat_rate: number | null;
  is_foreign: boolean;
  address: string | null;
  city: string | null;
  province: string | null;
  postal_code: string | null;
  country: string | null;
  vat_number: string | null;
  fiscal_code: string | null;
  email: string | null;
  phone: string | null;
  website: string | null;
  product_category: string | null;
  notes: string | null;
  payment_method: string | null;
  is_active: boolean;
  /** Il carico rapido del magazzino lo legge per decidere come interpretare i QR del fornitore. */
  uses_gs1?: boolean | null;
  created_at: string;
  company_id: string;
  contact_name?: string | null;
  contact_role?: string | null;
  contact_email?: string | null;
  contact_phone?: string | null;
  iban?: string | null;
  bank_name?: string | null;
  lead_time_days?: number | null;
  min_order_amount?: number | null;
  credit_limit?: number | null;
  rating?: number | null;
  /** Referenti oltre al principale (contact_*): ordini, amministrazione, consegne… */
  altri_referenti?: Json | null;
  /** Dove mandare gli ordini, se diverso dall'email generale. */
  email_ordini?: string | null;
  pec?: string | null;
  codice_sdi?: string | null;
  /** Termini di pagamento: giorni dalla data fattura, eventualmente a fine mese. */
  termini_giorni?: number | null;
  termini_fine_mese?: boolean | null;
  /** Il nostro codice cliente presso il fornitore: va sugli ordini. */
  codice_cliente?: string | null;
  sconto_percentuale?: number | null;
  ritiro_indirizzo?: string | null;
  ritiro_citta?: string | null;
  ritiro_note?: string | null;
}

export interface SupplierFormData {
  name: string;
  vat_rate: number;
  is_foreign: boolean;
  address: string;
  city: string;
  province: string;
  postal_code: string;
  country: string;
  vat_number: string;
  fiscal_code: string;
  email: string;
  phone: string;
  website: string;
  product_category: string;
  notes: string;
  payment_method: string;
  is_active: boolean;
  uses_gs1: boolean;
  contact_name: string;
  contact_role: string;
  contact_email: string;
  contact_phone: string;
  iban: string;
  bank_name: string;
  lead_time_days: string;
  min_order_amount: string;
  credit_limit: string;
  rating: string;
  altri_referenti: ReferenteFornitore[];
  email_ordini: string;
  pec: string;
  codice_sdi: string;
  termini_giorni: string;
  termini_fine_mese: boolean;
  codice_cliente: string;
  sconto_percentuale: string;
  ritiro_indirizzo: string;
  ritiro_citta: string;
  ritiro_note: string;
}

export const emptyForm: SupplierFormData = {
  name: "",
  vat_rate: 22,
  is_foreign: false,
  address: "",
  city: "",
  province: "",
  postal_code: "",
  country: "Italia",
  vat_number: "",
  fiscal_code: "",
  email: "",
  phone: "",
  website: "",
  product_category: "",
  notes: "",
  payment_method: "",
  is_active: true,
  uses_gs1: false,
  contact_name: "",
  contact_role: "",
  contact_email: "",
  contact_phone: "",
  iban: "",
  bank_name: "",
  lead_time_days: "",
  min_order_amount: "",
  credit_limit: "",
  rating: "",
  altri_referenti: [],
  email_ordini: "",
  pec: "",
  codice_sdi: "",
  termini_giorni: "",
  termini_fine_mese: false,
  codice_cliente: "",
  sconto_percentuale: "",
  ritiro_indirizzo: "",
  ritiro_citta: "",
  ritiro_note: "",
};

export function normalizeSupplierName(name: string) {
  return name.trim().replace(/\s+/g, " ");
}

export function supplierNameKey(name: string) {
  return normalizeSupplierName(name).toLowerCase();
}

export function normalizeVatNumber(value: string) {
  return value
    .trim()
    .replace(/[\s.-]/g, "")
    .toUpperCase();
}

export function normalizeOptional(value: string) {
  const normalized = value.trim();
  return normalized || null;
}

export function isValidEmail(value: string) {
  if (!value.trim()) return true;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}

export function isValidPhone(value: string) {
  if (!value.trim()) return true;
  return /^[+()0-9\s.-]{6,25}$/.test(value.trim());
}

export function isValidItalianVat(value: string, isForeign: boolean) {
  const normalized = normalizeVatNumber(value);
  if (!normalized || isForeign) return true;
  return /^(IT)?\d{11}$/.test(normalized);
}

export function supplierToForm(s: Supplier): SupplierFormData {
  return {
    name: s.name,
    vat_rate: s.vat_rate ?? 22,
    is_foreign: s.is_foreign,
    address: s.address || "",
    city: s.city || "",
    province: s.province || "",
    postal_code: s.postal_code || "",
    country: s.country || "Italia",
    vat_number: s.vat_number || "",
    fiscal_code: s.fiscal_code || "",
    email: s.email || "",
    phone: s.phone || "",
    website: s.website || "",
    product_category: s.product_category || "",
    notes: s.notes || "",
    payment_method: s.payment_method || "",
    is_active: s.is_active ?? true,
    uses_gs1: !!s.uses_gs1,
    contact_name: s.contact_name ?? "",
    contact_role: s.contact_role ?? "",
    contact_email: s.contact_email ?? "",
    contact_phone: s.contact_phone ?? "",
    iban: s.iban ?? "",
    bank_name: s.bank_name ?? "",
    lead_time_days: s.lead_time_days == null ? "" : String(s.lead_time_days),
    min_order_amount:
      s.min_order_amount == null ? "" : String(s.min_order_amount),
    credit_limit: s.credit_limit == null ? "" : String(s.credit_limit),
    rating: s.rating == null ? "" : String(s.rating),
    altri_referenti: referentiDi(s.altri_referenti),
    email_ordini: s.email_ordini ?? "",
    pec: s.pec ?? "",
    codice_sdi: s.codice_sdi ?? "",
    termini_giorni: s.termini_giorni == null ? "" : String(s.termini_giorni),
    termini_fine_mese: !!s.termini_fine_mese,
    codice_cliente: s.codice_cliente ?? "",
    sconto_percentuale:
      s.sconto_percentuale == null ? "" : String(s.sconto_percentuale),
    ritiro_indirizzo: s.ritiro_indirizzo ?? "",
    ritiro_citta: s.ritiro_citta ?? "",
    ritiro_note: s.ritiro_note ?? "",
  };
}

/** «60 gg fine mese», «30 gg data fattura», «Vista fattura». */
export function terminiPagamentoTesto(s: Pick<Supplier, "termini_giorni" | "termini_fine_mese">): string | null {
  if (s.termini_giorni == null) return null;
  if (s.termini_giorni === 0) return s.termini_fine_mese ? "Fine mese" : "Vista fattura";
  return `${s.termini_giorni} gg ${s.termini_fine_mese ? "fine mese" : "data fattura"}`;
}

/**
 * A chi va l'ordine: l'email per gli ordini, poi il referente degli ordini,
 * poi l'email generale dell'azienda.
 */
export function emailPerOrdini(s: Pick<Supplier, "email_ordini" | "altri_referenti" | "contact_email" | "contact_role" | "email"> | null | undefined): string | null {
  if (!s) return null;
  const referenteOrdini = referentiDi(s.altri_referenti).find((r) => r.ruolo === "ordini" && r.email.trim());
  return (
    s.email_ordini?.trim() ||
    referenteOrdini?.email.trim() ||
    s.email?.trim() ||
    null
  );
}

export function sitoFornitore(value: string | null | undefined): string | null {
  if (!value?.trim()) return null;
  try {
    const text = value.trim();
    const url = new URL(
      /^[a-z][a-z\d+.-]*:/i.test(text) ? text : `https://${text}`,
    );
    return ["https:", "http:"].includes(url.protocol) &&
      !url.username &&
      !url.password
      ? url.href
      : null;
  } catch {
    return null;
  }
}

function numeroOpzionale(value: string): number | null {
  if (!value.trim()) return null;
  if (!/^\d+(?:[.,]\d{1,2})?$/.test(value.trim())) return NaN;
  const n = Number(value.trim().replace(",", "."));
  return Number.isSafeInteger(Math.round(n * 100)) ? n : NaN;
}

export function validaDettagliFornitore(form: SupplierFormData): string | null {
  if (!isValidEmail(form.contact_email))
    return "Inserisci un’email valida per il referente.";
  if (!isValidPhone(form.contact_phone))
    return "Controlla il telefono del referente.";
  if (form.website.trim() && !sitoFornitore(form.website))
    return "Inserisci un sito web valido (http o https).";
  const iban = form.iban.replace(/\s/g, "").toUpperCase();
  if (iban && !/^[A-Z]{2}\d{2}[A-Z0-9]{11,30}$/.test(iban))
    return "Controlla il formato dell’IBAN: codice paese, cifre di controllo e conto, da 15 a 34 caratteri.";
  for (const [campo, etichetta] of [
    ["lead_time_days", "Tempi di consegna"],
    ["min_order_amount", "Ordine minimo"],
    ["credit_limit", "Fido"],
  ] as const) {
    const n = numeroOpzionale(form[campo]);
    if (
      n !== null &&
      (!Number.isFinite(n) ||
        (campo === "lead_time_days" && !Number.isSafeInteger(n)))
    )
      return `${etichetta}: inserisci un numero positivo o zero${campo === "lead_time_days" ? ", senza decimali" : ", con al massimo due decimali"}.`;
  }
  if (!isValidEmail(form.email_ordini))
    return "Inserisci un’email valida per gli ordini.";
  if (!isValidEmail(form.pec)) return "Inserisci un indirizzo PEC valido.";
  if (form.codice_sdi.trim() && !/^[A-Za-z0-9]{6,7}$/.test(form.codice_sdi.trim()))
    return "Il codice destinatario SDI ha 7 caratteri (6 per la pubblica amministrazione).";
  const giorni = numeroOpzionale(form.termini_giorni);
  if (giorni !== null && (!Number.isSafeInteger(giorni) || giorni > 365))
    return "Termini di pagamento: inserisci i giorni, da 0 a 365, senza decimali.";
  const sconto = numeroOpzionale(form.sconto_percentuale);
  if (sconto !== null && (!Number.isFinite(sconto) || sconto > 100))
    return "Lo sconto concordato va da 0 a 100%, con al massimo due decimali.";
  for (const [i, r] of form.altri_referenti.entries()) {
    const n = i + 2;
    if (!r.nome.trim() && !r.email.trim() && !r.telefono.trim())
      return `Il referente ${n} è vuoto: compilalo o toglilo.`;
    if (!isValidEmail(r.email)) return `Controlla l’email del referente ${n}.`;
    if (!isValidPhone(r.telefono)) return `Controlla il telefono del referente ${n}.`;
  }
  const rating = numeroOpzionale(form.rating);
  if (
    rating !== null &&
    (!Number.isInteger(rating) || rating < 1 || rating > 5)
  )
    return "La valutazione va da 1 a 5 stelle.";
  return null;
}

/** Campi espliciti: non sovrascrive metadati del magazzino o altri dati non presenti nel modulo. */
export function payloadFornitore(data: SupplierFormData) {
  const errore = validaDettagliFornitore(data);
  if (errore) throw new Error(errore);
  return {
    name: normalizeSupplierName(data.name),
    vat_rate: data.vat_rate,
    is_foreign: data.is_foreign,
    address: normalizeOptional(data.address),
    city: normalizeOptional(data.city),
    province: normalizeOptional(data.province)?.toUpperCase() ?? null,
    postal_code: normalizeOptional(data.postal_code),
    country: normalizeOptional(data.country),
    vat_number: normalizeOptional(normalizeVatNumber(data.vat_number)),
    fiscal_code: normalizeOptional(data.fiscal_code.toUpperCase()),
    email: normalizeOptional(data.email.toLowerCase()),
    phone: normalizeOptional(data.phone),
    website: sitoFornitore(data.website),
    product_category: normalizeOptional(data.product_category),
    notes: normalizeOptional(data.notes),
    payment_method: normalizeOptional(data.payment_method),
    is_active: data.is_active,
    uses_gs1: data.uses_gs1,
    contact_name: normalizeOptional(data.contact_name),
    contact_role: normalizeOptional(data.contact_role),
    contact_email: normalizeOptional(data.contact_email.toLowerCase()),
    contact_phone: normalizeOptional(data.contact_phone),
    iban: normalizeOptional(data.iban.replace(/\s/g, "").toUpperCase()),
    bank_name: normalizeOptional(data.bank_name),
    lead_time_days: numeroOpzionale(data.lead_time_days),
    min_order_amount: numeroOpzionale(data.min_order_amount),
    credit_limit: numeroOpzionale(data.credit_limit),
    rating: numeroOpzionale(data.rating),
    altri_referenti: data.altri_referenti.map((r) => ({
      ruolo: r.ruolo,
      nome: normalizeSupplierName(r.nome),
      email: r.email.trim().toLowerCase(),
      telefono: r.telefono.trim(),
    })),
    email_ordini: normalizeOptional(data.email_ordini.toLowerCase()),
    pec: normalizeOptional(data.pec.toLowerCase()),
    codice_sdi: normalizeOptional(data.codice_sdi.toUpperCase()),
    termini_giorni: numeroOpzionale(data.termini_giorni),
    termini_fine_mese: data.termini_fine_mese,
    codice_cliente: normalizeOptional(data.codice_cliente),
    sconto_percentuale: numeroOpzionale(data.sconto_percentuale),
    ritiro_indirizzo: normalizeOptional(data.ritiro_indirizzo),
    ritiro_citta: normalizeOptional(data.ritiro_citta),
    ritiro_note: normalizeOptional(data.ritiro_note),
  };
}

/** Non mescola i recapiti di due persone durante l’unione dei doppioni. */
export function contattiPerUnione(source: Supplier, target: Supplier) {
  const campi = [
    "contact_name",
    "contact_role",
    "contact_email",
    "contact_phone",
  ] as const;
  const updates: Partial<Supplier> = {};
  for (const campo of campi) {
    const da = source[campo]?.trim();
    const a = target[campo]?.trim();
    if (da && a && da.toLocaleLowerCase("it") !== a.toLocaleLowerCase("it"))
      throw new Error(
        "I fornitori hanno referenti diversi. Allinea i dati del referente prima di unirli, per non perdere i contatti.",
      );
    if (da && !a) updates[campo] = da;
  }
  // I dati d'acquisto del doppione passano solo dove l'altro è vuoto.
  const extra: Partial<Supplier> = {};
  for (const campo of [
    "email_ordini", "pec", "codice_sdi", "codice_cliente",
    "ritiro_indirizzo", "ritiro_citta", "ritiro_note",
  ] as const) {
    if (source[campo]?.trim() && !target[campo]?.trim()) extra[campo] = source[campo];
  }
  if (source.termini_giorni != null && target.termini_giorni == null) {
    extra.termini_giorni = source.termini_giorni;
    extra.termini_fine_mese = !!source.termini_fine_mese;
  }
  if (source.sconto_percentuale != null && target.sconto_percentuale == null)
    extra.sconto_percentuale = source.sconto_percentuale;
  const giaPresenti = new Set(
    referentiDi(target.altri_referenti).map((r) => `${r.nome}|${r.email}`.toLocaleLowerCase("it")),
  );
  const nuovi = referentiDi(source.altri_referenti).filter(
    (r) => !giaPresenti.has(`${r.nome}|${r.email}`.toLocaleLowerCase("it")),
  );
  if (nuovi.length) extra.altri_referenti = [...referentiDi(target.altri_referenti), ...nuovi];
  return { ...updates, ...extra };
}

export function ricercaFornitore(s: Supplier, query: string): boolean {
  const q = query.trim().toLocaleLowerCase("it");
  return (
    !q ||
    [
      s.name,
      s.product_category,
      s.city,
      s.province,
      s.vat_number,
      s.email,
      s.phone,
      s.contact_name,
      s.contact_role,
      s.contact_email,
      s.contact_phone,
      s.email_ordini,
      s.pec,
      s.codice_cliente,
      ...referentiDi(s.altri_referenti).flatMap((r) => [r.nome, r.email, r.telefono]),
    ].some((v) => v?.toLocaleLowerCase("it").includes(q))
  );
}
