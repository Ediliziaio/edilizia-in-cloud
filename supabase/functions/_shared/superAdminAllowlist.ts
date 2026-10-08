// Le email che possono essere super admin. Stessa lista di src/config/superAdmin.ts (un test ne verifica la parità).
//
// Perché serve anche qui: il ruolo `super_admin` dà accesso a TUTTO nel database, a prescindere dalle caselle dei
// permessi. La lista nel browser è solo una difesa dell'interfaccia: chi invitiamo come «admin» e non è in questa
// lista riceve un ruolo di team (Gestore), i cui permessi il database rispetta davvero.
export const SUPER_ADMIN_EMAIL_ALLOWLIST: ReadonlyArray<string> = ["flo.andriciuc@gmail.com"];

export function emailSuperAdminConsentita(email: string | null | undefined): boolean {
  const e = String(email ?? "").trim().toLowerCase();
  return !!e && SUPER_ADMIN_EMAIL_ALLOWLIST.some((a) => a.trim().toLowerCase() === e);
}

/** Il ruolo da assegnare a un nuovo «admin»: super admin solo se l'email è in lista, altrimenti Gestore di piattaforma. */
export function ruoloPerNuovoAdmin(email: string | null | undefined): "super_admin" | "platform_manager" {
  return emailSuperAdminConsentita(email) ? "super_admin" : "platform_manager";
}
