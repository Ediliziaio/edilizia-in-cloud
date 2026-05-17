/**
 * CustomersList — health score / anomalies
 * Estratto da CustomersList.tsx (MP-CAN-001 Fase 2).
 *
 * Calcola la lista di anomalie anagrafiche per un cliente (nome incompleto,
 * email/telefono mancanti, fiscal code mancante, venditore non assegnato,
 * cantiere non indicato). Severità: high / medium / low.
 */
import { AlertTriangle, Mail, Phone, CreditCard, UserCheck, HardHat } from "lucide-react";
import type { CustomerAnomaly, CustomerAnomalySeverity, CustomerWithOrders } from "./types";
import { formatCustomerEmail, formatPhone } from "./formatters";

export function getCustomerAnomalies(customer: CustomerWithOrders): CustomerAnomaly[] {
  const anomalies: CustomerAnomaly[] = [];
  const cleanEmail = formatCustomerEmail(customer.email);
  const cleanPhone = formatPhone(customer.phone);
  const first = (customer.first_name ?? "").trim();
  const last = (customer.last_name ?? "").trim();
  const hasPlaceholderName = !customer.is_business && (
    !first || !last || first === "—" || last === "—" || first === "-" || last === "-"
  );

  if (hasPlaceholderName) {
    anomalies.push({
      severity: "high",
      label: "Nome incompleto",
      action: "Completa l'anagrafica prima di creare documenti o comunicazioni.",
      icon: AlertTriangle,
    });
  }
  if (!cleanEmail) {
    anomalies.push({
      severity: customer.portal_disabled ? "medium" : "high",
      label: "Email mancante",
      action: customer.portal_disabled
        ? "Aggiungi email se vuoi inviare comunicazioni o preventivi."
        : "Aggiungi email o disattiva il portale per evitare un accesso non operativo.",
      icon: Mail,
    });
  }
  if (!cleanPhone) {
    anomalies.push({
      severity: "medium",
      label: "Telefono mancante",
      action: "Aggiungi un numero per follow-up, urgenze e appuntamenti.",
      icon: Phone,
    });
  }
  if (!customer.fiscal_code?.trim()) {
    anomalies.push({
      severity: customer.is_business ? "high" : "low",
      label: customer.is_business ? "P.IVA mancante" : "CF/P.IVA mancante",
      action: "Completa il dato fiscale per fatture, contratti e controlli.",
      icon: CreditCard,
    });
  }
  if (customer.order_count > 0 && !customer.salesperson_id) {
    anomalies.push({
      severity: "medium",
      label: "Venditore non assegnato",
      action: "Assegna un referente commerciale per non perdere follow-up.",
      icon: UserCheck,
    });
  }
  if (customer.order_count > 0 && !customer.site_address?.trim()) {
    anomalies.push({
      severity: "low",
      label: "Cantiere non indicato",
      action: "Inserisci l'indirizzo cantiere per logistica e appuntamenti.",
      icon: HardHat,
    });
  }

  return anomalies;
}

export function getWorstSeverity(
  anomalies: CustomerAnomaly[],
): CustomerAnomalySeverity | "ok" {
  if (anomalies.some((a) => a.severity === "high")) return "high";
  if (anomalies.some((a) => a.severity === "medium")) return "medium";
  if (anomalies.some((a) => a.severity === "low")) return "low";
  return "ok";
}
