import { useEffect, useRef, useState } from "react";
import { useEffectiveCompanyId } from "@/hooks/useEffectiveCompanyId";
import { Building2, Check, Download, Focus, ImageIcon, Loader2, RotateCcw, Ruler } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  costruisciScena, pianiDaPlanimetria, scenaEdificio, vistaDalGiardino, vistaDallAlto, vistaGiroIntorno, vistaInternaArredata,
  type PianoPer3D, type Telecamera3D,
} from "@/lib/planimetrie/tred";
import { leggiAspetto } from "@/lib/planimetrie/tred/aspettoOpzioni";
import { definizioneCampo } from "@/lib/planimetrie/campiSport";
import { descrizioneMotoreFotorealistico, renderFotorealisticoLocale } from "@/lib/planimetrie/renderFotorealisticoLocale";
import { riscontroRenderLocale, riscontroStanzaRenderLocale, type RiscontroRenderLocale } from "@/lib/planimetrie/riscontroRenderLocale";
import { leggiRenderVisita, salvaRenderVisita, type RenderVisitaSalvato, type VersioneRenderVisita } from "@/lib/planimetrie/renderVisitaArchivio";
import { scaricaBlob } from "@/components/orders/generali/vendita/scarica";
import { eAmbienteInterno } from "../../../../shared/planimetrie/modello.ts";
import { useBlobRef } from "../useBlobRef";
import { ConfrontoRender3D } from "../tred/ConfrontoRender3D";
import { DettagliRenderStanza } from "../tred/DettagliRenderStanza";
import type { Planimetria } from "./adattatore";
import type { RenderChatDisegno, VistaChatDisegno } from "./comandiChat";
import type { Vista } from "./comandi";
import { useT } from "@/lib/campo/lingua/LinguaCampo";

interface Inquadratura {
  id: string;
  nome: string;
  tipo: "esterno" | "piano" | "locale" | "campo";
  piano: PianoPer3D;
  localeId?: string;
  campoId?: string;
  unita?: string;
}

type ModoRender = Exclude<VistaChatDisegno,"3d">;

function inquadrature(piani: PianoPer3D[], vista: Vista, modo: RenderChatDisegno): Inquadratura[] {
  const disponibili = piani.filter(p => {
    const s = p.piante[vista];
    return s.locali.length || s.muri.some(m=>m.stato!=="demolire") || s.elementi.length || s.aree?.length;
  });
  if (!disponibili.length) return [];
  const campi = disponibili.flatMap((piano): Inquadratura[] => piano.piante[vista].elementi.flatMap(e => {
    const previsto = definizioneCampo(e.tipo);
    return previsto && (!modo.startsWith("render:") || modo === `render:${previsto.tipo}`)
      ? [{ id:`campo/${piano.id}/${e.id}`, nome:previsto.nome, tipo:"campo", piano, campoId:e.id }] : [];
  }));
  if (modo === "render-sport" || modo.startsWith("render:")) {
    return modo === "render-sport" && campi.length > 1
      ? [{ id:"esterno", nome:"Insieme dei campi", tipo:"esterno", piano:campi[0].piano }, ...campi] : campi;
  }
  return [
    { id: "esterno", nome: "Edificio ed esterni", tipo: "esterno", piano: disponibili[0] },
    ...disponibili.flatMap((piano): Inquadratura[] => {
      const locali = piano.piante[vista].locali;
      const interni = modo === "render-edificio" ? [] : locali.filter(eAmbienteInterno);
      const occorrenze = new Map<string, number>();
      return [
        { id: "piano/" + piano.id, nome: piano.nome + " dall’alto", tipo: "piano", piano },
        ...interni.map((locale): Inquadratura => {
          const occorrenza = (occorrenze.get(locale.nome) ?? 0) + 1;
          occorrenze.set(locale.nome, occorrenza);
          const ripetuto = interni.some(l => l.id !== locale.id && l.nome === locale.nome);
          return { id: "locale/" + piano.id + "/" + locale.id, nome: locale.nome + (ripetuto ? " (" + occorrenza + ")" : ""),
            tipo: "locale", piano, localeId: locale.id, unita: locale.unita };
        }),
      ];
    }),
    ...campi,
  ];
}

type Esito = { png?: Blob; riferimento?: Blob; riscontri?: RiscontroRenderLocale[]; telecamera?: Telecamera3D; errore?: string };
const DIMENSIONI = { larghezza: 1120, altezza: 744 };
const RAPPORTO = DIMENSIONI.larghezza / DIMENSIONI.altezza;
const sigla = (s: string) => s.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

function SchedaVista({ lavoro, esito }: { lavoro: Inquadratura; esito?: Esito }) {
  const t = useT();
  const png = esito?.png;
  const immagine = useBlobRef<HTMLImageElement>(png, "src");
  const scarica = useBlobRef<HTMLAnchorElement>(png, "href");
  const nomeFile = (lavoro.tipo === "locale" ? lavoro.piano.nome + " " + lavoro.nome : lavoro.nome)
    .toLocaleLowerCase("it").replace(/[^\p{L}\d]+/gu, "-").replace(/-$/, "");
  return <article className="min-w-0 overflow-hidden rounded-xl border bg-background shadow-sm">
    {png ? <img ref={immagine} alt={lavoro.nome} className="block aspect-[1120/744] w-full object-contain bg-slate-100" />
      : <div className="grid aspect-[1120/744] w-full place-content-center gap-2 bg-muted/40 px-5 text-center text-sm text-muted-foreground">
        <ImageIcon className="mx-auto size-5" aria-hidden="true" />
        {esito && "errore" in esito ? esito.errore : t("In attesa di generazione")}
      </div>}
    <div className="flex items-center justify-between gap-2 p-3">
      <div className="min-w-0">
        <h3 className="truncate text-sm font-semibold text-foreground">{lavoro.nome}</h3>
        {lavoro.tipo === "locale" && <p className="truncate text-xs text-muted-foreground">{lavoro.piano.nome}</p>}
      </div>
      {png && <Button size="icon" variant="outline" asChild className="h-8 w-8 shrink-0">
        <a ref={scarica} download={nomeFile + ".png"} aria-label={t("Scarica PNG {nome}", { nome: lavoro.nome })}><Download className="size-4" aria-hidden="true" /></a>
      </Button>}
    </div>
  </article>;
}

function ConfrontoFoto({ lavoro, esito }: { lavoro: Inquadratura; esito?: Esito }) {
  const t = useT();
  return <div className="space-y-3">
    <ConfrontoRender3D key={lavoro.id} nome={lavoro.nome} riferimento={esito?.riferimento} risultato={esito?.png}
      errore={esito?.errore} nomeFile={lavoro.id.replaceAll("/", "-") + "-cycles.png"} />
    {!!esito?.riscontri?.length && <section aria-label={t("Riscontri sul modello")} className="rounded-xl border bg-card px-4 py-3">
      <h3 className="flex items-center gap-2 text-sm font-medium"><Ruler className="size-4 text-primary" aria-hidden="true" /> {t("Misure e aperture del modello")}</h3>
      <ul className="mt-2 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {esito.riscontri.map(r => <li key={r.nome + r.dato} className="min-w-0 text-sm">
          <span className="font-medium">{r.nome}</span>
          <span className="block text-muted-foreground">{r.dato}</span>
          {r.avviso && <p className="mt-1 text-xs text-amber-800 dark:text-amber-300">{r.avviso}</p>}
        </li>)}
      </ul>
    </section>}
  </div>;
}

export default function RenderCasaDialog({ documento, vista, propostaId, modo = "render", soloInterni = false, archivio, onChiudi }: {
  documento: Planimetria;
  vista: Vista;
  propostaId?: string;
  modo?: ModoRender;
  soloInterni?: boolean;
  archivio?: VersioneRenderVisita;
  onChiudi: () => void;
}) {
  const t = useT();
  const companyId = useEffectiveCompanyId();
  const fotorealistico = modo.startsWith("foto:");
  const modoBase = (fotorealistico ? modo.slice(5) : modo) as RenderChatDisegno;
  const [piani] = useState(() => pianiDaPlanimetria(documento, propostaId));
  const [lavori] = useState(() => inquadrature(piani, vista, modoBase).filter(l => !soloInterni || l.tipo === "locale"));
  const [serie] = useState(() => archivio);
  const [selezionata, setSelezionata] = useState(() => (soloInterni ? lavori.find(l => /^soggiorno/i.test(l.nome)) : undefined)?.id ?? lavori[0]?.id);
  const [dettagli, setDettagli] = useState(false);
  const [esiti, setEsiti] = useState<Record<string, Esito>>({});
  const [corrente, setCorrente] = useState("");
  const [errore, setErrore] = useState("");
  const [tentativo, setTentativo] = useState(0);
  const [scaricando, setScaricando] = useState(false);
  const [erroreScarica, setErroreScarica] = useState(false);
  const completati = useRef<Record<string, Esito>>({});

  useEffect(() => {
    if (!lavori.length) return;
    let chiuso = false;
    const controller = new AbortController();
    setEsiti(serie ? completati.current : {});
    setErrore("");
    (async () => {
      try {
        const { catturaFotogramma, catturaVistaProgetto } = await import("../tred/fotogramma");
        const aspetto = leggiAspetto();
        if (serie) {
          const salvati = await leggiRenderVisita(serie).catch((): RenderVisitaSalvato[] => []);
          if (chiuso) return;
          completati.current = { ...Object.fromEntries(salvati.map(r => [r.id, {
            png: r.render, riferimento: r.anteprima, riscontri: r.riscontri, telecamera: r.telecamera,
          }])), ...completati.current };
          setEsiti({ ...completati.current });
        }
        const calcola = async (lavoro: Inquadratura) => {
          try {
            const pianta = lavoro.piano.piante[vista];
            const esterno = lavoro.tipo === "esterno";
            const dallAlto = lavoro.tipo === "piano";
            const campo = pianta.elementi.find(e => e.id === lavoro.campoId);
            const terreno = campo ? 5 : esterno ? 2 : undefined;
            const pianiInScena = esterno ? piani : [lavoro.piano];
            const opzioni = { vista, terreno, soffitto: !dallAlto };
            const scena = pianiInScena.length > 1 ? scenaEdificio(pianiInScena, opzioni) : costruisciScena(pianta, opzioni);
            let telecamera: Telecamera3D;
            if (esterno) {
              telecamera = fotorealistico && modoBase === "render-edificio"
                ? vistaDalGiardino(scena.limiti, "sud", 49)
                : vistaGiroIntorno(scena.limiti, RAPPORTO);
            } else if (dallAlto) {
              telecamera = vistaDallAlto(scena.limiti, RAPPORTO);
            } else if (campo) {
              const scena = costruisciScena({ ...pianta, muri:[], aperture:[], locali:[], aree:[], terreno:undefined, elementi:[campo] },{vista});
              telecamera = vistaGiroIntorno(scena.limiti, RAPPORTO);
            } else if (lavoro.localeId) telecamera = vistaInternaArredata(pianta, lavoro.localeId, { vista, aspetto: RAPPORTO });
            else throw new Error(t("L’inquadratura non è disponibile per questa pianta."));
            const richiesta = {
              pianta, vista, telecamera, ...DIMENSIONI, scena,
              aspetto: !fotorealistico && (esterno || campo) ? { ...aspetto, realistico: true, alberi: false, dentro: false } : undefined,
            };
            const riferimento = lavoro.localeId && !fotorealistico
              ? (await catturaFotogramma({ ...richiesta, localeId:lavoro.localeId })).png : await catturaVistaProgetto(richiesta);
            if (chiuso) return;
            if (!fotorealistico) {
              setEsiti(old => ({ ...old, [lavoro.id]: { png: riferimento } }));
              return;
            }
            const riscontri = lavoro.localeId ? riscontroStanzaRenderLocale(scena, lavoro.piano, vista, lavoro.localeId)
              : riscontroRenderLocale(scena, pianiInScena, vista);
            setEsiti(old => ({ ...old, [lavoro.id]: { riferimento, riscontri, telecamera } }));
            const ambiente = campo || modoBase === "render-sport" ? "sport" : esterno ? "facciata" : lavoro.tipo === "locale" ? "interni" : "tecnico";
            const png = await renderFotorealisticoLocale(scena, { telecamera, ...DIMENSIONI, ambiente }, controller.signal, undefined, { companyId });
            if (chiuso) return;
            const esito = { png, riferimento, riscontri, telecamera };
            setEsiti(old => ({ ...old, [lavoro.id]: esito }));
            if (serie) {
              completati.current = { ...completati.current, [lavoro.id]: esito };
              await salvaRenderVisita(serie, { id: lavoro.id, nome: lavoro.nome, piano: lavoro.piano.nome,
                data: new Date().toISOString(), anteprima: riferimento, render: png, riscontri, telecamera }).catch((): undefined => undefined);
            }
          } catch (err) {
            if (!chiuso) setEsiti(old => ({ ...old, [lavoro.id]: { ...old[lavoro.id], errore: err instanceof Error ? err.message : t("Vista non disponibile.") } }));
          }
        };
        const restanti = lavori.filter(l => !serie || !completati.current[l.id]?.png);
        // Una serie ripresa calcola una vista alla volta.
        const passo = soloInterni && !tentativo && restanti.length === lavori.length ? 2 : 1;
        for (let i = 0; i < restanti.length && !chiuso; i += passo) {
          const gruppo = restanti.slice(i, i + passo);
          setCorrente(gruppo.map(l => l.nome).join(" · "));
          await Promise.all(gruppo.map(calcola));
        }
      } catch {
        if (!chiuso) setErrore(t("Non riesco a caricare il motore 3D. Riprova."));
      } finally {
        if (!chiuso) setCorrente("");
      }
    })();
    return () => { chiuso = true; controller.abort(); };
  }, [companyId, fotorealistico, lavori, modoBase, piani, serie, soloInterni, tentativo, vista, t]);

  const pronte = Object.values(esiti).filter(e => e.png).length;
  const mancanti = Object.values(esiti).filter(e => e.errore).length;
  const occupato = !errore && pronte + mancanti < lavori.length;
  const locali = lavori.filter(l => l.tipo === "locale");
  const diCampi = modoBase === "render-sport" || modoBase.startsWith("render:");
  const titolo = fotorealistico
    ? (soloInterni ? t("Render fotorealistico delle stanze") : modoBase === "render-edificio" ? t("Render fotorealistico dell’edificio") : diCampi ? t("Render fotorealistico dei campi") : t("Render fotorealistico di tutta la casa"))
    : (soloInterni ? t("Render 3D delle stanze") : modoBase === "render-edificio" ? t("Render 3D dell’edificio") : diCampi ? t("Render 3D dei campi") : t("Render 3D di tutta la casa"));
  const correnteFoto = fotorealistico ? lavori.find(l => l.id === selezionata) : undefined;
  const esitoCorrente = correnteFoto && esiti[correnteFoto.id];
  const stanzePerUnita = new Map<string, Inquadratura[]>();
  if (soloInterni) {
    for (const l of lavori) {
      const unita = l.unita && !/comun|androne/i.test(l.unita) ? `Unità ${l.unita}` : l.unita || "Stanze";
      stanzePerUnita.set(unita, [...(stanzePerUnita.get(unita) ?? []), l]);
    }
  }
  const pulsanti = (elenco: Inquadratura[]) => elenco.map(l => <Button key={l.id} size="sm" variant={l.id === selezionata ? "default" : "outline"}
    aria-pressed={l.id === selezionata} onClick={() => setSelezionata(l.id)}>
    {esiti[l.id]?.png && <Check className="size-4" aria-hidden="true" />}{l.nome}
  </Button>);

  const scaricaConfronti = async () => {
    setScaricando(true);
    setErroreScarica(false);
    try {
      const { default: JSZip } = await import("jszip");
      const zip = new JSZip();
      for (const l of lavori) {
        const e = esiti[l.id];
        if (!e?.png || !e.riferimento) continue;
        const piano = piani.length > 1 ? `${sigla(l.piano.nome)}-${piani.indexOf(l.piano) + 1}/` : "";
        const percorso = `${sigla(l.unita || l.piano.nome) || "interni"}/${piano}${sigla(l.nome) || sigla(l.id)}`;
        zip.file(percorso + "/anteprima-3d.png", await e.riferimento.arrayBuffer());
        zip.file(percorso + "/render.png", await e.png.arrayBuffer());
        zip.file(percorso + "/misure-e-aperture.json", JSON.stringify(e.riscontri ?? [], null, 2));
      }
      scaricaBlob(await zip.generateAsync({ type: "blob" }), `${sigla(documento.titolo || "planimetria")}-render-stanze.zip`);
    } catch {
      setErroreScarica(true);
    } finally {
      setScaricando(false);
    }
  };

  return <Dialog open onOpenChange={open => { if (!open) onChiudi(); }}>
    <DialogContent className="flex max-h-[94dvh] max-w-6xl flex-col gap-4 overflow-hidden p-4 sm:p-6">
      <DialogHeader className="shrink-0 pr-6 text-left">
        <DialogTitle className="flex items-center gap-2"><Building2 className="size-5 text-primary" aria-hidden="true" />{titolo}</DialogTitle>
        <DialogDescription>{fotorealistico ? t("Stessa geometria e stessa camera. {valore}.", { valore: String(descrizioneMotoreFotorealistico() ?? "") }) :
          t("Viste generate nel browser dalla geometria, dagli arredi e dalle finiture della pianta.")} {vista === "progetto" ? t("Progetto") : t("Com’è oggi")}</DialogDescription>
      </DialogHeader>
      {lavori.length > 0 ? <>
        <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 rounded-lg border bg-muted/40 px-3 py-2">
          <p className="flex items-center gap-2 text-sm" role="status">
            {occupato && <Loader2 className="size-4 text-primary motion-safe:animate-spin" aria-hidden="true" />}
            {t("{pronte} di {totale} viste pronte", { pronte, totale: lavori.length })}{mancanti ? " · " + t("{n} da rigenerare", { n: mancanti }) : ""}
            {corrente && <span className="text-muted-foreground">· {corrente}</span>}
          </p>
          {(mancanti > 0 || errore) && <Button size="sm" variant="outline" disabled={occupato} onClick={() => setTentativo(n => n + 1)}><RotateCcw className="size-4" /> {t("Rigenera")}</Button>}
          {soloInterni && pronte === lavori.length && <Button size="sm" variant="outline" disabled={scaricando} onClick={() => void scaricaConfronti()}><Download className="size-4" />{scaricando ? t("Preparo i file…") : t("Scarica tutti i confronti")}</Button>}
        </div>
        {errore && <p role="alert" className="text-sm text-destructive">{errore}</p>}
        {erroreScarica && <p role="alert" className="text-sm text-destructive">{t("Archivio da scaricare. Riprova.")}</p>}
        {correnteFoto ? <div className="min-h-0 flex-1 space-y-3 overflow-y-auto overscroll-contain pr-1">
          {soloInterni ? <div className="space-y-2">{[...stanzePerUnita].sort(([a], [b]) => Number(!a.startsWith("Unità ")) - Number(!b.startsWith("Unità ")) || a.localeCompare(b)).map(([nome, elenco]) =>
            <div key={nome} role="group" aria-label={nome} className="flex flex-wrap items-center gap-2">
              <span className="min-w-20 text-xs font-medium text-muted-foreground">{nome}</span>{pulsanti(elenco)}
            </div>)}</div> : <div role="group" aria-label={t("Inquadratura")} className="flex flex-wrap gap-2">{pulsanti(lavori)}</div>}
          {correnteFoto.localeId && <div role="group" aria-label={t("Vista della stanza")} className="flex flex-wrap gap-1.5">
            <Button size="sm" variant={dettagli ? "outline" : "secondary"} aria-pressed={!dettagli} onClick={() => setDettagli(false)}>
              <ImageIcon className="size-4" aria-hidden="true" /> {t("Vista d’insieme")}
            </Button>
            <Button size="sm" variant={dettagli ? "secondary" : "outline"} aria-pressed={dettagli} onClick={() => setDettagli(true)}>
              <Focus className="size-4" aria-hidden="true" /> {t("Aperture e arredi")}
            </Button>
          </div>}
          {dettagli && correnteFoto.localeId ? <DettagliRenderStanza key={correnteFoto.id}
            pianta={correnteFoto.piano.piante[vista]} vista={vista} localeId={correnteFoto.localeId} dimensioni={DIMENSIONI}
            telecamera={esitoCorrente?.telecamera} riscontri={esitoCorrente?.riscontri} archivio={serie}
            idVista={correnteFoto.id} nomePiano={correnteFoto.piano.nome} />
            : <ConfrontoFoto lavoro={correnteFoto} esito={esitoCorrente} />}
        </div> : <div className="min-h-0 flex-1 space-y-5 overflow-y-auto overscroll-contain pr-1">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {lavori.filter(l => l.tipo !== "locale").map(l => <SchedaVista key={l.id} lavoro={l} esito={esiti[l.id]} />)}
          </div>
          {locali.length > 0 && <section aria-label={t("Interni")} className="space-y-2.5">
            <h2 className="text-sm font-semibold">{t("Interni")} <span className="text-muted-foreground">· {t(locali.length === 1 ? "{n} ambiente" : "{n} ambienti", { n: locali.length })}</span></h2>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{locali.map(l => <SchedaVista key={l.id} lavoro={l} esito={esiti[l.id]} />)}</div>
          </section>}
        </div>}
      </> : <p className="rounded-lg border bg-muted/40 p-4 text-sm text-muted-foreground">{t("Aggiungi alla pianta la geometria da inquadrare.")}</p>}
    </DialogContent>
  </Dialog>;
}
