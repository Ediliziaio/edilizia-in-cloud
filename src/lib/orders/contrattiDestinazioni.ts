import { contractImponibile, contractNeedsAllocation, contractToInstallments, deriveIvaPct, type ContractExtract } from "./contractExtract";
import { dataFirmaVerificata, type StoredContractFile } from "./contractPreparation";
import type { ContrattoGenerale } from "./generali/contratto";

export function lavoroDaContratto(ex: ContractExtract, modo: "a_corpo" | "a_misura") {
  const valorizzazione = ex.dati_appalto?.valorizzazione ?? modo;
  const aMisura = valorizzazione === "a_misura";
  const importo = contractNeedsAllocation(ex) ? null : aMisura ? ex.dati_appalto?.stima_eur ?? null : contractImponibile(ex);
  const aliquota = deriveIvaPct(ex);
  return { valorizzazione, importo, aliquota, tetto: ex.dati_appalto?.tetto_eur ?? null,
    rate: aMisura || importo == null ? [] : contractToInstallments(ex, importo),
    riferimento: ex.dati_appalto?.riferimento ?? ex.appalto_pubblico?.contratto_applicativo ?? "",
    avvisi: ["Conferma il committente e il contratto/listino esistenti: l’AI non crea tariffe né anagrafiche.", ...(aMisura ? ["La stima non è un credito. Nessuna rata viene creata: gli incassi nasceranno dal rendiconto."] : []), ...(contractNeedsAllocation(ex) ? ["Quota RTI da confermare: nessun totale attribuito automaticamente all’azienda."] : [])],
  };
}

export function generaleDaContratto(ex: ContractExtract, attuale: ContrattoGenerale, source: StoredContractFile | null): ContrattoGenerale {
  const d = ex.dati_appalto;
  const gruppo = contractNeedsAllocation(ex);
  const note = [attuale.note, "IMPORT AI — verificare i dati prima del salvataggio.", ex.summary,
    gruppo ? `RTI: totale ${ex.appalto_pubblico?.importo_totale_appalto_eur ?? "non indicato"} EUR; quota azienda ${ex.appalto_pubblico?.quota_azienda_eur ?? "non indicata"} EUR. Verificare base, ribasso e sicurezza di competenza: nessun importo RTI precompilato.` : "",
  ].filter(Boolean).join("\n");
  return { ...attuale,
    riferimento: d?.riferimento ?? ex.appalto_pubblico?.contratto_applicativo ?? attuale.riferimento,
    importoBase: gruppo ? null : d?.importo_base_eur ?? contractImponibile(ex) ?? attuale.importoBase,
    ribassoPct: gruppo ? 0 : d?.ribasso_pct ?? 0, oneriSicurezza: gruppo ? 0 : d?.oneri_sicurezza_eur ?? 0,
    dataFirma: dataFirmaVerificata(source, new Date().toLocaleDateString("en-CA")),
    dataConsegnaLavori: ex.data_inizio_lavori, dataFinePrevista: ex.data_fine_lavori,
    anticipazionePct: d?.anticipazione_pct ?? attuale.anticipazionePct,
    ritenutaPct: d?.ritenuta_pct ?? attuale.ritenutaPct,
    penaleGiornaliera: d?.penale_giornaliera_eur ?? attuale.penaleGiornaliera,
    penaleMassimaPct: d?.penale_massima_pct ?? attuale.penaleMassimaPct,
    cig: ex.appalto_pubblico?.cig_derivato ?? ex.appalto_pubblico?.cig ?? attuale.cig,
    cup: d?.cup ?? attuale.cup, splitPayment: d?.split_payment ?? attuale.splitPayment, reverseCharge: d?.reverse_charge ?? attuale.reverseCharge,
    // Percentuale dichiarata non significa anticipazione effettivamente incassata.
    note,
  };
}
