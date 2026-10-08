import { assessOrderEconomicsQuality, canonicalOrderEconomics, ORDER_ECONOMICS_COLUMNS } from "./orderEconomics.ts";
import type { ToolContext } from "./silvioTools.ts";


/** Read-only: use the same snapshot and quality rules as the order screen.
 * Child tables without company_id are read only after resolving the tenant's order.
 * Never fall back to adding invoices, purchase orders or average hourly rates.
 */
export async function silvioOrderReport(args: Record<string, unknown>, ctx: ToolContext) {
  const code = String(args?.commessa_codice ?? "").trim();
  if (!code) return { error: "Codice commessa obbligatorio." };
  if (!ctx.companyId) return { error: "Azienda non identificata." };
  const unavailable = (message: string): {
    error: string; affidabilita: string; margine: null; avvisi: string[]; come_leggere: string;
  } => ({
    error: message, affidabilita: "NON DISPONIBILE", margine: null,
    avvisi: [message],
    come_leggere: "Non inventare importi o trattare errori di lettura come costi zero. Chiedi di riprovare.",
  });
  try {
    // Exact (case-insensitive) codes only: no wildcard/first-match selection.
    const escapedCode = code.replace(/[\\%_]/g, "\\$&");
    const found = await ctx.supabase.from("orders")
      .select("id, order_code, description")
      .eq("company_id", ctx.companyId).ilike("order_code", escapedCode).limit(2);
    if (found.error) return unavailable("Impossibile leggere la commessa. Nessun margine calcolato.");
    if (!found.data?.length) return { error: "Commessa non trovata nell'azienda corrente. Specifica il codice esatto." };
    if (found.data.length !== 1) return { error: "Codice commessa ambiguo: verifica le commesse prima di proseguire." };
    const order = found.data[0];
    const link = `/azienda/ordini/${order.id}?tab=finanza`;
    const [snapshot, items, employees, teams, installments, cash] = await Promise.all([
      ctx.supabase.from("v_ordine_marginalita").select(ORDER_ECONOMICS_COLUMNS)
        .eq("company_id", ctx.companyId).eq("id", order.id).maybeSingle(),
      ctx.supabase.from("order_items").select("quantity, purchase_price").eq("order_id", order.id),
      ctx.supabase.from("order_employees").select("total_cost").eq("order_id", order.id),
      ctx.supabase.from("order_external_teams").select("total_cost").eq("order_id", order.id),
      ctx.supabase.from("order_installments").select("amount, is_paid").eq("order_id", order.id),
      ctx.supabase.from("prima_nota_entries").select("amount").eq("company_id", ctx.companyId)
        .eq("order_id", order.id).eq("direction", "entrata"),
    ]);
    if (snapshot.error || !snapshot.data || [items, employees, teams].some(r => r.error || !Array.isArray(r.data) || r.data.length >= 1000)) {
      return { ...unavailable("Dati economici o controlli di completezza non disponibili integralmente. Apri la commessa o riprova."), link };
    }
    // Core financial fields must be present and finite. A stale schema is not zero cost.
    const numeric = (value: unknown) => value !== null && value !== undefined && value !== "" && Number.isFinite(Number(value));
    if (["preventivo_totale", "consuntivo", "margine", "margine_perc"].some(k => !numeric(snapshot.data[k]))) {
      return { ...unavailable("La fonte economica ha importi mancanti o non validi. Nessun margine calcolato."), link };
    }
    const actual = canonicalOrderEconomics(snapshot.data);
    const quality = assessOrderEconomicsQuality({ sourceAvailable: true, actual,
      items: items.data, employees: employees.data, teams: teams.data });
    const warnings = quality.issues.map(issue => issue.label);
    const round = (n: number) => Math.round(n * 100) / 100;
    const readable = (result: { error: unknown; data: unknown }) => !result.error && Array.isArray(result.data)
      && result.data.length < 1000 && result.data.every(row => numeric(row.amount));
    const hasInstallments = readable(installments) && installments.data.length > 0;
    const hasCash = readable(cash) && cash.data.length > 0;
    const sum = (rows: { amount: number }[]) => round(rows.reduce((n, row) => n + Number(row.amount), 0));
    const paid = hasInstallments ? sum(installments.data.filter((r: { is_paid: boolean }) => r.is_paid === true)) : null;
    const due = hasInstallments ? sum(installments.data.filter((r: { is_paid: boolean }) => r.is_paid !== true)) : null;
    const received = hasCash ? sum(cash.data) : null;
    if (!hasInstallments) warnings.push("Piano rate assente o non leggibile: l'incassato da rate non è determinabile.");
    if (!hasCash) warnings.push("Nessuna entrata di Prima Nota leggibile: non equivale a zero incassi.");
    if (paid !== null && received !== null && Math.abs(paid - received) > 0.01) {
      warnings.push("Rate pagate e Prima Nota non coincidono: riconciliare gli incassi, non sommarli.");
    }
    return {
      commessa: `${order.order_code}${order.description ? ` — ${order.description}` : ""}`,
      fonte: "v_ordine_marginalita — stessa fonte del dettaglio commessa",
      aggiornato_al: new Date().toISOString(),
      affidabilita: quality.label,
      qualita: quality,
      ricavi: { contratto: actual.baseRevenue, varianti_approvate: actual.approvedVariations, totale: actual.revenue },
      costi: {
        acquisti: actual.purchases, materiali_magazzino: actual.warehouseMaterials,
        manodopera: actual.labor, provvigioni: actual.commissions,
        rimborsi_km: actual.mileageReimbursements, anomalie: actual.errors,
        costi_diretti: actual.directCosts, totale: actual.costs,
      },
      margine: quality.canShowMargin ? { importo: actual.margin, percentuale: actual.marginPct,
        tipo: "Margine diretto sui costi registrati", parziale: quality.status !== "ready" } : null,
      cassa: { incassato_da_rate: paid, da_incassare_da_rate: due, entrate_prima_nota: received,
        nota: "Letture separate da riconciliare: non sommare rate e Prima Nota; gli incassi non sono ricavi di competenza." },
      avvisi: warnings,
      limiti: ["Non è il margine netto o finale: struttura, stime mezzi e costi futuri non sono aggiunti da questo report.",
        "Dati attendibili indica assenza delle lacune rilevate, non certifica che ogni costo reale sia stato registrato."],
      prossima_azione: quality.issues.length ? "Apri Economia e pagamenti e completa i dati segnalati." : "Apri la commessa per verificare costi residui e struttura.",
      link,
      come_leggere: "Rispondi brevemente: margine diretto (solo se non nullo), attendibilità e prossima azione con link. " +
        "Mostra gli avvisi prima di interpretare i numeri. Non aggiungere ODA, fatture, SAL o rapportini al totale: rischi duplicazioni. " +
        "Non confondere assenza di operai interni con costo mancante in una commessa in subappalto. Dettagli su richiesta.",
    };
  } catch {
    return unavailable("Lettura economica interrotta. Nessun margine calcolato: riprova.");
  }
}
