import type { FotoPronta } from "./preparaFoto";
import type { MisuraSottofaseCampo, SchedaCantiere, TipoVisitaCampo } from "./schedaCantiere";
import { avanzamentoFase } from "@/lib/orders/cronoprogramma";

export const MAX_FOTO_TECNICHE = 8;
export const TIPI_FOTO_TECNICHE = ["image/jpeg", "image/png", "image/webp"];
export type FotoTecnica = Omit<FotoPronta, "blob"> & { bytes: ArrayBuffer };

export interface DestinazioneAvanzamento {
  faseId: string;
  sottofaseId?: string;
  nome: string;
  percentuale: number;
  completata: boolean;
  misura?: MisuraSottofaseCampo;
  derivata?: boolean;
}

type DatiComuni = {
  company_id: string;
  user_id: string;
  order_id: string;
  nomeCantiere: string;
  note: string;
  foto: FotoTecnica[];
};

export type BozzaAvanzamento = DatiComuni & {
  tipo: "avanzamento";
  target: DestinazioneAvanzamento;
  valore: string;
  chiusuraRichiesta: boolean;
};

export type BozzaVisita = DatiComuni & {
  tipo: "rilievo";
  visita: TipoVisitaCampo;
  giorno: string;
  misure: string;
};

export type DatiBozzaTecnica = BozzaAvanzamento | BozzaVisita;

export interface BozzaTecnica<T extends DatiBozzaTecnica = DatiBozzaTecnica> {
  id: string;
  operationId: string;
  versione: number;
  aggiornataIl: number;
  payload: T;
}

export function idBozzaTecnica(dati: DatiBozzaTecnica): string {
  const destinazione = dati.tipo === "avanzamento" ? dati.target.sottofaseId ?? dati.target.faseId : dati.visita;
  return [dati.company_id, dati.user_id, dati.order_id, dati.tipo, destinazione].join(":");
}

export const valoreAttualeAvanzamento = (target: DestinazioneAvanzamento) => target.misura?.eseguita ?? target.percentuale;

export function destinazioneAvanzamento(scheda: SchedaCantiere, faseId: string, sottofaseId?: string): DestinazioneAvanzamento | undefined {
  const fase = scheda.fasi?.find(f => f.id === faseId);
  const sottofase = fase?.sottofasi.find(s => s.id === sottofaseId);
  if (!fase || (sottofaseId && !sottofase)) return;
  return {
    faseId, sottofaseId, nome: sottofase ? `${sottofase.name} · ${fase.name}` : fase.name,
    percentuale: sottofase ? (sottofase.fatta ? 100 : sottofase.percentuale ?? 0) : avanzamentoFase(fase),
    completata: sottofase ? sottofase.fatta : fase.status === "completata",
    misura: sottofase && scheda.misure?.[sottofase.id],
    derivata: !sottofase && fase.sottofasi.length > 0,
  };
}

export function valoreBozzaAvanzamento(dati: BozzaAvanzamento) {
  const { target, valore, chiusuraRichiesta } = dati;
  const parsed = /^\d+(?:[.,]\d{1,3})?$/.test(valore.trim()) ? Number(valore.trim().replace(",", ".")) : null;
  const valido = Boolean(target.derivata) || (parsed !== null && (
    target.misura ? parsed < 100_000_000_000 : Number.isInteger(parsed) && parsed <= 100
  ));
  const avanzamento = target.derivata || (parsed === valoreAttualeAvanzamento(target) && !chiusuraRichiesta)
    ? null : parsed;
  return { valido, avanzamento };
}

export function nomeBozzaTecnica(dati: DatiBozzaTecnica) {
  if (dati.tipo === "avanzamento") return `Avanzamento · ${dati.target.nome}`;
  return dati.visita === "sopralluogo" ? "Sopralluogo" : "Rilievo";
}
