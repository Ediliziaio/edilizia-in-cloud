import { creaSnapshotEconomia, firmaEconomia, snapshotEconomiaValido, type SnapshotEconomiaAzienda, type InputEconomiaAzienda } from "./fvEconomiaAzienda.ts";
import { validaTabellaNoleggio, type TabellaNoleggio } from "./noleggioOperativo.ts";
/** Verifica gli importi correnti e l'originale contrattuale; i risultati del browser non sono autorevoli. */
export function economiaAziendaPerDocumento(raw: unknown, corrente: Omit<InputEconomiaAzienda,"parametri">, originale?: TabellaNoleggio): SnapshotEconomiaAzienda {
    const e = raw as {
        parametri?: InputEconomiaAzienda["parametri"];
        snapshot?: SnapshotEconomiaAzienda;
    } | null;
    if (!e?.snapshot || !e.parametri)
        throw new Error("Conferma il prospetto aziendale nella fase Finanza prima di generare il documento.");
    const input = { ...corrente, parametri: e.parametri };
    if (!snapshotEconomiaValido(e.snapshot, input))
        throw new Error("Prezzo, produzione o condizioni sono cambiati: conferma di nuovo il prospetto aziendale.");
    const t = e.parametri.tabellaNoleggio;
    if (e.parametri.modo === "noleggio") {
        if (!t || !originale)
            throw new Error("Originale della tabella di noleggio non disponibile.");
        const salvata = validaTabellaNoleggio(originale), copia = validaTabellaNoleggio(t);
        if(!salvata.attiva)throw new Error("La tabella di noleggio è stata disattivata: seleziona condizioni attive.");
        if (salvata.companyId !== corrente.companyId || firmaEconomia({ ...input, parametri: { ...input.parametri, tabellaNoleggio: salvata } }) !== firmaEconomia({ ...input, parametri: { ...input.parametri, tabellaNoleggio: copia } }))
            throw new Error("Le condizioni non corrispondono alla versione originale della tabella.");
    }
    return creaSnapshotEconomia(input, e.snapshot.creato);
}
