import {
  imponibileFattura, type ContrattoCtrl, type FatturaCtrl, type SalCtrl,
} from "./controlloFatturaSubappalto";

const centesimi = (importo: number) => Math.round(importo * 100);

export function fatturePerSalSub(sal: readonly SalCtrl[], fatture: readonly FatturaCtrl[]) {
  const perSal = new Map<string, number>();
  for (const fattura of fatture) {
    if (!fattura.sal_subappaltatore_id || fattura.stato === "rifiutata") continue;
    const id = fattura.sal_subappaltatore_id;
    perSal.set(id, (perSal.get(id) ?? 0) + centesimi(imponibileFattura(fattura)));
  }
  return sal.filter(s => s.stato === "verificato" || s.stato === "pagato")
    .sort((a, b) => a.numero_sal - b.numero_sal)
    .map(s => {
      const netto = centesimi(Number(s.importo_netto ?? 0));
      const fatturato = perSal.get(s.id) ?? 0;
      return { sal: s, fatturato: fatturato / 100, differenza: (netto - fatturato) / 100 };
    });
}

export const valoriPivaSub = (chiave: string) => /^\d{11}$/.test(chiave) ? [chiave, `IT${chiave}`] : chiave ? [chiave] : [];

export type FatturaContrattoSub = FatturaCtrl & { cedente_ragione_sociale?: string | null };
export type ContestoFattureSalSub = {
  contratto: ContrattoCtrl;
  altriContratti?: ContrattoCtrl[];
  sal: SalCtrl[];
  collegate: FatturaContrattoSub[];
};
