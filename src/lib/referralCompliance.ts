export type BankVerificationStatus = "missing" | "draft" | "pending" | "verified" | "rejected";
export type ContractApprovalStatus = "missing" | "draft" | "signed_pending_approval" | "approved" | "rejected";

export type ReferralPayoutDetails = {
  iban?: string | null;
  account_holder?: string | null;
  bank?: string | null;
  fiscal_code?: string | null;
  bank_verification?: {
    status?: BankVerificationStatus;
    submitted_at?: string | null;
    verified_at?: string | null;
    rejected_at?: string | null;
    reviewed_by?: string | null;
    rejection_reason?: string | null;
  } | null;
  contract?: {
    status?: ContractApprovalStatus;
    version?: string | null;
    signed_name?: string | null;
    signed_at?: string | null;
    approved_at?: string | null;
    rejected_at?: string | null;
    reviewed_by?: string | null;
    rejection_reason?: string | null;
    ip_address?: string | null;
    user_agent?: string | null;
    document_url?: string | null;
  } | null;
  contract_signature?: Record<string, unknown> | null;
};

export function getReferralPayoutDetails(value: unknown): ReferralPayoutDetails {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return value as ReferralPayoutDetails;
}

export function getBankVerificationStatus(details: ReferralPayoutDetails): BankVerificationStatus {
  const explicitStatus = details.bank_verification?.status;
  if (explicitStatus) return explicitStatus;
  if (details.iban && details.account_holder) return "draft";
  if (details.iban || details.account_holder) return "draft";
  return "missing";
}

export function getContractApprovalStatus(
  details: ReferralPayoutDetails,
  hasAcceptedTerms?: boolean | null,
): ContractApprovalStatus {
  const explicitStatus = details.contract?.status;
  if (explicitStatus) return explicitStatus;
  if (details.contract_signature && hasAcceptedTerms) return "signed_pending_approval";
  if (hasAcceptedTerms) return "signed_pending_approval";
  return "missing";
}

export function bankVerificationLabel(status: BankVerificationStatus) {
  const labels: Record<BankVerificationStatus, string> = {
    missing: "Dati mancanti",
    draft: "Da inviare",
    pending: "In verifica",
    verified: "Verificato",
    rejected: "Respinto",
  };
  return labels[status];
}

export function contractApprovalLabel(status: ContractApprovalStatus) {
  const labels: Record<ContractApprovalStatus, string> = {
    missing: "Non firmato",
    draft: "Bozza",
    signed_pending_approval: "Firmato, in approvazione",
    approved: "Approvato",
    rejected: "Respinto",
  };
  return labels[status];
}

export function getPartnerPayoutCompliance({
  payoutDetails,
  hasAcceptedTerms,
}: {
  payoutDetails: unknown;
  hasAcceptedTerms?: boolean | null;
}) {
  const details = getReferralPayoutDetails(payoutDetails);
  const bankStatus = getBankVerificationStatus(details);
  const contractStatus = getContractApprovalStatus(details, hasAcceptedTerms);
  const blockers: string[] = [];

  if (bankStatus !== "verified") {
    blockers.push(`Conto corrente: ${bankVerificationLabel(bankStatus).toLowerCase()}`);
  }
  if (contractStatus !== "approved") {
    blockers.push(`Contratto partner: ${contractApprovalLabel(contractStatus).toLowerCase()}`);
  }

  return {
    details,
    bankStatus,
    contractStatus,
    ready: blockers.length === 0,
    blockers,
  };
}
