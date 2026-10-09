// MP-IMP-001 Fase 2 — gating gestito da withCompanyPermission("canViewSettingsOrders") in companyRoutes.tsx
// Il titolo e la frase della pagina li mette già il layout delle Impostazioni: qui c'è solo il contenuto.
import { OrderStatusConfig } from "@/components/settings/OrderStatusConfig";

export default function SettingsOrderStatus() {
  return <OrderStatusConfig />;
}
