import type { CriterioItp } from "./itp";
import type { EvidenzaFascicolo, RuoloIncarico } from "./fascicolo";
import { voceCatalogo } from "./catalogoDocumenti";
export type DestinatarioItp = "impresa" | "commessa" | "operaio" | "incarico";
export interface OperaioItp {
  id: string;
  nome: string;
  cognome: string;
  mansione: string;
  attivo: boolean;
  updated_at: string;
  assegnazioni: Array<{
    id: string;
    dal: string;
    al: string | null;
    area: string | null;
    attivita: string;
    fase_id: string | null;
    updated_at: string;
  }>;
}
export interface IncaricoItp {
  id: string;
  ruolo: RuoloIncarico;
  nominativo: string;
  dal: string;
  al: string | null;
  stato: "proposto" | "documentato" | "cessato";
  figura_id: string | null;
  subappaltatore_id: string | null;
  order_id: string | null;
  updated_at: string;
}
export interface SoggettiItp {
  operai: OperaioItp[];
  incarichi: IncaricoItp[];
}
export type SoggettoSnapshotItp =
  | { tipo: "operaio"; dati: OperaioItp }
  | { tipo: "incarico"; dati: IncaricoItp };
export const MAX_CRITERI_ITP = 500;
export function destinatarioCriterio(c: CriterioItp): DestinatarioItp {
  if (c.destinatario) return c.destinatario;
  if (c.operaio_id) return "operaio";
  if (c.incarico_id) return "incarico";
  const ambito = voceCatalogo(c.catalogo_id, c.catalogo_versione)?.ambito;
  return ambito === "commessa"
    ? "commessa"
    : ambito === "incarico"
      ? "incarico"
      : ambito === "persona_o_incarico"
        ? "operaio"
        : "impresa";
}
export function criterioNominativo(c: CriterioItp) {
  return (
    ["operaio", "incarico"].includes(destinatarioCriterio(c)) || !!c.gruppo_id
  );
}
export function operaiNelContesto(
  s: SoggettiItp,
  data: string,
  faseId?: string | null,
) {
  return s.operai.filter((o) =>
    o.assegnazioni.some(
      (a) =>
        a.dal <= data &&
        (!a.al || a.al >= data) &&
        (!faseId || !a.fase_id || a.fase_id === faseId),
    ),
  );
}
export function incarichiNelContesto(
  s: SoggettiItp,
  data: string,
  ruolo?: string | null,
) {
  return s.incarichi.filter(
    (i) =>
      i.dal <= data &&
      (!i.al || i.al >= data) &&
      i.stato !== "cessato" &&
      (!ruolo || i.ruolo === ruolo),
  );
}
export function resetNominativo(c: CriterioItp): CriterioItp {
  return {
    ...c,
    applicabilita: "da_chiarire",
    esito: "da_verificare",
    note: "",
    evidenze: [],
    soggetto_snapshot: undefined,
  };
}
/** An explicit scope change cannot retain another person's evidence or an old judgement. */
export function cambiaDestinatario(
  c: CriterioItp,
  destinatario: DestinatarioItp,
): CriterioItp {
  return {
    ...resetNominativo(c),
    destinatario,
    operaio_id: undefined,
    incarico_id: undefined,
    ruolo: undefined,
    gruppo_id: undefined,
    copertura: undefined,
  };
}
export function espandiCopertura(
  c: CriterioItp,
  s: SoggettiItp,
  data: string,
  faseId?: string | null,
  gruppoId: string = crypto.randomUUID(),
): CriterioItp[] {
  const dest = destinatarioCriterio(c);
  const base: CriterioItp = {
    ...resetNominativo(c),
    destinatario: dest,
    gruppo_id: gruppoId,
    operaio_id: undefined,
    incarico_id: undefined,
  };
  if (dest === "operaio") {
    const persone = operaiNelContesto(s, data, faseId);
    return persone.length
      ? persone.map((o) => ({
          ...base,
          id: crypto.randomUUID(),
          copertura: "operai_assegnati",
          operaio_id: o.id,
        }))
      : [{ ...base, id: crypto.randomUUID(), copertura: "operai_assegnati" }];
  }
  if (dest === "incarico" && c.ruolo) {
    const persone = incarichiNelContesto(s, data, c.ruolo);
    return persone.length
      ? persone.map((i) => ({
          ...base,
          id: crypto.randomUUID(),
          copertura: "incarichi_ruolo",
          incarico_id: i.id,
        }))
      : [{ ...base, id: crypto.randomUUID(), copertura: "incarichi_ruolo" }];
  }
  throw new Error("Scegli addetti oppure incarichi con un ruolo esplicito.");
}
/** Explicit refresh adds/removes group members, and resets all personal decisions. */
export function riallineaSoggetti(
  criteri: readonly CriterioItp[],
  s: SoggettiItp,
  data: string,
  faseId?: string | null,
) {
  const visti = new Set<string>();
  const nuovi: CriterioItp[] = [];
  for (const c of criteri) {
    if (c.gruppo_id) {
      if (visti.has(c.gruppo_id)) continue;
      visti.add(c.gruppo_id);
      nuovi.push(...espandiCopertura(c, s, data, faseId, c.gruppo_id));
    } else nuovi.push(criterioNominativo(c) ? resetNominativo(c) : c);
  }
  if (nuovi.length > MAX_CRITERI_ITP)
    throw new Error(
      "La copertura supera i 500 criteri: circoscrivi la verifica a una fase o attività.",
    );
  return nuovi;
}
export function evidenzaDelTitolare(
  e: EvidenzaFascicolo,
  c: CriterioItp,
  orderId: string,
  subId: string,
) {
  const d = destinatarioCriterio(c);
  if (d === "operaio")
    return !!c.operaio_id && e.operaio_id === c.operaio_id && !e.incarico_id;
  if (d === "incarico")
    return !!c.incarico_id && e.incarico_id === c.incarico_id && !e.operaio_id;
  if (e.operaio_id || e.incarico_id) return false;
  return d === "commessa"
    ? e.order_id === orderId
    : e.subappaltatore_id === subId;
}
export function nomeTitolare(c: CriterioItp, s?: SoggettiItp) {
  const snap = c.soggetto_snapshot;
  if (snap?.tipo === "operaio") return `${snap.dati.nome} ${snap.dati.cognome}`;
  if (snap?.tipo === "incarico") return snap.dati.nominativo;
  const o = s?.operai.find((o) => o.id === c.operaio_id);
  if (o) return `${o.nome} ${o.cognome}`;
  return (
    s?.incarichi.find((i) => i.id === c.incarico_id)?.nominativo ??
    (criterioNominativo(c)
      ? "Titolare da indicare"
      : destinatarioCriterio(c) === "commessa"
        ? "Commessa"
        : "Impresa")
  );
}
export function avvisiSoggetti(
  prima: SoggettiItp | undefined,
  ora: SoggettiItp | undefined,
) {
  if (!prima || !ora) return [];
  return JSON.stringify(prima) === JSON.stringify(ora)
    ? []
    : [
        "Organico, incarichi o assegnazioni sono cambiati rispetto alla registrazione: riesamina la copertura nominativa.",
      ];
}
