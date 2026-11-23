import { controlloPrimaDellUso } from "../../../shared/planimetrie/verificaDocumento.ts";
import { ControlloUsoBloccato } from "./ControlloPrimaDellUso";
import { percorsiPlanimetrie } from "@/lib/planimetrie/render/percorsi";
/**
 * Esporta la pianta (fase 1 del piano di completamento, 1/11/2026): DXF a layer per AutoCAD,
 * PDF in scala con cartiglio, SVG e PNG, in stile tecnico o da presentazione.
 *
 * Le funzioni c'erano (src/lib/planimetrie/esporta, fase 6) ma nessuna pagina le usava.
 * Il cartiglio prende nome, recapiti e logo dell'azienda; se il logo non si carica si va senza.
 */
import { useEffect, useId, useMemo, useRef, useState, type Ref } from "react";
import { datiCartiglioDaCollegamenti } from "@/lib/planimetrie/collegamenti";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { BookOpen, Check, Download, FileImage, FileText, Loader2, Paperclip, PenTool } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useBranding } from "@/hooks/useBranding";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { CampoIndirizzo } from "@/components/shared/CampoIndirizzo";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Switch } from "@/components/ui/switch";
import { pianiProspetto, prospettoQuotato, sezione, type Disegno2D, type PianoProspetto } from "@/lib/planimetrie/prospetti";
import { allegaSchedeTecniche } from "@/lib/quotes/allegatiPreventivo";
import { renderVisitaPerFascicolo } from "@/lib/planimetrie/renderVisitaArchivio";
import { fotorealisticoDisponibile } from "@/lib/planimetrie/renderFotorealisticoLocale";
import { PaginaPdfProgetto, SfogliaPdfProgetto } from "./AnteprimaPdfProgetto";
import {
  allegatoPreventivo,
  aziendaDelCartiglio, caricaLogo, ErroreImpaginazione, esportaDxfMigliore, esportaPdf, esportaPng, esportaSvg,
  SCALE_STANDARD, numeraLocali, pianificaPdf, vistaDaPlanimetria, type DatiCartiglio, type FormatoFoglio, type ModoVista, type Orientamento,
} from "@/lib/planimetrie/esporta";
import type { Planimetria, StatoPianta, Tetto } from "../../../shared/planimetrie/modello.ts";

/** I disegni della tavola completa: i quattro prospetti e una sezione a metà, sulla parte lunga. */
export function disegniDellaTavola(stato: StatoPianta | null | undefined, tetto?: Tetto | null, piani?: PianoProspetto[]): Disegno2D[] {
  if (!stato || !stato.muri.some((m) => m.stato !== "da_demolire")) return [];
  const pts = stato.muri.flatMap((m) => [m.p1, m.p2]);
  const minX = Math.min(...pts.map((p) => p.x)), maxX = Math.max(...pts.map((p) => p.x));
  const minY = Math.min(...pts.map((p) => p.y)), maxY = Math.max(...pts.map((p) => p.y));
  // il taglio attraversa il lato lungo: si vedono più stanze
  const taglio = maxX - minX >= maxY - minY
    ? { asse: "verticale" as const, valore: (minX + maxX) / 2 }
    : { asse: "orizzontale" as const, valore: (minY + maxY) / 2 };
  // i prospetti sono quotati; con più piani escono di tutto l'edificio, coi livelli
  const tutti: PianoProspetto[] = piani && piani.length > 1 ? piani : [{ id: "corrente", nome: "", quota: 0, stato, tetto }];
  return [
    prospettoQuotato(tutti, "sud"), prospettoQuotato(tutti, "nord"), prospettoQuotato(tutti, "est"), prospettoQuotato(tutti, "ovest"),
    sezione(stato, taglio, "Sezione A-A", tetto),
  ].filter((d) => d.primitive.length > 0);
}

type Formato = "fascicolo" | "pdf" | "dxf" | "svg" | "png";
type Stile = "tecnico" | "presentazione";

const FORMATI: Array<{ id: Formato; nome: string; nota: string; icona: typeof FileText }> = [
  { id: "fascicolo", nome: "Fascicolo completo PDF", nota: "Tutti i piani, 3D, materiali, schede ambiente, serramenti, impianti e render di questa versione", icona: FileText },
  { id: "pdf", nome: "PDF in scala", nota: "Da stampare: cartiglio, scala, tabella delle stanze", icona: FileText },
  { id: "dxf", nome: "DXF (AutoCAD)", nota: "Si apre in AutoCAD e nei CAD: muri, demolizioni, nuovo, aperture, quote su layer separati", icona: PenTool },
  { id: "svg", nome: "SVG", nota: "Disegno vettoriale in scala, per grafica e web", icona: FileImage },
  { id: "png", nome: "Immagine PNG", nota: "Per WhatsApp, email e presentazioni", icona: FileImage },
];

function scarica(nome: string, dati: Uint8Array | Blob | string, tipo: string) {
  // Copia in un ArrayBuffer vero: un Uint8Array su SharedArrayBuffer non è un BlobPart.
  const parte: BlobPart = dati instanceof Uint8Array ? new Uint8Array(dati).buffer as ArrayBuffer : dati;
  const url = URL.createObjectURL(new Blob([parte], { type: tipo }));
  const a = document.createElement("a");
  a.href = url;
  a.download = nome;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

/** Più PDF in uno, nell'ordine dato (i piani di un edificio). */
export async function unisciPdf(parti: Uint8Array[]): Promise<Uint8Array> {
  const { PDFDocument } = await import("pdf-lib");
  const out = await PDFDocument.create();
  for (const dati of parti) {
    const d = await PDFDocument.load(dati);
    for (const pagina of await out.copyPages(d, d.getPageIndices())) out.addPage(pagina);
  }
  return out.save();
}

const nomeFile = (t: string) => (t || "pianta").normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-zA-Z0-9]+/g, "-").replace(/^-|-$/g, "").toLowerCase() || "pianta";

interface FascicoloPronto {
  chiave: string; nome: string; file: Blob; pagine: number; immaginiRender: number; avvisi: number;
}

function AnteprimaFascicolo({ fascicolo, onSfoglia, bottone }: { fascicolo: FascicoloPronto; onSfoglia: () => void; bottone: Ref<HTMLButtonElement> }) {
  return <div className="overflow-hidden rounded-xl border bg-card motion-safe:animate-in motion-safe:fade-in-0 motion-safe:slide-in-from-bottom-1 motion-safe:duration-150">
    <div className="flex items-start gap-2.5 border-b bg-emerald-50/80 px-3 py-3 text-emerald-900 dark:bg-emerald-950/35 dark:text-emerald-100">
      <Check aria-hidden className="mt-0.5 size-4 shrink-0"/>
      <div role="status">
        <p className="text-sm font-semibold">Fascicolo pronto</p>
        <p className="text-xs">{fascicolo.pagine} {fascicolo.pagine === 1 ? "pagina" : "pagine"} · {fascicolo.immaginiRender} render · {(fascicolo.file.size / 1_000_000).toLocaleString("it-IT",{maximumFractionDigits:2})} MB</p>
      </div>
    </div>
    <PaginaPdfProgetto file={fascicolo.file} pagina={1} copertina/>
    <div className="space-y-2 border-t p-3">
      {fascicolo.avvisi > 0 && <p className="rounded-md bg-amber-50 px-2 py-1.5 text-xs text-amber-900 dark:bg-amber-950/30 dark:text-amber-200">Gli allegati da recuperare sono indicati nel PDF.</p>}
      <Button ref={bottone} type="button" size="sm" variant="outline" className="w-full gap-1.5" onClick={onSfoglia}><BookOpen className="size-4"/>Sfoglia il PDF</Button>
    </div>
  </div>;
}

export function EsportaPiantaDialog({
  aperto, onChiudi, documento, titolo, versione, livelloId, propostaId, haProgetto, planimetriaId, ambitoIniziale, formatoIniziale = "fascicolo",
  modifiche3DNonSalvate = false,
}: {
  aperto: boolean;
  /** Per allegare la pianta a un preventivo (fase 8): il file prende l'id e la versione. */
  planimetriaId?: string;
  onChiudi: () => void;
  documento: Planimetria;
  titolo: string;
  versione: number;
  livelloId: string;
  propostaId?: string;
  /** La pianta ha uno stato di progetto: si può scegliere progetto o confronto. */
  haProgetto: boolean;
  /** Stato scelto nella scheda, anche su un piano senza opere della proposta. */
  ambitoIniziale?: string;
  formatoIniziale?: Formato;
  modifiche3DNonSalvate?: boolean;
}) {
  const { effectiveCompany } = useAuth();
  const { branding } = useBranding();
  const [formato, setFormato] = useState<Formato>(formatoIniziale);
  const notaFormatoId = useId();
  const formatoCorrente = FORMATI.find(f => f.id === formato) ?? FORMATI[0];
  const [modo, setModo] = useState<ModoVista>(ambitoIniziale ? ambitoIniziale.startsWith("progetto:") ? "progetto" : "fatto" : haProgetto ? "progetto" : "fatto");
  const [stile, setStile] = useState<Stile>("tecnico");
  const [foglio, setFoglio] = useState<FormatoFoglio>("A4");
  const [orientamento, setOrientamento] = useState<Orientamento>("orizzontale");
  const [scala, setScala] = useState<string>("auto");
  const [cliente, setCliente] = useState("");
  const [cantiere, setCantiere] = useState("");
  // Committente e cantiere dalle schede collegate: si riempiono solo se l'utente non ha già scritto.
  useEffect(() => {
    const companyId = effectiveCompany?.id;
    if (!aperto || !planimetriaId || !companyId) return;
    let attivo = true;
    void datiCartiglioDaCollegamenti(companyId, planimetriaId).then((d) => {
      if (!attivo) return;
      if (d.committente) setCliente((v) => v || d.committente!);
      if (d.cantiere) setCantiere((v) => v || d.cantiere!);
    }).catch((): undefined => undefined);
    return () => { attivo = false; };
  }, [aperto, planimetriaId, effectiveCompany?.id]);
  const [inCorso, setInCorso] = useState(false);
  const [faseFascicolo, setFaseFascicolo] = useState("");
  const [renderDaIncludere, setRenderDaIncludere] = useState<"ultimi" | "tutti">("ultimi");
  const [fascicolo, setFascicolo] = useState<FascicoloPronto>();
  const [leggiFascicolo, setLeggiFascicolo] = useState(false);
  const apriLettura = useRef<HTMLButtonElement>(null);
  const [erroreEsportazione, setErroreEsportazione] = useState("");
  const [preventivoId, setPreventivoId] = useState<string>("");
  const [allegando, setAllegando] = useState(false);
  // Tavola completa: dopo la pianta, i fogli con prospetti e sezione.
  const [conProspetti, setConProspetti] = useState(false);
  // Con più piani: tutti nello stesso PDF, dal più basso, ognuno sulla sua pagina in scala.
  const [tuttiIPiani, setTuttiIPiani] = useState(false);
  const [tripla, setTripla] = useState(false);
  // Locali numerati («1. Soggiorno»), per i rimandi in capitolati e computi
  const [numera, setNumera] = useState(false);
  const piuPiani = documento.livelli.length > 1;
  const pianoAttivo = documento.livelli.find(l=>l.id===livelloId) ?? documento.livelli[0];
  const puoTavoleComparabili = haProgetto && (piuPiani && tuttiIPiani || pianoAttivo?.proposte.some(p=>!propostaId || p.id===propostaId));
  const tavoleComparabili = formato==="pdf" && tripla && puoTavoleComparabili;

  // Preventivi a cui si può allegare: quelli standard (i moduli fanno il PDF nel browser), non firmati.
  const preventivi = useQuery({
    queryKey: ["planimetria-preventivi-allegabili", effectiveCompany?.id],
    enabled: aperto && !!effectiveCompany?.id && !!planimetriaId,
    queryFn: async () => {
      const { data, error } = await supabase.from("quotes")
        .select("id, quote_number, title, client_name, status, source")
        .eq("company_id", effectiveCompany!.id).is("deleted_at", null).is("signed_at", null)
        .order("created_at", { ascending: false }).limit(60);
      if (error) throw error;
      return (data ?? []).filter((q) => !String(q.source ?? "").startsWith("modulo:"));
    },
  });

  // I dati dell'impresa per il cartiglio: si leggono solo quando serve.
  const azienda = useQuery({
    queryKey: ["planimetria-cartiglio-azienda", effectiveCompany?.id],
    enabled: aperto && !!effectiveCompany?.id,
    staleTime: 10 * 60_000,
    queryFn: async () => {
      const { data, error } = await supabase.from("companies")
        .select("name, legal_address, legal_postal_code, legal_city, legal_province, vat_number, phone, email")
        .eq("id", effectiveCompany!.id).maybeSingle();
      if (error) throw error;
      return data;
    },
  });
  const chiaveFascicolo = JSON.stringify([effectiveCompany?.id, planimetriaId, versione, propostaId, modo, cliente, cantiere, renderDaIncludere, branding?.logo_url, azienda.data]);
  const pronto = formato === "fascicolo" && fascicolo?.chiave === chiaveFascicolo ? fascicolo : undefined;
  const sfogliando = pronto && leggiFascicolo;
  const chiudi = () => { setFascicolo(undefined); setLeggiFascicolo(false); setErroreEsportazione(""); onChiudi(); };
  const tornaAlleOpzioni = () => {
    setLeggiFascicolo(false);
    requestAnimationFrame(() => apriLettura.current?.focus({ preventScroll: true }));
  };

  const vista = useMemo(() => {
    try {
      const l = documento.livelli.find((l) => l.id === livelloId) ?? documento.livelli[0];
      const modoPiano = propostaId && !l?.proposte.some((p) => p.id === propostaId) ? "fatto" : haProgetto ? tavoleComparabili ? "confronto" : modo : "fatto";
      const v = vistaDaPlanimetria(documento, { modo: modoPiano, livelloId, propostaId });
      return numera ? numeraLocali(v) : v;
    } catch {
      return null;
    }
  }, [documento, modo, livelloId, propostaId, haProgetto, numera, tavoleComparabili]);

  // Lo stato disegnato nei prospetti: com'è oggi, oppure la proposta scelta.
  const statoDisegnato = useMemo(() => {
    const liv = documento.livelli.find((l) => l.id === livelloId) ?? documento.livelli[0];
    if (!liv) return null;
    if (!haProgetto || modo === "fatto") return liv.fatto;
    return propostaId ? liv.proposte.find((p) => p.id === propostaId) ?? liv.fatto : liv.proposte[0] ?? liv.fatto;
  }, [documento, livelloId, propostaId, haProgetto, modo]);

  const anteprima = useMemo(() => {
    if (!vista || !aperto) return null;
    try {
      const { svg } = esportaSvg(vista, { scala: 50, stile, sfondo: "bianco" });
      return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
    } catch {
      return null;
    }
  }, [vista, stile, aperto]);

  const base = `${nomeFile(titolo)}-${haProgetto ? modo : "fatto"}`;

  const cartiglioPerOra = async (): Promise<DatiCartiglio | null> => {
    if (!vista) return null;
    const logo = await caricaLogo(branding?.logo_url ?? null).catch((): null => null);
    return {
      azienda: aziendaDelCartiglio(azienda.data ?? { name: effectiveCompany?.name ?? null }, branding ?? null, logo),
      cliente: cliente.trim() || undefined,
      indirizzoCantiere: cantiere.trim() || undefined,
      oggetto: vista.livello ?? undefined,
      data: new Date(),
      versione: `v${versione}`,
    };
  };

  const preparaFascicolo = async (cartiglio: DatiCartiglio) => {
    const { renderPerFascicolo, sorgentePerFascicolo, campioniPersonaliPerFascicolo, documentoOriginalePerFascicolo } = await import("@/lib/planimetrie/fascicoloDati");
    const { esportaFascicolo } = await import("@/lib/planimetrie/fascicoloPdf");
    setFaseFascicolo("Leggo i render del progetto");
    const proposta = propostaId ?? documento.livelli.flatMap((l) => l.proposte)[0]?.id;
    const ambito = modo !== "fatto" && proposta ? `progetto:${proposta}` : "fatto";
    const [renders, renderVisita] = await Promise.allSettled([
      planimetriaId && effectiveCompany?.id ? renderPerFascicolo(effectiveCompany.id, planimetriaId) : Promise.resolve([]),
      planimetriaId ? renderVisitaPerFascicolo({ planimetriaId, versione, ambito }) : Promise.resolve([]),
    ]);
    const avvisiIniziali = [
      ...(renders.status === "rejected" ? ["Archivio Render AI"] : []),
      ...(renderVisita.status === "rejected" ? ["Archivio dei render della visita in questo browser"] : []),
    ];
    const sorgenti = new Map<string, Promise<Uint8Array | null>>();
    const leggiSorgente = (render: { original_photo_url?: string | null }) => {
      const path = render.original_photo_url;
      if (!path || !effectiveCompany?.id) return Promise.resolve(null);
      if (!sorgenti.has(path)) sorgenti.set(path, sorgentePerFascicolo(effectiveCompany.id, path));
      return sorgenti.get(path)!;
    };
    return esportaFascicolo({
      documento, titolo, versione, ambito, cartiglio,
      renders: renders.status === "fulfilled" ? renders.value : [],
      renderVisita: renderVisita.status === "fulfilled" ? renderVisita.value : [],
      avvisiIniziali, renderDaIncludere, progresso: setFaseFascicolo, leggiSorgente,
      leggiDocumentoOriginale: () => effectiveCompany?.id ? documentoOriginalePerFascicolo(effectiveCompany.id, documento.letturaDocumento?.sorgente?.percorso) : Promise.resolve(null),
      leggiCampioniPersonali: (render) => effectiveCompany?.id ? campioniPersonaliPerFascicolo(effectiveCompany.id, render.scelte) : Promise.resolve([]),
    });
  };

  const preparaPdf = async (cartiglio: DatiCartiglio) => {
    const opzioni = { formato:foglio, orientamento, scala:scala==="auto" ? "auto" as const : Number(scala), stile:tavoleComparabili ? "tecnico" as const : stile,
      quoteAutomatiche:tavoleComparabili ? "ingombri" as const : undefined };
    const piani = piuPiani && tuttiIPiani ? [...documento.livelli].sort((a,b)=>a.quota-b.quota) : [pianoAttivo];
    const selezione = propostaId ?? pianoAttivo?.proposte[0]?.id ?? documento.livelli.flatMap(l=>l.proposte)[0]?.id;
    let numeroLocale = 1;
    const viste = piani.flatMap(piano=>{
      const haVariante = haProgetto && piano.proposte.some(p=>p.id===selezione);
      const modi: ModoVista[] = tavoleComparabili && haVariante ? ["fatto","progetto","confronto"] : [haVariante ? modo : "fatto"];
      return modi.map(m=>{
        const v = vistaDaPlanimetria(documento,{livelloId:piano.id,propostaId:selezione,modo:m});
        if (tavoleComparabili) v.quote = v.quote.filter(q=>q.origine!=="da_documento");
        if (!numera) return v;
        const numerata = numeraLocali(v,tavoleComparabili ? 1 : numeroLocale);
        numeroLocale += v.locali.length;
        return numerata;
      });
    });
    const scalaComune = tavoleComparabili && opzioni.scala==="auto"
      ? Math.max(...viste.map(v=>pianificaPdf(v,opzioni).scala)) : opzioni.scala;
    const parti = [];
    for (const [indice,v] of viste.entries()) {
      parti.push(await esportaPdf(v,{...cartiglio,oggetto:v.livello ?? undefined,tavola:String(indice+1).padStart(2,"0")},
        {...opzioni,scala:scalaComune}));
    }
    const r = parti[0];
    const dati = parti.length===1 ? r.dati : await unisciPdf(parti.map(p=>p.dati));
    if (!conProspetti) return {...r,dati,fogli:parti.length};
    const ambito = haProgetto && (tavoleComparabili || modo!=="fatto") && selezione ? `progetto:${selezione}` : "fatto";
    const stato = tavoleComparabili ? pianoAttivo?.proposte.find(p=>p.id===selezione) ?? pianoAttivo?.fatto : statoDisegnato;
    const disegni = disegniDellaTavola(stato,pianoAttivo?.tetto,piuPiani ? pianiProspetto(documento,ambito) : undefined);
    if (!disegni.length) return {...r,dati,fogli:parti.length};
    const { accodaTavole, accodaFoglioImpianti } = await import("@/lib/planimetrie/tavole");
    const intestazione = [titolo,cartiglio.versione,tavoleComparabili ? "Progetto" : vista?.livello].filter(Boolean).join(" - ");
    const t = await accodaTavole(dati,disegni,{formato:foglio,intestazione,primoNumero:parti.length+1});
    const imp = stato ? await accodaFoglioImpianti(t.dati,stato,{formato:foglio,intestazione,numero:parti.length+1+t.fogli}) : null;
    return {...r,dati:imp?.dati ?? t.dati,fogli:parti.length+t.fogli+(imp ? 1 : 0)};
  };

  /** La pianta in A4 come scheda del preventivo: si accoda al PDF che parte al cliente. */
  const allega = async () => {
    if (!controlloPrimaDellUso(documento, "pdf").ok) { toast.error("Verifica il documento prima di allegare il PDF."); return; }
    if (!vista || !planimetriaId || !preventivoId || !effectiveCompany?.id) return;
    setAllegando(true);
    try {
      const cartiglio = await cartiglioPerOra();
      if (!cartiglio) throw new Error("La pianta non ha niente da disegnare.");
      const a = formato === "fascicolo" ? await preparaFascicolo(cartiglio) : tavoleComparabili ? await preparaPdf(cartiglio) : await allegatoPreventivo(vista, cartiglio, { stile });
      const percorso = `${effectiveCompany.id}/planimetrie/${planimetriaId}-v${versione}-${Date.now()}.pdf`;
      const corpo = new Uint8Array(a.dati).buffer as ArrayBuffer;
      const { error: errFile } = await supabase.storage.from("quote-materials").upload(percorso, new Blob([corpo], { type: "application/pdf" }), { contentType: "application/pdf" });
      if (errFile) throw new Error("Il file della pianta non si è caricato: controlla di poter modificare i preventivi.");
      const { data: utente } = await supabase.auth.getUser();
      const { data: scheda, error: errScheda } = await supabase.from("quote_pdf_materials")
        .insert({ company_id: effectiveCompany.id, created_by: utente.user!.id, name: `${formato === "fascicolo" ? "Fascicolo completo" : "Pianta"} — ${titolo} (v${versione})`, storage_path: percorso, category: "planimetria", file_size_bytes: a.dati.byteLength })
        .select("id").single();
      if (errScheda || !scheda) throw new Error("La scheda della pianta non si è creata.");
      const nonAllegate = await allegaSchedeTecniche(preventivoId, [{ material_id: scheda.id, sort_order: 0, nome: titolo }]);
      if (nonAllegate.length) throw new Error("La pianta non si è allegata al preventivo.");
      const q = preventivi.data?.find((x) => x.id === preventivoId);
      toast.success(formato === "fascicolo" ? "Fascicolo completo allegato al preventivo" : "Pianta allegata al preventivo", { description: `${q?.quote_number ?? ""} — esce in fondo al PDF del preventivo (se «schede tecniche» è acceso).` });
    } catch (e) {
      toast.error("Allegato non riuscito", { description: e instanceof Error ? e.message : String(e) });
    } finally {
      setAllegando(false);
      setFaseFascicolo("");
    }
  };

  const esporta = async () => {
    if (!controlloPrimaDellUso(documento, "pdf").ok) { toast.error("Verifica il documento prima di esportare la pianta."); return; }
    if (!vista) { toast.error("La pianta non ha niente da disegnare in questo stato."); return; }
    if (pronto) { scarica(pronto.nome, pronto.file, "application/pdf"); return; }
    setErroreEsportazione("");
    setInCorso(true);
    try {
      if (formato === "fascicolo") {
        const cartiglio = (await cartiglioPerOra())!;
        const r = await preparaFascicolo(cartiglio);
        const nome = `${nomeFile(titolo)}-fascicolo-completo-v${versione}.pdf`;
        const file = new Blob([new Uint8Array(r.dati).buffer], { type: "application/pdf" });
        setFascicolo({ chiave: chiaveFascicolo, nome, file, pagine: r.pagine, immaginiRender: r.immaginiRender, avvisi: r.avvisi });
        scarica(nome, file, "application/pdf");
      } else if (formato === "pdf") {
        const cartiglio = (await cartiglioPerOra())!;
        const r = await preparaPdf(cartiglio);
        const variante = modo === "fatto" && !tavoleComparabili ? undefined : propostaId
          ? documento.livelli.flatMap(l => l.proposte).find(p => p.id === propostaId)
          : pianoAttivo?.proposte[0];
        const dettagli = tavoleComparabili ? "fatto-progetto-comparativa" : haProgetto ? modo : "fatto";
        const nomePdf = [nomeFile(titolo).slice(0,90), dettagli,
          variante && `${nomeFile(variante.nome).slice(0,55)}-${nomeFile(variante.id)}`, `v${versione}`].filter(Boolean).join("-");
        const nome = tavoleComparabili ? `${nomePdf}-${foglio}`
          : conProspetti ? `${nomePdf}-tavola-${foglio}` : `${nomePdf}${piuPiani && tuttiIPiani ? "-tutti-i-piani" : ""}-${foglio}-1-${r.scala}`;
        scarica(`${nome}.pdf`,r.dati,"application/pdf");
        toast.success(r.fogli>1 ? `PDF pronto · ${r.fogli} fogli` : `PDF pronto in scala 1:${r.scala}`);
      } else if (formato === "dxf") {
        const r = await esportaDxfMigliore(vista, { unita: "cm", scala: 50, stile });
        scarica(`${base}.dxf`, r.dati, "application/dxf");
        toast.success("DXF pronto", { description: "Unità: centimetri. Layer MURI, DEMOLIZIONI, NUOVO, APERTURE, QUOTE, TESTI, ARREDI, LOCALI." });
      } else if (formato === "svg") {
        const r = esportaSvg(vista, { scala: 50, stile, sfondo: "bianco" });
        scarica(`${base}.svg`, r.svg, "image/svg+xml");
        toast.success("SVG pronto in scala 1:50");
      } else {
        const r = await esportaPng(vista, { scala: 50, stile, sfondo: "bianco", dpi: 200 });
        scarica(`${base}.png`, r.blob, "image/png");
        toast.success("Immagine pronta");
      }
    } catch (e) {
      const messaggio = e instanceof ErroreImpaginazione || e instanceof Error ? e.message : "Esportazione non riuscita.";
      setErroreEsportazione(messaggio);
    } finally {
      setInCorso(false);
      setFaseFascicolo("");
    }
  };

  return (
    <Dialog open={aperto} onOpenChange={(v) => { if (!v && !inCorso && !allegando) chiudi(); }}>
      <DialogContent className="flex max-h-[92dvh] flex-col gap-0 overflow-hidden p-0 sm:max-w-4xl"
        onEscapeKeyDown={e => { if (sfogliando) { e.preventDefault(); tornaAlleOpzioni(); } }}>
        <DialogHeader className="shrink-0 border-b px-4 py-4 pr-12 text-left sm:px-6">
          <DialogTitle>Esporta il progetto</DialogTitle>
          <DialogDescription>Un fascicolo completo con disegni, informazioni e immagini, oppure una singola tavola in scala.</DialogDescription>
        </DialogHeader>
        <div key={sfogliando ? "fascicolo" : "opzioni"} className="min-h-0 flex-1 space-y-4 overflow-y-auto overscroll-contain px-4 py-4 sm:px-6">
        {sfogliando ? <SfogliaPdfProgetto file={pronto.file} pagine={pronto.pagine} torna={tornaAlleOpzioni}/> : <>
        {modifiche3DNonSalvate && <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900 dark:border-amber-900 dark:bg-amber-950/35 dark:text-amber-100">
          Il PDF usa la versione {versione} salvata. Per includere le modifiche 3D in corso, salvale dal visore.
        </p>}

        <fieldset disabled={inCorso || allegando} className="grid gap-5 md:grid-cols-[1fr_1.1fr]">
          <div className="space-y-4">
            <div className="space-y-2">
            <ToggleGroup type="single" value={formato} aria-label="Formato" aria-describedby={notaFormatoId} className="grid grid-cols-2 gap-1.5"
              onValueChange={v => {
                if (!v) return;
                setFormato(v as Formato); setErroreEsportazione("");
                if (v === "fascicolo" && modo === "confronto") setModo("progetto");
              }}>
              {FORMATI.map((f) => (
                <ToggleGroupItem key={f.id} value={f.id} className="h-auto min-h-10 justify-start gap-1.5 rounded-lg border px-2.5 py-2 text-left text-xs leading-snug
                  data-[state=on]:border-primary/50 data-[state=on]:bg-primary/10 data-[state=on]:text-primary motion-safe:active:scale-[.98]">
                  <f.icona className="size-4 shrink-0 text-primary" aria-hidden="true" />
                  <span>{f.nome}</span>
                </ToggleGroupItem>
              ))}
            </ToggleGroup>
            <p id={notaFormatoId} className="min-h-8 text-xs leading-snug text-muted-foreground">{formatoCorrente.nota}</p>
            </div>

            {haProgetto && !tavoleComparabili && (
              <div className="space-y-1.5">
                <Label className="text-xs">Cosa disegnare</Label>
                <ToggleGroup type="single" value={modo} onValueChange={(v) => v && setModo(v as ModoVista)} variant="outline" size="sm" className="justify-start">
                  <ToggleGroupItem value="fatto">Com'è oggi</ToggleGroupItem>
                  <ToggleGroupItem value="progetto">Progetto</ToggleGroupItem>
                  {formato !== "fascicolo" && <ToggleGroupItem value="confronto">Confronto</ToggleGroupItem>}
                </ToggleGroup>
                {modo === "confronto" && <p className="text-[11px] text-muted-foreground">Giallo = da demolire, rosso = nuovo.</p>}
              </div>
            )}

            {formato !== "fascicolo" && !tavoleComparabili && <div className="space-y-1.5">
              <Label className="text-xs">Stile</Label>
              <ToggleGroup type="single" value={stile} onValueChange={(v) => v && setStile(v as Stile)} variant="outline" size="sm" className="justify-start">
                <ToggleGroupItem value="tecnico">Tecnico</ToggleGroupItem>
                <ToggleGroupItem value="presentazione">Presentazione</ToggleGroupItem>
              </ToggleGroup>
              {stile === "presentazione" && <p className="text-[11px] text-muted-foreground">Pavimenti e arredi colorati: per il cliente.</p>}
            </div>}

            {(formato === "pdf" || formato === "fascicolo") && (
              <div className="space-y-3 rounded-lg border p-3">
                {formato === "fascicolo" && <>
                  <p className="text-xs font-medium">Versione {versione} salvata · Indice cliccabile</p>
                  {fotorealisticoDisponibile() && <p className="text-xs text-muted-foreground">Le inquadrature contrassegnate con «Includi nel PDF» vengono aggiunte da questo browser.</p>}
                  <div className="space-y-1.5">
                    <Label htmlFor="fascicolo-render" className="text-xs">Render da includere</Label>
                    <Select value={renderDaIncludere} onValueChange={(v) => setRenderDaIncludere(v as "ultimi" | "tutti")}>
                      <SelectTrigger id="fascicolo-render" className="h-9"><SelectValue /></SelectTrigger>
                      <SelectContent><SelectItem value="ultimi">Ultimo render per stanza</SelectItem><SelectItem value="tutti">Tutte le varianti</SelectItem></SelectContent>
                    </Select>
                    <p className="text-[11px] text-muted-foreground">{renderDaIncludere === "ultimi" ? "Solo il render completato più recente di ogni stanza. Le altre varianti restano nello storico." : "Tutti i render completati per ogni stanza, della versione e dello stato selezionati."}</p>
                  </div>
                </>}
                {formato === "pdf" && <>
                {puoTavoleComparabili && <div className="flex items-start justify-between gap-3 border-t pt-3">
                  <div>
                    <Label htmlFor="tavole-comparabili" className="text-xs">Fatto, progetto e comparativa</Label>
                    <p className="text-[11px] text-muted-foreground">Tavole tecniche alla stessa scala, con quote d’ingombro, quote inserite a mano, cartiglio e legenda delle opere.</p>
                  </div>
                  <Switch id="tavole-comparabili" checked={tripla} onCheckedChange={setTripla}/>
                </div>}
                <div className="grid grid-cols-3 gap-2">
                  <div className="space-y-1">
                    <Label className="text-xs">Foglio</Label>
                    <Select value={foglio} onValueChange={(v) => setFoglio(v as FormatoFoglio)}>
                      <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                      <SelectContent><SelectItem value="A4">A4</SelectItem><SelectItem value="A3">A3</SelectItem></SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Verso</Label>
                    <Select value={orientamento} onValueChange={(v) => setOrientamento(v as Orientamento)}>
                      <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                      <SelectContent><SelectItem value="orizzontale">Orizzontale</SelectItem><SelectItem value="verticale">Verticale</SelectItem></SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Scala</Label>
                    <Select value={scala} onValueChange={setScala}>
                      <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="auto">Automatica</SelectItem>
                        {SCALE_STANDARD.map((s) => <SelectItem key={s} value={String(s)}>1:{s}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                </>}
                <div className="grid grid-cols-2 gap-2">
                  <div className="space-y-1">
                    <Label className="text-xs" htmlFor="cartiglio-cliente">Committente (facoltativo)</Label>
                    <Input id="cartiglio-cliente" className="h-9" value={cliente} onChange={(e) => setCliente(e.target.value)} placeholder="Mario Rossi" />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs" htmlFor="cartiglio-cantiere">Indirizzo del cantiere</Label>
                    <CampoIndirizzo id="cartiglio-cantiere" className="h-9" value={cantiere} onChange={setCantiere} placeholder="Via Roma 12, Torino" />
                  </div>
                </div>
                <p className="text-[11px] text-muted-foreground">Nel cartiglio: nome, recapiti e logo della tua azienda, data e versione {versione}.</p>
                {formato === "pdf" && <>
                <div className="flex items-start justify-between gap-3 border-t pt-3">
                  <div>
                    <Label htmlFor="numera-locali" className="text-xs">Numera i locali</Label>
                    <p className="text-[11px] text-muted-foreground">«1. Soggiorno», «2. Cucina»… nella pianta e nella tabella, per i rimandi nel capitolato.</p>
                  </div>
                  <Switch id="numera-locali" checked={numera} onCheckedChange={setNumera} />
                </div>
                {piuPiani && (
                  <div className="flex items-start justify-between gap-3 border-t pt-3">
                    <div>
                      <Label htmlFor="tutti-i-piani" className="text-xs">Tutti i piani ({documento.livelli.length})</Label>
                      <p className="text-[11px] text-muted-foreground">Un foglio per piano, dal più basso al più alto, nello stesso PDF.</p>
                    </div>
                    <Switch id="tutti-i-piani" checked={tuttiIPiani} onCheckedChange={setTuttiIPiani} />
                  </div>
                )}
                <div className="flex items-start justify-between gap-3 border-t pt-3">
                  <div>
                    <Label htmlFor="tavola-completa" className="text-xs">Tavola completa</Label>
                    <p className="text-[11px] text-muted-foreground">Dopo la pianta, i quattro prospetti e una sezione, in scala, nello stesso PDF; se ci sono impianti, anche il foglio con punti e linee.</p>
                  </div>
                  <Switch id="tavola-completa" checked={conProspetti} onCheckedChange={setConProspetti} />
                </div>
                </>}
              </div>
            )}
          </div>

          <div className="space-y-3">
            {pronto ? <AnteprimaFascicolo key={pronto.chiave} fascicolo={pronto} onSfoglia={() => setLeggiFascicolo(true)} bottone={apriLettura}/> : <figure className="space-y-1.5">
              <figcaption className="text-xs font-medium">Anteprima della tavola</figcaption>
              <div className="flex aspect-[4/3] items-center justify-center overflow-hidden rounded-lg border bg-white">
                {anteprima ? <img src={anteprima} alt="Anteprima della pianta da esportare" className="h-full w-full object-contain" />
                  : <p className="p-4 text-center text-sm text-muted-foreground">Niente da disegnare in questo stato.</p>}
              </div>
            </figure>}
            {planimetriaId && (formato === "fascicolo" || formato === "pdf") && (
              <div className="space-y-2 rounded-lg border p-3">
                <Label className="text-xs">Allega a un preventivo</Label>
                <div className="flex gap-2">
                  <Select value={preventivoId} onValueChange={setPreventivoId}>
                    <SelectTrigger className="h-9 flex-1" aria-label="Preventivo"><SelectValue placeholder={preventivi.isLoading ? "Caricamento…" : "Scegli il preventivo"} /></SelectTrigger>
                    <SelectContent>
                      {(preventivi.data ?? []).map((q) => (
                        <SelectItem key={q.id} value={q.id}>{[q.quote_number, q.client_name || q.title].filter(Boolean).join(" — ")}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Button size="sm" variant="outline" className="h-9" disabled={!preventivoId || allegando || !vista || !controlloPrimaDellUso(documento, "pdf").ok} onClick={() => void allega()}>
                    {allegando ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Paperclip className="mr-1 h-4 w-4" />}Allega
                  </Button>
                </div>
                <p className="text-[11px] text-muted-foreground">{formato === "fascicolo" ? "Il fascicolo completo, con tutte le pagine e immagini, in fondo al PDF del preventivo." : "Un foglio A4 in scala con il cartiglio, in fondo al PDF del preventivo."} Per i preventivi standard; non firmati.</p>
              </div>
            )}
          </div>
        </fieldset>

        <ControlloUsoBloccato documento={documento} uso="pdf" modifica={planimetriaId ? percorsiPlanimetrie.modifica(planimetriaId) : undefined} />
        </>}
        </div>
        <div className="shrink-0 space-y-2 border-t bg-background px-4 py-3 sm:px-6">
        {(inCorso || allegando) && faseFascicolo && <p role="status" className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 aria-hidden className="size-4 motion-safe:animate-spin"/>{faseFascicolo}…
        </p>}
        {erroreEsportazione && <p role="alert" className="rounded-lg border border-destructive/25 bg-destructive/5 px-3 py-2 text-sm text-destructive">{erroreEsportazione}</p>}
        <DialogFooter className="flex-row flex-wrap justify-end gap-2 sm:space-x-0">
          <Button variant="outline" onClick={chiudi} disabled={inCorso || allegando}>Chiudi</Button>
          <Button onClick={() => void esporta()} disabled={inCorso || allegando || !vista || !controlloPrimaDellUso(documento, "pdf").ok}>
            {inCorso ? <Loader2 className="mr-1.5 h-4 w-4 motion-safe:animate-spin" /> : <Download className="mr-1.5 h-4 w-4" />}
            {inCorso ? "Esportazione in corso…" : `Scarica ${formatoCorrente.nome}`}
          </Button>
        </DialogFooter>
        </div>
      </DialogContent>
    </Dialog>
  );
}
