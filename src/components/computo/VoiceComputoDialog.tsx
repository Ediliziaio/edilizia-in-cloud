/**
 * VoiceComputoDialog — "Descrivi i lavori" (voce o testo) → voci di computo.
 *
 * Colma il gap dei wizard moduli (Ristrutturazione, Bagni, Tetti, …): la tab
 * Voce esisteva solo nel QuoteBuilder marketing, qui invece l'unico ingresso
 * AI era l'import di un file. Pipeline riusata al 100%:
 *   mic (MediaRecorder) → trascrizione-audio (Whisper) → testo editabile
 *   → ai-genera-preventivo-v2 → mapping sezioni→ComputoVoceLocal → review
 *   → onConfirmVoci(voci incluse) — stesso contratto di ComputoUploadModal,
 * quindi i wizard lo consumano senza modifiche al loro handleImportVoci.
 *
 * NB: le voci senza prezzo dal listino escono a €0 (l'AI non inventa prezzi):
 * la review qui dentro permette di correggerle prima dell'import.
 */
import { useEffect, useRef, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Sparkles,
  Mic,
  MicOff,
  Loader2,
  AlertTriangle,
  Info,
  ArrowLeft,
} from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useEffectiveCompanyId } from "@/hooks/useEffectiveCompanyId";
import { formatCurrency } from "@/lib/formatters";
import type { ComputoVoceLocal } from "@/types/computo";

interface RigaGenerata {
  item_category?: string;
  nome?: string;
  descrizione?: string;
  quantita?: number;
  unita_misura?: string;
  unit_price?: number | null;
  tariffa_id?: string | null;
  article_template_id?: string | null;
  family_id?: string | null;
}

interface SezioneGenerata {
  nome: string;
  righe: RigaGenerata[];
}

/** Riga in revisione: la voce mappata + i campi editabili dall'utente. */
interface VoceReview {
  voce: ComputoVoceLocal;
  include: boolean;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Stesso contratto di ComputoUploadModal: riceve le voci INCLUSE riviste. */
  onConfirmVoci: (voci: ComputoVoceLocal[]) => void;
  /** Contesto lavoro del modulo (es. "ristrutturazione") passato all'AI. */
  tipoLavoro?: string;
  confirmLabel?: string;
}

const MAX_RECORDING_SECONDS = 90;

function mapSezioniToVoci(sezioni: SezioneGenerata[], companyId: string): VoceReview[] {
  const out: VoceReview[] = [];
  let ordine = 0;
  for (const sez of sezioni) {
    for (const r of sez.righe) {
      // Note e subtotali non sono voci di computo.
      if (["nota", "subtotale", "sconto"].includes(r.item_category ?? "")) continue;
      const quantita = Number(r.quantita) || 1;
      const prezzo = typeof r.unit_price === "number" ? r.unit_price : 0;
      const descrizione = (r.nome || r.descrizione || "").trim();
      if (!descrizione) continue;
      ordine += 1;
      out.push({
        include: true,
        voce: {
          // Identità sintetica: queste voci non passano da computo_uploads.
          id: typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `voice-${ordine}`,
          computo_upload_id: "",
          company_id: companyId,
          capitolo_numero: null,
          capitolo_nome: sez.nome || "Generale",
          codice_voce: null,
          codice_prezzario: null,
          descrizione_breve: descrizione.slice(0, 100),
          descrizione_estesa: r.descrizione || descrizione,
          unita_misura: r.unita_misura || "cad",
          quantita,
          prezzo_unitario_computo: prezzo,
          importo_computo: Math.round(quantita * prezzo * 100) / 100,
          prezzo_unitario_impresa: null,
          ricarico_percentuale: null,
          sconto_percentuale: 0,
          importo_impresa: null,
          confidence: 0.8,
          warnings: prezzo === 0 ? ["Prezzo non trovato nel listino"] : null,
          ai_notes: null,
          is_included: true,
          is_modified: false,
          ordine,
          created_at: new Date().toISOString(),
          matched_template_id: r.article_template_id ?? null,
          matched_family_id: r.family_id ?? null,
          matched_tariffa_id: r.tariffa_id ?? null,
          matched_name: null,
          match_type: r.article_template_id || r.family_id || r.tariffa_id ? "vector" : "none",
          match_confidence: null,
          _prezzoImpresa: prezzo,
          _ricarico: 0,
          _importoImpresa: Math.round(quantita * prezzo * 100) / 100,
          _isIncluded: true,
        },
      });
    }
  }
  return out;
}

export function VoiceComputoDialog({
  open,
  onOpenChange,
  onConfirmVoci,
  tipoLavoro,
  confirmLabel = "Aggiungi al computo",
}: Props) {
  const companyId = useEffectiveCompanyId();

  const [fase, setFase] = useState<"input" | "review">("input");
  const [descrizione, setDescrizione] = useState("");
  const [generating, setGenerating] = useState(false);
  const [voci, setVoci] = useState<VoceReview[]>([]);

  const [isRecording, setIsRecording] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const recordingTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Stop pulito su unmount/chiusura durante una registrazione.
  useEffect(() => {
    return () => {
      if (recordingTimerRef.current) clearInterval(recordingTimerRef.current);
      const mr = mediaRecorderRef.current;
      if (mr && mr.state !== "inactive") {
        try {
          mr.stream.getTracks().forEach((t) => t.stop());
          mr.stop();
        } catch {
          /* già fermo */
        }
      }
    };
  }, []);

  const reset = () => {
    setFase("input");
    setDescrizione("");
    setVoci([]);
    setGenerating(false);
    setIsRecording(false);
    setIsTranscribing(false);
    setRecordingSeconds(0);
  };

  const stopRecording = () => {
    const mr = mediaRecorderRef.current;
    if (mr && mr.state !== "inactive") mr.stop();
    if (recordingTimerRef.current) clearInterval(recordingTimerRef.current);
    setIsRecording(false);
  };

  const startRecording = async () => {
    if (typeof MediaRecorder === "undefined" || !navigator.mediaDevices?.getUserMedia) {
      toast.error("Microfono non disponibile su questo browser. Scrivi la descrizione.");
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
      // Fallback codec Safari/iOS (stesso ordine di AIQuotePanel).
      const candidates = [
        "audio/webm;codecs=opus",
        "audio/webm",
        "audio/mp4;codecs=mp4a.40.2",
        "audio/mp4",
        "audio/aac",
        "audio/ogg;codecs=opus",
        "audio/ogg",
      ];
      let mimeType = "";
      for (const c of candidates) {
        try {
          if (MediaRecorder.isTypeSupported(c)) {
            mimeType = c;
            break;
          }
        } catch {
          /* prova il prossimo */
        }
      }
      let mr: MediaRecorder;
      try {
        mr = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
      } catch {
        mr = new MediaRecorder(stream);
      }
      chunksRef.current = [];
      mr.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };
      mr.onerror = () => {
        stream.getTracks().forEach((t) => t.stop());
        setIsRecording(false);
        if (recordingTimerRef.current) clearInterval(recordingTimerRef.current);
        toast.error("Errore registrazione. Scrivi la descrizione.");
      };
      mr.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        const effectiveMime = mr.mimeType || mimeType || "audio/webm";
        const ext = effectiveMime.includes("mp4") || effectiveMime.includes("aac")
          ? "m4a"
          : effectiveMime.includes("ogg")
            ? "ogg"
            : "webm";
        const blob = new Blob(chunksRef.current, { type: effectiveMime });
        if (blob.size === 0) {
          toast.warning("Nessun audio registrato — controlla il microfono.");
          return;
        }
        setIsTranscribing(true);
        try {
          const fd = new FormData();
          fd.append("audio", blob, `audio.${ext}`);
          fd.append("language", "it");
          const { data, error } = await supabase.functions.invoke("trascrizione-audio", { body: fd });
          if (error || !data?.testo) {
            toast.error("Trascrizione fallita. Riprova o scrivi la descrizione.");
            return;
          }
          // Append (non replace): l'utente può dettare a più riprese.
          setDescrizione((prev) => (prev.trim() ? `${prev.trim()}\n${data.testo}` : data.testo));
          toast.success("Audio trascritto");
        } finally {
          setIsTranscribing(false);
        }
      };
      mr.start(100);
      mediaRecorderRef.current = mr;
      setIsRecording(true);
      setRecordingSeconds(0);
      recordingTimerRef.current = setInterval(() => {
        setRecordingSeconds((s) => {
          if (s >= MAX_RECORDING_SECONDS) {
            stopRecording();
            return s;
          }
          return s + 1;
        });
      }, 1000);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes("NotAllowed") || msg.includes("Permission")) {
        toast.error("Permesso microfono negato. Scrivi la descrizione.");
      } else {
        toast.error("Microfono non disponibile. Scrivi la descrizione.");
      }
    }
  };

  const genera = async () => {
    if (!companyId) {
      toast.error("Azienda non caricata, riprova");
      return;
    }
    if (descrizione.trim().length < 10) {
      toast.error("Descrivi i lavori con qualche dettaglio in più");
      return;
    }
    setGenerating(true);
    try {
      const { data, error } = await supabase.functions.invoke("ai-genera-preventivo-v2", {
        body: {
          company_id: companyId,
          descrizione: descrizione.trim(),
          tipo_lavoro: tipoLavoro,
          input_mode: "voce",
        },
      });
      if (error) throw new Error(error.message);
      const sezioni: SezioneGenerata[] = data?.sezioni ?? [];
      const mapped = mapSezioniToVoci(sezioni, companyId);
      if (mapped.length === 0) {
        toast.error("Nessuna voce generata: prova ad aggiungere dettagli (lavorazioni, quantità, misure).");
        return;
      }
      setVoci(mapped);
      setFase("review");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Generazione non riuscita, riprova");
    } finally {
      setGenerating(false);
    }
  };

  const updateVoce = (idx: number, patch: Partial<Pick<ComputoVoceLocal, "quantita" | "prezzo_unitario_computo">>) => {
    setVoci((prev) =>
      prev.map((v, i) => {
        if (i !== idx) return v;
        const voce = { ...v.voce, ...patch };
        voce.importo_computo = Math.round(voce.quantita * voce.prezzo_unitario_computo * 100) / 100;
        voce._importoImpresa = voce.importo_computo;
        voce._prezzoImpresa = voce.prezzo_unitario_computo;
        return { ...v, voce };
      })
    );
  };

  const incluse = voci.filter((v) => v.include);
  const senzaPrezzo = incluse.filter((v) => v.voce.prezzo_unitario_computo === 0).length;
  const totale = incluse.reduce((s, v) => s + v.voce.importo_computo, 0);

  const conferma = () => {
    if (incluse.length === 0) {
      toast.error("Seleziona almeno una voce");
      return;
    }
    onConfirmVoci(incluse.map((v) => ({ ...v.voce, _isIncluded: true })));
    onOpenChange(false);
    reset();
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o && isRecording) stopRecording();
        onOpenChange(o);
        if (!o) reset();
      }}
    >
      <DialogContent className="sm:max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-primary" />
            Descrivi i lavori — l'AI compone il computo
          </DialogTitle>
          <DialogDescription>
            Detta a voce o scrivi cosa c'è da fare: l'AI propone le voci, tu le
            rivedi e le aggiungi al computo.
          </DialogDescription>
        </DialogHeader>

        {fase === "input" && (
          <div className="space-y-3">
            <Textarea
              value={descrizione}
              onChange={(e) => setDescrizione(e.target.value)}
              placeholder={
                'Es. "Rifacimento bagno 6 mq: demolizione pavimento e rivestimenti, nuovo massetto, posa gres 60x60, sostituzione sanitari e rubinetteria, tinteggiatura."'
              }
              rows={6}
              disabled={isRecording || isTranscribing}
            />
            <div className="flex items-center gap-2 flex-wrap">
              <Button
                type="button"
                variant={isRecording ? "destructive" : "outline"}
                size="sm"
                onClick={isRecording ? stopRecording : startRecording}
                disabled={isTranscribing || generating}
              >
                {isRecording ? (
                  <>
                    <MicOff className="h-4 w-4 mr-1.5" /> Ferma ({MAX_RECORDING_SECONDS - recordingSeconds}s)
                  </>
                ) : isTranscribing ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> Trascrizione…
                  </>
                ) : (
                  <>
                    <Mic className="h-4 w-4 mr-1.5" /> Detta a voce
                  </>
                )}
              </Button>
              {isRecording && (
                <span className="text-xs text-muted-foreground animate-pulse">
                  ● Registrazione in corso — parla normalmente
                </span>
              )}
            </div>
          </div>
        )}

        {fase === "review" && (
          <div className="space-y-3">
            {senzaPrezzo > 0 && (
              <div className="flex gap-2 p-2.5 bg-sky-50 border border-sky-200 rounded text-xs text-sky-900">
                <Info className="h-4 w-4 mt-0.5 shrink-0" />
                <p>
                  {senzaPrezzo === 1 ? "1 voce è" : `${senzaPrezzo} voci sono`} a €0
                  perché il listino non ha una tariffa corrispondente: inserisci
                  il prezzo qui sotto prima di importare.
                </p>
              </div>
            )}
            <div className="space-y-2 max-h-[45vh] overflow-y-auto pr-1">
              {voci.map((v, i) => (
                <div
                  key={v.voce.id}
                  className={`flex items-start gap-2.5 p-2.5 border rounded-lg text-sm ${
                    v.include ? "bg-background" : "bg-muted/40 opacity-60"
                  }`}
                >
                  <Checkbox
                    checked={v.include}
                    onCheckedChange={(c) =>
                      setVoci((prev) => prev.map((x, xi) => (xi === i ? { ...x, include: c === true } : x)))
                    }
                    className="mt-0.5"
                  />
                  <div className="flex-1 min-w-0 space-y-1">
                    <p className="font-medium leading-snug">{v.voce.descrizione_breve}</p>
                    <p className="text-[11px] text-muted-foreground">
                      {v.voce.capitolo_nome}
                      {v.voce.prezzo_unitario_computo === 0 && (
                        <span className="ml-1.5 inline-flex items-center gap-0.5 text-amber-600">
                          <AlertTriangle className="h-3 w-3" /> prezzo mancante
                        </span>
                      )}
                    </p>
                    <div className="flex items-center gap-2 flex-wrap">
                      <label className="flex items-center gap-1 text-[11px] text-muted-foreground">
                        Q.tà
                        <Input
                          type="number"
                          min={0}
                          step="0.01"
                          className="h-7 w-20 text-xs text-right"
                          value={v.voce.quantita}
                          onChange={(e) => updateVoce(i, { quantita: parseFloat(e.target.value) || 0 })}
                        />
                        {v.voce.unita_misura}
                      </label>
                      <label className="flex items-center gap-1 text-[11px] text-muted-foreground">
                        Prezzo €
                        <Input
                          type="number"
                          min={0}
                          step="0.01"
                          className="h-7 w-24 text-xs text-right"
                          value={v.voce.prezzo_unitario_computo}
                          onChange={(e) =>
                            updateVoce(i, { prezzo_unitario_computo: parseFloat(e.target.value) || 0 })
                          }
                        />
                      </label>
                      <span className="ml-auto text-xs font-medium tabular-nums">
                        {formatCurrency(v.voce.importo_computo)}
                      </span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
            <div className="flex justify-between items-center text-sm border-t pt-2">
              <span className="text-muted-foreground">
                {incluse.length} {incluse.length === 1 ? "voce selezionata" : "voci selezionate"}
              </span>
              <span className="font-semibold tabular-nums">{formatCurrency(totale)}</span>
            </div>
          </div>
        )}

        <DialogFooter className="gap-2">
          {fase === "review" && (
            <Button type="button" variant="ghost" onClick={() => setFase("input")} disabled={generating}>
              <ArrowLeft className="h-4 w-4 mr-1" /> Modifica descrizione
            </Button>
          )}
          {fase === "input" ? (
            <Button type="button" onClick={genera} disabled={generating || isRecording || isTranscribing}>
              {generating ? (
                <>
                  <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> Generazione…
                </>
              ) : (
                <>
                  <Sparkles className="h-4 w-4 mr-1.5" /> Genera voci
                </>
              )}
            </Button>
          ) : (
            <Button type="button" onClick={conferma} disabled={incluse.length === 0}>
              {confirmLabel} ({incluse.length})
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
