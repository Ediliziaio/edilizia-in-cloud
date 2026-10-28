/** Il registro di garanzia non è un registro di pagamenti. */
export type GaranziaSalSub = {
  id: string;
  company_id: string;
  contratto_id: string;
  order_id: string | null;
  sal_id: string | null;
  importo: number;
  stato: string;
  data_svincolo_prevista: string | null;
  data_svincolo_effettiva: string | null;
  fideiussione: boolean | null;
  note: string | null;
};
export function quadroGaranzieSalSub(
  sal: {
    id: string;
    stato: string;
    ritenuta_importo: number;
    numero_sal: number;
  },
  precedenti: Array<
    { id: string; stato: string; ritenuta_importo?: number; numero_sal: number }
  >,
  registro: GaranziaSalSub[] | undefined,
) {
  const cents = (v: unknown) => {
    if (
      v == null || !Number.isFinite(Number(v)) || Number(v) < 0 ||
      Number(v) > 1e11
    ) throw Error("Importo garanzia non valido");
    return Math.round(Number(v) * 100);
  };
  const avvisi: string[] = [];
  const somme = {
    trattenuta: 0,
    svincolata: 0,
    persa: 0,
    annullata: 0,
    fideiussione: 0,
  };
  const ids = new Set<string>();
  const perSal = new Map<string, number>();
  const voci = [...precedenti, sal];
  const competenza = new Map(voci.map((s) => [s.id, s]));
  if (!registro) {
    avvisi.push(
      "Registro delle garanzie non acquisito in questa versione del verbale.",
    );
  }
  for (const g of registro ?? []) {
    if (
      ids.has(g.id) ||
      !["trattenuta", "svincolata", "persa", "annullata"].includes(g.stato)
    ) throw Error("Registro garanzie incoerente");
    ids.add(g.id);
    if (!g.sal_id || !competenza.has(g.sal_id)) {
      throw Error("Garanzia non pertinente ai SAL del verbale");
    }
    for (const d of [g.data_svincolo_prevista, g.data_svincolo_effettiva]) {
      if (
        d &&
        (!/^\d{4}-\d{2}-\d{2}$/.test(d) || !Number.isFinite(Date.parse(d)) ||
          new Date(d).toISOString().slice(0, 10) !== d)
      ) throw Error("Data garanzia non valida");
    }
    const n = cents(g.importo);
    if (g.stato !== "annullata") {
      perSal.set(g.sal_id, (perSal.get(g.sal_id) ?? 0) + n);
    }
    const riconosciuta = ["verificato", "pagato"].includes(
      competenza.get(g.sal_id)!.stato,
    );
    // Un SAL ricevuto/contestato non fa maturare garanzia riconosciuta.
    if (riconosciuta) {
      if (g.fideiussione && g.stato !== "annullata") somme.fideiussione += n;
      else {somme[
          g.stato as "trattenuta" | "svincolata" | "persa" | "annullata"
        ] += n;}
    }
    if (g.stato === "svincolata" && !g.data_svincolo_effettiva) {
      avvisi.push(
        `SAL ${
          competenza.get(g.sal_id)!.numero_sal
        }: data di svincolo non registrata.`,
      );
    }
  }
  for (const s of voci) {
    if (s.ritenuta_importo == null) {
      avvisi.push(
        `SAL ${s.numero_sal}: ritenuta storica non disponibile per il confronto.`,
      );
      continue;
    }
    const attesa = s.stato === "contestato" ? 0 : cents(s.ritenuta_importo);
    if (registro && Math.abs(attesa - (perSal.get(s.id) ?? 0)) > 1) {
      avvisi.push(
        `SAL ${s.numero_sal}: ritenuta del SAL e registro garanzie non coincidono; riconciliare senza modificare automaticamente gli importi.`,
      );
    }
  }
  return {
    trattenute: somme.trattenuta / 100,
    svincolate: somme.svincolata / 100,
    perse: somme.persa / 100,
    annullate: somme.annullata / 100,
    fideiussioni: somme.fideiussione / 100,
    maturate:
      voci.filter((s) => ["verificato", "pagato"].includes(s.stato)).reduce(
        (n, s) =>
          n + (s.ritenuta_importo == null ? 0 : cents(s.ritenuta_importo)),
        0,
      ) / 100,
    avvisi,
  };
}
