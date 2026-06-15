import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Mail, Clock, Copy, Trash2, Pencil, ArrowUp, ArrowDown,
  Loader2, Play, Flag, Plus,
} from "lucide-react";
import { htmlToPreviewText } from "./_shared";
import { parseVariants } from "../../../../supabase/functions/_shared/outreach-abz";
import { CH_ICON, CH_LABEL, CH_ACCENT, delayLabel, waitLabel, type TimelineStep } from "./sequenceShared";

/**
 * Timeline verticale degli step di una cadenza (firma visiva Instantly/Smartlead):
 * le step-card sono impilate verticalmente lungo una linea-spina, e tra uno step e
 * il successivo un PILL-CONNETTORE centrato "Attendi N giorni" mostra il salto di
 * ritardo (cliccabile per editarlo al volo). Estratto da OutreachSequences per
 * leggibilità. Pure-presentational: tutte le azioni sono delegate via callback.
 * Costanti/helper canali e ritardi vivono in ./sequenceShared (fast-refresh-safe).
 */

/**
 * Pill-connettore centrato tra due step (firma Instantly). Mostra l'attesa
 * relativa al passo successivo; se `onEditDelay` è fornito è cliccabile e apre un
 * mini-popover per cambiare giorni/ore di quel passo. Senza, è un badge statico.
 */
export function WaitConnector({
  deltaDays, deltaHours = 0, onEditDelay,
}: {
  deltaDays: number;
  deltaHours?: number;
  onEditDelay?: (days: number, hours: number) => void;
}) {
  const [open, setOpen] = useState(false);
  const [days, setDays] = useState(String(Math.max(0, Math.trunc(deltaDays))));
  const [hours, setHours] = useState(String(Math.max(0, Math.trunc(deltaHours))));

  const pill = (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-background px-3 py-1 text-[11px] font-medium text-muted-foreground shadow-sm">
      <Clock className="h-3 w-3" />
      {waitLabel(deltaDays, deltaHours)}
    </span>
  );

  // Linea-spina verticale con il pill agganciato al centro. La linea passa DIETRO
  // il pill (z-index) così sembra "attraversarlo" come in Instantly.
  return (
    <div className="relative flex h-9 items-center justify-center">
      <span className="absolute left-[27px] top-0 h-full w-px bg-border" aria-hidden />
      <div className="relative z-10 pl-[27px]">
        {onEditDelay ? (
          <Popover
            open={open}
            onOpenChange={(o) => {
              setOpen(o);
              if (o) { setDays(String(Math.max(0, Math.trunc(deltaDays)))); setHours(String(Math.max(0, Math.trunc(deltaHours)))); }
            }}
          >
            <PopoverTrigger asChild>
              <button
                type="button"
                className="inline-flex items-center gap-1.5 rounded-full border border-border bg-background px-3 py-1 text-[11px] font-medium text-muted-foreground shadow-sm transition-colors hover:border-primary/40 hover:text-foreground"
                title="Cambia l'attesa prima dello step successivo"
              >
                <Clock className="h-3 w-3" />
                {waitLabel(deltaDays, deltaHours)}
                <Pencil className="h-2.5 w-2.5 opacity-60" />
              </button>
            </PopoverTrigger>
            <PopoverContent className="w-56 p-3" align="center">
              <p className="mb-2 text-[11px] font-medium text-muted-foreground">Attesa prima dello step successivo</p>
              <div className="flex items-end gap-2">
                <div className="space-y-1">
                  <Label className="text-[10px] text-muted-foreground">Giorni</Label>
                  <Input type="number" min={0} max={365} value={days} onChange={(e) => setDays(e.target.value)} className="h-8 w-16 text-sm" />
                </div>
                <div className="space-y-1">
                  <Label className="text-[10px] text-muted-foreground">Ore</Label>
                  <Input type="number" min={0} max={23} value={hours} onChange={(e) => setHours(e.target.value)} className="h-8 w-16 text-sm" />
                </div>
                <Button
                  size="sm"
                  className="h-8 flex-1"
                  onClick={() => {
                    onEditDelay(Math.max(0, Number(days) || 0), Math.min(23, Math.max(0, Number(hours) || 0)));
                    setOpen(false);
                  }}
                >
                  Salva
                </Button>
              </div>
            </PopoverContent>
          </Popover>
        ) : (
          pill
        )}
      </div>
    </div>
  );
}

/** Cap d'inizio cadenza ("Iscrizione · Giorno 0") in cima alla timeline. */
export function TimelineStartCap({ label }: { label: string }) {
  return (
    <div className="relative flex items-center gap-3">
      <div className="flex h-[54px] w-[54px] shrink-0 items-center justify-center">
        <div className="flex h-9 w-9 items-center justify-center rounded-full border-2 border-dashed border-border bg-muted/40 text-muted-foreground">
          <Play className="h-4 w-4" />
        </div>
      </div>
      <div className="min-w-0">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Iscrizione</p>
        <p className="text-xs text-muted-foreground">{label}</p>
      </div>
    </div>
  );
}

/** Cap di chiusura cadenza ("Fine · sequenza completata") in coda alla timeline. */
export function TimelineEndCap() {
  return (
    <div className="relative flex items-center gap-3">
      <span className="absolute left-[27px] top-[-12px] h-3 w-px bg-border" aria-hidden />
      <div className="flex h-[54px] w-[54px] shrink-0 items-center justify-center">
        <div className="flex h-9 w-9 items-center justify-center rounded-full border border-border bg-muted text-muted-foreground">
          <Flag className="h-4 w-4" />
        </div>
      </div>
      <div className="min-w-0">
        <p className="text-xs font-medium text-foreground">Fine cadenza</p>
        <p className="text-[11px] text-muted-foreground">Il contatto esce: iscrizione completata.</p>
      </div>
    </div>
  );
}

/**
 * Card di uno step nella timeline verticale (stile Instantly): pallino/icona canale
 * colorato a sinistra agganciato alla linea-spina, header "Step N · Email" + badge
 * ritardo, oggetto in evidenza, anteprima corpo pulita (htmlToPreviewText), badge
 * A/Z. Azioni in hover (riordina, modifica, duplica, elimina).
 */
export function SequenceStepCard({
  step, index, total, busy, isLast,
  onEdit, onDuplicate, onDelete, onMoveUp, onMoveDown,
}: {
  step: TimelineStep;
  index: number;
  total: number;
  busy: boolean;
  /** se true, non disegna la coda di linea sotto l'icona (l'ultimo step la chiude col cap). */
  isLast: boolean;
  onEdit: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
}) {
  const Icon = CH_ICON[step.channel] ?? Mail;
  const accent = CH_ACCENT[step.channel] ?? CH_ACCENT.email;
  const subjectVariants = parseVariants(step.subject || "");
  const bodyVariants = parseVariants(step.body || "");
  const variantCount = Math.max(subjectVariants.length, bodyVariants.length);
  const subjectText = subjectVariants[0] ?? step.subject ?? "";
  // ANTEPRIMA LEGGIBILE: strip dei tag HTML (il body può contenere <br>, <p>…),
  // sulla 1ª variante, così non compare HTML grezzo nella card.
  const bodyPreview = htmlToPreviewText(bodyVariants[0] ?? step.body ?? "");

  return (
    <div className={`group relative flex gap-3 ${busy ? "opacity-60" : ""}`}>
      {/* Spina + nodo icona. La coda di linea verso il connettore sotto è disegnata
          qui (sotto l'icona) tranne che per l'ultimo step. */}
      <div className="relative flex w-[54px] shrink-0 flex-col items-center">
        {!isLast && <span className="absolute left-1/2 top-[44px] h-[calc(100%-44px+0.5rem)] w-px -translate-x-1/2 bg-border" aria-hidden />}
        <div className={`flex h-[44px] w-[44px] items-center justify-center rounded-xl ${accent.wrap} ${accent.text} ring-2 ring-transparent ring-offset-2 ring-offset-background transition-all ${accent.ring}`}>
          <Icon className="h-[18px] w-[18px]" />
        </div>
      </div>

      {/* Card contenuto */}
      <div className="min-w-0 flex-1 rounded-xl border border-border bg-card p-4 shadow-[0_1px_2px_rgba(0,0,0,0.04)] transition-all hover:border-primary/30 hover:shadow-sm">
        <div className="flex items-start justify-between gap-2">
          <button type="button" onClick={onEdit} className="min-w-0 flex-1 text-left" title="Modifica step">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm font-semibold text-foreground">Step {index + 1}</span>
              <span className="text-muted-foreground/40">·</span>
              <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{CH_LABEL[step.channel] ?? step.channel}</span>
              <Badge variant="secondary" className="gap-1 text-[10px] font-medium">
                <Clock className="h-3 w-3" />{delayLabel(step.delay_days, step.delay_hours)}
              </Badge>
              {variantCount > 1 && <Badge variant="outline" className="text-[10px]">A/Z ×{variantCount}</Badge>}
            </div>
            {step.channel === "email" && (
              <p className="mt-2 truncate text-sm font-medium text-foreground">
                {subjectText.trim() || <span className="font-normal text-muted-foreground">Senza oggetto</span>}
              </p>
            )}
            <p className={`text-xs leading-relaxed text-muted-foreground ${step.channel === "email" ? "mt-1" : "mt-2"} line-clamp-2`}>
              {bodyPreview || <span className="italic">Nessun testo</span>}
            </p>
          </button>

          {/* Azioni: discrete, emergono in hover (desktop) — sempre tappabili su touch. */}
          <div className="flex shrink-0 items-center gap-0.5 opacity-100 transition-opacity sm:opacity-0 sm:group-hover:opacity-100 sm:group-focus-within:opacity-100">
            <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-muted-foreground" title="Sposta su" disabled={index === 0 || busy} onClick={onMoveUp}><ArrowUp className="h-3.5 w-3.5" /></Button>
            <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-muted-foreground" title="Sposta giù" disabled={index === total - 1 || busy} onClick={onMoveDown}><ArrowDown className="h-3.5 w-3.5" /></Button>
            <Button size="sm" variant="ghost" className="h-7 w-7 p-0" title="Modifica" disabled={busy} onClick={onEdit}><Pencil className="h-3.5 w-3.5" /></Button>
            <Button size="sm" variant="ghost" className="h-7 w-7 p-0" title="Duplica step" disabled={busy} onClick={onDuplicate}><Copy className="h-3.5 w-3.5" /></Button>
            <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-destructive" title="Elimina step" disabled={busy} onClick={onDelete}>
              {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

/** Riga "aggiungi step" agganciata alla timeline (allineata alla spina). */
export function TimelineAddRow({ onAdd, label = "Aggiungi step" }: { onAdd: () => void; label?: string }) {
  return (
    <div className="relative flex gap-3">
      <span className="absolute left-[27px] top-0 h-1/2 w-px bg-border" aria-hidden />
      <div className="flex w-[54px] shrink-0 items-center justify-center">
        <div className="z-10 flex h-7 w-7 items-center justify-center rounded-full border border-dashed border-border bg-background text-muted-foreground">
          <Plus className="h-3.5 w-3.5" />
        </div>
      </div>
      <Button
        variant="outline"
        size="sm"
        className="h-9 flex-1 justify-start gap-1.5 border-dashed text-muted-foreground hover:border-primary/40 hover:text-foreground"
        onClick={onAdd}
      >
        <Plus className="h-4 w-4" /> {label}
      </Button>
    </div>
  );
}
