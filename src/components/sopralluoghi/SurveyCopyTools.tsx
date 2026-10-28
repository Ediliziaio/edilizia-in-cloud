import { useRef, useState } from "react";
import { Copy, Loader2 } from "lucide-react";
import type { SurveyDetail } from "@/lib/api/surveys";
import type { ElementTypeDefinition, SurveyElementRow } from "@/types/surveys";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  copySurveyValues,
  type SurveyCopyMode,
  type SurveyDuplicateRequest,
} from "@/lib/surveys/copyElement";

export function SurveyCommonCopy({
  detail,
  element,
  type,
  disabled = false,
  onApply,
}: {
  detail: SurveyDetail;
  element: SurveyElementRow;
  type: ElementTypeDefinition;
  disabled?: boolean;
  onApply: (source: SurveyElementRow, productDimensions: boolean) => void;
}) {
  const [sourceId, setSourceId] = useState(""),
    [product, setProduct] = useState(false);
  const candidates = detail.elements.filter(
    (e) => e.id !== element.id && e.element_type === type.key,
  );
  if (!candidates.length) return null;
  const source = candidates.find((e) => e.id === sourceId);
  const count = source
    ? Object.keys(
        copySurveyValues(
          type,
          source.values ?? {},
          product ? "product" : "common",
        ),
      ).filter((k) => k !== "rv_order_checked").length
    : 0;
  return (
    <details className="rounded-xl border border-blue-100 bg-blue-50/50 p-3">
      <summary className="cursor-pointer text-sm font-medium text-blue-950">
        Copia dati comuni da un altro elemento
      </summary>
      <div className="mt-3 space-y-3">
        <p className="text-xs text-slate-600">
          Riutilizza materiali, finiture e accessori. Misure del vano, apertura,
          quantità, nome e ambiente del pezzo corrente restano invariati. Nessun
          salvataggio automatico.
        </p>
        <Select
          value={sourceId}
          onValueChange={setSourceId}
          disabled={disabled}
        >
          <SelectTrigger
            className="min-h-11 rounded-xl"
            aria-label="Elemento da cui copiare"
          >
            <SelectValue placeholder="Scegli un elemento dello stesso tipo" />
          </SelectTrigger>
          <SelectContent className="rounded-xl">
            {candidates.map((e, i) => (
              <SelectItem key={e.id} value={e.id}>
                {i + 1}. {e.element_label || type.label} ·{" "}
                {detail.areas.find((a) => a.id === e.area_id)?.name ||
                  "Senza ambiente"}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <label className="flex min-h-11 items-center gap-3 text-xs text-slate-700">
          <Checkbox
            checked={product}
            disabled={disabled}
            onCheckedChange={(v) => setProduct(v === true)}
          />
          Includi spessori e ingombri del prodotto, da verificare sul nuovo
          pezzo
        </label>
        <p className="text-xs text-slate-500">
          Non copio foto o approvazioni d’ordine. Eventuali note sul disegno
          corrente vengono conservate come testo da riposizionare.
        </p>
        <Button
          type="button"
          className="min-h-11 rounded-xl"
          disabled={disabled || !source || !count}
          onClick={() => source && onApply(source, product)}
        >
          <Copy className="mr-2 h-4 w-4" />
          Applica {count || ""} dati comuni alla bozza
        </Button>
      </div>
    </details>
  );
}

export function SurveyDuplicateDialog({
  detail,
  source,
  onClose,
  onConfirm,
}: {
  detail: SurveyDetail;
  source: SurveyElementRow;
  onClose: () => void;
  onConfirm: (request: SurveyDuplicateRequest) => Promise<void>;
}) {
  const [id] = useState(() => crypto.randomUUID());
  const [areaId, setAreaId] = useState(
    detail.areas.some((a) => a.id === source.area_id)
      ? source.area_id
      : (detail.areas[0]?.id ?? ""),
  );
  const type = detail.template.schema.element_types.find(
    (t) => t.key === source.element_type,
  );
  const [label, setLabel] = useState(
    `${(source.element_label || type?.label || "Elemento").slice(0, 170)} · copia`,
  );
  const [mode, setMode] = useState<SurveyCopyMode>("common"),
    [busy, setBusy] = useState(false),
    [error, setError] = useState<string | null>(null);
  const inFlight = useRef(false);
  async function submit() {
    if (inFlight.current || !type || !areaId || !label.trim()) return;
    inFlight.current = true;
    setBusy(true);
    setError(null);
    try {
      await onConfirm({ id, sourceId: source.id, areaId, label, mode });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Copia non riuscita. Riprova.");
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  }
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !busy) onClose();
      }}
    >
      <DialogContent className="max-h-[90dvh] overflow-y-auto rounded-2xl sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Duplica elemento</DialogTitle>
          <DialogDescription>
            Crea una nuova scheda da verificare. Il pezzo originale non viene
            modificato.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          <Label htmlFor="survey-copy-label">Nome del nuovo pezzo</Label>
          <Input
            id="survey-copy-label"
            className="min-h-11 rounded-xl"
            maxLength={180}
            value={label}
            disabled={busy}
            onChange={(e) => setLabel(e.target.value)}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="survey-copy-area">Ambiente di destinazione</Label>
          <Select value={areaId} onValueChange={setAreaId} disabled={busy}>
            <SelectTrigger
              id="survey-copy-area"
              className="min-h-11 rounded-xl"
            >
              <SelectValue placeholder="Scegli ambiente" />
            </SelectTrigger>
            <SelectContent className="rounded-xl">
              {detail.areas.map((a) => (
                <SelectItem key={a.id} value={a.id}>
                  {a.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label htmlFor="survey-copy-mode">Cosa vuoi riutilizzare?</Label>
          <Select
            value={mode}
            disabled={busy}
            onValueChange={(v) => setMode(v as SurveyCopyMode)}
          >
            <SelectTrigger
              id="survey-copy-mode"
              className="min-h-11 rounded-xl"
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="rounded-xl">
              <SelectItem value="common">
                Materiali, finiture e accessori
              </SelectItem>
              <SelectItem value="product">
                Anche spessori e ingombri del prodotto
              </SelectItem>
              <SelectItem value="all">
                Anche misure e aperture · pezzo uguale
              </SelectItem>
            </SelectContent>
          </Select>
        </div>
        <p className="rounded-xl bg-slate-50 p-3 text-xs text-slate-600">
          {mode === "all"
            ? "Le misure copiate restano da ricontrollare sul posto."
            : "Le misure del nuovo vano e la sua apertura vanno rilevate."}{" "}
          Quantità iniziale: 1. Foto, note grafiche, firme e verifiche d’ordine
          non vengono copiate.
        </p>
        {error && (
          <p
            role="alert"
            className="rounded-xl bg-red-50 p-3 text-sm text-red-800"
          >
            {error}
          </p>
        )}
        <div className="flex justify-end gap-2">
          <Button
            type="button"
            variant="ghost"
            disabled={busy}
            onClick={onClose}
          >
            Annulla
          </Button>
          <Button
            type="button"
            className="min-h-11 rounded-xl"
            disabled={busy || !type || !areaId || !label.trim()}
            onClick={() => void submit()}
          >
            {busy ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Copy className="mr-2 h-4 w-4" />
            )}
            Crea copia da verificare
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
