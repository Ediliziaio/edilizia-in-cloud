/**
 * Shared helpers per le route /azienda/* (MP-CLN-001 Fase 1).
 *
 * - `COMPANY_ROLES`: ruoli ammessi al `ProtectedRoute` dell'area company
 * - `withCompanyPermission`: wrapper rapido per `RequireCompanyPermission`
 *
 * Estratti da `companyRoutes.tsx` per riuso futuro nelle modularizzazioni
 * di sotto-tree (es. settings) e per ridurre la duplicazione fra router.
 */
import type { ReactNode } from "react";
import {
  RequireCompanyPermission,
  type CompanyPermissionKey,
} from "@/components/auth/RequireCompanyPermission";

export const COMPANY_ROLES = [
  "company_admin",
  "company_staff",
  "super_admin",
  "salesperson",
  "call_center",
  "multi_company_user",
] as const;

export type CompanyRole = (typeof COMPANY_ROLES)[number];

/** Wraps an element with `RequireCompanyPermission`. */
export function withCompanyPermission(
  permission: CompanyPermissionKey,
  element: ReactNode,
) {
  return (
    <RequireCompanyPermission permission={permission}>
      {element}
    </RequireCompanyPermission>
  );
}
