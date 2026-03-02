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

export function getHealthIndicator(daysSince: number | null): { color: string; bgColor: string; label: string } {
  if (daysSince === null) return { color: "text-muted-foreground", bgColor: "bg-muted", label: "Nessuno" };
  if (daysSince === 0) return { color: "text-green-600", bgColor: "bg-green-500/10", label: "Oggi" };
  if (daysSince <= 14) return { color: "text-green-600", bgColor: "bg-green-500/10", label: `${daysSince}gg fa` };
  if (daysSince <= 45) return { color: "text-yellow-600", bgColor: "bg-yellow-500/10", label: `${daysSince}gg fa` };
  return { color: "text-red-600", bgColor: "bg-red-500/10", label: `${daysSince}gg fa` };
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
