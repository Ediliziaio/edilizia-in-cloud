// src/types/dashboard.ts

export interface AdminDashboardMetrics {
  totalRevenueMrr: number;
  activeSubscriptions: number;
  newSignupsThisMonth: number;
  churnThisMonth: number;
  totalCompanies: number;
  pendingPayments: number;
  lastUpdatedAt: string; // ISO 8601
}

export interface WidgetConfig {
  id: string;
  type: "metric" | "forecast" | "chart" | "table";
  position: number;
  visible: boolean;
  title: string;
}

export interface MrrDataPoint {
  yearMonth: string; // 'YYYY-MM'
  mrrEur: number;
  activeSubscriptions: number;
}

export interface ForecastResult {
  days: 30 | 60 | 90;
  projectedMrr: number;
  deltaMrr: number;
  deltaPercent: number;
  confidenceLow: number;
  confidenceHigh: number;
}

export interface AdminDashboardPreferences {
  id: string;
  adminUserId: string;
  widgetLayout: WidgetConfig[];
  widgetVisibility: Record<string, boolean>;
  updatedAt: string;
}
