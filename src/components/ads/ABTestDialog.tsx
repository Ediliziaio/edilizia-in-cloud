/**
 * ABTestDialog — duplica una bozza cambiando 1 variabile per A/B test.
 *
 * Pattern Madgicx-style: l'utente sceglie quale variabile testare
 * (creatività / copy / pubblico / budget / ottimizzazione), la app
 * crea una copia "variant B" con quella variabile alterata.
 */
import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Loader2, FlaskConical } from "lucide-react";
import { toast } from "sonner";
import { useT } from "@/lib/campo/lingua/LinguaCampo";

export type ABTestVariable =
  | "creative"
  | "copy"
  | "audience"
  | "budget"
  | "optimization_event";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  originalName: string;
  originalDailyBudget: number;
  isCreating?: boolean;
  onConfirm: (input: {
    variable: ABTestVariable;
    variant_name: string;
    description: string;
    new_value?: string | number;
  }) => Promise<void> | void;
}

const VARIABLES: { value: ABTestVariable; label: string; hint: string; field?: "text" | "number" }[] = [
  {
    value: "creative",
    label: "Creatività",
    hint: "Stessa offerta + pubblico, immagini diverse",
  },
  {
    value: "copy",
    label: "Copy",
    hint: "Stessa creatività + pubblico, testi diversi",
  },
  {
    value: "audience",
    label: "Pubblico",
    hint: "Stessa creatività + copy, pubblico diverso",
  },
  {
    value: "budget",
    label: "Budget",
    hint: "Stessa struttura, budget alternativo per test scaling",
    field: "number",
  },
  {
    value: "optimization_event",
    label: "Evento ottimizzazione",
    hint: "Stesso target, ma ottimizza per lead vs qualified_lead",
  },
];

export function ABTestDialog({
  open,
  onOpenChange,
  originalName,
  originalDailyBudget,
  isCreating = false,
  onConfirm,
}: Props) {
  const t = useT();
  const [variable, setVariable] = useState<ABTestVariable>("creative");
  const [variantName, setVariantName] = useState(`${originalName} — Variant B`);
  const [description, setDescription] = useState("");
  const [budgetValue, setBudgetValue] = useState(originalDailyBudget * 1.5);
  const [optimizationValue, setOptimizationValue] = useState<string>("qualified_lead");

  const currentVar = VARIABLES.find((v) => v.value === variable);

  const submit = async () => {
    if (!variantName.trim()) {
      toast.error(t("Nome variante obbligatorio"));
      return;
    }
    if (!description.trim() || description.length < 10) {
      toast.error(t("Descrivi la modifica"), {
        description: t("Almeno 10 caratteri: cosa cambia e perché"),
      });
      return;
    }
    const newValue =
      variable === "budget" ? budgetValue : variable === "optimization_event" ? optimizationValue : undefined;
    await onConfirm({ variable, variant_name: variantName, description, new_value: newValue });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FlaskConical className="h-5 w-5 text-violet-600" />
            {t("Crea variante A/B test")}
          </DialogTitle>
          <DialogDescription>{t("Duplica \"{originalName}\" cambiando UNA SOLA variabile. Così potrai capire chiaramente cosa funziona meglio.", { originalName: String(originalName ?? "") })}</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div>
            <Label className="mb-2 block">{t("Quale variabile vuoi testare?")}</Label>
            <RadioGroup value={variable} onValueChange={(v) => setVariable(v as ABTestVariable)}>
              <div className="grid gap-2">
                {VARIABLES.map((v) => (
                  <label
                    key={v.value}
                    className={`flex cursor-pointer items-start gap-2 rounded-lg border p-3 ${
                      variable === v.value ? "border-violet-300 bg-violet-50" : "border-slate-200"
                    }`}
                  >
                    <RadioGroupItem value={v.value} className="mt-0.5" />
                    <div className="flex-1">
                      <p className="text-sm font-semibold text-slate-950">{t(v.label)}</p>
                      <p className="text-xs text-slate-500">{t(v.hint)}</p>
                    </div>
                  </label>
                ))}
              </div>
            </RadioGroup>
          </div>

          {variable === "budget" && (
            <div>
              <Label className="mb-1 block">{t("Nuovo budget giornaliero (€)")}</Label>
              <Input
                type="number"
                min={5}
                value={budgetValue}
                onChange={(e) => setBudgetValue(Number(e.target.value || 0))}
              />
              <p className="mt-1 text-xs text-slate-500">{t("Originale: {originalDailyBudget}€/g · Suggerito test: +50% per scaling", { originalDailyBudget: String(originalDailyBudget ?? "") })}</p>
            </div>
          )}

          {variable === "optimization_event" && (
            <div>
              <Label className="mb-1 block">{t("Evento ottimizzazione alternativo")}</Label>
              <Select value={optimizationValue} onValueChange={setOptimizationValue}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="lead">{t("Lead (volume)")}</SelectItem>
                  <SelectItem value="qualified_lead">{t("Lead qualificato")}</SelectItem>
                  <SelectItem value="landing_page_view">{t("Visita landing")}</SelectItem>
                  <SelectItem value="message">{t("Messaggio")}</SelectItem>
                </SelectContent>
              </Select>
            </div>
          )}

          <div>
            <Label className="mb-1 block">{t("Nome variante")}</Label>
            <Input
              value={variantName}
              onChange={(e) => setVariantName(e.target.value)}
              placeholder={t("Es. Bagni — Variant B con copy urgenza")}
            />
          </div>

          <div>
            <Label className="mb-1 block">{t("Cosa cambia esattamente?")}</Label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              className="w-full rounded-md border bg-white p-2 text-sm"
              placeholder={t("Es. Sostituisco immagine 'bagno moderno' con 'bagno con doccia walk-in', tutto il resto resta uguale.")}
            />
            <p className="mt-1 text-xs text-slate-500">
              {t("Documenta sempre il cambio: tra 1 mese non ricorderai cosa avevi modificato.")}
            </p>
          </div>

          {currentVar && (
            <div className="rounded-xl border border-violet-200 bg-violet-50 p-3 text-xs text-violet-900">
              <strong>{t("💡 Best practice {label}:", { label: t(currentVar.label).toLowerCase() })}</strong>
              <p className="mt-1">
                {variable === "creative" &&
                  t("Lascia girare entrambe le varianti per almeno 5 giorni con stesso budget prima di decidere il vincitore.")}
                {variable === "copy" &&
                  t("Cambia hook + body, mantieni stesso CTA per isolare l'effetto del messaggio.")}
                {variable === "audience" &&
                  t("Espandi raggio/età vs restringere interessi: due strategie opposte sullo stesso pubblico base.")}
                {variable === "budget" &&
                  t("Aumenta del 20-50% sulla campagna vincente. Se CPL stabile, scala. Se CPL sale → riduci.")}
                {variable === "optimization_event" &&
                  t("Lead = volume, Qualified_lead = qualità. Misura quale porta più commesse chiuse.")}
              </p>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isCreating}>
            {t("Annulla")}
          </Button>
          <Button onClick={submit} disabled={isCreating || !variantName || !description}>
            {isCreating && <Loader2 className="h-3 w-3 animate-spin" />}
            {t("Crea variante B")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
