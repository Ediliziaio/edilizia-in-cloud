import type { PiantaGenerata } from "./generazione.ts";
import type { RispostaAI } from "./rispostaAI.ts";
import type { RiferimentoVerifica, VerificaLettura } from "../../../shared/planimetrie/letturaTipi.ts";

/** Collega i dubbi ai soli oggetti realmente costruiti. Ambiguità nel riferimento: niente associazione forzata. */
export function collegaControlliDocumento(g: PiantaGenerata, r: RispostaAI): PiantaGenerata {
  const verifiche: VerificaLettura[] = (r.verifiche_documento ?? []).map((v, i) => {
    const numerica = ["larghezza", "profondita", "altezza"].includes(v.campo);
    const campo = numerica && v.ambito_misura !== (v.apertura_indice ? "vano_apertura" : "totale_locale") ? "contorno" as const : v.campo;
    const candidati = g.planimetria.livelli.flatMap<RiferimentoVerifica>((l) => {
      if (v.piano && l.nome.toLowerCase() !== v.piano.toLowerCase()) return [];
      if (v.apertura_indice) {
        const ap = r.aperture[v.apertura_indice - 1];
        if (!ap) return [];
        const sorgenti = g.generazione.aperture_sorgente?.filter((s) => s.tipo === ap.tipo && JSON.stringify(s.da) === JSON.stringify(ap.da) && JSON.stringify(s.a) === JSON.stringify(ap.a)) ?? [];
        return l.fatto.aperture.flatMap((a) => sorgenti.some((s) => s.id === a.id) ? [{ livelloId: l.id, tipo: "apertura" as const, oggettoId: a.id, campo }] : []);
      }
      return l.fatto.locali.flatMap((c) => v.locale_nome && c.nome.toLowerCase() === v.locale_nome.toLowerCase() ? [{ livelloId: l.id, tipo: "locale" as const, oggettoId: c.id, campo }] : []);
    });
    return { id: `lettura-${i + 1}`, tipo: "quota", descrizione: v.descrizione,
      ...(candidati.length === 1 ? { riferimento: candidati[0] } : {}),
      ...(v.valori_cm.length ? { valoriLettiCm: v.valori_cm } : {}),
    };
  });
  return { ...g, planimetria: { ...g.planimetria, letturaDocumento: { avvisiIniziali: [], superficiScritteMq: {}, verifiche } } };
}
