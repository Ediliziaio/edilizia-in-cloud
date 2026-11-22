import type { Punto } from "@/components/planimetrie/editor/adattatore";

/** Angoli del foglio nella foto, in senso orario a partire da quello in alto a sinistra. */
export type AngoliSchizzo = readonly [Punto, Punto, Punto, Punto];

export function proiezioneFoglio(angoli: AngoliSchizzo) {
  if (angoli.some(p => !Number.isFinite(p.x) || !Number.isFinite(p.y) || p.x < 0 || p.y < 0 || p.x > 1 || p.y > 1)) return null;
  const lati = angoli.map((p, i) => ({ x: angoli[(i + 1) % 4].x - p.x, y: angoli[(i + 1) % 4].y - p.y }));
  if (lati.some((a, i) => {
    const b = lati[(i + 1) % 4];
    return a.x * b.y - a.y * b.x < .002;
  })) return null;

  const [a, b, c, d] = angoli;
  const dx1 = b.x - c.x, dx2 = d.x - c.x;
  const dy1 = b.y - c.y, dy2 = d.y - c.y;
  const dx3 = a.x - b.x + c.x - d.x;
  const dy3 = a.y - b.y + c.y - d.y;
  const det = dx1 * dy2 - dx2 * dy1;
  const g = (dx3 * dy2 - dx2 * dy3) / det;
  const h = (dx1 * dy3 - dx3 * dy1) / det;
  if (Math.min(1 + g, 1 + h, 1 + g + h) < .03) return null;
  const ax = b.x - a.x + g * b.x, bx = d.x - a.x + h * d.x;
  const ay = b.y - a.y + g * b.y, by = d.y - a.y + h * d.y;
  return (u: number, v: number): Punto => {
    const z = 1 + g * u + h * v;
    return { x: (a.x + ax * u + bx * v) / z, y: (a.y + ay * u + by * v) / z };
  };
}

export async function raddrizzaSchizzo(file: File, angoli: AngoliSchizzo) {
  const proietta = proiezioneFoglio(angoli);
  if (!proietta) throw new Error("Indica i quattro angoli del foglio in senso orario.");
  const bitmap = await createImageBitmap(file);
  try {
    const sorgente = document.createElement("canvas");
    const scalaInput = Math.min(1, 2200 / Math.max(bitmap.width, bitmap.height));
    const w = sorgente.width = Math.round(bitmap.width * scalaInput);
    const h = sorgente.height = Math.round(bitmap.height * scalaInput);
    const contesto = sorgente.getContext("2d", { willReadFrequently: true });
    if (!contesto) throw new Error("La correzione foto richiede il supporto Canvas.");
    contesto.fillStyle = "white";
    contesto.fillRect(0, 0, w, h);
    contesto.drawImage(bitmap, 0, 0, w, h);
    const dati = contesto.getImageData(0, 0, w, h).data;

    const lato = (i: number, j: number) => Math.hypot((angoli[i].x - angoli[j].x) * w, (angoli[i].y - angoli[j].y) * h);
    const larghezza = (lato(0, 1) + lato(3, 2)) / 2;
    const altezza = (lato(0, 3) + lato(1, 2)) / 2;
    const scala = Math.min(1, 1600 / Math.max(larghezza, altezza));
    const risultato = document.createElement("canvas");
    risultato.width = Math.max(2, Math.round(larghezza * scala));
    risultato.height = Math.max(2, Math.round(altezza * scala));
    const destinazione = risultato.getContext("2d");
    if (!destinazione) throw new Error("Impossibile creare la foto raddrizzata.");
    const rettificata = destinazione.createImageData(risultato.width, risultato.height);
    let i = 0;
    for (let y = 0; y < risultato.height; y++) {
      const v = y / (risultato.height - 1);
      for (let x = 0; x < risultato.width; x++) {
        const p = proietta(x / (risultato.width - 1), v);
        const sx = Math.min(w - 1, Math.max(0, p.x * (w - 1)));
        const sy = Math.min(h - 1, Math.max(0, p.y * (h - 1)));
        const x0 = Math.floor(sx), y0 = Math.floor(sy);
        const dx = sx - x0, dy = sy - y0;
        const alto = (y0 * w + x0) * 4;
        const basso = y0 < h - 1 ? alto + w * 4 : alto;
        const offset = x0 < w - 1 ? 4 : 0;
        for (let canale = 0; canale < 3; canale++) {
          rettificata.data[i++] = (dati[alto + canale] * (1 - dx) + dati[alto + offset + canale] * dx) * (1 - dy)
            + (dati[basso + canale] * (1 - dx) + dati[basso + offset + canale] * dx) * dy;
        }
        rettificata.data[i++] = 255;
      }
    }
    destinazione.putImageData(rettificata, 0, 0);
    const blob = await new Promise<Blob | null>(resolve => risultato.toBlob(resolve, "image/png"));
    if (!blob) throw new Error("Impossibile salvare la foto raddrizzata.");
    return new File([blob], file.name.replace(/\.[^.]+$/, "") + "-raddrizzato.png", { type: blob.type });
  } finally {
    bitmap.close();
  }
}
