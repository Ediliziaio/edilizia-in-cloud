import { describe, expect, it } from "vitest";
import { surveyPdfBrand } from "@/lib/surveys/pdfBrand";
import type { Company } from "@/types/auth";

describe("Identità aziendale del PDF sopralluogo", () => {
  it("espone solo logo e contatti pertinenti, mai banca, note private o dati del piano", () => {
    const company = {
      id: "company1",
      logo_url: "https://example.test/logo.png",
      email: "test@example.test",
      vat_number: "IT123",
      phone: "0123",
      legal_address: "Via Test 2",
      legal_postal_code: "20100",
      legal_city: "Milano",
      legal_province: "MI",
      bank_iban: "PRIVATE",
      notes: "INTERNAL",
      stripe_customer_id: "SECRET",
    } as Company;
    expect(surveyPdfBrand(company)).toEqual({
      companyId: "company1",
      logoUrl: company.logo_url,
      email: company.email,
      phone: company.phone,
      vatNumber: company.vat_number,
      address: "Via Test 2, 20100 Milano MI",
    });
    expect(JSON.stringify(surveyPdfBrand(company))).not.toMatch(
      /PRIVATE|INTERNAL|SECRET/,
    );
  });
  it("senza azienda non costruisce un’identità fittizia", () => {
    expect(surveyPdfBrand(null)).toBeUndefined();
  });
});
