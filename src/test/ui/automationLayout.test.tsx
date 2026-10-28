import { StrictMode } from "react";
import { createPortal } from "react-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { Position, type EdgeProps } from "@xyflow/react";

const flow = vi.hoisted(() => ({
  ready: true,
  nodes: [
    { id: "t", type: "trigger", data: {}, position: { x: 0, y: 0 }, measured: { width: 280, height: 120 } },
    { id: "e", type: "end", data: {}, position: { x: 0, y: 0 }, measured: { width: 100, height: 44 } },
  ],
  edges: [{ id: "te", source: "t", target: "e" }],
  fitView: vi.fn(),
  dimensionsKey: "measured",
}));
vi.mock("@xyflow/react", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@xyflow/react")>();
  return {
    ...actual,
    EdgeLabelRenderer: ({ children }: { children: React.ReactNode }) => createPortal(children, document.body),
    BaseEdge: ({ path }: { path: string }) => <svg><path data-testid="connector" d={path} /></svg>,
    useNodesInitialized: () => flow.ready,
    useReactFlow: () => api,
    useStore: () => flow.dimensionsKey,
  };
});
const api = { getNodes: () => flow.nodes, getInternalNode: (id: string) => flow.nodes.find((n) => n.id === id), getEdges: () => flow.edges, fitView: flow.fitView };
import { AddStepEdge } from "@/components/flow-builder/nodes/AddStepEdge";
import { FlowAutoLayout } from "@/components/flow-builder/FlowAutoLayout";

afterEach(() => { cleanup(); vi.useRealTimers(); vi.clearAllMocks(); flow.ready = true; flow.dimensionsKey = "measured"; });
const props = {
  id: "test-edge", sourceX: 100, sourceY: 100, targetX: 400, targetY: 350,
  sourcePosition: Position.Bottom, targetPosition: Position.Top,
  style: {}, label: "No",
} as EdgeProps;

describe("structured automation connectors", () => {
  it("draws orthogonal segments with small rounded corners instead of Bezier curves", () => {
    render(<AddStepEdge {...props} />);
    const path = screen.getByTestId("connector").getAttribute("d")!;
    expect(path).toContain("L");
    expect(path).toContain("Q");
    expect(path).not.toMatch(/[CS]/);
    expect(screen.getByRole("button", { name: "Aggiungi un passo nel ramo No" })).toHaveTextContent("No");
  });
  it("keeps the branch insert button functional and never animates idle flow", () => {
    const onAddStep = vi.fn();
    const { container } = render(<AddStepEdge {...props} data={{ onAddStep }} />);
    fireEvent.click(screen.getByRole("button"));
    expect(onAddStep).toHaveBeenCalledWith("test-edge");
    expect(container.querySelector("animateMotion")).toBeNull();
  });
  it("only shows the execution marker for a successful test step", () => {
    const { container } = render(<svg><AddStepEdge {...props} style={{ stroke: "#22c55e" }} data={{ __flow: true }} /></svg>);
    expect(container.querySelector("animateMotion")).not.toBeNull();
    expect(container.querySelector("circle")).toHaveClass("motion-reduce:hidden");
  });
});

describe("automatic visual ordering", () => {
  it("waits for measurements and does not rerun for selection, drag or configuration", () => {
    vi.useFakeTimers();
    flow.ready = false;
    const apply = vi.fn();
    const view = render(<FlowAutoLayout topologyKey="initial" onLayout={apply} />);
    expect(apply).not.toHaveBeenCalled();
    flow.ready = true;
    view.rerender(<FlowAutoLayout topologyKey="initial" onLayout={apply} />);
    expect(apply).toHaveBeenCalledTimes(1);
    vi.runAllTimers();
    expect(flow.fitView).toHaveBeenCalledWith(expect.objectContaining({ maxZoom: 1 }));
    view.rerender(<FlowAutoLayout topologyKey="initial" onLayout={apply} />);
    expect(apply).toHaveBeenCalledTimes(1);
    view.rerender(<FlowAutoLayout topologyKey="inserted-step" onLayout={apply} />);
    expect(apply).toHaveBeenCalledTimes(2);
  });
  it("still fits the graph in React StrictMode without duplicating layout", () => {
    vi.useFakeTimers();
    const apply = vi.fn();
    render(<StrictMode><FlowAutoLayout topologyKey="initial" onLayout={apply} /></StrictMode>);
    vi.runAllTimers();
    expect(apply).toHaveBeenCalledTimes(1);
    expect(flow.fitView).toHaveBeenCalledTimes(1);
  });
  it("cancels pending viewport work on unmount", () => {
    vi.useFakeTimers();
    const view = render(<FlowAutoLayout topologyKey="initial" onLayout={vi.fn()} />);
    view.unmount();
    vi.runAllTimers();
    expect(flow.fitView).not.toHaveBeenCalled();
  });
  it("realigns when the actual measured size changes", () => {
    vi.useFakeTimers();
    const apply = vi.fn();
    const view = render(<FlowAutoLayout topologyKey="initial" onLayout={apply} />);
    flow.dimensionsKey = "resized-card";
    view.rerender(<FlowAutoLayout topologyKey="initial" onLayout={apply} />);
    expect(apply).toHaveBeenCalledTimes(2);
  });
});
