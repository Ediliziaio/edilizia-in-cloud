import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AlertCircle, CheckCircle2, ImagePlus, Loader2, Mic, Sparkles, X } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { SrProgettoDetail } from "@/types/serramenti";
import {
  fileToDraftImage,
  generateSerramentiAiDraft,
  type SrAiDraftImageInput,
  type SrAiDraftItem,
  type SrAiDraftResult,
} from "@/lib/serramenti/aiDraft";
import { formatEuro } from "@/lib/serramenti/format";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  progettoId: string;
  detail: SrProgettoDetail;
  onApproveItem: (item: SrAiDraftItem) => Promise<void>;
  approving: boolean;
}

const MAX_IMAGES = 6;
const MAX_IMAGE_SIZE_BYTES = 8 * 1024 * 1024;

type SpeechRecognitionCtor = new () => {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  onresult: ((event: { results: ArrayLike<{ 0: { transcript: string } }> }) => void) | null;
  onerror: ((event: { error?: string }) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
};

function getSpeechRecognition(): SpeechRecognitionCtor | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as {
    SpeechRecognition?: SpeechRecognitionCtor;
    webkitSpeechRecognition?: SpeechRecognitionCtor;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

export function AiSerramentiDraftDialog({
  open,
  onOpenChange,
  progettoId,
  detail,
  onApproveItem,
  approving,
}: Props) {
  const [prompt, setPrompt] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [loading, setLoading] = useState(false);
  const [listening, setListening] = useState(false);
  const [result, setResult] = useState<SrAiDraftResult | null>(null);
  const [approvedIds, setApprovedIds] = useState<Set<string>>(new Set());
  const recognitionRef = useRef<InstanceType<SpeechRecognitionCtor> | null>(null);

  const hasInput = prompt.trim().length >= 8 || files.length > 0;
  const validItems = useMemo(
    () => (result?.items ?? []).filter((item) => item.missing_fields.length === 0),
    [result],
  );

  const handleFiles = (selected: FileList | null) => {
    if (!selected) return;
    const imageFiles = Array.from(selected).filter((file) => file.type.startsWith("image/"));
    if (imageFiles.length !== selected.length) {
      toast.warning("Ho ignorato i file non immagine");
    }
    const accepted = imageFiles.filter((file) => file.size <= MAX_IMAGE_SIZE_BYTES);
    if (accepted.length !== imageFiles.length) {
      toast.warning("Ho ignorato le immagini sopra 8 MB", {
        description: "Comprimi la foto o carica uno screenshot piu' leggero.",
      });
    }
    setFiles((prev) => [...prev, ...accepted].slice(0, MAX_IMAGES));
  };

  const runDraft = async () => {
    if (!hasInput) {
      toast.warning("Inserisci una richiesta o almeno una foto del rilievo");
      return;
    }
    if (listening) stopDictation();
    setLoading(true);
    setResult(null);
    setApprovedIds(new Set());
    try {
      const images: SrAiDraftImageInput[] = await Promise.all(files.map(fileToDraftImage));
      const draft = await generateSerramentiAiDraft({
        progettoId,
        prompt,
        images,
        source: images.length > 0 && prompt.trim() ? "mixed" : images.length > 0 ? "foto" : "testo",
      });
      setResult(draft);
      if (draft.items.length === 0) {
        toast.warning("L'AI non ha riconosciuto righe utilizzabili", {
          description: "Aggiungi dettagli o correggi manualmente.",
        });
      } else {
        toast.success(`Bozza pronta: ${draft.items.length} ${draft.items.length === 1 ? "riga" : "righe"} da verificare`);
      }
    } catch (error) {
      toast.error("Bozza AI non disponibile", {
        description: error instanceof Error ? error.message : String(error),
      });
    } finally {
      setLoading(false);
    }
  };

  const startDictation = () => {
    const SpeechRecognition = getSpeechRecognition();
    if (!SpeechRecognition) {
      toast.warning("Dettatura non supportata da questo browser", {
        description: "Puoi usare la dettatura del sistema operativo o scrivere nel campo testo.",
      });
      return;
    }
    try {
      const recognition = new SpeechRecognition();
      recognition.lang = "it-IT";
      recognition.interimResults = false;
      recognition.continuous = false;
      recognition.onresult = (event) => {
        const text = Array.from(event.results)
          .map((res) => res[0]?.transcript ?? "")
          .join(" ")
          .trim();
        if (text) {
          setPrompt((prev) => `${prev}${prev.trim() ? "\n" : ""}${text}`);
        }
      };
      recognition.onerror = () => {
        toast.error("Non riesco ad ascoltare l'audio");
        setListening(false);
      };
      recognition.onend = () => setListening(false);
      recognitionRef.current = recognition;
      setListening(true);
      recognition.start();
    } catch {
      setListening(false);
      toast.error("Dettatura non avviata");
    }
  };

  const stopDictation = useCallback(() => {
    recognitionRef.current?.stop();
    recognitionRef.current = null;
    setListening(false);
  }, []);

  const approveItem = async (item: SrAiDraftItem) => {
    if (item.missing_fields.length > 0) {
      toast.warning("Completa i campi mancanti prima di approvare questa riga");
      return false;
    }
    try {
      await onApproveItem(item);
      setApprovedIds((prev) => new Set(prev).add(item.id));
      toast.success("Riga inserita nel preventivo");
      return true;
    } catch (error) {
      toast.error("Non sono riuscito a inserire la riga", {
        description: error instanceof Error ? error.message : "Riprova tra qualche secondo.",
      });
      return false;
    }
  };

  const approveAll = async () => {
    for (const item of validItems) {
      if (!approvedIds.has(item.id)) {
        const inserted = await approveItem(item);
        if (!inserted) break;
      }
    }
  };

  useEffect(() => {
    if (!open && listening) stopDictation();
  }, [open, listening, stopDictation]);

  useEffect(() => () => {
    recognitionRef.current?.stop();
    recognitionRef.current = null;
  }, []);

  const handleOpenChange = (nextOpen: boolean) => {
    if (!nextOpen && listening) stopDictation();
    onOpenChange(nextOpen);
  };

  const cliente = [
    detail.progetto.cliente_nome,
    detail.progetto.cliente_cognome,
  ].filter(Boolean).join(" ");

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-4xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-orange-500" />
            Crea bozza serramenti con AI
          </DialogTitle>
          <DialogDescription>
            L'AI prepara righe da controllare. Nulla viene salvato nel preventivo finché non approvi.
            {cliente ? ` Cliente: ${cliente}.` : ""}
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
          <div className="space-y-3">
            <div className="space-y-2">
              <Label>Richiesta testo o audio</Label>
              <Textarea
                value={prompt}
                onChange={(event) => setPrompt(event.target.value)}
                rows={7}
                placeholder="Esempio: prepara offerta per 3 finestre PVC bianco 1200x1400, 1 porta finestra 900x2200, doppio vetro, posa inclusa, zanzariere su tutte..."
              />
              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  variant={listening ? "destructive" : "outline"}
                  size="sm"
                  onClick={listening ? stopDictation : startDictation}
                >
                  <Mic className="mr-1.5 h-4 w-4" />
                  {listening ? "Ferma dettatura" : "Detta richiesta"}
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    if (listening) stopDictation();
                    setPrompt("");
                    setFiles([]);
                    setResult(null);
                    setApprovedIds(new Set());
                  }}
                >
                  Pulisci
                </Button>
              </div>
            </div>

            <div className="rounded-md border border-dashed border-orange-200 bg-orange-50/30 p-3">
              <Label className="mb-2 flex items-center gap-2">
                <ImagePlus className="h-4 w-4 text-orange-500" />
                Foto rilievo, appunti o vecchi infissi
              </Label>
              <input
                type="file"
                accept="image/*"
                multiple
                onChange={(event) => handleFiles(event.target.files)}
                className="text-sm"
              />
              {files.length > 0 && (
                <div className="mt-3 flex flex-wrap gap-2">
                  {files.map((file, index) => (
                    <Badge key={`${file.name}-${index}`} variant="secondary" className="gap-1">
                      {file.name}
                      <button
                        type="button"
                        aria-label={`Rimuovi ${file.name}`}
                        onClick={() => setFiles((prev) => prev.filter((_, i) => i !== index))}
                        className="ml-1 rounded-full hover:bg-slate-200"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </Badge>
                  ))}
                </div>
              )}
              <p className="mt-2 text-xs text-slate-500">
                Le foto aiutano a riconoscere tipologia e appunti. Le misure vengono usate solo se sono scritte o chiaramente leggibili.
              </p>
            </div>
          </div>

          <div className="rounded-md border bg-slate-50 p-3 text-sm">
            <p className="font-semibold text-slate-900">Regole di sicurezza</p>
            <ul className="mt-2 space-y-2 text-xs text-slate-600">
              <li>Non inventa misure: se mancano, le segnala.</li>
              <li>Non salva righe senza approvazione.</li>
              <li>Il prezzo viene proposto solo se trova un listino compatibile.</li>
              <li>Le righe con campi mancanti restano bloccate finché non sono complete.</li>
            </ul>
            {result?.model_used && (
              <p className="mt-4 text-[11px] text-slate-500">
                Modello usato: {result.model_used}
              </p>
            )}
          </div>
        </div>

        {result && (
          <div className="space-y-3 border-t pt-4">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-sm font-semibold">Bozza da verificare</p>
                {result.summary && <p className="text-xs text-slate-500">{result.summary}</p>}
              </div>
              {validItems.length > 1 && (
                <Button size="sm" onClick={approveAll} disabled={approving || validItems.every((i) => approvedIds.has(i.id))}>
                  Approva tutte le righe complete
                </Button>
              )}
            </div>

            {(result.warnings.length > 0 || result.questions.length > 0) && (
              <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
                <p className="font-semibold">Da verificare</p>
                <ul className="mt-1 list-disc space-y-1 pl-4 text-xs">
                  {[...result.warnings, ...result.questions].map((warning, index) => (
                    <li key={`${warning}-${index}`}>{warning}</li>
                  ))}
                </ul>
              </div>
            )}

            <div className="grid gap-3 md:grid-cols-2">
              {result.items.map((item) => {
                const isApproved = approvedIds.has(item.id);
                const isComplete = item.missing_fields.length === 0;
                const confidenceTone =
                  item.confidence >= 0.82 ? "text-emerald-700 bg-emerald-50 border-emerald-200" :
                  item.confidence >= 0.55 ? "text-amber-700 bg-amber-50 border-amber-200" :
                  "text-rose-700 bg-rose-50 border-rose-200";

                return (
                  <Card key={item.id} className={isComplete ? "border-emerald-100" : "border-amber-200"}>
                    <CardContent className="space-y-3 p-3">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="font-semibold text-slate-950">{item.tipologia_label}</p>
                          <p className="text-xs text-slate-500">
                            {[item.ambiente, item.materiale, item.serie].filter(Boolean).join(" · ") || "Dettagli da confermare"}
                          </p>
                        </div>
                        <Badge variant="outline" className={confidenceTone}>
                          {Math.round(item.confidence * 100)}%
                        </Badge>
                      </div>

                      <div className="grid grid-cols-2 gap-2 text-xs">
                        <Info label="Quantità" value={`x${item.quantita}`} />
                        <Info
                          label="Misure"
                          value={item.larghezza_mm && item.altezza_mm ? `${item.larghezza_mm} x ${item.altezza_mm} mm` : "mancanti"}
                        />
                        <Info label="Listino" value={item.family_nome ?? "da confermare"} />
                        <Info
                          label="Prezzo"
                          value={item.prezzo_totale != null ? formatEuro(item.prezzo_totale) : "da calcolare"}
                        />
                      </div>

                      {(item.missing_fields.length > 0 || item.warnings.length > 0) && (
                        <div className="rounded-md bg-amber-50 p-2 text-xs text-amber-900">
                          <p className="font-semibold">Controllo richiesto</p>
                          <ul className="mt-1 list-disc pl-4">
                            {[...item.missing_fields.map((f) => `Campo mancante: ${f}`), ...item.warnings].map((msg, index) => (
                              <li key={`${item.id}-${index}`}>{msg}</li>
                            ))}
                          </ul>
                        </div>
                      )}

                      <Button
                        className="w-full"
                        variant={isApproved ? "outline" : "default"}
                        disabled={!isComplete || isApproved || approving}
                        onClick={() => void approveItem(item)}
                      >
                        {approving ? (
                          <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
                        ) : isApproved ? (
                          <CheckCircle2 className="mr-1.5 h-4 w-4" />
                        ) : !isComplete ? (
                          <AlertCircle className="mr-1.5 h-4 w-4" />
                        ) : null}
                        {isApproved ? "Inserita nel preventivo" : isComplete ? "Approva e inserisci" : "Completa prima di inserire"}
                      </Button>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          </div>
        )}

        <DialogFooter className="gap-2">
          <Button type="button" variant="outline" onClick={() => handleOpenChange(false)}>
            Chiudi
          </Button>
          <Button type="button" onClick={() => void runDraft()} disabled={!hasInput || loading}>
            {loading ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Sparkles className="mr-1.5 h-4 w-4" />}
            Analizza e prepara bozza
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md bg-slate-50 px-2 py-1.5">
      <p className="text-[10px] uppercase tracking-wide text-slate-500">{label}</p>
      <p className="truncate font-medium text-slate-900">{value}</p>
    </div>
  );
}
