export interface RichiediFirmaFormInput {
  email: string;
  nome: string;
  documentoId: string;
  scadenzaGiorni: number | string;
  pdfMissing?: boolean;
}

export interface RichiediFirmaPayload {
  signer_email: string;
  signer_name: string;
  documento_id: string;
  scadenza_giorni: number;
}

export interface FirmaSignerFieldsInput {
  email: string;
  nome: string;
  scadenzaGiorni: number | string;
}

export interface FirmaSignerFieldsPayload {
  signer_email: string;
  signer_name: string;
  scadenza_giorni: number;
}

export type RichiediFirmaValidationResult =
  | { ok: true; payload: RichiediFirmaPayload }
  | { ok: false; error: string };

export type FirmaSignerFieldsValidationResult =
  | { ok: true; payload: FirmaSignerFieldsPayload }
  | { ok: false; error: string };

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const DEFAULT_EXPIRY_DAYS = 14;
const MIN_EXPIRY_DAYS = 1;
const MAX_EXPIRY_DAYS = 60;

export function clampSignatureExpiryDays(value: number | string): number {
  const parsed = typeof value === "number" ? value : Number.parseInt(value, 10);
  if (!Number.isFinite(parsed)) return DEFAULT_EXPIRY_DAYS;
  return Math.min(MAX_EXPIRY_DAYS, Math.max(MIN_EXPIRY_DAYS, Math.round(parsed)));
}

export function validateRichiediFirmaForm(
  input: RichiediFirmaFormInput,
): RichiediFirmaValidationResult {
  const documentoId = input.documentoId.trim();

  if (input.pdfMissing) {
    return { ok: false, error: "Genera il PDF prima di inviare la richiesta di firma." };
  }

  if (!documentoId) {
    return { ok: false, error: "Documento non valido: rigenera o riapri il preventivo." };
  }

  const signerFields = validateFirmaSignerFields(input);
  if (!signerFields.ok) return signerFields;

  return {
    ok: true,
    payload: {
      ...signerFields.payload,
      documento_id: documentoId,
    },
  };
}

export function validateFirmaSignerFields(
  input: FirmaSignerFieldsInput,
): FirmaSignerFieldsValidationResult {
  const signerEmail = input.email.trim().toLowerCase();
  const signerName = input.nome.trim();

  if (!signerName) {
    return { ok: false, error: "Nome e cognome firmatario sono obbligatori" };
  }

  if (!EMAIL_RE.test(signerEmail)) {
    return { ok: false, error: "Email firmatario non valida" };
  }

  return {
    ok: true,
    payload: {
      signer_email: signerEmail,
      signer_name: signerName,
      scadenza_giorni: clampSignatureExpiryDays(input.scadenzaGiorni),
    },
  };
}
