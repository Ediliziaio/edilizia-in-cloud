/**
 * Cryptographically secure password generator using Web Crypto API.
 * Replaces all Math.random()-based password generation.
 */

const LOWERCASE = "abcdefghijklmnopqrstuvwxyz";
const UPPERCASE = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
const DIGITS = "0123456789";
const SYMBOLS = "!@#$%^&*";
const ALL_CHARS = LOWERCASE + UPPERCASE + DIGITS + SYMBOLS;

/**
 * Generate a cryptographically secure random integer in [0, max).
 */
function secureRandomInt(max: number): number {
  const array = new Uint32Array(1);
  crypto.getRandomValues(array);
  return array[0] % max;
}

/**
 * Fisher-Yates shuffle using crypto.getRandomValues for unbiased shuffling.
 */
function secureShuffle(arr: string[]): string[] {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = secureRandomInt(i + 1);
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

/**
 * Generate a cryptographically secure password.
 * Guarantees at least one character from each category.
 * @param length Password length (minimum 8, default 12)
 */
export function generateSecurePassword(length = 12): string {
  const effectiveLength = Math.max(length, 8);

  // Ensure at least one char from each category
  const mandatory = [
    LOWERCASE[secureRandomInt(LOWERCASE.length)],
    UPPERCASE[secureRandomInt(UPPERCASE.length)],
    DIGITS[secureRandomInt(DIGITS.length)],
    SYMBOLS[secureRandomInt(SYMBOLS.length)],
  ];

  // Fill remaining length with random chars from all categories
  const remaining: string[] = [];
  for (let i = mandatory.length; i < effectiveLength; i++) {
    remaining.push(ALL_CHARS[secureRandomInt(ALL_CHARS.length)]);
  }

  // Combine and shuffle to avoid predictable positions
  const allChars = secureShuffle([...mandatory, ...remaining]);
  return allChars.join("");
}
