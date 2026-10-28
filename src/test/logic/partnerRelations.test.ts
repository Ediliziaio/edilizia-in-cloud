import { describe, it, expect } from "vitest";
import {
  partnerTaxKey,
  partnerMatches,
  partnerConflict,
  contractDateError,
  contractNoticeDate,
  contractDeadline,
  validateContractFile,
  receivedSupplierGroups,
  PartnerValidationError,
  partnerFeedback,
  type SupplierContract,
} from "@/lib/suppliers/partnerRelations";
const identity = {
  id: "f",
  company_id: "A",
  name: "Studio Édile S.r.l.",
  vat: "IT 01234567890",
  fiscal: null,
};
const contract = {
  id: "c",
  company_id: "A",
  supplier_id: "s",
  title: "Consulenza",
  kind: "consulenza",
  status: "attivo",
  signed_on: null,
  starts_on: "2026-10-01",
  ends_on: "2026-12-31",
  notice_days: 30,
  automatic_renewal: true,
  conditions: null,
  amount: null,
  currency: "EUR",
  updated_at: "2026-10-27",
} satisfies SupplierContract;
describe("identità partner senza fusioni implicite", () => {
  it("normalizza IT solo davanti a 11 cifre", () => {
    expect(partnerTaxKey("it 012.345.67890")).toBe("01234567890");
    expect(partnerTaxKey("ITROSSI")).toBe("ITROSSI");
    expect(partnerTaxKey("DE123456789")).toBe("DE123456789");
  });
  it("rifiuta altri tenant, inattivi e identificativi discordanti anche con nome uguale", () => {
    const targets = [
      { ...identity, id: "other", company_id: "B" },
      { ...identity, id: "off", active: false },
      { ...identity, id: "wrong", vat: "99999999999" },
      { ...identity, id: "right", vat: "01234567890" },
    ];
    expect(partnerMatches(identity, targets).map((m) => m.target.id)).toEqual([
      "right",
    ]);
    expect(partnerConflict(identity, targets[2])).toBe(true);
  });
  it("mantiene visibili tutti i candidati fiscali uguali, senza scegliere il primo", () => {
    expect(
      partnerMatches(identity, [
        { ...identity, id: "one" },
        { ...identity, id: "two" },
      ]),
    ).toHaveLength(2);
  });
  it("il nome coincidente senza identificativi resta da verificare", () => {
    const a = { ...identity, vat: null };
    const matches = partnerMatches(a, [
      { ...a, id: "b", name: "Studio edile srl" },
    ]);
    expect(matches[0].exact).toBe(false);
    expect(matches[0].reason).toContain("verifica");
    expect(
      partnerMatches({ ...a, name: "SRL" }, [{ ...a, id: "x", name: "SRL" }]),
    ).toEqual([]);
  });
  it("non scambia una partita IVA con il CF personale", () => {
    expect(
      partnerMatches({ ...identity, vat: null, fiscal: "RSSMRA80A01H501U" }, [
        {
          ...identity,
          id: "b",
          vat: "RSSMRA80A01H501U",
          fiscal: null,
          name: "Diverso",
        },
      ]),
    ).toEqual([]);
  });
});
describe("contratti e documenti", () => {
  it("mostra la validazione operativa ma non riversa errori tecnici in pagina", () => {
    expect(
      partnerFeedback(
        new PartnerValidationError("La scadenza non può precedere l’inizio."),
        "Riprova",
      ),
    ).toContain("scadenza");
    expect(
      partnerFeedback(
        {
          code: "P0001",
          message: "Identificativi fiscali discordanti: verifica",
        },
        "Riprova",
      ),
    ).toContain("discordanti");
    expect(
      partnerFeedback(
        { code: "P0001", message: "internal_relation_secret_123" },
        "Riprova",
      ),
    ).toBe("Riprova");
  });
  it("raggruppa ricevute per identità, tenant e collegamento senza unire omonimi senza identificativi", () => {
    const row = {
      id: "1",
      company_id: "A",
      cedente_ragione_sociale: "Ditta",
      cedente_piva: "IT01234567890",
      cedente_cf: null,
      cedente_paese: "IT",
      fornitore_id: null,
    };
    const groups = receivedSupplierGroups([
      row,
      { ...row, id: "2", cedente_piva: "01234567890" },
      { ...row, id: "3", company_id: "B" },
      { ...row, id: "4", fornitore_id: "linked" },
      { ...row, id: "5", cedente_piva: null },
      { ...row, id: "6", cedente_piva: null },
    ]);
    expect(groups).toHaveLength(5);
    expect(groups[0].receiptIds).toEqual(["1", "2"]);
  });
  it("divide i gruppi oltre 500 fatture in operazioni confermabili", () => {
    const rows = Array.from({ length: 501 }, (_, i) => ({
      id: String(i),
      company_id: "A",
      cedente_ragione_sociale: "Ditta",
      cedente_piva: "01234567890",
      cedente_cf: null,
      cedente_paese: "IT",
      fornitore_id: null,
    }));
    expect(
      receivedSupplierGroups(rows).map((r) => r.receiptIds.length),
    ).toEqual([500, 1]);
  });
  it("dati mancanti non diventano zero o oggi", () => {
    expect(
      contractDateError({ ...contract, starts_on: null, ends_on: null }),
    ).toBeNull();
    expect(contractDeadline({ ...contract, ends_on: null })).toBe(
      "Scadenza non indicata",
    );
    expect(contractNoticeDate({ ...contract, notice_days: null })).toBeNull();
  });
  it("valida date, importo e preavviso", () => {
    expect(
      contractDateError({ ...contract, ends_on: "2026-02-30" }),
    ).not.toBeNull();
    expect(
      contractDateError({ ...contract, ends_on: "2026-01-01" }),
    ).not.toBeNull();
    expect(contractDateError({ ...contract, notice_days: 1.5 })).not.toBeNull();
    expect(contractDateError({ ...contract, amount: NaN })).not.toBeNull();
    expect(contractDateError({ ...contract, amount: 0 })).toBeNull();
  });
  it("calcola preavviso a giorni civili anche attraverso il cambio d’anno", () => {
    expect(contractNoticeDate(contract)).toBe("2026-12-01");
    expect(
      contractNoticeDate({
        ...contract,
        ends_on: "2027-01-05",
        notice_days: 10,
      }),
    ).toBe("2026-12-26");
    expect(contractDeadline(contract, "2026-12-01")).toContain(
      "Preavviso".toLowerCase(),
    );
  });
  it("non considera rinnovato un contratto scaduto solo perché il rinnovo è dichiarato", () => {
    expect(contractDeadline(contract, "2027-01-01")).toContain(
      "verifica rinnovo",
    );
    expect(
      contractDeadline({ ...contract, status: "concluso" }, "2027-01-01"),
    ).toBe("Chiuso");
  });
  it("limita dimensioni, formati e doppie estensioni ingannevoli", () => {
    expect(
      validateContractFile({
        name: "contratto.pdf",
        type: "application/pdf",
        size: 100,
      }),
    ).toBeNull();
    expect(
      validateContractFile({
        name: "contratto.pdf.html",
        type: "application/pdf",
        size: 100,
      }),
    ).not.toBeNull();
    expect(
      validateContractFile({
        name: "contratto.svg",
        type: "image/svg+xml",
        size: 100,
      }),
    ).not.toBeNull();
    expect(
      validateContractFile({
        name: "contratto.pdf",
        type: "application/pdf",
        size: 0,
      }),
    ).not.toBeNull();
    expect(
      validateContractFile({
        name: "contratto.pdf",
        type: "application/pdf",
        size: 21 * 1024 * 1024,
      }),
    ).not.toBeNull();
  });
});
