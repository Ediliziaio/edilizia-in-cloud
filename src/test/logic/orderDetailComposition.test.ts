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
  it("mantiene i campi aggiuntivi sotto il cliente e sposta le figure nell’organizzazione del cantiere", () => {
    const assignments = named("IncarichiCantiere");
    const fields = named("EntityCustomFieldsSection");
    expect(assignments).toHaveLength(1);
    expect(fields).toHaveLength(1);
    // Un solo elemento condiviso dai due layout Cantiere (commessa e contratto).
    let declaration: ts.Node | undefined = assignments[0].parent;
    while (declaration && !ts.isVariableDeclaration(declaration)) declaration = declaration.parent;
    expect(declaration && ts.isVariableDeclaration(declaration) ? declaration.name.getText(source) : undefined).toBe("figureResponsabilita");
    expect(declaration?.getText(source)).toContain("section-figure-responsabilita");
    expect(area(fields[0])).toBe("panoramica");
    expect(named("OrdineCliente")[0].pos).toBeLessThan(fields[0].pos);
    expect(fields[0].pos).toBeLessThan(named("OrderAttachments")[0].pos);
    function column(node: ts.Node): ts.Node | undefined {
      for (let parent = node.parent; parent; parent = parent.parent) {
        if (ts.isJsxElement(parent) && parent.openingElement.tagName.getText(source) === "div") return parent;
      }
    }
    expect(value(named("OrderWorkPhases")[0], "organizationContent")).toBe("{figureResponsabilita}");
    const overview = named("TabsContent").find(tag => value(tag, "value") === '"panoramica"')!.parent.getText(source);
    const site = named("TabsContent").find(tag => value(tag, "value") === '"cantiere"')!.parent.getText(source);
    expect(overview).not.toContain("figureResponsabilita");
    expect(site).toContain('aria-label="Organizzazione del contratto"');
    expect(site).toContain("{figureResponsabilita}");
    expect(column(fields[0])).toBe(column(named("OrdineCliente")[0]));
    expect(value(assignments[0], "companyId")).toBe("{companyId}");
    expect(value(assignments[0], "orderId")).toBe("{id}");
    expect(value(fields[0], "entityType")).toBe('"order"');
    expect(value(fields[0], "entityId")).toBe("{id}");
  });

  it("monta i sopralluoghi soltanto nella nuova vista; le attività operative non stanno più in Lavorazioni", () => {
    const surveys = named("OrderSurveysCard");
    expect(surveys).toHaveLength(1);
    let branch: ts.Node | undefined = surveys[0].parent;
    while (branch && !ts.isBinaryExpression(branch)) branch = branch.parent;
    expect(branch?.getText(source)).toContain('vistaCantiere === "sopralluoghi"');
    expect(named("LinkedTasks")).toHaveLength(0);
  });

  it("mostra gli incassi solo nel riepilogo comune, senza una seconda fascia in panoramica", () => {
    expect(named("OrderFinancialOverview")).toHaveLength(1);
    expect(area(named("OrderFinancialOverview")[0])).toBeUndefined();
    for (let parent = named("OrderFinancialOverview")[0].parent; parent; parent = parent.parent) {
      if (ts.isJsxElement(parent)) expect(parent.openingElement.tagName.getText(source)).not.toBe("OrderHeaderSummary");
    }
    expect(named("OrderHeaderSummary")).toHaveLength(0);
    expect(named("OrderFinancialOverview")[0].pos).toBeLessThan(named("OrderDetailNavigation")[0].pos);
    expect(named("CassaVerdettoBand")).toHaveLength(0);
    expect(named("EsposizioneCommessa")).toHaveLength(1);
    expect(area(named("EsposizioneCommessa")[0])).toBe("finanza");
  });

  it("ha quattro pannelli senza implementazioni separate mobile/desktop", () => {
    expect(named("TabsContent").map(tag => value(tag, "value")).sort()).toEqual(['"articoli"', '"cantiere"', '"finanza"', '"panoramica"']);
    expect(named("OrderDetailNavigation")).toHaveLength(1);
  });

  it("usa lo stesso effetto in ogni scheda e vista, senza animare intestazione e navigazione", () => {
    expect(named("OrderViewTransition").map(tag => value(tag, "viewKey"))).toEqual([
      '"panoramica"', "{activeMaterialiView}", "{activeEconomiaView}", "{vistaCantiere}",
    ]);
    for (const panel of named("TabsContent")) expect(value(panel, "className")).toContain("order-detail-tab-panel");
    for (const name of ["OrderFinancialOverview", "OrderCommessaSummary", "OrderDetailNavigation", "OrderWorkspaceNav", "CantiereViewNav"]) {
      for (const tag of named(name)) {
        for (let parent = tag.parent; parent; parent = parent.parent) {
          if (ts.isJsxElement(parent)) expect(parent.openingElement.tagName.getText(source)).not.toBe("OrderViewTransition");
        }
      }
    }
  });

  it.each([
    ["panoramica", ["CantiereDaOrganizzare", "OrdineCliente", "OrdineTempistiche", "LinkedAppointments", "OrderAssistenzaAlert", "OrderAttachments", "OrdineNote", "ContrattoAIDialog"]],
    ["cantiere", ["OrderWorkPhases", "OrderSurveysCard", "OrderAssistenzaTab", "PianoMezziCantiere", "OrdineRapportiniCampo", "OrdineFotoCantiere", "WhatsAppActivityFeed", "TimelineCantiere", "OrderAcceptanceReports", "CantiereViewNav", "OreEPersone", "OrderResourceStatistics", "DaApprovareCommessa", "CollaudiDalCantiere"]],
    ["articoli", ["OrderMeasureControl", "MaterialiPerFase", "OrderProcurementTools", "OrderUsciteCard", "LinkedPurchaseOrdersCard", "OrderSerialsTrackingCard", "OrderBolleDdtCard", "OrderFattureFornitoriCard", "OrderCostiCommessaCard"]],
    ["finanza", ["OrderEconomicsSummary", "OrdineEconomico", "EsposizioneCommessa", "RitenuteTab", "OrdineVariazione", "QuadroPagamentiCommessa", "OrderErrors", "OrdineSAL"]],
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
    expect(named("OrderCommunicationsCard")).toHaveLength(0);
    expect(overview).not.toContain("Comunicazioni cliente");
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
    for (let parent = named("OrderCommessaSummary")[0].parent; parent; parent = parent.parent) {
      if (ts.isJsxElement(parent)) {
        expect(parent.openingElement.tagName.getText(source)).not.toBe("details");
        expect(parent.openingElement.tagName.getText(source)).not.toBe("OrderHeaderSummary");
      }
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
  it("l'AI della commessa è un solo menu in testa, «Silvio AI», non un blocco in Lavorazioni", () => {
    expect(named("SilvioCommessa")).toHaveLength(1);
    expect(named("AllocazioneOperaiAIDialog")).toHaveLength(0);
    expect(named("ChiediASilvio")).toHaveLength(0);
    expect(named("RapportiniUfficio")).toHaveLength(1);
  });
  it("date e appuntamenti stanno in Panoramica, visibili e modificabili", () => {
    expect(named("OrdineCliente")[0].pos).toBeLessThan(named("OrdineTempistiche")[0].pos);
    expect(named("OrdineTempistiche")[0].pos).toBeLessThan(named("LinkedAppointments")[0].pos);
    expect(value(named("LinkedAppointments")[0], "editable")).toBe("{permissions.canEditOrders}");
    expect(value(named("OrdineTempistiche")[0], "workStartTime")).toBe("{order.work_start_time}");
    expect(value(named("OrdineTempistiche")[0], "updatedAt")).toBe("{order.updated_at}");
    const planning = tags.find(tag => value(tag, "id") === '"section-pianificazione"')!;
    expect(planning.tagName.getText(source)).toBe("section");
    for (let parent = planning.parent; parent; parent = parent.parent)
      if (ts.isJsxElement(parent)) expect(parent.openingElement.tagName.getText(source)).not.toBe("details");
  });
});
