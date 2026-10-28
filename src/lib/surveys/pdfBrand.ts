import type { Company } from "@/types/auth";

/** Explicit, non-financial company details only. Never pass the whole auth/company record to a PDF. */
export type SurveyPdfBrand = {
  companyId: string;
  logoUrl?: string | null;
  address?: string;
  vatNumber?: string | null;
  email?: string | null;
  phone?: string | null;
};
export function surveyPdfBrand(
  company: Company | null | undefined,
): SurveyPdfBrand | undefined {
  if (!company?.id) return undefined;
  return {
    companyId: company.id,
    logoUrl: company.logo_url,
    address: [
      company.legal_address,
      [company.legal_postal_code, company.legal_city, company.legal_province]
        .filter(Boolean)
        .join(" "),
    ]
      .filter(Boolean)
      .join(", "),
    vatNumber: company.vat_number,
    email: company.email,
    phone: company.phone,
  };
}
