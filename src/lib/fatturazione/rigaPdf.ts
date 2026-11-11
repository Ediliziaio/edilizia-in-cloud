export interface TestoPdfRiga {
  str: string;
  transform: number[];
  width: number;
  height: number;
}
export interface RigaPdfTrovata {
  testo: string;
  x: number;
  y: number;
  larghezza: number;
  altezza: number;
}
const pulito = (s: string) =>
  s
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
/** Le coordinate provengono dal testo del PDF. Non sono posizioni inventate dal modello. */
export function trovaRighePdf(
  items: TestoPdfRiga[],
  ricerca: string,
): RigaPdfTrovata[] {
  const righe: { items: TestoPdfRiga[]; y: number }[] = [];
  for (const t of items
    .filter((t) => t.str.trim() && t.transform.length >= 6)
    .sort(
      (a, b) =>
        b.transform[5] - a.transform[5] || a.transform[4] - b.transform[4],
    )) {
    const line = righe.find(
      (r) => Math.abs(r.y - t.transform[5]) < Math.max(2, t.height * 0.35),
    );
    if (line) line.items.push(t);
    else righe.push({ items: [t], y: t.transform[5] });
  }
  const target = pulito(ricerca);
  if (!target) return [];
  const parole = [
    ...new Set(
      target
        .split(" ")
        .filter(
          (w) =>
            w.length > 2 &&
            ![
              "per",
              "con",
              "del",
              "della",
              "dei",
              "degli",
              "alla",
              "fornitura",
              "materiale",
              "articolo",
            ].includes(w),
        ),
    ),
  ];
  const corrisponde = (testo: string) => {
    const normal = pulito(testo),
      tokens = new Set(normal.split(" "));
    return (
      (target.includes(" ") ? normal.includes(target) : tokens.has(target)) ||
      (parole.length >= 3 &&
        parole.filter((w) => tokens.has(w)).length / parole.length >= 0.85)
    );
  };
  const out: RigaPdfTrovata[] = [];
  for (let i = 0; i < righe.length; i++) {
    for (let n = 1; n <= 2 && i + n <= righe.length; n++) {
      const gruppi = righe.slice(i, i + n);
      if (
        n > 1 &&
        Math.abs(gruppi[0].y - gruppi[1].y) >
          Math.max(...gruppi.flatMap((g) => g.items.map((t) => t.height))) * 2.2
      )
        continue;
      // Una riga già completa non deve essere accorpata all'intestazione o alla voce precedente.
      if (
        n > 1 &&
        gruppi.some((g) => corrisponde(g.items.map((t) => t.str).join(" ")))
      )
        continue;
      const ts = gruppi.flatMap((g) =>
        g.items.sort((a, b) => a.transform[4] - b.transform[4]),
      );
      const testo = ts.map((t) => t.str).join(" ");
      if (!corrisponde(testo)) continue;
      if (out.some((r) => Math.abs(r.y - gruppi[0].y) < 2)) break;
      const x = Math.min(...ts.map((t) => t.transform[4])),
        y = Math.min(
          ...ts.map((t) => t.transform[5] - Math.max(t.height, 8) * 0.25),
        );
      const destra = Math.max(...ts.map((t) => t.transform[4] + t.width)),
        alto = Math.max(
          ...ts.map((t) => t.transform[5] + Math.max(t.height, 8)),
        );
      out.push({ testo, x, y, larghezza: destra - x, altezza: alto - y });
      break;
    }
  }
  return out;
}
