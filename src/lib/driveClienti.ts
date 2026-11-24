// EiC Drive → «Clienti»: le cartelle standard di ogni cliente.
// Le righe arrivano da drive_documenti_clienti() (database): documenti che
// esistono già nelle commesse, mai copiati. Qui solo raggruppamento e conteggi.

export const CARTELLE_CLIENTE = [
  { chiave: "documenti_generali", nome: "Documenti generali" },
  { chiave: "preventivi_accettati", nome: "Preventivi accettati" },
  { chiave: "contratti_verbali", nome: "Contratti e verbali" },
  { chiave: "ordini_acquisto", nome: "Ordini d'acquisto" },
  { chiave: "richieste_offerta", nome: "Richieste d'offerta" },
  { chiave: "ddt", nome: "DDT" },
  { chiave: "fatture_fornitori", nome: "Fatture fornitori" },
  { chiave: "subappalti", nome: "Contratti subappaltatori" },
  { chiave: "foto_cantiere", nome: "Foto cantiere" },
] as const;

export type CartellaCliente = (typeof CARTELLE_CLIENTE)[number]["chiave"];

export type RigaDriveCliente = {
  cliente_chiave: string; cliente: string; order_id: string; order_code: string | null; cartella: string;
  id: string; nome: string; bucket: string | null; path: string | null; link: string | null; data: string | null;
};

export type ClienteDrive = { chiave: string; nome: string; documenti: number; commesse: number };

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

/** Le cartelle standard del cliente, tutte (anche vuote: la struttura è sempre la stessa), col numero di documenti. */
export function cartelleDelCliente(righe: readonly RigaDriveCliente[], cliente: string) {
  const conteggi = new Map<string, number>();
  for (const r of righe) if (r.cliente_chiave === cliente) conteggi.set(r.cartella, (conteggi.get(r.cartella) ?? 0) + 1);
  return CARTELLE_CLIENTE.map(c => ({ ...c, documenti: conteggi.get(c.chiave) ?? 0 }));
}

export function righeDelCliente(righe: readonly RigaDriveCliente[], cliente: string | null, cartella: string | null) {
  return righe.filter(r => (!cliente || r.cliente_chiave === cliente) && (!cartella || r.cartella === cartella));
}

export function nomeCartellaCliente(chiave: string): string {
  return CARTELLE_CLIENTE.find(c => c.chiave === chiave)?.nome ?? chiave;
}
