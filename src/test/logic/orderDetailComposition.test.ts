import { readFileSync } from "node:fs";
import ts from "typescript";
import { describe, expect, it } from "vitest";

// Structural regression guard, complementary to the Router/React behavior tests.
// Parse JSX so formatting changes cannot make a duplicated/lost panel pass.
const source = ts.createSourceFile("OrderDetail.tsx", readFileSync("src/pages/azienda/OrderDetail.tsx", "utf8"), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const tags: (ts.JsxOpeningElement | ts.JsxSelfClosingElement)[] = [];
function walk(node: ts.Node) {
  if (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) tags.push(node);
  ts.forEachChild(node, walk);
}
walk(source);
const named = (name: string) => tags.filter(tag => tag.tagName.getText(source) === name);
function value(tag: ts.JsxOpeningElement | ts.JsxSelfClosingElement, attribute: string) {
  const prop = tag.attributes.properties.find(prop => ts.isJsxAttribute(prop) && prop.name.getText(source) === attribute);
  return prop && ts.isJsxAttribute(prop) ? prop.initializer?.getText(source) : undefined;
}
function area(tag: ts.Node) {
  for (let parent = tag.parent; parent; parent = parent.parent) {
    if (ts.isJsxElement(parent) && parent.openingElement.tagName.getText(source) === "TabsContent") {
      return value(parent.openingElement, "value")?.replaceAll('"', "");
    }
  }
}

describe("contratto di composizione del dettaglio commessa", () => {
  it("mostra gli incassi solo nel riepilogo comune, senza una seconda fascia in panoramica", () => {
    expect(named("OrderFinancialOverview")).toHaveLength(1);
    expect(area(named("OrderFinancialOverview")[0])).toBeUndefined();
    expect(named("CassaVerdettoBand")).toHaveLength(0);
    expect(named("EsposizioneCommessa")).toHaveLength(1);
    expect(area(named("EsposizioneCommessa")[0])).toBe("finanza");
  });

  it("ha quattro pannelli senza implementazioni separate mobile/desktop", () => {
    expect(named("TabsContent").map(tag => value(tag, "value")).sort()).toEqual(['"articoli"', '"cantiere"', '"finanza"', '"panoramica"']);
    expect(named("OrderDetailNavigation")).toHaveLength(1);
  });

  it.each([
    ["panoramica", ["CantiereDaOrganizzare", "OrdineCliente", "OrderAssistenzaAlert", "OrderAttachments", "OrdineNote", "OrderCommunicationsCard", "ContrattoAIDialog"]],
    ["cantiere", ["OrderWorkPhases", "OrderSurveysCard", "OrderAssistenzaTab", "AllocazioneOperaiAIDialog", "MezziCommessaCard", "OrdineTempistiche", "LinkedAppointments", "LinkedTasks", "OrdineRapportiniCampo", "OrdineFotoCantiere", "WhatsAppActivityFeed", "TimelineCantiere", "OrderAcceptanceReports", "CantiereViewNav", "OreEPersone", "OrderResourceStatistics", "DaApprovareCommessa", "CollaudiDalCantiere"]],
    ["articoli", ["OrderMeasureControl", "MaterialiPerFase", "OrderProcurementTools", "OrderUsciteCard", "LinkedPurchaseOrdersCard", "OrderSerialsTrackingCard", "OrderBolleDdtCard", "OrderFattureFornitoriCard"]],
    ["finanza", ["OrderEconomicsSummary", "OrdineEconomico", "EsposizioneCommessa", "RitenuteTab", "OrdineVariazione", "SupplierPaymentsCard", "OrderErrors", "OrdineSAL"]],
  ] as const)("preserva ogni funzione una sola volta nell'area %s", (expected, components) => {
    for (const component of components) {
      const matches = named(component);
      // I mezzi stanno solo in Lavorazioni: «Ore e persone» parla di ore, non di mezzi.
      expect(matches, component).toHaveLength(1);
      expect(area(matches[0]), component).toBe(expected);
    }
  });

  it("non duplica le comunicazioni e rimuove i contenitori ambigui", () => {
    expect(named("OrderActivityFeed")).toHaveLength(0);
    const overview = named("TabsContent").find(tag => value(tag, "value") === '"panoramica"')!.parent.getText(source);
    expect(overview).not.toContain("Organizzazione del cantiere");
    expect(overview).not.toContain("Note e strumenti della commessa");
    expect(overview).not.toContain("Comunicazioni e storico");
    expect(named("OrderCommunicationsCard")).toHaveLength(1);
    expect(value(named("OrderAttachments")[0], "actions")).toContain("ContrattoAIDialog");
  });

  it("non scollega il piano rate dal SAL operativo", () => {
    const sal = named("OrdineSAL")[0];
    expect(value(sal, "showPaymentProgress")).toBe("{false}");
    expect(value(sal, "installments")).toBe("{displayInstallments}");
    expect(value(sal, "financingCost")).toContain('order.payment_type === "financing"');
  });

  it("sposta gli acquisti nella vista dedicata senza duplicarli negli articoli", () => {
    // Un solo elenco degli articoli: la vista per fase, con la finestra per aggiungere e modificare.
    expect(named("OrdineArticoli")).toHaveLength(0);
    expect(value(named("MaterialiPerFase")[0], "editor")).toContain("addItemMutation.mutate");
    expect(named("OrderWorkspaceNav")).toHaveLength(2);
  });

  it("riepilogo, stato e azioni sono unici e precedono tutte le tab", () => {
    for (const name of ["OrderCommessaSummary", "OrderStatusWorkflow", "OrderQuickActions"]) {
      expect(named(name)).toHaveLength(1);
      expect(area(named(name)[0])).toBeUndefined();
      expect(named(name)[0].pos).toBeLessThan(named("OrderDetailNavigation")[0].pos);
    }
    const actions = named("OrderQuickActions")[0];
    expect(value(actions, "onCreateTask")).toContain("setTaskDialogOpen(true)");
    expect(value(actions, "onApplyPlaybook")).toContain("handleApplyPlaybook");
    expect(value(actions, "onManagePlaybook")).toContain("setPlaybookEditorOpen(true)");
    expect(value(actions, "onCreateInvoice")).toContain("permissions.canViewBilling");
    expect(value(actions, "onCreateInvoice")).toContain("isNativeBilling && !permissions.solaLettura");
    expect(value(actions, "customer")).toContain("order.client_phone");
    expect(value(actions, "customer")).toContain("order.client_email");
    expect(value(named("OrderStatusWorkflow")[0], "onStatusChange")).toContain("permissions.canEditOrders");
    expect(value(named("OrderStatusWorkflow")[0], "modelKey")).toBe("{order.tipo_lavoro}");
    expect(value(named("OrderStatusWorkflow")[0], "version")).toBe("{order.version}");
  });

  it("mantiene i dialoghi di firma, documenti e creazione fiscale fuori dalle tab", () => {
    for (const component of ["OrdineFirma", "OrderFilesDialog", "OrderNotesDialog", "CreaFatturaDialog", "CreaDDTDialog", "CreaProformaDialog", "CreaNotaCreditoDialog", "TaskDialog", "PlaybookEditorDialog"]) {
      expect(named(component), component).toHaveLength(1);
      expect(area(named(component)[0]), component).toBeUndefined();
    }
  });

  it("gli allegati non diventano modificabili per chi non può editare la commessa", () => {
    expect(value(named("OrderAttachments")[0], "editable")).toBe("{permissions.canEditOrders}");
  });
  it("le fasi precedono la pianificazione visibile e le attività secondarie", () => {
    expect(named("OrderWorkPhases")[0].pos).toBeLessThan(named("OrdineTempistiche")[0].pos);
    expect(named("OrdineTempistiche")[0].pos).toBeLessThan(named("LinkedTasks")[0].pos);
    expect(named("LinkedAppointments")[0].pos).toBeLessThan(named("LinkedTasks")[0].pos);
    expect(value(named("LinkedTasks")[0], "editable")).toBe("{permissions.canEditOrders}");
    expect(value(named("LinkedAppointments")[0], "editable")).toBe("{permissions.canEditOrders}");
    expect(value(named("OrdineTempistiche")[0], "workStartTime")).toBe("{order.work_start_time}");
    expect(value(named("OrdineTempistiche")[0], "updatedAt")).toBe("{order.updated_at}");
    const planning = tags.find(tag => value(tag, "id") === '"section-pianificazione"')!;
    expect(planning.tagName.getText(source)).toBe("section");
    for (let parent = planning.parent; parent; parent = parent.parent)
      if (ts.isJsxElement(parent)) expect(parent.openingElement.tagName.getText(source)).not.toBe("details");
  });
});
