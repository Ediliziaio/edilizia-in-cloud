import type { BankMovement } from "./bankWorkspace";
import type { CandidatoRipartizione } from "@/components/tesoreria/RipartizioneMovimento";
import { leggiImporto } from "./reconciliationAnalysis";
export interface BankProposal extends CandidatoRipartizione {
  forte?: boolean;
  incongruenze?: string[];
  data?: string | null;
  controparte?: string | null;
}
export interface BankDraft {
  movement: BankMovement;
  mode: "documents" | "none" | "withholding";
  rows: Record<string, { candidate: BankProposal; amount: string }>;
  category: string;
  note: string;
  differenceReason: string;
  reviewed: boolean;
  strongKey?: string;
}
export const cents = (n: number) => Math.round(n * 100);
export function draftAllocated(d: BankDraft) {
  return (
    Object.values(d.rows).reduce(
      (s, r) => s + cents(leggiImporto(r.amount) ?? 0),
      0,
    ) / 100
  );
}
export function draftDifference(d: BankDraft) {
  return (cents(d.movement.links.remaining) - cents(draftAllocated(d))) / 100;
}
/** A score is insufficient: a proposal needs identity evidence, uniqueness and no warnings. */
export function strongProposal(
  candidates: BankProposal[],
  claims: Map<string, number>,
) {
  const strong = candidates.filter((c) => c.forte && !c.incongruenze?.length);
  if (strong.length !== 1 || claims.get(strong[0].key)! > 1) return null;
  return strong[0];
}
export function proposalClaims(proposals: Record<string, BankProposal[]>) {
  const claims = new Map<string, number>();
  for (const rows of Object.values(proposals))
    for (const c of rows.filter((c) => c.forte))
      claims.set(c.key, (claims.get(c.key) ?? 0) + 1);
  return claims;
}
export function draftProblem(d: BankDraft, all: BankDraft[]): string | null {
  if (
    d.movement.status !== "booked" ||
    d.movement.currency !== "EUR" ||
    d.movement.chiuso_senza_documento ||
    d.movement.links.remaining <= 0
  )
    return "Movimento non disponibile per la riconciliazione";
  if (!d.reviewed) return "Verifica e seleziona il movimento";
  if (d.mode === "none")
    return !d.category
      ? "Scegli una categoria"
      : d.movement.links.matched > 0
        ? "Un movimento parziale ha già documenti collegati"
        : null;
  if (!Object.keys(d.rows).length) return "Scegli almeno un documento";
  if (d.mode === "withholding")
    return d.movement.transaction_type !== "credit" ||
      Object.values(d.rows).length !== 1 ||
      Object.values(d.rows)[0].candidate.tipo !== "documento"
      ? "La ritenuta richiede un incasso e una fattura interna"
      : null;
  for (const { candidate: c, amount } of Object.values(d.rows)) {
    const n = leggiImporto(amount);
    if (n === null || n <= 0 || cents(n) > cents(c.residuo))
      return `Controlla la quota di ${c.titolo}`;
    const total = all
      .filter((x) => x.mode === "documents")
      .flatMap((x) => Object.values(x.rows))
      .filter((x) => x.candidate.key === c.key)
      .reduce((s, r) => s + cents(leggiImporto(r.amount) ?? 0), 0);
    if (total > cents(c.residuo))
      return `Le quote superano il residuo di ${c.titolo}`;
  }
  const diff = draftDifference(d);
  if (diff < 0)
    return "Le quote superano il movimento. Per un bonifico parlante usa la gestione ritenuta";
  if (
    ["commissioni", "arrotondamento"].includes(d.differenceReason) &&
    (d.movement.transaction_type !== "debit" || diff <= 0)
  )
    return "La differenza da registrare richiede un pagamento e un residuo positivo";
  if (d.differenceReason === "arrotondamento" && diff > 1)
    return "Arrotondamento superiore a 1 euro";
  if (diff > 0 && !d.differenceReason)
    return "Indica come gestire la differenza residua";
  return null;
}
export function draftPayload(d: BankDraft) {
  return {
    id: d.movement.id,
    mode: d.mode,
    expected_remaining: d.movement.links.remaining,
    revision: d.movement.links.revision,
    rows: Object.values(d.rows).map(({ candidate: c, amount }) => ({
      tipo: c.tipo,
      id: c.id,
      importo: leggiImporto(amount),
    })),
    proposal_key: d.strongKey ?? null,
    category: d.category,
    note: d.note || null,
    difference_reason: d.differenceReason || null,
    document_id:
      d.mode === "withholding" ? Object.values(d.rows)[0]?.candidate.id : null,
  };
}
export function ownAccountTransfer(
  m: BankMovement,
  accounts: { id: string; iban?: string | null }[],
) {
  const iban = (
    m.transaction_type === "credit" ? m.debtor_iban : m.creditor_iban
  )
    ?.replace(/\s/g, "")
    .toUpperCase();
  return (
    !!iban &&
    accounts.some(
      (a) =>
        a.id !== m.account_id &&
        a.iban?.replace(/\s/g, "").toUpperCase() === iban,
    )
  );
}
