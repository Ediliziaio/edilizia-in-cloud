/**
 * StepConsulenza — Step 7 wizard: appuntamento + consulente + cronoprogramma.
 */
import { useMemo } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Calendar, Clock, MapPin, ListChecks } from "lucide-react";
import type { SrProgettoRow, SrProgettoDetail } from "@/types/serramenti";
import { SrCard, SrKpi, SR_GREEN } from "@/lib/serramenti/wizardUI";
import { generaCrono, durataTotaleGiorni } from "@/lib/serramenti/crono";

interface Props {
  form: Partial<SrProgettoRow>;
  onChange: <K extends keyof SrProgettoRow>(key: K, value: SrProgettoRow[K]) => void;
  detail: SrProgettoDetail;
}

export function StepConsulenza({ form, onChange, detail }: Props) {
  const numSerramenti = detail.serramenti.reduce((acc, s) => acc + (s.quantita ?? 1), 0);

  const crono = useMemo(() => generaCrono({
    num_serramenti: numSerramenti,
    giorni_produzione: form.crono_giorni_produzione ?? 30,
    giorni_posa_per_pezzo: 0.8,
    giorni_collaudo: form.crono_giorni_collaudo ?? 1,
  }), [numSerramenti, form.crono_giorni_produzione, form.crono_giorni_collaudo]);

  const durata = durataTotaleGiorni(crono);

  // Calcola data fine cantiere se c'è data consulenza
  const dataFineCantiere = useMemo(() => {
    if (!form.consulenza_at) return null;
    const inizio = new Date(form.consulenza_at);
    const fine = new Date(inizio.getTime() + durata * 86400000);
    return fine;
  }, [form.consulenza_at, durata]);

  // Prossimi passi (default + custom)
  const prossimiPassi = (form.prossimi_passi ?? [
    "Ci vediamo per la consulenza tecnica",
    "Ascoltiamo le tue esigenze e troviamo la soluzione migliore",
    "Sviluppiamo il Piano dei Lavori e definiamo i dettagli",
    "Firmi e procediamo insieme",
  ]) as string[];

  const updatePasso = (idx: number, value: string) => {
    const next = [...prossimiPassi];
    while (next.length <= idx) next.push("");
    next[idx] = value;
    onChange("prossimi_passi", next);
  };

  return (
    <div className="space-y-3">
      {/* Appuntamento */}
      <SrCard
        title="Appuntamento di consulenza"
        description="Data, ora e luogo dell'incontro con il consulente. Compariranno nella pagina 3 del PDF."
        icon={<Calendar className="h-4 w-4" />}
      >
        <div className="grid grid-cols-12 gap-3">
          <div className="col-span-12 md:col-span-6">
            <Label className="text-xs">Data e ora</Label>
            <Input
              type="datetime-local"
              defaultValue={form.consulenza_at ? new Date(form.consulenza_at).toISOString().slice(0, 16) : ""}
              onBlur={(e) => onChange("consulenza_at", e.target.value ? new Date(e.target.value).toISOString() : null)}
              className="h-9 text-xs"
            />
          </div>
          <div className="col-span-12 md:col-span-6">
            <Label className="text-xs">Luogo</Label>
            <Select
              value={form.consulenza_luogo ?? ""}
              onValueChange={(v) => onChange("consulenza_luogo", v)}
            >
              <SelectTrigger className="h-9 text-xs">
                <SelectValue placeholder="Scegli..." />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="A casa tua">A casa tua</SelectItem>
                <SelectItem value="In showroom">In showroom</SelectItem>
                <SelectItem value="Video-call">Video-call</SelectItem>
                <SelectItem value="In cantiere">In cantiere</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      </SrCard>

      {/* Cronoprogramma */}
      <SrCard
        title="Cronoprogramma lavori"
        description="Generato automaticamente dal numero di serramenti. Riduce l'ansia 'quanti giorni mi tieni casa sottosopra?' del cliente."
        icon={<Clock className="h-4 w-4" />}
      >
        <div className="grid grid-cols-12 gap-3 mb-3">
          <div className="col-span-6 md:col-span-3">
            <Label className="text-xs">Giorni produzione</Label>
            <Input
              type="number"
              defaultValue={form.crono_giorni_produzione ?? 30}
              onBlur={(e) => onChange("crono_giorni_produzione", Number(e.target.value) || 30)}
              className="h-9 text-xs"
            />
          </div>
          <div className="col-span-6 md:col-span-3">
            <Label className="text-xs">Giorni posa (auto)</Label>
            <div className="h-9 px-3 flex items-center text-xs bg-emerald-50 rounded-md border border-emerald-200 font-semibold text-emerald-700">
              {Math.ceil(numSerramenti * 0.8)} giorni
            </div>
            <p className="text-[10px] text-muted-foreground mt-0.5">≈0.8 g per pezzo × {numSerramenti}</p>
          </div>
          <div className="col-span-6 md:col-span-3">
            <Label className="text-xs">Giorni collaudo</Label>
            <Input
              type="number"
              defaultValue={form.crono_giorni_collaudo ?? 1}
              onBlur={(e) => onChange("crono_giorni_collaudo", Number(e.target.value) || 1)}
              className="h-9 text-xs"
            />
          </div>
          <div className="col-span-6 md:col-span-3">
            <Label className="text-xs">Durata totale</Label>
            <div className="h-9 px-3 flex items-center text-sm bg-emerald-50 rounded-md border border-emerald-200 font-bold text-emerald-700">
              {durata} giorni
            </div>
          </div>
        </div>

        {/* Gantt visuale */}
        <CronogantsSvg fasi={crono} durata={durata} />

        {dataFineCantiere && (
          <div className="mt-3 grid grid-cols-2 md:grid-cols-3 gap-2">
            <SrKpi
              label="Inizio cantiere"
              value={new Date(form.consulenza_at!).toLocaleDateString("it-IT")}
              hint="Da data consulenza"
            />
            <SrKpi
              label="Fine cantiere stimata"
              value={dataFineCantiere.toLocaleDateString("it-IT")}
              variant="success"
            />
            <SrKpi
              label="Durata totale"
              value={durata}
              unit="giorni lavorativi"
            />
          </div>
        )}
      </SrCard>

      {/* Prossimi passi */}
      <SrCard
        title="Prossimi passi"
        description="I 4 step che il cliente vedrà in fondo al PDF (pagina 3)."
        icon={<ListChecks className="h-4 w-4" />}
      >
        <div className="space-y-2">
          {[0, 1, 2, 3].map((idx) => (
            <div key={idx} className="flex items-center gap-2">
              <span className="h-7 w-7 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center text-xs font-bold shrink-0">
                {idx + 1}
              </span>
              <Input
                value={prossimiPassi[idx] ?? ""}
                onChange={(e) => updatePasso(idx, e.target.value)}
                placeholder="Es. Ci vediamo per la consulenza tecnica"
                className="h-9 text-xs flex-1"
              />
            </div>
          ))}
        </div>
      </SrCard>

      {/* Note interne (non in PDF) */}
      <SrCard
        title="Note interne"
        description="Solo per il backoffice — non compaiono nel PDF cliente."
        icon={<MapPin className="h-4 w-4" />}
        variant="muted"
      >
        <Textarea
          defaultValue={form.note_interne ?? ""}
          onBlur={(e) => onChange("note_interne", e.target.value || null)}
          placeholder="Vincoli, ferie cliente, urgenze, eccezioni..."
          rows={3}
        />
      </SrCard>
    </div>
  );
}

// ─── Gantt SVG ──────────────────────────────────────────────────────────────

import type { FaseCrono } from "@/lib/serramenti/crono";

function CronogantsSvg({ fasi, durata }: { fasi: FaseCrono[]; durata: number }) {
  const W = 600, ROW_H = 28, PAD_L = 140, PAD_T = 10, BAR_H = 18;
  const innerW = W - PAD_L - 40;
  const H = PAD_T * 2 + fasi.length * ROW_H + 30;

  const xScale = (g: number) => PAD_L + ((g - 1) / Math.max(durata - 1, 1)) * innerW;

  return (
    <div className="w-full overflow-x-auto">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full max-w-3xl border border-emerald-100 rounded-md bg-white">
        {/* Griglia giorni */}
        {[0, 0.25, 0.5, 0.75, 1].map((p) => (
          <line
            key={p}
            x1={PAD_L + p * innerW}
            x2={PAD_L + p * innerW}
            y1={PAD_T}
            y2={H - 20}
            stroke="#e2e8f0" strokeDasharray="2,3"
          />
        ))}
        {/* Fasi */}
        {fasi.map((f, idx) => {
          const y = PAD_T + idx * ROW_H;
          const x1 = xScale(f.giorno_inizio);
          const x2 = xScale(f.giorno_fine + 1);
          const w = Math.max(8, x2 - x1);
          return (
            <g key={f.key}>
              <text x={PAD_L - 8} y={y + BAR_H / 2 + 4} fontSize="11" textAnchor="end" fill="#1e293b">
                {f.emoji} {f.label}
              </text>
              <rect
                x={x1} y={y}
                width={w} height={BAR_H}
                rx={3} ry={3}
                fill={SR_GREEN} opacity={0.85}
              />
              <text x={x1 + w / 2} y={y + BAR_H / 2 + 4} fontSize="10" textAnchor="middle" fill="white" fontWeight="600">
                {f.durata > 2 ? `g.${f.giorno_inizio}-${f.giorno_fine}` : `g.${f.giorno_inizio}`}
              </text>
            </g>
          );
        })}
        {/* Asse */}
        <text x={PAD_L} y={H - 6} fontSize="9" fill="#64748b">Giorno 1</text>
        <text x={W - 30} y={H - 6} fontSize="9" textAnchor="end" fill="#64748b">Giorno {durata}</text>
      </svg>
    </div>
  );
}
