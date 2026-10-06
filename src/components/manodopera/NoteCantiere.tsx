/**
 * Note per gli operai (26/09/2026): istruzioni dell'ufficio che chi lavora
 * vede nell'app di cantiere. Su tutta la commessa o su una fase; per tutti,
 * per una squadra o per una persona; «importante» le mette in cima. Sotto
 * ogni nota: chi l'ha già letta nell'app.
 */
import { useEffect, useMemo, useState } from "react";
import { AZIONE_TENUE } from "@/lib/manodopera/colori";
import { AlertTriangle, Check, Loader2, MessageSquarePlus, MoreHorizontal, Pencil, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import {
  messaggioErroreOperai, useEliminaNota, useNoteCantiere, useSalvaNota, useSquadre, useSquadreCommessa,
  type NotaCantiere, type PerChiNota,
} from "@/hooks/useOperai";
import { cn } from "@/lib/utils";

function quando(iso: string): string {
  return new Date(iso).toLocaleDateString("it-IT", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
}

function PerChi({ n }: { n: NotaCantiere }) {
  if (n.per === "squadra") {
    return (
      <span className="inline-flex items-center gap-1">
        <span className="h-2 w-2 rounded-full" style={{ backgroundColor: n.squadra_colore ?? "#94A3B8" }} aria-hidden="true" />
        {n.squadra ?? "Squadra"}
      </span>
    );
  }
  if (n.per === "persona") return <span>{n.persona ?? "Una persona"}</span>;
  return <span>Tutti</span>;
}

export function NoteCantiere({
  orderId,
  phaseId = null,
  fasi,
  modificabile,
  compatta = false,
}: {
  orderId: string;
  /** null = le note di tutta la commessa; un id = le note di quella fase. */
  phaseId?: string | null;
  fasi: { id: string; name: string }[];
  modificabile: boolean;
  /** Dentro una fase: niente titolo, bottone piccolo. */
  compatta?: boolean;
}) {
  const { data = [], isLoading, error } = useNoteCantiere(orderId);
  const elimina = useEliminaNota(orderId);
  const [aperta, setAperta] = useState<NotaCantiere | "nuova" | null>(null);

  const note = useMemo(() => data.filter((n) => (n.phase_id ?? null) === phaseId), [data, phaseId]);

  if (error) return null;

  return (
    <div className="space-y-2">
      {isLoading ? (
        <p className="text-xs text-muted-foreground">Carico le note…</p>
      ) : note.length === 0 ? (
        !compatta && (
          <p className="text-sm text-muted-foreground">
            Nessuna nota. Scrivi qui le istruzioni per chi lavora: le legge nell'app di cantiere.
          </p>
        )
      ) : (
        <ul className="space-y-2">
          {note.map((n) => (
            <li
              key={n.id}
              className={cn(
                "rounded-xl border px-3 py-2.5 text-sm",
                n.importante ? "border-amber-300 bg-amber-50" : "bg-white",
              )}
            >
              <div className="flex items-start justify-between gap-2">
                <p className="min-w-0 whitespace-pre-wrap text-slate-800">
                  {n.importante && <AlertTriangle className="mr-1 inline h-3.5 w-3.5 text-amber-600" aria-label="Importante" />}
                  {n.testo}
                </p>
                {modificabile && (
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button size="icon" variant="ghost" className="tap-compact -mr-1 -mt-1 h-7 w-7 shrink-0" aria-label="Modifica o elimina la nota">
                        <MoreHorizontal className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onSelect={() => setAperta(n)}><Pencil className="mr-2 h-4 w-4" />Modifica</DropdownMenuItem>
                      <DropdownMenuItem
                        className="text-red-600 focus:text-red-700"
                        onSelect={() => elimina.mutate(n.id, {
                          onSuccess: () => toast.success("Nota eliminata"),
                          onError: (err) => toast.error(messaggioErroreOperai(err, "Non sono riuscito a eliminarla.")),
                        })}
                      >
                        <Trash2 className="mr-2 h-4 w-4" />Elimina
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                )}
              </div>
              <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-muted-foreground">
                <span className="font-medium text-slate-600">Per: <PerChi n={n} /></span>
                <span>· {n.autore ?? "Ufficio"}, {quando(n.creata_il)}{n.modificata_il && " (modificata)"}</span>
                <Letture n={n} />
              </p>
            </li>
          ))}
        </ul>
      )}
      {modificabile && (
        <Button
          size="sm"
          variant="outline"
          className={cn("gap-1.5", AZIONE_TENUE.nota, compatta && "tap-compact h-8 rounded-full px-3")}
          onClick={() => setAperta("nuova")}
        >
          <MessageSquarePlus className="h-4 w-4" aria-hidden="true" />
          {compatta ? "Nota per gli operai" : "Scrivi una nota"}
        </Button>
      )}
      {aperta && (
        <NotaDialog
          orderId={orderId}
          nota={aperta === "nuova" ? null : aperta}
          faseIniziale={phaseId}
          fasi={fasi}
          onChiudi={() => setAperta(null)}
        />
      )}
    </div>
  );
}

function Letture({ n }: { n: NotaCantiere }) {
  if (n.destinatari === 0) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <span className="cursor-help">· nessuno la vede ancora nell'app</span>
        </TooltipTrigger>
        <TooltipContent className="max-w-xs">
          La vedrà chi ha l'app di cantiere e lavora qui (con la squadra o con l'accesso al cantiere).
        </TooltipContent>
      </Tooltip>
    );
  }
  const lette = n.letta_da.length;
  const testo = lette === 0 ? `· non ancora letta (${n.destinatari})` : `· letta da ${lette} su ${Math.max(lette, n.destinatari)}`;
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className={cn("inline-flex cursor-help items-center gap-1", lette > 0 && lette >= n.destinatari && "text-emerald-700")}>
          {lette > 0 && lette >= n.destinatari && <Check className="h-3 w-3" aria-hidden="true" />}
          {testo}
        </span>
      </TooltipTrigger>
      <TooltipContent className="max-w-xs">
        {lette === 0 ? "Nessuno l'ha ancora aperta nell'app." : n.letta_da.map((l) => `${l.nome}, ${quando(l.il)}`).join(" · ")}
      </TooltipContent>
    </Tooltip>
  );
}

const TUTTA = "__tutta__";

function NotaDialog({
  orderId,
  nota,
  faseIniziale,
  fasi,
  onChiudi,
}: {
  orderId: string;
  nota: NotaCantiere | null;
  faseIniziale: string | null;
  fasi: { id: string; name: string }[];
  onChiudi: () => void;
}) {
  const salva = useSalvaNota(orderId);
  const { data: squadreQui = [] } = useSquadreCommessa(orderId);
  const { data: tutteLeSquadre = [] } = useSquadre();
  const [testo, setTesto] = useState(nota?.testo ?? "");
  const [per, setPer] = useState<PerChiNota>(nota?.per ?? "tutti");
  const [squadra, setSquadra] = useState<string>(nota?.squadra_id ?? "");
  const [persona, setPersona] = useState<string>(nota?.hr_profilo_id ?? "");
  const [fase, setFase] = useState<string>(nota ? (nota.phase_id ?? TUTTA) : (faseIniziale ?? TUTTA));
  const [importante, setImportante] = useState(nota?.importante ?? false);

  // Le squadre di questa commessa prima; le altre dopo.
  const idQui = new Set(squadreQui.map((s) => s.squadra_id));
  const squadreQuiUniche = [...new Map(squadreQui.map((s) => [s.squadra_id, { id: s.squadra_id, nome: s.nome, colore: s.colore }])).values()];
  const altreSquadre = tutteLeSquadre.filter((s) => !idQui.has(s.id));
  // Le persone che lavorano qui: componenti e responsabili delle squadre della commessa.
  const persone = useMemo(() => {
    const m = new Map<string, string>();
    for (const s of squadreQui) {
      for (const c of s.componenti) m.set(c.id, `${c.nome} ${c.cognome}`);
      if (s.responsabile) m.set(s.responsabile.id, `${s.responsabile.nome} ${s.responsabile.cognome}`);
    }
    if (nota?.hr_profilo_id && nota.persona && !m.has(nota.hr_profilo_id)) m.set(nota.hr_profilo_id, nota.persona);
    return [...m.entries()].sort((a, b) => a[1].localeCompare(b[1], "it"));
  }, [squadreQui, nota]);

  useEffect(() => {
    if (per === "squadra" && !squadra && squadreQuiUniche.length === 1) setSquadra(squadreQuiUniche[0].id);
  }, [per, squadra, squadreQuiUniche]);

  const invia = () => {
    if (!testo.trim()) { toast.error("Scrivi il testo della nota."); return; }
    if (per === "squadra" && !squadra) { toast.error("Scegli la squadra."); return; }
    if (per === "persona" && !persona) { toast.error("Scegli la persona."); return; }
    salva.mutate(
      {
        id: nota?.id ?? null,
        dati: {
          testo: testo.trim(),
          per,
          squadra_id: per === "squadra" ? squadra : null,
          hr_profilo_id: per === "persona" ? persona : null,
          phase_id: fase === TUTTA ? null : fase,
          importante,
        },
      },
      {
        onSuccess: () => {
          toast.success(nota ? "Nota aggiornata" : "Nota inviata: la vedono nell'app");
          onChiudi();
        },
        onError: (err) => toast.error(messaggioErroreOperai(err, "Non sono riuscito a salvare la nota. Riprova tra qualche secondo.")),
      },
    );
  };

  return (
    <Dialog open onOpenChange={(o) => { if (!o && !salva.isPending) onChiudi(); }}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{nota ? "Modifica la nota" : "Nota per gli operai"}</DialogTitle>
          <DialogDescription>
            La leggono nell'app di cantiere, aprendo questo lavoro. {nota ? "" : "Arriva anche come avviso sul telefono."}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="nota-testo">Cosa devono sapere</Label>
            <Textarea
              id="nota-testo"
              value={testo}
              onChange={(e) => setTesto(e.target.value)}
              rows={4}
              maxLength={2000}
              autoFocus
              placeholder="Es. Le chiavi sono dal portiere dalle 7:30. Proteggere il parquet del corridoio."
            />
          </div>

          <div className="space-y-1.5">
            <span className="text-sm font-medium" id="nota-per">Per chi</span>
            <div role="radiogroup" aria-labelledby="nota-per" className="grid grid-cols-3 gap-1.5">
              {([["tutti", "Tutti"], ["squadra", "Una squadra"], ["persona", "Una persona"]] as const).map(([v, l]) => (
                <button
                  key={v}
                  type="button"
                  role="radio"
                  aria-checked={per === v}
                  onClick={() => setPer(v)}
                  className={cn(
                    "rounded-lg border px-2 py-2 text-sm transition-colors",
                    per === v ? "border-orange-400 bg-orange-50 font-medium text-orange-800" : "border-slate-200 hover:bg-slate-50",
                  )}
                >
                  {l}
                </button>
              ))}
            </div>
            {per === "tutti" && <p className="text-xs text-muted-foreground">Tutti quelli che lavorano su questa commessa.</p>}
          </div>

          {per === "squadra" && (
            <div className="space-y-1.5">
              <Label htmlFor="nota-squadra">Squadra</Label>
              <Select value={squadra} onValueChange={setSquadra}>
                <SelectTrigger id="nota-squadra"><SelectValue placeholder="Scegli la squadra" /></SelectTrigger>
                <SelectContent>
                  {squadreQuiUniche.length > 0 && (
                    <SelectGroup>
                      <SelectLabel>Su questa commessa</SelectLabel>
                      {squadreQuiUniche.map((s) => <SelectItem key={s.id} value={s.id}>{s.nome}</SelectItem>)}
                    </SelectGroup>
                  )}
                  {altreSquadre.length > 0 && (
                    <SelectGroup>
                      <SelectLabel>Altre squadre</SelectLabel>
                      {altreSquadre.map((s) => <SelectItem key={s.id} value={s.id}>{s.nome}</SelectItem>)}
                    </SelectGroup>
                  )}
                </SelectContent>
              </Select>
            </div>
          )}

          {per === "persona" && (
            <div className="space-y-1.5">
              <Label htmlFor="nota-persona">Persona</Label>
              {persone.length === 0 ? (
                <p className="rounded-lg border border-dashed px-3 py-2 text-sm text-muted-foreground">
                  Metti prima una squadra sulla commessa: qui si sceglie fra chi ci lavora.
                </p>
              ) : (
                <Select value={persona} onValueChange={setPersona}>
                  <SelectTrigger id="nota-persona"><SelectValue placeholder="Scegli la persona" /></SelectTrigger>
                  <SelectContent>
                    {persone.map(([id, nome]) => <SelectItem key={id} value={id}>{nome}</SelectItem>)}
                  </SelectContent>
                </Select>
              )}
            </div>
          )}

          {fasi.length > 0 && (
            <div className="space-y-1.5">
              <Label htmlFor="nota-fase">Riguarda</Label>
              <Select value={fase} onValueChange={setFase}>
                <SelectTrigger id="nota-fase"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={TUTTA}>Tutta la commessa</SelectItem>
                  {fasi.map((f) => <SelectItem key={f.id} value={f.id}>Fase: {f.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          )}

          <label htmlFor="nota-importante" className="flex cursor-pointer items-center gap-2.5 text-sm">
            <Checkbox id="nota-importante" checked={importante} onCheckedChange={(v) => setImportante(v === true)} />
            Importante: la mettiamo in cima, evidenziata
          </label>
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="outline" onClick={onChiudi} disabled={salva.isPending}>Annulla</Button>
          <Button onClick={invia} disabled={salva.isPending} className="gap-1.5 bg-gradient-to-r from-orange-500 to-eic-amber-strong text-white hover:from-orange-600 hover:to-amber-600">
            {salva.isPending && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
            {nota ? "Salva" : "Invia la nota"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
