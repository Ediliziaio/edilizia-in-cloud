import { describe, expect, it } from "vitest";
import { righeElencoRicevute, type RigaRicevuta } from "@/lib/fatturazione/esportaRicevute";

const riga = (p: Partial<RigaRicevuta> = {}): RigaRicevuta => ({
  id: "f1", data_fattura: "2026-11-05", numero_fattura: "53", cedente_ragione_sociale: "Fornitore Srl",
  cedente_piva: "01234567890", tipo_documento: "TD01", imponibile_totale: 100, iva_totale: 22,
  totale_documento: 122, stato: "contabilizzata", ...p,
});
/** Come fa la pagina: la sigla del cantiere attaccata al numero. */
const protocollo = (r: RigaRicevuta) => r.protocollo_commessa_numero ? `Che${r.protocollo_commessa_numero}` : null;

describe("elenco delle fatture ricevute in Excel", () => {
  it("col protocollo del cantiere la colonna è la prima", () => {
    const { colonne, dati } = righeElencoRicevute([riga({ protocollo_commessa_id: "o1", protocollo_commessa_numero: 12 })], protocollo);
    expect(colonne.map(c => c.label)).toEqual(["Prot. cantiere", "Data fattura", "Numero", "Fornitore", "P.IVA fornitore", "Tipo documento", "Imponibile", "IVA", "Totale", "Stato"]);
    expect(dati[0]).toMatchObject({ protocollo: "Che12", data: "05/11/2026", numero: "53", totale: "122,00" });
  });

  it("senza protocolli la colonna non c'è: le altre aziende non vedono una colonna vuota", () => {
    const { colonne, dati } = righeElencoRicevute([riga()], protocollo);
    expect(colonne.map(c => c.label)).not.toContain("Prot. cantiere");
    expect(dati[0]).not.toHaveProperty("protocollo");
  });

  it("senza la funzione del protocollo l'elenco è quello di prima", () => {
    const { colonne } = righeElencoRicevute([riga({ protocollo_commessa_numero: 12 })]);
    expect(colonne.map(c => c.label)).not.toContain("Prot. cantiere");
  });

  it("basta una fattura protocollata: le altre hanno la cella vuota", () => {
    const { dati } = righeElencoRicevute([
      riga({ id: "a", protocollo_commessa_id: "o1", protocollo_commessa_numero: 3 }),
      riga({ id: "b" }),
    ], protocollo);
    expect(dati.map(d => (d as { protocollo?: string }).protocollo)).toEqual(["Che3", ""]);
  });
});
