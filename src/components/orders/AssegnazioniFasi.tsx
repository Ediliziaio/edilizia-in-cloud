// src/components/orders/AssegnazioniFasi.tsx
// Chi fa cosa, una riga per fase: si scelgono le fasi e si assegna tutto insieme. Le sottofasi seguono la fase.
import { useMemo, useState } from "react";
import { Search, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { useAssegnaAlleFasi, type ScelteAssegnazione } from "@/hooks/useAssegnaAlleFasi";
import { useSquadre } from "@/hooks/useOperai";
import { cn } from "@/lib/utils";

export interface Opzione { id: string; nome: string }

export interface FaseAssegnazioni {
  id: string;
  nome: string;
  percentuale: number;
  squadre: string[];
  persone: string[];
  ditte: string[];
  mezzi: string[];
  articoli: number;
}

/** Una fase è da assegnare se non c'è nessuno a farla e non è già finita. */
export const faseDaAssegnare = (f: FaseAssegnazioni) =>
  f.percentuale < 100 && f.squadre.length + f.persone.length + f.ditte.length === 0;

const COLONNE = "sm:grid-cols-[1.75rem_minmax(0,1.5fr)_3rem_minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)_4rem]";

function Nomi({ nomi }: { nomi: string[] }) {
  if (nomi.length === 0) return <span className="text-muted-foreground">—</span>;
  const testo = nomi.join(", ");
  return <span className="block truncate" title={testo}>{testo}</span>;
}

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

interface Props {
  fasi: ReadonlyArray<FaseAssegnazioni>;
  squadre: ReadonlyArray<Opzione>;
  persone: ReadonlyArray<Opzione>;
  ditte: ReadonlyArray<Opzione>;
  /** Squadre: chi modifica le commesse o gli operai. */
  puoSquadre: boolean;
  /** Persone e ditte: chi modifica le commesse. */
  puoPersoneDitte: boolean;
  articoliSenzaFase: number;
  inCorso: boolean;
  onAssegna: (scelte: ScelteAssegnazione, fatto: () => void) => void;
  /** Mezzi, articoli, costi e togliere qualcuno restano nella scheda della fase. */
  onApriScheda: (faseId: string) => void;
}

export function AssegnazioniFasi({ fasi, squadre, persone, ditte, puoSquadre, puoPersoneDitte, articoliSenzaFase, inCorso, onAssegna, onApriScheda }: Props) {
  const [scelte, setScelte] = useState<ReadonlySet<string>>(new Set());
  const [soloVuote, setSoloVuote] = useState(false);
  const [aperto, setAperto] = useState(false);
  const [cerca, setCerca] = useState("");
  const [sSquadre, setSSquadre] = useState<ReadonlySet<string>>(new Set());
  const [sPersone, setSPersone] = useState<ReadonlySet<string>>(new Set());
  const [sDitte, setSDitte] = useState<ReadonlySet<string>>(new Set());

  const daAssegnare = useMemo(() => fasi.filter(faseDaAssegnare).length, [fasi]);
  const righe = soloVuote ? fasi.filter(faseDaAssegnare) : fasi;
  const puo = puoSquadre || puoPersoneDitte;
  const selezionate = righe.filter((f) => scelte.has(f.id));
  const tutte = righe.length > 0 && selezionate.length === righe.length;
  const niente = sSquadre.size + sPersone.size + sDitte.size === 0;

  const inverti = (id: string) => setScelte((ora) => {
    const nuove = new Set(ora);
    if (nuove.has(id)) nuove.delete(id); else nuove.add(id);
    return nuove;
  });
  const chiudi = () => {
    setAperto(false);
    setCerca("");
    setSSquadre(new Set());
    setSPersone(new Set());
    setSDitte(new Set());
  };

  return (
    <section aria-label="Assegnazioni delle fasi" className="space-y-1.5">
      <div className="flex flex-wrap items-center gap-1.5">
        <Button type="button" size="sm" variant={!soloVuote ? "secondary" : "ghost"} className="h-6 px-2 text-xs" aria-pressed={!soloVuote} onClick={() => { setSoloVuote(false); setScelte(new Set()); }}>
          Tutte <span className="ml-1 tabular-nums text-muted-foreground">{fasi.length}</span>
        </Button>
        <Button type="button" size="sm" variant={soloVuote ? "secondary" : "ghost"} className="h-6 px-2 text-xs" aria-pressed={soloVuote} onClick={() => { setSoloVuote(true); setScelte(new Set()); }}>
          Da assegnare <span className="ml-1 tabular-nums text-muted-foreground">{daAssegnare}</span>
        </Button>
        {puo && righe.length > 0 && (
          <Button type="button" size="sm" variant="ghost" className="h-6 px-2 text-xs sm:hidden" onClick={() => setScelte(tutte ? new Set() : new Set(righe.map((f) => f.id)))}>{tutte ? "Togli tutte" : "Scegli tutte"}</Button>
        )}
        {puo && (
          <Button type="button" size="sm" className="ml-auto h-7 gap-1 px-2.5 text-xs" disabled={selezionate.length === 0} onClick={() => setAperto(true)}>
            <Users className="h-3.5 w-3.5" aria-hidden="true" />
            {selezionate.length === 0 ? "Scegli le fasi" : `Assegna a ${selezionate.length} ${selezionate.length === 1 ? "fase" : "fasi"}`}
          </Button>
        )}
      </div>

      <div className="overflow-hidden rounded-lg border">
        <div className={cn("hidden gap-x-2 border-b bg-muted px-2 py-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground sm:grid", COLONNE)}>
          <div className="flex items-center">{puo && <Checkbox checked={tutte} onCheckedChange={() => setScelte(tutte ? new Set() : new Set(righe.map((f) => f.id)))} aria-label="Seleziona tutte le fasi" />}</div>
          <div>Fase</div><div className="text-right">%</div><div>Squadre</div><div>Persone</div><div>Ditte</div><div>Mezzi</div><div className="text-right">Articoli</div>
        </div>
        {righe.length === 0 && <p role="status" className="p-6 text-center text-sm text-muted-foreground">Tutte le fasi hanno qualcuno che le fa.</p>}
        {righe.map((f) => (
          <div key={f.id} className={cn("grid grid-cols-[1.5rem_minmax(0,1fr)] gap-x-2 gap-y-0.5 border-b px-2 py-1 text-xs last:border-b-0", COLONNE)}>
            <div className="flex items-center">{puo && <Checkbox checked={scelte.has(f.id)} onCheckedChange={() => inverti(f.id)} aria-label={`Seleziona ${f.nome}`} />}</div>
            <button type="button" onClick={() => onApriScheda(f.id)} title={`Apri la scheda di ${f.nome}`} className={cn("min-w-0 truncate rounded text-left font-medium hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring", faseDaAssegnare(f) && "text-amber-700")}>{f.nome}</button>
            <div className="col-start-2 truncate text-muted-foreground sm:hidden">{[`${f.percentuale}%`, ...f.squadre, ...f.persone, ...f.ditte, ...f.mezzi, f.articoli ? `${f.articoli} articoli` : null].filter(Boolean).join(" · ")}</div>
            <div className="hidden text-right tabular-nums text-muted-foreground sm:block">{f.percentuale}%</div>
            <div className="hidden min-w-0 sm:block"><Nomi nomi={f.squadre} /></div>
            <div className="hidden min-w-0 sm:block"><Nomi nomi={f.persone} /></div>
            <div className="hidden min-w-0 sm:block"><Nomi nomi={f.ditte} /></div>
            <div className="hidden min-w-0 sm:block"><Nomi nomi={f.mezzi} /></div>
            <div className="hidden text-right tabular-nums sm:block">{f.articoli || "—"}</div>
          </div>
        ))}
      </div>
      {articoliSenzaFase > 0 && <p className="text-[11px] text-amber-700">{articoliSenzaFase} {articoliSenzaFase === 1 ? "articolo senza fase" : "articoli senza fase"}</p>}

      <Dialog open={aperto} onOpenChange={(a) => { if (!a) chiudi(); }}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle>Assegna a {selezionate.length} {selezionate.length === 1 ? "fase" : "fasi"}</DialogTitle>
          </DialogHeader>
          <p className="line-clamp-2 text-xs text-muted-foreground">{selezionate.map((f) => f.nome).join(", ")}</p>
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
            <Button type="button" variant="outline" onClick={chiudi}>Annulla</Button>
            <Button
              type="button"
              disabled={niente || inCorso}
              onClick={() => onAssegna(
                { fasi: selezionate.map((f) => f.id), squadre: [...sSquadre], persone: [...sPersone], ditte: [...sDitte] },
                () => { chiudi(); setScelte(new Set()); },
              )}
            >
              Assegna
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}

/** La vista con i suoi dati: squadre dell'azienda e assegnazione in blocco. */
export function AssegnazioniFasiCommessa({ orderId, ...resto }: { orderId: string } & Omit<Props, "squadre" | "inCorso" | "onAssegna">) {
  const assegna = useAssegnaAlleFasi(orderId);
  const { data: squadre = [] } = useSquadre(resto.puoSquadre);
  return (
    <AssegnazioniFasi
      {...resto}
      squadre={squadre.map((s) => ({ id: s.id, nome: s.nome }))}
      inCorso={assegna.isPending}
      onAssegna={(scelte, fatto) => assegna.mutate(scelte, { onSuccess: fatto })}
    />
  );
}
