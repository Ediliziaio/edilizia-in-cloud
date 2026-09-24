/**
 * Ogni esportazione del CRM con righe di persone passa da «Esporta Clienti» e
 * dal registro (24/09/2026).
 *
 * Il permesso c'era nella schermata dei permessi ma nessun bottone lo
 * guardava, e le esportazioni non lasciavano traccia nel database: a BeMade un
 * operatore del call center senza il permesso scaricava tutti i contatti e
 * tutte le opportunità dell'azienda.
 *
 * Il test legge i sorgenti delle aree del CRM: ogni punto che consegna un file
 * è classificato qui sotto. Chi porta fuori righe di clienti, contatti o
 * opportunità deve guardare `canExportClients` e chiamare
 * `registraEsportazioneCrm`; chi no, ha il motivo scritto. Un'esportazione
 * nuova non classificata fa diventare rosso il test.
 */
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";
import {
  ETICHETTE_OGGETTO_ESPORTATO,
  descriviEsportazioneCrm,
  filtriAttivi,
} from "@/lib/export/esportazioniCrm";

const ROOT = process.cwd();
const leggi = (percorso: string) => readFileSync(join(ROOT, percorso), "utf8");
const MIGRAZIONE = leggi("supabase/migrations/20280924224500_esportazioni_crm_permesso_e_registro.sql");

/** Dove vivono il CRM e l'anagrafica clienti. */
const AREE_CRM = [
  "src/pages/azienda/marketing",
  "src/components/marketing",
  "src/components/opportunities",
  "src/components/contacts",
  "src/components/clients",
  "src/components/email-marketing",
  "src/components/reporting",
  "src/pages/azienda/sms-marketing",
  "src/pages/azienda/sms",
  "src/pages/azienda/CustomersList.tsx",
  "src/pages/azienda/settings/SettingsEsportaDati.tsx",
];

/** Codice che consegna un file al browser. */
const SCARICO = /exportToCSV\(|exportToXLSX\(|\.download\s*=|downloadFile\(|scaricaCsv\(|<ExportButton\b|writeBuffer\(|doc\.save\(|saveAs\(/;

/** Portano fuori righe di persone del CRM: permesso e registro. File → oggetti registrati. */
const CON_PERMESSO_E_REGISTRO: Record<string, string[]> = {
  "src/pages/azienda/marketing/MarketingContacts.tsx": ["contatti"],
  "src/pages/azienda/marketing/MarketingOpportunities.tsx": ["opportunita"],
  "src/pages/azienda/CustomersList.tsx": ["clienti"],
  "src/pages/azienda/sms-marketing/components/SmsContattiList.tsx": ["contatti_sms"],
  "src/components/email-marketing/CampaignDetailDialog.tsx": ["destinatari_campagna"],
  "src/pages/azienda/marketing/SalesOSDashboard.tsx": ["opportunita_ferme", "lead_migliori"],
  "src/pages/azienda/settings/SettingsEsportaDati.tsx": ["archivio_azienda"],
};

/** Scaricano qualcosa, ma non righe di clienti: perché va bene così. */
const SENZA_RIGHE_DI_CLIENTI: Record<string, string> = {
  "src/pages/azienda/marketing/MarketingDashboard.tsx": "KPI aggregati (metrica e valore), nessuna persona",
  "src/pages/azienda/marketing/QuoteDetail.tsx": "il PDF di un preventivo, non un elenco",
  "src/components/marketing/simulatore/SimulazionePDF.tsx": "il PDF di una simulazione, non un elenco",
  "src/components/marketing/preventivi/UnifiedPreventiviList.tsx":
    "elenco dei preventivi: numero, nome del cliente e totale, senza recapiti (email, telefono, indirizzo)",
  "src/components/reporting/crm-sales/CrmSalesReportPanel.tsx": "totali per periodo e per fonte, nessuna persona",
  "src/components/reporting/facebook-ads/ExportDialog.tsx": "rendimento delle campagne pubblicitarie, nessuna persona",
  "src/components/reporting/shared/ReportExportMenu.tsx": "chi lo usa esporta una riga per operatore o venditore (vedi il test sotto)",
  "src/components/email-marketing/EmailTopCampaignsTable.tsx": "statistiche per campagna, nessun destinatario",
};

function sorgenti(percorso: string): string[] {
  const assoluto = join(ROOT, percorso);
  if (!existsSync(assoluto)) return [];
  if (statSync(assoluto).isFile()) return [percorso];
  return readdirSync(assoluto).flatMap((nome) => {
    const figlio = join(assoluto, nome);
    const rel = relative(ROOT, figlio);
    if (statSync(figlio).isDirectory()) return sorgenti(rel);
    return /\.tsx?$/.test(nome) && !/\.test\.tsx?$/.test(nome) ? [rel] : [];
  });
}

describe("esportazioni del CRM: «Esporta Clienti» e registro", () => {
  const conScarico = AREE_CRM.flatMap(sorgenti).filter((f) => SCARICO.test(leggi(f)));

  it("ogni esportazione delle aree CRM è classificata", () => {
    const nonClassificate = conScarico.filter((f) => !(f in CON_PERMESSO_E_REGISTRO) && !(f in SENZA_RIGHE_DI_CLIENTI));
    expect(
      nonClassificate,
      "Esportazione nuova: se porta fuori clienti, contatti o opportunità va dietro canExportClients e registraEsportazioneCrm, altrimenti in SENZA_RIGHE_DI_CLIENTI col motivo",
    ).toEqual([]);
    // Nessuna classificazione resta appesa a un file che non esporta più.
    const classificati = [...Object.keys(CON_PERMESSO_E_REGISTRO), ...Object.keys(SENZA_RIGHE_DI_CLIENTI)];
    expect(classificati.filter((f) => !conScarico.includes(f))).toEqual([]);
  });

  it("chi esporta righe di persone guarda «Esporta Clienti» e passa dal registro", () => {
    for (const [f, oggetti] of Object.entries(CON_PERMESSO_E_REGISTRO)) {
      const sorgente = leggi(f);
      expect(sorgente, f).toContain("canExportClients");
      expect(sorgente, f).toContain("registraEsportazioneCrm(");
      for (const oggetto of oggetti) expect(sorgente, `${f}: ${oggetto}`).toContain(`oggetto: "${oggetto}"`);
    }
  });

  it("il menu dei report lo usano solo i report per operatore e per venditore", () => {
    const consumatori = sorgenti("src")
      .filter((f) => !f.startsWith("src/test/") && /<ReportExportMenu\b/.test(leggi(f)))
      .sort();
    expect(consumatori).toEqual([
      "src/components/reporting/callcenter/CallCenterReport.tsx",
      "src/components/reporting/venditori/VenditoriPerformanceReport.tsx",
    ]);
  });

  it("gli oggetti registrati sono quelli che il database accetta, e ognuno ha la sua esportazione", () => {
    const oggetti = Object.keys(ETICHETTE_OGGETTO_ESPORTATO).sort();
    for (const oggetto of oggetti) expect(MIGRAZIONE).toContain(`'${oggetto}'`);
    expect(Object.values(CON_PERMESSO_E_REGISTRO).flat().sort()).toEqual(oggetti);
  });

  it("il database controlla il permesso sull'azienda, anon non entra, il registro non si falsifica", () => {
    expect(MIGRAZIONE).toMatch(/security definer/);
    expect(MIGRAZIONE).toContain("has_permission_for_company(_uid, 'can_export_clients', p_company_id)");
    expect(MIGRAZIONE).toContain("'crm_exported'");
    expect(MIGRAZIONE).toContain(
      "revoke all on function public.registra_esportazione_crm(uuid, text, text, integer, jsonb) from public, anon;",
    );
    expect(MIGRAZIONE).toMatch(/create policy user_audit_log_insert[\s\S]*?actor_id = \(select auth\.uid\(\)\)/);
  });
});

describe("registro delle esportazioni: filtri e descrizione", () => {
  it("nel registro vanno solo i filtri accesi", () => {
    expect(filtriAttivi({
      ricerca: "rossi",
      fonte: "",
      mese: null,
      selezionati: null,
      solo_mie: false,
      gruppi: [],
      filtri: { statuses: [], assignedTo: "", source: "Facebook" },
      vuoto: { a: "", b: [] },
      righe_minime: 0,
    })).toEqual({ ricerca: "rossi", filtri: { source: "Facebook" }, righe_minime: 0 });
    expect(filtriAttivi(undefined)).toEqual({});
  });

  it("una riga crm_exported si legge in italiano", () => {
    expect(descriviEsportazioneCrm({
      oggetto: "contatti",
      formato: "xlsx",
      righe: 12345,
      filtri: { ricerca: "rossi", perimetro: "tutta l'azienda" },
    })).toBe("Contatti · 12.345 righe · XLSX · ricerca: rossi · perimetro: tutta l'azienda");
    expect(descriviEsportazioneCrm({
      oggetto: "archivio_azienda",
      formato: "zip",
      righe: 1,
      filtri: { elenchi: { marketing_contacts: 1, profiles: "non esportato" } },
    })).toBe("Archivio completo dell'azienda · 1 riga · ZIP · elenchi: marketing_contacts 1, profiles non esportato");
    expect(descriviEsportazioneCrm(null)).toBe("Esportazione");
  });
});
