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
import { useEffect, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { ClipboardList, FileUp, Loader2, Mic, MicOff, PenLine, Ruler, Wand2, X } from "lucide-react";
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
import { percorsiPlanimetrie, type ModoNuovaPianta } from "@/lib/planimetrie/render/percorsi";

type Generata = Extract<EsitoAI, { ok: true }> & { ingresso: IngressoAI; titolo: string };

async function chiediAllAI(richiesta: RichiestaAI): Promise<EsitoAI> {
  const { data, error } = await supabase.functions.invoke("planimetria-genera", { body: richiesta });
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

  if (modo === "disegno") {
    return <EditorConSalvataggio companyId={companyId} titoloPagina="Disegna una pianta" indietro={percorsiPlanimetrie.elenco} />;
  }
  if (generata) return <PiantaGenerata companyId={companyId} generata={generata} onAggiorna={setGenerata} />;
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
  const [errore, setErrore] = useState<string | null>(null);

  // Anteprima del foglio: si raddrizza (rotazione) e, nei PDF a più pagine, si sceglie la pagina.
  const [rotazione, setRotazione] = useState<Rotazione>(0);
  const [pagina, setPagina] = useState(1);
  const [pagine, setPagine] = useState(1);
  const [anteprima, setAnteprima] = useState<string | null>(null);
  useEffect(() => {
    let vivo = true;
    let url: string | null = null;
    setAnteprima(null);
    if (!file) return;
    if (file.type === "application/pdf") {
      paginaPdf(file, pagina)
        .then((r) => { if (vivo) { setPagine(r.pagine); setAnteprima(r.canvas.toDataURL("image/jpeg", 0.7)); } })
        .catch(() => { if (vivo) setPagine(1); });
    } else {
      url = URL.createObjectURL(file);
      setAnteprima(url);
    }
    return () => { vivo = false; if (url) URL.revokeObjectURL(url); };
  }, [file, pagina]);

  const scegliFile = (f: File | null) => {
    setErrore(f ? fileNonValido(f) : null);
    setFile(f && !fileNonValido(f) ? f : null);
    setRotazione(0);
    setPagina(1);
    setPagine(1);
  };

  const avvia = async () => {
    setErrore(null);
    riconoscitore.current?.stop();
    const ingresso: IngressoAI = modo === "testo" ? "descrizione" : modo === "sopralluogo" ? "rilievo" : tipo;
    const richiesta: RichiestaAI = { company_id: companyId, ingresso };
    if (modo === "testo" || modo === "sopralluogo") {
      richiesta.testo = testo.trim();
    }
    if (modo === "sopralluogo" && foto.length) {
      try {
        richiesta.foto_base64 = await Promise.all(foto.slice(0, MASSIMO_FOTO).map(fotoPerRilievo));
      } catch {
        setErrore("Una delle foto non si legge: toglila e riprova.");
        return;
      }
    }
    if (modo !== "testo" && file) {
      // Foto enormi e schermate CAD a sfondo nero: ridotte e portate a fondo bianco; il foglio
      // raddrizzato come l'ha girato l'utente. Un PDF a una pagina e dritto parte così com'è.
      const pdf = file.type === "application/pdf";
      const pronta = pdf
        ? (pagine > 1 || rotazione !== 0 ? await paginaPdf(file, pagina).then((r) => preparaImmagine(file, rotazione, r.canvas)).catch((): null => null) : null)
        : await preparaImmagine(file, rotazione);
      richiesta.mime = pronta?.mime ?? file.type;
      richiesta.file_base64 = await inBase64(pronta?.file ?? file);
      if (pronta) {
        richiesta.larghezza = pronta.larghezza;
        richiesta.altezza = pronta.altezza;
      } else if (file.type.startsWith("image/")) {
        const url = URL.createObjectURL(file);
        const misure = await misureImmagine(url);
        URL.revokeObjectURL(url);
        if (misure) Object.assign(richiesta, misure);
      }
    }
    setInCorso(true);
    const esito = await chiediAllAI(richiesta).catch(() => leggiRispostaAI(null, null));
    setInCorso(false);
    if (esito.ok === false) {
      setErrore(esito.messaggio);
      return;
    }
    const titolo = esito.planimetria.titolo ?? (modo === "sopralluogo" ? "Pianta dal sopralluogo" : file ? file.name.replace(/\.[^.]+$/, "") : "Pianta da descrizione");
    onPronta({ ...esito, ingresso, titolo });
  };

  const pronto = modo === "testo" || modo === "sopralluogo" ? testo.trim().length >= 10 : !!file;

  return (
    <div className="mx-auto max-w-2xl space-y-6 pb-12">
      <TestataPlanimetrie
        indietro={percorsiPlanimetrie.elenco}
        titolo={modo === "testo" ? "Pianta da una descrizione" : modo === "sopralluogo" ? "Pianta dal sopralluogo" : "Pianta da un PDF o da una foto"}
        sottotitolo="L'AI ricava la pianta; tu la controlli e la correggi prima di salvarla. Costa 1 credito AI."
      />
      <Card>
        <CardContent className="space-y-5 p-6">
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
                <Input id="foto-sopralluogo" type="file" accept="image/*" multiple capture="environment"
                  onChange={(e) => { const nuove = [...(e.target.files ?? [])].filter((f) => f.type.startsWith("image/")); setFoto((v) => [...v, ...nuove].slice(0, MASSIMO_FOTO)); e.target.value = ""; }} />
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
                <Input id="schizzo-sopralluogo" type="file" accept="application/pdf,image/png,image/jpeg,image/webp" onChange={(e) => scegliFile(e.target.files?.[0] ?? null)} />
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
                        tipo === valore ? "border-purple-600 bg-purple-50 ring-1 ring-purple-600" : "hover:bg-muted",
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
                <Input id="file-pianta" type="file" accept="application/pdf,image/png,image/jpeg,image/webp" onChange={(e) => scegliFile(e.target.files?.[0] ?? null)} />
                <p className="text-xs text-muted-foreground">Va bene quasi tutto: catastale, disegno del tecnico, schermata di AutoCAD (anche a sfondo nero), foto del foglio, pianta arredata, condominio con più appartamenti, capannone, più piani sullo stesso foglio. Meglio se le misure si leggono.</p>
                {file && anteprima && (
                  <div className="space-y-2 rounded-md border bg-muted/30 p-2">
                    <div className="flex h-56 items-center justify-center overflow-hidden rounded bg-white">
                      <img src={anteprima} alt="Anteprima del foglio" className="max-h-52 max-w-full object-contain transition-transform" style={{ transform: `rotate(${rotazione}deg)` }} />
                    </div>
                    <div className="flex flex-wrap items-center gap-2 text-xs">
                      <Button type="button" size="sm" variant="outline" onClick={() => setRotazione((r) => ((r + 270) % 360) as Rotazione)}>Ruota ↺</Button>
                      <Button type="button" size="sm" variant="outline" onClick={() => setRotazione((r) => ((r + 90) % 360) as Rotazione)}>Ruota ↻</Button>
                      <span className="text-muted-foreground">Gira il foglio finché le scritte si leggono dritte.</span>
                      {pagine > 1 && (
                        <span className="ml-auto flex items-center gap-1">
                          <Button type="button" size="sm" variant="ghost" disabled={pagina <= 1} onClick={() => setPagina((x) => x - 1)}>‹</Button>
                          Pagina {pagina} di {pagine}
                          <Button type="button" size="sm" variant="ghost" disabled={pagina >= pagine} onClick={() => setPagina((x) => x + 1)}>›</Button>
                        </span>
                      )}
                    </div>
                  </div>
                )}
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

          <Button className="w-full bg-purple-600 hover:bg-purple-700" disabled={!pronto || inCorso} onClick={avvia}>
            {inCorso ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : modo === "testo" ? <Wand2 className="mr-2 h-4 w-4" /> : modo === "sopralluogo" ? <ClipboardList className="mr-2 h-4 w-4" /> : <FileUp className="mr-2 h-4 w-4" />}
            {inCorso ? "Sto ricavando la pianta… di solito meno di un minuto" : "Ricava la pianta"}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}

function PiantaGenerata({ companyId, generata, onAggiorna }: { companyId: string; generata: Generata; onAggiorna: (g: Generata) => void }) {
  const serveScala = scalaDaConfermare(generata.ingresso, generata.generazione);
  return (
    <EditorConSalvataggio
      // dopo la conferma della scala l'editor riparte dalla pianta adeguata
      key={generata.generazione.scala?.cm_per_unita ?? "senza-scala"}
      companyId={companyId}
      titoloPagina="Controlla la pianta e salvala"
      indietro={percorsiPlanimetrie.elenco}
      iniziale={generata.planimetria}
      titoloProposto={generata.titolo}
      origine={generata.origine}
      avvisi={[
        "Le misure in viola con «≈» sono stimate: controllale e correggile toccandole.",
        ...generata.generazione.avvisi,
      ]}
      sopra={serveScala ? <ConfermaScala generata={generata} onConferma={onAggiorna} /> : undefined}
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
    <div className="flex flex-wrap items-end gap-3 rounded-md border border-violet-200 bg-violet-50 p-3 text-sm">
      <div className="w-full flex items-center gap-2 font-medium text-violet-900">
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
