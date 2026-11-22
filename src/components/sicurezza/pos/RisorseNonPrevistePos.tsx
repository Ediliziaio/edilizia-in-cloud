import { useState } from "react";
import { ListChecks } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import type { Lavorazione } from "../../../../supabase/functions/_shared/posModello";
import type { Modifica } from "./PosSezioni";

const RISORSE = [
  { campo: "sostanze", titolo: "Sostanze e preparati pericolosi", assenza: "Nessuna" },
  { campo: "opere_provvisionali", titolo: "Opere provvisionali", assenza: "Nessuna" },
  { campo: "macchine", titolo: "Macchine e attrezzature", assenza: "Nessuna" },
  { campo: "impianti", titolo: "Impianti", assenza: "Nessuno" },
] as const;

type Risorsa = typeof RISORSE[number];
const compilabile = (l: Lavorazione, risorsa: Risorsa) => !l[risorsa.campo].trim() && (
  risorsa.campo === "sostanze" ? !l.prodotti?.length
    : !l.tecnica?.attrezzature.length && l.tecnica?.attrezzature_previste !== "si"
);

export function RisorseNonPrevistePos({ lavorazioni, modifica }: { lavorazioni: Lavorazione[]; modifica: Modifica }) {
  const [aperto, setAperto] = useState(false);
  const candidati = lavorazioni.filter(l => RISORSE.some(r => compilabile(l, r)));
  if (!candidati.length && !aperto) return null;
  return <Dialog open={aperto} onOpenChange={setAperto}>
    <DialogTrigger asChild>
      <Button type="button" size="sm" variant="outline"><ListChecks className="size-4" aria-hidden /> Risorse non previste</Button>
    </DialogTrigger>
    {aperto && <SceltaRisorse lavorazioni={candidati} modifica={modifica} chiudi={() => setAperto(false)} />}
  </Dialog>;
}

function SceltaRisorse({ lavorazioni, modifica, chiudi }: {
  lavorazioni: Lavorazione[]; modifica: Modifica; chiudi: () => void;
}) {
  const [schede, setSchede] = useState<string[]>([]);
  const [campi, setCampi] = useState<Risorsa["campo"][]>([]);
  const selezionate = lavorazioni.filter(l => schede.includes(l.id));
  const campiScelti = RISORSE.filter(r => campi.includes(r.campo));
  const totale = selezionate.reduce((n, l) => n + campiScelti.filter(r => compilabile(l, r)).length, 0);

  function applica() {
    if (!totale) return;
    modifica(d => {
      for (const l of d.lavorazioni) {
        if (!schede.includes(l.id)) continue;
        for (const r of campiScelti) {
          if (!compilabile(l, r)) continue;
          l[r.campo] = r.assenza;
          if (l.origine !== "utente") l.verificata = false;
          if (r.campo === "sostanze") l.prodotti_riesaminati = false;
        }
      }
    });
    chiudi();
  }

  return <DialogContent className="flex max-h-[90dvh] max-w-2xl flex-col gap-3 overflow-y-auto">
    <DialogHeader>
      <DialogTitle>Dichiara le risorse non previste</DialogTitle>
      <DialogDescription>Seleziona le lavorazioni e indica quali risorse hai verificato che non sono previste. Si compilano solo i campi vuoti compatibili con quanto già registrato.</DialogDescription>
    </DialogHeader>
    <div className="grid gap-4 sm:grid-cols-2">
      <fieldset className="min-w-0 space-y-2 rounded-md border p-3">
        <legend className="px-1 text-sm font-medium">Lavorazioni</legend>
        {lavorazioni.length > 1 && <Button type="button" size="sm" variant="ghost" className="h-7 px-1 text-xs"
          onClick={() => setSchede(selezionate.length === lavorazioni.length ? [] : lavorazioni.map(l => l.id))}>
          {selezionate.length === lavorazioni.length ? "Deseleziona tutte" : "Seleziona tutte le lavorazioni"}
        </Button>}
        <div className="max-h-56 space-y-2 overflow-y-auto">
          {lavorazioni.map((l, i) => <label className="flex items-start gap-2 text-sm" key={l.id}>
            <Checkbox className="mt-0.5 shrink-0" checked={schede.includes(l.id)}
              onCheckedChange={v => setSchede(prev => v === true ? [...prev, l.id] : prev.filter(id => id !== l.id))} />
            <span className="min-w-0 break-words">{l.titolo.trim() || `Lavorazione ${i + 1}`}</span>
          </label>)}
        </div>
      </fieldset>
      <fieldset className="min-w-0 space-y-2 rounded-md border p-3">
        <legend className="px-1 text-sm font-medium">Risorse assenti</legend>
        {RISORSE.map(r => <label key={r.campo} className="flex items-start gap-2 text-sm">
          <Checkbox className="mt-0.5 shrink-0" checked={campi.includes(r.campo)}
            onCheckedChange={v => setCampi(prev => v === true ? [...prev, r.campo] : prev.filter(c => c !== r.campo))} />
          {r.titolo}
        </label>)}
      </fieldset>
    </div>
    {selezionate.length > 0 && campiScelti.length > 0 && totale === 0 &&
      <p role="status" className="text-sm text-muted-foreground">I campi scelti sono già compilati o hanno risorse collegate.</p>}
    <DialogFooter>
      <Button type="button" variant="outline" onClick={chiudi}>Annulla</Button>
      <Button type="button" disabled={totale === 0} onClick={applica}>{totale === 1 ? "Compila 1 campo" : `Compila ${totale} campi`}</Button>
    </DialogFooter>
  </DialogContent>;
}
