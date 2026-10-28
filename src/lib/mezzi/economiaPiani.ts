import {
  costoPianoMezzo,
  type PianoMezzo,
  type CostoPianoMezzo,
} from "./pianoCantiere";
export interface FonteMezzo {
  id: string;
  tipo: "costo" | "oda";
  nome: string;
  importo: number;
  supplier_id: string | null;
  data: string | null;
}
export interface LegameSpesaMezzo {
  id: string;
  piano_id: string;
  fonte_id: string;
  tipo: "costo" | "oda";
  importo: number;
}
export interface FontiMezzi {
  fonti: FonteMezzo[];
  legami: LegameSpesaMezzo[];
}
const cent = (n: number) => Math.round(n * 100) / 100;
/** Classifica importi GIA' nel consuntivo; non incrementa mai i costi contabili. */
export function economiaPianiMezzi(
  piani: PianoMezzo[],
  prezzi: Record<string, CostoPianoMezzo>,
  fonti: FontiMezzi,
) {
  const somme = new Map<string, number>();
  for (const l of fonti.legami) {
    const key = l.tipo + ":" + l.fonte_id;
    somme.set(key, (somme.get(key) ?? 0) + Number(l.importo));
  }
  const righe = piani.map((p) => {
    const costo = prezzi[p.id];
    const previsto = p.annullato ? 0 : costo ? costoPianoMezzo(p, costo) : null;
    const legami = fonti.legami.filter((l) => l.piano_id === p.id);
    const invalidi = legami.filter((l) => {
      const f = fonti.fonti.find(
        (f) => f.id === l.fonte_id && f.tipo === l.tipo,
      );
      return (
        !f ||
        Math.sign(Number(f.importo)) !== Math.sign(Number(l.importo)) ||
        Math.abs(cent(somme.get(l.tipo + ":" + l.fonte_id) ?? 0)) >
          Math.abs(Number(f.importo))
      );
    });
    const registrato = cent(
      legami
        .filter((l) => !invalidi.includes(l))
        .reduce((t, l) => t + Number(l.importo), 0),
    );
    return {
      piano: p,
      previsto,
      registrato,
      invalidi: invalidi.length,
      scostamento: previsto === null ? null : cent(registrato - previsto),
    };
  });
  return {
    righe,
    previsto: cent(righe.reduce((t, r) => t + (r.previsto ?? 0), 0)),
    registrato: cent(righe.reduce((t, r) => t + r.registrato, 0)),
    senzaPreventivo: righe.filter(
      (r) => !r.piano.annullato && r.previsto === null,
    ).length,
    invalidi: righe.reduce((t, r) => t + r.invalidi, 0),
  };
}
