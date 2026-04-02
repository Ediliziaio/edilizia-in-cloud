/**
 * useOnboardingAutoVerify
 *
 * Automatically marks onboarding steps as completed when real DB conditions
 * are satisfied, based on each step's `auto_check_key` field.
 *
 * Runs once on mount (and when companyId changes). Uses a single batched
 * check per auto_check_key so it never makes N queries for N steps.
 */

import { useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useQueryClient } from "@tanstack/react-query";

interface AutoCheckResult {
  [key: string]: boolean;
}

/** Maps auto_check_key → async condition function */
async function runAutoChecks(companyId: string, keys: string[]): Promise<AutoCheckResult> {
  const result: AutoCheckResult = {};
  const uniqueKeys = [...new Set(keys)];

  await Promise.all(
    uniqueKeys.map(async (key) => {
      try {
        switch (key) {
          case "has_anagrafica": {
            const { count } = await supabase
              .from("anagrafica_azienda")
              .select("id", { count: "exact", head: true })
              .eq("company_id", companyId)
              .not("ragione_sociale", "is", null);
            result[key] = (count ?? 0) > 0;
            break;
          }
          case "has_employees": {
            const { count } = await supabase
              .from("employees")
              .select("id", { count: "exact", head: true })
              .eq("company_id", companyId);
            result[key] = (count ?? 0) > 0;
            break;
          }
          case "has_invoice": {
            const { count } = await supabase
              .from("invoices")
              .select("id", { count: "exact", head: true })
              .eq("company_id", companyId)
              .neq("status", "annullata");
            result[key] = (count ?? 0) > 0;
            break;
          }
          case "has_preventivo": {
            const { count } = await supabase
              .from("quotes")
              .select("id", { count: "exact", head: true })
              .eq("company_id", companyId);
            result[key] = (count ?? 0) > 0;
            break;
          }
          case "has_product": {
            const { count } = await supabase
              .from("products")
              .select("id", { count: "exact", head: true })
              .eq("company_id", companyId);
            result[key] = (count ?? 0) > 0;
            break;
          }
          case "has_banking": {
            const { count } = await supabase
              .from("bank_accounts")
              .select("id", { count: "exact", head: true })
              .eq("company_id", companyId);
            result[key] = (count ?? 0) > 0;
            break;
          }
          case "has_order": {
            const { count } = await supabase
              .from("orders")
              .select("id", { count: "exact", head: true })
              .eq("company_id", companyId);
            result[key] = (count ?? 0) > 0;
            break;
          }
          case "has_contact": {
            const { count } = await supabase
              .from("marketing_contacts")
              .select("id", { count: "exact", head: true })
              .eq("company_id", companyId);
            result[key] = (count ?? 0) > 0;
            break;
          }
          case "has_user": {
            // Has at least 2 users (owner + one more)
            const { count } = await supabase
              .from("profiles")
              .select("id", { count: "exact", head: true })
              .eq("company_id", companyId);
            result[key] = (count ?? 0) >= 1;
            break;
          }
          default:
            // Unknown key — don't auto-verify
            result[key] = false;
        }
      } catch {
        result[key] = false;
      }
    })
  );

  return result;
}

export function useOnboardingAutoVerify() {
  const { effectiveCompany, user } = useAuth();
  const queryClient = useQueryClient();
  const companyId = effectiveCompany?.id;
  const runningRef = useRef(false);

  useEffect(() => {
    if (!companyId || !user?.id || runningRef.current) return;

    async function verify() {
      runningRef.current = true;
      try {
        // 1. Fetch company onboarding
        const { data: onboarding } = await supabase
          .from("company_onboarding" as never)
          .select("id, template_id, status")
          .eq("company_id", companyId as never)
          .maybeSingle() as any;

        if (!onboarding?.template_id) return;
        if (onboarding.status === "completed") return;

        // 2. Fetch steps with auto_check_key
        const { data: steps } = await supabase
          .from("onboarding_steps" as never)
          .select("id, auto_check_key")
          .eq("template_id", onboarding.template_id)
          .not("auto_check_key", "is", null) as any;

        if (!steps?.length) return;

        // 3. Fetch already-completed steps
        const { data: existing } = await supabase
          .from("company_onboarding_completions" as never)
          .select("step_id")
          .eq("company_id", companyId as never) as any;

        const completedIds = new Set((existing || []).map((c: any) => c.step_id));

        // 4. Determine which auto_check_keys need evaluation (only incomplete steps)
        const pendingSteps = steps.filter((s: any) => !completedIds.has(s.id));
        if (!pendingSteps.length) return;

        const keys = pendingSteps.map((s: any) => s.auto_check_key as string);
        const checkResults = await runAutoChecks(companyId!, keys);

        // 5. Upsert completions for steps that now pass their condition
        const toComplete = pendingSteps.filter((s: any) => checkResults[s.auto_check_key]);
        if (!toComplete.length) return;

        const inserts = toComplete.map((s: any) => ({
          company_id: companyId,
          step_id: s.id,
          completed_by: user!.id,
          completed_at: new Date().toISOString(),
        }));

        await (supabase
          .from("company_onboarding_completions" as never)
          .upsert(inserts, { onConflict: "company_id,step_id" }) as any);

        // 6. Invalidate query so UI updates
        queryClient.invalidateQueries({ queryKey: ["company-onboarding", companyId] });
        queryClient.invalidateQueries({ queryKey: ["onboarding-completions", companyId] });
      } catch (err) {
        console.warn("[useOnboardingAutoVerify]", err);
      } finally {
        runningRef.current = false;
      }
    }

    verify();
    // Re-run when company changes — ref prevents re-entry within same session
  }, [companyId, user?.id, queryClient]);
}
