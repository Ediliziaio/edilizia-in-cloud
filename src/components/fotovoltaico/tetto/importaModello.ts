import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { OBJLoader } from "three/addons/loaders/OBJLoader.js";
import { MTLLoader } from "three/addons/loaders/MTLLoader.js";
import type { ModelloLocale } from "./rilievoLocale";
import type { P3 } from "./tettoReale";
export function puntoSulModello(gruppo: THREE.Object3D, p: {
    x: number;
    y: number;
}): P3 | null {
    gruppo.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(gruppo), ray = new THREE.Raycaster(new THREE.Vector3(p.x, box.max.y + 100, -p.y), new THREE.Vector3(0, -1, 0));
    const hit = ray.intersectObject(gruppo, true)[0];
    return hit ? { x: hit.point.x, y: -hit.point.z, z: hit.point.y } : null;
}
/** Sottrae l’origine in doppia precisione prima che OBJLoader crei i Float32. */
export function centraOBJ(testo: string, asseSu: "y" | "z") {
    const rx = /^v[ \t]+(\S+)[ \t]+(\S+)[ \t]+(\S+)([^\r\n]*)$/gm, min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
    let count = 0;
    for (const m of testo.matchAll(rx)) {
        const v = m.slice(1, 4).map(Number);
        if (!v.every(Number.isFinite) || ++count > 1500000)
            throw new Error("Vertici OBJ non validi o troppo numerosi.");
        v.forEach((n, i) => { min[i] = Math.min(min[i], n); max[i] = Math.max(max[i], n); });
    }
    if (!count)
        throw new Error("Il file OBJ non contiene vertici.");
    const origine = min.map((n, i) => i === (asseSu === "y" ? 1 : 2) ? n : (n + max[i]) / 2);
    return testo.replace(rx, (_r, x, y, z, resto) => `v ${Number(x) - origine[0]} ${Number(y) - origine[1]} ${Number(z) - origine[2]}${resto}`);
}
export function rilasciaModello(gruppo: THREE.Object3D) { const geo = new Set<THREE.BufferGeometry>(), mat = new Set<THREE.Material>(), tex = new Set<THREE.Texture>(); gruppo.traverse(o => { if (o instanceof THREE.Mesh) {
    geo.add(o.geometry);
    for (const m of Array.isArray(o.material) ? o.material : [o.material]) {
        mat.add(m);
        for (const v of Object.values(m))
            if (v instanceof THREE.Texture)
                tex.add(v);
    }
} }); geo.forEach(g => g.dispose()); mat.forEach(m => m.dispose()); tex.forEach(t => { const imm = t.source?.data; if (typeof ImageBitmap !== "undefined" && imm instanceof ImageBitmap)
    imm.close(); t.dispose(); }); }
export async function caricaModelloLocale(m: ModelloLocale): Promise<THREE.Group> {
    const principali = m.files.filter(f => /\.(glb|obj)$/i.test(f.name));
    if (principali.length !== 1)
        throw new Error("Seleziona un solo GLB oppure un OBJ con eventuali MTL e texture.");
    if (m.files.length > 32 || m.files.reduce((n, f) => n + f.size, 0) > 100 * 1024 * 1024)
        throw new Error("Il modello e le texture devono pesare al massimo 100 MB, con 32 file.");
    const urls = new Map<string, string>(), nomi = new Set<string>(), manager = new THREE.LoadingManager();
    let risultato: THREE.Group | null = null;
    try {
        for (const f of m.files) {
            const nome = f.name.toLowerCase();
            if (nomi.has(nome))
                throw new Error("Due risorse hanno lo stesso nome: esporta un pacchetto con nomi univoci.");
            nomi.add(nome);
            urls.set(nome, URL.createObjectURL(f));
        }
        manager.setURLModifier(url => { if (url.startsWith("blob:") || url.startsWith("data:"))
            return url; if (/^[a-z]+:/i.test(url) || url.startsWith("//"))
            throw new Error("Il modello contiene una risorsa esterna: incorpora le texture o selezionale insieme al modello."); const nome = decodeURIComponent(url.split(/[\\/]/).at(-1) ?? "").toLowerCase(), locale = urls.get(nome); if (!locale)
            throw new Error(`Risorsa locale mancante: ${nome}`); return locale; });
        const file = principali[0];
        if (/\.glb$/i.test(file.name)) {
            const buffer = await file.arrayBuffer(), view = new DataView(buffer);
            if (buffer.byteLength < 20 || view.getUint32(0, true) !== 0x46546c67 || view.getUint32(4, true) !== 2)
                throw new Error("GLB non valido: esporta un modello glTF 2.0.");
            const len = view.getUint32(12, true);
            if (20 + len > buffer.byteLength)
                throw new Error("GLB incompleto.");
            const json = JSON.parse(new TextDecoder().decode(new Uint8Array(buffer, 20, len)));
            for (const r of [...json.buffers ?? [], ...json.images ?? []])
                if (r.uri && /^(?:[a-z]+:|\/\/)/i.test(r.uri) && !r.uri.startsWith("data:"))
                    throw new Error("Il GLB deve avere risorse incorporate o file locali allegati.");
            const loader = new GLTFLoader(manager);
            // ImageBitmapLoader usa fetch(blob:), vietato dalla CSP del sito.
            // TextureLoader decodifica le stesse immagini con img-src, già autorizzato.
            loader.register(parser => {
                parser.textureLoader = new THREE.TextureLoader(manager);
                return { name: "FV_texture_locali" };
            });
            risultato = (await loader.parseAsync(buffer, "")).scene;
        }
        else {
            let fine: () => void = () => { }, errore: (e: Error) => void = () => { };
            const attesa = new Promise<void>((resolve, reject) => { fine = resolve; errore = reject; });
            void attesa.catch(() => { });
            manager.onLoad = fine;
            manager.onError = url => errore(new Error(`Texture non caricata: ${url}`));
            manager.itemStart("__preparazione__");
            const obj = new OBJLoader(manager), mtl = m.files.find(f => /\.mtl$/i.test(f.name));
            try {
                if (mtl) {
                    const materiali = new MTLLoader(manager).parse(await mtl.text(), "");
                    materiali.preload();
                    obj.setMaterials(materiali);
                }
                risultato = obj.parse(centraOBJ(await file.text(), m.allineamento.asseSu));
            }
            finally {
                manager.itemEnd("__preparazione__");
            }
            await attesa;
        }
        risultato.updateMatrixWorld(true);
        let vertici = 0;
        risultato.traverse(o => { if (o instanceof THREE.SkinnedMesh)
            throw new Error("Importa un modello statico del fabbricato."); if (o instanceof THREE.Mesh) {
            vertici += o.geometry.getAttribute("position")?.count ?? 0;
            o.castShadow = true;
            o.receiveShadow = true;
        } });
        if (!vertici || vertici > 1500000)
            throw new Error("Il modello deve avere da 1 a 1.500.000 vertici: esporta una copia alleggerita per il preventivo.");
        const a = m.allineamento;
        if (![a.scala, a.rotazione, a.x, a.y, a.z].every(Number.isFinite) || a.scala < .001 || a.scala > 1000)
            throw new Error("Scala o allineamento non validi.");
        const contenitore = new THREE.Group();
        contenitore.add(risultato);
        if (a.asseSu === "z")
            contenitore.rotation.x = -Math.PI / 2;
        contenitore.scale.setScalar(a.scala);
        contenitore.updateMatrixWorld(true);
        const box = new THREE.Box3().setFromObject(contenitore), centro = box.getCenter(new THREE.Vector3()), size = box.getSize(new THREE.Vector3());
        if (![size.x, size.y, size.z].every(v => Number.isFinite(v) && v < 2000))
            throw new Error("Dimensioni del modello fuori scala: verifica unità e scala.");
        const ruota = new THREE.Group();
        contenitore.position.set(-centro.x, -box.min.y, -centro.z);
        ruota.add(contenitore);
        ruota.rotation.y = -a.rotazione * Math.PI / 180;
        ruota.position.set(a.x, a.z, -a.y);
        ruota.updateMatrixWorld(true);
        return ruota;
    }
    catch (e) {
        if (risultato)
            rilasciaModello(risultato);
        throw e;
    }
    finally {
        urls.forEach(url => URL.revokeObjectURL(url));
    }
}
export function correggiAltezzaMesh(gruppo: THREE.Object3D, quota: (z: number) => number) {
    const vecchie = new Set<THREE.BufferGeometry>();
    gruppo.updateMatrixWorld(true);
    gruppo.traverse(o => { if (!(o instanceof THREE.Mesh))
        return; vecchie.add(o.geometry); o.geometry = o.geometry.clone(); const inverse = o.matrixWorld.clone().invert(), p = o.geometry.getAttribute("position"), v = new THREE.Vector3(); for (let i = 0; i < p.count; i++) {
        v.fromBufferAttribute(p, i).applyMatrix4(o.matrixWorld);
        v.y = quota(v.y);
        v.applyMatrix4(inverse);
        p.setXYZ(i, v.x, v.y, v.z);
    } p.needsUpdate = true; o.geometry.computeVertexNormals(); o.geometry.computeBoundingBox(); o.geometry.computeBoundingSphere(); });
    vecchie.forEach(g => g.dispose());
}
