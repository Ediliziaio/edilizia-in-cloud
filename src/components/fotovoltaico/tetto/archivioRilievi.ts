import { createContext, useContext } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { RilievoLocale } from "./rilievoLocale";
export type ArchivioRilievi = {
    salva: (r: RilievoLocale) => Promise<void>;
    leggi: (id: string) => Promise<RilievoLocale | null>;
};
export const ArchivioRilieviContext = createContext<ArchivioRilievi | null>(null);
export function useArchivioRilievi() { const a = useContext(ArchivioRilieviContext); if (!a)
    throw Error("Archivio rilievi dell’azienda non disponibile."); return a; }
const BUCKET = "fv-rilievi";
const idValido = (s: string) => /^[a-zA-Z0-9_-]{1,80}$/.test(s);
type Asset = {
    path: string;
    nome: string;
    tipo: string;
};
type Manifest = Omit<RilievoLocale, "orto" | "modello"> & {
    orto: (Omit<NonNullable<RilievoLocale["orto"]>, "blob" | "originale"> & {
        immagine: Asset;
        originaleFile: Asset;
    }) | null;
    modello: (Omit<NonNullable<RilievoLocale["modello"]>, "files"> & {
        risorse: Asset[];
    }) | null;
};
export function creaArchivioRilievi(companyId: string, client: Pick<typeof supabase, "storage"> = supabase): ArchivioRilievi {
    const prefix = `${companyId}/`, bucket = client.storage.from(BUCKET), caricati = new Set<string>();
    if (!idValido(companyId))
        throw Error("Azienda del rilievo non valida.");
    const upload = async (path: string, blob: Blob, esistente = false) => { const { error } = await bucket.upload(path, blob, { upsert: false, contentType: blob.type || "application/octet-stream" }); if (error && !(esistente && String((error as {
        statusCode?: string;
    }).statusCode) === "409"))
        throw Error("Salvataggio del rilievo non riuscito. Verifica accesso e dimensione dei file."); };
    const asset = async (blob: Blob, nome: string): Promise<Asset> => { if (blob.size > 100 * 1024 * 1024)
        throw Error("Ogni risorsa deve pesare al massimo 100 MB."); const bytes = await crypto.subtle.digest("SHA-256", await blob.arrayBuffer()), hash = Array.from(new Uint8Array(bytes), v => v.toString(16).padStart(2, "0")).join(""); const path = `${prefix}assets/${hash}`; if (!caricati.has(path)) {
        await upload(path, blob, true);
        caricati.add(path);
    } return { path, nome, tipo: blob.type || "application/octet-stream" }; };
    const download = async (a: Asset) => { if (!a || !a.path.startsWith(prefix + "assets/") || !new RegExp("^" + prefix + "assets/[a-f0-9]{64}$").test(a.path))
        throw Error("Risorsa del rilievo appartenente a un’altra azienda o non valida."); const { data, error } = await bucket.download(a.path); if (error || !data)
        throw Error("Una risorsa del rilievo non è disponibile. Reimporta i file originali."); return data; };
    return {
        async salva(r) {
            if (!idValido(r.id) || !r.allineamentoConfermato || !r.edificioBase.facce.length)
                throw Error("Completa e conferma il rilievo prima di salvarlo.");
            let orto: Manifest["orto"] = null, modello: Manifest["modello"] = null;
            if (r.orto) {
                const { blob, originale, ...meta } = r.orto;
                orto = { ...meta, immagine: await asset(blob, "ortofoto.png"), originaleFile: await asset(originale ?? blob, "ortofoto-originale") };
            }
            if (r.modello) {
                const { files, ...meta } = r.modello;
                modello = { ...meta, risorse: await Promise.all(files.map(f => asset(f, f.name))) };
            }
            const manifest: Manifest = { ...r, orto, modello };
            const json = JSON.stringify(manifest);
            if (json.length > 2000000)
                throw Error("Geometria del rilievo troppo grande.");
            await upload(`${prefix}rilievi/${r.id}.json`, new Blob([json], { type: "application/json" }));
        },
        async leggi(id) {
            if (!idValido(id))
                throw Error("Identificativo del rilievo non valido.");
            const { data, error } = await bucket.download(`${prefix}rilievi/${id}.json`);
            if (error || !data)
                throw Error("Rilievo non disponibile nell’archivio dell’azienda. Verifica l’accesso oppure reimporta gli originali.");
            if (data.size > 2000000)
                throw Error("Manifesto del rilievo troppo grande.");
            const m = JSON.parse(await data.text()) as Manifest;
            if (m.versione !== 1 || m.id !== id || !m.allineamentoConfermato || !Array.isArray(m.edificioBase?.facce) || !m.edificioBase.facce.length || m.edificioBase.facce.length > 1024 || m.edificioBase.facce.some(f => !Array.isArray(f.anelli) || f.anelli.some(a => !Array.isArray(a) || a.length > 128 || a.some(p => ![p.x, p.y, p.z].every(Number.isFinite)))))
                throw Error("Geometria archiviata non valida.");
            let orto: RilievoLocale["orto"] = null, modello: RilievoLocale["modello"] = null;
            if (m.orto) {
                const { immagine, originaleFile, ...meta } = m.orto;
                orto = { ...meta, blob: await download(immagine), originale: await download(originaleFile) };
            }
            if (m.modello) {
                const { risorse, ...meta } = m.modello;
                if (!Array.isArray(risorse) || risorse.length > 32)
                    throw Error("Risorse del modello non valide.");
                modello = { ...meta, files: await Promise.all(risorse.map(async (a) => new File([await download(a)], a.nome, { type: a.tipo }))) };
            }
            return { ...m, orto, modello };
        }
    };
}
