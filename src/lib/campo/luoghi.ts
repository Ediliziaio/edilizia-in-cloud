/**
 * I luoghi della giornata di chi lavora in campo (04/10/2026).
 *
 * Una persona può partire dal magazzino o dall'ufficio e poi girare per più
 * cantieri: la giornata è UNA (le ore pagate vanno dalla prima entrata all'ultima
 * uscita), ma ogni tratto ha il suo luogo — una sede dichiarata oppure un cantiere.
 * Qui si decide solo QUALI luoghi mostrare e da quale partire; la timbratura vera la
 * fa il componente, il passaggio da un luogo all'altro lo fa il database in un colpo.
 */
export interface LuogoOrigine {
  /** Cantiere assegnato a questa persona. */
  assegnazioni: ReadonlyArray<{ order_id: string; order: { order_code?: string | null; description?: string | null; indirizzo_lavori?: string | null } }>;
  /** Sedi attive dell'azienda (magazzino, ufficio…). */
  sedi: ReadonlyArray<{ id: string; nome: string | null }>;
  /** Cantieri in programma oggi per questa persona; vuoto = non si sa, valgono tutti. */
  oggiIds: ReadonlySet<string>;
  /** Cantiere di una sessione già aperta, anche se non è più fra gli assegnati. */
  apertoOrderId?: string | null;
}

export type TipoLuogo = "cantiere" | "sede" | "nessuno";

export interface Luogo {
  key: string;
  tipo: TipoLuogo;
  orderId: string | null;
  sedeId: string | null;
  nome: string;
  dettaglio: string | null;
  /** In programma oggi (o non si sa): va in primo piano. */
  oggi: boolean;
}

export const LUOGO_NESSUNO = "n";
export const chiaveCantiere = (orderId: string) => `c:${orderId}`;
export const chiaveSede = (sedeId: string) => `s:${sedeId}`;

const NESSUNO: Luogo = {
  key: LUOGO_NESSUNO, tipo: "nessuno", orderId: null, sedeId: null,
  nome: "Non so ancora dove", dettaglio: "Le ore restano da attribuire", oggi: true,
};

export function costruisciLuoghi({ assegnazioni, sedi, oggiIds, apertoOrderId }: LuogoOrigine): Luogo[] {
  const luoghi: Luogo[] = sedi.map((s): Luogo => ({
    key: chiaveSede(s.id), tipo: "sede", orderId: null, sedeId: s.id,
    nome: s.nome?.trim() || "Sede", dettaglio: null, oggi: true,
  }));
  const conosciuti = new Set<string>();
  for (const a of assegnazioni) {
    conosciuti.add(a.order_id);
    luoghi.push({
      key: chiaveCantiere(a.order_id), tipo: "cantiere", orderId: a.order_id, sedeId: null,
      nome: a.order.order_code?.trim() || "Cantiere",
      dettaglio: a.order.description?.trim() || a.order.indirizzo_lavori?.trim() || null,
      oggi: oggiIds.size === 0 || oggiIds.has(a.order_id),
    });
  }
  if (apertoOrderId && !conosciuti.has(apertoOrderId)) {
    luoghi.push({
      key: chiaveCantiere(apertoOrderId), tipo: "cantiere", orderId: apertoOrderId, sedeId: null,
      nome: "Cantiere in corso", dettaglio: null, oggi: true,
    });
  }
  return luoghi;
}

/** La chiave del luogo in cui la persona si trova ora, o null se non è in servizio. */
export function chiaveLuogoCorrente(s: { state: string; activeOrderId: string | null; activeInSede: boolean; activeSedeId: string | null }): string | null {
  if (s.state === "out") return null;
  if (s.activeOrderId) return chiaveCantiere(s.activeOrderId);
  if (s.activeInSede && s.activeSedeId) return chiaveSede(s.activeSedeId);
  return LUOGO_NESSUNO;
}

/**
 * Da dove proporre la partenza, così basta UN tocco:
 * il cantiere del link, poi l'ultimo posto da cui la persona è partita, poi l'unico
 * cantiere di oggi, poi l'unica sede se oggi non ha cantieri. Altrimenti sceglie lei.
 */
export function partenzaPredefinita(
  luoghi: readonly Luogo[],
  opzioni: { preferOrderId?: string | null; ricordata?: string | null } = {},
): string | null {
  const ha = (key: string) => luoghi.some(l => l.key === key);
  if (opzioni.preferOrderId && ha(chiaveCantiere(opzioni.preferOrderId))) return chiaveCantiere(opzioni.preferOrderId);
  if (opzioni.ricordata && (opzioni.ricordata === LUOGO_NESSUNO || ha(opzioni.ricordata))) return opzioni.ricordata;
  const cantieriOggi = luoghi.filter(l => l.tipo === "cantiere" && l.oggi);
  if (cantieriOggi.length === 1) return cantieriOggi[0].key;
  const sedi = luoghi.filter(l => l.tipo === "sede");
  if (cantieriOggi.length === 0 && sedi.length === 1) return sedi[0].key;
  return null;
}

export function trovaLuogo(luoghi: readonly Luogo[], key: string | null): Luogo | null {
  if (!key) return null;
  if (key === LUOGO_NESSUNO) return NESSUNO;
  return luoghi.find(l => l.key === key) ?? null;
}

/** Il nome da mostrare nelle frasi: «Cantiere ORD-12 · Via Roma», «Sede Verona». */
export function nomeLuogo(l: Luogo): string {
  if (l.tipo === "sede") return l.nome;
  if (l.tipo === "nessuno") return "Nessun posto indicato";
  return l.dettaglio ? `${l.nome} · ${l.dettaglio}` : l.nome;
}
