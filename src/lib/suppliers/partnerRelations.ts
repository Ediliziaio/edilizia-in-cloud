import { fiscalDate, fiscalToday } from "@/lib/fatturazione/fiscalInsights";
import { userErrorMessage } from "@/lib/userErrorMessage";

export class PartnerValidationError extends Error {}
export function partnerFeedback(error: unknown, fallback: string): string {
  if (error instanceof PartnerValidationError) return error.message;
  const e = error as { code?: string; message?: string } | null;
  if (
    e?.code === "P0001" &&
    typeof e.message === "string" &&
    /^(Identificativi fiscali discordanti|Esistono schede con gli stessi identificativi|Esiste una scheda con lo stesso nome|Scollega prima|Serve anche il permesso|Scheda subappaltatore non accessibile|Una o più fatture non sono accessibili)/.test(
      e.message,
    )
  )
    return e.message;
  return userErrorMessage(error, fallback);
}

export const PARTNER_ROLES = [
  ["materiali", "Fornitore di materiali"],
  ["servizi", "Fornitore di servizi"],
  ["consulente", "Consulente esterno"],
  ["professionista", "Professionista / studio tecnico"],
  ["subappaltatore", "Subappaltatore"],
  ["altro", "Altro partner"],
] as const;
export type PartnerRole = (typeof PARTNER_ROLES)[number][0];
export const SUPPLIER_CATEGORY_SUGGESTIONS = [
  "Materiali edili",
  "Impianti",
  "Serramenti",
  "Consulenza",
  "Servizi professionali",
  "Subappalti",
  "Noleggi",
  "Trasporti",
  "Utenze e software",
];

export type PartnerIdentity = {
  id: string;
  company_id: string;
  name: string;
  vat?: string | null;
  fiscal?: string | null;
  active?: boolean;
};
/** Solo IT davanti a undici cifre è equivalente alla P.IVA italiana senza prefisso. */
export function partnerTaxKey(value?: string | null): string {
  const key = (value ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "");
  return /^IT\d{11}$/.test(key) ? key.slice(2) : key;
}
export function partnerName(value: string): string {
  return value
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}
export function partnerConflict(
  a: PartnerIdentity,
  b: PartnerIdentity,
): boolean {
  return (["vat", "fiscal"] as const).some((k) => {
    const left = partnerTaxKey(a[k]),
      right = partnerTaxKey(b[k]);
    return !!left && !!right && left !== right;
  });
}
export function partnerMatches(
  source: PartnerIdentity,
  targets: PartnerIdentity[],
) {
  return targets
    .filter(
      (t) =>
        t.company_id === source.company_id &&
        t.active !== false &&
        !partnerConflict(source, t),
    )
    .map((target) => {
      const vat = partnerTaxKey(source.vat),
        cf = partnerTaxKey(source.fiscal);
      const reason =
        vat && vat === partnerTaxKey(target.vat)
          ? "P.IVA coincidente"
          : cf && cf === partnerTaxKey(target.fiscal)
            ? "Codice fiscale coincidente"
            : partnerName(source.name).length >= 5 &&
                partnerName(source.name) === partnerName(target.name)
              ? "Nome coincidente: verifica i dati"
              : null;
      return { target, reason, exact: !!reason && !reason.startsWith("Nome") };
    })
    .filter((m): m is typeof m & { reason: string } => !!m.reason)
    .sort(
      (a, b) =>
        Number(b.exact) - Number(a.exact) ||
        a.target.name.localeCompare(b.target.name),
    );
}

export type ReceivedSupplierRow = {
  id: string;
  company_id: string;
  cedente_ragione_sociale: string | null;
  cedente_piva: string | null;
  cedente_cf: string | null;
  cedente_paese: string | null;
  fornitore_id: string | null;
};
/** Gruppi per identità E collegamento, non soltanto per nome. Batch <=500. */
export function receivedSupplierGroups(rows: ReceivedSupplierRow[]) {
  const groups = new Map<
    string,
    PartnerIdentity & { fornitore_id: string | null; receiptIds: string[] }
  >();
  const batches = new Map<string, number>();
  for (const r of rows) {
    const vat = partnerTaxKey(r.cedente_piva),
      cf = partnerTaxKey(r.cedente_cf);
    const key = JSON.stringify([
      r.company_id,
      (r.cedente_paese || "IT").toUpperCase(),
      vat || null,
      cf || null,
      r.fornitore_id,
      !vat && !cf ? r.id : null,
    ]);
    const batch = batches.get(key) ?? 0;
    let group = groups.get(`${key}:${batch}`);
    if (group?.receiptIds.length === 500) {
      batches.set(key, batch + 1);
      group = undefined;
    }
    if (!group) {
      group = {
        id: `ricevuta:${r.id}`,
        company_id: r.company_id,
        name: r.cedente_ragione_sociale || "Fornitore da identificare",
        vat: r.cedente_piva,
        fiscal: r.cedente_cf,
        fornitore_id: r.fornitore_id,
        receiptIds: [],
      };
      groups.set(`${key}:${batches.get(key) ?? 0}`, group);
    }
    group.receiptIds.push(r.id);
  }
  return [...groups.values()];
}

export type SupplierRelation = {
  id: string;
  company_id: string;
  supplier_id: string;
  roles: PartnerRole[];
  subappaltatore_id: string | null;
  updated_at: string;
};
export type SupplierContract = {
  id: string;
  company_id: string;
  supplier_id: string;
  title: string;
  kind: "fornitura" | "consulenza" | "servizi" | "accordo_quadro" | "altro";
  status: "bozza" | "attivo" | "concluso" | "risolto";
  signed_on: string | null;
  starts_on: string | null;
  ends_on: string | null;
  notice_days: number | null;
  automatic_renewal: boolean;
  conditions: string | null;
  amount: number | null;
  currency: string;
  updated_at: string;
};
export type SupplierContractDocument = {
  id: string;
  company_id: string;
  supplier_id: string;
  contract_id: string;
  file_name: string;
  storage_path: string;
  mime_type: string;
  size_bytes: number;
  sha256: string;
  created_at: string;
};
export function contractDateError(
  c: Pick<
    SupplierContract,
    "starts_on" | "ends_on" | "signed_on" | "notice_days" | "amount"
  >,
): string | null {
  for (const v of [c.starts_on, c.ends_on, c.signed_on]) {
    if (
      v &&
      (!/^\d{4}-\d{2}-\d{2}$/.test(v) || fiscalDate(v) === "Da verificare")
    )
      return "Controlla le date del contratto.";
  }
  if (c.starts_on && c.ends_on && c.ends_on < c.starts_on)
    return "La scadenza non può precedere l’inizio.";
  if (
    c.notice_days !== null &&
    (!Number.isInteger(c.notice_days) ||
      c.notice_days < 0 ||
      c.notice_days > 3650)
  )
    return "Preavviso: inserisci giorni interi da 0 a 3650.";
  if (c.amount !== null && (!Number.isFinite(c.amount) || c.amount < 0))
    return "L’importo deve essere un numero non negativo.";
  return null;
}
export function contractNoticeDate(
  c: Pick<SupplierContract, "ends_on" | "notice_days">,
): string | null {
  if (
    !c.ends_on ||
    c.notice_days === null ||
    fiscalDate(c.ends_on) === "Da verificare"
  )
    return null;
  const d = new Date(`${c.ends_on}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() - c.notice_days);
  return d.toISOString().slice(0, 10);
}
export function contractDeadline(
  c: SupplierContract,
  today = fiscalToday(),
): string {
  if (c.status === "concluso" || c.status === "risolto") return "Chiuso";
  if (!c.ends_on) return "Scadenza non indicata";
  if (c.ends_on < today)
    return "Scadenza raggiunta: verifica rinnovo / chiusura";
  const notice = contractNoticeDate(c);
  if (notice && notice <= today) return "Termine di preavviso raggiunto";
  return `Scadenza ${fiscalDate(c.ends_on)}${notice ? ` · preavviso entro ${fiscalDate(notice)}` : ""}`;
}
export const SUPPLIER_DOCUMENT_BUCKET = "supplier-contracts";
export function validateContractFile(
  file: Pick<File, "name" | "size" | "type">,
): string | null {
  if (file.size <= 0 || file.size > 20 * 1024 * 1024)
    return "Il file deve pesare al massimo 20 MB e non essere vuoto.";
  const formats: Record<string, string> = {
    "application/pdf": "pdf",
    "image/jpeg": "jpe?g",
    "image/png": "png",
  };
  const ext = formats[file.type];
  return !ext || !new RegExp(`\\.(${ext})$`, "i").test(file.name)
    ? "Sono ammessi PDF, JPG e PNG con estensione e formato coerenti."
    : null;
}
