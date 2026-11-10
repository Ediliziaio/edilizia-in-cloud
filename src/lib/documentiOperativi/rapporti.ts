import { dataIt, type DocumentoOperativo } from "./modello";
import type { RapportinoCompleto } from "@/hooks/useRapportiniMese";
import { personeDi, statoDi } from "@/lib/orders/rapportiniMese";
import { campoWorkDay } from "@/lib/campo/workDay";
/** I rapporti commerciali non devono esporre costo_manodopera né altre tariffe interne. */
export function rapportoEconomiaDaRapportini(
  righe: RapportinoCompleto[],
  mese: string,
): DocumentoOperativo {
  const approvati = righe.filter((r) => statoDi(r) === "approvato");
  const ids = new Set(approvati.map((r) => r.order_id));
  const unica = ids.size === 1 ? approvati[0]?.order : null;
  return {
    tipo: "economia",
    numero: `ECONOMIA-${mese}`,
    data: campoWorkDay(),
    periodo: mese,
    destinatario: { nome: unica?.client_name || "" },
    commessa: unica?.order_code,
    luogo: unica?.work_address,
    note: null,
    righe: approvati.flatMap((r) => {
      // La data come la legge il committente, gg/mm/aaaa (10/11/2026: usciva «2026-11-02»).
      const gruppo = `${dataIt(r.data_lavoro)} - ${r.order?.order_code || ""} - ${r.descrizione_lavori || "Intervento"}`;
      const manodopera = personeDi(r)
        .filter((p) => p.ore > 0)
        .map((p) => ({
          gruppo,
          descrizione: `Manodopera - ${p.nome}`,
          unita: "h",
          quantita: p.ore,
          prezzo: null as number | null,
          iva: null as number | null,
        }));
      const oggetti = (v: unknown): Record<string, unknown>[] =>
        Array.isArray(v)
          ? v.filter(
              (x): x is Record<string, unknown> => !!x && typeof x === "object",
            )
          : [];
      const materiali = oggetti(r.materiali_usati)
        .filter((m) => m.nome && Number(m.quantita) > 0)
        .map((m) => ({
          gruppo,
          descrizione: `Materiale - ${String(m.nome)}`,
          unita: String(m.unita || "pz"),
          quantita: Number(m.quantita),
          prezzo: null as number | null,
          iva: null as number | null,
        }));
      const mezzi = oggetti(r.mezzi_usati)
        .filter((m) => m.nome && Number(m.ore) > 0)
        .map((m) => ({
          gruppo,
          descrizione: `Mezzo - ${String(m.nome)}`,
          unita: "h",
          quantita: Number(m.ore),
          prezzo: null as number | null,
          iva: null as number | null,
        }));
      return [...manodopera, ...materiali, ...mezzi];
    }),
  };
}
