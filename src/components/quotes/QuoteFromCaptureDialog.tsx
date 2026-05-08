/**
 * QuoteFromCaptureDialog — modale unificato 3 tab per generazione preventivo
 * da foto / audio / testo. Dopo l'estrazione AI mostra <CaptureReviewPanel>
 * per review e correzione utente, poi invoca apply_capture_review per persistere.
 *
 * Supporta:
 *  - Foto multiple (jpg/png/webp/heic) fino a 10 file × 10MB
 *  - PDF: ogni pagina viene renderizzata via pdfjs-dist a immagine JPEG e
 *    aggiunta come foto singola (rispetta MAX_IMAGES totali)
 *  - Audio fino a 3 min (transcript via silvio-transcribe-audio)
 *  - Testo libero
 *  - Vertical key auto-rilevato da company.vertical_key con override UI
 */
import { useState, useRef, useCallback, useEffect, useMemo } from "react";
import { Camera, Mic, FileText, Loader2, X, Upload, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useEffectiveCompanyId } from "@/hooks/useEffectiveCompanyId";
import { useBusinessVertical, useAllBusinessVerticals } from "@/hooks/useBusinessVertical";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { CaptureReviewPanel } from "./CaptureReviewPanel";

const MAX_AUDIO_SECONDS = 180; // 3 min
const MAX_IMAGES = 10;
const MAX_IMAGE_MB = 10;
const MAX_PDF_MB = 25;
const ALLOWED_IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif"]);
const ALLOWED_IMAGE_EXTENSIONS = /\.(jpe?g|png|webp|heic|heif)$/i;
const PDF_EXT_REGEX = /\.pdf$/i;

/**
 * Renderizza un PDF (File) come array di File JPEG (uno per pagina).
 * Usa pdfjs-dist con worker bundled da Vite.
 */
async function pdfToImageFiles(pdfFile: File, maxPages: number, scale = 1.5): Promise<File[]> {
  const pdfjsLib = await import("pdfjs-dist");
  // @ts-expect-error vite-resolved url import
  const workerUrl = (await import("pdfjs-dist/build/pdf.worker.min.mjs?url")).default;
  pdfjsLib.GlobalWorkerOptions.workerSrc = workerUrl;

  const buf = await pdfFile.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: buf }).promise;
  const out: File[] = [];
  const pages = Math.min(pdf.numPages, maxPages);
  for (let i = 1; i <= pages; i++) {
    const page = await pdf.getPage(i);
    const viewport = page.getViewport({ scale });
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d");
    if (!ctx) continue;
    canvas.width = Math.ceil(viewport.width);
    canvas.height = Math.ceil(viewport.height);
    await page.render({ canvasContext: ctx, viewport, canvas }).promise;
    const blob = await new Promise<Blob | null>((res) => canvas.toBlob(res, "image/jpeg", 0.85));
    if (blob) {
      const baseName = pdfFile.name.replace(PDF_EXT_REGEX, "");
      out.push(new File([blob], `${baseName}-p${i}.jpg`, { type: "image/jpeg" }));
    }
    canvas.width = 0;
    canvas.height = 0;
  }
  return out;
}

function safeStorageName(name: string): string {
  const cleaned = name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
  return cleaned || "capture";
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Callback chiamato quando il preventivo è stato creato. Riceve quote_id. */
  onQuoteCreated?: (quoteId: string) => void;
}

export function QuoteFromCaptureDialog({ open, onOpenChange, onQuoteCreated }: Props) {
  const companyId = useEffectiveCompanyId();
  const [activeTab, setActiveTab] = useState<"foto" | "audio" | "testo">("foto");

  // Vertical: auto-detect dalla company, override possibile via picker
  const { data: companyVertical } = useBusinessVertical();
  const { data: allVerticals } = useAllBusinessVerticals();
  const verticalOptions = useMemo(
    () => (allVerticals ?? []).filter((v) => v.enabled),
    [allVerticals],
  );

  // Stato form
  const [images, setImages] = useState<File[]>([]);
  const [imagePreviewUrls, setImagePreviewUrls] = useState<string[]>([]);
  const [textInput, setTextInput] = useState("");
  const [verticalKey, setVerticalKey] = useState("");
  const [pdfProcessing, setPdfProcessing] = useState(false);

  // Auto-set verticalKey dal profilo company quando disponibile
  useEffect(() => {
    if (!verticalKey && companyVertical?.vertical_key) {
      setVerticalKey(companyVertical.vertical_key);
    }
  }, [companyVertical?.vertical_key, verticalKey]);

  // Audio recorder
  const [isRecording, setIsRecording] = useState(false);
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null);
  const [audioPreviewUrl, setAudioPreviewUrl] = useState<string | null>(null);
  const [audioMimeExt, setAudioMimeExt] = useState<string>("webm");
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const cleanupRecorder = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
      try {
        mediaRecorderRef.current.stop();
      } catch { /* ignore */ }
    }
    mediaRecorderRef.current = null;
    setIsRecording(false);
  }, []);

  // Stato pipeline
  const [phase, setPhase] = useState<"input" | "processing" | "review">("input");
  const [runId, setRunId] = useState<string | null>(null);
  const [progressMsg, setProgressMsg] = useState("");

  // Reset al close
  useEffect(() => {
    if (!open) {
      cleanupRecorder();
      setImages([]);
      setImagePreviewUrls((prev) => {
        prev.forEach((url) => URL.revokeObjectURL(url));
        return [];
      });
      setTextInput("");
      setAudioBlob(null);
      setAudioPreviewUrl((prev) => {
        if (prev) URL.revokeObjectURL(prev);
        return null;
      });
      setRecordingSeconds(0);
      setPhase("input");
      setRunId(null);
      setProgressMsg("");
    }
  }, [open, cleanupRecorder]);

  useEffect(() => {
    const urls = images.map((img) => URL.createObjectURL(img));
    setImagePreviewUrls((prev) => {
      prev.forEach((url) => URL.revokeObjectURL(url));
      return urls;
    });
    return () => {
      urls.forEach((url) => URL.revokeObjectURL(url));
    };
  }, [images]);

  useEffect(() => {
    if (!audioBlob) {
      setAudioPreviewUrl((prev) => {
        if (prev) URL.revokeObjectURL(prev);
        return null;
      });
      return;
    }
    const url = URL.createObjectURL(audioBlob);
    setAudioPreviewUrl((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return url;
    });
    return () => URL.revokeObjectURL(url);
  }, [audioBlob]);

  const startRecording = async () => {
    if (typeof MediaRecorder === "undefined" || !navigator.mediaDevices?.getUserMedia) {
      toast.error("Registrazione audio non disponibile su questo browser. Usa la modalità testo.");
      setActiveTab("testo");
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const candidates = [
        "audio/webm;codecs=opus",
        "audio/webm",
        "audio/mp4;codecs=mp4a.40.2",
        "audio/mp4",
        "audio/ogg;codecs=opus",
      ];
      let mimeType = "";
      for (const c of candidates) {
        if (MediaRecorder.isTypeSupported(c)) {
          mimeType = c;
          break;
        }
      }
      const mr = mimeType
        ? new MediaRecorder(stream, { mimeType })
        : new MediaRecorder(stream);
      const ext = mimeType.includes("mp4")
        ? "m4a"
        : mimeType.includes("ogg")
          ? "ogg"
          : "webm";
      setAudioMimeExt(ext);
      chunksRef.current = [];
      mr.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };
      mr.onstop = () => {
        stream.getTracks().forEach((t) => t.stop());
        const blob = new Blob(chunksRef.current, { type: mimeType || "audio/webm" });
        if (blob.size === 0) {
          toast.warning("Nessun audio registrato");
          return;
        }
        setAudioBlob(blob);
      };
      mr.start(100);
      mediaRecorderRef.current = mr;
      setIsRecording(true);
      setRecordingSeconds(0);
      timerRef.current = setInterval(() => {
        setRecordingSeconds((s) => {
          if (s >= MAX_AUDIO_SECONDS) {
            stopRecording();
            return s;
          }
          return s + 1;
        });
      }, 1000);
    } catch (e) {
      toast.error("Permesso microfono negato", {
        description: e instanceof Error ? e.message : String(e),
      });
    }
  };

  const stopRecording = () => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
      mediaRecorderRef.current.stop();
    }
    setIsRecording(false);
  };

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    e.target.value = "";

    if (files.length === 0) return;

    // Suddividi in immagini valide e PDF
    const isImage = (f: File) =>
      f.type.startsWith("image/") || ALLOWED_IMAGE_TYPES.has(f.type) || ALLOWED_IMAGE_EXTENSIONS.test(f.name);
    const isPdf = (f: File) => f.type === "application/pdf" || PDF_EXT_REGEX.test(f.name);

    const oversizedImages = files.filter((f) => isImage(f) && f.size > MAX_IMAGE_MB * 1024 * 1024);
    const oversizedPdfs = files.filter((f) => isPdf(f) && f.size > MAX_PDF_MB * 1024 * 1024);
    const invalidTypes = files.filter((f) => !isImage(f) && !isPdf(f));

    if (oversizedImages.length > 0) {
      toast.warning(`${oversizedImages.length} immagini scartate (>${MAX_IMAGE_MB}MB)`);
    }
    if (oversizedPdfs.length > 0) {
      toast.warning(`${oversizedPdfs.length} PDF scartati (>${MAX_PDF_MB}MB)`);
    }
    if (invalidTypes.length > 0) {
      toast.error(`Tipo file non supportato: ${invalidTypes.map((f) => f.name).join(", ")}`, {
        description: "Accettati: JPG, PNG, WEBP, HEIC, PDF",
      });
    }

    const validImages = files.filter((f) => isImage(f) && f.size <= MAX_IMAGE_MB * 1024 * 1024);
    const validPdfs = files.filter((f) => isPdf(f) && f.size <= MAX_PDF_MB * 1024 * 1024);

    // Renderizza i PDF (multi-pagina) come immagini JPEG, una per pagina
    let renderedFromPdf: File[] = [];
    if (validPdfs.length > 0) {
      setPdfProcessing(true);
      try {
        for (const pdf of validPdfs) {
          const remainingSlots = Math.max(0, MAX_IMAGES - images.length - validImages.length - renderedFromPdf.length);
          if (remainingSlots === 0) {
            toast.warning(`Limite di ${MAX_IMAGES} pagine raggiunto, ${pdf.name} ignorato`);
            break;
          }
          const pages = await pdfToImageFiles(pdf, remainingSlots);
          renderedFromPdf = [...renderedFromPdf, ...pages];
          toast.success(`${pdf.name}: ${pages.length} pagina/e estratta/e`);
        }
      } catch (err) {
        toast.error("Errore lettura PDF", {
          description: err instanceof Error ? err.message : String(err),
        });
      } finally {
        setPdfProcessing(false);
      }
    }

    const availableSlots = Math.max(0, MAX_IMAGES - images.length);
    const allNew = [...validImages, ...renderedFromPdf].slice(0, availableSlots);
    if (allNew.length < validImages.length + renderedFromPdf.length) {
      toast.warning(`Alcune pagine scartate (max ${MAX_IMAGES} totali)`);
    }
    if (allNew.length === 0 && validPdfs.length === 0 && validImages.length === 0) {
      toast.error("Nessun file valido trovato");
      return;
    }
    if (allNew.length > 0) {
      setImages((prev) => [...prev, ...allNew]);
    }
  };

  const submitCapture = async () => {
    if (!companyId) {
      toast.error("Company non risolta");
      return;
    }

    const hasInput = images.length > 0 || !!audioBlob || textInput.trim().length > 10;

    if (!hasInput) {
      toast.error("Aggiungi almeno una foto, un audio o una descrizione di almeno 10 caratteri");
      return;
    }

    setPhase("processing");
    setProgressMsg("Caricamento file…");

    try {
      const imagePaths: string[] = [];
      let audioPath: string | undefined;

      // Upload foto
      if (images.length > 0) {
        for (const [idx, img] of images.entries()) {
          setProgressMsg(`Caricamento foto ${idx + 1}/${images.length}…`);
          const path = `captures/${companyId}/${Date.now()}-${idx}-${safeStorageName(img.name)}`;
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const { error } = await (supabase as any).storage
            .from("documenti-smart")
            .upload(path, img, { upsert: false, contentType: img.type });
          if (error) {
            toast.error(`Upload foto fallito: ${error.message}`);
            setPhase("input");
            return;
          }
          imagePaths.push(path);
        }
      }

      // Upload audio
      if (audioBlob) {
        setProgressMsg("Caricamento audio…");
        const path = `captures/${companyId}/${Date.now()}-audio.${audioMimeExt}`;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { error } = await (supabase as any).storage
          .from("documenti-smart")
          .upload(path, audioBlob, { upsert: false, contentType: audioBlob.type });
        if (error) {
          toast.error(`Upload audio fallito: ${error.message}`);
          setPhase("input");
          return;
        }
        audioPath = path;
      }

      // Determina capture_mode
      const captureMode: "foto" | "audio" | "testo" | "mixed" =
        imagePaths.length > 0 && audioPath
          ? "mixed"
          : audioPath
            ? "audio"
            : imagePaths.length > 0
              ? "foto"
              : "testo";

      setProgressMsg("AI sta estraendo i dati…");

      // Invoke edge ai-quote-from-capture
      const { data, error } = await supabase.functions.invoke("ai-quote-from-capture", {
        body: {
          capture_mode: captureMode,
          image_paths: imagePaths.length > 0 ? imagePaths : undefined,
          audio_path: audioPath,
          description: textInput.trim() || undefined,
          vertical_key: verticalKey || undefined,
          company_id: companyId,
        },
      });

      if (error || !data?.run_id) {
        toast.error("Estrazione AI fallita", {
          description: error?.message ?? data?.error ?? "Risposta non valida",
        });
        setPhase("input");
        return;
      }

      setRunId(data.run_id);
      setPhase("review");
    } catch (e) {
      toast.error("Errore", {
        description: e instanceof Error ? e.message : String(e),
      });
      setPhase("input");
    }
  };

  const formatTime = (s: number) => {
    const m = Math.floor(s / 60);
    const sec = s % 60;
    return `${m}:${sec.toString().padStart(2, "0")}`;
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl w-[96vw] max-h-[94vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-primary" />
            Genera preventivo con AI
          </DialogTitle>
          <DialogDescription>
            Carica una foto del foglio, registra un audio o digita il testo. L'AI estrae cliente e
            prodotti, tu confermi e crei il preventivo.
          </DialogDescription>
        </DialogHeader>

        {phase === "input" ? (
          <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as "foto" | "audio" | "testo")}>
            <TabsList className="grid grid-cols-3">
              <TabsTrigger value="foto" className="gap-2">
                <Camera className="h-4 w-4" /> Foto
              </TabsTrigger>
              <TabsTrigger value="audio" className="gap-2">
                <Mic className="h-4 w-4" /> Audio
              </TabsTrigger>
              <TabsTrigger value="testo" className="gap-2">
                <FileText className="h-4 w-4" /> Testo
              </TabsTrigger>
            </TabsList>

            <TabsContent value="foto" className="space-y-3 pt-3">
              <p className="text-sm text-muted-foreground">
                Foto di un foglio scritto a mano, scontrino, schizzo, oppure PDF (multi-pagina).
                Massimo {MAX_IMAGES} pagine totali.
              </p>
              <label className="block">
                <input
                  type="file"
                  accept="image/*,application/pdf,.pdf"
                  multiple
                  onChange={handleImageUpload}
                  className="hidden"
                  disabled={pdfProcessing}
                />
                <Button variant="outline" size="lg" className="w-full" asChild disabled={pdfProcessing}>
                  <span>
                    {pdfProcessing ? (
                      <>
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" /> Elaborazione PDF…
                      </>
                    ) : (
                      <>
                        <Upload className="h-4 w-4 mr-2" /> Aggiungi foto o PDF ({images.length}/{MAX_IMAGES})
                      </>
                    )}
                  </span>
                </Button>
              </label>
              {images.length > 0 ? (
                <div className="grid grid-cols-3 gap-2 sm:grid-cols-5">
                  {images.map((img, i) => (
                    <div key={i} className="relative border rounded-md overflow-hidden">
                      <img
                        src={imagePreviewUrls[i]}
                        alt={`Foto ${i + 1}`}
                        className="w-full h-24 object-cover"
                      />
                      <button
                        type="button"
                        onClick={() => setImages((prev) => prev.filter((_, idx) => idx !== i))}
                        className="absolute top-1 right-1 bg-background/80 rounded-full p-0.5 hover:bg-destructive hover:text-destructive-foreground"
                        aria-label="Rimuovi"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </div>
                  ))}
                </div>
              ) : null}
              <div>
                <label className="text-xs text-muted-foreground">
                  Note aggiuntive (opzionali)
                </label>
                <Textarea
                  value={textInput}
                  onChange={(e) => setTextInput(e.target.value)}
                  placeholder="Es. Cliente urgente, posa entro fine mese..."
                  rows={2}
                />
              </div>
            </TabsContent>

            <TabsContent value="audio" className="space-y-3 pt-3">
              <p className="text-sm text-muted-foreground">
                Registra fino a {MAX_AUDIO_SECONDS / 60} minuti. Esempio: "Cliente Mario Rossi al 339...
                vuole 2 finestre PVC bianche 1200×1400 e una portafinestra..."
              </p>
              <div className="border rounded-md p-6 text-center space-y-3">
                {audioBlob && !isRecording ? (
                  <>
                    <Badge variant="outline" className="gap-1">
                      <Mic className="h-3 w-3" /> {(audioBlob.size / 1024).toFixed(1)} KB
                    </Badge>
                    {audioPreviewUrl && <audio controls src={audioPreviewUrl} className="w-full" />}
                    <Button
                      variant="ghost"
                      onClick={() => {
                        setAudioBlob(null);
                        setRecordingSeconds(0);
                      }}
                    >
                      Riregistra
                    </Button>
                  </>
                ) : isRecording ? (
                  <>
                    <div className="flex items-center justify-center gap-2 text-destructive">
                      <span className="h-3 w-3 rounded-full bg-destructive animate-pulse" />
                      <span className="font-mono">{formatTime(recordingSeconds)}</span>
                    </div>
                    <Button variant="destructive" size="lg" onClick={stopRecording}>
                      Stop registrazione
                    </Button>
                  </>
                ) : (
                  <Button size="lg" onClick={startRecording}>
                    <Mic className="h-5 w-5 mr-2" /> Inizia registrazione
                  </Button>
	                )}
	              </div>
              <div>
                <label className="text-xs text-muted-foreground">
                  Note aggiuntive o contesto visita (opzionale)
                </label>
                <Textarea
                  value={textInput}
                  onChange={(e) => setTextInput(e.target.value)}
                  placeholder="Es. Cliente vuole consegna rapida, colore bianco opaco, posa al secondo piano..."
                  rows={2}
                />
              </div>
	            </TabsContent>

            <TabsContent value="testo" className="space-y-3 pt-3">
              <p className="text-sm text-muted-foreground">
                Scrivi tutto: dati cliente, prodotti, misure. L'AI estrae tutto in automatico.
              </p>
              <Textarea
                value={textInput}
                onChange={(e) => setTextInput(e.target.value)}
                placeholder={`Esempio:
Cliente: Mario Rossi
Telefono: 339 1234567
Indirizzo: Via Roma 12, Milano
P.IVA: 12345678901

Ordine:
- 2 finestre PVC bianche 1200x1400 a battente
- 1 portafinestra 1500x2200 con maniglia oro
- Posa inclusa
`}
                rows={12}
                className="font-mono text-sm"
              />
            </TabsContent>

            <div>
              <label className="text-xs text-muted-foreground">
                Settore di lavoro (migliora il matching prodotti dal listino)
                {companyVertical?.vertical?.short_label && verticalKey === companyVertical.vertical_key ? (
                  <Badge variant="outline" className="ml-2 text-[10px] py-0">
                    Auto: {companyVertical.vertical.short_label}
                  </Badge>
                ) : null}
              </label>
              <Select value={verticalKey || "__auto__"} onValueChange={(v) => setVerticalKey(v === "__auto__" ? "" : v)}>
                <SelectTrigger className="h-9">
                  <SelectValue placeholder="Auto-rileva" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__auto__">Auto-rileva</SelectItem>
                  {verticalOptions.map((v) => (
                    <SelectItem key={v.vertical_key} value={v.vertical_key}>
                      {v.display_name ?? v.short_label ?? v.vertical_key}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="flex justify-end gap-2 pt-4 border-t">
              <Button variant="ghost" onClick={() => onOpenChange(false)}>
                Annulla
              </Button>
              <Button onClick={submitCapture} disabled={!companyId}>
                <Sparkles className="h-4 w-4 mr-2" />
                Estrai con AI
              </Button>
            </div>
          </Tabs>
        ) : phase === "processing" ? (
          <div className="py-12 text-center space-y-3">
            <Loader2 className="h-10 w-10 animate-spin mx-auto text-primary" />
            <p className="font-medium">{progressMsg}</p>
            <p className="text-xs text-muted-foreground">
              Può richiedere 5-15 secondi a seconda della complessità.
            </p>
          </div>
        ) : phase === "review" && runId ? (
          <CaptureReviewPanel
            runId={runId}
            onCancel={() => setPhase("input")}
            onApplied={(quoteId) => {
              onQuoteCreated?.(quoteId);
              onOpenChange(false);
            }}
          />
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
