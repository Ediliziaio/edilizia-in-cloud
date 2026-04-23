import { useState, useRef, useCallback, useEffect, type ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import {
  Sparkles,
  Mic,
  MicOff,
  ChevronDown,
  ChevronUp,
  ChevronRight,
  Plus,
  X,
  Loader2,
  CheckCircle2,
  AlertTriangle,
  Package,
  Wrench,
  Truck,
  Trash2,
  Camera,
  Image as ImageIcon,
  Upload,
} from "lucide-react";
import { formatCurrency } from "@/lib/formatters";
import { captureVelocityEvent, captureVelocityError } from "@/lib/velocity/sentry";

interface Misura {
  label: string;
  valore: string;
  unita: "m" | "cm" | "mm";
}

interface RigaGenerata {
  item_category: string;
  nome: string;
  descrizione: string;
  quantita: number;
  unita_misura: string;
  article_template_id: string | null;
  tariffa_id: string | null;
  misure_x_mm: number | null;
  misure_y_mm: number | null;
  unit_price?: number;
  is_posa_di?: string | null;
  // Addendum P2-04: identità famiglia+configurazione quando l'AI sceglie
  // un'istanza di article_families invece di un article_templates puntuale.
  // Passati through da quote_items per preservare la config nel preventivo.
  family_id?: string | null;
  axis_selections?: Record<string, string> | null;
}

interface SezioneGenerata {
  nome: string;
  righe: RigaGenerata[];
}

interface AIQuotePanelProps {
  onRigheGenerate: (sezioni: SezioneGenerata[]) => void;
  companyId: string;
  tipoLavoro?: string;
  pianoInstallazione?: number;
}

function categoryIcon(cat: string) {
  const map: Record<string, ReactNode> = {
    prodotto: <Package className="h-3 w-3" />,
    posa: <Wrench className="h-3 w-3" />,
    trasporto: <Truck className="h-3 w-3" />,
    smaltimento: <Trash2 className="h-3 w-3" />,
  };
  return map[cat] ?? <Package className="h-3 w-3" />;
}

function categoryColor(cat: string): string {
  const map: Record<string, string> = {
    prodotto: "bg-blue-100 text-blue-700",
    posa: "bg-green-100 text-green-700",
    trasporto: "bg-amber-100 text-amber-700",
    smaltimento: "bg-orange-100 text-orange-700",
    nolo: "bg-purple-100 text-purple-700",
    nota: "bg-gray-100 text-gray-600",
  };
  return map[cat] ?? "bg-gray-100 text-gray-700";
}

export default function AIQuotePanel({
  onRigheGenerate,
  companyId,
  tipoLavoro,
  pianoInstallazione,
}: AIQuotePanelProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<"testo" | "voce" | "foto">("testo");
  const [descrizione, setDescrizione] = useState("");
  const [misure, setMisure] = useState<Misura[]>([]);
  const [stato, setStato] = useState<"idle" | "generando" | "risultato" | "errore">("idle");
  const [risultato, setRisultato] = useState<SezioneGenerata[] | null>(null);
  const [avvertenze, setAvvertenze] = useState<string[]>([]);
  const [note, setNote] = useState("");
  const [isRecording, setIsRecording] = useState(false);
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const [trascrizione, setTrascrizione] = useState("");
  // Foto input (upload foto schizzo/preventivo cartaceo)
  const [fotoFiles, setFotoFiles] = useState<File[]>([]);
  const [fotoPreviewUrls, setFotoPreviewUrls] = useState<string[]>([]);
  const fotoInputRef = useRef<HTMLInputElement | null>(null);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const recordingTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const stopRecording = useCallback(() => {
    if (recordingTimerRef.current) clearInterval(recordingTimerRef.current);
    if (mediaRecorderRef.current?.state !== "inactive") {
      mediaRecorderRef.current?.stop();
    }
    setIsRecording(false);
  }, []);

  // Cleanup su unmount: evita che timer + MediaRecorder + microfono rimangano
  // attivi se il componente viene smontato durante una registrazione (es. utente
  // naviga via durante i 90s). Senza questo, si ha memory leak + indicatore
  // microfono browser che rimane acceso anche a preventivo chiuso.
  //
  // Emette anche un evento `preventivatore.ai.abandon` se lo stato NON è "idle"
  // al momento dello smontaggio: significa che l'utente ha avviato il wizard
  // e lo ha chiuso senza inserire le righe (proxy per churn rate UX).
  //
  // `statoRef` è usato per leggere lo stato corrente dentro il cleanup senza
  // avere `stato` nel dependency array (altrimenti il cleanup girerebbe ad
  // ogni cambio di stato, non solo su unmount).
  const statoRef = useRef(stato);
  useEffect(() => {
    statoRef.current = stato;
  }, [stato]);
  useEffect(() => {
    return () => {
      if (recordingTimerRef.current) {
        clearInterval(recordingTimerRef.current);
        recordingTimerRef.current = null;
      }
      const mr = mediaRecorderRef.current;
      if (mr && mr.state !== "inactive") {
        try {
          mr.stream.getTracks().forEach((t) => t.stop());
          mr.stop();
        } catch {
          // no-op: defensive — se stop() fallisce è perché già fermato
        }
      }
      // P4 FIX: nullifica il ref per evitare memory leak se l'utente
      // riapre il panel subito dopo il cleanup (nuovo MediaRecorder
      // allocato senza ripulire il riferimento morto).
      mediaRecorderRef.current = null;
      if (statoRef.current !== "idle") {
        captureVelocityEvent("preventivatore.ai.abandon", {
          last_stato: statoRef.current,
        });
      }
    };
  }, []);

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
      const mimeType = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
        ? "audio/webm;codecs=opus"
        : MediaRecorder.isTypeSupported("audio/webm")
        ? "audio/webm"
        : MediaRecorder.isTypeSupported("audio/ogg;codecs=opus")
        ? "audio/ogg;codecs=opus"
        : MediaRecorder.isTypeSupported("audio/ogg")
        ? "audio/ogg"
        : "";
      const mr = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
      chunksRef.current = [];
      mr.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };
      mr.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        const effectiveMimeType = mimeType || "audio/webm";
        const ext = effectiveMimeType.startsWith("audio/ogg") ? "ogg" : "webm";
        const blob = new Blob(chunksRef.current, { type: effectiveMimeType });
        const fd = new FormData();
        fd.append("audio", blob, `audio.${ext}`);
        fd.append("language", "it");
        const { data, error } = await supabase.functions.invoke("trascrizione-audio", { body: fd });
        if (error || !data?.testo) {
          toast.error("Trascrizione fallita");
          return;
        }
        setTrascrizione(data.testo);
        setDescrizione(data.testo);
        setActiveTab("testo");
        toast.success("Audio trascritto!");
      };
      mr.start(100);
      mediaRecorderRef.current = mr;
      setIsRecording(true);
      setRecordingSeconds(0);
      recordingTimerRef.current = setInterval(() => {
        setRecordingSeconds((s) => {
          if (s >= 90) {
            stopRecording();
            return s;
          }
          return s + 1;
        });
      }, 1000);
    } catch {
      toast.error("Microfono non disponibile — usa la modalità testo");
      setActiveTab("testo");
    }
  };

  const genera = async () => {
    if (!companyId) {
      toast.error("Azienda non caricata, riprova");
      return;
    }
    if (!descrizione.trim()) {
      toast.error("Inserisci una descrizione");
      return;
    }
    setStato("generando");
    const t0 = performance.now();
    captureVelocityEvent("preventivatore.ai.generate.start", {
      descrizione_len: descrizione.length,
      misure_count: misure.length,
      input_mode: activeTab, // "testo" | "voce"
      tipo_lavoro: tipoLavoro ?? null,
      piano_installazione: pianoInstallazione ?? null,
    });
    try {
      const misureConvertite = misure
        .filter((m) => m.valore.trim() !== "")
        .map((m) => {
          const valore = parseFloat(m.valore);
          if (isNaN(valore)) {
            throw new Error(`Valore misura non valido: "${m.label || "senza etichetta"}"`);
          }
          return { label: m.label, valore, unita: m.unita };
        });
      const { data, error } = await supabase.functions.invoke("ai-genera-preventivo-v2", {
        body: {
          company_id: companyId,
          descrizione,
          tipo_lavoro: tipoLavoro,
          piano_installazione: pianoInstallazione,
          misure: misureConvertite,
        },
      });
      if (error) throw new Error(error.message);
      const sezioni: SezioneGenerata[] = data.sezioni ?? [];
      setRisultato(sezioni);
      setAvvertenze(data.avvertenze ?? []);
      setNote(data.note ?? "");
      setStato("risultato");
      const righeCount = sezioni.reduce((s, sez) => s + sez.righe.length, 0);
      captureVelocityEvent("preventivatore.ai.generate.success", {
        latency_ms: Math.round(performance.now() - t0),
        sezioni_count: sezioni.length,
        righe_count: righeCount,
        avvertenze_count: (data.avvertenze ?? []).length,
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Errore generazione";
      toast.error(msg);
      setStato("errore");
      captureVelocityEvent("preventivatore.ai.generate.error", {
        latency_ms: Math.round(performance.now() - t0),
        message: msg,
      });
      // Log anche come error per tracciamento in Sentry (se configurato)
      captureVelocityError("preventivatore.ai.generate", err, {
        company_id: companyId,
        descrizione_len: descrizione.length,
      });
    }
  };

  // MP-preventivi-v2: generazione da foto via AI vision.
  // Converte file in base64 e invoca ai-genera-preventivo-v2 con input_mode="foto".
  const generaDaFoto = async () => {
    if (fotoFiles.length === 0) {
      toast.error("Carica almeno una foto");
      return;
    }
    setStato("generando");
    const t0 = performance.now();
    captureVelocityEvent("preventivatore.ai.generate.foto.start", {
      foto_count: fotoFiles.length,
      has_nota: !!descrizione,
      tipo_lavoro: tipoLavoro ?? null,
    });
    try {
      const fotoB64 = await Promise.all(
        fotoFiles.map(async (f) => {
          const buf = await f.arrayBuffer();
          const bytes = new Uint8Array(buf);
          let binary = "";
          for (let i = 0; i < bytes.byteLength; i++) binary += String.fromCharCode(bytes[i]);
          return {
            name: f.name,
            mime: f.type || "image/jpeg",
            data_base64: btoa(binary),
          };
        })
      );
      const { data, error } = await supabase.functions.invoke("ai-genera-preventivo-v2", {
        body: {
          company_id: companyId,
          input_mode: "foto",
          descrizione: descrizione || "",
          tipo_lavoro: tipoLavoro,
          piano_installazione: pianoInstallazione,
          foto: fotoB64,
        },
      });
      if (error) throw new Error(error.message);
      const sezioni: SezioneGenerata[] = data.sezioni ?? [];
      setRisultato(sezioni);
      setAvvertenze(data.avvertenze ?? []);
      setNote(data.note ?? "");
      setStato("risultato");
      captureVelocityEvent("preventivatore.ai.generate.foto.success", {
        latency_ms: Math.round(performance.now() - t0),
        sezioni_count: sezioni.length,
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Errore generazione da foto";
      toast.error(msg);
      setStato("errore");
      captureVelocityError("preventivatore.ai.generate.foto", err, { company_id: companyId });
    }
  };

  return (
    <Collapsible open={isOpen} onOpenChange={setIsOpen}>
      <CollapsibleTrigger asChild>
        <button className="w-full flex items-center justify-between p-4 bg-gradient-to-r from-violet-50 to-blue-50 border border-violet-200 rounded-lg hover:bg-violet-50 transition-colors">
          <div className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-violet-600" />
            <span className="font-medium text-sm">Genera con AI</span>
            <Badge variant="secondary" className="text-xs">BETA</Badge>
          </div>
          {isOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
        </button>
      </CollapsibleTrigger>

      <CollapsibleContent>
        <div className="border border-violet-200 border-t-0 rounded-b-lg p-4 space-y-4">

          {(stato === "idle" || stato === "errore") && (
            <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as "testo" | "voce" | "foto")}>
              <TabsList className="w-full">
                <TabsTrigger value="testo" className="flex-1"><ChevronRight className="h-3.5 w-3.5 mr-1.5" />Testo</TabsTrigger>
                <TabsTrigger value="voce" className="flex-1"><Mic className="h-3.5 w-3.5 mr-1.5" />Voce</TabsTrigger>
                <TabsTrigger value="foto" className="flex-1"><Camera className="h-3.5 w-3.5 mr-1.5" />Foto</TabsTrigger>
              </TabsList>

              <TabsContent value="testo" className="space-y-3 mt-3">
                <Textarea
                  placeholder="Es: Sostituzione 2 finestre PVC a 2 ante, circa 100×140cm, soggiorno piano terra..."
                  value={descrizione}
                  onChange={(e) => setDescrizione(e.target.value)}
                  rows={4}
                />

                <details>
                  <summary className="cursor-pointer text-sm text-muted-foreground">
                    + Aggiungi misure (opzionale)
                  </summary>
                  <div className="mt-2 space-y-2">
                    {misure.map((m, i) => (
                      <div key={i} className="flex gap-2 items-center">
                        <Input
                          placeholder="Etichetta (es: larghezza finestra)"
                          value={m.label}
                          onChange={(e) => {
                            const updated = [...misure];
                            updated[i] = { ...updated[i], label: e.target.value };
                            setMisure(updated);
                          }}
                          className="flex-1"
                        />
                        <Input
                          type="number"
                          placeholder="Valore"
                          value={m.valore}
                          onChange={(e) => {
                            const updated = [...misure];
                            updated[i] = { ...updated[i], valore: e.target.value };
                            setMisure(updated);
                          }}
                          className="w-24"
                        />
                        <Select
                          value={m.unita}
                          onValueChange={(v) => {
                            const updated = [...misure];
                            updated[i] = { ...updated[i], unita: v as "m" | "cm" | "mm" };
                            setMisure(updated);
                          }}
                        >
                          <SelectTrigger className="w-20">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="m">m</SelectItem>
                            <SelectItem value="cm">cm</SelectItem>
                            <SelectItem value="mm">mm</SelectItem>
                          </SelectContent>
                        </Select>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => setMisure(misure.filter((_, j) => j !== i))}
                        >
                          <X className="h-4 w-4" />
                        </Button>
                      </div>
                    ))}
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setMisure([...misure, { label: "", valore: "", unita: "m" }])}
                    >
                      <Plus className="h-4 w-4 mr-1" /> Misura
                    </Button>
                  </div>
                </details>

                <Button
                  onClick={genera}
                  className="w-full bg-violet-600 hover:bg-violet-700 text-white"
                >
                  <Sparkles className="h-4 w-4 mr-2" /> Genera preventivo →
                </Button>
              </TabsContent>

              <TabsContent value="voce" className="mt-3">
                <div className="flex flex-col items-center gap-4 py-6">
                  {isRecording ? (
                    <div className="text-center">
                      <div className="relative">
                        <button
                          onMouseUp={stopRecording}
                          onTouchEnd={stopRecording}
                          className="h-20 w-20 rounded-full bg-red-500 hover:bg-red-600 flex items-center justify-center animate-pulse"
                        >
                          <MicOff className="h-8 w-8 text-white" />
                        </button>
                      </div>
                      <p className="mt-3 text-sm font-medium text-red-600">
                        Registrazione: {recordingSeconds}s / 90s
                      </p>
                      <p className="text-xs text-muted-foreground">Rilascia per fermare</p>
                    </div>
                  ) : (
                    <div className="text-center">
                      <button
                        onMouseDown={startRecording}
                        onTouchStart={startRecording}
                        className="h-20 w-20 rounded-full bg-violet-600 hover:bg-violet-700 flex items-center justify-center transition-colors"
                      >
                        <Mic className="h-8 w-8 text-white" />
                      </button>
                      <p className="mt-3 text-sm text-muted-foreground">
                        Tieni premuto per registrare
                      </p>
                      <p className="text-xs text-muted-foreground">Max 90 secondi</p>
                    </div>
                  )}
                  {trascrizione && (
                    <div className="w-full bg-muted/50 rounded p-3 text-sm text-muted-foreground">
                      <p className="font-medium text-xs mb-1 text-foreground">Trascrizione:</p>
                      {trascrizione}
                    </div>
                  )}
                  {trascrizione && (
                    <Button
                      onClick={genera}
                      className="w-full bg-violet-600 hover:bg-violet-700 text-white"
                    >
                      <Sparkles className="h-4 w-4 mr-2" /> Genera preventivo →
                    </Button>
                  )}
                </div>
              </TabsContent>

              <TabsContent value="foto" className="space-y-3 mt-3">
                <div className="rounded-md bg-violet-50 border border-violet-200 p-3 text-xs text-violet-900">
                  <p className="font-medium mb-1">Come funziona</p>
                  <p>
                    Scatta o carica fino a 5 foto: schizzo, preventivo cartaceo, foto del
                    luogo, scheda tecnica prodotto. L'AI estrae prodotti/misure/quantità,
                    le fa matchare col tuo listino e genera le righe del preventivo.
                  </p>
                </div>

                <input
                  ref={fotoInputRef}
                  type="file"
                  accept="image/*"
                  capture="environment"
                  multiple
                  className="hidden"
                  onChange={(e) => {
                    const files = Array.from(e.target.files ?? []).slice(0, 5);
                    const valid = files.filter((f) => f.size <= 8 * 1024 * 1024);
                    if (valid.length < files.length) {
                      toast.error("Alcune foto sono troppo grandi (max 8MB)");
                    }
                    setFotoFiles(valid);
                    setFotoPreviewUrls(valid.map((f) => URL.createObjectURL(f)));
                  }}
                />

                {fotoFiles.length === 0 ? (
                  <button
                    type="button"
                    onClick={() => fotoInputRef.current?.click()}
                    className="w-full border-2 border-dashed border-violet-300 rounded-lg p-6 text-center hover:bg-violet-50 transition-colors"
                  >
                    <Camera className="h-10 w-10 mx-auto mb-2 text-violet-400" />
                    <p className="text-sm font-medium text-violet-700">Scatta o carica foto</p>
                    <p className="text-xs text-muted-foreground mt-1">Max 5 foto · max 8MB ciascuna</p>
                  </button>
                ) : (
                  <div className="space-y-2">
                    <div className="grid grid-cols-3 sm:grid-cols-5 gap-2">
                      {fotoPreviewUrls.map((url, i) => (
                        <div key={i} className="relative group rounded-md overflow-hidden border bg-muted">
                          <img src={url} alt={`Foto ${i + 1}`} className="w-full aspect-square object-cover" />
                          <button
                            type="button"
                            onClick={() => {
                              setFotoFiles((prev) => prev.filter((_, idx) => idx !== i));
                              setFotoPreviewUrls((prev) => prev.filter((_, idx) => idx !== i));
                            }}
                            className="absolute top-1 right-1 h-5 w-5 rounded-full bg-black/60 hover:bg-black/80 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition"
                          >
                            <X className="h-3 w-3" />
                          </button>
                        </div>
                      ))}
                      {fotoFiles.length < 5 && (
                        <button
                          type="button"
                          onClick={() => fotoInputRef.current?.click()}
                          className="aspect-square rounded-md border-2 border-dashed border-violet-300 flex items-center justify-center hover:bg-violet-50"
                        >
                          <Plus className="h-5 w-5 text-violet-400" />
                        </button>
                      )}
                    </div>
                    <Textarea
                      placeholder="Nota aggiuntiva (opzionale): contesto, cliente, urgenze..."
                      value={descrizione}
                      onChange={(e) => setDescrizione(e.target.value)}
                      rows={2}
                    />
                  </div>
                )}

                <Button
                  onClick={generaDaFoto}
                  disabled={fotoFiles.length === 0}
                  className="w-full bg-violet-600 hover:bg-violet-700 text-white"
                >
                  <Sparkles className="h-4 w-4 mr-2" /> Estrai e genera preventivo →
                </Button>
              </TabsContent>
            </Tabs>
          )}

          {stato === "generando" && (
            <div className="space-y-3 py-4">
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin text-violet-600" />
                L&apos;AI sta consultando il tuo listino e le tariffe...
              </div>
              {[1, 2, 3].map((i) => (
                <div key={i} className="h-12 bg-muted animate-pulse rounded" />
              ))}
            </div>
          )}

          {stato === "risultato" && risultato && (
            <div className="space-y-4">
              {avvertenze.length > 0 && (
                <div className="flex gap-2 p-3 bg-amber-50 border border-amber-200 rounded text-sm text-amber-800">
                  <AlertTriangle className="h-4 w-4 mt-0.5 flex-shrink-0" />
                  <ul className="list-disc pl-2 space-y-1">
                    {avvertenze.map((a, i) => (
                      <li key={i}>{a}</li>
                    ))}
                  </ul>
                </div>
              )}

              {risultato.map((sez, si) => (
                <div key={si} className="space-y-2">
                  {risultato.length > 1 && (
                    <h4 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
                      {sez.nome}
                    </h4>
                  )}
                  {sez.righe.map((r, ri) => (
                    <div
                      key={ri}
                      className={`flex items-start gap-3 p-2.5 border rounded text-sm ${
                        r.is_posa_di ? "ml-6 bg-muted/30" : "bg-white"
                      }`}
                    >
                      {r.is_posa_di && (
                        <span className="text-muted-foreground">└</span>
                      )}
                      <span
                        className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-xs font-medium flex-shrink-0 ${categoryColor(r.item_category)}`}
                      >
                        {categoryIcon(r.item_category)}
                        {r.item_category}
                      </span>
                      <div className="flex-1 min-w-0">
                        <p className="font-medium truncate">{r.nome}</p>
                        {r.descrizione && (
                          <p className="text-xs text-muted-foreground truncate">{r.descrizione}</p>
                        )}
                      </div>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        <span className="text-xs text-muted-foreground">
                          {r.quantita} {r.unita_misura}
                        </span>
                        {r.unit_price != null && r.unit_price > 0 && (
                          <span className="text-sm font-medium">
                            {formatCurrency(r.unit_price * r.quantita)}
                          </span>
                        )}
                        {r.article_template_id && (
                          <span className="text-xs px-1 py-0.5 bg-green-100 text-green-700 rounded flex items-center gap-0.5">
                            <CheckCircle2 className="h-3 w-3" /> Listino
                          </span>
                        )}
                        {r.tariffa_id && (
                          <span className="text-xs px-1 py-0.5 bg-blue-100 text-blue-700 rounded">
                            Tariffa
                          </span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              ))}

              {(() => {
                const tot = risultato
                  .flatMap((s) => s.righe)
                  .reduce((sum, r) => sum + (r.unit_price ?? 0) * r.quantita, 0);
                return tot > 0 ? (
                  <div className="flex justify-end pt-2 border-t">
                    <span className="text-sm text-muted-foreground mr-2">Totale stimato:</span>
                    <span className="font-bold">{formatCurrency(tot)}</span>
                  </div>
                ) : null;
              })()}

              {note && <p className="text-xs text-muted-foreground italic">{note}</p>}

              <div className="flex gap-2 pt-2">
                <Button
                  onClick={() => {
                    const righeTot = risultato.flatMap((s) => s.righe);
                    const totale = righeTot.reduce(
                      (sum, r) => sum + (r.unit_price ?? 0) * r.quantita,
                      0,
                    );
                    captureVelocityEvent("preventivatore.ai.insert", {
                      righe_count: righeTot.length,
                      sezioni_count: risultato.length,
                      totale_stimato: Math.round(totale * 100) / 100,
                    });
                    onRigheGenerate(risultato);
                    setStato("idle");
                    setRisultato(null);
                    setDescrizione("");
                    setIsOpen(false);
                    toast.success(
                      `${righeTot.length} righe aggiunte al preventivo`
                    );
                  }}
                  className="flex-1 bg-violet-600 hover:bg-violet-700 text-white"
                >
                  Inserisci nel preventivo
                </Button>
                <Button
                  variant="outline"
                  onClick={() => {
                    captureVelocityEvent("preventivatore.ai.regenerate", {
                      descrizione_len: descrizione.length,
                    });
                    setRisultato(null);
                    genera();
                  }}
                  title="Rigenera con la stessa descrizione"
                >
                  <Sparkles className="h-4 w-4" />
                </Button>
                <Button
                  variant="outline"
                  onClick={() => {
                    captureVelocityEvent("preventivatore.ai.discard", {
                      righe_count: risultato.flatMap((s) => s.righe).length,
                    });
                    setStato("idle");
                    setRisultato(null);
                  }}
                >
                  Scarta
                </Button>
              </div>
            </div>
          )}

        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}
