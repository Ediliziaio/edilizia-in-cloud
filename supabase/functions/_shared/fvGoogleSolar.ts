/** Contratto Google Solar: solo dati del provider, nessuna geometria dimostrativa. */
export type QualitaSolarFv = "HIGH" | "MEDIUM" | "BASE";
export type LatLngSolarFv = { lat: number; lng: number };
export type SegmentoSolarFv = {
  indice: number;
  centro: LatLngSolarFv;
  confini: { ne: LatLngSolarFv; sw: LatLngSolarFv };
  inclinazione: number;
  azimut: number;
  superficie: number;
  areaInPianta: number;
  quotaCentro: number;
};
export type RisultatoSolarFv = {
  fonte: "solar_api";
  qualita: "high" | "medium" | "low";
  imagery_date: string | null;
  qualitaGoogle: QualitaSolarFv;
  centro: LatLngSolarFv;
  segmenti: SegmentoSolarFv[];
  ore_sole_annue: number | null;
  superficie_tetto_disponibile_mq: number | null;
  numero_pannelli_max: number | null;
  potenza_max_kwp: number | null;
  panel_capacity_watts: number | null;
  panel_width_meters: number | null;
  panel_height_meters: number | null;
  azimut_dominante_deg: number | null;
  tilt_dominante_deg: number | null;
  layout_suggerito: Array<
    {
      centro_lat: number;
      centro_lng: number;
      azimuth_deg: number;
      tilt_deg: number;
      orientamento: string;
      produzione_annua_kwh: number;
      segment_index: number;
    }
  >;
};
export type FotoSolarFv = {
  path: string;
  larghezza: number;
  altezza: number;
  angoli: [LatLngSolarFv, LatLngSolarFv, LatLngSolarFv]; // alto sinistra, alto destra, basso sinistra
  data: string;
  qualita: QualitaSolarFv;
  risoluzione: number;
};
const record = (v: unknown): v is Record<string, unknown> =>
  !!v && typeof v === "object" && !Array.isArray(v);
const n = (v: unknown): v is number =>
  typeof v === "number" && Number.isFinite(v);
const positivo = (v: unknown) => n(v) && v > 0 ? v : null;
export const qualitaSolarValida = (v: unknown): v is QualitaSolarFv =>
  v === "HIGH" || v === "MEDIUM" || v === "BASE";
export const posizioneSolarValida = (v: unknown): v is LatLngSolarFv =>
  record(v) && n(v.lat) && n(v.lng) && Math.abs(v.lat) <= 80 &&
  Math.abs(v.lng) <= 180;
function posizioneGoogle(v: unknown): LatLngSolarFv | null {
  if (!record(v)) return null;
  const p = { lat: v.latitude, lng: v.longitude };
  return posizioneSolarValida(p) ? p : null;
}
export function dataSolar(v: unknown): string | null {
  if (!record(v) || !n(v.year) || !n(v.month) || !n(v.day)) return null;
  const iso = `${v.year}-${String(v.month).padStart(2, "0")}-${
    String(v.day).padStart(2, "0")
  }`;
  const d = new Date(iso);
  return Number.isFinite(d.getTime()) && d.toISOString().slice(0, 10) === iso
    ? iso
    : null;
}
export function leggiRispostaSolar(raw: unknown): RisultatoSolarFv | null {
  if (
    !record(raw) || raw._mock || !record(raw.solarPotential) ||
    !(qualitaSolarValida(raw.imageryQuality) || raw.imageryQuality === "LOW")
  ) return null;
  const quality = raw.imageryQuality === "LOW" ? "BASE" : raw.imageryQuality;
  const sp = raw.solarPotential, centro = posizioneGoogle(raw.center);
  if (!centro) return null;
  const segmenti: SegmentoSolarFv[] = [];
  if (Array.isArray(sp.roofSegmentStats)) {
    sp.roofSegmentStats.slice(0, 100).forEach((s, indice) => {
      if (!record(s) || !record(s.stats) || !record(s.boundingBox)) return;
      const c = posizioneGoogle(s.center),
        ne = posizioneGoogle(s.boundingBox.ne),
        sw = posizioneGoogle(s.boundingBox.sw);
      if (
        !c || !ne || !sw || ne.lat <= sw.lat || ne.lng <= sw.lng ||
        !n(s.pitchDegrees) || s.pitchDegrees < 0 || s.pitchDegrees > 75 ||
        !n(s.azimuthDegrees) || s.azimuthDegrees < 0 ||
        s.azimuthDegrees >= 360 || !n(s.planeHeightAtCenterMeters) ||
        Math.abs(s.planeHeightAtCenterMeters) > 10000 ||
        !positivo(s.stats.areaMeters2) || !positivo(s.stats.groundAreaMeters2)
      ) return;
      segmenti.push({
        indice,
        centro: c,
        confini: { ne, sw },
        inclinazione: s.pitchDegrees,
        azimut: s.azimuthDegrees,
        superficie: s.stats.areaMeters2 as number,
        areaInPianta: s.stats.groundAreaMeters2 as number,
        quotaCentro: s.planeHeightAtCenterMeters,
      });
    });
  }
  const principale =
    [...segmenti].sort((a, b) => b.superficie - a.superficie)[0];
  const watt = positivo(sp.panelCapacityWatts),
    count = positivo(sp.maxArrayPanelsCount);
  const layout: RisultatoSolarFv["layout_suggerito"] = [];
  if (Array.isArray(sp.solarPanels)) {
    for (const p of sp.solarPanels.slice(0, 500)) {
      if (!record(p)) {
        continue;
      }
      const c = posizioneGoogle(p.center),
        s = segmenti.find((s) => s.indice === p.segmentIndex);
      if (
        c && s &&
        (p.orientation === "LANDSCAPE" || p.orientation === "PORTRAIT")
      ) {
        layout.push({
          centro_lat: c.lat,
          centro_lng: c.lng,
          azimuth_deg: s.azimut,
          tilt_deg: s.inclinazione,
          orientamento: p.orientation,
          produzione_annua_kwh: positivo(p.yearlyEnergyDcKwh) ?? 0,
          segment_index: s.indice,
        });
      }
    }
  }
  return {
    fonte: "solar_api",
    qualita: quality === "HIGH"
      ? "high"
      : quality === "MEDIUM"
      ? "medium"
      : "low",
    qualitaGoogle: quality,
    imagery_date: dataSolar(raw.imageryDate),
    centro,
    segmenti,
    ore_sole_annue: positivo(sp.maxSunshineHoursPerYear),
    superficie_tetto_disponibile_mq: record(sp.wholeRoofStats)
      ? positivo(sp.wholeRoofStats.areaMeters2)
      : null,
    numero_pannelli_max: count,
    potenza_max_kwp: count && watt ? count * watt / 1000 : null,
    panel_capacity_watts: watt,
    panel_width_meters: positivo(sp.panelWidthMeters),
    panel_height_meters: positivo(sp.panelHeightMeters),
    azimut_dominante_deg: principale?.azimut ?? null,
    tilt_dominante_deg: principale?.inclinazione ?? null,
    layout_suggerito: layout,
  };
}
export function leggiFotoSolar(raw: unknown): FotoSolarFv | null {
  if (
    !record(raw) || typeof raw.data !== "string" ||
    !/^\d{4}-\d{2}-\d{2}$/.test(raw.data) ||
    !Number.isFinite(new Date(raw.data).getTime())
  ) return null;
  if (
    !record(raw) || typeof raw.path !== "string" ||
    !/^[-a-f0-9]{36}\/[-a-f0-9]{36}\/solar\/[-a-f0-9]{36}\.jpg$/.test(
      raw.path,
    ) || !n(raw.larghezza) || !n(raw.altezza) ||
    !Number.isInteger(raw.larghezza) || !Number.isInteger(raw.altezza) ||
    raw.larghezza < 2 || raw.altezza < 2 || raw.larghezza > 2048 ||
    raw.altezza > 2048 || !Array.isArray(raw.angoli) ||
    raw.angoli.length !== 3 || !raw.angoli.every(posizioneSolarValida) ||
    !qualitaSolarValida(raw.qualita) || typeof raw.data !== "string" ||
    !/^\d{4}-\d{2}-\d{2}$/.test(raw.data) ||
    new Date(raw.data).toISOString().slice(0, 10) !== raw.data ||
    !n(raw.risoluzione) || raw.risoluzione <= 0 || raw.risoluzione > 2
  ) return null;
  const [a, b, c] = raw.angoli;
  if (
    Math.abs(
        (b.lng - a.lng) * (c.lat - a.lat) - (c.lng - a.lng) * (b.lat - a.lat),
      ) < 1e-14 ||
    raw.angoli.some((p) =>
      Math.abs(p.lat - a.lat) > .01 || Math.abs(p.lng - a.lng) > .02
    )
  ) return null;
  return {
    path: raw.path,
    larghezza: raw.larghezza,
    altezza: raw.altezza,
    angoli: raw.angoli as FotoSolarFv["angoli"],
    data: raw.data,
    qualita: raw.qualita,
    risoluzione: raw.risoluzione,
  };
}
export function urlTiffSolar(raw: unknown): URL | null {
  if (typeof raw !== "string") return null;
  try {
    const u = new URL(raw);
    return u.protocol === "https:" && u.hostname === "solar.googleapis.com" &&
        u.pathname === "/v1/geoTiff:get" && !u.username && !u.password &&
        u.searchParams.has("id") && !u.searchParams.has("key")
      ? u
      : null;
  } catch {
    return null;
  }
}
