/** Synthetic QA entry. Only served by qa-assignment-dialog-browser.mjs. */
import React from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "sonner";
import { AddAssignmentDialog } from "../src/components/orders/AddAssignmentDialog";
// This module exists only in the standalone runner's Vite plugin.
// @ts-expect-error Virtual browser QA module, deliberately outside app configuration.
import { fixtureState } from "assignment-dialog-qa-stubs";
import "../src/index.css";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: false, staleTime: Infinity, refetchOnWindowFocus: false, refetchOnReconnect: false },
    mutations: { retry: false },
  },
});
queryClient.setQueryData(["tariffe-manodopera", "company"], [{
  id: "tariff-qa", nome: "Posa QA sintetica", unita: "h",
  prezzo_costo: 100, prezzo_vendita: 150, attiva: true, attivo: true,
  external_team_id: null,
}]);
queryClient.setQueryData(["tariffa-costi-varianti", "company"], [
  { id: "variant-qa-default", tariffa_id: "tariff-qa", external_team_id: "team-qa", nome: "Standard QA", costo: 100, is_default: true, attivo: true, sort_order: 0 },
  { id: "variant-qa-extra", tariffa_id: "tariff-qa", external_team_id: "team-qa", nome: "Con smontaggio QA", costo: 140, is_default: false, attivo: true, sort_order: 1 },
]);
fixtureState.seededQueryKeys = queryClient.getQueryCache().getAll().map(query => query.queryKey);
queryClient.getQueryCache().subscribe(event => {
  if (event.type === "updated" && event.action.type === "fetch") fixtureState.queryFetches.push(event.query.queryKey);
});
Object.defineProperty(window, "__assignmentDialogQA", { value: fixtureState });

function Harness() {
  return <QueryClientProvider client={queryClient}>
    <main>
      <p>Standalone assignment dialog QA · synthetic data · no account connection</p>
      <AddAssignmentDialog
        orderId="order-qa"
        phaseId={null}
        employees={[{ id: "employee-qa", label: "Persona QA sintetica", campoUserId: "campo-user-qa" }]}
        externalTeams={[]}
        phases={[{ id: "phase-qa", name: "Posa QA sintetica" }]}
        onAdd={(payload, options) => {
          fixtureState.submissions.push(structuredClone(payload));
          options?.onSuccess?.();
        }}
      />
    </main>
    <Toaster />
  </QueryClientProvider>;
}

createRoot(document.getElementById("root")!).render(<Harness />);
