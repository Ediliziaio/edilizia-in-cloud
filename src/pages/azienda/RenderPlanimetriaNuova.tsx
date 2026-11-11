/**
 * Render AI → Planimetrie → «Nuova pianta»:
 * - `?da=disegno`: l'editor vuoto; la pianta si crea al primo salvataggio;
 * - `?da=documento`: si carica un PDF o una foto (catastale, disegno del tecnico, schizzo);
 * - `?da=testo`: si descrive la casa a parole;
 * - `?da=sopralluogo`: le misure prese sul posto, dettate o scritte, con le foto delle stanze
 *   e, se c'è, lo schizzo (ingresso «rilievo»): le misure dettate entrano come rilevate.
 * Negli ultimi due la pianta la ricava l'AI (`planimetria-genera`, fase 3) e si apre
 * nell'editor con le misure stimate in evidenza; si salva solo dopo averla vista.
 */
import { lazy, Suspense, useEffect, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { CheckCircle2, ClipboardList, Crop, FileUp, Loader2, Mic, MicOff, PenLine, Ruler, Wand2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import { EditorConSalvataggio } from "@/components/planimetrie/editor/EditorConSalvataggio";
import { TestataPlanimetrie } from "@/components/planimetrie/render/TestataPlanimetrie";
import { leggiMisura } from "@/components/planimetrie/editor/misure";
import {
  confermaScala,
  anteprimaFoglio,
  fileNonValido,
  fotoPerRilievo,
  inBase64,
  leggiRispostaAI,
  misureImmagine,
  paginaPdf,
  preparaImmagine,
  type Rotazione,
  scalaDaConfermare,
  type EsitoAI,
  type IngressoAI,
  type RichiestaAI,
} from "@/components/planimetrie/editor/generazione";
import type { CollegamentiPlanimetria } from "@/lib/planimetrie/archivio";
import { percorsiPlanimetrie, type ModoNuovaPianta } from "@/lib/planimetrie/render/percorsi";
import { ACCETTA_DOCUMENTO_PIANTA, eHeic, normalizzaDocumento, notaLetturaPianta, type RitaglioPianta } from "@/lib/planimetrie/documentoImmagine";
import { AttesaLetturaPianta } from "@/components/planimetrie/AttesaLetturaPianta";
import { EsitoLetturaPianta } from "@/components/planimetrie/EsitoLetturaPianta";

const RitaglioDocumentoPianta = lazy(() => import("@/components/planimetrie/RitaglioDocumentoPianta"));
const DocumentoPiantaIngrandito = lazy(() => import("@/components/planimetrie/DocumentoPiantaIngrandito"));

interface DaDove { collegamenti?: CollegamentiPlanimetria; titolo: string; indietro: string }
type Generata = Extract<EsitoAI, { ok: true }> & { ingresso: IngressoAI; titolo: string; sorgente?: { file: Blob; nome: string }; richiesta?: RichiestaAI; letturaId?: string };

async function chiediAllAI(richiesta: RichiestaAI): Promise<EsitoAI> {
  const { data, error } = await supabase.functions.invoke("planimetria-genera", { body: richiesta });
  // Diagnostica locale del collaudo: nessuna immagine, credenziale o dato del cliente.
  if (import.meta.env.DEV && data?.success) console.debug("[planimetria-lettura]", JSON.stringify({
    versione: data.versione_prompt, tentativi: data.tentativi, generazione: data.generazione,
    controlli_documento: data.planimetria?.letturaDocumento,
    livelli: data.planimetria?.livelli?.map((l: { fatto: { locali: unknown[]; aperture: unknown[]; elementi: unknown[]; muri: unknown[] } }) => l.fatto),
  }));
  if (!error) return leggiRispostaAI(data, 200);
  // l'errore della funzione ha il motivo nel corpo della risposta
  const risposta = (error as { context?: Response }).context;
  if (risposta && typeof risposta.json === "function") {
    const corpo: unknown = await risposta.json().catch((): unknown => null);
    return leggiRispostaAI(corpo, risposta.status);
  }
  return leggiRispostaAI(null, null);
}

export default function RenderPlanimetriaNuova() {
  const [params] = useSearchParams();
  const { effectiveCompany } = useAuth();
  const modo: ModoNuovaPianta = (["disegno", "documento", "testo", "sopralluogo"] as const).find((m) => m === params.get("da")) ?? "disegno";
  const [generata, setGenerata] = useState<Generata | null>(null);
  const companyId = effectiveCompany?.id;
  if (!companyId) return null;
  // Arrivando da un'unità di una commessa generale: la pianta nasce collegata alla sua commessa.
  const commessa = params.get("commessa");
  const torna = params.get("torna");
  const per: DaDove = {
    collegamenti: commessa ? { orderId: commessa } : undefined,
    titolo: params.get("titolo") ?? "",
    indietro: torna?.startsWith("/azienda/") ? torna : percorsiPlanimetrie.elenco,
  };

  if (modo === "disegno") {
    return <EditorConSalvataggio companyId={companyId} titoloPagina="Disegna una pianta" indietro={per.indietro} collegamenti={per.collegamenti} titoloProposto={per.titolo} />;
  }
  if (generata) return <PiantaGenerata companyId={companyId} generata={generata} onAggiorna={setGenerata} per={per} />;
  return <ChiediPianta companyId={companyId} modo={modo} onPronta={setGenerata} />;
}

const MASSIMO_FOTO = 6;

/** Dettatura nel browser (Chrome, Edge, Safari): ogni frase finita si aggiunge al testo. */
type Riconoscitore = { lang: string; continuous: boolean; interimResults: boolean; start: () => void; stop: () => void; onresult: ((e: { resultIndex: number; results: ArrayLike<ArrayLike<{ transcript: string }> & { isFinal: boolean }> }) => void) | null; onend: (() => void) | null; onerror: ((e: { error: string }) => void) | null };
function creaRiconoscitore(): Riconoscitore | null {
  const w = window as unknown as { SpeechRecognition?: new () => Riconoscitore; webkitSpeechRecognition?: new () => Riconoscitore };
  const C = w.SpeechRecognition ?? w.webkitSpeechRecognition;
  return C ? new C() : null;
}

function ChiediPianta({ companyId, modo, onPronta }: { companyId: string; modo: "documento" | "testo" | "sopralluogo"; onPronta: (g: Generata) => void }) {
  const [foto, setFoto] = useState<File[]>([]);
  const [dettando, setDettando] = useState(false);
  const riconoscitore = useRef<Riconoscitore | null>(null);
  const puoDettare = typeof window !== "undefined" && ("SpeechRecognition" in window || "webkitSpeechRecognition" in window);
  useEffect(() => () => riconoscitore.current?.stop(), []);
  const detta = () => {
    if (dettando) { riconoscitore.current?.stop(); return; }
    const r = creaRiconoscitore();
    if (!r) return;
    r.lang = "it-IT";
    r.continuous = true;
    r.interimResults = false;
    r.onresult = (e) => {
      const frasi: string[] = [];
      for (let i = e.resultIndex; i < e.results.length; i++) if (e.results[i].isFinal) frasi.push(e.results[i][0].transcript.trim());
      if (frasi.length) setTesto((t) => `${t}${t && !/\n$/.test(t) ? "\n" : ""}${frasi.join("\n")}`.slice(0, 6000));
    };
    r.onend = () => setDettando(false);
    r.onerror = (e) => { setDettando(false); if (e.error === "not-allowed") setErrore("Il browser non ha il permesso di usare il microfono."); };
    riconoscitore.current = r;
    r.start();
    setDettando(true);
  };
  const [tipo, setTipo] = useState<"documento" | "schizzo">("documento");
  const [file, setFile] = useState<File | null>(null);
  const [testo, setTesto] = useState("");
  const [inCorso, setInCorso] = useState(false);
  const [fase, setFase] = useState<"preparazione" | "lettura">("preparazione");
  const [preparandoFile, setPreparandoFile] = useState(false);
  const [nomeOriginale, setNomeOriginale] = useState("");
  const [convertitoHeic, setConvertitoHeic] = useState(false);
  const [ambito, setAmbito] = useState<"completa" | "ambiente">("completa");
  const [nomeAmbiente, setNomeAmbiente] = useState("");
  const [nota, setNota] = useState("");
  const sceltaFile = useRef(0);
  useEffect(() => () => { sceltaFile.current++; }, []);
  const avvioInCorso = useRef(false);
  const [errore, setErrore] = useState<string | null>(null);

  // Anteprima del foglio: si raddrizza (rotazione) e, nei PDF a più pagine, si sceglie la pagina.
  const [rotazione, setRotazione] = useState<Rotazione>(0);
  const [pagina, setPagina] = useState(1);
  const [pagine, setPagine] = useState(1);
  const [ritaglio, setRitaglio] = useState<RitaglioPianta | null>(null);
  const [ritagliando, setRitagliando] = useState(false);
  const [ingrandita, setIngrandita] = useState(false);
  const [vista, setVista] = useState<{ file: File; pagina: number; rotazione: Rotazione; ritaglio: RitaglioPianta | null; url: string | null } | null>(null);
  const vistaAttuale = vista?.file === file && vista?.pagina === pagina && vista?.rotazione === rotazione && vista?.ritaglio === ritaglio;
  const anteprima = vistaAttuale ? vista?.url ?? null : null;
  const anteprimaInCorso = !!file && !vistaAttuale;
  useEffect(() => {
    let vivo = true;
    let url: string | null = null;
    if (!file) return;
    anteprimaFoglio(file, pagina, rotazione, ritaglio).then((r) => {
      if (!vivo) return;
      url = URL.createObjectURL(r.file); setVista({ file, pagina, rotazione, ritaglio, url }); setPagine(r.pagine); setErrore(null);
    }).catch((e: unknown) => { if (vivo) { setVista({ file, pagina, rotazione, ritaglio, url: null }); setErrore(e instanceof Error ? e.message : "Non riesco a preparare l’anteprima."); } });
    return () => { vivo = false; if (url) URL.revokeObjectURL(url); };
  }, [file, pagina, rotazione, ritaglio]);

  const scegliFile = async (f: File | null) => {
    const numero = ++sceltaFile.current;
    setErrore(f ? fileNonValido(f) : null);
    setFile(null); setConvertitoHeic(false); setNomeOriginale(f?.name ?? "");
    setRitaglio(null);
    setRotazione(0);
    setPagina(1);
    setPagine(1);
    if (!f || fileNonValido(f)) { setPreparandoFile(false); return; }
    setPreparandoFile(true);
    try {
      const pronta = await normalizzaDocumento(f);
      if (numero !== sceltaFile.current) return;
      setFile(pronta); setConvertitoHeic(eHeic(f));
    } catch (e) {
      if (numero === sceltaFile.current) setErrore(e instanceof Error ? e.message : "Non riesco a leggere il file.");
    } finally { if (numero === sceltaFile.current) setPreparandoFile(false); }
  };

  const scegliFoto = async (files: File[]) => {
    setErrore(null); setPreparandoFile(true);
    try {
      const pronte: File[] = [];
      // Una foto alla volta: evita sei decodifiche HEIC da 24 MP in parallelo sul telefono.
      for (const f of files.slice(0, MASSIMO_FOTO - foto.length)) pronte.push(await normalizzaDocumento(f));
      setFoto((v) => [...v, ...pronte].slice(0, MASSIMO_FOTO));
    } catch (e) { setErrore(e instanceof Error ? e.message : "Una delle foto non si legge."); }
    finally { setPreparandoFile(false); }
  };

  const avvia = async () => {
    if (avvioInCorso.current) return;
    avvioInCorso.current = true;
    setInCorso(true);
    setFase("preparazione");
    try {
      setErrore(null);
      riconoscitore.current?.stop();
      const ingresso: IngressoAI = modo === "testo" ? "descrizione" : modo === "sopralluogo" ? "rilievo" : tipo;
      const richiesta: RichiestaAI = { company_id: companyId, ingresso };
      if (modo === "documento") richiesta.nota = notaLetturaPianta(ambito, nomeAmbiente, nota, tipo === "schizzo");
      let sorgente: Generata["sorgente"];
      if (modo === "testo" || modo === "sopralluogo") {
        richiesta.testo = testo.trim();
      }
      if (modo === "sopralluogo" && foto.length) {
        try {
          richiesta.foto_base64 = [];
          for (const f of foto.slice(0, MASSIMO_FOTO)) richiesta.foto_base64.push(await fotoPerRilievo(f));
        } catch {
          setErrore("Una delle foto non si legge: toglila e riprova.");
          return;
        }
      }
      if (modo !== "testo" && file) {
        // Foto enormi e schermate CAD a sfondo nero: ridotte e portate a fondo bianco; il foglio
        // raddrizzato come l'ha girato l'utente e reso quadrato con margini bianchi (l'AI sbaglia la scala
        // sui fogli larghi o alti). Anche i PDF si disegnano e si squadrano; se non si riesce parte il PDF così com'è.
        const pdf = file.type === "application/pdf";
        const pronta = pdf
          ? await paginaPdf(file, pagina).then((r) => preparaImmagine(file, rotazione, r.canvas, ritaglio))
          : await preparaImmagine(file, rotazione, undefined, ritaglio);
        if (!pronta) throw new Error("Il documento non è leggibile.");
        richiesta.mime = pronta.mime;
        richiesta.file_base64 = await inBase64(pronta.file);
        sorgente = { file: pronta.file, nome: nomeOriginale || file.name };
        richiesta.larghezza = pronta.larghezza;
        richiesta.altezza = pronta.altezza;
      }
      setFase("lettura");
      const esito = await chiediAllAI(richiesta).catch(() => leggiRispostaAI(null, null));
      if (esito.ok === false) {
        setErrore(esito.messaggio);
        return;
      }
      const titolo = esito.planimetria.titolo ?? (modo === "sopralluogo" ? "Pianta dal sopralluogo" : ambito === "ambiente" && nomeAmbiente.trim() ? nomeAmbiente.trim() : file ? (nomeOriginale || file.name).replace(/\.[^.]+$/, "") : "Pianta da descrizione");
      // Il PDF viene rasterizzato per la lettura, ma l'origine resta il file scelto.
      const origine = ingresso === "documento" && file?.type === "application/pdf" ? "ai_pdf" : esito.origine;
      onPronta({ ...esito, planimetria: { ...esito.planimetria, ...(modo === "documento" ? { ambitoDocumento: ambito === "ambiente" ? "ambiente" as const : "alloggio" as const } : {}) }, origine, ingresso, titolo, sorgente, richiesta, letturaId: crypto.randomUUID() });
    } catch {
      setErrore("Non riesco a preparare il documento: controlla il file e riprova.");
    } finally {
      avvioInCorso.current = false;
      setInCorso(false);
    }
  };

  const pronto = !preparandoFile && !anteprimaInCorso && (modo === "testo" || modo === "sopralluogo" ? testo.trim().length >= 10 : !!file && !!anteprima);

  return (
    <div className="mx-auto max-w-2xl space-y-6 pb-12">
      <TestataPlanimetrie
        indietro={percorsiPlanimetrie.elenco}
        titolo={modo === "testo" ? "Pianta da una descrizione" : modo === "sopralluogo" ? "Pianta dal sopralluogo" : "Pianta da un PDF o da una foto"}
        sottotitolo="L'AI ricava la pianta; tu la controlli e la correggi prima di salvarla. Costa 1 credito AI."
      />
      <Card>
        <CardContent className="space-y-5 p-6">
          <fieldset disabled={inCorso || preparandoFile} aria-busy={inCorso || preparandoFile} className="min-w-0 space-y-5">
          {modo === "sopralluogo" ? (
            <>
              <div className="space-y-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <Label htmlFor="appunti-sopralluogo">Le misure, stanza per stanza</Label>
                  {puoDettare && (
                    <Button type="button" size="sm" variant={dettando ? "default" : "outline"} className={dettando ? "bg-red-600 hover:bg-red-700" : ""} onClick={detta}>
                      {dettando ? <MicOff className="mr-1.5 h-4 w-4" /> : <Mic className="mr-1.5 h-4 w-4" />}
                      {dettando ? "Ferma la dettatura" : "Detta"}
                    </Button>
                  )}
                </div>
                <Textarea
                  id="appunti-sopralluogo"
                  rows={8}
                  value={testo}
                  maxLength={6000}
                  placeholder={"Es.\nIngresso 1,50 per 2\nSoggiorno 4,80 per 3,90, portafinestra 1,40 sul balcone, a sinistra dell'ingresso\nCucina tre e venti per quattro e dieci, finestra 1,20\nBagno 2,10 x 2,40, finestra 60 in fondo, in fondo al corridoio\nAltezza 2,85"}
                  onChange={(e) => setTesto(e.target.value)}
                />
                <p className="text-xs text-muted-foreground">
                  {puoDettare ? "Premi «Detta» e parla mentre misuri: una stanza per frase. " : "Puoi usare il microfono della tastiera del telefono. "}
                  Di' anche chi sta accanto a chi («a destra dell'ingresso», «in fondo al corridoio») e dove sono porte e finestre. Le misure dette diventano misure rilevate; il resto resta da controllare.
                </p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="foto-sopralluogo">Foto delle stanze (facoltative, fino a {MASSIMO_FOTO})</Label>
                <Input id="foto-sopralluogo" type="file" accept="image/png,image/jpeg,image/webp,image/heic,image/heif,.heic,.heif" multiple capture="environment"
                  onChange={(e) => { void scegliFoto([...(e.target.files ?? [])]); e.target.value = ""; }} />
                {foto.length > 0 && (
                  <div className="flex flex-wrap gap-2">
                    {foto.map((f, i) => (
                      <span key={`${f.name}-${i}`} className="flex items-center gap-1 rounded border bg-muted/40 px-2 py-1 text-xs">
                        {f.name.slice(0, 24)}
                        <button type="button" aria-label="Togli la foto" onClick={() => setFoto((v) => v.filter((_, k) => k !== i))}><X className="h-3 w-3" /></button>
                      </span>
                    ))}
                  </div>
                )}
                <p className="text-xs text-muted-foreground">Aiutano l'AI a mettere finestre, sanitari e cucina sulla parete giusta.</p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="schizzo-sopralluogo">Schizzo fatto sul posto (facoltativo)</Label>
                <Input id="schizzo-sopralluogo" type="file" accept={ACCETTA_DOCUMENTO_PIANTA} onClick={(e) => { e.currentTarget.value = ""; }} onChange={(e) => { void scegliFile(e.target.files?.[0] ?? null); }} />
              </div>
            </>
          ) : modo === "documento" ? (
            <>
              <div className="space-y-2">
                <Label>Che cosa carichi?</Label>
                <div className="grid grid-cols-2 gap-2">
                  {(
                    [
                      ["documento", "Un disegno", "Catastale o pianta del tecnico, in scala"],
                      ["schizzo", "Uno schizzo a mano", "Con le misure scritte sopra"],
                    ] as const
                  ).map(([valore, titolo, spiegazione]) => (
                    <button
                      key={valore}
                      type="button"
                      onClick={() => setTipo(valore)}
                      aria-pressed={tipo === valore}
                      className={cn(
                        "rounded-md border p-3 text-left text-sm transition-colors",
                        tipo === valore ? "border-primary bg-primary/5 ring-1 ring-primary" : "hover:bg-muted",
                      )}
                    >
                      <div className="font-medium">{titolo}</div>
                      <div className="text-xs text-muted-foreground">{spiegazione}</div>
                    </button>
                  ))}
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="file-pianta">PDF o foto della pianta</Label>
                <div className="rounded-xl border border-dashed border-primary/30 bg-primary/[0.025] p-4 transition-colors hover:border-primary/60">
                  <div className="mb-3 flex items-center gap-3"><FileUp className="h-8 w-8 shrink-0 text-primary/60" /><div><p className="text-sm font-medium">PDF, foto o schizzo dal telefono</p><p className="text-xs text-muted-foreground">JPG, PNG, WebP, HEIC e HEIF · fino a 10 MB</p></div></div>
                  <Input id="file-pianta" type="file" accept={ACCETTA_DOCUMENTO_PIANTA} onClick={(e) => { e.currentTarget.value = ""; }} onChange={(e) => { void scegliFile(e.target.files?.[0] ?? null); }} />
                </div>
                <p className="text-xs text-muted-foreground max-md:hidden">Va bene quasi tutto: catastale, disegno del tecnico, schermata di AutoCAD (anche a sfondo nero), foto del foglio, pianta arredata, condominio con più appartamenti, capannone, più piani sullo stesso foglio. Meglio se le misure si leggono.</p>
                {file && anteprima && (
                  <div className="space-y-3 rounded-xl border bg-muted/20 p-3 motion-safe:animate-in motion-safe:fade-in-0">
                    <p className="flex items-center gap-2 break-all text-xs"><CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" />{nomeOriginale}{convertitoHeic && <span className="ml-auto shrink-0 rounded bg-emerald-50 px-2 py-1 text-emerald-700">HEIC convertito</span>}</p>
                    <button type="button" aria-label="Ingrandisci il foglio" onClick={() => setIngrandita(true)} className="flex h-72 w-full cursor-zoom-in items-center justify-center overflow-hidden rounded-lg bg-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                      <img src={anteprima} alt="Anteprima del foglio" className="max-h-72 max-w-full object-contain" />
                    </button>
                    <div className="flex flex-wrap items-center gap-2 text-xs">
                      <Button type="button" size="sm" variant="outline" onClick={() => setRotazione((r) => ((r + 270) % 360) as Rotazione)}>Ruota ↺</Button>
                      <Button type="button" size="sm" variant="outline" onClick={() => setRotazione((r) => ((r + 90) % 360) as Rotazione)}>Ruota ↻</Button>
                      {file.type !== "application/pdf" && <Button type="button" size="sm" variant="outline" onClick={() => setRitagliando(true)}><Crop className="mr-1.5 h-3.5 w-3.5" />{ritaglio ? "Modifica ritaglio" : "Ritaglia foglio"}</Button>}
                      {ritaglio && <Button type="button" size="sm" variant="ghost" onClick={() => setRitaglio(null)}>Togli ritaglio</Button>}
                      {pagine > 1 && (
                        <span className="ml-auto flex items-center gap-1">
                          <Button type="button" size="sm" variant="ghost" disabled={pagina <= 1} onClick={() => setPagina((x) => x - 1)}>‹</Button>
                          Pagina {pagina} di {pagine}
                          <Button type="button" size="sm" variant="ghost" disabled={pagina >= pagine} onClick={() => setPagina((x) => x + 1)}>›</Button>
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground">L’AI leggerà questo foglio. Tieni visibili disegno e quote; escludi altri fogli e oggetti sullo sfondo.</p>
                  </div>
                )}
              </div>
              <div className="grid gap-4 rounded-xl border p-4 sm:grid-cols-2">
                <div className="space-y-2"><Label htmlFor="ambito-pianta">Cosa rappresenta?</Label><Select value={ambito} onValueChange={(v) => setAmbito(v as "completa" | "ambiente")}><SelectTrigger id="ambito-pianta"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="completa">Pianta completa</SelectItem><SelectItem value="ambiente">Un solo ambiente</SelectItem></SelectContent></Select></div>
                {ambito === "ambiente" && <div className="space-y-2"><Label htmlFor="nome-ambiente-pianta">Quale ambiente?</Label><Input id="nome-ambiente-pianta" value={nomeAmbiente} maxLength={60} placeholder="Es. Bagno" onChange={(e) => setNomeAmbiente(e.target.value)} /></div>}
                <div className="space-y-2 sm:col-span-2"><Label htmlFor="nota-lettura-pianta">Cosa deve tenere presente l’AI? <span className="font-normal text-muted-foreground">Facoltativo</span></Label><Textarea id="nota-lettura-pianta" rows={2} maxLength={tipo === "schizzo" ? 120 : 300} value={nota} onChange={(e) => setNota(e.target.value)} placeholder="Es. Leggi solo il foglio centrale. Il rientro in alto fa parte del bagno." /></div>
              </div>
            </>
          ) : (
            <div className="space-y-2">
              <Label htmlFor="descrizione-pianta">Com'è la casa?</Label>
              <Textarea
                id="descrizione-pianta"
                rows={5}
                value={testo}
                maxLength={2000}
                placeholder="Es. Trilocale di 75 mq: soggiorno con cucina 30 mq, due camere, bagno 2 × 2,5, corridoio."
                onChange={(e) => setTesto(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">Va bene anche per una villa su due piani («con mansarda»), una bifamiliare («due appartamenti speculari da 90 mq su un lotto 14 × 11 m») o un capannone («20 × 40 m, alto 7 m, uffici e bagni su un lato, portone sul lato corto»). Le misure saranno tutte stimate: le controlli e le correggi nel disegno.</p>
            </div>
          )}
          </fieldset>

          {(preparandoFile || anteprimaInCorso) && <p role="status" className="flex items-center gap-2 rounded-lg bg-primary/5 p-3 text-sm"><Loader2 className="h-4 w-4 motion-safe:animate-spin" />{preparandoFile ? "Preparo il file… converto anche le foto HEIC del telefono." : "Aggiorno l’anteprima del foglio…"}</p>}
          {inCorso && <AttesaLetturaPianta fase={fase} anteprima={anteprima} />}

          {errore && (
            <div role="alert" className="space-y-2 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-900">
              <p>{errore}</p>
              <Button asChild size="sm" variant="outline">
                <Link to={percorsiPlanimetrie.nuova("disegno")}>
                  <PenLine className="mr-2 h-4 w-4" /> Disegnala a mano
                </Link>
              </Button>
            </div>
          )}

          <Button className="w-full bg-primary hover:bg-primary/90" disabled={!pronto || inCorso} onClick={avvia}>
            {inCorso ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : modo === "testo" ? <Wand2 className="mr-2 h-4 w-4" /> : modo === "sopralluogo" ? <ClipboardList className="mr-2 h-4 w-4" /> : <FileUp className="mr-2 h-4 w-4" />}
            {inCorso ? "Lettura in corso…" : "Ricava la pianta"}
          </Button>
        </CardContent>
      </Card>
      {ritagliando && file && <Suspense fallback={<p role="status">Apro il ritaglio…</p>}><RitaglioDocumentoPianta file={file} iniziale={ritaglio} onChiudi={() => setRitagliando(false)} onConferma={(r) => { setRitaglio(r); setRitagliando(false); }} /></Suspense>}
      {ingrandita && anteprima && <Suspense fallback={<p role="status">Ingrandisco il foglio…</p>}><DocumentoPiantaIngrandito src={anteprima} onChiudi={() => setIngrandita(false)} /></Suspense>}
    </div>
  );
}

function PiantaGenerata({ companyId, generata, onAggiorna, per }: { per: DaDove; companyId: string; generata: Generata; onAggiorna: (g: Generata) => void }) {
  const serveScala = scalaDaConfermare(generata.ingresso, generata.generazione);
  const [rileggendo, setRileggendo] = useState(false);
  const [erroreRilettura, setErroreRilettura] = useState<string | null>(null);
  const [indicazioniRilettura, setIndicazioniRilettura] = useState("");
  const riletturaAvviata = useRef(false);
  const rileggi = async () => {
    if (!generata.sorgente || riletturaAvviata.current) return;
    riletturaAvviata.current = true; setRileggendo(true); setErroreRilettura(null);
    let url: string | null = null;
    try {
      url = URL.createObjectURL(generata.sorgente.file);
      const dimensioni = await misureImmagine(url);
      if (!dimensioni) throw new Error("Il documento originale non è più leggibile.");
      const nota = [indicazioniRilettura.trim(), generata.richiesta?.nota ?? notaLetturaPianta("ambiente", generata.titolo, "", generata.ingresso === "schizzo")].filter(Boolean).join(" ").slice(0, 500);
      const richiesta: RichiestaAI = { ...generata.richiesta, company_id: companyId, ingresso: generata.ingresso, mime: generata.sorgente.file.type, file_base64: await inBase64(generata.sorgente.file), nota, ...dimensioni };
      const esito = await chiediAllAI(richiesta);
      if (esito.ok === false) { setErroreRilettura(esito.messaggio); return; }
      onAggiorna({ ...generata, ...esito, planimetria: { ...esito.planimetria, ambitoDocumento: generata.planimetria.ambitoDocumento }, richiesta, letturaId: crypto.randomUUID() });
    } catch (e) { setErroreRilettura(e instanceof Error ? e.message : "La nuova lettura non è riuscita. La bozza precedente è rimasta disponibile."); }
    finally { if (url) URL.revokeObjectURL(url); riletturaAvviata.current = false; setRileggendo(false); }
  };
  return (
    <EditorConSalvataggio
      // dopo la conferma della scala l'editor riparte dalla pianta adeguata
      key={`${generata.letturaId ?? "prima-lettura"}:${generata.generazione.scala?.cm_per_unita ?? "senza-scala"}`}
      companyId={companyId}
      titoloPagina="Controlla la pianta e salvala"
      indietro={per.indietro}
      collegamenti={per.collegamenti}
      iniziale={generata.planimetria}
      sorgenteDocumento={generata.sorgente}
      titoloProposto={per.titolo || generata.titolo}
      origine={generata.origine}
      avvisi={[
        "Le misure in viola con «≈» sono stimate: controllale e correggile toccandole.",
      ]}
      sopra={<div className="space-y-3"><EsitoLetturaPianta pianta={generata.planimetria} sorgente={generata.sorgente} avvisi={generata.planimetria.letturaDocumento ? [] : generata.generazione.avvisi} />
        {generata.sorgente && <div className="flex flex-wrap items-center justify-between gap-2"><Input aria-label="Indicazioni per la rilettura" className="h-8 min-w-[200px] flex-1 text-xs" maxLength={250} disabled={rileggendo} value={indicazioniRilettura} onChange={(e) => setIndicazioniRilettura(e.target.value)} placeholder="Indicazioni facoltative per la nuova lettura dello stesso foglio" /><Button type="button" size="sm" variant="outline" disabled={rileggendo} onClick={() => { void rileggi(); }}>{rileggendo ? <Loader2 className="mr-2 h-4 w-4 motion-safe:animate-spin" /> : <Wand2 className="mr-2 h-4 w-4" />}{rileggendo ? "Rilettura in corso…" : "Rileggi il documento · 1 credito"}</Button></div>}
        {rileggendo && <AttesaLetturaPianta fase="lettura" />}
        {erroreRilettura && <p role="alert" className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-900">{erroreRilettura}</p>}
        {serveScala && <ConfermaScala generata={generata} onConferma={onAggiorna} />}</div>}
    />
  );
}

/** «Questa stanza è larga 4,20»: tutta la pianta in scala si adegua. */
function ConfermaScala({ generata, onConferma }: { generata: Generata; onConferma: (g: Generata) => void }) {
  const locali = generata.planimetria.livelli[0]?.fatto.locali ?? [];
  const [localeId, setLocaleId] = useState(locali[0]?.id ?? "");
  const [asse, setAsse] = useState<"x" | "y">("x");
  const [valore, setValore] = useState("");
  const [nascosta, setNascosta] = useState(false);
  const [errore, setErrore] = useState<string | null>(null);
  if (nascosta || !locali.length) return null;

  const applica = () => {
    const cm = leggiMisura(valore);
    if (!cm) {
      setErrore("Scrivi una misura, es. 4,20.");
      return;
    }
    try {
      const r = confermaScala(generata.planimetria, generata.generazione, localeId, asse, cm);
      onConferma({ ...generata, ...r });
    } catch (e) {
      setErrore(e instanceof Error ? e.message : "Misura non applicata.");
    }
  };

  return (
    <div className="flex flex-wrap items-end gap-3 rounded-md border border-primary/20 bg-primary/5 p-3 text-sm">
      <div className="w-full flex items-center gap-2 font-medium text-foreground">
        <Ruler className="h-4 w-4" /> Metti la pianta in scala: scrivi una misura vera di una stanza, tutto il resto si adegua.
      </div>
      <div className="space-y-1">
        <Label className="text-xs">Stanza</Label>
        <Select value={localeId} onValueChange={setLocaleId}>
          <SelectTrigger className="h-9 w-44 bg-white">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {locali.map((l) => (
              <SelectItem key={l.id} value={l.id}>
                {l.nome}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-1">
        <Label className="text-xs">Quale misura</Label>
        <Select value={asse} onValueChange={(v) => setAsse(v as "x" | "y")}>
          <SelectTrigger className="h-9 w-56 bg-white">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="x">Larghezza (da sinistra a destra)</SelectItem>
            <SelectItem value="y">Profondità (dall'alto in basso)</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-1">
        <Label htmlFor="misura-scala" className="text-xs">Metri</Label>
        <Input id="misura-scala" inputMode="decimal" className="h-9 w-24 bg-white" placeholder="4,20" value={valore} onChange={(e) => setValore(e.target.value)} />
      </div>
      <Button size="sm" onClick={applica}>Applica</Button>
      <Button size="sm" variant="ghost" onClick={() => setNascosta(true)}>Lo faccio dopo</Button>
      {errore && <p className="w-full text-xs text-destructive">{errore}</p>}
    </div>
  );
}
