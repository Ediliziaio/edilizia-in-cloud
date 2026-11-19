import type { PianoPrevisto } from "./previsionaleSalvato";

export interface ImpegnoCantiere {
  persona: string;
  commessa: string;
  codice: string;
  giorno: string;
  ore: number | null;
}

export interface DisponibilitaCantiere {
  oreGiornaliere: Record<string, number>;
  impegni: ImpegnoCantiere[];
  assegnazioniVerificate: boolean;
}

/** Nel singolo cantiere la fase include le quote delle voci per persona e giorno. */
export function caricoPerGiorno(piani: readonly PianoPrevisto[], persone: ReadonlySet<string>, dal: string, al: string) {
  const perFase = new Map<string, { persona: string; giorno: string; fase: number; voci: number }>();
  for (const piano of piani) {
    const giorni = piano.giorni.filter((g) => g >= dal && g <= al);
    for (const p of piano.operai) {
      if (!persone.has(p.id)) continue;
      for (const giorno of giorni) {
        const k = `${p.id}/${giorno}/${piano.ambito.faseId}`;
        const carico = perFase.get(k) ?? { persona: p.id, giorno, fase: 0, voci: 0 };
        if (piano.ambito.tipo === "fase") carico.fase = Math.max(carico.fase, piano.microOreGiorno);
        else carico.voci += piano.microOreGiorno;
        perFase.set(k, carico);
      }
    }
  }
  const totale = new Map<string, { persona: string; giorno: string; microOre: number }>();
  for (const { persona, giorno, fase, voci } of perFase.values()) {
    const k = `${persona}/${giorno}`;
    const prima = totale.get(k);
    totale.set(k, { persona, giorno, microOre: (prima?.microOre ?? 0) + Math.max(fase, voci) });
  }
  return [...totale.values()].map(({ persona, giorno, microOre }) => ({ persona, giorno, ore: microOre / 1e6 }));
}

export function riepilogoDisponibilita(archivio: DisponibilitaCantiere, persone: readonly string[], giorni: readonly string[], oreRichieste: number) {
  const impegni = new Map<string, ImpegnoCantiere[]>();
  for (const i of archivio.impegni) {
    const k = `${i.persona}/${i.giorno}`;
    const gruppo = impegni.get(k) ?? [];
    gruppo.push(i);
    impegni.set(k, gruppo);
  }
  return persone.map((persona) => {
    const capienza = archivio.oreGiornaliere[persona] ?? 8;
    const date = giorni.map((giorno) => {
      const cantieri = impegni.get(`${persona}/${giorno}`) ?? [];
      const occupate = cantieri.reduce((totale, i) => totale + (i.ore ?? 0), 0);
      const daVerificare = cantieri.some((i) => i.ore === null);
      const residuo = Math.round(Math.max(0, capienza - occupate) * 1e6) / 1e6;
      return { giorno, cantieri, occupate, residuo, daVerificare, eccedenza: Math.round(Math.max(0, occupate + oreRichieste - capienza) * 1e6) / 1e6 };
    });
    return { persona, capienza, date };
  });
}
