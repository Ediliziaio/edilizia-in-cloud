/**
 * Figure della sicurezza dell'impresa: datore di lavoro, direttore tecnico,
 * capocantiere, RSPP, medico competente, RLS o RLST, addetti antincendio e
 * primo soccorso. Si scrivono una volta; ogni POS nuovo le riprende e le
 * mansioni di sicurezza diventano la lettera b) dell'Allegato XV.
 */
import { useState } from "react";
import { AlertTriangle, Loader2, Pencil, Plus, Trash2, UserCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { usePermissions } from "@/hooks/usePermissions";
import {
  useEliminaFigura, useFigureSicurezza, useSalvaFigura, type FiguraInput, type FiguraSicurezza, type RuoloFigura,
} from "@/hooks/usePos";
import { MANSIONI_PREDEFINITE } from "../../../supabase/functions/_shared/posModello";

const RUOLI: Array<{ value: RuoloFigura; label: string; obbligatoria: boolean }> = [
  { value: "datore_lavoro", label: "Datore di lavoro", obbligatoria: true },
  { value: "direttore_tecnico", label: "Direttore tecnico di cantiere", obbligatoria: true },
  { value: "capocantiere", label: "Capocantiere", obbligatoria: true },
  { value: "rspp", label: "RSPP", obbligatoria: true },
  { value: "medico_competente", label: "Medico competente", obbligatoria: true },
  { value: "rls", label: "RLS aziendale", obbligatoria: false },
  { value: "rlst", label: "RLST territoriale", obbligatoria: false },
  { value: "addetto_antincendio", label: "Addetto antincendio ed evacuazione", obbligatoria: true },
  { value: "addetto_primo_soccorso", label: "Addetto al primo soccorso", obbligatoria: true },
  { value: "dirigente", label: "Dirigente", obbligatoria: false },
  { value: "preposto", label: "Preposto", obbligatoria: false },
];
const labelRuolo = (r: string) => RUOLI.find((x) => x.value === r)?.label ?? r;

const vuota = (ruolo: RuoloFigura): FiguraInput => ({
  ruolo, nominativo: "", hr_profilo_id: null, esterno: false, telefono: "", email: "",
  mansioni_sicurezza: MANSIONI_PREDEFINITE[ruolo] ?? "", attestato: "", scadenza: null, note: "",
});

export function FigureSicurezzaTab() {
  const perms = usePermissions();
  const puoScrivere = (perms.canViewSicurezzaCantiere || perms.isAdmin) && !perms.solaLettura;
  const { data: figure = [], isLoading, isError, refetch } = useFigureSicurezza();
  const salva = useSalvaFigura();
  const elimina = useEliminaFigura();
  const [modulo, setModulo] = useState<FiguraInput | null>(null);
  const [daTogliere, setDaTogliere] = useState<FiguraSicurezza | null>(null);

  const presenti = new Set(figure.map((f) => f.ruolo));
  const haRls = presenti.has("rls") || presenti.has("rlst");
  const mancano = RUOLI.filter((r) => r.obbligatoria && !presenti.has(r.value)).map((r) => r.label);
  if (!haRls) mancano.push("RLS o RLST");

  const oggi = new Date().toISOString().slice(0, 10);

  const salvaModulo = async () => {
    if (!modulo || !modulo.nominativo.trim()) return;
    try {
      await salva.mutateAsync(modulo);
      setModulo(null);
    } catch {
      // l'errore lo mostra la mutation
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="max-w-2xl text-sm text-muted-foreground">
          Le figure della sicurezza della tua impresa. Le scrivi una volta: ogni POS nuovo le riprende, e le puoi adattare al singolo cantiere.
        </p>
        {puoScrivere && (
          <Button size="sm" onClick={() => setModulo(vuota("datore_lavoro"))}><Plus className="mr-1 h-4 w-4" />Aggiungi figura</Button>
        )}
      </div>

      {!isLoading && !isError && mancano.length > 0 && (
        <div className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          <span>Per un POS completo mancano: {mancano.join(", ")}.</span>
        </div>
      )}

      {isLoading ? (
        <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
      ) : isError ? (
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">
          Non riesco a caricare le figure.{" "}
          <button type="button" className="font-semibold underline" onClick={() => refetch()}>Riprova</button>
        </div>
      ) : figure.length === 0 ? (
        <div className="rounded-xl border border-dashed py-10 text-center">
          <UserCheck className="mx-auto mb-2 h-9 w-9 text-muted-foreground/40" />
          <p className="font-medium">Nessuna figura</p>
          <p className="mt-1 text-sm text-muted-foreground">Inizia dal datore di lavoro e dall'RSPP.</p>
        </div>
      ) : (
        <ul className="grid gap-2 md:grid-cols-2">
          {figure.map((f) => {
            const scaduto = !!f.scadenza && f.scadenza < oggi;
            return (
              <li key={f.id} className="flex items-start gap-3 rounded-xl border bg-card p-3">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium">{f.nominativo}</span>
                    <Badge variant="outline" className="text-[11px]">{labelRuolo(f.ruolo)}</Badge>
                    {f.esterno && <Badge variant="outline" className="text-[11px]">Esterno</Badge>}
                  </div>
                  {f.attestato && (
                    <p className={`mt-0.5 text-xs ${scaduto ? "text-red-700" : "text-muted-foreground"}`}>
                      {f.attestato}{f.scadenza ? ` · ${scaduto ? "scaduto il" : "valido fino al"} ${f.scadenza.split("-").reverse().join("/")}` : ""}
                    </p>
                  )}
                  {f.mansioni_sicurezza && <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{f.mansioni_sicurezza}</p>}
                </div>
                {puoScrivere && (
                  <div className="flex shrink-0">
                    <Button size="icon" variant="ghost" className="h-9 w-9" aria-label={`Modifica ${f.nominativo}`}
                      onClick={() => setModulo({
                        id: f.id, ruolo: f.ruolo, nominativo: f.nominativo, hr_profilo_id: f.hr_profilo_id, esterno: f.esterno,
                        telefono: f.telefono ?? "", email: f.email ?? "", mansioni_sicurezza: f.mansioni_sicurezza ?? "",
                        attestato: f.attestato ?? "", scadenza: f.scadenza, note: f.note ?? "",
                      })}>
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button size="icon" variant="ghost" className="h-9 w-9 text-destructive" aria-label={`Togli ${f.nominativo}`}
                      onClick={() => setDaTogliere(f)}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}

      <Dialog open={!!modulo} onOpenChange={(o) => !o && setModulo(null)}>
        <DialogContent className="max-h-[90vh] max-w-lg overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{modulo?.id ? "Modifica figura" : "Nuova figura della sicurezza"}</DialogTitle>
            <DialogDescription>Una persona con due incarichi, per esempio antincendio e primo soccorso, si aggiunge due volte.</DialogDescription>
          </DialogHeader>
          {modulo && (
            <div className="space-y-3">
              <div className="space-y-1">
                <Label htmlFor="fig-ruolo" className="text-xs font-medium">Ruolo</Label>
                <Select value={modulo.ruolo} onValueChange={(v) => {
                  const ruolo = v as RuoloFigura;
                  // Se le mansioni sono ancora quelle tipiche del ruolo di prima, si cambiano con il ruolo.
                  const predefinite = MANSIONI_PREDEFINITE[modulo.ruolo] ?? "";
                  setModulo({
                    ...modulo, ruolo,
                    mansioni_sicurezza: !modulo.mansioni_sicurezza || modulo.mansioni_sicurezza === predefinite
                      ? MANSIONI_PREDEFINITE[ruolo] ?? "" : modulo.mansioni_sicurezza,
                  });
                }}>
                  <SelectTrigger id="fig-ruolo"><SelectValue /></SelectTrigger>
                  <SelectContent>{RUOLI.map((r) => <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label htmlFor="fig-nome" className="text-xs font-medium">Nome e cognome</Label>
                <Input id="fig-nome" value={modulo.nominativo} onChange={(e) => setModulo({ ...modulo, nominativo: e.target.value })} />
              </div>
              <div className="flex items-center gap-2">
                <Switch id="fig-esterno" checked={modulo.esterno} onCheckedChange={(on) => setModulo({ ...modulo, esterno: on })} />
                <Label htmlFor="fig-esterno" className="text-sm">Esterno all'impresa (consulente, medico, RLST)</Label>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1">
                  <Label htmlFor="fig-tel" className="text-xs font-medium">Telefono</Label>
                  <Input id="fig-tel" type="tel" value={modulo.telefono ?? ""} onChange={(e) => setModulo({ ...modulo, telefono: e.target.value })} />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="fig-mail" className="text-xs font-medium">E-mail</Label>
                  <Input id="fig-mail" type="email" value={modulo.email ?? ""} onChange={(e) => setModulo({ ...modulo, email: e.target.value })} />
                </div>
              </div>
              <div className="space-y-1">
                <Label htmlFor="fig-mansioni" className="text-xs font-medium">Mansioni di sicurezza svolte in cantiere</Label>
                <Textarea id="fig-mansioni" rows={3} value={modulo.mansioni_sicurezza ?? ""} onChange={(e) => setModulo({ ...modulo, mansioni_sicurezza: e.target.value })} />
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1">
                  <Label htmlFor="fig-attestato" className="text-xs font-medium">Attestato o nomina</Label>
                  <Input id="fig-attestato" value={modulo.attestato ?? ""} placeholder="Es.: corso antincendio rischio medio 8 ore"
                    onChange={(e) => setModulo({ ...modulo, attestato: e.target.value })} />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="fig-scadenza" className="text-xs font-medium">Valido fino al</Label>
                  <Input id="fig-scadenza" type="date" value={modulo.scadenza ?? ""} onChange={(e) => setModulo({ ...modulo, scadenza: e.target.value || null })} />
                </div>
              </div>
            </div>
          )}
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setModulo(null)}>Annulla</Button>
            <Button onClick={salvaModulo} disabled={!modulo?.nominativo.trim() || salva.isPending}>
              {salva.isPending && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}Salva
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!daTogliere} onOpenChange={(o) => !o && setDaTogliere(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Togliere {daTogliere?.nominativo}?</AlertDialogTitle>
            <AlertDialogDescription>
              Non comparirà nei POS nuovi. I POS già scritti restano come sono.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annulla</AlertDialogCancel>
            <AlertDialogAction onClick={() => daTogliere && elimina.mutate(daTogliere.id)}>Togli</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
