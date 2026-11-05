/**
 * I costi diretti della commessa (fatture e spese in company_costs) ripartiti sulle fasi.
 *
 * La fase scelta sul costo decide. Altrimenti, per un subappaltatore: le fasi dove quella ditta è assegnata,
 * in proporzione al suo previsto; poi le fasi del suo contratto, in proporzione alle righe. Quello che non trova
 * una fase resta «senza fase», mai perso: la somma è sempre l'importo del costo.
 * Non si scrive `order_external_team_id` sul costo: per v_ordine_marginalita quel collegamento vuol dire
 * «già contato nel total_cost della ditta», e il costo uscirebbe dal margine.
 */
export interface CostoDiretto {
  id: string;
  importo: number;
  phase_id: string | null;
  subappaltatore_id: string | null;
  tipo_fornitore: string | null;
}
export interface DittaSuFase { phase_id: string | null; subappaltatore_id: string | null; peso: number }
export interface ContrattoDitta { subappaltatore_id: string | null; righe: ReadonlyArray<{ fase: string; importo: number }> }
export type ComeRipartito = "fase" | "ditta" | "contratto" | null;
export interface QuotaCosto { costoId: string; phase_id: string | null; voce: "ditte" | "altri"; importo: number; come: ComeRipartito }

const normale = (s: string) => s.trim().toLocaleLowerCase("it-IT");

function perPeso(costo: CostoDiretto, pesi: ReadonlyMap<string, number>, voce: QuotaCosto["voce"], come: ComeRipartito): QuotaCosto[] {
  const voci = [...pesi.entries()];
  const totale = voci.reduce((s, [, p]) => s + p, 0);
  return voci.map(([phase_id, p]) => ({
    costoId: costo.id, phase_id, voce, come,
    importo: totale > 0 ? (costo.importo * p) / totale : costo.importo / voci.length,
  }));
}

export function ripartisciCostiDiretti(input: {
  costi: ReadonlyArray<CostoDiretto>;
  fasi: ReadonlyArray<{ id: string; name: string }>;
  ditte?: ReadonlyArray<DittaSuFase>;
  contratti?: ReadonlyArray<ContrattoDitta>;
}): QuotaCosto[] {
  const esistenti = new Set(input.fasi.map((f) => f.id));
  const perNome = new Map(input.fasi.map((f) => [normale(f.name), f.id]));
  return input.costi.flatMap((c) => {
    const importo = Number(c.importo) || 0;
    const costo = { ...c, importo };
    const voce: QuotaCosto["voce"] = c.tipo_fornitore === "subappalto" ? "ditte" : "altri";
    if (c.phase_id && esistenti.has(c.phase_id)) return [{ costoId: c.id, phase_id: c.phase_id, voce, importo, come: "fase" as const }];
    if (c.subappaltatore_id) {
      const dalleDitte = new Map<string, number>();
      for (const d of input.ditte ?? []) {
        if (d.subappaltatore_id !== c.subappaltatore_id || !d.phase_id || !esistenti.has(d.phase_id)) continue;
        dalleDitte.set(d.phase_id, (dalleDitte.get(d.phase_id) ?? 0) + Math.max(0, Number(d.peso) || 0));
      }
      if (dalleDitte.size) return perPeso(costo, dalleDitte, "ditte", "ditta");
      const dalContratto = new Map<string, number>();
      for (const k of input.contratti ?? []) {
        if (k.subappaltatore_id !== c.subappaltatore_id) continue;
        for (const r of k.righe) {
          const id = perNome.get(normale(r.fase ?? ""));
          if (id) dalContratto.set(id, (dalContratto.get(id) ?? 0) + Math.max(0, Number(r.importo) || 0));
        }
      }
      if (dalContratto.size) return perPeso(costo, dalContratto, "ditte", "contratto");
    }
    return [{ costoId: c.id, phase_id: null, voce, importo, come: null }];
  });
}
