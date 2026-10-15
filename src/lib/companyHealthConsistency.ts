import type { ServerHealthScore } from "@/hooks/useHealthScores";
import type { CompanyHealthData } from "@/types/adminRpc";

/** Il punteggio salvato è la fonte comune a elenco, filtri e scheda azienda.
 * L'assenza di un punteggio resta N/D, senza inventare una seconda valutazione.
 */
export function buildCompanyHealthMap(activity: CompanyHealthData[], scores: ServerHealthScore[]) {
  const activityByCompany = new Map(activity.map((row) => [row.company_id, row]));
  return Object.fromEntries(scores.map((serverHealth) => {
    const row = activityByCompany.get(serverHealth.company_id);
    return [serverHealth.company_id, {
      score: serverHealth.score,
      health: serverHealth.health,
      serverHealth,
      lastOrderDate: row?.last_order_date ?? null,
      order_count: Number(row?.order_count) || 0,
      user_count: Number(row?.user_count) || 0,
      has_customers: !!row?.has_customers,
      has_staff: !!row?.has_staff,
      orders_last_30d: row?.orders_last_30d,
    }];
  }));
}

export function companyHealthFactors(score: ServerHealthScore | null | undefined) {
  if (!score) return [];
  return [
    { label: "Login", score: score.login_score, maxScore: 25, color: "bg-blue-500" },
    { label: "Ordini", score: score.orders_score, maxScore: 25, color: "bg-emerald-500" },
    { label: "Funzionalità", score: score.features_score, maxScore: 20, color: "bg-violet-500" },
    { label: "Team", score: score.team_score, maxScore: 15, color: "bg-amber-500" },
    { label: "Engagement", score: score.engagement_score, maxScore: 15, color: "bg-orange-500" },
  ];
}
