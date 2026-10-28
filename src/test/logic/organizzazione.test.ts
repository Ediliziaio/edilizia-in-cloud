import { describe, expect, it } from "vitest";
import type { HrProfilo, OrgTreeNode } from "@/types/hr";
import {
  buildOrgTree,
  filterOrgTree,
  layoutOrgTree,
  fitOrgView,
  hasValidGps,
  validateSedeGps,
  parseGpsCoordinate,
  ORG_CARD_WIDTH,
} from "@/lib/personale/organizzazione";
const person = (id: string, parent: string | null = null): HrProfilo =>
  ({ id, nome: id, cognome: "Test", responsabile_id: parent }) as HrProfilo;
const flatten = (tree: OrgTreeNode[]): OrgTreeNode[] =>
  tree.flatMap((node) => [node, ...flatten(node.children)]);

describe("organigramma: nessuna persona persa e layout deterministico", () => {
  it("keeps roots, missing managers and self relationships visible without mutating input", () => {
    const data = [
      person("root"),
      person("a", "root"),
      person("orphan", "missing"),
      person("self", "self"),
    ];
    const before = JSON.stringify(data);
    const tree = buildOrgTree(data);
    expect(
      flatten(tree)
        .map((n) => n.id)
        .sort(),
    ).toEqual(["a", "orphan", "root", "self"]);
    expect(tree[0].children[0].depth).toBe(1);
    expect(JSON.stringify(data)).toBe(before);
  });
  it("survives cycles with no natural roots and keeps every person exactly once", () => {
    const data = [
      person("a", "b"),
      person("b", "c"),
      person("c", "a"),
      person("d", "b"),
    ];
    expect(
      flatten(buildOrgTree(data))
        .map((n) => n.id)
        .sort(),
    ).toEqual(["a", "b", "c", "d"]);
  });
  it("retains ancestors but not unrelated siblings in a search", () => {
    const filtered = filterOrgTree(
      buildOrgTree([person("root"), person("a", "root"), person("b", "root")]),
      (p) => p.id === "a",
    );
    expect(flatten(filtered).map((n) => n.id)).toEqual(["root", "a"]);
  });
  it("returns an empty search rather than the entire tree", () => {
    expect(filterOrgTree(buildOrgTree([person("root")]), () => false)).toEqual(
      [],
    );
  });
  it("does not overlap unequal subtrees, and draws orthogonal links", () => {
    const tree = buildOrgTree([
      person("r"),
      person("a", "r"),
      person("b", "r"),
      person("c", "a"),
      person("d", "a"),
      person("e", "a"),
    ]);
    const layout = layoutOrgTree(tree, new Set());
    for (const node of layout.nodes) {
      for (const peer of layout.nodes.filter(
        (n) => n.y === node.y && n.x > node.x,
      ))
        expect(peer.x - node.x).toBeGreaterThanOrEqual(ORG_CARD_WIDTH);
    }
    expect(layout.edges).toHaveLength(5);
    expect(
      layout.edges.every(
        (e) => e.path.includes(" V ") && !e.path.includes(" C "),
      ),
    ).toBe(true);
    const root = layout.nodes[0];
    const a = layout.nodes.find((n) => n.node.id === "a")!;
    const b = layout.nodes.find((n) => n.node.id === "b")!;
    expect(root.x).toBeGreaterThan(a.x);
    expect(root.x).toBeLessThan(b.x);
  });
  it("collapses a branch without altering the original tree", () => {
    const tree = buildOrgTree([
      person("r"),
      person("a", "r"),
      person("b", "a"),
    ]);
    expect(
      layoutOrgTree(tree, new Set(["a"])).nodes.map((n) => n.node.id),
    ).toEqual(["r", "a"]);
    expect(flatten(tree)).toHaveLength(3);
  });
  it("fits large content inside the real viewport instead of resetting to 100%", () => {
    const view = fitOrgView(
      { width: 2000, height: 800 },
      { width: 1000, height: 500 },
    );
    expect(view.scale).toBeLessThan(1);
    expect(view.x).toBeGreaterThanOrEqual(0);
    expect(view.x + 2000 * view.scale).toBeLessThanOrEqual(1000);
    expect(view.y + 800 * view.scale).toBeLessThanOrEqual(500);
  });
});

describe("sedi: GPS esplicito e completo", () => {
  it("accepts Italian decimal comma and rejects ambiguous or non-decimal input", () => {
    expect(parseGpsCoordinate("45,4642")).toBe(45.4642);
    expect(validateSedeGps("45,4642", "9,19", "200")).toBeNull();
    expect(validateSedeGps("0x20", "9", "200")).not.toBeNull();
    expect(validateSedeGps("1.234,5", "9", "200")).not.toBeNull();
  });
  it.each([
    ["45", ""],
    ["", "9"],
  ])("rejects incomplete coordinate pairs %s/%s", (lat, lng) => {
    expect(validateSedeGps(lat, lng, "200")).toMatch(
      /sia latitudine sia longitudine/,
    );
  });
  it("allows a site without GPS and accepts coordinates at zero", () => {
    expect(validateSedeGps("", "", "200")).toBeNull();
    expect(validateSedeGps("0", "0", "200")).toBeNull();
    expect(hasValidGps({ lat: 0, lng: 0 })).toBe(true);
  });
  it.each([
    ["NaN", "9", "200"],
    ["91", "9", "200"],
    ["45", "181", "200"],
    ["45", "9", "9"],
    ["45", "9", "5001"],
    ["45", "9", ""],
  ])("rejects invalid values %s/%s/%s", (lat, lng, r) =>
    expect(validateSedeGps(lat, lng, r)).not.toBeNull(),
  );
  it("does not count incomplete or invalid old GPS records as configured", () => {
    expect(hasValidGps({ lat: 45, lng: null })).toBe(false);
    expect(hasValidGps({ lat: 100, lng: 9 })).toBe(false);
    expect(hasValidGps({ lat: NaN, lng: 9 })).toBe(false);
  });
});
