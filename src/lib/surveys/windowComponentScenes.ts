/** Original schematics following front/section conventions, not copied manufacturer profiles.
 * Only overall dimensions and explicitly measured parts receive dimensional callouts. */
import {
  cornice,
  specchiaScena,
  type Forma,
  type ScenaSerramento,
} from "@/lib/serramenti/disegnoSerramento";
export function sceneAspectRatio(scene: ScenaSerramento) {
  const u = Math.max(scene.larghezza, scene.altezza) * 0.1;
  const margin = (side: string) =>
    Math.max(
      (scene.quote.some((q) => q.lato === side) ? u * 1.5 : u) +
        scene.sporgenza,
      scene.sfondo ?? 0,
    );
  const top = Math.max(u + scene.sporgenza, scene.sfondo ?? 0);
  const levels = Math.max(
    0,
    ...scene.quote.filter((q) => q.lato === "sotto").map((q) => q.livello ?? 0),
  );
  const bottom = Math.max(
    (scene.quote.some((q) => q.lato === "sotto") ? u * 1.3 : u) +
      scene.sporgenza +
      levels * u * 0.9,
    scene.sfondo ?? 0,
  );
  return (
    (scene.larghezza + margin("sx") + margin("dx")) /
    (scene.altezza + top + bottom)
  );
}
const line = (points: Array<[number, number]>, symbol = false): Forma => ({
  kind: "poly",
  ruolo: symbol ? "simbolo" : "pannelloLinea",
  punti: points,
});
const rect = (
  role: Extract<Forma, { kind: "rect" }>["ruolo"],
  x: number,
  y: number,
  w: number,
  h: number,
): Forma => ({ kind: "rect", ruolo: role, x, y, w, h });
export function measuredScene(
  w: number,
  h: number,
  forms: Forma[] = [],
): ScenaSerramento {
  return {
    larghezza: w,
    altezza: h,
    sporgenza: 0,
    forme: forms,
    quote: [
      { orientamento: "h", lato: "sotto", da: 0, a: w, testo: `${w} mm` },
      { orientamento: "v", lato: "sx", da: 0, a: h, testo: `${h} mm` },
    ],
  };
}
export function mosquitoScene(
  w: number,
  h: number,
  kind: string,
  profile: number | null,
  side: string,
  bottomRail: unknown,
  outside: boolean,
  config: {
    mechanism?: string;
    panels?: string;
    guide?: string;
    guideWidth?: number | null;
    guideHeight?: number | null;
    collectionWidth?: number | null;
  } = {},
) {
  const measuredProfile = config.guideWidth ?? profile;
  const t =
    measuredProfile && measuredProfile * 2 < Math.min(w, h)
      ? measuredProfile
      : Math.min(w, h) * 0.035;
  const collectionAxis = kind === "avvolgibile_verticale" ? h : w;
  const collection =
    config.collectionWidth && config.collectionWidth + 2 * t < collectionAxis
      ? config.collectionWidth
      : t * (kind === "avvolgibile_verticale" ? 1.8 : 1.5);
  const forms: Forma[] = [rect("rete", t, t, w - 2 * t, h - 2 * t)];
  if (
    config.panels === "doppia" &&
    ["avvolgibile_laterale", "plissettata", "avvolgibile_verticale"].includes(
      kind,
    )
  ) {
    const left = mosquitoScene(
      w / 2,
      h,
      kind,
      profile,
      "sx",
      bottomRail,
      false,
      { ...config, panels: "singola" },
    );
    const right = specchiaScena(left, true);
    const shift = (f: Forma): Forma =>
      f.kind === "rect"
        ? { ...f, x: f.x + w / 2 }
        : f.kind === "poly"
          ? { ...f, punti: f.punti.map(([x, y]) => [x + w / 2, y]) }
          : {
              ...f,
              punti: f.punti.map(([x, y]) => [x + w / 2, y]),
              ...(f.buco
                ? {
                    buco: f.buco.map(
                      ([x, y]) => [x + w / 2, y] as [number, number],
                    ),
                  }
                : {}),
            };
    const scene = measuredScene(w, h, [
      ...left.forme,
      ...right.forme.map(shift),
    ]);
    return outside ? specchiaScena(scene, true) : scene;
  }
  forms.push(...cornice(0, 0, w, h, t, "telaio"));
  if (bottomRail === "no" && kind !== "fissa")
    forms.splice(forms.length - 3, 1); // bottom horizontal bar of cornice
  else if (config.guideHeight && config.guideHeight < h) {
    // Replace only the bottom bar; measured threshold height is independent of side profile width.
    forms.splice(
      forms.length - 3,
      1,
      rect("telaio", t, h - config.guideHeight, w - 2 * t, config.guideHeight),
    );
  }
  if (kind === "avvolgibile_verticale") {
    forms.push(
      rect("cassonetto", 0, 0, w, collection),
      rect("maniglia", w / 2 - t, h - t * 2, t * 2, t * 0.5),
    );
    forms.push(
      line(
        [
          [w * 0.5, h * 0.65],
          [w * 0.5, h * 0.35],
        ],
        true,
      ),
      line(
        [
          [w * 0.46, h * 0.4],
          [w * 0.5, h * 0.35],
          [w * 0.54, h * 0.4],
        ],
        true,
      ),
    );
  } else if (
    ["avvolgibile_laterale", "plissettata"].includes(kind) &&
    ["sx", "dx"].includes(side)
  ) {
    const x = side === "sx" ? t : w - t - collection;
    forms.push(
      rect("cassonetto", x, t, collection, h - t * 2),
      rect("maniglia", side === "sx" ? w - t * 2 : t, h * 0.45, t * 0.5, t * 3),
    );
    const a = side === "sx" ? w * 0.65 : w * 0.35,
      b = w - a;
    forms.push(
      line(
        [
          [a, h / 2],
          [b, h / 2],
        ],
        true,
      ),
      line(
        [
          [b + (side === "sx" ? w * 0.05 : -w * 0.05), h * 0.46],
          [b, h / 2],
          [b + (side === "sx" ? w * 0.05 : -w * 0.05), h * 0.54],
        ],
        true,
      ),
    );
    if (kind === "plissettata")
      for (let i = 1; i < 16; i++)
        forms.push(
          line([
            [t + ((w - 2 * t) * i) / 16, t],
            [t + ((w - 2 * t) * i) / 16, h - t],
          ]),
        );
  } else if (["doppia_anta", "battente"].includes(kind)) {
    const count = kind === "doppia_anta" ? 2 : 1;
    if (count === 2) forms.push(rect("telaio", w / 2 - t / 2, t, t, h - 2 * t));
    for (let i = 0; i < count; i++) {
      const x = (i * w) / count,
        end = x + w / count;
      const hinge = count === 2 ? (i === 0 ? "sx" : "dx") : side;
      if (["sx", "dx"].includes(hinge))
        forms.push(
          line(
            [
              [hinge === "sx" ? x + t : end - t, t],
              [hinge === "sx" ? end - t : x + t, h / 2],
              [hinge === "sx" ? x + t : end - t, h - t],
            ],
            true,
          ),
        );
    }
  }
  if (
    ["molla", "frizionata"].includes(config.mechanism ?? "") &&
    ["avvolgibile_verticale", "avvolgibile_laterale"].includes(kind)
  ) {
    const vertical = kind === "avvolgibile_verticale",
      r = Math.min(t * 0.45, collection * 0.35);
    const cx = vertical
        ? w / 2
        : side === "sx"
          ? t + collection / 2
          : w - t - collection / 2,
      cy = vertical ? collection / 2 : h * 0.2;
    forms.push(
      line(
        Array.from({ length: 25 }, (_, i) => [
          cx + (Math.cos((i * Math.PI) / 6) * r * i) / 24,
          cy + (Math.sin((i * Math.PI) / 6) * r * i) / 24,
        ]),
      ),
    );
  }
  if (config.mechanism === "catena" && kind === "avvolgibile_verticale")
    for (let i = 0; i < 15; i++)
      forms.push(
        rect(
          "cintino",
          w - t * 1.8,
          h * 0.2 + i * h * 0.025,
          t * 0.25,
          t * 0.5,
        ),
      );
  if (config.mechanism === "motore")
    forms.push(rect("motore", w / 2 - t, 0, t * 2, t));
  if (config.guide === "carrarmato" && bottomRail !== "no") {
    for (let i = 0; i < 20; i++)
      forms.push(
        rect(
          "binario",
          t + ((w - 2 * t) * i) / 20,
          h - (config.guideHeight ?? t * 0.7),
          (w - 2 * t) / 22,
          config.guideHeight ?? t * 0.5,
        ),
      );
  }
  const scene = measuredScene(w, h, forms);
  return outside ? specchiaScena(scene, true) : scene;
}
export function boxScenes(
  w: number,
  h: number,
  depth: number | null,
  inspection: string,
  cylinder: number | null,
  lidDepth: number | null,
  lidThickness: number | null,
) {
  const front = measuredScene(w, h, [rect("cassonetto", 0, 0, w, h)]),
    edge = Math.min(w, h) * 0.08;
  if (inspection === "frontale" || inspection === "esterna")
    front.forme.push(rect("ispezione", edge, edge, w - 2 * edge, h - 2 * edge));
  if (!depth) return { front, section: null };
  const maxD = Math.max(depth, lidDepth ?? 0),
    section = measuredScene(maxD, h, [rect("cassonetto", 0, 0, depth, h)]);
  section.quote[0].a = depth;
  section.quote[0].testo = `P ${depth} mm`;
  // Drawing position is schematic. Diameter itself is taken ONLY from the recorded measurement.
  if (cylinder && cylinder < Math.min(depth, h)) {
    const points: Array<[number, number]> = Array.from(
      { length: 33 },
      (_, i) => [
        depth / 2 + (Math.cos((i * Math.PI) / 16) * cylinder) / 2,
        h / 2 + (Math.sin((i * Math.PI) / 16) * cylinder) / 2,
      ],
    );
    section.forme.push(line(points));
    section.quote.push({
      orientamento: "h",
      lato: "sotto",
      da: depth / 2 - cylinder / 2,
      a: depth / 2 + cylinder / 2,
      testo: `Ø ${cylinder} mm`,
      livello: 1,
    });
  }
  if (inspection === "inferiore" || lidDepth) {
    const ld = lidDepth ?? depth,
      thickness = lidThickness && lidThickness < h ? lidThickness : h * 0.025;
    section.forme.push(rect("ispezione", 0, h - thickness, ld, thickness));
    if (lidDepth)
      section.quote.push({
        orientamento: "h",
        lato: "sotto",
        da: 0,
        a: lidDepth,
        testo: `Cielino ${lidDepth} mm`,
        livello: 2,
      });
  }
  return { front, section };
}
/** Door handing is always recorded FROM OUTSIDE. This plan is schematic, not a clear-opening certification. */
export function doorPlan(
  width: number,
  hinge: string,
  swing: string,
): ScenaSerramento | null {
  if (!["sx", "dx"].includes(hinge) || !["spingere", "tirare"].includes(swing))
    return null;
  const inward = swing === "spingere";
  const W = width * 1.3,
    H = width * 1.35,
    y = width * (inward ? 0.15 : 1.2),
    x0 = width * 0.15,
    x1 = x0 + width;
  const pivot = hinge === "sx" ? x0 : x1,
    angle0 = hinge === "sx" ? 0 : Math.PI;
  const angle1 = inward
    ? Math.PI / 2
    : hinge === "sx"
      ? -Math.PI / 2
      : Math.PI * 1.5;
  const arc = Array.from({ length: 25 }, (_, i): [number, number] => {
    const a = angle0 + ((angle1 - angle0) * i) / 24;
    return [pivot + Math.cos(a) * width, y + Math.sin(a) * width];
  });
  return {
    larghezza: W,
    altezza: H,
    sporgenza: 0,
    quote: [],
    forme: [
      rect("parete", 0, y - width * 0.04, x0, width * 0.08),
      rect("parete", x1, y - width * 0.04, W - x1, width * 0.08),
      line([
        [x0, y],
        [x1, y],
      ]),
      line(
        [
          [pivot, y],
          [pivot, y + (inward ? width : -width)],
        ],
        true,
      ),
      line(arc, true),
    ],
  };
}
