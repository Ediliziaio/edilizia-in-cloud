import { useEffect, useState } from "react";
import { Check, FileText, LoaderCircle, Paintbrush, RotateCcw, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { UniformSelect } from "@/components/ui/uniform-select";
import { campioneDaTela } from "@/lib/planimetrie/esportaGlbConFiniture";
import { FOTO_FINITURE } from "@/lib/planimetrie/fotoFiniture";
import { renderFotorealisticoLocale } from "@/lib/planimetrie/renderFotorealisticoLocale";
import { salvaRenderVisita, type VersioneRenderVisita } from "@/lib/planimetrie/renderVisitaArchivio";
import type { PiantaPer3D, Scena3D, Telecamera3D, Vista3D } from "@/lib/planimetrie/tred";
import { haPianoCucina, PIANI_CUCINA_RENDER, scenaConVarianti, type VarianteArredoRender, type VariantiRender } from "@/lib/planimetrie/tred/variantiRender";
import { modelloElemento } from "@/lib/planimetrie/tred/elementi";
import type { CampioneGlb } from "@/lib/planimetrie/tred/esporta";
import { ammetteAlberiDiContesto, FACCIATE, INFISSI, type OpzioniAspetto } from "@/lib/planimetrie/tred/aspettoOpzioni";
import { telaTrama } from "./aspetto";
import { catturaVistaProgetto } from "./fotogramma";
import { ConfrontoRender3D } from "./ConfrontoRender3D";
import { dimensioniRenderLocale, type LuceRenderLocale, type QualitaRenderLocale } from "../../../../shared/planimetrie/renderLocale";
import { CAMPIONI_FINITURE, campioneFinitura } from "../../../../shared/planimetrie/finiture";
import { CREDITO_MODEL_3_HIGHLAND, modelloArredo, modelliArredo, quotePiscina } from "../../../../shared/planimetrie/modelliArredo";
import { nomeDelTipo } from "../editor/catalogo";

export type InquadraturaRender3D = {
  scena: Scena3D; pianta: PiantaPer3D; vista: Vista3D; telecamera: Telecamera3D; proporzioni: number; aspetto: OpzioniAspetto;
  ambiente: "sport" | "facciata" | "tecnico" | "interni";
  esterno: boolean; localeId?: string; nome: string; piano: string; pianoId: string; versione?: number; archivio?: VersioneRenderVisita;
};

const LUCI = { giorno: "Luce diurna", diffusa: "Luce diffusa", sera: "Sera" } satisfies Record<LuceRenderLocale, string>;
const QUALITA = { rapida: "Rapida · 1200 px", alta: "Alta · 2048 px" } satisfies Record<QualitaRenderLocale, string>;
const INIZIALI: VariantiRender = {};
const misuraMetri = (cm: number) => new Intl.NumberFormat("it-IT", { maximumFractionDigits: 2 }).format(cm / 100);

export default function RenderInquadratura3D({ data, onChiudi }: { data: InquadraturaRender3D; onChiudi: () => void }) {
  const [rif, setRif] = useState<Blob>();
  const [png, setPng] = useState<Blob>();
  const [errore, setErrore] = useState("");
  const [luce, setLuce] = useState<LuceRenderLocale>("giorno");
  const [ora, setOra] = useState(data.aspetto.ora);
  const [qualita, setQualita] = useState<QualitaRenderLocale>("rapida");
  const [varianti, setVarianti] = useState<VariantiRender>(INIZIALI);
  const [elementoId, scegliElemento] = useState("");
  const [calcolo, setCalcolo] = useState<{ luce: LuceRenderLocale; ora: number; qualita: QualitaRenderLocale; varianti: VariantiRender }>(
    { luce: "giorno", ora: data.aspetto.ora, qualita: "rapida", varianti: INIZIALI },
  );
  const orientata = data.scena.nord !== undefined;
  const [salvataggio, setSalvataggio] = useState<"in_corso" | "salvato" | "errore">();
  const { larghezza, altezza } = dimensioniRenderLocale(data.proporzioni, calcolo.qualita);

  useEffect(() => {
    const controller = new AbortController();
    const esegui = async () => {
      setErrore("");
      setPng(undefined);
      setRif(undefined);
      setSalvataggio(undefined);
      try {
        const { vista, telecamera, aspetto, esterno } = data;
        const { scena, pianta } = scenaConVarianti(data.pianta, data.scena, vista, data.localeId, calcolo.varianti);
        const anteprima = await catturaVistaProgetto({ scena, pianta, vista, localeId: data.localeId, telecamera,
          aspetto: { ...aspetto, ora: calcolo.ora }, larghezza, altezza });
        if (controller.signal.aborted) return;
        setRif(anteprima);
        const materiali = { ...scena.materiali };
        const campioni = new Map<string, CampioneGlb>();
        if (aspetto.realistico) {
          if (esterno && materiali.muro && !materiali.muro.finituraProgetto) {
            const facciata = FACCIATE[aspetto.facciata];
            const trama = `facciata-${facciata.trama}`;
            materiali.muro = { ...materiali.muro, colore: facciata.colore };
            const tela = telaTrama(facciata.trama);
            if (tela) {
              campioni.set(trama, await campioneDaTela(tela));
              materiali.muro.tessitura = { trama, metri: [facciata.metri, facciata.metri], tinta: facciata.colore };
            }
          }
          for (const chiave of esterno ? ["telaio", "oscurante"] : ["telaio"]) {
            const materiale = materiali[chiave];
            if (materiale && !materiale.finituraProgetto) materiali[chiave] = {
              ...materiale, colore: INFISSI[aspetto.infissi].colore, metallico: aspetto.infissi === "legno" ? .03 : .28,
              ruvidita: aspetto.infissi === "legno" ? .47 : .32,
            };
          }
        }
        const risultato = await renderFotorealisticoLocale({ ...scena, materiali }, {
          telecamera, larghezza, altezza, ambiente: data.ambiente, luce: calcolo.luce, qualita: calcolo.qualita, ora: calcolo.ora,
          alberi: esterno && aspetto.realistico && aspetto.alberi && ammetteAlberiDiContesto(scena),
        }, controller.signal, campioni);
        if (!controller.signal.aborted) setPng(risultato);
      } catch (e) {
        if (!controller.signal.aborted) setErrore(e instanceof Error ? e.message : "Render non disponibile.");
      }
    };
    void esegui();
    return () => controller.abort();
  }, [data, larghezza, altezza, calcolo]);

  const inCorso = !png && !errore;
  const locale = data.pianta.locali.find(l => l.id === data.localeId);
  const finiture = !!locale && data.scena.mesh.some(m => m.id === "pavimento:" + locale.id);
  const inScena = new Set(data.scena.mesh.filter(m => m.id.startsWith("elemento:")).map(m => m.riferimento));
  const oggetti = data.pianta.elementi.filter(e => inScena.has(e.id) && (!data.localeId || e.localeId === data.localeId)
    && (modelliArredo(e.tipo).length > 0 || haPianoCucina(e.tipo) || ["divano_angolare", "poltrona"].includes(e.tipo)));
  const elemento = oggetti.find(e => e.id === elementoId) ?? oggetti[0];
  const modelli = elemento ? modelliArredo(elemento.tipo) : [];
  const scelta = elemento && varianti.arredi?.[elemento.id];
  const pianoCucina = PIANI_CUCINA_RENDER.find(c => c.id === scelta?.pianoCucina);
  const modelloBase = elemento && modelloElemento(elemento.tipo);
  const tagliaVariante = elemento ? modelloArredo(elemento.tipo, scelta?.modello)?.misure : undefined;
  const dimensioni = elemento && modelloBase && {
    l: tagliaVariante?.larghezza ?? elemento.larghezza ?? modelloBase.misure.l * 100,
    p: tagliaVariante?.profondita ?? elemento.profondita ?? modelloBase.misure.p * 100,
    h: tagliaVariante?.altezza ?? elemento.altezza ?? modelloBase.misure.h * 100,
  };
  const highland = data.pianta.elementi.some(e => e.tipo === "auto" && (calcolo.varianti.arredi?.[e.id]?.modello ?? e.modello) === "highland");
  const vasca = dimensioni && elemento?.tipo === "piscina" ? quotePiscina(dimensioni.l, dimensioni.p, dimensioni.h) : null;
  const cambiaArredo = (v: VarianteArredoRender) => {
    if (!elemento) return;
    setVarianti(prec => {
      const arredi = { ...prec.arredi };
      const prossimo = { ...arredi[elemento.id], ...v };
      if (prossimo.modello || prossimo.colore || prossimo.pianoCucina) arredi[elemento.id] = prossimo;
      else delete arredi[elemento.id];
      return { ...prec, arredi };
    });
  };
  const modifiche = luce !== calcolo.luce || (orientata && ora !== calcolo.ora) || qualita !== calcolo.qualita || varianti !== calcolo.varianti;
  const varianteSalvata = calcolo.varianti.pavimento || calcolo.varianti.pareti || Object.keys(calcolo.varianti.arredi ?? {}).length > 0;
  const includi = async () => {
    if (!png || !rif || !data.archivio || salvataggio === "in_corso") return;
    setSalvataggio("in_corso");
    try {
      const camera = [...data.telecamera.posizione, ...data.telecamera.guarda, data.telecamera.fov].map(n => n.toFixed(3)).join(",");
      const variante = varianteSalvata ? "/" + JSON.stringify(calcolo.varianti) : "";
      const luceSalvata = orientata ? `${calcolo.luce}-${calcolo.ora}` : calcolo.luce;
      await salvaRenderVisita(data.archivio, { id: `${data.pianoId}/${data.localeId ?? data.nome}/${camera}/${luceSalvata}-${calcolo.qualita}${variante}`,
        nome: data.nome + (varianteSalvata ? " · Variante materiali e arredi" : ""), piano: data.piano, data: new Date().toISOString(), anteprima: rif, render: png });
      setSalvataggio("salvato");
    } catch { setSalvataggio("errore"); }
  };
  const nomeFile = [data.nome, data.piano, data.versione ? `v${data.versione}` : "", calcolo.luce, calcolo.qualita, varianteSalvata ? "variante" : ""]
    .filter(Boolean).join("-").replace(/[^\p{L}\d]+/gu, "-").toLowerCase() + "-cycles.png";
  return <Dialog open onOpenChange={apri => { if (!apri) onChiudi(); }}>
    <DialogContent className="flex max-h-[94dvh] max-w-6xl flex-col gap-3 overflow-hidden p-4 sm:p-6">
      <DialogHeader className="shrink-0 pr-6 text-left">
        <DialogTitle className="flex items-center gap-2"><Sparkles className="size-5 text-primary" />Render dalla vista 3D</DialogTitle>
        <DialogDescription>{[data.nome, data.piano, data.versione ? `Versione ${data.versione}` : null, "Blender Cycles in locale · 0 crediti"].filter(Boolean).join(" · ")}</DialogDescription>
      </DialogHeader>
      <div className="flex shrink-0 flex-wrap items-end gap-2">
        <label className="space-y-1 text-xs font-medium">Illuminazione
          <UniformSelect value={luce} disabled={inCorso} onChange={e=>setLuce(e.target.value as LuceRenderLocale)}>
            {Object.entries(LUCI).map(([id,nome]) => <option key={id} value={id}>{nome}</option>)}
          </UniformSelect>
        </label>
        <label className="space-y-1 text-xs font-medium">Qualità
          <UniformSelect value={qualita} disabled={inCorso} onChange={e=>setQualita(e.target.value as QualitaRenderLocale)}>
            {Object.entries(QUALITA).map(([id,nome]) => <option key={id} value={id}>{nome}</option>)}
          </UniformSelect>
        </label>
        {orientata && <label className="space-y-1 text-xs font-medium">Ora del sole indicativo
          <UniformSelect value={String(ora)} disabled={inCorso} onChange={e=>setOra(Number(e.target.value))}>
            {Array.from({ length: 49 }, (_, i) => 7 + i / 4).map(h =>
              <option key={h} value={h}>{String(Math.floor(h)).padStart(2, "0")}:{String(Math.round(h % 1 * 60)).padStart(2, "0")}</option>)}
          </UniformSelect>
        </label>}
        <Button type="button" variant={modifiche ? "default" : "outline"} disabled={inCorso || salvataggio === "in_corso" || (!errore && !modifiche)}
          onClick={() => setCalcolo({ luce, ora, qualita, varianti })}><RotateCcw className="size-4"/>{errore ? "Riprova" : "Ricalcola"}</Button>
      </div>
      <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 rounded-lg border bg-muted/35 px-3 py-2">
        <p role="status" className="flex items-center gap-2 text-sm">
          {inCorso && <LoaderCircle aria-hidden className="size-4 text-primary motion-safe:animate-spin"/>}
          {png && <Check aria-hidden className="size-4 text-emerald-600"/>}
          {errore ? "Calcolo da riprovare" : png ? "Render pronto" : rif ? "Calcolo della luce e dei materiali" : "Preparo l’inquadratura 3D"}
        </p>
        {png && data.archivio && <div className="flex flex-wrap items-center gap-2">
          {salvataggio === "errore" && <span role="alert" className="text-xs text-destructive">Archivio del browser non disponibile.</span>}
          <Button type="button" size="sm" variant="outline" disabled={salvataggio === "in_corso" || salvataggio === "salvato"} onClick={() => void includi()}>
            {salvataggio === "salvato" ? <Check className="size-4"/> : <FileText className="size-4"/>}
            {salvataggio === "salvato" ? "Aggiunto al PDF" : salvataggio === "in_corso" ? "Salvataggio…" : "Includi nel PDF"}
          </Button>
        </div>}
      </div>
      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto overscroll-contain pr-1">
        {(finiture || elemento) && <details className="rounded-lg border bg-card">
          <summary className="cursor-pointer rounded-lg px-3 py-2 text-sm font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
            <Paintbrush aria-hidden="true" className="mr-1.5 inline size-4 text-primary" /> Materiali e arredi
          </summary>
          <div className="space-y-3 border-t p-3">
            <p className="text-xs text-muted-foreground">Scegli le varianti per questa immagine e premi Ricalcola.</p>
            {finiture && <div className="grid gap-2 sm:grid-cols-2">
              {(["pavimento", "pareti"] as const).map(superficie => {
                const base = superficie === "pareti" && locale?.finiture?.rivestimento ? locale.finiture.rivestimento.materiale : locale?.finiture?.[superficie];
                const campione = campioneFinitura(varianti[superficie] ?? base, superficie);
                const foto = campione && FOTO_FINITURE[campione.trama];
                const nome = superficie === "pavimento" ? "Pavimento" : locale?.finiture?.rivestimento ? "Rivestimento" : "Pareti";
                return <div key={superficie} className="space-y-1 text-xs font-medium">
                  <span>{nome}</span>
                  <span className="flex items-center gap-2">
                    {foto && <img src={foto} alt="" className="size-9 shrink-0 rounded-md border object-cover" />}
                    <Select disabled={inCorso} value={varianti[superficie] ?? "progetto"} onValueChange={id => {
                      setVarianti(prec => ({ ...prec, [superficie]: id === "progetto" ? undefined : id }));
                    }}>
                      <SelectTrigger aria-label={nome} className="min-w-0 grow"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="progetto">Da progetto</SelectItem>
                        {CAMPIONI_FINITURE[superficie].map(c => <SelectItem key={c.id} value={c.id}>{c.nome}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </span>
                </div>;
              })}
            </div>}
            {elemento && <div className="grid gap-2 sm:grid-cols-[1fr_1fr_auto]">
              <label className="space-y-1 text-xs font-medium">Oggetto
                <UniformSelect disabled={inCorso} value={elemento.id} onChange={e => scegliElemento(e.target.value)}>
                  {oggetti.map((e, i) => <option key={e.id} value={e.id}>{nomeDelTipo(e.tipo)}{oggetti.filter(o => o.tipo === e.tipo).length > 1 ? ` (${oggetti.slice(0, i + 1).filter(o => o.tipo === e.tipo).length})` : ""}</option>)}
                </UniformSelect>
              </label>
              {!!modelli.length && <label className="space-y-1 text-xs font-medium">Modello
                <UniformSelect disabled={inCorso} value={scelta?.modello ?? ""} onChange={e => cambiaArredo({ modello: e.target.value || undefined })}>
                  <option value="">Da progetto</option>
                  {modelli.map(m => <option key={m.id} value={m.id}>{m.nome}</option>)}
                </UniformSelect>
              </label>}
              {elemento.tipo !== "piscina" && <label className="flex flex-col gap-1 text-xs font-medium">Colore
                <input type="color" disabled={inCorso} value={scelta?.colore ?? elemento.colore ?? "#d4c4af"} className="h-9 w-16 rounded-md border bg-background p-1"
                  onChange={e => cambiaArredo({ colore: e.target.value })} />
              </label>}
            </div>}
            {elemento && haPianoCucina(elemento.tipo) && <div className="max-w-sm space-y-1 text-xs font-medium">
              <span>Piano di lavoro</span>
              <span className="flex items-center gap-2">
                {pianoCucina && <img src={FOTO_FINITURE[pianoCucina.trama]} alt="" className="size-9 shrink-0 rounded-md border object-cover" />}
                <Select disabled={inCorso} value={scelta?.pianoCucina ?? "progetto"}
                  onValueChange={id => cambiaArredo({ pianoCucina: id === "progetto" ? undefined : id })}>
                  <SelectTrigger aria-label="Piano di lavoro" className="min-w-0 grow"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="progetto">Da progetto</SelectItem>
                    {PIANI_CUCINA_RENDER.map(c => <SelectItem key={c.id} value={c.id}>
                      {c.id === "marmo" ? "Marmo bianco di Carrara" : c.nome}
                    </SelectItem>)}
                  </SelectContent>
                </Select>
              </span>
            </div>}
            {vasca && dimensioni && <p className="text-xs text-muted-foreground">
              Bordo esterno {misuraMetri(dimensioni.p)} × {misuraMetri(dimensioni.l)} m · Vasca interna {misuraMetri(vasca.lungo)} × {misuraMetri(vasca.luce)} m · Profondità {misuraMetri(vasca.vasca)} m
            </p>}
            {elemento?.tipo === "auto" && dimensioni && <p className="text-xs text-muted-foreground">
              Ingombro sulla pianta {misuraMetri(dimensioni.p)} × {misuraMetri(dimensioni.l)} m · Altezza {misuraMetri(dimensioni.h)} m
            </p>}
            {varianti !== INIZIALI && <Button size="sm" variant="ghost" disabled={inCorso} type="button" onClick={() => setVarianti(INIZIALI)}>
              Ripristina materiali e arredi del progetto
            </Button>}
          </div>
        </details>}
        <ConfrontoRender3D nome={data.nome} riferimento={rif} risultato={png} errore={errore} nomeFile={nomeFile} rapporto={larghezza / altezza} />
        {highland && <a className="block text-xs text-muted-foreground underline underline-offset-2" href={CREDITO_MODEL_3_HIGHLAND.fonte} target="_blank" rel="noreferrer">
          Modello Tesla Model 3 Highland · {CREDITO_MODEL_3_HIGHLAND.attribuzione}
        </a>}
      </div>
    </DialogContent>
  </Dialog>;
}
