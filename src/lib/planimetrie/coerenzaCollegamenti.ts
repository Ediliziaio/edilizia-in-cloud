import type { MappaCollegamenti, SceltaCollegamento, TipoCollegamento } from "./collegamenti";
export type SceltePianta = Partial<Record<TipoCollegamento, SceltaCollegamento | null>>;
export interface FiltroCollegamento { colonna: "id" | "customer_id" | "contact_id" | "quote_id" | "order_id"; id: string; descrizione: string }

export function scelteConRiferimenti(scelte: SceltePianta, mappa?: MappaCollegamenti): SceltePianta {
  return Object.fromEntries(Object.entries(scelte).map(([tipo, scelta]) => [tipo, scelta ? mappa?.[tipo as TipoCollegamento]?.[scelta.id] ?? scelta : null]));
}

/** Usa solo chiavi esplicite del gestionale; i nomi simili non sono un'associazione. */
export function filtroContesto(tipo: TipoCollegamento, s: SceltePianta): FiltroCollegamento | undefined {
  const cliente = s.cliente?.riferimenti, commessa = s.commessa?.riferimenti, preventivo = s.preventivo?.riferimenti;
  if (tipo === "computo" && s.commessa) return { colonna: "order_id", id: s.commessa.id, descrizione: "Computi della commessa selezionata" };
  if (tipo === "computo" && s.preventivo) return { colonna: "quote_id", id: s.preventivo.id, descrizione: "Computi del preventivo selezionato" };
  if (tipo === "commessa" && s.cliente) return { colonna: "customer_id", id: s.cliente.id, descrizione: "Commesse del cliente selezionato" };
  if (tipo === "commessa" && s.preventivo) return { colonna: "quote_id", id: s.preventivo.id, descrizione: "Commesse del preventivo selezionato" };
  if (tipo === "preventivo" && commessa?.preventivoId) return { colonna: "id", id: commessa.preventivoId, descrizione: "Preventivo della commessa selezionata" };
  const contattoId = cliente?.contattoId ?? s.contatto?.id;
  if (tipo === "preventivo" && contattoId) return { colonna: "contact_id", id: contattoId, descrizione: "Preventivi del contatto collegato" };
  if (tipo === "cliente" && commessa?.clienteId) return { colonna: "id", id: commessa.clienteId, descrizione: "Cliente della commessa selezionata" };
  if (tipo === "contatto" && (cliente?.contattoId ?? preventivo?.contattoId)) return { colonna: "id", id: (cliente?.contattoId ?? preventivo?.contattoId)!, descrizione: "Contatto già collegato al progetto" };
}

export function anomalieCollegamenti(s: SceltePianta): string[] {
  const anomalie: string[] = [];
  const diverso = (atteso?: string, scelto?: string) => !!atteso && !!scelto && atteso !== scelto;
  if (diverso(s.commessa?.riferimenti?.clienteId, s.cliente?.id)) anomalie.push("La commessa appartiene a un cliente diverso da quello selezionato.");
  if (diverso(s.commessa?.riferimenti?.preventivoId, s.preventivo?.id)) anomalie.push("La commessa fa riferimento a un altro preventivo.");
  if (diverso(s.computo?.riferimenti?.commessaId, s.commessa?.id)) anomalie.push("Il computo appartiene a un'altra commessa.");
  if (diverso(s.computo?.riferimenti?.preventivoId, s.preventivo?.id) || diverso(s.preventivo?.riferimenti?.computoId, s.computo?.id)) anomalie.push("Computo e preventivo hanno riferimenti diversi.");
  if (diverso(s.cliente?.riferimenti?.contattoId, s.contatto?.id)) anomalie.push("Il cliente è collegato a un altro contatto CRM.");
  if (diverso(s.preventivo?.riferimenti?.contattoId, s.contatto?.id) || diverso(s.cliente?.riferimenti?.contattoId, s.preventivo?.riferimenti?.contattoId)) anomalie.push("Il preventivo fa riferimento a un contatto CRM diverso.");
  return anomalie;
}
