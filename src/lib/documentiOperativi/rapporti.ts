import {
  dataIt,
  type DocumentoOperativo,
  type RigaDocumentoOperativo,
} from "./modello";
import type { RapportinoCompleto } from "@/hooks/useRapportiniMese";
import { personeDi, statoDi } from "@/lib/orders/rapportiniMese";
import { campoWorkDay } from "@/lib/campo/workDay";
import { emailVera } from "@/lib/preventivatore/selezionaCliente";
export interface QuadroPerRapporto {
  persone?: {
    nome: string;
    ditta?: boolean;
    ore: number;
    unita?: string | null;
    quantita?: number | null;
    prezzo?: number | null;
    ricavo?: number | null;
  }[];
  voci?: {
    descrizione: string;
    quantita: number;
    unita: string;
    vendita_unitaria?: number | null;
  }[];
}
const UNITA_VENDITA: Record<string, string> = {
  ora: "h",
  giornata: "giorno",
  uomo_giorno: "uomo/giorno",
};
/** I rapporti commerciali non devono esporre costo_manodopera né altre tariffe interne. */
export function rapportoEconomiaDaRapportini(
  righe: RapportinoCompleto[],
  mese: string,
  quadri: ReadonlyMap<string, QuadroPerRapporto> = new Map(),
): DocumentoOperativo {
  const approvati = righe.filter((r) => statoDi(r) === "approvato");
  const ids = new Set(approvati.map((r) => r.order_id));
  const unica = ids.size === 1 ? approvati[0]?.order : null;
  const date = approvati.map((r) => r.data_lavoro).sort();
  return {
    tipo: "economia",
    numero: `ECONOMIA-${/^\d{4}-\d{2}$/.test(mese) ? mese : `${date[0] ?? campoWorkDay()}_${date.at(-1) ?? campoWorkDay()}`}`,
    data: campoWorkDay(),
    periodo: mese,
    destinatario: {
      nome: unica?.client_name || "",
      email: emailVera(unica?.client_email),
      indirizzo: unica?.client_address,
    },
    commessa: unica?.order_code,
    luogo: unica?.work_address,
    note: null,
    righe: approvati.flatMap((r) => {
      // La data come la legge il committente, gg/mm/aaaa (10/11/2026: usciva «2026-11-02»).
      const gruppo = `${dataIt(r.data_lavoro)} - ${r.order?.order_code || ""} - ${r.descrizione_lavori || "Intervento"}`;
      const quadro = quadri.get(r.id);
      const persone = quadro?.persone?.length
        ? quadro.persone.filter((p) => !p.ditta)
        : personeDi(r).filter((p) => !p.ditta);
      const manodopera = persone
        .filter((p) => p.ore > 0)
        .map((p) => {
          const vendita = p as NonNullable<
            QuadroPerRapporto["persone"]
          >[number];
          const q =
            vendita.quantita != null &&
            vendita.quantita > 0 &&
            vendita.prezzo != null
              ? vendita.quantita
              : p.ore;
          const prezzo =
            vendita.prezzo != null &&
            vendita.prezzo >= 0 &&
            Number.isFinite(vendita.prezzo)
              ? vendita.prezzo
              : null;
          return {
            gruppo,
            descrizione: `Manodopera - ${p.nome}`,
            unita:
              prezzo != null
                ? (UNITA_VENDITA[vendita.unita ?? ""] ?? vendita.unita ?? "h")
                : "h",
            quantita: q,
            prezzo,
            ...(prezzo != null &&
            vendita.ricavo != null &&
            Number.isFinite(vendita.ricavo) &&
            vendita.ricavo >= 0
              ? { importo: vendita.ricavo }
              : {}),
            iva: null as number | null,
          };
        });
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
      const voci = (quadro?.voci ?? [])
        .filter((v) => v.descrizione?.trim() && v.quantita > 0)
        .map(
          (v): RigaDocumentoOperativo => ({
            gruppo,
            descrizione: v.descrizione,
            unita: v.unita || "cad",
            quantita: Number(v.quantita),
            prezzo:
              v.vendita_unitaria != null &&
              Number.isFinite(v.vendita_unitaria) &&
              v.vendita_unitaria >= 0
                ? Number(v.vendita_unitaria)
                : null,
            iva: null,
          }),
        );
      const tutte = [...manodopera, ...materiali, ...mezzi, ...voci];
      return tutte.length
        ? tutte
        : r.descrizione_lavori?.trim()
          ? [
              {
                gruppo,
                descrizione: r.descrizione_lavori.trim(),
                unita: "cad",
                quantita: 1,
                prezzo: null as number | null,
                iva: null as number | null,
              },
            ]
          : [];
    }),
  };
}
