import { expect, it } from "vitest";
import { subcontractStatistics } from "@/lib/orders/subcontractStatistics";
const contract = {id: "c1", importo_contrattuale: 6000, stato: "attivo"};
const sal = {id: "s1", contratto_id: "c1", importo_lordo: 1000, importo_netto: 950, stato: "verificato"};
it("SAL verificati, pagati e contestati non sono un'unica spesa", () => {
  expect(subcontractStatistics([contract], [sal, {...sal, id: "s2", stato: "pagato"}, {...sal, id: "s3", stato: "ricevuto"}, {...sal, id: "s4", stato: "contestato"}]))
    .toMatchObject({count: 1, contracted: 6000, verified: 2000, paid: 950, pending: 1, disputed: 1, unresolved: 0});
});
it("duplicati di lettura non moltiplicano contratti né SAL", () => {
  expect(subcontractStatistics([contract, contract], [sal, sal])).toMatchObject({contracted: 6000, verified: 1000});
});
it("contratto completato senza SAL non inventa un costo eseguito o pagato", () => {
  expect(subcontractStatistics([{...contract, stato: "completato"}], [])).toMatchObject({contracted: 6000, verified: 0, paid: 0});
});
it("SAL orfani o stato sconosciuto restano da riconciliare", () => {
  expect(subcontractStatistics([contract], [{...sal, contratto_id: "altro"}, {...sal, id: "s2", stato: "altro"}])).toMatchObject({unresolved: 2, verified: 0});
});
it("importi non validi non diventano zero, somma monetaria ai centesimi", () => {
  expect(subcontractStatistics([{...contract, importo_contrattuale: null}], [sal]).contracted).toBeNull();
  expect(subcontractStatistics([contract], [{...sal, importo_lordo: 0.1}, {...sal, id: "s2", importo_lordo: 0.2}]).verified).toBe(0.3);
});
it("una bozza è evidenziata e le sorgenti non vengono modificate", () => {
  const rows = [{...contract, stato: "bozza"}]; const before = JSON.stringify(rows);
  expect(subcontractStatistics(rows, []).drafts).toBe(1); expect(JSON.stringify(rows)).toBe(before);
});
