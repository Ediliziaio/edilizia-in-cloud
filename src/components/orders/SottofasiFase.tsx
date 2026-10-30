// src/components/orders/SottofasiFase.tsx
import { useState } from "react";
import { CalendarDays, ListChecks, Pencil, Plus, Scale, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { format, parseISO } from "date-fns";
import { it } from "date-fns/locale";
import {
  avanzamentoDaSottofasi, fineDaGiorni, giorniFinestra, intervalloSottofase, pesiDaGiorni, riepilogoSottofasi, type Sottofase,
} from "@/lib/orders/sottofasi";

export interface PianoSottofase {
  data_inizio: string | null;
  data_fine: string | null;
  giorni: number | null;
}

const breve = (d: string) => format(parseISO(d), "dd/MM", { locale: it });

/** «12/10 → 15/10 · 3 gg», o null se la sottofase non ha né date né giorni. */
export function testoPiano(s: Pick<Sottofase, "data_inizio" | "data_fine" | "giorni">): string | null {
  const i = intervalloSottofase(s);
  const parti = [i ? (i[0] === i[1] ? breve(i[0]) : `${breve(i[0])} → ${breve(i[1])}`) : null, s.giorni ? `${s.giorni} gg` : null].filter(Boolean);
  return parti.length ? parti.join(" · ") : null;
}

interface SottofasiFaseProps {
  nomeFase: string;
  sottofasi: Sottofase[];
  /** Se la fase è già avviata (o chiusa) e non ha ancora sottofasi: l'avanzamento che ha adesso. */
  avviata?: { percentuale: number; chiusa: boolean } | null;
  /** L'ufficio aggiunge, rinomina e toglie. */
  puoModificare: boolean;
  /** Spuntare: l'ufficio, o chi lavora sul cantiere. */
  puoSegnare: boolean;
  onSegna: (id: string, fatta: boolean) => void;
  onAggiungi: (nome: string) => void;
  onRinomina: (id: string, nome: string) => void;
  /** Date e tempo necessario della sottofase. */
  onPianifica?: (id: string, piano: PianoSottofase) => void;
  /** Pesa le sottofasi per i loro giorni. */
  onPesa?: (pesi: Array<{ id: string; peso: number }>) => void;
  onElimina: (id: string) => void;
  className?: string;
}

/** I passi di una fase: spuntati, ne decidono l'avanzamento. */
export function SottofasiFase({
  nomeFase, sottofasi, avviata, puoModificare, puoSegnare, onSegna, onAggiungi, onRinomina, onPianifica, onPesa, onElimina, className,
}: SottofasiFaseProps) {
  const [nuova, setNuova] = useState("");
  const [aperta, setAperta] = useState(false);
  const [inModifica, setInModifica] = useState<string | null>(null);
  const [bozza, setBozza] = useState("");
  const [inPiano, setInPiano] = useState<string | null>(null);
  const { fatte, totale } = riepilogoSottofasi(sottofasi);
  const pesi = pesiDaGiorni(sottofasi);

  if (totale === 0 && !puoModificare) return null;

  // Una fase senza sottofasi resta com'era: solo un invito discreto a dividerla.
  if (totale === 0 && !aperta) {
    return (
      <Button type="button" variant="ghost" size="sm" className={cn("h-8 w-fit px-2 text-xs text-muted-foreground", className)} onClick={() => setAperta(true)}>
        <ListChecks className="mr-1 h-3.5 w-3.5" aria-hidden="true" />Dividi in sottofasi
      </Button>
    );
  }

  const aggiungi = () => {
    const nome = nuova.trim();
    if (!nome) return;
    onAggiungi(nome);
    setNuova("");
  };

  const conferma = (s: Sottofase) => {
    const nome = bozza.trim();
    setInModifica(null);
    if (nome && nome !== s.name) onRinomina(s.id, nome);
  };

  return (
    <section aria-label={`Sottofasi di ${nomeFase}`} className={cn("space-y-2", className)}>
      <div className="flex items-center justify-between gap-2">
        <h4 className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
          <ListChecks className="h-3.5 w-3.5" aria-hidden="true" />Sottofasi
        </h4>
        {totale > 0 && (
          <span className="text-xs tabular-nums text-muted-foreground">
            {fatte} di {totale} · {avanzamentoDaSottofasi(sottofasi)}%
          </span>
        )}
      </div>
      {totale > 0 && (
        <p className="text-xs text-muted-foreground">L'avanzamento di questa fase si calcola dalle sottofasi fatte.</p>
      )}
      {totale === 0 && avviata && (
        <p role="note" className="rounded-md bg-amber-50 px-2 py-1.5 text-xs text-amber-900">
          {avviata.chiusa
            ? "Questa fase è chiusa. Aggiungendo sottofasi da fare la riapri, finché non sono tutte fatte."
            : `Questa fase è già al ${avviata.percentuale}%. Dividendola in sottofasi, l'avanzamento si calcola da quelle fatte: segna subito quelle già completate.`}
        </p>
      )}
      <ul className="space-y-0.5">
        {sottofasi.map((s) => (
          <li key={s.id} className="flex min-h-9 flex-wrap items-center gap-2 rounded-md px-1">
            <Checkbox
              checked={s.fatta}
              disabled={!puoSegnare}
              onCheckedChange={(v) => onSegna(s.id, v === true)}
              aria-label={`${s.name}: ${s.fatta ? "fatta" : "da fare"}`}
            />
            {inModifica === s.id ? (
              <Input
                autoFocus
                value={bozza}
                aria-label={`Nome della sottofase ${s.name}`}
                onChange={(e) => setBozza(e.target.value)}
                onBlur={() => conferma(s)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") { e.preventDefault(); conferma(s); }
                  else if (e.key === "Escape") setInModifica(null);
                }}
                className="h-8 min-w-0 flex-1 text-sm"
              />
            ) : (
              <span className="min-w-0 flex-1 break-words text-sm">
                <span className={cn(s.fatta && "text-muted-foreground line-through")}>{s.name}</span>
                {testoPiano(s) && <span className="ml-2 whitespace-nowrap text-[11px] tabular-nums text-muted-foreground">{testoPiano(s)}</span>}
              </span>
            )}
            {puoModificare && inModifica !== s.id && (
              <>
                {onPianifica && (
                  <Button variant="ghost" size="icon" className={cn("h-7 w-7 text-muted-foreground", inPiano === s.id && "bg-slate-100")} aria-label={`Date e giorni di ${s.name}`}
                    aria-expanded={inPiano === s.id} onClick={() => setInPiano(inPiano === s.id ? null : s.id)}>
                    <CalendarDays className="h-3.5 w-3.5" />
                  </Button>
                )}
                <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground" aria-label={`Rinomina ${s.name}`}
                  onClick={() => { setBozza(s.name); setInModifica(s.id); }}>
                  <Pencil className="h-3.5 w-3.5" />
                </Button>
                <Button variant="ghost" size="icon" className="h-7 w-7 text-rose-600" aria-label={`Elimina ${s.name}`} onClick={() => onElimina(s.id)}>
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </>
            )}
            {inPiano === s.id && onPianifica && (
              <PianoRiga
                sottofase={s}
                onAnnulla={() => setInPiano(null)}
                onSalva={(piano) => { onPianifica(s.id, piano); setInPiano(null); }}
              />
            )}
          </li>
        ))}
      </ul>
      {puoModificare && onPesa && pesi.length > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-md bg-slate-50 px-2 py-1.5 text-xs text-muted-foreground">
          <span>Le sottofasi hanno tutte i giorni: una da 10 giorni può contare più di una da 1.</span>
          <Button size="sm" variant="outline" className="h-7" onClick={() => onPesa(pesi)}>
            <Scale className="mr-1 h-3.5 w-3.5" />Pesa per giorni
          </Button>
        </div>
      )}
      {puoModificare && (
        <div className="flex items-center gap-2">
          <Input
            value={nuova}
            onChange={(e) => setNuova(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); aggiungi(); } }}
            placeholder="Aggiungi una sottofase"
            aria-label={`Aggiungi una sottofase a ${nomeFase}`}
            className="h-8 min-w-0 flex-1 text-sm"
          />
          <Button size="sm" variant="outline" onClick={aggiungi} disabled={!nuova.trim()}>
            <Plus className="mr-1 h-4 w-4" />Aggiungi
          </Button>
        </div>
      )}
    </section>
  );
}

/** Inizio, fine e giorni di una sottofase. Inizio e giorni danno la fine; due date danno i giorni. */
function PianoRiga({ sottofase, onSalva, onAnnulla }: {
  sottofase: Sottofase;
  onSalva: (piano: PianoSottofase) => void;
  onAnnulla: () => void;
}) {
  const [inizio, setInizio] = useState(sottofase.data_inizio ?? "");
  const [fine, setFine] = useState(sottofase.data_fine ?? "");
  const [giorni, setGiorni] = useState(sottofase.giorni ? String(sottofase.giorni) : "");
  const n = Number(giorni);
  const giorniOk = giorni === "" || (Number.isInteger(n) && n >= 1 && n <= 3650);
  const invertite = !!inizio && !!fine && fine < inizio;

  const cambiaGiorni = (v: string) => {
    setGiorni(v);
    const g = Number(v);
    if (inizio && Number.isInteger(g) && g >= 1 && g <= 3650) setFine(fineDaGiorni(inizio, g));
  };
  const cambiaFine = (v: string) => {
    setFine(v);
    if (inizio && v && v >= inizio && !giorni) setGiorni(String(giorniFinestra(inizio, v)));
  };

  return (
    <div className="flex basis-full flex-wrap items-end gap-2 pb-1 pl-6">
      <label className="grid gap-0.5 text-[11px] text-muted-foreground">Inizio
        <Input type="date" value={inizio} onChange={(e) => setInizio(e.target.value)} className="h-8 w-36 text-sm" aria-label={`Inizio di ${sottofase.name}`} />
      </label>
      <label className="grid gap-0.5 text-[11px] text-muted-foreground">Fine
        <Input type="date" value={fine} min={inizio || undefined} onChange={(e) => cambiaFine(e.target.value)} className="h-8 w-36 text-sm" aria-label={`Fine di ${sottofase.name}`} />
      </label>
      <label className="grid gap-0.5 text-[11px] text-muted-foreground">Giorni necessari
        <Input type="number" inputMode="numeric" min={1} max={3650} value={giorni} onChange={(e) => cambiaGiorni(e.target.value)} className="h-8 w-24 text-sm" aria-label={`Giorni necessari per ${sottofase.name}`} />
      </label>
      <Button size="sm" className="h-8" disabled={!giorniOk || invertite}
        onClick={() => onSalva({ data_inizio: inizio || null, data_fine: fine || null, giorni: giorni ? n : null })}>Salva</Button>
      <Button size="sm" variant="ghost" className="h-8" onClick={onAnnulla}>Annulla</Button>
      {invertite && <p role="alert" className="basis-full text-xs text-rose-700">La fine è prima dell'inizio.</p>}
      <p className="basis-full text-[11px] text-muted-foreground">Se la sottofase esce dalle date della fase, la fase si allunga per contenerla.</p>
    </div>
  );
}
