/** Normalized photo coordinates. These are visual proposals, never installation measurements. */
export const PHOTO_COMPONENTS = {
  split: { label: "Clima interno", ratio: 3.5 },
  outdoor: { label: "Unità esterna", ratio: 1.35 },
  pdc: { label: "Pompa di calore", ratio: 1.35 },
  tank: { label: "Bollitore / accumulo", ratio: 0.5 },
  inverter: { label: "Inverter", ratio: 0.7 },
  panel: { label: "Modulo fotovoltaico", ratio: 0.6 },
} as const;
export type PhotoComponentKind = keyof typeof PHOTO_COMPONENTS;
/** Photo placement also belongs to pre-existing company/system element types, not only en_* extensions. */
export function surveyPhotoPlacement(
  category: string,
  elementKey?: string,
): { enabled: boolean; kind: PhotoComponentKind } {
  const kinds: Record<string, PhotoComponentKind> = {
    en_falda: "panel",
    falda: "panel",
    split: "split",
    unita_interna: "split",
    unita_esterna: "outdoor",
    en_unita_esterna: "outdoor",
    pompa_calore: "pdc",
    en_ibrido: "pdc",
    en_accumulo_termico: "tank",
    inverter: "inverter",
  };
  return {
    enabled: ["climatizzazione", "fotovoltaico"].includes(category),
    kind:
      kinds[elementKey || ""] ||
      (category === "fotovoltaico" ? "inverter" : "split"),
  };
}
export type PhotoPlacement = {
  id: string;
  kind: PhotoComponentKind;
  x: number;
  y: number;
  width: number;
  rotation: number;
  label: string;
};
export type PhotoPlacementDocument = {
  version: 1;
  kind: "equipment-placement";
  sourceMediaId: string | null;
  originalFilename: string;
  note: string;
  items: PhotoPlacement[];
  notToScale: true;
};
export function photoPlacementCaption(
  annotations: Record<string, unknown> | null | undefined,
): string[] {
  if (annotations?.kind !== "equipment-placement") return [];
  const items = Array.isArray(annotations.items)
    ? annotations.items.slice(0, 12)
    : [];
  return [
    "Posizionamento proposto - non in scala",
    ...items.flatMap((item, i) =>
      item && typeof item === "object" && typeof item.label === "string"
        ? [`${i + 1}. ${item.label.slice(0, 70)}`]
        : [],
    ),
    ...(typeof annotations.note === "string" && annotations.note.trim()
      ? [`Note: ${annotations.note.slice(0, 400)}`]
      : []),
  ];
}
const limit = (n: number, min: number, max: number) =>
  Math.min(max, Math.max(min, Number.isFinite(n) ? n : min));
export function placementBox(item: PhotoPlacement, aspect: number) {
  const width = limit(item.width, 0.08, 0.75),
    height = (width * aspect) / PHOTO_COMPONENTS[item.kind].ratio;
  return { width, height };
}
export function constrainPlacement(
  item: PhotoPlacement,
  aspect: number,
): PhotoPlacement {
  const rotation = limit(item.rotation, -45, 45),
    radians = (rotation * Math.PI) / 180;
  const initial = placementBox(item, aspect);
  const xExtent =
    (Math.abs(initial.width * Math.cos(radians)) +
      Math.abs(initial.height * Math.sin(radians))) /
    2;
  const yExtent =
    (Math.abs(initial.height * Math.cos(radians)) +
      Math.abs(initial.width * Math.sin(radians))) /
    2;
  const shrink = Math.min(1, 0.48 / xExtent, 0.48 / yExtent);
  const width = initial.width * shrink;
  return {
    ...item,
    width,
    rotation,
    x: limit(item.x, xExtent * shrink, 1 - xExtent * shrink),
    y: limit(item.y, yExtent * shrink, 1 - yExtent * shrink),
    label: item.label.slice(0, 70),
  };
}
/** Code-native equipment symbols, identical in the interactive view and flattened export. */
export function equipmentArtwork(kind: PhotoComponentKind): string {
  const frame = 'fill="#ffffff" stroke="#475569" stroke-width="2"';
  const fan =
    '<circle cx="61" cy="51" r="32" fill="#e2e8f0" stroke="#94a3b8"/><circle cx="61" cy="51" r="25" fill="none" stroke="#94a3b8" stroke-dasharray="2 3"/><path d="M61 27 Q87 43 63 50 Q77 78 60 54 Q31 67 57 51 Q37 26 61 47" fill="#64748b"/><circle cx="61" cy="51" r="5" fill="#475569"/>';
  let content: string;
  if (kind === "split")
    content = `<rect x="2" y="3" width="346" height="91" rx="15" ${frame}/><path d="M15 64 H335 L324 84 H26 Z" fill="#e2e8f0" stroke="#94a3b8"/><path d="M23 70 H327 M27 77 H323" stroke="#64748b"/><circle cx="310" cy="42" r="3" fill="#10b981"/><path d="M20 18 H330" stroke="#f1f5f9" stroke-width="3"/>`;
  else if (kind === "outdoor" || kind === "pdc")
    content = `<rect x="6" y="4" width="121" height="90" rx="5" ${frame}/>${fan}<path d="M103 17 V80 M110 17 V80 M117 17 V80" stroke="#94a3b8"/><path d="M17 96 H39 M94 96 H116" stroke="#475569" stroke-width="5"/>`;
  else if (kind === "tank")
    content = `<path d="M8 14 Q25 0 42 14 V85 Q25 100 8 85 Z" ${frame}/><ellipse cx="25" cy="14" rx="17" ry="7" fill="#f1f5f9" stroke="#94a3b8"/><rect x="20" y="38" width="11" height="17" rx="2" fill="#e2e8f0"/><path d="M9 20 H3 M41 25 H47" stroke="#475569" stroke-width="3"/>`;
  else if (kind === "inverter")
    content = `<rect x="5" y="4" width="60" height="90" rx="8" ${frame}/><rect x="23" y="30" width="24" height="15" rx="2" fill="#e2e8f0"/><circle cx="35" cy="63" r="4" fill="#10b981"/>`;
  else
    content =
      '<rect x="2" y="2" width="56" height="96" rx="1" fill="#244b76" stroke="#cbd5e1" stroke-width="3"/><path d="M30 3 V97 M3 26 H57 M3 50 H57 M3 74 H57" stroke="#93b4d2"/>';
  const ratio = PHOTO_COMPONENTS[kind].ratio;
  // Outdoor and PDC share the same physical symbol; viewBox follows their illustrative aspect ratio.
  const width =
    kind === "split"
      ? 350
      : kind === "outdoor" || kind === "pdc"
        ? 135
        : ratio * 100;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} 100" width="${width}" height="100">${content}</svg>`;
}
export function equipmentArtworkUrl(kind: PhotoComponentKind) {
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(equipmentArtwork(kind))}`;
}
export function loadPlacementImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    if (/^https?:/.test(url)) image.crossOrigin = "anonymous";
    const timer = setTimeout(() => {
      image.src = "";
      reject(
        new Error(
          "La foto non risponde: riaprila o scegli un JPEG/PNG dalla galleria.",
        ),
      );
    }, 20000);
    image.onload = () => {
      clearTimeout(timer);
      if (
        !image.naturalWidth ||
        image.naturalWidth * image.naturalHeight > 50_000_000
      )
        reject(
          new Error(
            "Foto troppo grande: usa una copia ridotta entro 50 megapixel.",
          ),
        );
      else resolve(image);
    };
    image.onerror = () => {
      clearTimeout(timer);
      reject(
        new Error(
          "Foto non leggibile. Usa JPEG, PNG o WebP; per HEIC esporta una copia compatibile.",
        ),
      );
    };
    image.src = url;
  });
}
export async function renderPhotoPlacement(
  url: string,
  document: PhotoPlacementDocument,
): Promise<File> {
  if (!document.items.length || document.items.length > 12)
    throw new Error("Inserisci da 1 a 12 componenti nella foto.");
  const background = await loadPlacementImage(url),
    aspect = background.naturalWidth / background.naturalHeight;
  const width = Math.min(1920, background.naturalWidth),
    height = Math.round(width / aspect);
  const canvas = window.document.createElement("canvas");
  canvas.width = width;
  const labels = document.items.map(
    (p, i) => `${i + 1}. ${p.label || PHOTO_COMPONENTS[p.kind].label}`,
  );
  const font = Math.max(13, Math.round(width / 70)),
    line = font * 1.55,
    pad = Math.round(width * 0.025);
  const ctx = canvas.getContext("2d");
  if (!ctx)
    throw new Error(
      "Esportazione immagini non disponibile su questo dispositivo.",
    );
  const lines = [
    "POSIZIONAMENTO PROPOSTO - NON IN SCALA",
    ...labels,
    ...(document.note ? [`Note: ${document.note.slice(0, 400)}`] : []),
  ];
  // Wrap at the actual image width, including small portrait photos and long notes.
  ctx.font = `${font}px sans-serif`;
  const wrapped = lines.flatMap((text) => {
    const rows: string[] = [];
    let current = "";
    for (const char of text) {
      if (ctx.measureText(current + char).width > width - pad * 2) {
        rows.push(current);
        current = "";
      }
      current += char;
    }
    if (current) rows.push(current);
    return rows;
  });
  canvas.height = height + Math.ceil(pad * 2 + wrapped.length * line);
  ctx.fillStyle = "white";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(background, 0, 0, width, height);
  for (const [index, raw] of document.items.entries()) {
    const p = constrainPlacement(raw, aspect),
      box = placementBox(p, aspect),
      symbol = await loadPlacementImage(equipmentArtworkUrl(p.kind));
    ctx.save();
    ctx.translate(p.x * width, p.y * height);
    ctx.rotate((p.rotation * Math.PI) / 180);
    ctx.shadowColor = "rgba(15,23,42,.25)";
    ctx.shadowBlur = Math.max(2, width / 250);
    ctx.shadowOffsetY = 2;
    ctx.drawImage(
      symbol,
      (-box.width * width) / 2,
      (-box.height * height) / 2,
      box.width * width,
      box.height * height,
    );
    ctx.shadowBlur = 0;
    ctx.font = `bold ${Math.max(14, width * 0.022)}px sans-serif`;
    ctx.strokeStyle = "#193b63";
    ctx.lineWidth = 3;
    ctx.fillStyle = "white";
    const markerX = (-box.width * width) / 2 + 6,
      markerY = (-box.height * height) / 2 + Math.max(14, width * 0.022);
    ctx.strokeText(String(index + 1), markerX, markerY);
    ctx.fillText(String(index + 1), markerX, markerY);
    ctx.restore();
  }
  ctx.font = `${font}px sans-serif`;
  ctx.fillStyle = "#193b63";
  wrapped.forEach((text, i) =>
    ctx.fillText(text, pad, height + pad + font + i * line),
  );
  const blob = await new Promise<Blob>((resolve, reject) => {
    try {
      canvas.toBlob(
        (b) => (b ? resolve(b) : reject(new Error("Immagine non esportata."))),
        "image/jpeg",
        0.9,
      );
    } catch {
      reject(
        new Error(
          "Non posso esportare questa foto: riaprila dalla galleria del dispositivo.",
        ),
      );
    }
  });
  return new File([blob], "posizionamento-proposto.jpg", {
    type: "image/jpeg",
  });
}
