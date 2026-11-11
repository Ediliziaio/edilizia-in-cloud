import type { GruppoPVGIS } from "./capannone";
export function richiestaProduzione(raw: Record<string, unknown>) {
    const lat = Number(raw.lat), lng = Number(raw.lng), kwp = Number(raw.kwp);
    if (![lat, lng, kwp].every(Number.isFinite) || lat < 35 || lat > 47.5 || lng < 6 || lng > 19 || kwp <= 0 || kwp > 10000)
        throw new Error("Località o potenza non valida.");
    let gruppi: GruppoPVGIS[];
    if (Array.isArray(raw.gruppi) && raw.gruppi.length > 0 && raw.gruppi.length <= 24) {
        gruppi = raw.gruppi.map(g => { if (!g || typeof g !== "object")
            throw new Error("Gruppo PVGIS non valido."); const r = g as Record<string, unknown>, inclinazione = Number(r.inclinazione), azimut = Number(r.azimut), potenza = Number(r.kwp); if (![inclinazione, azimut, potenza].every(Number.isFinite) || inclinazione < 0 || inclinazione > 80 || azimut < 0 || azimut >= 360 || potenza <= 0 || potenza > 10000)
            throw new Error("Orientamento o potenza del gruppo non validi."); return { inclinazione, azimut, kwp: potenza, moduli: Number(r.moduli) || 0 }; });
        if (Math.abs(gruppi.reduce((n, g) => n + g.kwp, 0) - kwp) > .01)
            throw new Error("La potenza dei gruppi non coincide con il preventivo.");
    }
    else if (raw.gruppi !== undefined)
        throw new Error("Il disegno deve contenere da 1 a 24 gruppi di produzione.");
    else
        gruppi = [{ inclinazione: Number(raw.inclinazione ?? 30), azimut: Number(raw.azimut ?? 180), kwp, moduli: 0 }];
    if (gruppi.some(g => !Number.isFinite(g.inclinazione) || g.inclinazione < 0 || g.inclinazione > 80 || !Number.isFinite(g.azimut) || g.azimut < 0 || g.azimut >= 360))
        throw new Error("Orientamento non valido.");
    return { lat, lng, kwp, gruppi };
}
export function parametriPVGIS(lat: number, lng: number, g: GruppoPVGIS) { return new URLSearchParams({ lat: String(lat), lon: String(lng), peakpower: "1", loss: "14", angle: String(g.inclinazione), aspect: String(((g.azimut - 180 + 540) % 360) - 180), mountingplace: "free", outputformat: "json", raddatabase: "PVGIS-SARAH3" }); }
export function aggregaIrraggiamento(gruppi: GruppoPVGIS[], irraggiamenti: number[]) {
    if (gruppi.length !== irraggiamenti.length || !irraggiamenti.every(x => Number.isFinite(x) && x > 0))
        throw new Error("PVGIS non ha fornito una stima utilizzabile per tutte le esposizioni.");
    const kwp = gruppi.reduce((n, g) => n + g.kwp, 0);
    if (!(kwp > 0))
        throw new Error("Potenza assente.");
    return gruppi.reduce((n, g, i) => n + g.kwp * irraggiamenti[i], 0) / kwp;
}
