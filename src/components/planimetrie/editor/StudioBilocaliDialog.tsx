import { useId, useMemo, useState } from "react";
import { ArrowRight, Building2, Check, DoorOpen, Rows3, ScanLine, TreeDeciduous, TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { UniformSelect } from "@/components/ui/uniform-select";
import { vistaDaPlanimetria } from "@/lib/planimetrie/esporta/adattatore";
import { costruisciScena, type Primitiva } from "@/lib/planimetrie/esporta/scena";
import { scenaInSvg } from "@/lib/planimetrie/esporta/svg";
import { accessiBilocali, FONTI_BILOCALI, miglioreBilocali, simulaBilocali, sintetizzaBilocali, type AvvioStudioBilocali, type RichiestaBilocali, type TipoAccessoBilocali } from "@/lib/planimetrie/studioBilocali";
import { cn } from "@/lib/utils";
import { assiDelMuro } from "../../../../shared/planimetrie/geometria.ts";
import { eAmbienteInterno, type Apertura, type Livello, type Planimetria, type Proposta, type Punto } from "../../../../shared/planimetrie/modello.ts";
import type { InterventoUrbanistico } from "../../../../shared/planimetrie/urbanistica.ts";
import { FonteLink } from "../InterventoUrbanistico";
import { arredaBilocali } from "./arredaBilocali";
import { useT, intlCampo } from "@/lib/campo/lingua/LinguaCampo";

const num = (n: number) => n.toLocaleString(intlCampo(), { maximumFractionDigits: 2 });

function centroPorta(piano: Livello, a: Apertura): Punto {
  const muro = piano.fatto.muri.find(m => m.id === a.muroId)!;
  const { dir } = assiDelMuro(muro);
  const offset = a.offset + a.larghezza / 2;
  return { x: muro.p1.x + dir.x * offset, y: muro.p1.y + dir.y * offset };
}

function immaginePianta(piano: Livello, porte: { centro: Punto; etichetta: string }[], proposta?: Proposta) {
  const doc: Planimetria = { schema: 1, unita: "cm", livelli: [{ ...piano, proposte: proposta ? [proposta] : [] }] };
  const vista = vistaDaPlanimetria(doc, { livelloId: piano.id, propostaId: proposta?.id, modo: proposta ? "progetto" : "fatto" });
  const scena = costruisciScena(vista, { stile: "presentazione", scala: 50, quoteAutomatiche: false, etichetteLocali: !!proposta });
  const evidenze: Primitiva[] = (proposta?.locali ?? []).filter(l => !eAmbienteInterno(l)).map(l => ({
    layer: "LOCALI", tipo: "poligono", punti: l.contorno.map(p => ({ x: p.x, y: -p.y })),
    chiuso: true, riempimento: "#dcfce7", tratto: { colore: "#15803d", spessoreMm: .3, tratteggioMm: [1.2, .7] },
  }));
  const marcatori = porte.flatMap(({ centro, etichetta }): Primitiva[] => {
    const posizione = { x: centro.x, y: -centro.y };
    return [
      { tipo: "cerchio", layer: "TESTI", centro: posizione, raggio: 31, riempimento: "#1d4ed8", tratto: { colore: "#ffffff", spessoreMm: .4 } },
      { tipo: "testo", layer: "TESTI", posizione, testo: etichetta, altezzaMm: 6, colore: "#ffffff",
        allinea: "centro", verticale: "centro", grassetto: true, rotazione: 0 },
    ];
  });
  const { svg } = scenaInSvg({ ...scena, primitive: [...scena.primitive, ...evidenze, ...marcatori] }, { margineMm: 8 });
  return "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svg);
}

export interface SceltaStudioBilocali {
  proposta: Proposta;
  intervento: InterventoUrbanistico;
  profilo: RichiestaBilocali["profilo"];
  daRivedere: string[];
}

export function StudioBilocaliDialog({ documento, piano, avvio, onChiudi, onCrea, onDisegnaPorta, onDividiAmbiente, onCalibra }: {
  documento: Planimetria;
  piano: Livello;
  avvio: AvvioStudioBilocali;
  onChiudi: () => void;
  onCrea: (scelta: SceltaStudioBilocali) => void;
  onDisegnaPorta: () => void;
  onDividiAmbiente: () => void;
  onCalibra: () => void;
}) {
  const tr = useT();
  const id = useId();
  const [unita, setUnita] = useState(avvio.unita);
  const [profilo, setProfilo] = useState<RichiestaBilocali["profilo"]>(avvio.profilo ?? (documento.urbanistica?.codiceIstat === "015146" ? "milano" : "generico"));
  const [intervento, setIntervento] = useState(avvio.intervento ?? documento.urbanistica?.intervento?.tipo ?? "frazionamento");
  const [accessoId, setAccessoId] = useState("");
  const [tipoAccesso, setTipoAccesso] = useState<TipoAccessoBilocali>(avvio.tipoAccesso ?? "comune");
  const [scelto, setScelto] = useState("");
  const [arredi, setArredi] = useState(true);
  const [errore, setErrore] = useState("");
  const comune = documento.urbanistica?.comune?.trim();
  const accessi = useMemo(() => accessiBilocali(piano), [piano]);
  const ingresso = accessi.length === 1 ? accessi[0] : accessi.find(a => a.id === accessoId);
  const studio = useMemo(() => simulaBilocali(piano, { unita, profilo, accessoId, tipoAccesso }), [piano, unita, profilo, accessoId, tipoAccesso]);
  const altraQuantita = unita === 3 ? 2 : 3;
  const alternativa = useMemo(() => {
    if (studio.ok === false && studio.causa !== "indipendenti") return null;
    return sintetizzaBilocali(simulaBilocali(piano, { unita: altraQuantita, profilo, accessoId,
      tipoAccesso: accessi.length === altraQuantita ? tipoAccesso : "comune" }));
  }, [studio, piano, altraQuantita, profilo, accessoId, tipoAccesso, accessi.length]);
  const esito = sintetizzaBilocali(studio);
  const provaAlternativa = alternativa && alternativa.geometria !== null
    && (esito.geometria === null || alternativa.geometria < esito.geometria
      || (alternativa.geometria === esito.geometria && alternativa.criticita! < esito.criticita!));
  const carte = useMemo(() => studio.ok ? studio.alternative.map(a => ({
    a, src: immaginePianta(piano, [
      ...(a.ingressoComune ? [{ centro: a.ingressoComune, etichetta: "I" }] : []),
      ...a.unita.flatMap(u => u.ingresso.porta ? [{ centro: u.ingresso.porta.centro, etichetta: u.sigla }] : []),
    ], a.proposta),
  })) : [], [piano, studio]);
  const mappaPorte = useMemo(() => accessi.length > 1 ? immaginePianta(piano, accessi.map((a, i) => ({
    centro: centroPorta(piano, a), etichetta: String(i + 1),
  }))) : null, [piano, accessi]);
  const selezionata = carte.find(c => c.a.id === scelto)?.a
    ?? (studio.ok ? miglioreBilocali(studio.alternative) : undefined);
  const statoDiFatto = useMemo(() => carte.length ? immaginePianta(piano, []) : null, [piano, carte.length]);

  function cambiaUnita(quanti: 2 | 3) {
    setScelto("");
    setUnita(quanti);
    if (accessi.length !== quanti) setTipoAccesso("comune");
  }

  function crea() {
    if (!selezionata) return;
    try {
      const nuova = arredi ? arredaBilocali(selezionata.proposta) : { proposta: selezionata.proposta, daRivedere: [] };
      const precedente = documento.urbanistica?.intervento;
      onCrea({
        proposta: nuova.proposta,
        daRivedere: nuova.daRivedere,
        profilo,
        intervento: intervento === "cambio_uso"
          ? { tipo: intervento, usoAttuale: "Locale commerciale", usoPrevisto: "Residenziale", opere: "con_opere",
            ...(piano.quota === 0 ? { piano: "terra" as const } : {}), ...(precedente?.tipo === "cambio_uso" ? precedente : {}) }
          : { ...(precedente?.tipo === "frazionamento" ? precedente : {}), tipo: intervento, unitaPreviste: unita },
      });
    } catch (e) {
      setErrore(e instanceof Error ? e.message : tr("Impossibile creare la variante."));
    }
  }

  return <Dialog open onOpenChange={open => { if (!open) onChiudi(); }}>
    <DialogContent className="flex max-h-[94dvh] max-w-6xl flex-col gap-0 overflow-hidden p-0 motion-reduce:data-[state=open]:animate-none motion-reduce:data-[state=closed]:animate-none">
      <DialogHeader className="shrink-0 border-b bg-background px-5 py-4 pr-12 text-left">
        <DialogTitle className="flex items-center gap-2.5"><Building2 className="size-5 text-primary" aria-hidden="true" />{tr("Fraziona in bilocali")}</DialogTitle>
        <DialogDescription>{tr("{nome} · scegli gli ingressi e confronta le distribuzioni sulla sagoma esistente.", { nome: String(piano.nome ?? "") })}</DialogDescription>
      </DialogHeader>
      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto bg-muted/20 p-4 sm:p-5">
        <div className="grid grid-cols-2 gap-3 rounded-lg border bg-background p-3 sm:grid-cols-3">
          <div className="col-span-2 space-y-1 sm:col-span-1">
            <Label htmlFor={id + "-intervento"}>{tr("Intervento")}</Label>
            <UniformSelect className="w-full" id={id + "-intervento"} value={intervento} onChange={e => setIntervento(e.target.value as typeof intervento)}>
              <option value="frazionamento">{tr("Frazionamento abitazione")}</option>
              <option value="cambio_uso">{tr("Commerciale → residenziale")}</option>
            </UniformSelect>
          </div>
          <div className="space-y-1">
            <Label htmlFor={id + "-unita"}>{tr("Bilocali")}</Label>
            <UniformSelect className="w-full" id={id + "-unita"} value={unita} onChange={e => cambiaUnita(e.target.value === "2" ? 2 : 3)}>
              <option value={2}>{tr("Due bilocali")}</option><option value={3}>{tr("Tre bilocali")}</option>
            </UniformSelect>
          </div>
          <div className="space-y-1">
            <Label htmlFor={id + "-profilo"}>{tr("Comune di riferimento")}</Label>
            <UniformSelect className="w-full" id={id + "-profilo"} value={profilo} onChange={e => setProfilo(e.target.value === "milano" ? "milano" : "generico")}>
              <option value="generico">{comune && comune !== "Milano" ? tr("{comune} · requisiti generali", { comune }) : tr("Requisiti generali")}</option>
              <option value="milano">Milano</option>
            </UniformSelect>
          </div>
        </div>
        <section aria-label={tr("Verifica preliminare")} className="rounded-xl border bg-background p-3">
          <h3 className="mb-2 flex items-center gap-2 text-sm font-semibold"><ScanLine className="size-4 text-primary" aria-hidden="true" />{tr("Verifica preliminare")}</h3>
          <div className={cn("grid gap-2", alternativa && "sm:grid-cols-2")} aria-live="polite">
            {[{ n: unita, risultato: esito }, ...(alternativa ? [{ n: altraQuantita, risultato: alternativa }] : [])].map(({ n, risultato }) =>
              <div key={n} className={cn("rounded-md border p-2.5 text-xs", risultato.criticita === 0
                ? "border-emerald-200 bg-emerald-50/70 text-emerald-950" : "border-amber-200 bg-amber-50/70 text-amber-950")}>
                <p className="font-semibold">{tr("{n} bilocali", { n })} {n === unita && <span className="font-normal">{tr("· scenario selezionato")}</span>}</p>
                <p className="mt-1 leading-relaxed">{risultato.testo}</p>
              </div>
            )}
          </div>
          {provaAlternativa && <Button type="button" size="sm" variant="outline" className="mt-2" onClick={() => cambiaUnita(altraQuantita)}>
            {altraQuantita === 2 ? tr("Prova due bilocali") : tr("Prova tre bilocali")}<ArrowRight className="size-4" aria-hidden="true" />
          </Button>}
          {studio.ok === false && (studio.causa === "scala" || studio.causa === "scala_modello") &&
            <Button type="button" size="sm" variant="outline" className="mt-2" onClick={onCalibra}>{studio.causa === "scala" ? tr("Imposta scala dello sfondo") : tr("Verifica scala del modello")}</Button>}
          {studio.ok === false && studio.causa === "indipendenti" && <Button type="button" size="sm" variant="outline" className="mt-2 ml-1" onClick={() => setTipoAccesso("comune")}>{tr("Prova un ingresso comune")}</Button>}
        </section>
        <section aria-label={tr("Ingresso")} className="rounded-lg border bg-background p-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex min-w-0 items-center gap-2.5">
              <span className="grid size-8 shrink-0 place-items-center rounded-md bg-primary/10 text-primary"><DoorOpen className="size-4" aria-hidden="true" /></span>
              <div>
                <h3 className="text-sm font-semibold">{tipoAccesso === "indipendenti" ? tr("Ingressi indipendenti") : ingresso ? tr("Ingresso comune") : tr("Da dove si entra?")}</h3>
                {tipoAccesso === "comune" && ingresso && <p className="text-xs text-muted-foreground">{tr("Porta esistente · vano {larghezza} cm", { larghezza: String(num(ingresso.larghezza) ?? "") })}</p>}
                {tipoAccesso === "indipendenti" && <p className="text-xs text-muted-foreground">{tr("Una porta esistente per unità sullo stesso fronte")}</p>}
              </div>
            </div>
            {(accessi.length === unita || tipoAccesso === "indipendenti") && <div role="group" aria-label={tr("Tipo di accesso")} className="flex flex-wrap gap-1 rounded-md border bg-muted/25 p-1">
              {(["comune", "indipendenti"] as const).map(t => <Button key={t} type="button" size="sm" aria-pressed={tipoAccesso === t}
                variant={tipoAccesso === t ? "secondary" : "ghost"} className="h-8 px-2 text-xs" onClick={() => setTipoAccesso(t)}>
                {t === "comune" ? tr("Corridoio comune") : tr("Porte indipendenti")}
              </Button>)}
            </div>}
            {mappaPorte && tipoAccesso === "comune" && <div>
              <Label className="sr-only" htmlFor={id + "-accesso"}>{tr("Porta d’ingresso")}</Label>
              <UniformSelect id={id + "-accesso"} value={accessoId} onChange={e => setAccessoId(e.target.value)}>
                <option value="">{tr("Scegli una porta numerata")}</option>
                {accessi.map((a, i) => <option key={a.id} value={a.id}>{tr("Porta {i} · {larghezza} cm", { i: i + 1, larghezza: String(num(a.larghezza) ?? "") })}</option>)}
              </UniformSelect>
            </div>}
            {studio.ok === false && studio.serveIngresso && !accessi.length && <Button type="button" size="sm" variant="outline" onClick={onDisegnaPorta}>{tr("Disegna porta esistente")}</Button>}
          </div>
          {mappaPorte && tipoAccesso === "comune" && !ingresso && <img src={mappaPorte} alt={tr("Pianta dello stato di fatto con le porte d’ingresso numerate")} className="mx-auto mt-2 block h-48 w-full object-contain" />}
          {mappaPorte && (ingresso || tipoAccesso === "indipendenti") && <details className="mt-2 text-xs text-muted-foreground">
            <summary className="cursor-pointer">{tr("Vedi le porte sulla pianta")}</summary>
            <img src={mappaPorte} alt={tr("Pianta dello stato di fatto con le porte d’ingresso numerate")} className="mx-auto mt-2 block h-36 w-full object-contain" />
          </details>}
        </section>
        {studio.ok && studio.omesse.length > 0 && <details open={!carte.length} className="space-y-1 rounded-lg border bg-card p-3 text-sm">
          <summary className="cursor-pointer font-medium">{studio.omesse.length === 1 ? tr("Una distribuzione da rivedere") : tr("Distribuzioni da rivedere")}</summary>
          {studio.omesse.map(testo => <p key={testo} className="text-muted-foreground">{testo}</p>)}
        </details>}
        {carte.length > 0 && <>
          <div className="grid gap-3 lg:grid-cols-2" aria-label={tr("Alternative di distribuzione")}>
            {carte.map(({ a, src }) => <button type="button" key={a.id} onClick={() => setScelto(a.id)} aria-pressed={a === selezionata}
              className={cn("min-w-0 overflow-hidden rounded-xl border bg-background text-left shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary",
                a === selezionata ? "border-primary ring-1 ring-primary/30" : "hover:border-primary/45")}>
              <div className="flex min-h-11 items-center gap-2 border-b px-3 py-2">
                <span className={cn("grid size-5 shrink-0 place-items-center rounded-full border", a === selezionata && "border-primary bg-primary text-primary-foreground")}>
                  {a === selezionata && <Check className="size-3.5" aria-hidden="true" />}
                </span>
                <span className="flex-1 text-sm font-semibold">{a.nome}</span>
                {a.criticita.length > 0 && <span className="shrink-0 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-900">{tr("{n} criticità", { n: a.criticita.length })}</span>}
              </div>
              <img src={src} alt="" decoding="async" className="block h-44 w-full object-contain px-2 py-2 sm:h-56" />
              <div className="grid grid-cols-2 gap-3 border-t px-3 py-2.5 text-sm">
                <span>{tr("{pavimentiDaPosareMq} m² da pavimentare", { pavimentiDaPosareMq: String(num(a.pavimentiDaPosareMq) ?? "") })}</span>
                <span>{a.ingressoComune ? tr("{mq} m² di corridoio comune", { mq: num(a.comuniMq) }) : tr("{n} porte riutilizzate", { n: a.unita.length })}</span>
              </div>
            </button>)}
          </div>
          {statoDiFatto && selezionata && <details className="rounded-lg border bg-background p-3 text-sm">
            <summary className="cursor-pointer font-semibold">{tr("Prima e dopo sulla stessa sagoma")}</summary>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <figure className="overflow-hidden rounded-lg border">
                <img src={statoDiFatto} alt={tr("Pianta prima dei lavori")} className="h-48 w-full object-contain p-2" />
                <figcaption className="border-t px-2.5 py-2 text-xs font-medium">{tr("Com’è oggi")}</figcaption>
              </figure>
              <figure className="overflow-hidden rounded-lg border">
                <img src={carte.find(c => c.a.id === selezionata.id)?.src} alt={tr("Pianta con gli ingressi della variante")} className="h-48 w-full object-contain p-2" />
                <figcaption className="border-t px-2.5 py-2 text-xs font-medium">{selezionata.proposta.nome}</figcaption>
              </figure>
            </div>
          </details>}
          {!!selezionata?.spaziEsterni.length && <section aria-label={tr("Spazi esterni conservati")} className="space-y-2 rounded-xl border bg-background p-3">
            <h3 className="flex items-center gap-2 text-sm font-semibold"><TreeDeciduous className="size-4 text-emerald-700" aria-hidden="true" />{tr("Spazi esterni conservati")}</h3>
            <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-[repeat(auto-fit,minmax(12rem,1fr))]">
              {selezionata.spaziEsterni.map(e => <li key={e.id} className="rounded-md border border-emerald-200 bg-emerald-50 px-2.5 py-2 text-xs text-emerald-950">
                <div className="flex justify-between gap-2"><span className="font-semibold">{e.nome}</span><span className="shrink-0">{num(e.mq)} m²</span></div>
                <p className="mt-1">{e.accessibileDa.length ? e.accessibileDa.map(u => u === "Parti comuni" ? tr("Dalle parti comuni") : tr("Dall’unità {sigla}", { sigla: u })).join(" · ") : tr("Collegamento da verificare")}</p>
              </li>)}
            </ul>
            <p className="text-xs text-muted-foreground">{tr("Verifica i titoli prima di assegnare gli spazi esterni alle unità.")}</p>
          </section>}
          {!!selezionata?.criticita.length && <details className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-950">
            <summary className="cursor-pointer font-semibold">{selezionata.criticita.length === 1 ? tr("Una verifica aperta") : tr("{n} verifiche aperte", { n: selezionata.criticita.length })}</summary>
            <ul className="mt-2 space-y-1">
              {selezionata.criticita.map(c => <li className="flex items-start gap-2" key={c}><TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />{c}</li>)}
            </ul>
          </details>}
          {selezionata && <div className="space-y-3 rounded-xl border bg-background p-3">
            <div className="flex flex-wrap items-center justify-between gap-2 px-0.5">
              <h3 className="text-sm font-semibold">{tr("Ingressi e bagni per unità")}</h3>
              <span className="text-xs text-muted-foreground">{selezionata.ingressoComune && `${tr("I · ingresso comune")}\u2002`}A, B{unita === 3 ? ", C" : ""} {tr("· porte delle unità")}</span>
            </div>
            <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {selezionata.unita.map(u => <li key={u.sigla} className="space-y-1 rounded-lg border bg-muted/20 p-2.5 text-xs">
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="grid size-5 place-items-center rounded-full bg-blue-700 font-semibold text-white">{u.sigla}</span>
                  <span className="font-semibold">{tr("Unità {sigla}", { sigla: String(u.sigla ?? "") })}</span>
                  <span className="ml-auto tabular-nums text-muted-foreground">{tr("{mq} m² interni", { mq: String(num(u.mq) ?? "") })}</span>
                </div>
                <p className="font-medium">{u.ingresso.tipo === "diretto" ? tr("Porta esistente indipendente") : tr("Porta dal corridoio comune")} · {tr("vano {larghezza} cm", { larghezza: num(u.ingresso.porta!.larghezza) })}</p>
                <p className="text-muted-foreground">
                  {tr("Bagno {mq} m²", { mq: num(u.bagno.mq) })} · {u.bagno.latoMinimoCm === null ? tr("lato utile da verificare") : tr("lato utile {lato} m", { lato: num(u.bagno.latoMinimoCm / 100) })}
                  {u.bagno.disimpegno ? ` ${tr("· disimpegno disegnato")}` : ` ${tr("· disimpegno da verificare")}`}
                </p>
                <p className="text-amber-800">{u.bagno.aerazione === "finestra" ? tr("Conferma la parte apribile del vano da {mq} m²", { mq: num(u.bagno.vanoApribileMq) })
                  : u.bagno.aerazione === "da_studiare" ? tr("Verifica VMC o aerazione naturale")
                    : tr("Verifica l’aerazione meccanica del bagno")}</p>
              </li>)}
            </ul>
            <details className="rounded-lg border px-2.5 py-2">
              <summary className="cursor-pointer text-xs font-medium">{tr("Superfici e finestre dei locali")}</summary>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-xs text-muted-foreground"><tr className="border-b">
                  <th scope="col" className="px-2 py-2 text-left font-medium">{tr("Unità")}</th>
                  <th scope="col" className="px-2 py-2 text-left font-medium">{tr("Soggiorno con cucina")}</th>
                  <th scope="col" className="px-2 py-2 text-left font-medium">{tr("Camera matrimoniale")}</th>
                </tr></thead>
                <tbody>{selezionata.unita.map(u => <tr key={u.sigla} className="border-b last:border-0">
                  <th scope="row" className="px-2 py-2 text-left font-semibold">{u.sigla}</th>
                  {[u.soggiorno, u.camera].map(l => <td key={l.nome} className={cn("px-2 py-2 tabular-nums", !l.finestre && "font-medium text-amber-800")}>
                    {num(l.mq)} m² <span className={cn("block text-xs", l.finestre && "text-muted-foreground")}>{l.finestre ? tr("{mq} m² di vani finestrati lordi", { mq: num(l.luceLordaMq) }) : tr("Senza finestra esterna")}</span>
                  </td>)}
                </tr>)}</tbody>
              </table>
            </div>
            </details>
            <p className="px-0.5 text-xs text-muted-foreground">
              {tr("{tramezzi} m di nuovi divisori · {demolizioni} m da demolire · {pavimenti} m² di pavimento ipotizzato in recupero", { tramezzi: num(selezionata.nuoviTramezziMl), demolizioni: num(selezionata.demolizioniMl), pavimenti: num(selezionata.pavimentiDaConservareMq) })}
              {studio.ok && (" · " + (studio.altezzaStimata ? tr("altezza {altezza} m da verificare", { altezza: num(studio.altezzaCm / 100) }) : tr("altezza {altezza} m ripresa dalla pianta", { altezza: num(studio.altezzaCm / 100) })))}
            </p>
            {!!selezionata.pilastriConservati && <p className="px-0.5 text-xs text-muted-foreground">
              {tr("Pilastri conservati {n} · verifica gli ingombri effettivi e la superficie utile.", { n: selezionata.pilastriConservati })}
            </p>}
          </div>}
        </>}
        <details className="space-y-2 rounded-xl border bg-background p-3">
          <summary className="cursor-pointer text-sm font-semibold">{profilo === "milano" ? tr("Regole di Milano e verifiche aperte") : tr("Regole comunali da verificare nel fascicolo")}</summary>
          <p className="text-sm text-muted-foreground">
            {tr("La simulazione confronta le superfici con {mq} m² per il soggiorno e 14 m² per la camera matrimoniale.", { mq: profilo === "milano" ? "17" : "14" })}
            {profilo === "milano" && ` ${tr("Per i bagni controlla il lato utile di 1,20 m e la separazione dalla cottura. Per i bagni ciechi verifica aerazione attivata e condizioni dell’art. 107, in particolare oltre 70 m² di superficie utile.")}`}
          </p>
          <p className="text-sm text-muted-foreground">{tr("Verifica luce netta delle porte, soglie, spazi di manovra e collegamento con l’accesso comune o pubblico. Per porte e finestre sui terrazzi rileva parti apribili, profondità dei locali e aggetti superiori.")}</p>
          {intervento === "cambio_uso" && <p className="text-sm text-muted-foreground">
            {tr("Associa indirizzo o particella al fascicolo per verificare zona, categoria commerciale autorizzata, vincoli, dotazioni e titolo edilizio del cambio d’uso.")}
          </p>}
          <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs">
            {profilo === "milano" && <FonteLink url={FONTI_BILOCALI.edilizio}>{tr("Regolamento edilizio di Milano · artt. 97–107")}</FonteLink>}
            <FonteLink url={FONTI_BILOCALI.dm}>{tr("D.M. 5 luglio 1975")}</FonteLink>
            <FonteLink url={FONTI_BILOCALI.accessibilita}>{tr("D.M. 236/1989 · porte e percorsi")}</FonteLink>
            {profilo === "milano" && <FonteLink url={intervento === "cambio_uso" ? FONTI_BILOCALI.destinazioni : FONTI_BILOCALI.pgt}>{tr("PGT Milano")}{intervento === "cambio_uso" ? ` ${tr("· art. 8")}` : ` ${tr("· piano vigente")}`}</FonteLink>}
            {intervento === "cambio_uso" && <>
              {profilo === "milano" && <FonteLink url={FONTI_BILOCALI.lombardia}>{tr("L.R. Lombardia 12/2005 · art. 51")}</FonteLink>}
              <FonteLink url={FONTI_BILOCALI.mit}>{tr("MIT · cambio d’uso e agibilità")}</FonteLink>
            </>}
          </div>
        </details>
        {errore && <p role="alert" className="text-sm text-destructive">{errore}</p>}
      </div>
      <DialogFooter className="grid shrink-0 grid-cols-2 items-center gap-2 border-t bg-background px-4 py-3 sm:flex sm:flex-wrap sm:px-5">
        {selezionata && <label className="col-span-2 flex items-center gap-2 text-xs sm:order-2">
          <input type="checkbox" className="size-4 accent-primary" checked={arredi} onChange={e => setArredi(e.target.checked)} />{tr("Aggiungi arredi e sanitari di prova")}
        </label>}
        <Button type="button" size="sm" variant="ghost" className="mr-auto h-auto min-h-9 whitespace-normal px-2 text-left text-muted-foreground sm:order-1" onClick={onDividiAmbiente}>
          <Rows3 className="size-4" aria-hidden="true" />{tr("Dividi un ambiente")}
        </Button>
        <Button type="button" className="h-auto min-h-10 whitespace-normal sm:order-3" disabled={!selezionata} onClick={crea}>
          {selezionata?.criticita.length ? tr("Crea bozza da correggere") : tr("Crea variante")}
        </Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>;
}
