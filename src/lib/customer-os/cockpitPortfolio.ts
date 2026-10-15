import { getAdminRevenueBreakdown, getCompanyMonthlyRevenue, isRevenueEligibleCompany, type AdminRevenueCompanyLike } from "@/lib/adminRevenue";
export interface CockpitProfile {
  company_id: string;
  is_at_risk: boolean;
  is_upsell_candidate: boolean;
  health_label_latest: string | null;
}
/** Stessi criteri MRR di Fatturato; il rischio resta il modello Customer OS. */
export function cockpitPortfolio(profiles: CockpitProfile[], companies: AdminRevenueCompanyLike[]) {
  const ids = new Set(companies.filter((c) => !c.is_platform_admin_company).map((c) => c.id));
  const rows = profiles.filter((row) => ids.has(row.company_id));
  const atRiskIds = new Set(rows.filter((row) => row.is_at_risk).map((row) => row.company_id));
  const revenue = getAdminRevenueBreakdown(companies);
  return {
    total: revenue.totalCompanies,
    mrrTotal: revenue.mrr,
    atRisk: atRiskIds.size,
    mrrAtRisk: companies.filter((company) => company.id && atRiskIds.has(company.id) && isRevenueEligibleCompany(company))
      .reduce((sum, company) => sum + getCompanyMonthlyRevenue(company), 0),
    upsell: rows.filter((row) => row.is_upsell_candidate).length,
    champions: rows.filter((row) => row.health_label_latest === "champion" || row.health_label_latest === "engaged").length,
    scored: rows.filter((row) => row.health_label_latest != null).length,
  };
}
