import { useState, useRef, useCallback } from "react";
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
  Plus,
  X,
  Loader2,
  CheckCircle2,
  AlertTriangle,
  Package,
  Wrench,
  Truck,
  Trash2,
} from "lucide-react";
import { formatCurrency } from "@/lib/formatters";

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
  const map: Record<string, any> = {
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
  const [activeTab, setActiveTab] = useState<"testo" | "voce">("testo");
  const [descrizione, setDescrizione] = useState("");
  const [misure, setMisure] = useState<Misura[]>([]);
  const [stato, setStato] = useState<"idle" | "generando" | "risultato" | "errore">("idle");
  const [risultato, setRisultato] = useState<SezioneGenerata[] | null>(null);
  const [avvertenze, setAvvertenze] = useState<string[]>([]);
  const [note, setNote] = useState("");
  const [isRecording, setIsRecording] = useState(false);
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const [trascrizione, setTrascrizione] = useState("");

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
    } catch (err) {
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
      setRisultato(data.sezioni ?? []);
      setAvvertenze(data.avvertenze ?? []);
      setNote(data.note ?? "");
      setStato("risultato");
    } catch (err: any) {
      toast.error(err.message || "Errore generazione");
      setStato("errore");
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
            <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as "testo" | "voce")}>
              <TabsList className="w-full">
                <TabsTrigger value="testo" className="flex-1">Testo</TabsTrigger>
                <TabsTrigger value="voce" className="flex-1">Voce</TabsTrigger>
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
                    onRigheGenerate(risultato);
                    setStato("idle");
                    setRisultato(null);
                    setDescrizione("");
                    setIsOpen(false);
                    toast.success(
                      `${risultato.flatMap((s) => s.righe).length} righe aggiunte al preventivo`
                    );
                  }}
                  className="flex-1 bg-violet-600 hover:bg-violet-700 text-white"
                >
                  Inserisci nel preventivo
                </Button>
                <Button
                  variant="outline"
                  onClick={() => {
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
