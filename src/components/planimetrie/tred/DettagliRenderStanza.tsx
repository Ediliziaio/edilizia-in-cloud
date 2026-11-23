import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useEffectiveCompanyId } from "@/hooks/useEffectiveCompanyId";
import { Armchair, DoorOpen, Focus, Loader2, RotateCcw, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { costruisciScena, vistaInternaArredata, type PiantaPer3D, type Scena3D, type Telecamera3D, type Vista3D } from "@/lib/planimetrie/tred";
import { modelloElemento } from "@/lib/planimetrie/tred/elementi";
import { inquadraDettaglio } from "@/lib/planimetrie/tred/inquadraturaArredi";
import { apertureDelLocale, proiezioneApertura } from "@/lib/planimetrie/tred/telecamera";
import { puntoNelPoligono } from "@/lib/planimetrie/tred/geometria2d";
import { renderFotorealisticoLocale } from "@/lib/planimetrie/renderFotorealisticoLocale";
import { leggiRenderVisita, salvaRenderVisita, type RenderVisitaSalvato, type VersioneRenderVisita } from "@/lib/planimetrie/renderVisitaArchivio";
import type { RiscontroRenderLocale } from "@/lib/planimetrie/riscontroRenderLocale";
import { nomeDelTipo, TIPI_ARREDO_3D } from "../editor/catalogo";
import { ConfrontoRender3D } from "./ConfrontoRender3D";

type Tipo = "apertura" | "arredo";
type Dettaglio = {
  id: string;
  tipo: Tipo;
  nome: string;
  misure: [nome: string, cm: number][];
  nelFotogramma?: "Inquadrata" | "Tagliata" | "Fuori campo";
  avviso?: string;
};
type Dimensioni = { larghezza: number; altezza: number };
type Stanza = { pianta: PiantaPer3D; vista: Vista3D; localeId: string; dimensioni: Dimensioni };
const formato = new Intl.NumberFormat("it-IT", { maximumFractionDigits: 1 });

function InquadraturaDettaglio({ pianta, vista, localeId, dimensioni, soggetto, salvata, nomeFile, onSalva }: Stanza & {
  soggetto: Dettaglio;
  salvata?: RenderVisitaSalvato;
  nomeFile: string;
  onSalva: (anteprima: Blob, png: Blob, localeCamera: string) => Promise<void>;
}) {
  const companyId = useEffectiveCompanyId();
  const [vistaPronta, setVistaPronta] = useState<{ anteprima: Blob; scena: Scena3D; telecamera: Telecamera3D; localeCamera: string }>();
  const [erroreVista, setErroreVista] = useState("");
  const [erroreRender, setErroreRender] = useState("");
  const [erroreSalvataggio, setErroreSalvataggio] = useState(false);
  const [tentativo, setTentativo] = useState(0);
  const [angoloDisponibile, setAngoloDisponibile] = useState(true);
  const [inCorso, setInCorso] = useState(false);
  const richiesta = useRef<AbortController | null>(null);
  const rapporto = dimensioni.larghezza / dimensioni.altezza;
  const { id, tipo } = soggetto;
  const preparaVista = useCallback(async (signal: AbortSignal) => {
    const { catturaVistaProgetto } = await import("./fotogramma");
    signal.throwIfAborted();
    const fuoco = inquadraDettaglio(pianta, localeId, { id, tipo }, vista, rapporto);
    if (!fuoco) return null;
    const { telecamera, localeId: localeCamera } = fuoco;
    const scena = costruisciScena(pianta, { vista, soffitto: true });
    const anteprima = await catturaVistaProgetto({ pianta, vista, localeId: localeCamera, scena, telecamera, ...dimensioni });
    return { anteprima, scena, telecamera, localeCamera };
  }, [pianta, vista, localeId, id, tipo, rapporto, dimensioni]);

  useEffect(() => {
    if (salvata) return;
    const controller = new AbortController();
    void preparaVista(controller.signal).then(vista => {
      if (controller.signal.aborted) return;
      setAngoloDisponibile(vista !== null);
      if (vista) setVistaPronta(vista);
    }).catch(() => {
      if (!controller.signal.aborted) setErroreVista("Anteprima 3D da ricaricare.");
    });
    return () => controller.abort();
  }, [preparaVista, salvata, tentativo]);
  useEffect(() => () => richiesta.current?.abort(), []);

  const calcola = async () => {
    if ((!vistaPronta && !salvata) || richiesta.current) return;
    const controller = new AbortController();
    richiesta.current = controller;
    setInCorso(true);
    setErroreRender("");
    setErroreSalvataggio(false);
    try {
      const inquadratura = vistaPronta ?? await preparaVista(controller.signal);
      if (!inquadratura) throw new Error("Lo spazio per la camera è insufficiente.");
      controller.signal.throwIfAborted();
      const { anteprima, scena, telecamera, localeCamera } = inquadratura;
      const png = await renderFotorealisticoLocale(scena, { telecamera, ...dimensioni, ambiente: "interni" }, controller.signal, undefined, { companyId });
      if (controller.signal.aborted) return;
      await onSalva(anteprima, png, localeCamera).catch(() => {
        if (!controller.signal.aborted) setErroreSalvataggio(true);
      });
    } catch (err) {
      if (!controller.signal.aborted) setErroreRender(err instanceof Error ? err.message : "Render del dettaglio da riprovare.");
    } finally {
      richiesta.current = null;
      if (!controller.signal.aborted) setInCorso(false);
    }
  };

  const localeCamera = salvata?.localeCamera ?? vistaPronta?.localeCamera;
  const nomeVista = localeCamera && localeCamera !== localeId ? pianta.locali.find(l => l.id === localeCamera)?.nome : undefined;
  return <article className="min-w-0 space-y-3">
    <div className="flex flex-wrap items-start justify-between gap-2">
      <div>
        <h3 className="text-base font-semibold">{soggetto.nome}</h3>
        <p className="text-xs text-muted-foreground">Quote del modello{nomeVista && " · Vista da " + nomeVista}</p>
      </div>
      {(vistaPronta || salvata) && <Button size="sm" variant={salvata ? "outline" : "default"} disabled={inCorso} onClick={() => void calcola()}>
        {inCorso ? <Loader2 aria-hidden="true" className="size-4 motion-safe:animate-spin" /> : <Sparkles aria-hidden="true" className="size-4" />}
        {inCorso ? "Calcolo del dettaglio…" : erroreRender ? "Riprova il render" : salvata ? "Ricalcola render" : "Calcola render del dettaglio"}
      </Button>}
      {erroreVista && <Button size="sm" variant="outline" onClick={() => { setErroreVista(""); setTentativo(n => n + 1); }}>
        <RotateCcw aria-hidden="true" className="size-4" /> Ricarica il 3D
      </Button>}
    </div>
    <dl className={cn("grid grid-cols-2 gap-2", soggetto.misure.length === 3 && "sm:grid-cols-3")}>
      {soggetto.misure.map(([nome, cm]) => <div key={nome} className="rounded-lg border bg-muted/30 px-3 py-2">
        <dt className="text-xs text-muted-foreground">{nome}</dt>
        <dd className="text-sm font-semibold tabular-nums">{formato.format(cm)} cm</dd>
      </div>)}
    </dl>
    {soggetto.avviso && <p className="text-sm text-amber-800 dark:text-amber-300">{soggetto.avviso}</p>}
    {erroreSalvataggio && <p role="status" className="text-sm text-amber-800 dark:text-amber-300">Salvataggio nel browser da riprovare. Puoi scaricare il PNG.</p>}
    {salvata && erroreRender && <p role="alert" className="text-sm text-destructive">{erroreRender}</p>}
    {!angoloDisponibile || erroreVista ? <p role="status" className="rounded-lg border bg-muted/40 p-3 text-sm text-muted-foreground">
      {erroreVista || "Lo spazio per la camera è insufficiente. Puoi controllare il dettaglio nella pianta."}
    </p> : <ConfrontoRender3D nome={soggetto.nome} nomeFile={nomeFile} rapporto={rapporto}
      riferimento={salvata?.anteprima ?? vistaPronta?.anteprima} risultato={salvata?.render} errore={erroreRender || undefined}
      testoAttesa={inCorso ? "Sto calcolando il render fotorealistico: può servire fino a un paio di minuti." : "Calcola il render dalla stessa inquadratura."} />}
  </article>;
}

export function DettagliRenderStanza({ pianta, vista, localeId, dimensioni, telecamera, riscontri, archivio, idVista, nomePiano }: Stanza & {
  telecamera?: Telecamera3D;
  riscontri?: RiscontroRenderLocale[];
  archivio?: VersioneRenderVisita;
  idVista: string;
  nomePiano: string;
}) {
  const locale = pianta.locali.find(l => l.id === localeId);
  const rapporto = dimensioni.larghezza / dimensioni.altezza;
  const camera = useMemo(() => telecamera ?? (locale ? vistaInternaArredata(pianta, localeId, { vista, aspetto: rapporto }) : undefined),
    [telecamera, locale, pianta, localeId, vista, rapporto]);
  const aperture: Dettaglio[] = apertureDelLocale(pianta, localeId, vista).map(a => {
    const proiezione = camera && proiezioneApertura(camera, rapporto, a);
    return {
      id: a.id, tipo: "apertura", nome: a.nome,
      nelFotogramma: !proiezione ? "Fuori campo" : proiezione.intera ? "Inquadrata" : "Tagliata",
      misure: [["Larghezza vano", a.larghezza_cm], ["Altezza vano", a.altezza_cm], ...(a.davanzale_cm > 0 ? [["Davanzale", a.davanzale_cm] as [string, number]] : [])],
      avviso: riscontri?.find(r => r.nome === a.nome)?.avviso,
    };
  });
  const arredi: Dettaglio[] = locale ? pianta.elementi.filter(e => TIPI_ARREDO_3D.has(e.tipo)
      && (e.localeId ? e.localeId === locale.id : puntoNelPoligono(e.centro, locale.contorno))).map(e => {
    const { l, p, h } = modelloElemento(e.tipo).misure;
    const cucina = ["cucina", "cucina_angolare", "isola_cucina"].includes(e.tipo);
    const angolo = e.tipo === "cucina_angolare";
    const letto = e.tipo.startsWith("letto");
    return { id: e.id, tipo: "arredo", nome: nomeDelTipo(e.tipo), misure: [
      [angolo ? "Lato lungo" : "Larghezza", e.larghezza ?? l * 100],
      [angolo ? "Ritorno" : letto ? "Lunghezza" : "Profondità", e.profondita ?? p * 100],
      [cucina ? "Altezza piano" : letto ? "Altezza materasso" : "Altezza", e.altezza ?? h * 100],
    ] };
  }) : [];
  const omonimi = new Map<string, number>();
  for (const a of arredi) omonimi.set(a.nome, (omonimi.get(a.nome) ?? 0) + 1);
  const numeri = new Map<string, number>();
  const arrediDistinti = arredi.map(a => {
    if (omonimi.get(a.nome) === 1) return a;
    const n = (numeri.get(a.nome) ?? 0) + 1;
    numeri.set(a.nome, n);
    return { ...a, nome: a.nome + " " + n };
  });
  const [filtro, setFiltro] = useState<Tipo>(() => aperture.length ? "apertura" : "arredo");
  const [selezione, setSelezione] = useState<string>();
  const [cache, setCache] = useState<Record<string, RenderVisitaSalvato>>({});
  const [lettoArchivio, setLettoArchivio] = useState(!archivio);
  const serie = useMemo((): VersioneRenderVisita | undefined => archivio && { ...archivio, serie: "dettagli" }, [archivio]);
  useEffect(() => {
    if (!serie) return;
    let attivo = true;
    void leggiRenderVisita(serie).catch((): RenderVisitaSalvato[] => []).then(viste => {
      if (!attivo) return;
      setCache(Object.fromEntries(viste.map(v => [v.id, v])));
      setLettoArchivio(true);
    });
    return () => { attivo = false; };
  }, [serie]);

  const elenco = filtro === "apertura" ? aperture : arrediDistinti;
  const soggetto = elenco.find(e => e.id === selezione) ?? elenco[0];
  if (!soggetto) return <p className="rounded-lg border bg-muted/40 p-3 text-sm text-muted-foreground">Nella stanza non ci sono aperture o arredi da inquadrare.</p>;

  const chiave = [idVista, soggetto.tipo, soggetto.id].join("/");
  const salva = async (anteprima: Blob, png: Blob, localeCamera: string) => {
    const dettaglio = { id: chiave, nome: soggetto.nome, piano: nomePiano, data: new Date().toISOString(), anteprima, render: png, localeCamera };
    setCache(prec => ({ ...prec, [chiave]: dettaglio }));
    if (serie) await salvaRenderVisita(serie, dettaglio);
  };
  return <section aria-label="Dettagli e misure della stanza" className="grid gap-4 rounded-xl border bg-card p-3 sm:p-4 lg:grid-cols-[minmax(12rem,15rem)_minmax(0,1fr)]">
    <div className="min-w-0 space-y-2">
      <div className="flex flex-wrap gap-1.5" role="group" aria-label="Elementi della stanza">
        {!!aperture.length && <Button size="sm" variant={filtro === "apertura" ? "default" : "outline"} aria-pressed={filtro === "apertura"} onClick={() => setFiltro("apertura")}>
          <DoorOpen className="size-4" aria-hidden="true" /> Aperture {aperture.length}
        </Button>}
        {!!arredi.length && <Button size="sm" variant={filtro === "arredo" ? "default" : "outline"} aria-pressed={filtro === "arredo"} onClick={() => setFiltro("arredo")}>
          <Armchair className="size-4" aria-hidden="true" /> Arredi {arredi.length}
        </Button>}
      </div>
      {filtro === "apertura" && <p className="text-xs text-muted-foreground">Posizione nella vista della stanza</p>}
      <ul className="max-h-40 space-y-1.5 overflow-y-auto p-0.5 lg:max-h-[26rem]">
        {elenco.map(e => <li key={e.id}>
          <button type="button" aria-pressed={e.id === soggetto.id} onClick={() => setSelezione(e.id)}
            className={cn("flex w-full items-center justify-between gap-2 rounded-lg border px-3 py-2 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              e.id === soggetto.id ? "border-primary/50 bg-primary/10" : "bg-background hover:bg-muted/60")}>
            <span className="min-w-0">
              <span className="block truncate text-sm font-medium">{e.nome}</span>
              <span className="block text-xs text-muted-foreground">
                {e.misure.slice(0, 2).map(([, cm]) => formato.format(cm)).join(" × ")} cm{e.nelFotogramma && " · " + e.nelFotogramma}
              </span>
            </span>
            <Focus className={cn("size-4 shrink-0", e.id === soggetto.id ? "text-primary" : "text-muted-foreground")} aria-hidden="true" />
          </button>
        </li>)}
      </ul>
    </div>
    {lettoArchivio ? <InquadraturaDettaglio key={chiave} {...{ pianta, vista, localeId, dimensioni }} soggetto={soggetto}
      salvata={cache[chiave]} nomeFile={chiave.replace(/[^\p{L}\d-]+/gu, "-") + "-cycles.png"} onSalva={salva} />
      : <p role="status" className="p-3 text-sm text-muted-foreground">Carico i dettagli della stanza…</p>}
  </section>;
}
