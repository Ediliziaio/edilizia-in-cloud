// ============================================================================
// preferencesValidators — Email Dual-Provider FASE 11
// ============================================================================
// Validatori puri usati da SettingsEmailPreferences per i campi branding +
// identità mittente. Estratti per poter essere unit-testati senza montare il
// componente React.
// ============================================================================

/** Colore HEX con # davanti, 6 cifre esadecimali, case-insensitive. */
export const HEX_REGEX = /^#[0-9A-Fa-f]{6}$/;

/** Prefisso local-part sender: lowercase, 1-30 char, solo [a-z0-9._-]. */
export const PREFIX_REGEX = /^[a-z0-9._-]{1,30}$/;

/** Email con schema minimale (local@domain.tld). */
export const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Logo: vuoto/null ammesso (opzionale), oppure URL https://. */
export function isValidLogoUrl(value: string | null | undefined): boolean {
  if (value == null) return true;
  const trimmed = value.trim();
  if (!trimmed) return true;
  return /^https:\/\/.+/i.test(trimmed);
}

export function isValidHexColor(value: string): boolean {
  return HEX_REGEX.test(value);
}

export function isValidSenderPrefix(value: string): boolean {
  return PREFIX_REGEX.test(value);
}

export function isValidEmail(value: string): boolean {
  return EMAIL_REGEX.test(value);
}

export interface PreferencesValidationInput {
  primary_color: string;
  secondary_color: string;
  sender_prefix: string;
  reply_to_email: string;
  logo_url: string;
}

export interface PreferencesValidationResult {
  primaryColor: boolean;
  secondaryColor: boolean;
  senderPrefix: boolean;
  replyTo: boolean;
  logoUrl: boolean;
  allValid: boolean;
}

export function validatePreferences(
  input: PreferencesValidationInput,
): PreferencesValidationResult {
  const primaryColor   = isValidHexColor(input.primary_color);
  const secondaryColor = isValidHexColor(input.secondary_color);
  const senderPrefix   = isValidSenderPrefix(input.sender_prefix);
  const replyTo        = isValidEmail(input.reply_to_email);
  const logoUrl        = isValidLogoUrl(input.logo_url);

  return {
    primaryColor,
    secondaryColor,
    senderPrefix,
    replyTo,
    logoUrl,
    allValid: primaryColor && secondaryColor && senderPrefix && replyTo && logoUrl,
  };
}
