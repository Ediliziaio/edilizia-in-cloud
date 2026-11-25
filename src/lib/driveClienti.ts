// EiC Drive → «Clienti»: le cartelle standard di ogni cliente.
// Le righe arrivano da drive_documenti_clienti() (database): documenti che
// esistono già nelle commesse, mai copiati. Qui solo raggruppamento e conteggi:
// cliente → commessa (o tutte) → cartella standard.

export const CARTELLE_CLIENTE = [
  { chiave: "documenti_generali", nome: "Documenti generali" },
  { chiave: "preventivi_accettati", nome: "Preventivi accettati" },
  { chiave: "contratti_verbali", nome: "Contratti e verbali" },
  { chiave: "ordini_acquisto", nome: "Ordini d'acquisto" },
  { chiave: "richieste_offerta", nome: "Richieste d'offerta" },
  { chiave: "ddt", nome: "DDT" },
  { chiave: "fatture_fornitori", nome: "Fatture fornitori" },
  { chiave: "subappalti", nome: "Contratti subappaltatori" },
  { chiave: "sicurezza", nome: "Sicurezza" },
  { chiave: "sal", nome: "SAL" },
  { chiave: "foto_cantiere", nome: "Foto cantiere" },
] as const;

export type CartellaCliente = (typeof CARTELLE_CLIENTE)[number]["chiave"];

export type RigaDriveCliente = {
  cliente_chiave: string; cliente: string; order_id: string; order_code: string | null; commessa: string | null; cartella: string;
  id: string; nome: string; bucket: string | null; path: string | null; link: string | null; data: string | null;
};

export type ClienteDrive = { chiave: string; nome: string; documenti: number; commesse: number };

export type CommessaDrive = { id: string; codice: string | null; descrizione: string | null; documenti: number; ultima: string | null };

/** Un cliente per chiave (profilo, o nome se la commessa non ha un cliente in anagrafica), in ordine alfabetico. */
export function clientiDrive(righe: readonly RigaDriveCliente[]): ClienteDrive[] {
  const perChiave = new Map<string, { nome: string; documenti: number; commesse: Set<string> }>();
  for (const r of righe) {
    const c = perChiave.get(r.cliente_chiave) ?? { nome: r.cliente, documenti: 0, commesse: new Set<string>() };
    c.documenti += 1;
    c.commesse.add(r.order_id);
    perChiave.set(r.cliente_chiave, c);
  }
  return [...perChiave.entries()]
    .map(([chiave, c]) => ({ chiave, nome: c.nome, documenti: c.documenti, commesse: c.commesse.size }))
    .sort((a, b) => a.nome.localeCompare(b.nome, "it"));
}

/** Le commesse del cliente, dalla più recente (ultimo documento), col numero di documenti. */
export function commesseDelCliente(righe: readonly RigaDriveCliente[], cliente: string): CommessaDrive[] {
  const perId = new Map<string, CommessaDrive>();
  for (const r of righe) {
    if (r.cliente_chiave !== cliente) continue;
    const c = perId.get(r.order_id) ?? { id: r.order_id, codice: r.order_code, descrizione: r.commessa, documenti: 0, ultima: null };
    c.documenti += 1;
    if (r.data && (!c.ultima || r.data > c.ultima)) c.ultima = r.data;
    perId.set(r.order_id, c);
  }
  return [...perId.values()].sort((a, b) => (b.ultima ?? "").localeCompare(a.ultima ?? "") || (a.codice ?? "").localeCompare(b.codice ?? "", "it"));
}

/** Nome da mostrare per una commessa: codice e descrizione, quando ci sono. */
export function nomeCommessa(c: Pick<CommessaDrive, "codice" | "descrizione">): string {
  return [c.codice, c.descrizione].filter(Boolean).join(" · ") || "Commessa senza codice";
}

/** Le cartelle standard del cliente (o di una sua commessa), tutte — anche vuote: la struttura è sempre la stessa —, col numero di documenti. */
export function cartelleDelCliente(righe: readonly RigaDriveCliente[], cliente: string, commessa: string | null = null) {
  const conteggi = new Map<string, number>();
  for (const r of righe) {
    if (r.cliente_chiave === cliente && (!commessa || r.order_id === commessa)) conteggi.set(r.cartella, (conteggi.get(r.cartella) ?? 0) + 1);
  }
  return CARTELLE_CLIENTE.map(c => ({ ...c, documenti: conteggi.get(c.chiave) ?? 0 }));
}

export function righeDelCliente(righe: readonly RigaDriveCliente[], cliente: string | null, cartella: string | null, commessa: string | null = null) {
  return righe.filter(r => (!cliente || r.cliente_chiave === cliente) && (!commessa || r.order_id === commessa) && (!cartella || r.cartella === cartella));
}

export function nomeCartellaCliente(chiave: string): string {
  return CARTELLE_CLIENTE.find(c => c.chiave === chiave)?.nome ?? chiave;
}
