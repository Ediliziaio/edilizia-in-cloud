/**
 * Prima e dopo nella scheda della pianta: com'è oggi e il progetto, a cursore o affiancati,
 * i lavori stanza per stanza con i costi di massima, il PDF da dare al cliente e i render AI
 * della stessa stanza prima e dopo (stessa inquadratura: la vista 3D dentro la stanza).
 */
import { useMemo, useRef, useState } from "react";
import { ChevronDown, Download, FileText, Loader2, Sparkles } from "lucide-react";
import { PreventivoDaPiantaDialog } from "@/components/planimetrie/PreventivoDaPiantaDialog";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { esportaSvg, vistaDaPlanimetria } from "@/lib/planimetrie/esporta";
import { avanzamento, chiaveLavoro, euro, lavoriDaPianta, nomeGenere, scriviQuantita, stessoRiquadro } from "@/lib/planimetrie/primaEDopo";
import { useSalvaVersionePlanimetria } from "@/lib/planimetrie/archivio";
import { Checkbox } from "@/components/ui/checkbox";
import { IDEE_PRONTE } from "@/modules/render-stanza/lib/ideePronte";
import { avviaRenderStanza } from "@/lib/planimetrie/render/renderInSerie";
import { chiaviRenderPianta } from "@/lib/planimetrie/render/renderDallaPianta";
import type { Planimetria } from "../../../shared/planimetrie/modello.ts";

interface Props {
  documento: Planimetria;
  titolo: string;
  planimetriaId: string;
  versione: number;
  livelloId: string;
  /** La proposta da confrontare (quella scelta in alto, o la prima). */
  propostaId: string;
  /** Il cliente della pianta: il preventivo creato da qui nasce già suo. */
  contactId?: string | null;
}

const svgUrl = (svg: string) => `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;

/** Un SVG in PNG, con le sue proporzioni, largo `larghezza` pixel. */
async function pngDaSvg(svg: string, larghezza = 1800): Promise<Uint8Array> {
  const img = new Image();
  await new Promise<void>((ok, ko) => { img.onload = () => ok(); img.onerror = () => ko(new Error("Pianta non disegnata.")); img.src = svgUrl(svg); });
  const c = document.createElement("canvas");
  c.width = larghezza;
  c.height = Math.round((larghezza * (img.naturalHeight || 1)) / (img.naturalWidth || 1));
  const g = c.getContext("2d")!;
  g.fillStyle = "#fff";
  g.fillRect(0, 0, c.width, c.height);
  g.drawImage(img, 0, 0, c.width, c.height);
  const blob = await new Promise<Blob>((ok, ko) => c.toBlob((b) => (b ? ok(b) : ko(new Error("Immagine non creata."))), "image/png"));
  return new Uint8Array(await blob.arrayBuffer());
}

export function PrimaEDopo({ documento, titolo, planimetriaId, versione, livelloId, propostaId, contactId }: Props) {
  const [preventivo, setPreventivo] = useState(false);
  // Avanzamento: i lavori spuntati come fatti (bozza finché non si salva)
  const salva = useSalvaVersionePlanimetria();
  const [fattiBozza, setFattiBozza] = useState<Set<string> | null>(null);
  const { effectiveCompany, user } = useAuth();
  const queryClient = useQueryClient();
  const [modo, setModo] = useState<"cursore" | "affiancate">("cursore");
  const [taglio, setTaglio] = useState(50);
  const [aperte, setAperte] = useState<Set<string>>(new Set());
  const [pdfInCorso, setPdfInCorso] = useState(false);
  const [renderInCorso, setRenderInCorso] = useState(false);
  const [stanzaRender, setStanzaRender] = useState<string>("");
  const [idea, setIdea] = useState(IDEE_PRONTE[0].id);
  const riquadro = useRef<HTMLDivElement>(null);

  const livello = documento.livelli.find((l) => l.id === livelloId) ?? documento.livelli[0];
  const proposta = livello?.proposte.find((p) => p.id === propostaId) ?? livello?.proposte[0];

  const piante = useMemo(() => {
    if (!livello || !proposta) return null;
    try {
      const prima = esportaSvg(vistaDaPlanimetria(documento, { modo: "fatto", livelloId: livello.id }), { scala: 50, stile: "presentazione", sfondo: "bianco" }).svg;
      const dopo = esportaSvg(vistaDaPlanimetria(documento, { modo: "progetto", livelloId: livello.id, propostaId: proposta.id }), { scala: 50, stile: "presentazione", sfondo: "bianco" }).svg;
      return stessoRiquadro(prima, dopo);
    } catch {
      return null;
    }
  }, [documento, livello, proposta]);
  const lavori = useMemo(() => (livello && proposta ? lavoriDaPianta(documento, livello.id, proposta.id) : null), [documento, livello, proposta]);
  const stanzeProgetto = proposta?.locali ?? [];
  const stanzaScelta = stanzaRender || stanzeProgetto.find((l) => livello?.fatto.locali.some((x) => x.id === l.id))?.id || "";

  if (!livello || !proposta || !piante || !lavori) return null;

  const muovi = (clientX: number) => {
    const r = riquadro.current?.getBoundingClientRect();
    if (!r) return;
    setTaglio(Math.max(0, Math.min(100, ((clientX - r.left) / r.width) * 100)));
  };

  const scaricaPdf = async () => {
    setPdfInCorso(true);
    try {
      const [prima, dopo] = await Promise.all([pngDaSvg(piante[0]), pngDaSvg(piante[1])]);
      const { pdfPrimaEDopo } = await import("@/lib/planimetrie/primaEDopoPdf");
      const dati = await pdfPrimaEDopo({ titolo, sottotitolo: `${livello.nome} — com'è oggi e ${proposta.nome}`, azienda: effectiveCompany?.name ?? undefined, prima, dopo, nomeProgetto: proposta.nome, lavori });
      const url = URL.createObjectURL(new Blob([new Uint8Array(dati).buffer as ArrayBuffer], { type: "application/pdf" }));
      const a = document.createElement("a");
      a.href = url;
      a.download = `${titolo.replace(/[^\w-]+/g, "-").toLowerCase() || "pianta"}-prima-e-dopo.pdf`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 30_000);
      toast.success("PDF prima e dopo pronto");
    } catch (e) {
      toast.error("PDF non creato", { description: e instanceof Error ? e.message : String(e) });
    } finally {
      setPdfInCorso(false);
    }
  };

  // Due render della stessa stanza, stessa inquadratura: com'è oggi (rinfrescata) e progetto con lo stile scelto.
  const renderPrimaEDopo = async () => {
    const l = stanzeProgetto.find((x) => x.id === stanzaScelta);
    if (!l || !effectiveCompany?.id || !user?.id) return;
    if (!window.confirm(`Due render di «${l.nome}»: com'è oggi e con il progetto. Costano 2 crediti render. Procedo?`)) return;
    setRenderInCorso(true);
    try {
      const base = { companyId: effectiveCompany.id, userId: user.id, planimetriaId, versione, documento, livelloId: livello.id };
      const oggi = l.id && livello.fatto.locali.some((x) => x.id === l.id);
      const ideaOggi = IDEE_PRONTE.find((i) => i.id === "rinfresca") ?? IDEE_PRONTE[0];
      const ideaDopo = IDEE_PRONTE.find((i) => i.id === idea) ?? IDEE_PRONTE[0];
      if (oggi) await avviaRenderStanza({ ...base, ambito: "fatto", nota: "Com'è oggi, senza lavori." }, { chiave: `${l.id}:prima`, localeId: l.id, localeNome: l.nome, idea: ideaOggi });
      await avviaRenderStanza({ ...base, ambito: `progetto:${proposta.id}` }, { chiave: `${l.id}:dopo`, localeId: l.id, localeNome: l.nome, idea: ideaDopo });
      toast.success(oggi ? "Render prima e dopo avviati" : "Render del progetto avviato (la stanza oggi non c'è)", { description: "Compaiono in fondo alla pagina fra un paio di minuti." });
      queryClient.invalidateQueries({ queryKey: chiaviRenderPianta.dellaPianta(planimetriaId) });
      queryClient.invalidateQueries({ queryKey: ["render-credits", effectiveCompany.id] });
    } catch (e) {
      toast.error("Render non avviati", { description: e instanceof Error ? e.message : String(e) });
    } finally {
      setRenderInCorso(false);
    }
  };

  const fattiSalvati = new Set(documento.lavoriFatti?.[proposta.id] ?? []);
  const fatti = fattiBozza ?? fattiSalvati;
  const av = avanzamento(lavori, fatti);
  const spunta = (k: string, v: boolean) => setFattiBozza(() => { const n = new Set(fatti); if (v) n.add(k); else n.delete(k); return n; });
  const salvaAvanzamento = async () => {
    if (!fattiBozza) return;
    const lavoriFatti = { ...(documento.lavoriFatti ?? {}), [proposta.id]: [...fattiBozza].sort() };
    try {
      await salva.mutateAsync({ planimetriaId, documento: { ...documento, lavoriFatti }, origine: "manuale", nota: `Avanzamento lavori ${av.percento}%`, versioneAttesa: versione });
      setFattiBozza(null);
      toast.success(`Avanzamento salvato: ${av.percento}%`);
    } catch (e) {
      toast.error("Avanzamento non salvato", { description: e instanceof Error ? e.message : String(e) });
    }
  };

  const apri = (s: string) => setAperte((v) => { const n = new Set(v); if (n.has(s)) n.delete(s); else n.add(s); return n; });

  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Prima e dopo</h2>
        <div className="flex flex-wrap items-center gap-2">
          <ToggleGroup type="single" value={modo} onValueChange={(v) => v && setModo(v as typeof modo)} variant="outline" size="sm">
            <ToggleGroupItem value="cursore">Cursore</ToggleGroupItem>
            <ToggleGroupItem value="affiancate">Affiancate</ToggleGroupItem>
          </ToggleGroup>
          <Button size="sm" variant="outline" onClick={scaricaPdf} disabled={pdfInCorso}>
            {pdfInCorso ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Download className="mr-1.5 h-4 w-4" />}
            PDF prima e dopo
          </Button>
          <Button size="sm" onClick={() => setPreventivo(true)} disabled={!lavori || lavori.totale <= 0}>
            <FileText className="mr-1.5 h-4 w-4" />
            Crea il preventivo
          </Button>
        </div>
      </div>

      {modo === "cursore" ? (
        <div
          ref={riquadro}
          className="relative w-full cursor-ew-resize touch-none select-none overflow-hidden rounded-lg border bg-white"
          onPointerDown={(e) => { (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId); muovi(e.clientX); }}
          onPointerMove={(e) => { if (e.buttons) muovi(e.clientX); }}
          role="slider"
          aria-label="Confronto com'è oggi e progetto"
          aria-valuenow={Math.round(taglio)}
          aria-valuemin={0}
          aria-valuemax={100}
          tabIndex={0}
          onKeyDown={(e) => { if (e.key === "ArrowLeft") setTaglio((t) => Math.max(0, t - 5)); if (e.key === "ArrowRight") setTaglio((t) => Math.min(100, t + 5)); }}
        >
          <img src={svgUrl(piante[1])} alt={`${proposta.nome}`} className="block w-full" draggable={false} />
          <img src={svgUrl(piante[0])} alt="Com'è oggi" className="absolute inset-0 block w-full" style={{ clipPath: `inset(0 ${100 - taglio}% 0 0)` }} draggable={false} />
          <div className="pointer-events-none absolute inset-y-0 w-0.5 bg-purple-600" style={{ left: `${taglio}%` }}>
            <div className="absolute top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-purple-600 px-2 py-1 text-[11px] font-medium text-white shadow">◀ ▶</div>
          </div>
          <span className="pointer-events-none absolute left-2 top-2 rounded bg-white/90 px-2 py-0.5 text-xs font-medium shadow-sm">Com'è oggi</span>
          <span className="pointer-events-none absolute right-2 top-2 rounded bg-white/90 px-2 py-0.5 text-xs font-medium text-red-700 shadow-sm">{proposta.nome}</span>
        </div>
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {([["Com'è oggi", piante[0]], [proposta.nome, piante[1]]] as const).map(([t, svg]) => (
            <Card key={t} className="overflow-hidden">
              <p className="border-b px-3 py-1.5 text-xs font-medium">{t}</p>
              <img src={svgUrl(svg)} alt={t} className="block w-full bg-white" />
            </Card>
          ))}
        </div>
      )}
      <p className="text-xs text-muted-foreground">In giallo ciò che si demolisce, in rosso ciò che si costruisce. Trascina il cursore per confrontare.</p>

      <Card>
        <CardContent className="space-y-2 p-4">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <p className="text-sm font-semibold">Lavori stanza per stanza</p>
            <p className="text-sm">Totale di massima <span className="font-semibold">{euro(lavori.totale)}</span> <span className="text-xs text-muted-foreground">IVA esclusa</span></p>
          </div>
          {lavori.stanze.length > 0 && (
            <div className="space-y-1">
              <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                <span>Lavori fatti: <span className="font-semibold">{av.percento}%</span> ({euro(av.eseguito)} di {euro(lavori.totale)})</span>
                {fattiBozza && (
                  <Button size="sm" variant="outline" className="h-7" onClick={salvaAvanzamento} disabled={salva.isPending}>
                    {salva.isPending && <Loader2 className="mr-1 h-3 w-3 animate-spin" />}Salva l'avanzamento
                  </Button>
                )}
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-muted"><div className="h-full bg-emerald-500 transition-all" style={{ width: `${av.percento}%` }} /></div>
            </div>
          )}
          {lavori.stanze.length === 0 ? (
            <p className="text-sm text-muted-foreground">Il progetto non cambia niente rispetto a oggi: disegna demolizioni, pareti nuove o impianti nella proposta.</p>
          ) : (
            <ul className="divide-y">
              {lavori.stanze.map((s) => (
                <li key={s.stanza}>
                  <button type="button" className="flex w-full items-center justify-between gap-2 py-2 text-left text-sm" onClick={() => apri(s.stanza)} aria-expanded={aperte.has(s.stanza)}>
                    <span className="font-medium">{s.stanza} <span className="text-xs font-normal text-muted-foreground">· {s.lavori.length} {s.lavori.length === 1 ? "lavoro" : "lavori"}</span></span>
                    <span className="flex items-center gap-2 tabular-nums">{(() => { const a = av.stanze.find((x) => x.stanza === s.stanza); return a && a.fatti > 0 ? <span className="text-xs text-emerald-700">{a.percento}% fatto</span> : null; })()}{euro(s.totale)}<ChevronDown className={`h-4 w-4 transition-transform ${aperte.has(s.stanza) ? "rotate-180" : ""}`} /></span>
                  </button>
                  {aperte.has(s.stanza) && (
                    <table className="mb-2 w-full text-xs">
                      <tbody>
                        {s.lavori.map((l, i) => (
                          <tr key={i} className="border-t">
                            <td className="w-6 py-1"><Checkbox checked={fatti.has(chiaveLavoro(s.stanza, l))} onCheckedChange={(v) => spunta(chiaveLavoro(s.stanza, l), !!v)} aria-label="Fatto" /></td>
                            <td className={`py-1 pr-2 ${fatti.has(chiaveLavoro(s.stanza, l)) ? "text-muted-foreground line-through" : ""}`}>{l.descrizione}<span className="ml-1 text-muted-foreground">({nomeGenere(l.genere)})</span></td>
                            <td className="whitespace-nowrap py-1 pr-2 text-right tabular-nums">{scriviQuantita(l)}</td>
                            <td className="whitespace-nowrap py-1 text-right tabular-nums">{l.prezzo == null ? "a parte" : euro(l.importo)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </li>
              ))}
            </ul>
          )}
          <p className="text-[11px] text-muted-foreground">Prezzi indicativi di mercato, per dare l'ordine di grandezza. Quelli veri si scrivono nel computo, dove le voci restano legate alla pianta.</p>
        </CardContent>
      </Card>

      {stanzeProgetto.length > 0 && (
        <Card>
          <CardContent className="flex flex-wrap items-center gap-2 p-4">
            <p className="w-full text-sm font-semibold">Render AI prima e dopo</p>
            <p className="w-full text-xs text-muted-foreground">La stessa stanza, dalla stessa inquadratura: com'è oggi e con il progetto, nello stile scelto.</p>
            <Select value={stanzaScelta} onValueChange={setStanzaRender}>
              <SelectTrigger className="h-9 w-52" aria-label="Stanza"><SelectValue placeholder="Stanza" /></SelectTrigger>
              <SelectContent>{stanzeProgetto.map((l) => <SelectItem key={l.id} value={l.id}>{l.nome}</SelectItem>)}</SelectContent>
            </Select>
            <Select value={idea} onValueChange={setIdea}>
              <SelectTrigger className="h-9 w-52" aria-label="Stile del progetto"><SelectValue /></SelectTrigger>
              <SelectContent>{IDEE_PRONTE.map((i) => <SelectItem key={i.id} value={i.id}>{i.nome}</SelectItem>)}</SelectContent>
            </Select>
            <Button size="sm" className="gap-1.5 bg-purple-600 hover:bg-purple-700" onClick={renderPrimaEDopo} disabled={renderInCorso || !stanzaScelta}>
              {renderInCorso ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
              Render prima e dopo (2 crediti)
            </Button>
          </CardContent>
        </Card>
      )}
      {lavori && (
        <PreventivoDaPiantaDialog aperto={preventivo} onChiudi={() => setPreventivo(false)} lavori={lavori} titolo={titolo} planimetriaId={planimetriaId} contactId={contactId} />
      )}
    </section>
  );
}
