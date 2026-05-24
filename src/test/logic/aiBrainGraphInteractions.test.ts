import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const source = readFileSync(
  resolve(process.cwd(), "src/components/ai/AIBrainGraph.tsx"),
  "utf8",
);
const semanticSearchSource = readFileSync(
  resolve(process.cwd(), "src/components/ai/BrainSemanticSearch.tsx"),
  "utf8",
);

describe("AI brain graph interaction contract", () => {
  it("keeps the SVG brain graph zoomable and pannable", () => {
    expect(source).toContain("handleWheelZoom");
    expect(source).toContain("onWheel={handleWheelZoom}");
    expect(source).toContain("handlePanStart");
    expect(source).toContain("onPointerDown={handlePanStart}");
    expect(source).toContain("onPointerMove={handlePanMove}");
    expect(source).toContain("onPointerUp={handlePanEnd}");
    expect(source).toContain("touchAction: \"none\"");
  });

  it("exposes explicit controls for zoom, fit, reset, fullscreen, and settings", () => {
    expect(source).toContain("zoomIn:");
    expect(source).toContain("zoomOut:");
    expect(source).toContain("aria-label=\"Zoom avanti\"");
    expect(source).toContain("aria-label=\"Zoom indietro\"");
    expect(source).toContain("aria-label=\"Adatta grafo alla vista\"");
    expect(source).toContain("aria-label=\"Reset vista grafo\"");
    expect(source).toContain("aria-label=\"Modalita fullscreen grafo\"");
    expect(source).toContain("aria-label=\"Opzioni avanzate grafo\"");
  });

  it("keeps node selection separate from canvas pan gestures", () => {
    expect(source).toContain("data-brain-node=\"true\"");
    expect(source).toContain("didPanRef.current");
    expect(source).toContain("event.stopPropagation();");
  });

  it("shows every enabled persona and puts Silvio at the center of the graph", () => {
    expect(source).toContain("type?: \"persona\" | \"memory\" | \"silvio\"");
    expect(source).toContain("const graphPersonas = (filterPersona");
    expect(source).toContain("SILVIO_NODE_ID = \"silvio_orchestrator\"");
    expect(source).toContain("label: \"Silvio\"");
    expect(source).toContain("type: \"silvio\"");
    expect(source).toContain("e_silvio_");
    expect(source).toContain("guida tutte le personas");
    expect(source).toContain("isOrchestratorPersonaKey");
  });

  it("uses a visual fullscreen fallback when the browser Fullscreen API is blocked", () => {
    expect(source).toContain("setFullscreen(true)");
    expect(source).toContain("requestFullscreen");
    expect(source).toContain("fixed inset-0 z-[120] h-screen w-screen");
    expect(source).toContain("document.body.style.overflow = \"hidden\"");
  });

  it("supports an Earth-like rotating globe view for dense graphs", () => {
    expect(source).toContain("GLOBE_CAMERA_DISTANCE");
    expect(source).toContain("rotateStartRef");
    expect(source).toContain("setCamera");
    expect(source).toContain("requestAnimationFrame");
    expect(source).toContain("MAX_RENDERED_EDGES_GLOBE");
    expect(source).toContain("visibleEdges");
    expect(source).toContain("Trascina lo spazio per ruotare il globo");
    expect(source).toContain("Globo 3D");
  });

  it("exposes graph integrity checks for node and edge correctness", () => {
    expect(source).toContain("graphIntegrity");
    expect(source).toContain("missingEdges");
    expect(source).toContain("disconnectedNodes");
    expect(source).toContain("memoriesWithoutPersonaEdge");
    expect(source).toContain("personasWithoutMemories");
    expect(source).toContain("QA rete OK");
  });

  it("keeps the demo brain coverage rich across the real persona catalog", () => {
    expect(source).toContain("DEMO_AI_PERSONAS");
    expect(source).toContain("resolveDemoPersonaKey");
    expect(source).toContain("DEMO_MIN_MEMORIES_PER_PERSONA");
    expect(source).toContain("demoCoverageMemories");
    expect(source).toContain("demo_coverage");
  });

  it("does not leave the demo brain stuck on the loading screen", () => {
    expect(source).toContain("DEMO_LOADING_GRACE_MS");
    expect(source).toContain("demoLoadingGraceElapsed");
    expect(source).toContain("demoFallbackReady");
    expect(source).toContain("isInitialGraphLoading");
    expect(source).toContain("if (error) throw error;");
  });

  it("keeps the brain toolbar inside narrow mobile viewports", () => {
    expect(source).toContain("flex flex-col gap-2 pointer-events-none sm:flex-row");
    expect(source).toContain("flex max-w-full flex-wrap items-center gap-1.5");
    expect(source).toContain("className=\"w-40 sm:w-auto\"");
    expect(semanticSearchSource).toContain("relative w-full max-w-full");
    expect(semanticSearchSource).toContain("focused ? \"sm:w-60\" : \"sm:w-44\"");
    expect(semanticSearchSource).toContain("h-7 w-full");
    expect(semanticSearchSource).toContain("sm:w-44");
  });

  it("turns graph data into memory quality and operational intelligence", () => {
    expect(source).toContain("computeMemoryQualityReport");
    expect(source).toContain("MEMORY_STALE_DAYS");
    expect(source).toContain("duplicateClusters");
    expect(source).toContain("qualityActionQueue");
    expect(source).toContain("computeKnowledgeCommunities");
    expect(source).toContain("Community intelligence");
    expect(source).toContain("Prossime azioni");
    expect(source).toContain("Affidabilita memoria");
  });
});
