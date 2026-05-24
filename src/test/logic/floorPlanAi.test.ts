import { describe, expect, it } from "vitest";
import {
  FLOOR_PLAN_RENDER_MODULE,
  buildFloorPlanGenerationBrief,
  buildFloorPlanExportManifest,
  buildFloorPlanCrmPayload,
  buildFloorPlanDrawingContext,
  buildFloorPlanPhotoReviewQuestions,
  buildFloorPlanRenderPackage,
  buildFloorPlanRoomRenderScene,
  buildFloorPlanSourceScan,
  calculateFloorPlanMetrics,
  calibrateFloorPlanScale,
  calibrateFloorPlanScaleFromPoints,
  createFloorPlanVariant,
  createFloorPlanRevision,
  createInitialFloorPlanFromSketch,
  estimateFloorPlanQuoteItems,
  exportFloorPlanToDxf,
  exportFloorPlanToSvg,
  floorPlanLayers,
  floorPlanEditorTools,
  addFloorPlanOpening,
  addFloorPlanFurniture,
  buildFloorPlanAiSuggestions,
  buildFloorPlanWorkStudio,
  floorPlanFurnitureCatalog,
  measureFloorPlanDistance,
  moveFloorPlanFurniture,
  moveFloorPlanRoom,
  rotateFloorPlanFurniture,
  runFloorPlanQualityChecks,
  updateFloorPlanRoom,
} from "@/lib/render/floorPlanAi";

describe("floor plan render ai", () => {
  it("espone il nuovo modulo planimetrie con percorso dedicato", () => {
    expect(FLOOR_PLAN_RENDER_MODULE.id).toBe("planimetrie");
    expect(FLOOR_PLAN_RENDER_MODULE.path).toBe("/azienda/render/planimetrie");
    expect(FLOOR_PLAN_RENDER_MODULE.newPath).toBe("/azienda/render/planimetrie/new");
  });

  it("crea una planimetria editabile da uno sketch o immagine caricata", () => {
    const plan = createInitialFloorPlanFromSketch({
      fileName: "schizzo-cantiere.jpg",
      sourceType: "hand_sketch",
    });

    expect(plan.source.fileName).toBe("schizzo-cantiere.jpg");
    expect(plan.rooms.length).toBeGreaterThanOrEqual(5);
    expect(plan.walls.length).toBeGreaterThanOrEqual(12);
    expect(plan.openings.some((opening) => opening.type === "door")).toBe(true);
    expect(plan.openings.some((opening) => opening.type === "window")).toBe(true);
    expect(plan.outputModes).toEqual(expect.arrayContaining(["2d_cad", "3d_dollhouse", "render_ai"]));
  });

  it("calcola metriche operative per progettista e preventivo", () => {
    const plan = createInitialFloorPlanFromSketch();
    const metrics = calculateFloorPlanMetrics(plan);

    expect(metrics.totalAreaMq).toBeGreaterThan(60);
    expect(metrics.roomCount).toBe(plan.rooms.length);
    expect(metrics.wallLinearMeters).toBeGreaterThan(35);
    expect(metrics.openingCount).toBe(plan.openings.length);
    expect(metrics.estimatedRevisionMinutes).toBeLessThanOrEqual(45);
  });

  it("mantiene geometria e cambia solo finiture quando genera una variante stile", () => {
    const plan = createInitialFloorPlanFromSketch();
    const variant = createFloorPlanVariant(plan, "scandi");

    expect(variant.id).not.toBe(plan.id);
    expect(variant.rooms.map((room) => room.id)).toEqual(plan.rooms.map((room) => room.id));
    expect(variant.rooms.map((room) => room.finish)).not.toEqual(plan.rooms.map((room) => room.finish));
    expect(variant.style).toBe("scandi");
  });

  it("prepara strumenti e brief AI senza vicoli ciechi nel flusso", () => {
    const plan = createInitialFloorPlanFromSketch();
    const brief = buildFloorPlanGenerationBrief(plan);

    expect(floorPlanEditorTools.map((tool) => tool.id)).toEqual(
      expect.arrayContaining(["select", "wall", "room", "door", "window", "measure", "furniture", "comment"]),
    );
    expect(brief).toContain("schizzo");
    expect(brief).toContain("2D CAD");
    expect(brief).toContain("3D");
  });

  it("ricalibra scala e aggiorna metriche con una quota reale", () => {
    const plan = createInitialFloorPlanFromSketch();
    const calibrated = calibrateFloorPlanScale(plan, {
      measuredUnits: 16,
      knownLengthMeters: 4,
      label: "parete soggiorno",
    });
    const metrics = calculateFloorPlanMetrics(calibrated);

    expect(calibrated.source.scaleStatus).toBe("confirmed");
    expect(calibrated.source.metersPerUnit).toBe(0.25);
    expect(metrics.totalAreaMq).toBeGreaterThan(calculateFloorPlanMetrics(plan).totalAreaMq);
    expect(calibrated.calibration?.label).toBe("parete soggiorno");
  });

  it("espone layer, controlli qualita, computo ed export tecnico", () => {
    const plan = createInitialFloorPlanFromSketch();
    const qa = runFloorPlanQualityChecks(plan);
    const quoteItems = estimateFloorPlanQuoteItems(plan);
    const manifest = buildFloorPlanExportManifest(plan);
    const svg = exportFloorPlanToSvg(plan);
    const dxf = exportFloorPlanToDxf(plan);

    expect(floorPlanLayers.map((layer) => layer.id)).toEqual(
      expect.arrayContaining(["rooms", "walls", "openings", "dimensions", "furniture", "notes"]),
    );
    expect(qa.some((issue) => issue.code === "scale_not_confirmed")).toBe(true);
    expect(quoteItems.some((item) => item.category === "finiture" && item.quantity > 0)).toBe(true);
    expect(manifest.outputs.map((output) => output.type)).toEqual(expect.arrayContaining(["svg", "dxf", "pdf", "json"]));
    expect(svg).toContain("<svg");
    expect(svg).toContain("Soggiorno cucina");
    expect(dxf).toContain("SECTION");
    expect(dxf).toContain("LINE");
  });

  it("crea revisioni e payload CRM collegabili al cliente", () => {
    const plan = createInitialFloorPlanFromSketch();
    const revised = createFloorPlanRevision(plan, {
      note: "Aggiunta quota reale e verifica bagno.",
      authorName: "Arch. Demo",
    });
    const payload = buildFloorPlanCrmPayload(revised, {
      contactId: "contact-1",
      opportunityId: "opp-1",
    });

    expect(revised.revisions).toHaveLength(1);
    expect(revised.revisions[0].version).toBe("v1");
    expect(payload.contact_id).toBe("contact-1");
    expect(payload.opportunity_id).toBe("opp-1");
    expect(payload.summary).toContain("87.6 mq");
  });

  it("misura due punti cliccati e calibra la scala dalla quota sul canvas", () => {
    const plan = createInitialFloorPlanFromSketch();
    const measuredUnits = measureFloorPlanDistance({ x: 10, y: 10 }, { x: 26, y: 10 });
    const calibrated = calibrateFloorPlanScaleFromPoints(plan, {
      from: { x: 10, y: 10 },
      to: { x: 26, y: 10 },
      knownLengthMeters: 4,
      label: "quota cliccata",
    });

    expect(measuredUnits).toBe(16);
    expect(calibrated.source.scaleStatus).toBe("confirmed");
    expect(calibrated.source.metersPerUnit).toBe(0.25);
    expect(calibrated.calibration?.measuredUnits).toBe(16);
    expect(calibrated.calibration?.label).toBe("quota cliccata");
  });

  it("aggiorna una stanza selezionata senza perdere geometria e migliora il QA", () => {
    const plan = createInitialFloorPlanFromSketch();
    const updated = updateFloorPlanRoom(plan, "utility", {
      name: "Locale tecnico",
      usage: "lavanderia e pompa di calore",
      finish: "gres tecnico R11",
      confidence: 0.9,
    });

    expect(updated.rooms.find((room) => room.id === "utility")?.name).toBe("Locale tecnico");
    expect(updated.rooms.find((room) => room.id === "utility")?.confidence).toBe(0.9);
    expect(updated.walls).toEqual(plan.walls);
    expect(runFloorPlanQualityChecks(updated).some((issue) => issue.code === "low_confidence_rooms")).toBe(false);
  });

  it("aggiunge aperture agganciate al muro e segnala geometrie incoerenti", () => {
    const plan = createInitialFloorPlanFromSketch();
    const withOpening = addFloorPlanOpening(plan, {
      type: "window",
      wallId: "w-ext-n",
      x: 42,
      y: 8,
      width: 10,
    });
    const broken = {
      ...withOpening,
      rooms: [
        ...withOpening.rooms,
        {
          ...withOpening.rooms[0],
          id: "overlap-test",
          name: "Stanza sovrapposta",
          x: withOpening.rooms[0].x + 2,
          y: withOpening.rooms[0].y + 2,
        },
      ],
      openings: [
        ...withOpening.openings,
        { id: "bad-window", type: "window" as const, wallId: "w-ext-n", x: 90, y: 40, width: 12 },
      ],
    };
    const qa = runFloorPlanQualityChecks(broken);

    expect(withOpening.openings).toHaveLength(plan.openings.length + 1);
    expect(withOpening.openings.at(-1)?.wallId).toBe("w-ext-n");
    expect(qa.some((issue) => issue.code === "overlapping_rooms")).toBe(true);
    expect(qa.some((issue) => issue.code === "openings_off_wall")).toBe(true);
  });

  it("aggiunge arredi da catalogo dentro la stanza e aggiorna il computo arredo", () => {
    const plan = createInitialFloorPlanFromSketch();
    const withFurniture = addFloorPlanFurniture(plan, {
      catalogItemId: "island-kitchen",
      roomId: "living",
    });
    const furniture = withFurniture.furniture.at(-1);
    const quoteItems = estimateFloorPlanQuoteItems(withFurniture);

    expect(floorPlanFurnitureCatalog.some((item) => item.id === "island-kitchen")).toBe(true);
    expect(withFurniture.furniture).toHaveLength(plan.furniture.length + 1);
    expect(furniture?.label).toBe("Isola cucina");
    expect(furniture?.roomId).toBe("living");
    expect(furniture?.x).toBeGreaterThanOrEqual(9);
    expect(furniture?.x).toBeLessThanOrEqual(52);
    expect(quoteItems.some((item) => item.category === "arredo" && item.total > 0)).toBe(true);
  });

  it("genera suggerimenti AI operativi per arredo, QA e preventivazione", () => {
    const plan = createInitialFloorPlanFromSketch();
    const suggestions = buildFloorPlanAiSuggestions(plan);

    expect(suggestions.map((suggestion) => suggestion.type)).toEqual(expect.arrayContaining(["furniture", "quote", "workflow"]));
    expect(suggestions.some((suggestion) => suggestion.priority === "high")).toBe(true);
    expect(suggestions.some((suggestion) => suggestion.actionLabel.includes("arredo"))).toBe(true);
  });

  it("prepara uno studio planimetria collegato a preventivo, CRM e gestione lavoro", () => {
    const plan = calibrateFloorPlanScale(createInitialFloorPlanFromSketch(), {
      measuredUnits: 16,
      knownLengthMeters: 4,
      label: "parete soggiorno",
    });
    const studio = buildFloorPlanWorkStudio(plan, {
      contactId: "contact-demo",
      opportunityId: "opp-demo",
    });

    expect(studio.crm.contactId).toBe("contact-demo");
    expect(studio.crm.opportunityId).toBe("opp-demo");
    expect(studio.quote.total).toBeGreaterThan(20000);
    expect(studio.quote.marginEstimate).toBeGreaterThan(0);
    expect(studio.phases.map((phase) => phase.id)).toEqual(expect.arrayContaining(["rilievo", "preventivo", "cantiere"]));
    expect(studio.documentLinks).toEqual(expect.arrayContaining(["planimetria-json", "computo", "preventivo-crm"]));
  });

  it("sposta un arredo con snap e lo mantiene dentro la stanza", () => {
    const plan = createInitialFloorPlanFromSketch();
    const moved = moveFloorPlanFurniture(plan, {
      furnitureId: "sofa",
      delta: { x: 2.4, y: 1.6 },
      snap: true,
    });
    const sofa = moved.furniture.find((item) => item.id === "sofa");
    const living = moved.rooms.find((room) => room.id === "living");

    expect(sofa?.x).toBe(16);
    expect(sofa?.y).toBe(18);
    expect(sofa?.x).toBeGreaterThanOrEqual(living?.x ?? 0);
    expect((sofa?.x ?? 0) + (sofa?.width ?? 0)).toBeLessThanOrEqual((living?.x ?? 0) + (living?.width ?? 0));

    const clamped = moveFloorPlanFurniture(plan, {
      furnitureId: "sofa",
      delta: { x: 999, y: 999 },
      snap: true,
    });
    const clampedSofa = clamped.furniture.find((item) => item.id === "sofa");
    expect((clampedSofa?.x ?? 0) + (clampedSofa?.width ?? 0)).toBeLessThanOrEqual((living?.x ?? 0) + (living?.width ?? 0));
    expect((clampedSofa?.y ?? 0) + (clampedSofa?.height ?? 0)).toBeLessThanOrEqual((living?.y ?? 0) + (living?.height ?? 0));
  });

  it("sposta una stanza con i suoi arredi e impedisce di uscire dalla tavola", () => {
    const plan = createInitialFloorPlanFromSketch();
    const moved = moveFloorPlanRoom(plan, {
      roomId: "living",
      delta: { x: 3.2, y: 2.7 },
      snap: true,
      moveContents: true,
    });

    expect(moved.rooms.find((room) => room.id === "living")?.x).toBe(12);
    expect(moved.rooms.find((room) => room.id === "living")?.y).toBe(12);
    expect(moved.furniture.find((item) => item.id === "sofa")?.x).toBe(17);
    expect(moved.furniture.find((item) => item.id === "sofa")?.y).toBe(19);

    const clamped = moveFloorPlanRoom(plan, {
      roomId: "living",
      delta: { x: -999, y: -999 },
      snap: true,
      moveContents: true,
    });
    const clampedRoom = clamped.rooms.find((room) => room.id === "living");
    expect(clampedRoom?.x).toBe(1);
    expect(clampedRoom?.y).toBe(1);
  });

  it("ruota un arredo con step controllato per comandi CAD", () => {
    const plan = createInitialFloorPlanFromSketch();
    const rotated = rotateFloorPlanFurniture(plan, {
      furnitureId: "sofa",
      degrees: 91,
      snapDegrees: 15,
    });

    expect(rotated.furniture.find((item) => item.id === "sofa")?.rotation).toBe(90);
  });

  it("diagnostica una foto caricata e prepara correzioni scanner AI", () => {
    const scan = buildFloorPlanSourceScan({
      fileName: "foto-storta-cantiere.jpg",
      sourceType: "photo",
      mimeType: "image/jpeg",
      sizeBytes: 1_900_000,
      width: 900,
      height: 1200,
    });

    expect(scan.score).toBeLessThan(85);
    expect(scan.corrections.map((correction) => correction.id)).toEqual(
      expect.arrayContaining(["auto_crop", "perspective_fix", "contrast_boost", "line_vectorization"]),
    );
    expect(scan.layers.map((layer) => layer.id)).toEqual(expect.arrayContaining(["original", "enhanced", "detected", "cad"]));
    expect(scan.issues.some((issue) => issue.code === "low_resolution_photo")).toBe(true);
    expect(scan.issues.some((issue) => issue.code === "scale_missing")).toBe(true);
  });

  it("collega la scansione al piano e genera domande di revisione operativa", () => {
    const plan = createInitialFloorPlanFromSketch({
      fileName: "rilievo-telefono.jpg",
      sourceType: "photo",
      mimeType: "image/jpeg",
      sizeBytes: 2_400_000,
      width: 1280,
      height: 960,
    });
    const questions = buildFloorPlanPhotoReviewQuestions(plan);
    const qa = runFloorPlanQualityChecks(plan);
    const brief = buildFloorPlanGenerationBrief(plan);

    expect(plan.source.scan?.layers.some((layer) => layer.id === "enhanced")).toBe(true);
    expect(questions.map((question) => question.id)).toEqual(
      expect.arrayContaining(["confirm-scale", "confirm-openings", "confirm-room-labels"]),
    );
    expect(qa.some((issue) => issue.code === "photo_scan_review")).toBe(true);
    expect(brief).toContain("raddrizzamento prospettico");
  });

  it("prepara un pacchetto render cliente con materiali, camere e output commerciali", () => {
    const plan = createInitialFloorPlanFromSketch();
    const renderPackage = buildFloorPlanRenderPackage(plan, {
      style: "warm_modern",
      selectedRoomId: "living",
    });

    expect(renderPackage.style).toBe("warm_modern");
    expect(renderPackage.materials.find((material) => material.roomId === "living")?.floorLabel).toContain("rovere");
    expect(renderPackage.cameraPresets.map((preset) => preset.id)).toEqual(
      expect.arrayContaining(["top_3d", "dollhouse", "room_focus", "client_before_after"]),
    );
    expect(renderPackage.clientOutputs.map((output) => output.id)).toEqual(
      expect.arrayContaining(["dollhouse-3d", "room-renders", "client-board", "quote-linked"]),
    );
    expect(renderPackage.wowScore).toBeGreaterThanOrEqual(80);
  });

  it("genera una scena stanza con arredi coerenti e prompt render AI", () => {
    const plan = createInitialFloorPlanFromSketch();
    const scene = buildFloorPlanRoomRenderScene(plan, {
      roomId: "bath",
      style: "luxury",
    });

    expect(scene.roomName).toBe("Bagno");
    expect(scene.furnitureLabels).toEqual(expect.arrayContaining(["Mobile bagno", "Doccia walk-in"]));
    expect(scene.materials.wallLabel).toContain("marmo");
    expect(scene.prompt).toContain("vista dollhouse");
    expect(scene.prompt).toContain("Bagno");
  });

  it("genera un contesto operativo chiaro per disegnare nel CAD", () => {
    const plan = createInitialFloorPlanFromSketch();
    const context = buildFloorPlanDrawingContext(plan, {
      activeTool: "wall",
      selectedRoomId: "living",
      snapEnabled: true,
      zoom: 115,
      pointer: { x: 12.4, y: 8.9 },
    });

    expect(context.tool.label).toBe("Muro");
    expect(context.headline).toContain("Disegna");
    expect(context.microSteps).toEqual(expect.arrayContaining(["Clicca il punto iniziale", "Trascina fino al punto finale"]));
    expect(context.canvasStatus).toEqual(expect.objectContaining({
      scale: plan.source.scale,
      snap: "Snap ON",
      zoom: "115%",
      coordinates: "X 12.4 · Y 8.9",
      selection: "Soggiorno cucina",
    }));
    expect(context.warnings.some((warning) => warning.includes("scala"))).toBe(true);
  });

  it("guida calibrazione quote e arredo senza lasciare stati vuoti", () => {
    const plan = createInitialFloorPlanFromSketch();
    const measureContext = buildFloorPlanDrawingContext(plan, {
      activeTool: "measure",
      selectedRoomId: "living",
      snapEnabled: false,
      zoom: 90,
      calibrationPointCount: 1,
    });
    const furnitureContext = buildFloorPlanDrawingContext(plan, {
      activeTool: "furniture",
      selectedRoomId: "living",
      selectedFurnitureId: "sofa",
      snapEnabled: true,
      zoom: 100,
    });

    expect(measureContext.status).toBe("needs_scale");
    expect(measureContext.nextActionLabel).toBe("Clicca secondo punto");
    expect(measureContext.instruction).toContain("secondo punto");
    expect(furnitureContext.status).toBe("ready");
    expect(furnitureContext.selectedLabel).toBe("Divano");
    expect(furnitureContext.nextActionLabel).toBe("Aggiungi arredo");
  });
});
