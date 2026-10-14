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
  };
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
  const updates: Partial<Pick<Supplier, (typeof campi)[number]>> = {};
  for (const campo of campi) {
    const da = source[campo]?.trim();
    const a = target[campo]?.trim();
    if (da && a && da.toLocaleLowerCase("it") !== a.toLocaleLowerCase("it"))
      throw new Error(
        "I fornitori hanno referenti diversi. Allinea i dati del referente prima di unirli, per non perdere i contatti.",
      );
    if (da && !a) updates[campo] = da;
  }
  return updates;
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
    ].some((v) => v?.toLocaleLowerCase("it").includes(q))
  );
}
