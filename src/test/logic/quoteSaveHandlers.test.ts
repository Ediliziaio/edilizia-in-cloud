/// <reference types="node" />
import { readFileSync } from "node:fs";
import vm from "node:vm";
import ts from "typescript";
import { clienteDaCollegare } from "@/lib/preventivi/preventiviCommittente";
import { describe, expect, it, vi } from "vitest";
import { quoteWriteVersion } from "@/lib/preventivi/quoteWriteVersion";
import { esitoUpdateConGuardia, isConflittoModifica } from "@/lib/concorrenza";
import { assertSavedQuoteAmounts } from "@/lib/preventivi/quoteSaveValidation";
import { serializeQuoteDraft, readQuoteDraft, quoteDraftInputHash } from "@/lib/preventivi/quoteDraft";

// Execute the real handlers, with synthetic services only. This catches ordering
// regressions that pure helper tests cannot see, without loading the giant editor.
function actualHandler(file: string, name: string, context: Record<string, unknown>) {
  context.localEditor ??= undefined;
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
describe("QuoteBuilder: protezione locale reale", () => {
  const key = "quote-draft-company-a-quote-a";
  function draftContext() {
    const localStorage = { setItem: vi.fn(), removeItem: vi.fn() };
    return {
      JSON, serializeQuoteDraft, useCallback: (fn: unknown) => fn,
      draftReady: true, isEdit: true, newQuoteCompletedRef: { current: false }, draftHandedOffRef: { current: false }, quoteDraftInputHash,
      quoteDraftKey: key, recoverableDraft: null as object | null,
      draftReadFailedRef: { current: false }, draftCheckedRef: { current: key },
      lastCloudSavedSnapshotRef: { current: "versione sul server" }, lastSavedHash: "versione sul server",
      draftSerialized: JSON.stringify({ clientName: "Cliente", notes: "Ultima nota", selectedMaterials: ["scheda"], items: [], tipoClienteScelto: "azienda" }),
      localStorage, setLocalDraftSaved: vi.fn(), setLocalDraftFailed: vi.fn(),
    };
  }
  it("protegge anche un documento esistente con allegati e tipo cliente", () => {
    const context = draftContext();
    actualHandler("src/pages/azienda/marketing/QuoteBuilder.tsx", "persistLocalDraft", context)();
    const [savedKey, raw] = context.localStorage.setItem.mock.calls[0];
    expect(savedKey).toBe(key);
    expect(readQuoteDraft(raw)).toMatchObject({ notes: "Ultima nota", selectedMaterials: ["scheda"], tipoClienteScelto: "azienda" });
  });
  it.each(["loading", "recovery", "readError", "alreadySaved"])("non sovrascrive la bozza durante %s", mode => {
    const context = draftContext();
    if (mode === "loading") context.draftReady = false;
    if (mode === "recovery") context.recoverableDraft = { notes: "Bozza precedente" };
    if (mode === "readError") context.draftReadFailedRef.current = true;
    if (mode === "alreadySaved") context.lastCloudSavedSnapshotRef.current = context.draftSerialized;
    actualHandler("src/pages/azienda/marketing/QuoteBuilder.tsx", "persistLocalDraft", context)();
    expect(context.localStorage.setItem).not.toHaveBeenCalled();
  });
  it("se il dispositivo è pieno segnala che la bozza non è protetta", () => {
    const context = draftContext();
    context.localStorage.setItem.mockImplementation(() => { throw new Error("QuotaExceededError"); });
    actualHandler("src/pages/azienda/marketing/QuoteBuilder.tsx", "persistLocalDraft", context)();
    expect(context.setLocalDraftFailed).toHaveBeenCalledWith(true);
    expect(context.setLocalDraftSaved).not.toHaveBeenCalled();
  });
  it("protegge nuove modifiche anche dopo aver già creato il preventivo e aperto un'anteprima", () => {
    const context = draftContext(); context.isEdit = false; context.newQuoteCompletedRef.current = true;
    context.lastCloudSavedSnapshotRef.current = JSON.stringify({ notes: "Nota salvata prima dell'anteprima" });
    actualHandler("src/pages/azienda/marketing/QuoteBuilder.tsx", "persistLocalDraft", context)();
    expect(readQuoteDraft(context.localStorage.setItem.mock.calls[0][1])).toMatchObject({ notes: "Ultima nota" });
  });
  it("non ripropone la bozza già salvata quando cambia soltanto l'id interno", () => {
    const context = draftContext(); context.isEdit = false; context.newQuoteCompletedRef.current = true;
    context.draftSerialized = JSON.stringify({ notes: "Salvata", partialQuoteId: "quote-a" });
    context.lastCloudSavedSnapshotRef.current = JSON.stringify({ notes: "Salvata", partialQuoteId: null });
    actualHandler("src/pages/azienda/marketing/QuoteBuilder.tsx", "persistLocalDraft", context)();
    expect(context.localStorage.setItem).not.toHaveBeenCalled();
  });
  it("trasferisce una creazione parziale recuperata nell'editor corretto conservando gli input", () => {
    const storage = { setItem: vi.fn() }; const navigate = vi.fn();
    const context = { JSON, companyId: "company-a", latestDraftSerializedRef: { current: JSON.stringify({ notes: "Da riprendere", selectedMaterials: ["scheda"], partialQuoteId: "quote-a" }) },
      localStorage: storage, serializeQuoteDraft, newQuoteCompletedRef: { current: false }, draftHandedOffRef: { current: false }, clearQuoteDraft: vi.fn(), navigate, setLocalDraftFailed: vi.fn(), toast: { error: vi.fn() } };
    actualHandler("src/pages/azienda/marketing/QuoteBuilder.tsx", "openCreatedQuoteWithDraft", context)("quote-a");
    expect(readQuoteDraft(storage.setItem.mock.calls[0][1])).toMatchObject({ notes: "Da riprendere", selectedMaterials: ["scheda"], partialQuoteId: null });
    expect(storage.setItem.mock.calls[0][0]).toBe("quote-draft-company-a-quote-a");
    expect(navigate).toHaveBeenCalledWith("/azienda/marketing/preventivi/quote-a/modifica");
  });
});
function fixture(failAttachment: boolean, legacy = false, newQuote = false) {
  let version = "v0", writes = 0;
  const headers: Record<string, unknown>[] = [];
  const toast = { error: vi.fn(), success: vi.fn(), info: vi.fn() };
  const versionRef = { current: "v0" };
  const rpc = vi.fn(async (name: string) => {
    if (name === "generate_quote_number") return { data: "OFF-TEST", error: null };
    version = `rows-${++writes}`;
    return { data: { ok: true, ...(legacy ? {} : { updated_at: version }) }, error: null };
  });
  const context: Record<string, unknown> = {
    Error, console, JSON, companyId: "company-a", user: { id: "user-a" }, id: newQuote ? undefined : "quote-a", isEdit: !newQuote,
    existingQuote: { status: "bozza" }, existingItemsLoaded: true, existingAttachmentsLoaded: true,
    partialQuoteId: null, pendingEditNavId: null, recoverableDraft: null, paymentPhases: [], paymentPlanError: (): string | null => null,
    persistLocalDraft: noop, saveInFlightRef: { current: false }, versioneCaricataRef: versionRef,
    setSaving: noop, setAutosaveFailed: noop, setLastSavedHash: noop, draftSerialized: '{"notes":"snapshot"}',
    latestDraftSerializedRef: { current: '{"notes":"snapshot"}' }, lastCloudSavedSnapshotRef: { current: '{"notes":"snapshot"}' },
    createdQuoteRef: { current: null as string | null }, quoteDraftInputHash,
    setPartialQuoteId: (value: string | null) => { context.partialQuoteId = value; }, setPendingEditNavId: noop, newQuoteCompletedRef: { current: false },
    searchParams: new URLSearchParams(), items: [], selectedMaterials: [], bonusLines: [],
    totaliPro: { costo_totale: 0, overhead_totale: 0, margine_totale_pct: 100 },
    subtotal: 100, discountAmt: 0, vatAmount: 22, total: 122,
    templateValues: {}, contractFields: [], tipoCliente: "privato",
    financingProposal: null, validityDays: 30, discountPercent: 0,
    clearQuoteDraft: vi.fn(), assertSavedQuoteAmounts, quoteWriteVersion, esitoUpdateConGuardia, isConflittoModifica,
    queryClient: { invalidateQueries: noop }, queryKeys: { quotes: { all: [], detail: (): string[] => [], items: (): string[] => [] } },
    navigate: vi.fn(), toast,
    supabase: { rpc, from(table: string) {
      let action = "read", expected: string;
      const query = {
        update(data: Record<string, unknown>) { action = "update"; if (table === "quotes") headers.push(data); return query; },
        insert(data: Record<string, unknown>) { action = "insert"; if (table === "quotes") headers.push(data); return query; },
        eq(key: string, value: string) { if (key === "updated_at") expected = value; return query; },
        select() { return query; }, single() { return query; },
        then(resolve: (value: unknown) => unknown) {
          if (table === "quotes" && action === "insert") return Promise.resolve({ data: { id: "quote-a" }, error: null }).then(resolve);
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
  for (const key of ["contactId", "customerId", "clientName", "clientEmail", "clientPhone", "clientCompany", "clientAddress", "clientFiscalCode", "clientVatNumber", "clientCodiceUnivoco", "cronoprogramma", "title", "description", "notes", "internalNotes", "paymentMethod", "prezzoManuale", "prezzoManualeIvaPct", "effectiveSelectedTemplateId", "tipoLavoro", "indirizzoLavori", "pianoInstallazione", "kmCantiere", "salespersonId", "sedeId", "renderUrl", "renderSessionId", "pdfFirma", "layoutOverride", "pdfPrezziRiga", "pdfSoloTotale", "pdfSconti", "pdfImmagini", "pdfSchedeTecniche", "pdfMisure", "pdfAttributi", "pdfNoteCliente", "pdfCondizioni", "condizioniTesto", "pdfWatermarkText", "pdfCopiaDestinatario", "clienteDaUrl"]) context[key] = null;
  // Il legame col cliente della scheda (10/11/2026): la funzione vera, nessun cliente arrivato dalla scheda.
  context.clienteDaCollegare = clienteDaCollegare;
  // Testata e righe si costruiscono fuori da handleSave dal 07/11/2026: le usa anche il PDF vero a destra.
  context.datiTestata = actualHandler("src/pages/azienda/marketing/QuoteBuilder.tsx", "datiTestata", context);
  context.righeDaSalvare = actualHandler("src/pages/azienda/marketing/QuoteBuilder.tsx", "righeDaSalvare", context);
  return { save: actualHandler("src/pages/azienda/marketing/QuoteBuilder.tsx", "handleSave", context),
    context, toast, rpc, headers, versionRef, version: () => version, colleagueSave: () => { version = "colleague"; } };
}
describe("QuoteBuilder: salvataggio e recupero reale", () => {
  it("conserva le modifiche durante la prima creazione e poi aggiorna lo stesso preventivo", async () => {
    const f = fixture(false, false, true);
    f.context.notes = "Prima nota";
    f.context.draftSerialized = JSON.stringify({ notes: "Prima nota", partialQuoteId: null });
    (f.context.latestDraftSerializedRef as { current: string }).current = JSON.stringify({ notes: "Ultima nota digitata" });
    await f.save();
    expect(f.context.navigate).not.toHaveBeenCalled();
    expect(f.context.clearQuoteDraft).not.toHaveBeenCalled();
    expect((f.context.createdQuoteRef as { current: string }).current).toBe("quote-a");
    f.context.notes = "Ultima nota digitata";
    f.context.draftSerialized = JSON.stringify({ notes: "Ultima nota digitata", partialQuoteId: "quote-a" });
    await f.save();
    expect(f.rpc.mock.calls.filter(([name]) => name === "generate_quote_number")).toHaveLength(1);
    expect(f.headers.at(-1)?.notes).toBe("Ultima nota digitata");
    expect(f.context.navigate).toHaveBeenCalledWith("/azienda/marketing/preventivi/quote-a");
  });
  it("riprova un errore allegati dopo la prima creazione senza duplicare il documento", async () => {
    const f = fixture(true, false, true);
    await f.save();
    expect(f.toast.error).toHaveBeenCalledWith("Salvataggio non completato", expect.anything());
    await f.save();
    expect(f.rpc.mock.calls.filter(([name]) => name === "generate_quote_number")).toHaveLength(1);
    expect(f.toast.success).toHaveBeenCalledWith("Preventivo creato");
    expect(f.versionRef.current).toBe(f.version());
  });
  it("non sovrascrive la bozza recuperabile prima della scelta dell'utente", async () => {
    const f = fixture(false);
    f.context.recoverableDraft = { notes: "Lavoro precedente" };
    await f.save();
    expect(f.rpc).not.toHaveBeenCalled();
    expect(f.context.navigate).not.toHaveBeenCalled();
    expect(f.version()).toBe("v0");
  });
  it("conserva input inseriti durante il salvataggio, senza chiudere l'editor", async () => {
    const f = fixture(false);
    (f.context.latestDraftSerializedRef as { current: string }).current = '{"notes":"nota scritta durante la richiesta"}';
    await f.save();
    expect(f.rpc).toHaveBeenCalledTimes(1);
    expect(f.context.clearQuoteDraft).not.toHaveBeenCalled();
    expect(f.context.navigate).not.toHaveBeenCalled();
    expect(f.toast.info).toHaveBeenCalled();
  });
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
