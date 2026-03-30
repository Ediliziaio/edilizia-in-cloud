export type PasswordStrength = "weak" | "fair" | "good" | "strong";

export interface PasswordStrengthResult {
  score: number; // 0-4
  strength: PasswordStrength;
  label: string;
  color: string;
  suggestions: string[];
}

/**
 * Evaluates password strength on a 0-4 scale.
 * Used at account creation, password reset, and profile settings.
 */
export function evaluatePasswordStrength(password: string): PasswordStrengthResult {
  const suggestions: string[] = [];
  let score = 0;

  if (password.length >= 8) score++;
  else suggestions.push("Usa almeno 8 caratteri");

  if (password.length >= 12) score++;
  else if (password.length >= 8) suggestions.push("Una password più lunga (12+ caratteri) è più sicura");

  if (/[A-Z]/.test(password)) score++;
  else suggestions.push("Aggiungi almeno una lettera maiuscola");

  if (/[0-9]/.test(password)) score++;
  else suggestions.push("Aggiungi almeno un numero");

  if (/[^A-Za-z0-9]/.test(password)) score++;
  else suggestions.push("Aggiungi un carattere speciale (es. !, @, #)");

  // Cap at 4
  const finalScore = Math.min(score, 4);

  const levels: Record<number, { strength: PasswordStrength; label: string; color: string }> = {
    0: { strength: "weak",   label: "Molto debole", color: "bg-red-500" },
    1: { strength: "weak",   label: "Debole",       color: "bg-red-400" },
    2: { strength: "fair",   label: "Sufficiente",  color: "bg-yellow-400" },
    3: { strength: "good",   label: "Buona",        color: "bg-blue-400" },
    4: { strength: "strong", label: "Ottima",       color: "bg-green-500" },
  };

  return {
    score: finalScore,
    ...levels[finalScore],
    suggestions,
  };
}

/** Returns true if the password meets the minimum security requirements. */
export function isPasswordAcceptable(password: string): boolean {
  const { score } = evaluatePasswordStrength(password);
  return score >= 2;
}
