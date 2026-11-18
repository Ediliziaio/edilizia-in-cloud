export interface SalVoceSottofase {
  id: string;
  sottofase_id: string | null;
  posizione: number;
  descrizione: string;
  unita: string | null;
  quantita_contratto: number | null;
  quantita_a_oggi: number | null;
  importo_contrattuale: number | null;
  percentuale_avanzamento: number;
  importo_sal: number | null;
}

export interface SalVoce {
  id: string;
  descrizione: string;
  importo_contrattuale: number;
  percentuale_avanzamento: number;
  importo_sal: number;
  note: string | null;
  fase_id?: string | null;
  sal_voci_sottofasi?: SalVoceSottofase[] | null;
}

interface DifferenzaSal {
  percentuale: number | null;
  importo: number | null;
  quantita?: number | null;
}

const chiaveVoce = (voce: SalVoce) => voce.descrizione.trim().toLowerCase().replace(/\s+/g, " ");
const valorePresente = (n: number | null | undefined): n is number => n != null && Number.isFinite(Number(n));

function differenza(attuale: number | null, prima: number | null | undefined, nuovo: boolean, decimali = 2) {
  if (!valorePresente(attuale) || (!nuovo && !valorePresente(prima))) return null;
  const scala = 10 ** decimali;
  return (Math.round(Number(attuale) * scala) - Math.round(Number(prima ?? 0) * scala)) / scala;
}

function corrispondenzaFase(voce: SalVoce, fasi: readonly SalVoce[]) {
  const perId = voce.fase_id ? fasi.filter((v) => v.fase_id === voce.fase_id) : [];
  if (perId.length > 0) return perId.length === 1 ? perId[0] : undefined;
  const perNome = fasi.filter((v) => (!v.fase_id || !voce.fase_id) && chiaveVoce(v) === chiaveVoce(voce));
  return perNome.length === 1 ? perNome[0] : undefined;
}

/** Usa i valori salvati nei due verbali. Le righe storiche senza un confronto certo restano senza differenza. */
export function calcolaVociDelPeriodo(fasi: readonly SalVoce[], fasiPrecedenti: readonly SalVoce[] | null) {
  const abbinamenti = fasi.map((voce) => fasiPrecedenti ? corrispondenzaFase(voce, fasiPrecedenti) : undefined);
  const riferimenti = new Map<SalVoce, number>();
  for (const prima of abbinamenti) {
    if (prima) riferimenti.set(prima, (riferimenti.get(prima) ?? 0) + 1);
  }
  const confrontoCompleto = !!fasiPrecedenti?.length
    && fasiPrecedenti.every((voce) => riferimenti.get(voce) === 1);

  return new Map<string, DifferenzaSal & { dettaglio: Map<string, DifferenzaSal> }>(fasi.map((voce, i) => {
    const abbinata = abbinamenti[i];
    const prima = abbinata && riferimenti.get(abbinata) === 1 ? abbinata : undefined;
    const nuova = fasiPrecedenti === null || (!abbinata && confrontoCompleto && !!voce.fase_id
      && !fasiPrecedenti.some((v) => v.fase_id === voce.fase_id || (!v.fase_id && chiaveVoce(v) === chiaveVoce(voce))));
    const dettaglio = new Map<string, DifferenzaSal>();
    for (const sotto of voce.sal_voci_sottofasi ?? []) {
      const candidate = sotto.sottofase_id
        ? prima?.sal_voci_sottofasi?.filter((v) => v.sottofase_id === sotto.sottofase_id)
        : undefined;
      const sottoPrima = candidate?.length === 1 ? candidate[0] : undefined;
      dettaglio.set(sotto.id, {
        percentuale: differenza(sotto.percentuale_avanzamento, sottoPrima?.percentuale_avanzamento, nuova),
        importo: differenza(sotto.importo_sal, sottoPrima?.importo_sal, nuova),
        quantita: differenza(sotto.quantita_a_oggi, sottoPrima?.unita === sotto.unita ? sottoPrima?.quantita_a_oggi : null, nuova, 3),
      });
    }
    return [voce.id, {
      percentuale: differenza(voce.percentuale_avanzamento, prima?.percentuale_avanzamento, nuova),
      importo: differenza(voce.importo_sal, prima?.importo_sal, nuova),
      dettaglio,
    }];
  }));
}

export function voceAvanzata(differenzaVoce: DifferenzaSal | undefined) {
  return (differenzaVoce?.percentuale ?? 0) > 0 || (differenzaVoce?.quantita ?? 0) > 0;
}
