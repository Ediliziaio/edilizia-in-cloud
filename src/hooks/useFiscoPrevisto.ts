// ============================================================================
// useFiscoPrevisto — F24 e IVA per il piano di cassa a 13 settimane
// ============================================================================
// Due fonti, in ordine di verità:
//   1. F24 REGISTRATI (tabella f24_entries, stato "da_pagare" con scadenza):
//      importi e date inseriti dall'azienda — nessuna stima.
//   2. IVA STIMATA dal Registro: per i mesi la cui liquidazione cade
//      nell'orizzonte e NON hanno già un F24 IVA registrato, si chiede
//      all'edge `calcola-liquidazione-iva` (la stessa di Gestione IVA) il
//      saldo del mese; se a debito diventa un'uscita al 16 del mese dopo,
//      SEMPRE etichettata come stima (regime mensile ipotizzato).
// L'ancora "oggi" viaggia nel risultato (niente date nel render).
// ============================================================================
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface UscitaFiscale {
  data: Date;
  importo: number;
  descrizione: string;
  stima: boolean;
}

export interface FiscoPrevisto {
  uscite: UscitaFiscale[];
  /** Quanti F24 reali e quante stime IVA compongono la riga. */
  nReali: number;
  nStime: number;
}

const TRIBUTI_IVA = new Set(["3918", "6001", "6099"]);

export interface RispostaLiquidazione {
  /** VALORE ASSOLUTO: l'edge lo dichiara così, insieme ai due flag. */
  saldo?: number;
  /** Lo stesso saldo col segno: positivo se si deve versare. */
  saldo_firmato?: number;
  credito?: boolean;
  dovuto?: boolean;
}

/**
 * Il saldo IVA col segno giusto.
 *
 * L'edge `calcola-liquidazione-iva` restituisce `saldo` in valore assoluto —
 * lo scrive proprio così, `saldo: Math.abs(saldo)` — e mette il segno in due
 * flag (`credito` / `dovuto`) più un `saldo_firmato`. Il piano di cassa leggeva
 * solo `saldo`, quindi iscriveva fra le uscite anche un trimestre A CREDITO:
 * un F24 da pagare che non esiste, su cui però si prendono decisioni.
 *
 * L'audit di settembre lo aveva visto su un trimestre da 7.189,87 € a credito.
 * Oggi quel numero non l'ho ritrovato — nessuna azienda ha una liquidazione
 * diversa da zero fra il 2024 e il 2026 — quindi il difetto qui è dimostrato
 * dalla forma della risposta, non da quel caso.
 *
 * Il fallback sui flag serve a una risposta vecchia rimasta in cache, prima che
 * `saldo_firmato` esistesse.
 */
export function saldoIvaFirmato(r: RispostaLiquidazione | null | undefined): number {
  if (!r) return 0;
  if (typeof r.saldo_firmato === "number" && Number.isFinite(r.saldo_firmato)) {
    return r.saldo_firmato;
  }
  const assoluto = Math.abs(Number(r.saldo ?? 0));
  if (r.dovuto === true) return assoluto;
  if (r.credito === true) return -assoluto;
  return assoluto; // senza flag l'unica lettura prudente è «da versare»
}

export function useFiscoPrevisto(companyId: string | null | undefined) {
  return useQuery({
    queryKey: ["fisco-previsto", companyId],
    enabled: !!companyId,
    staleTime: 10 * 60 * 1000,
    queryFn: async (): Promise<FiscoPrevisto> => {
      const oggi = new Date();
      const anno = oggi.getFullYear();
      const uscite: UscitaFiscale[] = [];

      // 1. F24 registrati da pagare, con scadenza (anno corrente e prossimo:
      //    l'orizzonte di 13 settimane può scavallare l'anno a fine autunno).
      const { data: f24, error: errF24 } = await supabase
        .from("f24_entries")
        .select("tributo_code, tributo_descrizione, importo, data_scadenza")
        .eq("company_id", companyId!)
        .eq("stato", "da_pagare")
        .not("data_scadenza", "is", null)
        .in("anno", [anno, anno + 1]);
      if (errF24) throw errF24;

      // Mesi già coperti da un F24 IVA reale: lì la stima non serve.
      const mesiIvaCoperti = new Set<string>();
      for (const r of f24 ?? []) {
        const dataScadenza = new Date(`${r.data_scadenza}T00:00:00`);
        if (Number.isNaN(dataScadenza.getTime()) || Number(r.importo) <= 0) continue;
        uscite.push({
          data: dataScadenza,
          importo: Number(r.importo),
          descrizione: r.tributo_descrizione || `Tributo ${r.tributo_code}`,
          stima: false,
        });
        if (TRIBUTI_IVA.has(r.tributo_code)) {
          mesiIvaCoperti.add(`${dataScadenza.getFullYear()}-${dataScadenza.getMonth()}`);
        }
      }
      const nReali = uscite.length;

      // 2. Stima IVA per le liquidazioni che cadono nell'orizzonte:
      //    il mese scorso (versamento il 16 di questo mese, se non è passato)
      //    e il mese corrente (versamento il 16 del prossimo).
      const candidati: Array<{ mese: number; annoRif: number; versamento: Date }> = [];
      const questoMese = oggi.getMonth(); // 0-based
      const sedicesimoCorrente = new Date(anno, questoMese, 16);
      if (oggi.getTime() <= sedicesimoCorrente.getTime()) {
        const rif = new Date(anno, questoMese - 1, 1);
        candidati.push({
          mese: rif.getMonth() + 1,
          annoRif: rif.getFullYear(),
          versamento: sedicesimoCorrente,
        });
      }
      candidati.push({
        mese: questoMese + 1,
        annoRif: anno,
        versamento: new Date(anno, questoMese + 1, 16),
      });

      for (const cand of candidati) {
        const chiaveMese = `${cand.versamento.getFullYear()}-${cand.versamento.getMonth()}`;
        if (mesiIvaCoperti.has(chiaveMese)) continue;
        try {
          const { data, error } = await supabase.functions.invoke("calcola-liquidazione-iva", {
            body: {
              company_id: companyId,
              periodo: "mensile",
              mese: cand.mese,
              anno: cand.annoRif,
            },
          });
          if (error || !data) continue; // stima non disponibile: meglio niente che un numero rotto
          const saldo = saldoIvaFirmato(data as RispostaLiquidazione);
          if (saldo > 0) {
            uscite.push({
              data: cand.versamento,
              importo: saldo,
              descrizione: `IVA ${String(cand.mese).padStart(2, "0")}/${cand.annoRif} (stima dal Registro)`,
              stima: true,
            });
          }
        } catch {
          // L'edge può non rispondere: il piano resta valido, solo senza stima IVA.
        }
      }

      return { uscite, nReali, nStime: uscite.length - nReali };
    },
  });
}
