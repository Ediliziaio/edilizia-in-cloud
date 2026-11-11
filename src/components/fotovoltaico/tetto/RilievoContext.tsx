import { createContext, useContext, useEffect, useState } from "react";
import { Box3 } from "three";
import { edificioCorretto, funzioneAltezza, mondoPixel, pixelMondo, type RilievoRuntime, type RilievoLocale, type OrtoRuntime } from "./rilievoLocale";
import { useArchivioRilievi } from "./archivioRilievi";
import { caricaModelloLocale, correggiAltezzaMesh, rilasciaModello } from "./importaModello";
import { RUNTIME_VUOTO } from "./schema3d";
import type { P3 } from "./tettoReale";
export { RUNTIME_VUOTO } from "./schema3d";
export const RilievoContext = createContext<RilievoRuntime>(RUNTIME_VUOTO);
export const useRilievo = () => useContext(RilievoContext);
export function proiettaFoto(orto: OrtoRuntime, p: P3) { return mondoPixel(orto.affine, p); }
export function proiettaUV(orto: OrtoRuntime, p: P3) { const q = proiettaFoto(orto, p); return { u: q.x / orto.larghezza, v: 1 - q.y / orto.altezza }; }
export function verticiOrto(orto: OrtoRuntime): P3[] { return [{ x: 0, y: 0 }, { x: orto.larghezza, y: 0 }, { x: orto.larghezza, y: orto.altezza }, { x: 0, y: orto.altezza }].map(p => ({ ...pixelMondo(orto.affine, p), z: 0 })); }
export async function preparaRuntime(fonte: RilievoLocale) {
    let modello: RilievoRuntime["modello"] = null, url: string | null = null;
    try {
        if (fonte.modello) {
            modello = await caricaModelloLocale(fonte.modello);
            const altezzaModello = new Box3().setFromObject(modello).max.y;
            fonte = { ...fonte, edificioBase: { ...fonte.edificioBase, attributi: { ...fonte.edificioBase.attributi, altezzaModello } } };
            if (fonte.altezzaManuale !== null)
                correggiAltezzaMesh(modello, funzioneAltezza(fonte.edificioBase, fonte.altezzaManuale));
        }
        if (fonte.orto)
            url = URL.createObjectURL(fonte.orto.blob);
        const runtime: RilievoRuntime = { fonte, edificio: edificioCorretto(fonte), modello, orto: fonte.orto && url ? { ...fonte.orto, url } : null };
        return { runtime, rilascia: () => { if (modello)
                rilasciaModello(modello); if (url)
                URL.revokeObjectURL(url); } };
    }
    catch (e) {
        if (modello)
            rilasciaModello(modello);
        if (url)
            URL.revokeObjectURL(url);
        throw e;
    }
}
export function useRilievoArchiviato(id: string | undefined) {
    const archivio = useArchivioRilievi(), [stato, setStato] = useState<{
        id: string;
        runtime: RilievoRuntime | null;
        errore: string;
    } | null>(null);
    useEffect(() => {
        if (!id)
            return;
        let annullato = false, rilascia: (() => void) | undefined;
        (async () => { try {
            const fonte = await archivio.leggi(id);
            if (!fonte)
                throw Error("Rilievo non presente nell’archivio dell’azienda.");
            const p = await preparaRuntime(fonte);
            if (annullato) {
                p.rilascia();
                return;
            }
            rilascia = p.rilascia;
            setStato({ id, runtime: p.runtime, errore: "" });
        }
        catch (e) {
            if (!annullato)
                setStato({ id, runtime: null, errore: e instanceof Error ? e.message : "Rilievo non leggibile." });
        } })();
        return () => { annullato = true; rilascia?.(); };
    }, [id, archivio]);
    if (!id)
        return { runtime: null as RilievoRuntime | null, errore: "", caricando: false };
    return stato?.id === id ? { ...stato, caricando: false } : { runtime: null, errore: "", caricando: true };
}
