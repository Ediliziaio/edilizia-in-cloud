/**
 * Super Admin email allowlist — defense-in-depth per l'area superadmin.
 *
 * Anche se un utente dovesse avere `role = super_admin` in `user_roles`
 * (es. per errore di seed, migrazione o compromissione DB), questa lista
 * è l'ULTIMA parola: solo le email qui dentro possono effettivamente
 * ottenere il ruolo super_admin lato client.
 *
 * IMPORTANTE
 * ══════════
 * - Questo è un controllo DEFENSIVE lato client; la vera enforcement lato
 *   dato avviene tramite RLS su Postgres (vedi policies `is_super_admin`).
 * - Per aggiungere un nuovo superadmin:
 *   1. Aggiungere la email qui
 *   2. Inserire la riga in `user_roles` con role='super_admin'
 *   3. Riavviare l'app (no HMR su questo file — build-time)
 *
 * Per revocare: rimuovere SOLO da qui → utente bloccato anche se la riga
 * `user_roles` sopravvive.
 */
export const SUPER_ADMIN_EMAIL_ALLOWLIST: ReadonlyArray<string> = [
  "flo.andriciuc@gmail.com",
] as const;

/**
 * Ritorna true solo se l'email (case-insensitive) è nell'allowlist.
 * Tolerante a leading/trailing whitespace e undefined/null.
 */
export function isSuperAdminEmailAllowed(email: string | null | undefined): boolean {
  if (!email) return false;
  const normalized = email.trim().toLowerCase();
  if (!normalized) return false;
  return SUPER_ADMIN_EMAIL_ALLOWLIST.some(
    (allowed) => allowed.trim().toLowerCase() === normalized,
  );
}
