/// <reference types="node" />
import { readFileSync } from "node:fs";
import vm from "node:vm";
import ts from "typescript";
import { describe, expect, it, vi } from "vitest";
import { quoteWriteVersion } from "@/lib/preventivi/quoteWriteVersion";
import { esitoUpdateConGuardia, isConflittoModifica } from "@/lib/concorrenza";
import { assertSavedQuoteAmounts } from "@/lib/preventivi/quoteSaveValidation";

// Execute the real handlers, with synthetic services only. This catches ordering
// regressions that pure helper tests cannot see, without loading the giant editor.
function actualHandler(file: string, name: string, context: Record<string, unknown>) {
  const source = ts.createSourceFile(file, readFileSync(file, "utf8"), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  let initializer: ts.Expression | undefined;
  function visit(node: ts.Node) {
    if (ts.isVariableDeclaration(node) && node.name.getText(source) === name) initializer = node.initializer;
    ts.forEachChild(node, visit);
  }
  visit(source);
  if (!initializer) throw new Error(`Handler missing: ${name}`);
  const code = ts.transpileModule(`globalThis.handler = ${initializer.getText(source)}`, {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
  }).outputText;
  vm.createContext(context); vm.runInContext(code, context);
  return context.handler as (...args: unknown[]) => Promise<void>;
}
const noop = () => {};
function fixture(failAttachment: boolean, legacy = false) {
  let version = "v0", writes = 0;
  const toast = { error: vi.fn(), success: vi.fn() };
  const versionRef = { current: "v0" };
  const rpc = vi.fn(async () => {
    version = `rows-${++writes}`;
    return { data: { ok: true, ...(legacy ? {} : { updated_at: version }) }, error: null };
  });
  const context: Record<string, unknown> = {
    Error, console, JSON, companyId: "company-a", user: { id: "user-a" }, id: "quote-a", isEdit: true,
    existingQuote: { status: "bozza" }, existingItemsLoaded: true, existingAttachmentsLoaded: true,
    partialQuoteId: null, pendingEditNavId: null, paymentPhases: [], paymentPlanError: (): string | null => null,
    persistLocalDraft: noop, saveInFlightRef: { current: false }, versioneCaricataRef: versionRef,
    setSaving: noop, setAutosaveFailed: noop, setLastSavedHash: noop, draftSerialized: "snapshot",
    setPartialQuoteId: noop, setPendingEditNavId: noop, newQuoteCompletedRef: { current: false },
    searchParams: new URLSearchParams(), items: [], selectedMaterials: [], bonusLines: [],
    totaliPro: { costo_totale: 0, overhead_totale: 0, margine_totale_pct: 100 },
    subtotal: 100, discountAmt: 0, vatAmount: 22, total: 122,
    financingProposal: null, validityDays: 30, discountPercent: 0,
    clearQuoteDraft: noop, assertSavedQuoteAmounts, quoteWriteVersion, esitoUpdateConGuardia, isConflittoModifica,
    queryClient: { invalidateQueries: noop }, queryKeys: { quotes: { all: [], detail: (): string[] => [], items: (): string[] => [] } },
    navigate: noop, toast,
    supabase: { rpc, from(table: string) {
      let action = "read", expected: string;
      const query = {
        update() { action = "update"; return query; },
        eq(key: string, value: string) { if (key === "updated_at") expected = value; return query; },
        select() { return query; }, single() { return query; },
        then(resolve: (value: unknown) => unknown) {
          if (table === "quotes" && action === "update") {
            if (expected !== version) return Promise.resolve({ data: [], error: null }).then(resolve);
            version = `header-${++writes}`;
            return Promise.resolve({ data: [{ updated_at: version }], error: null }).then(resolve);
          }
          if (table === "quote_pdf_attachments" && failAttachment) {
            failAttachment = false;
            return Promise.resolve({ data: null, error: new Error("allegati offline") }).then(resolve);
          }
          return Promise.resolve({ error: null, data: table === "quotes"
            ? { subtotal: 100, discount_amount: 0, vat_amount: 22, total: 122, updated_at: version } : [] }).then(resolve);
        },
      };
      return query;
    } },
  };
  for (const key of ["contactId", "clientName", "clientEmail", "clientPhone", "clientCompany", "clientAddress", "clientFiscalCode", "clientVatNumber", "title", "description", "notes", "internalNotes", "paymentMethod", "prezzoManuale", "prezzoManualeIvaPct", "effectiveSelectedTemplateId", "tipoLavoro", "indirizzoLavori", "pianoInstallazione", "kmCantiere", "salespersonId", "sedeId", "renderUrl", "renderSessionId", "pdfFirma", "layoutOverride", "pdfPrezziRiga", "pdfSoloTotale", "pdfSconti", "pdfImmagini", "pdfSchedeTecniche", "pdfMisure", "pdfAttributi", "pdfNoteCliente", "pdfCondizioni", "pdfWatermarkText", "pdfCopiaDestinatario"]) context[key] = null;
  return { save: actualHandler("src/pages/azienda/marketing/QuoteBuilder.tsx", "handleSave", context),
    toast, rpc, versionRef, version: () => version, colleagueSave: () => { version = "colleague"; } };
}
describe("QuoteBuilder: salvataggio e recupero reale", () => {
  it("salva normalmente e conserva la versione del database", async () => {
    const f = fixture(false); await f.save();
    expect(f.toast.success).toHaveBeenCalledWith("Preventivo aggiornato");
    expect(f.versionRef.current).toBe(f.version());
  });
  it.each([false, true])("riprova dopo errore allegati senza falso conflitto (RPC legacy=%s)", async legacy => {
    const f = fixture(true, legacy); await f.save();
    expect(f.toast.error).toHaveBeenCalledWith("Salvataggio non completato", expect.anything());
    expect(f.versionRef.current).toBe(f.version());
    await f.save();
    expect(f.toast.success).toHaveBeenCalledWith("Preventivo aggiornato");
    expect(f.toast.error).not.toHaveBeenCalledWith("Qualcun altro ha salvato questo preventivo", expect.anything());
  });
  it("dopo un errore non sovrascrive un collega che ha davvero salvato", async () => {
    const f = fixture(true); await f.save(); f.colleagueSave(); await f.save();
    expect(f.toast.error).toHaveBeenLastCalledWith("Qualcun altro ha salvato questo preventivo", expect.anything());
    expect(f.rpc).toHaveBeenCalledTimes(1);
    expect(f.version()).toBe("colleague");
    expect(f.toast.success).not.toHaveBeenCalled();
  });
});

describe("QuoteDetail: esito download", () => {
  it.each(["URL mancante", "HTTP 403", "HTML al posto del PDF"])("non annuncia successo per %s", async message => {
    const toast = { error: vi.fn(), success: vi.fn() }, download = vi.fn();
    await actualHandler("src/pages/azienda/marketing/QuoteDetail.tsx", "handleGeneratePdf", {
      Error, generating: false, id: "quote-a", setGenerating: noop, toast,
      supabase: { functions: { invoke: async (): Promise<{ data: object; error: null }> => ({ data: {}, error: null }) } },
      fetchQuotePdf: async () => { throw new Error(message); }, downloadQuotePdf: download,
    })();
    expect(toast.error).toHaveBeenCalledWith(`Errore generazione PDF: ${message}`);
    expect(toast.success).not.toHaveBeenCalled(); expect(download).not.toHaveBeenCalled();
  });
});
