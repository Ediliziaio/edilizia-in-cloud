/**
 * «Quanto dura il cantiere» nel preventivo (26/10/2026): le fasi e le durate di QUESTO lavoro.
 *
 * Erano scritte una volta sola nel modello dell'azienda, uguali per tutti i preventivi: un bagno da due settimane e
 * una ristrutturazione da tre mesi raccontavano gli stessi tempi. Qui si partono da quelle del modello e si
 * cambiano per il preventivo che si sta facendo. Senza, nel PDF resta il cronoprogramma del modello, come prima.
 */
import { useContext, useState } from "react";
import { CalendarRange, Calculator, GripVertical, Loader2, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { AuthContext } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import {
  MAX_FASI_CRONO, durataComplessiva, fasiDaCalcolo, fasiDiPartenza, leggiCronoprogramma, type FaseCrono,
} from "@/lib/preventivi/cronoprogramma";
import { preparaCrono, type ClientCrono, type VoceCrono } from "../../../shared/piano-cantiere/cronoCalcolato.ts";
import { regioneDaProvincia } from "../../../shared/piano-cantiere/regioni.ts";

/** Una voce del computo del modulo: i campi sono gli stessi negli otto preventivatori. */
export interface RigaPerCrono {
  capitolo_nome?: string | null; descrizione?: string | null; unita_misura?: string | null; quantita?: number | string | null;
  importo?: number | string | null; costo_manodopera?: number | string | null; costo_materiali?: number | string | null; ore_previste?: number | string | null; opzionale?: boolean | null;
}

const numero = (v: unknown) => { const n = Number(v); return Number.isFinite(n) ? n : null; };
const vociDalComputo = (righe: readonly RigaPerCrono[]): VoceCrono[] => righe
  .filter((r) => !r.opzionale && (r.descrizione ?? "").trim())
  .map((r) => ({
    capitolo: r.capitolo_nome ?? null, descrizione: r.descrizione!.trim().split("\n")[0], unita: r.unita_misura ?? null, quantita: numero(r.quantita),
    importo: numero(r.importo), costo_manodopera: numero(r.costo_manodopera), costo_materiali: numero(r.costo_materiali), ore_previste: numero(r.ore_previste),
  }));

interface Props {
  /** Le fasi salvate sul preventivo (null = quelle del modello). */
  fasi: unknown;
  onChange: (fasi: FaseCrono[] | null) => void;
  /** Le fasi del modello dell'azienda: il punto di partenza, e ciò che esce nel PDF senza fasi proprie. */
  fasiDelModello?: unknown;
  /** Il preventivatore: decide le fasi proposte quando il modello non ne ha. */
  modulo?: string | null;
  /** Le voci del computo del preventivo: se ci sono, le durate si possono calcolare da lì. */
  righe?: readonly RigaPerCrono[];
}

export function CronoprogrammaCard({ fasi: raw, onChange, fasiDelModello, modulo, righe }: Props) {
  // Il contesto, non useAuth: senza azienda la scheda funziona come prima, solo senza il calcolo.
  const effectiveCompany = useContext(AuthContext)?.effectiveCompany;
  const [calcolando, setCalcolando] = useState(false);
  const [nota, setNota] = useState<string | null>(null);
  const [confermaSostituzione, setConfermaSostituzione] = useState(false);
  const voci = vociDalComputo(righe ?? []);
  const puoCalcolare = voci.length > 0 && !!effectiveCompany?.id;
  const calcola = async () => {
    if (!effectiveCompany?.id) return;
    setCalcolando(true);
    try {
      const esito = await preparaCrono(supabase as unknown as ClientCrono, effectiveCompany.id, voci, {}, regioneDaProvincia);
      if (!(esito.ore > 0)) {
        toast.error("Mancano i dati per calcolare i tempi: aggiungi importi o manodopera alle voci, o scrivi le fasi a mano.");
        return;
      }
      onChange(fasiDaCalcolo(esito.fasi));
      setNota(esito.avvisoInterno);
      setConfermaSostituzione(false);
    } catch {
      toast.error("Non sono riuscito a calcolare i tempi: riprova tra poco, o scrivili a mano.");
    } finally {
      setCalcolando(false);
    }
  };
  const pulsanteCalcola = puoCalcolare && (
    <Button type="button" size="sm" variant="default" disabled={calcolando} className="gap-1" onClick={() => { void calcola(); }}>
      {calcolando ? <Loader2 className="h-3 w-3 animate-spin" /> : <Calculator className="h-3 w-3" />}Calcola dalle voci del computo
    </Button>
  );
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
          {pulsanteCalcola}
          {delModello && (
            <Button type="button" size="sm" variant={puoCalcolare ? "outline" : "default"} onClick={() => onChange(delModello)}>
              Parti da quelle del modello
            </Button>
          )}
          <Button type="button" size="sm" variant={delModello || puoCalcolare ? "outline" : "default"} onClick={() => onChange(fasiDiPartenza(modulo))}>
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
        <div className="flex items-center gap-2">
          {puoCalcolare && (
            <Button
              type="button" size="sm" variant="ghost" className="h-7 gap-1 px-2 text-[11px]" disabled={calcolando}
              onClick={() => { if (confermaSostituzione) void calcola(); else setConfermaSostituzione(true); }}
            >
              {calcolando ? <Loader2 className="h-3 w-3 animate-spin" /> : <Calculator className="h-3 w-3" />}
              {confermaSostituzione ? "Sostituisco le fasi scritte?" : "Ricalcola dal computo"}
            </Button>
          )}
          {durata && <span className="text-[11px] font-semibold text-sky-800">{durata} in tutto</span>}
        </div>
      </div>
      {nota && <p className="border-b px-3 py-1.5 text-[11px] text-muted-foreground">{nota} Questa nota la vedi solo tu, nel PDF non esce.</p>}

      <div className="space-y-1.5 px-3 py-2">
        {fasi.map((f, i) => (
          <div key={i} className="grid grid-cols-[auto_minmax(0,1fr)_minmax(0,9.5rem)_auto] items-center gap-2">
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
