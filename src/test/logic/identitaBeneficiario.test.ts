import { describe, expect, it } from "vitest";
import { identitaBeneficiario } from "@/lib/orders/identitaBeneficiario";
describe("Identità beneficiari tra storico e compensi", () => {
 it("riconosce lo stesso venditore senza confondere gli id dei compensi", () => {
  const storico = identitaBeneficiario("venditore-1", {source_type:"salesperson",source_id:"venditore-1"});
  const generico = identitaBeneficiario("beneficiario-9", {source_type:"salesperson",source_id:"venditore-1"});
  expect(generico).toBe(storico);
  expect(identitaBeneficiario("salesperson:venditore-1")).toBe(storico);
 });
 it("non unisce beneficiari manuali o collegamenti incompleti", () => {
  expect(identitaBeneficiario("manuale-1",{source_type:"manual",source_id:null})).toBe("manuale-1");
  expect(identitaBeneficiario("manuale-2",{source_type:"manual",source_id:null})).toBe("manuale-2");
  expect(identitaBeneficiario("incompleto",{source_type:"salesperson",source_id:null})).toBe("incompleto");
 });
 it("mantiene distinti venditori diversi e altre categorie di beneficiari", () => {
  expect(identitaBeneficiario("b1",{source_type:"salesperson",source_id:"s1"})).not.toBe(identitaBeneficiario("b2",{source_type:"salesperson",source_id:"s2"}));
  expect(identitaBeneficiario("operaio",{source_type:"employee",source_id:"s1"})).toBe("operaio");
 });
});
