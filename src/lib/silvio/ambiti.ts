/**
 * ambiti.ts — MP-SILVIO sicurezza · visibilità dati per ruolo (logica pura)
 * Specchio TS della policy DB silvio_ambito_consentito: marketing/operai NON
 * vedono la finanza. Usato per test + per filtrare ciò che la UI/modello mostra.
 * Nessun I/O. L'autorità resta il DB.
 */

export type Ambito = "finanza" | "marketing" | "clienti" | "cantieri" | "magazzino" | "hr" | "generale";

export const TUTTI_AMBITI: Ambito[] = ["finanza", "marketing", "clienti", "cantieri", "magazzino", "hr", "generale"];

// Policy ruolo→ambiti (unione fra i ruoli posseduti). Specchio della funzione DB.
const POLICY: Record<string, Ambito[] | "all"> = {
  super_admin: "all",
  company_admin: "all",
  company_staff: ["finanza", "marketing", "clienti", "cantieri", "magazzino", "generale"], // tutto tranne HR
  accountant: ["finanza", "clienti", "generale"],
  salesperson: ["marketing", "clienti", "generale"],   // marketing/commerciale: MAI finanza
  employee: ["cantieri", "magazzino", "generale"],       // operai: MAI finanza/marketing
  worker: ["cantieri", "magazzino", "generale"],
};

/** L'ambito è consentito se ALMENO uno dei ruoli dell'utente lo concede. */
export function ambitoConsentito(ruoli: string[], ambito: string): boolean {
  for (const r of ruoli ?? []) {
    const p = POLICY[r];
    if (p === "all") return true;
    if (Array.isArray(p) && p.includes(ambito as Ambito)) return true;
  }
  return false;
}

/** Unione degli ambiti visibili a chi possiede questi ruoli. */
export function ambitiDelRuolo(ruoli: string[]): Ambito[] {
  if ((ruoli ?? []).some((r) => POLICY[r] === "all")) return [...TUTTI_AMBITI];
  const out = new Set<Ambito>();
  for (const r of ruoli ?? []) {
    const p = POLICY[r];
    if (Array.isArray(p)) p.forEach((a) => out.add(a));
  }
  return TUTTI_AMBITI.filter((a) => out.has(a));
}

export function etichettaAmbito(a: string | null | undefined): string {
  switch (a) {
    case "finanza": return "Finanza";
    case "marketing": return "Marketing";
    case "clienti": return "Clienti";
    case "cantieri": return "Cantieri";
    case "magazzino": return "Magazzino";
    case "hr": return "Personale";
    case "generale": return "Generale";
    default: return a ?? "—";
  }
}
