/**
 * Il 3D della pianta: dall'alto, girandoci intorno, o dentro una stanza ad altezza d'occhi.
 *
 * Importa three.js: non importarlo direttamente da pagine dell'app, usare
 * `Vista3DPigra` (lo carica solo quando serve, in un chunk a parte).
 */
import { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { Box, Download, Eye, Map as MappaIcona, Rotate3d } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { cn } from "@/lib/utils";
import {
  costruisciScena,
  esportaGlb,
  esportaObj,
  vistaDallAlto,
  vistaDentroLocale,
  vistaGiroIntorno,
  type PiantaPer3D,
  type Scena3D,
  type Telecamera3D,
  type Vista3D as VistaLavori,
} from "@/lib/planimetrie/tred";
import { catturaFotogramma, type Fotogramma } from "./tred/fotogramma";
import { adattaAmbiente, applicaTelecamera, creaGruppo, liberaGruppo, preparaAmbiente } from "./tred/scenaThree";

export type ModoVista = "alto" | "giro" | "dentro";

export interface Vista3DProps {
  /** Stato di fatto e progetto (con gli stati nuovo/da demolire). Senza proposte sono la stessa pianta. */
  piante: { fatto: PiantaPer3D; progetto: PiantaPer3D };
  /** Nome dei file scaricati, senza estensione. */
  nomeFile?: string;
  className?: string;
  /** Se c'è, dentro una stanza compare «Usa questa vista per il render». */
  onFotogramma?: (f: Fotogramma) => void;
  /** Come si apre (predefinito: «gira intorno»). Con «dentro» si entra subito in `localeIniziale`. */
  modoIniziale?: ModoVista;
  /** Stato di fatto o progetto all'apertura (predefinito: progetto). */
  vistaIniziale?: VistaLavori;
  /** La stanza scelta all'apertura (predefinito: la prima). */
  localeIniziale?: string;
}

export interface Vista3DHandle {
  /** Telecamera di adesso. */
  telecamera(): Telecamera3D;
  /** Fotogramma della vista di adesso (serve un locale: quello scelto, o il primo). */
  fotogramma(misure?: { larghezza: number; altezza: number }): Promise<Fotogramma>;
}

interface Motore {
  renderer: THREE.WebGLRenderer;
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  controlli: OrbitControls | null;
  gruppo: THREE.Group | null;
  ambiente: ReturnType<typeof preparaAmbiente>;
  disegna: () => void;
}

const PASSO = 0.25;

function scarica(dati: BlobPart, nome: string, tipo: string) {
  const url = URL.createObjectURL(new Blob([dati], { type: tipo }));
  const a = document.createElement("a");
  a.href = url;
  a.download = nome;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

const Vista3D = forwardRef<Vista3DHandle, Vista3DProps>(function Vista3D({ piante, nomeFile = "planimetria", className, onFotogramma, modoIniziale = "giro", vistaIniziale = "progetto", localeIniziale }, ref) {
  const contenitore = useRef<HTMLDivElement>(null);
  const motore = useRef<Motore | null>(null);
  const [vista, setVista] = useState<VistaLavori>(vistaIniziale);
  const [modo, setModo] = useState<ModoVista>(modoIniziale);
  const [localeId, setLocaleId] = useState<string>(
    localeIniziale && (vistaIniziale === "fatto" ? piante.fatto : piante.progetto).locali.some((l) => l.id === localeIniziale)
      ? localeIniziale
      : ((vistaIniziale === "fatto" ? piante.fatto : piante.progetto).locali[0]?.id ?? ""),
  );
  const [soffitto, setSoffitto] = useState(modoIniziale === "dentro");
  const [arredi, setArredi] = useState(true);
  const [occupato, setOccupato] = useState(false);
  const [errore, setErrore] = useState<string | null>(null);

  const pianta = vista === "fatto" ? piante.fatto : piante.progetto;
  const locali = pianta.locali;
  const conStati = useMemo(
    () => piante.progetto.muri.some((m) => m.stato !== "esistente") || piante.progetto.aperture.some((a) => a.stato !== "esistente") || piante.fatto !== piante.progetto,
    [piante],
  );
  const scena: Scena3D = useMemo(() => costruisciScena(pianta, { vista, soffitto, elementi: arredi }), [pianta, vista, soffitto, arredi]);

  // Avvio di three.js, una volta.
  useEffect(() => {
    const div = contenitore.current;
    if (!div) return;
    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
    } catch {
      setErrore("Questo browser non riesce a mostrare il 3D (WebGL non disponibile).");
      return;
    }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.domElement.style.display = "block";
    renderer.domElement.style.touchAction = "none";
    div.appendChild(renderer.domElement);
    const scene = new THREE.Scene();
    const ambiente = preparaAmbiente(renderer, scene);
    const camera = new THREE.PerspectiveCamera(45, 1, 0.05, 500);
    const m: Motore = { renderer, scene, camera, controlli: null, gruppo: null, ambiente, disegna: () => renderer.render(scene, camera) };
    motore.current = m;
    const ridimensiona = () => {
      const w = Math.max(1, div.clientWidth);
      const h = Math.max(1, div.clientHeight);
      renderer.setSize(w, h, false);
      renderer.domElement.style.width = "100%";
      renderer.domElement.style.height = "100%";
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      m.disegna();
    };
    const ro = new ResizeObserver(ridimensiona);
    ro.observe(div);
    ridimensiona();
    return () => {
      ro.disconnect();
      m.controlli?.dispose();
      if (m.gruppo) liberaGruppo(m.gruppo);
      ambiente.libera();
      renderer.dispose();
      renderer.domElement.remove();
      motore.current = null;
    };
  }, []);

  // Scena: si rifà quando cambiano pianta, vista, soffitto o arredi.
  useEffect(() => {
    const m = motore.current;
    if (!m) return;
    if (m.gruppo) {
      m.scene.remove(m.gruppo);
      liberaGruppo(m.gruppo);
    }
    m.gruppo = creaGruppo(scena);
    m.scene.add(m.gruppo);
    adattaAmbiente(m.ambiente, scena);
    m.disegna();
  }, [scena]);

  // Telecamera e comandi: si rifanno quando cambia il modo o la stanza.
  const limiti = scena.limiti;
  const chiaveLimiti = limiti.min.concat(limiti.max).map((x) => x.toFixed(2)).join(",");
  useEffect(() => {
    const m = motore.current;
    if (!m) return;
    const aspetto = m.camera.aspect || 1;
    const locale = locali.find((l) => l.id === localeId) ?? locali[0];
    const t = modo === "alto" ? vistaDallAlto(limiti, aspetto) : modo === "dentro" && locale ? vistaDentroLocale(locale) : vistaGiroIntorno(limiti, aspetto);
    applicaTelecamera(m.camera, t);
    m.controlli?.dispose();
    const c = new OrbitControls(m.camera, m.renderer.domElement);
    c.target.set(...t.guarda);
    if (modo === "alto") {
      c.enableRotate = false;
      c.screenSpacePanning = true;
      c.minDistance = 2;
      c.maxDistance = 200;
    } else if (modo === "giro") {
      c.maxPolarAngle = Math.PI * 0.49;
      c.minDistance = 1;
      c.maxDistance = 200;
    } else {
      // Dentro la stanza: si gira la testa attorno a un punto appena davanti agli occhi.
      const avanti = new THREE.Vector3(...t.guarda).sub(new THREE.Vector3(...t.posizione)).normalize().multiplyScalar(0.05);
      c.target.copy(m.camera.position).add(avanti);
      c.enableZoom = false;
      c.enablePan = false;
      c.rotateSpeed = -0.35;
      c.minPolarAngle = Math.PI * 0.2;
      c.maxPolarAngle = Math.PI * 0.8;
    }
    c.update();
    c.addEventListener("change", m.disegna);
    m.controlli = c;
    m.disegna();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [modo, localeId, chiaveLimiti]);

  // Dentro la stanza: frecce/WASD e rotella per camminare.
  const cammina = useCallback((avanti: number, lato: number) => {
    const m = motore.current;
    if (!m?.controlli) return;
    const dir = new THREE.Vector3();
    m.camera.getWorldDirection(dir);
    dir.y = 0;
    if (dir.lengthSq() < 1e-6) return;
    dir.normalize();
    const destra = new THREE.Vector3().crossVectors(dir, new THREE.Vector3(0, 1, 0));
    const passo = dir.multiplyScalar(avanti * PASSO).add(destra.multiplyScalar(lato * PASSO));
    m.camera.position.add(passo);
    m.controlli.target.add(passo);
    m.controlli.update();
    m.disegna();
  }, []);

  useEffect(() => {
    const m = motore.current;
    if (!m || modo !== "dentro") return;
    const tela = m.renderer.domElement;
    const rotella = (e: WheelEvent) => {
      e.preventDefault();
      cammina(e.deltaY < 0 ? 1 : -1, 0);
    };
    tela.addEventListener("wheel", rotella, { passive: false });
    return () => tela.removeEventListener("wheel", rotella);
  }, [modo, cammina]);

  const tasto = (e: React.KeyboardEvent) => {
    if (modo !== "dentro") return;
    const k = e.key.toLowerCase();
    const mosse: Record<string, [number, number]> = { arrowup: [1, 0], w: [1, 0], arrowdown: [-1, 0], s: [-1, 0], arrowleft: [0, -1], a: [0, -1], arrowright: [0, 1], d: [0, 1] };
    if (mosse[k]) {
      e.preventDefault();
      cammina(...mosse[k]);
    }
  };

  const telecameraAdesso = useCallback((): Telecamera3D => {
    const m = motore.current;
    if (!m) throw new Error("3D non pronto.");
    const dir = new THREE.Vector3();
    m.camera.getWorldDirection(dir);
    const p = m.camera.position;
    return {
      posizione: [p.x, p.y, p.z],
      guarda: [p.x + dir.x, p.y + dir.y, p.z + dir.z],
      alto: [m.camera.up.x, m.camera.up.y, m.camera.up.z],
      fov: m.camera.fov,
    };
  }, []);

  const fotogramma = useCallback(
    async (misure?: { larghezza: number; altezza: number }) => {
      const id = locali.some((l) => l.id === localeId) ? localeId : locali[0]?.id;
      if (!id) throw new Error("La pianta non ha locali.");
      return catturaFotogramma({ pianta, localeId: id, telecamera: telecameraAdesso(), vista, elementi: arredi, ...misure });
    },
    [pianta, locali, localeId, vista, arredi, telecameraAdesso],
  );

  useImperativeHandle(ref, () => ({ telecamera: telecameraAdesso, fotogramma }), [telecameraAdesso, fotogramma]);

  const cambiaModo = (v: string) => {
    if (!v) return;
    setModo(v as ModoVista);
    setSoffitto(v === "dentro");
  };

  const esegui = async (lavoro: () => Promise<void> | void) => {
    setOccupato(true);
    try {
      await lavoro();
    } finally {
      setOccupato(false);
    }
  };

  const scaricaObj = () =>
    esegui(async () => {
      const { obj, mtl } = esportaObj(scena, `${nomeFile}.mtl`);
      const { default: JSZip } = await import("jszip");
      const zip = new JSZip();
      zip.file(`${nomeFile}.obj`, obj);
      zip.file(`${nomeFile}.mtl`, mtl);
      scarica(await zip.generateAsync({ type: "blob" }), `${nomeFile}-obj.zip`, "application/zip");
    });

  const suggerimento =
    modo === "alto"
      ? "Trascina per spostarti, rotella o due dita per avvicinarti."
      : modo === "giro"
        ? "Trascina per girare intorno, rotella o due dita per avvicinarti, tasto destro per spostarti."
        : "Trascina per guardarti intorno. Frecce o rotella per camminare.";

  return (
    <div className={cn("flex flex-col gap-3", className)}>
      <div className="flex flex-wrap items-center gap-2">
        <ToggleGroup type="single" value={modo} onValueChange={cambiaModo} variant="outline" size="sm" aria-label="Come guardare">
          <ToggleGroupItem value="alto" aria-label="Vista dall'alto">
            <MappaIcona className="mr-1 h-4 w-4" />
            Dall'alto
          </ToggleGroupItem>
          <ToggleGroupItem value="giro" aria-label="Gira intorno">
            <Rotate3d className="mr-1 h-4 w-4" />
            Gira intorno
          </ToggleGroupItem>
          <ToggleGroupItem value="dentro" aria-label="Entra nella stanza">
            <Eye className="mr-1 h-4 w-4" />
            Entra nella stanza
          </ToggleGroupItem>
        </ToggleGroup>
        {modo === "dentro" && locali.length > 0 && (
          <Select value={localeId} onValueChange={setLocaleId}>
            <SelectTrigger className="h-9 w-44" aria-label="Stanza">
              <SelectValue placeholder="Scegli la stanza" />
            </SelectTrigger>
            <SelectContent>
              {locali.map((l) => (
                <SelectItem key={l.id} value={l.id}>
                  {l.nome}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
        <div className="ml-auto flex flex-wrap items-center gap-2">
          <Button variant="outline" size="sm" disabled={occupato} onClick={() => esegui(() => scarica(esportaGlb(scena), `${nomeFile}.glb`, "model/gltf-binary"))}>
            <Download className="mr-1 h-4 w-4" />
            Scarica GLB
          </Button>
          <Button variant="outline" size="sm" disabled={occupato} onClick={scaricaObj}>
            <Box className="mr-1 h-4 w-4" />
            Scarica OBJ
          </Button>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-sm">
        {conStati && (
          <ToggleGroup type="single" value={vista} onValueChange={(v) => v && setVista(v as VistaLavori)} variant="outline" size="sm" aria-label="Cosa mostrare">
            <ToggleGroupItem value="fatto">Stato di fatto</ToggleGroupItem>
            <ToggleGroupItem value="progetto">Progetto</ToggleGroupItem>
            <ToggleGroupItem value="confronto">
              <span className="mr-1 inline-block h-2.5 w-2.5 rounded-sm bg-[#f2c200]" />
              <span className="mr-1 inline-block h-2.5 w-2.5 rounded-sm bg-[#d42a2a]" />
              Demolizioni e nuovo
            </ToggleGroupItem>
          </ToggleGroup>
        )}
        <div className="flex items-center gap-2">
          <Switch id="vista3d-soffitto" checked={soffitto} onCheckedChange={setSoffitto} />
          <Label htmlFor="vista3d-soffitto">Soffitto</Label>
        </div>
        <div className="flex items-center gap-2">
          <Switch id="vista3d-arredi" checked={arredi} onCheckedChange={setArredi} />
          <Label htmlFor="vista3d-arredi">Arredi e sanitari</Label>
        </div>
        {modo === "dentro" && onFotogramma && (
          <Button size="sm" disabled={occupato} onClick={() => esegui(async () => onFotogramma(await fotogramma()))}>
            Usa questa vista per il render
          </Button>
        )}
      </div>

      <div
        ref={contenitore}
        tabIndex={0}
        onKeyDown={tasto}
        className="relative h-[60vh] min-h-[320px] w-full overflow-hidden rounded-lg border bg-[#eef1f4] outline-none focus-visible:ring-2 focus-visible:ring-ring"
        aria-label="Vista 3D della pianta"
      >
        {errore && <div className="absolute inset-0 flex items-center justify-center p-6 text-center text-sm text-muted-foreground">{errore}</div>}
        {vista === "confronto" && (
          <div className="pointer-events-none absolute left-3 top-3 flex gap-3 rounded-md bg-white/85 px-2.5 py-1.5 text-xs text-neutral-700 shadow-sm">
            <span className="flex items-center gap-1"><span className="inline-block h-2.5 w-2.5 rounded-sm bg-[#f2c200]" />Da demolire</span>
            <span className="flex items-center gap-1"><span className="inline-block h-2.5 w-2.5 rounded-sm bg-[#d42a2a]" />Nuovo</span>
          </div>
        )}
      </div>
      <p className="text-xs text-muted-foreground">{suggerimento}</p>
      {scena.avvisi.length > 0 && (
        <ul className="list-disc pl-5 text-xs text-amber-700">
          {scena.avvisi.map((a) => (
            <li key={a}>{a}</li>
          ))}
        </ul>
      )}
    </div>
  );
});

export default Vista3D;
