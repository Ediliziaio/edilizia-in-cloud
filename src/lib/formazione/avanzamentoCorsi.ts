/**
 * Avanzamento di UNA persona in un corso del Portale formazione.
 *
 * Unica regola per «La mia formazione» e per la vista dipendente del Portale.
 * Il 25/09/2026 la stessa persona vedeva gli stessi due corsi al 72% e al 61%
 * nel Portale e allo 0% nell'altra pagina: il Portale contava come suo
 * l'avanzamento dei moduli non fatti usando `completedRate`, che è un dato
 * del corso (quanti lo completano in azienda), non di chi lo sta guardando.
 * (82 + 71 + 64) / 3 = 72, (74 + 48) / 2 = 61. Con la stessa formula,
 * completare un modulo su tre salvava 78% nel database invece di 33%.
 *
 * Le regole:
 * - l'avanzamento vero sta nel database (`portal_course_enrollments`), che
 *   non scende mai (savePortalCourseEnrollment tiene il massimo);
 * - il browser tiene quali moduli sono stati spuntati, in UNA chiave per
 *   corso condivisa dalle due pagine;
 * - quello che si vede è il massimo tra i moduli spuntati e il database;
 * - `completedRate` dei moduli e `completion` del corso non entrano mai.
 */

/** Percentuale 0-100, intera. */
function percentuale(valore: number): number {
  if (!Number.isFinite(valore)) return 0;
  return Math.max(0, Math.min(100, Math.round(valore)));
}

/**
 * L'avanzamento da mostrare e da salvare: moduli spuntati sul totale, mai
 * sotto quello già salvato. Un corso senza moduli è fatto o non fatto.
 */
export function avanzamentoCorso(totaleModuli: number, moduliSpuntati: number, avanzamentoSalvato = 0): number {
  const salvato = percentuale(avanzamentoSalvato);
  if (totaleModuli <= 0) return moduliSpuntati > 0 || salvato >= 100 ? 100 : 0;
  const daiModuli = percentuale((Math.min(Math.max(moduliSpuntati, 0), totaleModuli) / totaleModuli) * 100);
  return Math.max(daiModuli, salvato);
}

/**
 * Quanti moduli (i primi del corso) si possono dare per fatti partendo da
 * una percentuale salvata, senza mai superarla: 33% di 3 moduli è 1 modulo
 * (con Math.floor diventava 0, perché 0,33 × 3 = 0,99), 50% di 3 resta 1.
 * Il margine copre solo l'arrotondamento con cui la percentuale è stata
 * salvata (mezzo punto percentuale).
 */
export function moduliDaAvanzamento(avanzamento: number, totaleModuli: number): number {
  if (totaleModuli <= 0) return 0;
  const salvato = percentuale(avanzamento);
  if (salvato >= 100) return totaleModuli;
  const esatti = (salvato * totaleModuli) / 100 + totaleModuli / 200 + 1e-9;
  return Math.max(0, Math.min(totaleModuli, Math.floor(esatti)));
}

/**
 * I moduli da mostrare spuntati: quelli spuntati su questo dispositivo, oppure,
 * se qui non ce n'è nessuno (altro telefono, cache pulita), i primi del corso
 * che l'avanzamento salvato giustifica. Non si sommano le due cose: il
 * database sa QUANTI moduli, non QUALI, e unirli potrebbe contarne di più.
 */
export function moduliDaMostrare(
  spuntatiQui: readonly string[],
  avanzamentoSalvato: number,
  idModuli: readonly string[],
): string[] {
  const esistenti = new Set(idModuli);
  const validi = [...new Set(spuntatiQui)].filter((id) => esistenti.has(id));
  if (validi.length > 0) return validi;
  if (idModuli.length === 0) return [];
  return idModuli.slice(0, moduliDaAvanzamento(avanzamentoSalvato, idModuli.length));
}

// ─── Moduli spuntati nel browser ─────────────────────────────────────────────
// Una chiave per persona e corso, la stessa di «La mia formazione» da sempre:
// ora la usa anche il Portale, che prima teneva i suoi in un'altra chiave
// (eic-personale-portale-learner-state-v1) che l'altra pagina non leggeva.

export function chiaveModuliSpuntati(companyId: string, userId: string, courseId: string): string {
  return `portale-formazione:${companyId}:${userId}:${courseId}`;
}

export function leggiModuliSpuntati(
  companyId: string | null | undefined,
  userId: string | null | undefined,
  courseId: string,
): string[] {
  if (!companyId || !userId || typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(chiaveModuliSpuntati(companyId, userId, courseId));
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? parsed.filter((x): x is string => typeof x === "string") : [];
  } catch {
    return [];
  }
}

export function salvaModuliSpuntati(
  companyId: string | null | undefined,
  userId: string | null | undefined,
  courseId: string,
  ids: readonly string[],
): void {
  if (!companyId || !userId || typeof window === "undefined") return;
  try {
    window.localStorage.setItem(chiaveModuliSpuntati(companyId, userId, courseId), JSON.stringify([...new Set(ids)]));
  } catch {
    /* quota / navigazione privata: il database resta la fonte di verità */
  }
}
