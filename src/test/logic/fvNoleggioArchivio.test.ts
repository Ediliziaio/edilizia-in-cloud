import "fake-indexeddb/auto";
import { describe, it, expect } from "vitest";
import { repositoryNoleggioLocale as archivio } from "../../../dev/fotovoltaico-locale/noleggioRepositoryLocale";
import { CONDIZIONI_VUOTE, type TabellaNoleggio } from "../../../supabase/functions/_shared/noleggioOperativo";
const tabella = (id: string): TabellaNoleggio => ({ versione: 1, id, companyId: "azienda-A", nome: "Tabella test", fornitore: "Test", revisione: "1", dal: "2026-01-01", al: "2027-01-01", attiva: true, prova: true, fonte: null, condizioni: CONDIZIONI_VUOTE, righe: [{ importoDa: 1000, importoA: 100000, durataMesi: 60, periodoMesi: 3, coefficiente: 5, unita: "percentuale_periodo" }] });
describe("Archivio noleggio locale", () => {
    it("mantiene versioni, isola le aziende e non sovrascrive una versione", async () => { const id = crypto.randomUUID(), t = tabella(id); await archivio.crea("azienda-A", t, []); expect((await archivio.elenca("azienda-A")).find(r => r.id === id)).toMatchObject(t); expect(await archivio.elenca("azienda-B")).toEqual([]); await expect(archivio.crea("azienda-A", { ...t, nome: "Sovrascrittura" }, [])).rejects.toThrow(); await expect(archivio.crea("azienda-B", t, [])).rejects.toThrow(); await expect(archivio.stato("azienda-B", id, false)).rejects.toThrow(); expect((await archivio.elenca("azienda-A")).find(r => r.id === id)?.attiva).toBe(true); await archivio.stato("azienda-A", id, false); expect((await archivio.elenca("azienda-A")).find(r => r.id === id)).toMatchObject({ ...t, attiva: false }); });
});
