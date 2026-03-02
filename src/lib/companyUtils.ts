import type { CompanyStatus, CompanySector } from "@/types/auth";

export const sectorLabels: Record<string, string> = {
  serramenti: "Serramenti",
  infissi: "Infissi",
  bagni: "Bagni",
  tetti: "Tetti",
  fotovoltaico: "Fotovoltaico",
  pittura: "Pittura",
  ristrutturazioni: "Ristrutturazioni",
  altro: "Altro",
};

export const sectors: { value: CompanySector; label: string }[] = [
  { value: "serramenti", label: "Serramenti" },
  { value: "infissi", label: "Infissi" },
  { value: "bagni", label: "Bagni" },
  { value: "tetti", label: "Tetti" },
  { value: "fotovoltaico", label: "Fotovoltaico" },
  { value: "pittura", label: "Pittura" },
  { value: "ristrutturazioni", label: "Ristrutturazioni" },
  { value: "altro", label: "Altro" },
];

export const statusConfig: Record<CompanyStatus, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
  trial: { label: "Trial", variant: "outline" },
  active: { label: "Attivo", variant: "default" },
  suspended: { label: "Sospeso", variant: "secondary" },
  expired: { label: "Scaduto", variant: "destructive" },
};

export interface HealthInput {
  order_count: number;
  user_count: number;
  has_customers: boolean;
  has_staff: boolean;
  orders_last_30d?: number;
  last_order_date?: string | null;
}

/** Centralised health score — single source of truth (max 90) */
export function calculateHealthScore(h: HealthInput): { score: number; health: "healthy" | "at_risk" | "critical" } {
  let score = 0;
  if (h.order_count > 0) score += 15;
  if ((h.orders_last_30d || 0) > 0) score += 10;
  if ((h.user_count || 0) >= 2) score += 20;
  else if ((h.user_count || 0) >= 1) score += 10;
  if (h.has_customers) score += 15;
  if (h.has_staff) score += 10;
  if (h.last_order_date) {
    const days = Math.floor((Date.now() - new Date(h.last_order_date).getTime()) / 86400000);
    if (days <= 7) score += 20;
    else if (days <= 30) score += 15;
    else if (days <= 60) score += 5;
  }
  score = Math.min(score, 90);
  const health = score >= 60 ? "healthy" as const : score >= 30 ? "at_risk" as const : "critical" as const;
  return { score, health };
}

export function getOnboardingPct(hd: { order_count: number; user_count: number; has_customers: boolean; has_staff: boolean } | undefined): number {
  if (!hd) return 0;
  const done = (hd.order_count > 0 ? 1 : 0) + ((hd.user_count || 0) >= 2 ? 1 : 0) + (hd.has_customers ? 1 : 0) + (hd.has_staff ? 1 : 0);
  return Math.round((done / 4) * 100);
}

export interface HealthFactor {
  label: string;
  score: number;
  maxScore: number;
  color: string;
}

export function getHealthBreakdown(hd: { score: number; order_count: number; user_count: number; has_customers: boolean; has_staff: boolean; lastOrderDate: string | null } | undefined): HealthFactor[] {
  if (!hd) return [];
  const daysSince = hd.lastOrderDate ? Math.floor((Date.now() - new Date(hd.lastOrderDate).getTime()) / 86400000) : null;
  return [
    { label: "Ordini", score: Math.min(hd.order_count, 5) * 5, maxScore: 25, color: hd.order_count > 0 ? "bg-green-500" : "bg-red-400" },
    { label: "Utenti", score: Math.min(hd.user_count || 0, 4) * 5, maxScore: 20, color: (hd.user_count || 0) >= 2 ? "bg-green-500" : "bg-amber-400" },
    { label: "Clienti", score: hd.has_customers ? 15 : 0, maxScore: 15, color: hd.has_customers ? "bg-green-500" : "bg-red-400" },
    { label: "Staff", score: hd.has_staff ? 10 : 0, maxScore: 10, color: hd.has_staff ? "bg-green-500" : "bg-amber-400" },
    { label: "Attività", score: daysSince === null ? 0 : daysSince <= 7 ? 20 : daysSince <= 14 ? 15 : daysSince <= 30 ? 8 : 0, maxScore: 20, color: daysSince !== null && daysSince <= 14 ? "bg-green-500" : "bg-red-400" },
  ];
}
