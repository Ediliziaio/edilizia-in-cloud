// src/components/orders/AssegnazioniFasi.tsx
// Chi fa cosa: si scelgono squadre, persone e ditte e valgono per tutte le fasi indicate. Le sottofasi seguono la fase.
import { useState } from "react";
import { Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";

export interface Opzione { id: string; nome: string }

function Scelta({ titolo, opzioni, scelte, onCambia, testo }: {
  titolo: string; opzioni: ReadonlyArray<Opzione>; scelte: ReadonlySet<string>; onCambia: (s: ReadonlySet<string>) => void; testo: string;
}) {
  const q = testo.trim().toLocaleLowerCase("it-IT");
  const viste = q ? opzioni.filter((o) => o.nome.toLocaleLowerCase("it-IT").includes(q)) : opzioni;
  return (
    <fieldset className="min-w-0 space-y-1">
      <legend className="text-xs font-semibold">{titolo}{scelte.size > 0 ? ` · ${scelte.size}` : ""}</legend>
      <div className="max-h-56 space-y-0.5 overflow-y-auto rounded-md border p-1.5">
        {viste.length === 0 && <p className="p-1 text-xs text-muted-foreground">Nessuno</p>}
        {viste.map((o) => (
          <label key={o.id} className="flex cursor-pointer items-center gap-2 rounded px-1 py-0.5 text-xs hover:bg-muted">
            <Checkbox
              checked={scelte.has(o.id)}
              onCheckedChange={() => {
                const nuove = new Set(scelte);
                if (nuove.has(o.id)) nuove.delete(o.id); else nuove.add(o.id);
                onCambia(nuove);
              }}
              aria-label={o.nome}
            />
            <span className="min-w-0 truncate" title={o.nome}>{o.nome}</span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}

export function DialogAssegna({ fasi, squadre, persone, ditte, puoSquadre, puoPersoneDitte, inCorso, onChiudi, onAssegna }: {
  /** I nomi delle fasi scelte; null a finestra chiusa. */
  fasi: ReadonlyArray<string> | null;
  squadre: ReadonlyArray<Opzione>;
  persone: ReadonlyArray<Opzione>;
  ditte: ReadonlyArray<Opzione>;
  /** Squadre: chi modifica le commesse o gli operai. */
  puoSquadre: boolean;
  /** Persone e ditte: chi modifica le commesse. */
  puoPersoneDitte: boolean;
  inCorso: boolean;
  onChiudi: () => void;
  onAssegna: (scelte: { squadre: string[]; persone: string[]; ditte: string[] }, fatto: () => void) => void;
}) {
  const [cerca, setCerca] = useState("");
  const [sSquadre, setSSquadre] = useState<ReadonlySet<string>>(new Set());
  const [sPersone, setSPersone] = useState<ReadonlySet<string>>(new Set());
  const [sDitte, setSDitte] = useState<ReadonlySet<string>>(new Set());
  const azzera = () => { setCerca(""); setSSquadre(new Set()); setSPersone(new Set()); setSDitte(new Set()); };
  const chiudi = () => { azzera(); onChiudi(); };
  const n = fasi?.length ?? 0;

  return (
    <Dialog open={!!fasi} onOpenChange={(a) => { if (!a && !inCorso) chiudi(); }}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>Chi fa {n === 1 ? fasi![0] : `${n} fasi`}</DialogTitle>
        </DialogHeader>
        {n > 1 && <p className="line-clamp-2 text-xs text-muted-foreground">{fasi!.join(", ")}</p>}
        <div className="relative">
          <Search className="absolute left-2.5 top-2 h-3.5 w-3.5 text-muted-foreground" aria-hidden="true" />
          <Input value={cerca} onChange={(e) => setCerca(e.target.value)} placeholder="Cerca un nome…" aria-label="Cerca tra squadre, persone e ditte" className="h-8 pl-8" />
        </div>
        <div className="grid gap-3 sm:grid-cols-3">
          {puoSquadre && <Scelta titolo="Squadre" opzioni={squadre} scelte={sSquadre} onCambia={setSSquadre} testo={cerca} />}
          {puoPersoneDitte && <Scelta titolo="Persone" opzioni={persone} scelte={sPersone} onCambia={setSPersone} testo={cerca} />}
          {puoPersoneDitte && <Scelta titolo="Ditte" opzioni={ditte} scelte={sDitte} onCambia={setSDitte} testo={cerca} />}
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" disabled={inCorso} onClick={chiudi}>Annulla</Button>
          <Button
            type="button"
            disabled={inCorso || sSquadre.size + sPersone.size + sDitte.size === 0}
            onClick={() => onAssegna({ squadre: [...sSquadre], persone: [...sPersone], ditte: [...sDitte] }, azzera)}
          >
            Assegna
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
