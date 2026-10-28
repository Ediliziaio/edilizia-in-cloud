/** Schematic original drawings for POS documentation, not certified print-ready signs.
 * Geometric families: Directive 92/58/EEC, Annex II, consolidated 26-07-2019.
 * Selection and placement are explicit; never infer obligations from work titles. */
export const SEGNALI_POS = [
  {
    id: "avvertimento",
    nome: "Pericolo generico",
    famiglia: "Avvertimento",
    simbolo:
      '<path d="M32 22v15" stroke="black" stroke-width="5"/><circle cx="32" cy="45" r="3" fill="black"/>',
  },
  {
    id: "elettrico",
    nome: "Pericolo elettrico",
    famiglia: "Avvertimento",
    simbolo: '<path d="m35 18-13 19h10l-3 14 14-22H32l3-11Z" fill="black"/>',
  },
  {
    id: "elmetto",
    nome: "Protezione del capo",
    famiglia: "Prescrizione",
    simbolo:
      '<path d="M14 37h36M19 37v-6a13 13 0 0 1 26 0v6M28 18v14m8-14v14M18 42h28" fill="none" stroke="white" stroke-width="4" stroke-linecap="round"/>',
  },
  {
    id: "occhi",
    nome: "Protezione degli occhi",
    famiglia: "Prescrizione",
    simbolo:
      '<path d="M12 27h17v13H14l-2-13Zm23 0h17l-2 13H35V27Zm-6 5h6M12 27l-4-4m44 4 4-4" fill="none" stroke="white" stroke-width="3" stroke-linejoin="round"/>',
  },
  {
    id: "guanti",
    nome: "Protezione delle mani",
    famiglia: "Prescrizione",
    simbolo:
      '<path d="M22 47 17 30c-1-4 3-5 5-2l3 5V17c0-3 4-3 4 0v13-16c0-3 4-3 4 0v16-14c0-3 4-3 4 0v14-10c0-3 4-3 4 0v20l-5 7H22Z" fill="white"/>',
  },
  {
    id: "accesso",
    nome: "Vietato accesso ai non autorizzati",
    famiglia: "Divieto",
    simbolo:
      '<circle cx="32" cy="20" r="6" fill="black"/><path d="M22 46V35a10 10 0 0 1 20 0v11H22Z" fill="black"/>',
  },
  {
    id: "soccorso",
    nome: "Primo soccorso",
    famiglia: "Salvataggio",
    simbolo:
      '<path d="M26 14h12v12h12v12H38v12H26V38H14V26h12V14Z" fill="white"/>',
  },
  {
    id: "estintore",
    nome: "Estintore",
    famiglia: "Antincendio",
    simbolo:
      '<rect x="23" y="24" width="18" height="29" rx="4" fill="white"/><path d="M29 24v-6h12v5m-12-5v-5h9m3 5h5v17" fill="none" stroke="white" stroke-width="4"/>',
  },
] as const;
export type SegnalePosId = typeof SEGNALI_POS[number]["id"];
export interface SceltaSegnalePos {
  id: SegnalePosId;
  ubicazione: string;
  note: string;
}
export function segnalePosSvg(id: SegnalePosId): string {
  const s = SEGNALI_POS.find((s) => s.id === id);
  if (!s) throw Error("Segnale non riconosciuto");
  const fondo = s.famiglia === "Avvertimento"
    ? '<path d="M32 5 60 56H4L32 5Z" fill="#ffdd00" stroke="black" stroke-width="4" stroke-linejoin="round"/>'
    : s.famiglia === "Prescrizione"
    ? '<circle cx="32" cy="32" r="29" fill="#005eb8"/>'
    : s.famiglia === "Divieto"
    ? '<circle cx="32" cy="32" r="28" fill="white" stroke="#d71920" stroke-width="6"/>'
    : `<rect x="3" y="3" width="58" height="58" fill="${
      s.famiglia === "Salvataggio" ? "#008542" : "#d71920"
    }"/>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 64 64"><title>${s.nome}</title>${fondo}${s.simbolo}${
    s.famiglia === "Divieto"
      ? '<path d="m12 12 40 40" stroke="#d71920" stroke-width="6"/>'
      : ""
  }</svg>`;
}
export function normalizzaSegnaliPos(value: unknown): SceltaSegnalePos[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  return value.flatMap((v) => {
    if (
      !v || typeof v !== "object" || !SEGNALI_POS.some((s) => s.id === v.id) ||
      seen.has(v.id)
    ) return [];
    seen.add(v.id);
    return [{
      id: v.id,
      ubicazione: typeof v.ubicazione === "string"
        ? v.ubicazione.trim().slice(0, 1000)
        : "",
      note: typeof v.note === "string" ? v.note.trim().slice(0, 2000) : "",
    }];
  });
}
