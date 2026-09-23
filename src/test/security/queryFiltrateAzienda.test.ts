/**
 * Ogni elenco dell'app filtra l'azienda, non si affida solo alla sicurezza del
 * database (23/09/2026).
 *
 * La RLS fa vedere a un utente le righe di TUTTE le aziende a cui ha accesso:
 * al super admin in «Stai visualizzando» quelle di tutta la piattaforma, a chi
 * lavora su più aziende quelle di tutte le sue. Una lista senza
 * `.eq("company_id", …)` mescola quindi aziende diverse: Florin, dentro Green
 * Energy, vedeva in «Importa da preventivo» i preventivi di altre aziende e
 * avrebbe potuto importarne uno in una commessa di Green Energy.
 *
 * Il test legge i sorgenti: ogni lettura di una tabella che ha `company_id`
 * deve filtrare l'azienda o un record preciso (id, commessa, contatto…). Le
 * eccezioni legittime stanno qui sotto, ognuna col suo motivo: una query nuova
 * senza filtro fa diventare rosso il test.
 */
import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const ROOT = process.cwd();

/** Tabelle con la colonna company_id, lette dai tipi generati del database. */
function tabelleConAzienda(): Set<string> {
  const tipi = readFileSync(join(ROOT, "src/integrations/supabase/types.ts"), "utf8");
  const tabelle = new Set<string>();
  const blocco = /\n {6}([a-z0-9_]+): \{\n {8}Row: \{([\s\S]*?)\n {8}\}/g;
  for (const m of tipi.matchAll(blocco)) {
    if (/\n {10}company_id\??:/.test(m[2])) tabelle.add(m[1]);
  }
  return tabelle;
}

/** Aree dove leggere più aziende è voluto (pannello admin) o fuori dall'app. */
const CARTELLE_ESCLUSE = [
  "src/test/", "src/integrations/", "src/pages/admin/", "src/components/admin/",
  "src/pages/superadmin", "src/routes/",
];

/** Eccezioni legittime: `file|tabella` → perché va bene così. */
const ECCEZIONI: Record<string, string> = {
  "src/components/settings/MarketingCalendarsConfig.tsx|marketing_calendars": "lo slug di prenotazione è unico in tutta la piattaforma",
  "src/components/users/UserActivityLogTab.tsx|user_audit_log": "registro di un utente preciso",
  "src/components/orders/BloccaPrezzoCard.tsx|blocca_prezzo": "filtrata per commessa o preventivo subito dopo",
  "src/hooks/useRistrutturazioneProgetto.ts|rst_template_pdf": "controlla solo che la tabella esista",
  "src/hooks/useClimatizzazioneProgetto.ts|clm_template_pdf": "controlla solo che la tabella esista",
  "src/hooks/usePiscineProgetto.ts|pis_template_pdf": "controlla solo che la tabella esista",
  "src/hooks/useBagniProgetto.ts|bgn_template_pdf": "controlla solo che la tabella esista",
  "src/hooks/useElettricoProgetto.ts|ele_template_pdf": "controlla solo che la tabella esista",
  "src/hooks/useTermoidraulicoProgetto.ts|idr_template_pdf": "controlla solo che la tabella esista",
  "src/hooks/usePavimentiProgetto.ts|pav_template_pdf": "controlla solo che la tabella esista",
  "src/hooks/useTettiProgetto.ts|tet_template_pdf": "controlla solo che la tabella esista",
  "src/hooks/useFeatureBundles.ts|feature_bundles": "catalogo della piattaforma",
  "src/hooks/useHealthScores.ts|company_health_scores": "usato solo dal pannello admin",
  "src/hooks/useSaasMetrics.ts|subscription_logs": "metriche della piattaforma, solo admin",
  "src/hooks/useAdminSidebarBadges.ts|support_conversations": "badge del pannello admin",
  "src/hooks/useAdminSidebarBadges.ts|failure_alerts": "badge del pannello admin",
  "src/hooks/useWebhookAlerts.ts|integration_webhook_events": "registro webhook del pannello admin",
  "src/hooks/superadmin/useFailureAlerts.ts|failure_alerts": "solo super admin",
  "src/hooks/accountant/useAccountantChangeRequests.ts|accountant_change_requests": "il commercialista lavora su più aziende per mestiere",
  "src/hooks/warehouse/useStockUnits.ts|stock_units": "filtrate per righe di commessa",
  "src/lib/adminPlanDeletion.ts|subscription_logs": "eliminazione di un piano, solo admin",
  "src/lib/serramenti/api.ts|sr_progetti": "filtro sull'azienda subito dopo (o per serie di revisioni); i chiamanti la passano",
  "src/lib/serramenti/api.ts|sr_template_pdf": "filtro sull'azienda subito dopo; i chiamanti la passano",
  "src/lib/serramenti/api.ts|tariffe_aziendali": "filtro sull'azienda subito dopo; i chiamanti la passano",
  "src/lib/serramenti/api.ts|marketing_contacts": "filtro sull'azienda subito dopo; i chiamanti la passano",
  "src/lib/serramenti/api.ts|render_sessions": "filtro sull'azienda subito dopo; i chiamanti la passano",
  "src/lib/customer-os/customerProfile.ts|customer_profile": "console clienti della piattaforma, solo admin",
  "src/lib/api/surveys.ts|survey_templates": "ripiego quando manca la RPC per azienda",
  "src/lib/api/surveys.ts|surveys": "filtro sull'azienda subito dopo; l'elenco la passa",
  "src/lib/silvio/hooks.ts|silvio_canali_identita": "canali dell'utente stesso (RLS: solo le proprie righe)",
  "src/pages/azienda/email/components/EmailViewer.tsx|ai_action_proposals": "proposte di una conversazione precisa",
  "src/pages/cliente/CustomerFirma.tsx|signature_requests": "portale cliente: le firme del cliente stesso",
  "src/pages/azienda/email/components/EmailList.tsx|v_my_email_inbox": "casella dell'utente stesso: la vista filtra user_id = auth.uid()",
  "src/pages/azienda/email/components/EmailSidebar.tsx|v_my_email_inbox": "casella dell'utente stesso: la vista filtra user_id = auth.uid()",
};

// `.from("tabella")` e i piccoli aiuti con cui certi file la chiamano.
const LETTURA = /(?:\.from|\b(?:fromTable|metaTable|gTable|table|reputationTable|fromT|tbl|sbFrom))\(\s*["'`]([a-zA-Z0-9_]+)["'`]\s*(?:as [a-zA-Z]+)?\)/g;
// Filtri che legano la lettura a un record preciso (quindi già a un'azienda).
const FILTRO_SU_RECORD = /\.(eq|in|match|contains|filter|neq|is)\(\s*["'`]([a-z_]*id|id|token|slug|signature_token|email)["'`]/;

function sorgenti(dir: string): string[] {
  const out: string[] = [];
  for (const nome of readdirSync(dir)) {
    const p = join(dir, nome);
    if (statSync(p).isDirectory()) out.push(...sorgenti(p));
    else if (/\.(ts|tsx)$/.test(nome)) out.push(p);
  }
  return out;
}

function letturaSenzaFiltro(): string[] {
  const tabelle = tabelleConAzienda();
  const trovate = new Set<string>();
  for (const assoluto of sorgenti(join(ROOT, "src"))) {
    const file = relative(ROOT, assoluto).split("\\").join("/");
    if (CARTELLE_ESCLUSE.some((c) => file.startsWith(c))) continue;
    const testo = readFileSync(assoluto, "utf8");
    for (const m of testo.matchAll(LETTURA)) {
      const tabella = m[1];
      if (!tabelle.has(tabella)) continue;
      const dopo = testo.slice((m.index ?? 0) + m[0].length, (m.index ?? 0) + m[0].length + 1500);
      const fine = Math.min(...[dopo.indexOf(";"), dopo.indexOf(".from(")].filter((i) => i >= 0), dopo.length);
      const catena = dopo.slice(0, fine);
      if (!catena.includes(".select(")) continue;
      if ([".insert(", ".update(", ".delete(", ".upsert("].some((op) => catena.includes(op))) continue;
      if (catena.includes("company_id")) continue;
      if (FILTRO_SU_RECORD.test(catena)) continue;
      trovate.add(`${file}|${tabella}`);
    }
  }
  return [...trovate].sort();
}

describe("ogni elenco filtra l'azienda", () => {
  const trovate = letturaSenzaFiltro();

  it("la lettura dei tipi del database trova le tabelle per azienda", () => {
    const tabelle = tabelleConAzienda();
    for (const t of ["quotes", "orders", "marketing_contacts", "invoices", "bank_accounts", "tasks"]) {
      expect(tabelle.has(t), t).toBe(true);
    }
  });

  it("nessuna lettura nuova senza filtro sull'azienda", () => {
    const nuove = trovate.filter((k) => !(k in ECCEZIONI));
    expect(nuove, "Aggiungi .eq(\"company_id\", …) a queste letture, o spiega in ECCEZIONI perché non serve").toEqual([]);
  });

  it("le eccezioni non restano scritte dopo che il codice è cambiato", () => {
    const superflue = Object.keys(ECCEZIONI).filter((k) => !trovate.includes(k));
    expect(superflue, "Queste eccezioni non servono più: toglile").toEqual([]);
  });

  it("i casi del 23/09 filtrano davvero l'azienda", () => {
    const leggi = (f: string) => readFileSync(join(ROOT, f), "utf8");
    expect(leggi("src/components/orders/ImportFromQuotePicker.tsx")).toContain('.eq("company_id", companyId!)');
    expect(leggi("src/hooks/controlloGestione/useBudget.ts")).toContain('.eq("company_id", companyId)');
    expect(leggi("src/modules/ai-agents/hooks/useAgentCredits.ts")).toMatch(/from\("ai_credits" as never\)\s*\.select\("\*"\)\s*\.eq\("company_id"/);
  });
});
