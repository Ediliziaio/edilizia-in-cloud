/**
 * «Quanto dura il cantiere» nel preventivo (26/10/2026): le fasi e le durate di QUESTO lavoro.
 *
 * Erano scritte una volta sola nel modello dell'azienda, uguali per tutti i preventivi: un bagno da due settimane e
 * una ristrutturazione da tre mesi raccontavano gli stessi tempi. Qui si partono da quelle del modello e si
 * cambiano per il preventivo che si sta facendo. Senza, nel PDF resta il cronoprogramma del modello, come prima.
 */
import { CalendarRange, GripVertical, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import {
  MAX_FASI_CRONO, durataComplessiva, fasiDiPartenza, leggiCronoprogramma, type FaseCrono,
} from "@/lib/preventivi/cronoprogramma";

interface Props {
  /** Le fasi salvate sul preventivo (null = quelle del modello). */
  fasi: unknown;
  onChange: (fasi: FaseCrono[] | null) => void;
  /** Le fasi del modello dell'azienda: il punto di partenza, e ciò che esce nel PDF senza fasi proprie. */
  fasiDelModello?: unknown;
  /** Il preventivatore: decide le fasi proposte quando il modello non ne ha. */
  modulo?: string | null;
}

export function CronoprogrammaCard({ fasi: raw, onChange, fasiDelModello, modulo }: Props) {
  const fasi = leggiCronoprogramma(raw);
  const delModello = leggiCronoprogramma(fasiDelModello);
  const durata = durataComplessiva(fasi ?? delModello ?? []);

  const cambia = (i: number, patch: Partial<FaseCrono>) => {
    if (!fasi) return;
    onChange(fasi.map((f, k) => (k === i ? { ...f, ...patch } : f)));
  };

  if (!fasi) {
    return (
      <div className="rounded-lg border p-3">
        <p className="flex items-center gap-1.5 text-xs font-medium">
          <CalendarRange className="h-3.5 w-3.5 text-sky-600" aria-hidden="true" />
          Quanto dura il cantiere
        </p>
        <p className="mt-0.5 text-[11px] text-muted-foreground">
          {delModello
            ? `Nel PDF escono le ${delModello.length} fasi scritte nel modello${durata ? ` (${durata} in tutto)` : ""}. Puoi scrivere i tempi di questo lavoro.`
            : "Nel modello non ci sono fasi: nel PDF non compare nessun tempo. Scrivi le fasi di questo lavoro."}
        </p>
        <div className="mt-2 flex flex-wrap gap-1.5">
          {delModello && (
            <Button type="button" size="sm" variant="default" onClick={() => onChange(delModello)}>
              Parti da quelle del modello
            </Button>
          )}
          <Button type="button" size="sm" variant={delModello ? "outline" : "default"} onClick={() => onChange(fasiDiPartenza(modulo))}>
            Fasi tipiche di questo lavoro
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-lg border">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b px-3 py-2">
        <p className="flex items-center gap-1.5 text-xs font-medium">
          <CalendarRange className="h-3.5 w-3.5 text-sky-600" aria-hidden="true" />
          Quanto dura il cantiere
        </p>
        {durata && <span className="text-[11px] font-semibold text-sky-800">{durata} in tutto</span>}
      </div>

      <div className="space-y-1.5 px-3 py-2">
        {fasi.map((f, i) => (
          <div key={i} className="grid grid-cols-[auto_minmax(0,1fr)_minmax(0,7rem)_auto] items-center gap-2">
            <GripVertical aria-hidden="true" className="h-3.5 w-3.5 shrink-0 text-slate-300" />
            <Input
              aria-label={`Nome della fase ${i + 1}`}
              value={f.fase}
              placeholder="Es. Demolizioni"
              onChange={(e) => cambia(i, { fase: e.target.value })}
              className="h-8 text-xs"
            />
            <Input
              aria-label={`Durata della fase ${i + 1}`}
              value={f.durata ?? ""}
              placeholder="Es. 3 giorni"
              onChange={(e) => cambia(i, { durata: e.target.value || null })}
              className="h-8 text-xs"
            />
            <button
              type="button"
              aria-label={`Togli la fase ${i + 1}`}
              onClick={() => onChange(fasi.filter((_, k) => k !== i))}
              disabled={fasi.length <= 1}
              className="rounded p-1 text-slate-400 hover:text-red-600 disabled:opacity-40"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </div>
        ))}

        <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
          <div className="flex gap-1.5">
            {fasi.length < MAX_FASI_CRONO && (
              <Button
                type="button" size="sm" variant="ghost" className="h-7 gap-1 px-2 text-[11px]"
                onClick={() => onChange([...fasi, { fase: "", durata: null, descrizione: null }])}
              >
                <Plus className="h-3 w-3" />Aggiungi una fase
              </Button>
            )}
            <Button type="button" size="sm" variant="ghost" className="h-7 px-2 text-[11px] text-slate-500" onClick={() => onChange(null)}>
              {delModello ? "Torna a quelle del modello" : "Togli le fasi"}
            </Button>
          </div>
          <span className={cn("text-[10px]", fasi.some((f) => !f.fase.trim()) ? "text-amber-700" : "text-muted-foreground")}>
            {fasi.some((f) => !f.fase.trim()) ? "Una fase senza nome non esce nel PDF" : "Escono nel PDF, con la durata complessiva"}
          </span>
        </div>
      </div>
    </div>
  );
}
