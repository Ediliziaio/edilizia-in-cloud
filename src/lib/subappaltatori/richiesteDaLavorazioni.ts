import type { AffidamentoChiFaCosa } from "./affidamentiCommessa";
import type { RigaElencoLavori } from "./contrattoSubappaltoHtml";

export type RigaRichiesta = Pick<RigaElencoLavori, "fase" | "sottofase" | "descrizione" | "quantita" | "unita" | "comprende"> & {
  id: string;
  ambito: string;
  faseId?: string;
  sottofaseId?: string;
};

export interface RichiestaDaLavorazioni {
  id: string;
  dittaId: string;
  ditta: string;
  commessa?: string | null;
  periodo: { dal: string | null; al: string | null };
  righe: RigaRichiesta[];
  creataIl: string;
  luogo?: string | null;
  scadenza?: string | null;
  istruzioni?: string | null;
  destinatario?: { indirizzo?: string | null; partitaIva?: string | null; email?: string | null };
  inviataIl?: string;
  contrattoId?: string;
  offerta?: { data: string; riferimento: string; prezzi: Record<string, number>; contrattoId?: string };
}

export interface RegistroSubappalto {
  richieste: RichiestaDaLavorazioni[];
  interne: string[];
}

export type ArchivioSubappalto = RegistroSubappalto & { versione: number };
type Offerta = NonNullable<RichiestaDaLavorazioni["offerta"]>;
export type OperazioneSubappalto =
  | { tipo: "crea"; richiesta: RichiestaDaLavorazioni }
  | { tipo: "importa"; registro: RegistroSubappalto }
  | { tipo: "invia"; id: string }
  | { tipo: "offerta"; id: string; offerta: Omit<Offerta, "contrattoId">; precedente: Offerta | null }
  | { tipo: "contratto"; id: string; contrattoId: string; daOfferta: boolean }
  | { tipo: "interno"; ambito: string; interno: boolean };

export const registroVuoto: RegistroSubappalto = { richieste: [], interne: [] };

export function aggiornaRichiesta(registro: RegistroSubappalto, richiesta: RichiestaDaLavorazioni): RegistroSubappalto {
  return { ...registro, richieste: [richiesta, ...registro.richieste.filter((r) => r.id !== richiesta.id)] };
}

export function situazioneSubappalto(
  chiave: string, quantita: number, registro: RegistroSubappalto,
  quote: readonly AffidamentoChiFaCosa[],
  collegamenti: { bozze: ReadonlySet<string>; aCorpo: number; aCorpoInBozza: number },
) {
  const affidamenti = quote.filter((a) => `v:${a.voce_id}` === chiave);
  const misura = (n: number) => Math.round(n * 1000) / 1000;
  const contratti = affidamenti.filter((a) => a.stato === "a_contratto" || a.contratto_id);
  const eBozza = (id?: string | null) => !!id && collegamenti.bozze.has(id);
  const contrattata = misura(collegamenti.aCorpo + contratti
    .filter((a) => !eBozza(a.contratto_id)).reduce((n, a) => n + Number(a.quantita), 0));
  const inContrattoBozza = misura(collegamenti.aCorpoInBozza + contratti
    .filter((a) => eBozza(a.contratto_id)).reduce((n, a) => n + Number(a.quantita), 0));
  const inAffidamentoBozza = misura(affidamenti.filter((a) => a.stato === "bozza" && !a.contratto_id)
    .reduce((n, a) => n + Number(a.quantita), 0));
  const residua = Math.max(0, misura(quantita - contrattata - inContrattoBozza - inAffidamentoBozza));
  const richieste = registro.richieste.filter((r) => r.righe.some((v) =>
    v.ambito === chiave && !r.contrattoId && !(r.offerta?.contrattoId && r.offerta.prezzi[v.id] != null)));
  const offerta = richieste.some((r) => r.righe.some((v) => v.ambito === chiave && r.offerta?.prezzi[v.id] != null));
  const interna = registro.interne.includes(chiave);
  const stato = contrattata > 0 && contrattata >= quantita ? "A contratto"
    : inContrattoBozza > 0 && contrattata + inContrattoBozza >= quantita ? "Contratto in bozza"
    : interna ? "Lavoro interno"
    : offerta ? "Offerta ricevuta"
    : richieste.some((r) => r.inviataIl) ? "In attesa di offerta"
    : inAffidamentoBozza > 0 ? "Affidamento in bozza"
    : richieste.length ? "Richiesta in bozza"
    : "Da quotare";
  return { stato, contrattata, inContrattoBozza, inAffidamentoBozza, residua, interna };
}
