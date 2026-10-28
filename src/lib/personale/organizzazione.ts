import type { HrProfilo, HrSede, OrgTreeNode } from "@/types/hr";

/** Legacy cycles must not make people disappear. Stored relationships stay untouched. */
export function buildOrgTree(profili: HrProfilo[]): OrgTreeNode[] {
  const nodes = new Map(
    profili.map((p) => [p.id, { ...p, children: [], depth: 0 } as OrgTreeNode]),
  );
  const parents = new Map<string, string>();
  for (const p of profili)
    if (
      p.responsabile_id &&
      nodes.has(p.responsabile_id) &&
      p.responsabile_id !== p.id
    )
      parents.set(p.id, p.responsabile_id);
  const done = new Set<string>();
  for (const p of profili) {
    const path = new Set<string>();
    let id: string | undefined = p.id;
    while (id && !done.has(id)) {
      if (path.has(id)) {
        parents.delete(id);
        break;
      }
      path.add(id);
      id = parents.get(id);
    }
    path.forEach((visited) => done.add(visited));
  }
  const roots: OrgTreeNode[] = [];
  for (const node of nodes.values()) {
    const parent = parents.get(node.id);
    if (parent) nodes.get(parent)!.children.push(node);
    else roots.push(node);
  }
  const visit = (node: OrgTreeNode, depth: number) => {
    node.depth = depth;
    node.children.forEach((child) => visit(child, depth + 1));
  };
  roots.forEach((node) => visit(node, 0));
  return roots;
}

export function filterOrgTree(
  tree: OrgTreeNode[],
  matches: (p: HrProfilo) => boolean,
): OrgTreeNode[] {
  return tree.flatMap((node) => {
    const children = filterOrgTree(node.children, matches);
    return matches(node) || children.length ? [{ ...node, children }] : [];
  });
}

/** Explain repairs made only for visualization (cycles, missing/inactive managers). */
export function orgLinksToReview(profili: HrProfilo[], tree: OrgTreeNode[]) {
  const attached = new Set<string>();
  const visit = (node: OrgTreeNode) =>
    node.children.forEach((child) => {
      attached.add(child.id);
      visit(child);
    });
  tree.forEach(visit);
  return profili.filter((p) => p.responsabile_id && !attached.has(p.id));
}

export const ORG_CARD_WIDTH = 228;
export const ORG_CARD_HEIGHT = 116;
const GAP = 28;
const LEVEL = 188;
export function layoutOrgTree(
  tree: OrgTreeNode[],
  collapsed: ReadonlySet<string>,
) {
  const widths = new Map<string, number>();
  const children = (node: OrgTreeNode) =>
    collapsed.has(node.id) ? [] : node.children;
  function measure(node: OrgTreeNode): number {
    const branches = children(node);
    const width = Math.max(
      ORG_CARD_WIDTH,
      branches.reduce((sum, child) => sum + measure(child), 0) +
        Math.max(0, branches.length - 1) * GAP,
    );
    widths.set(node.id, width);
    return width;
  }
  tree.forEach(measure);
  const nodes: { node: OrgTreeNode; x: number; y: number }[] = [];
  const edges: { id: string; path: string }[] = [];
  function place(node: OrgTreeNode, left: number, depth: number) {
    const x = left + widths.get(node.id)! / 2;
    const y = 24 + depth * LEVEL;
    nodes.push({ node, x: x - ORG_CARD_WIDTH / 2, y });
    let childLeft = left;
    for (const child of children(node)) {
      const childX = childLeft + widths.get(child.id)! / 2;
      const childY = y + LEVEL;
      const middle = y + ORG_CARD_HEIGHT + (LEVEL - ORG_CARD_HEIGHT) / 2;
      edges.push({
        id: child.id,
        path: `M ${x} ${y + ORG_CARD_HEIGHT} V ${middle} H ${childX} V ${childY}`,
      });
      place(child, childLeft, depth + 1);
      childLeft += widths.get(child.id)! + GAP;
    }
  }
  let left = 24;
  tree.forEach((root) => {
    place(root, left, 0);
    left += widths.get(root.id)! + GAP;
  });
  return {
    nodes,
    edges,
    width: Math.max(left - GAP + 24, 300),
    height: Math.max(...nodes.map((n) => n.y + ORG_CARD_HEIGHT + 32), 180),
  };
}

export function fitOrgView(
  content: { width: number; height: number },
  viewport: { width: number; height: number },
) {
  const scale = Math.min(
    1,
    Math.max(
      0.000001,
      Math.min(
        (viewport.width - 48) / content.width,
        (viewport.height - 80) / content.height,
      ),
    ),
  );
  return {
    scale,
    x: (viewport.width - content.width * scale) / 2,
    y: 48 + Math.max(0, (viewport.height - 80 - content.height * scale) / 2),
  };
}

export function hasValidGps(sede: Pick<HrSede, "lat" | "lng">) {
  return (
    sede.lat != null &&
    sede.lng != null &&
    Number.isFinite(sede.lat) &&
    Number.isFinite(sede.lng) &&
    Math.abs(sede.lat) <= 90 &&
    Math.abs(sede.lng) <= 180
  );
}

/** Decimal comma is common on Italian mobile keyboards; no thousands or exponent notation. */
export function parseGpsCoordinate(value: string): number {
  const text = value.trim();
  return /^[+-]?(?:\d+(?:[.,]\d*)?|[.,]\d+)$/.test(text)
    ? Number(text.replace(",", "."))
    : NaN;
}

export function validateSedeGps(
  lat: string,
  lng: string,
  radius: string,
): string | null {
  if (!!lat.trim() !== !!lng.trim())
    return "Inserisci sia latitudine sia longitudine, oppure lascia vuote entrambe.";
  if (
    lat.trim() &&
    (!Number.isFinite(parseGpsCoordinate(lat)) ||
      Math.abs(parseGpsCoordinate(lat)) > 90)
  )
    return "Latitudine non valida";
  if (
    lng.trim() &&
    (!Number.isFinite(parseGpsCoordinate(lng)) ||
      Math.abs(parseGpsCoordinate(lng)) > 180)
  )
    return "Longitudine non valida";
  if (
    !Number.isFinite(Number(radius)) ||
    Number(radius) < 10 ||
    Number(radius) > 5000
  )
    return "Il raggio deve essere compreso tra 10 e 5000 metri";
  return null;
}
