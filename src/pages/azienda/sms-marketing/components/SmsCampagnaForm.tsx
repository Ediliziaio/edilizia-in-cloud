/**
 * Form multi-step per la creazione di una campagna SMS.
 * Step 1: Nome + Mittente
 * Step 2: Messaggio
 * Step 3: Destinatari (tag + contatore live)
 * Step 4: Pianificazione + Conferma con stima costo
 */
import { useState, useEffect, useCallback } from "react";
import { ChevronRight, ChevronLeft, Loader2, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { SmsMittenteInput } from "./SmsMittenteInput";
import { SmsMessaggioEditor } from "./SmsMessaggioEditor";
import { useSmsCampagne } from "@/hooks/useSmsCampagne";
import type { SmsCampagnaFormData, SmsCampagnaTipo } from "@/types/sms-marketing";

const COSTO_PER_SMS_EUR = 0.05; // stima Brevo ~0.05€/SMS

const TOTAL_STEPS = 4;

interface SmsCampagnaFormProps {
  onSuccess: () => void;
  onCancel: () => void;
}

interface FormErrors {
  nome?: string;
  mittente?: string;
  messaggio?: string;
}

const defaultForm: SmsCampagnaFormData = {
  nome: "",
  messaggio: "",
  mittente: "",
  tipo: "immediata",
  programmata_per: null,
  filtro_tags: [],
};

export function SmsCampagnaForm({ onSuccess, onCancel }: SmsCampagnaFormProps) {
  const { create, avvia, countDestinatari, isCreating, isAvviando } = useSmsCampagne();
  const [step, setStep] = useState(1);
  const [form, setForm] = useState<SmsCampagnaFormData>(defaultForm);
  const [errors, setErrors] = useState<FormErrors>({});
  const [tagsInput, setTagsInput] = useState("");
  const [nDestinatari, setNDestinatari] = useState<number | null>(null);
  const [showConfirm, setShowConfirm] = useState(false);
  const isSaving = isCreating || isAvviando;

  const set = <K extends keyof SmsCampagnaFormData>(key: K, val: SmsCampagnaFormData[K]) =>
    setForm((f) => ({ ...f, [key]: val }));

  // Aggiorna contatore destinatari in step 3
  useEffect(() => {
    if (step !== 3) return;
    const tags = tagsInput.split(",").map((t) => t.trim()).filter(Boolean);
    let cancelled = false;
    countDestinatari(tags).then((n) => { if (!cancelled) setNDestinatari(n); });
    return () => { cancelled = true; };
  }, [step, tagsInput, countDestinatari]);

  const validateStep = useCallback((): boolean => {
    const newErrors: FormErrors = {};
    if (step === 1) {
      if (!form.nome.trim()) newErrors.nome = "Il nome della campagna è obbligatorio";
      if (!form.mittente.trim()) newErrors.mittente = "Il mittente è obbligatorio";
      else if (!/^[A-Za-z0-9]{1,11}$/.test(form.mittente)) newErrors.mittente = "Solo lettere e numeri, max 11 caratteri";
    }
    if (step === 2) {
      if (!form.messaggio.trim()) newErrors.messaggio = "Il messaggio è obbligatorio";
    }
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  }, [step, form]);

  const handleNext = () => {
    if (!validateStep()) return;
    if (step < TOTAL_STEPS) setStep((s) => s + 1);
    else setShowConfirm(true);
  };

  const handleConfirmAvvia = async () => {
    setShowConfirm(false);
    const tags = tagsInput.split(",").map((t) => t.trim()).filter(Boolean);
    const data = { ...form, filtro_tags: tags };
    const campagna = await create(data);
    if (campagna) await avvia(campagna.id);
    onSuccess();
  };

  const stimaCosto = (nDestinatari ?? 0) * COSTO_PER_SMS_EUR;

  return (
    <div className="space-y-6">
      {/* Indicatore step */}
      <div className="flex items-center gap-1">
        {Array.from({ length: TOTAL_STEPS }).map((_, i) => (
          <div
            key={i}
            className={`h-1.5 flex-1 rounded-full transition-colors ${
              i + 1 <= step ? "bg-primary" : "bg-muted"
            }`}
          />
        ))}
      </div>
      <p className="text-xs text-muted-foreground">Passo {step} di {TOTAL_STEPS}</p>

      {/* Step 1: Nome + Mittente */}
      {step === 1 && (
        <div className="space-y-4">
          <h3 className="font-semibold">Dettagli campagna</h3>
          <div className="space-y-1">
            <Label htmlFor="nome-campagna" className="text-sm font-medium">Nome campagna *</Label>
            <Input
              id="nome-campagna"
              value={form.nome}
              onChange={(e) => set("nome", e.target.value)}
              placeholder="Es: Promozione estate 2025"
              className={errors.nome ? "border-destructive" : ""}
            />
            {errors.nome && <p className="text-xs text-destructive">{errors.nome}</p>}
          </div>
          <SmsMittenteInput value={form.mittente} onChange={(v) => set("mittente", v)} error={errors.mittente} />
        </div>
      )}

      {/* Step 2: Messaggio */}
      {step === 2 && (
        <div className="space-y-4">
          <h3 className="font-semibold">Messaggio SMS</h3>
          <SmsMessaggioEditor value={form.messaggio} onChange={(v) => set("messaggio", v)} error={errors.messaggio} />
        </div>
      )}

      {/* Step 3: Destinatari */}
      {step === 3 && (
        <div className="space-y-4">
          <h3 className="font-semibold">Destinatari</h3>
          <div className="space-y-1">
            <Label className="text-sm font-medium">Filtra per tag (vuoto = tutti)</Label>
            <Input
              value={tagsInput}
              onChange={(e) => setTagsInput(e.target.value)}
              placeholder="clienti, vip, cantiere-roma"
            />
            <p className="text-xs text-muted-foreground">Separati da virgola. Lascia vuoto per inviare a tutti i contatti con consenso.</p>
          </div>
          <div className="flex items-center gap-2 p-3 rounded-lg bg-muted/30">
            <span className="text-sm text-muted-foreground">Destinatari stimati:</span>
            <Badge variant="secondary" className="text-sm font-bold">
              {nDestinatari === null ? "..." : nDestinatari.toLocaleString("it-IT")}
            </Badge>
          </div>
        </div>
      )}

      {/* Step 4: Pianificazione */}
      {step === 4 && (
        <div className="space-y-4">
          <h3 className="font-semibold">Pianificazione</h3>
          <div className="flex gap-2">
            {(["immediata", "pianificata"] as SmsCampagnaTipo[]).map((t) => (
              <Button
                key={t}
                type="button"
                variant={form.tipo === t ? "default" : "outline"}
                size="sm"
                onClick={() => set("tipo", t)}
              >
                {t === "immediata" ? "Invia subito" : "Pianifica"}
              </Button>
            ))}
          </div>
          {form.tipo === "pianificata" && (
            <div className="space-y-1">
              <Label className="text-sm">Data e ora di invio</Label>
              <Input
                type="datetime-local"
                value={form.programmata_per?.slice(0, 16) ?? ""}
                onChange={(e) => set("programmata_per", e.target.value ? new Date(e.target.value).toISOString() : null)}
              />
            </div>
          )}
          {/* Riepilogo */}
          <div className="rounded-lg border p-4 space-y-2 bg-muted/10">
            <p className="text-sm font-medium">Riepilogo campagna</p>
            <div className="text-xs text-muted-foreground space-y-1">
              <div className="flex justify-between"><span>Nome:</span><span className="font-medium text-foreground">{form.nome}</span></div>
              <div className="flex justify-between"><span>Mittente:</span><span className="font-medium text-foreground">{form.mittente}</span></div>
              <div className="flex justify-between"><span>Destinatari:</span><span className="font-medium text-foreground">{(nDestinatari ?? 0).toLocaleString("it-IT")}</span></div>
              <div className="flex justify-between"><span>Stima costo:</span><span className="font-medium text-foreground">~{new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR" }).format(stimaCosto)}</span></div>
            </div>
          </div>
        </div>
      )}

      {/* Navigazione */}
      <div className="flex justify-between pt-2">
        <Button type="button" variant="outline" onClick={step === 1 ? onCancel : () => setStep((s) => s - 1)} disabled={isSaving}>
          {step === 1 ? "Annulla" : <><ChevronLeft className="h-4 w-4 mr-1" />Indietro</>}
        </Button>
        <Button type="button" onClick={handleNext} disabled={isSaving}>
          {isSaving && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
          {step < TOTAL_STEPS ? <><span>Avanti</span><ChevronRight className="h-4 w-4 ml-1" /></> : <><Send className="h-4 w-4 mr-1" />Avvia campagna</>}
        </Button>
      </div>

      {/* Conferma modale */}
      <AlertDialog open={showConfirm} onOpenChange={setShowConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Avviare la campagna SMS?</AlertDialogTitle>
            <AlertDialogDescription>
              Verranno inviati SMS a{" "}
              <strong>{(nDestinatari ?? 0).toLocaleString("it-IT")}</strong> contatti.<br />
              Costo stimato: <strong>~{new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR" }).format(stimaCosto)}</strong>.<br />
              L'azione non può essere interrotta una volta avviata.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annulla</AlertDialogCancel>
            <AlertDialogAction onClick={handleConfirmAvvia}>
              <Send className="h-4 w-4 mr-2" />
              Conferma e invia
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
