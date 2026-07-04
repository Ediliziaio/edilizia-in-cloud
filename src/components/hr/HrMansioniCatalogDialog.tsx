/**
 * HrMansioniCatalogDialog — CRUD del catalogo mansioni riutilizzabili.
 * Lista mansioni + form (nome/area/descrizione) con editor lista responsabilità
 * e editor KPI suggeriti. Usa useHrMansioni.
 */
import { useState } from "react";
import { useHrMansioni, useHrMansioneMutations, type MansioneInput } from "@/hooks/useHrMansioni";
import type { HrMansione, KpiSuggerito, KpiUnita, KpiDirezione, KpiPeriodo } from "@/types/hr";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Plus, Trash2, Loader2, Pencil, X, Briefcase } from "lucide-react";

const UNITA: KpiUnita[] = ["num", "%", "ore", "€"];
const PERIODI: KpiPeriodo[] = ["mensile", "trimestrale", "annuale"];

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  companyId: string;
}

const EMPTY_FORM: MansioneInput = { nome: "", area: "", descrizione: "", responsabilita: [], kpi_suggeriti: [] };

export function HrMansioniCatalogDialog({ open, onOpenChange, companyId }: Props) {
  const { data: mansioni = [], isLoading } = useHrMansioni(companyId);
  const { upsert, remove } = useHrMansioneMutations(companyId);

  const [editing, setEditing] = useState<MansioneInput | null>(null);
  const [respInput, setRespInput] = useState("");

  const startNew = () => { setEditing({ ...EMPTY_FORM }); setRespInput(""); };
  const startEdit = (m: HrMansione) => {
    setEditing({
      id: m.id, nome: m.nome, area: m.area ?? "", descrizione: m.descrizione ?? "",
      responsabilita: [...(m.responsabilita ?? [])], kpi_suggeriti: [...(m.kpi_suggeriti ?? [])],
    });
    setRespInput("");
  };

  const patch = (p: Partial<MansioneInput>) => setEditing((e) => (e ? { ...e, ...p } : e));

  const addResp = () => {
    const v = respInput.trim();
    if (!v || !editing) return;
    patch({ responsabilita: [...(editing.responsabilita ?? []), v] });
    setRespInput("");
  };
  const removeResp = (i: number) =>
    patch({ responsabilita: (editing?.responsabilita ?? []).filter((_, idx) => idx !== i) });

  const addKpi = () =>
    patch({ kpi_suggeriti: [...(editing?.kpi_suggeriti ?? []), { nome: "", unita: "num", target: null, direzione: "su", periodo: "mensile" }] });
  const patchKpi = (i: number, p: Partial<KpiSuggerito>) =>
    patch({ kpi_suggeriti: (editing?.kpi_suggeriti ?? []).map((k, idx) => (idx === i ? { ...k, ...p } : k)) });
  const removeKpi = (i: number) =>
    patch({ kpi_suggeriti: (editing?.kpi_suggeriti ?? []).filter((_, idx) => idx !== i) });

  const save = async () => {
    if (!editing) return;
    const clean: MansioneInput = {
      ...editing,
      kpi_suggeriti: (editing.kpi_suggeriti ?? []).filter((k) => k.nome.trim() !== ""),
    };
    await upsert.mutateAsync(clean);
    setEditing(null);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh] flex flex-col">
        <DialogHeader><DialogTitle>Catalogo mansioni</DialogTitle></DialogHeader>

        {editing ? (
          <ScrollArea className="flex-1 pr-3 -mr-3">
            <div className="space-y-4 pb-2">
              <div className="grid grid-cols-2 gap-3">
                <div className="col-span-2">
                  <Label>Nome mansione *</Label>
                  <Input value={editing.nome} onChange={(e) => patch({ nome: e.target.value })} placeholder="es. Capocantiere" />
                </div>
                <div>
                  <Label>Area</Label>
                  <Input value={editing.area ?? ""} onChange={(e) => patch({ area: e.target.value })} placeholder="es. Cantiere" />
                </div>
              </div>
              <div>
                <Label>Descrizione</Label>
                <Textarea rows={2} value={editing.descrizione ?? ""} onChange={(e) => patch({ descrizione: e.target.value })} />
              </div>

              <Separator />

              <div>
                <Label>Responsabilità</Label>
                <div className="flex gap-2 mt-1">
                  <Input
                    value={respInput}
                    onChange={(e) => setRespInput(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addResp(); } }}
                    placeholder="Aggiungi una responsabilità e premi Invio"
                  />
                  <Button type="button" variant="outline" onClick={addResp}><Plus className="h-4 w-4" /></Button>
                </div>
                <div className="flex flex-wrap gap-1.5 mt-2">
                  {(editing.responsabilita ?? []).map((r, i) => (
                    <Badge key={i} variant="secondary" className="gap-1">
                      {r}
                      <button type="button" onClick={() => removeResp(i)}><X className="h-3 w-3" /></button>
                    </Badge>
                  ))}
                  {(editing.responsabilita ?? []).length === 0 && (
                    <span className="text-xs text-muted-foreground">Nessuna responsabilità.</span>
                  )}
                </div>
              </div>

              <Separator />

              <div>
                <div className="flex items-center justify-between">
                  <Label>KPI suggeriti</Label>
                  <Button type="button" size="sm" variant="outline" onClick={addKpi}><Plus className="h-4 w-4 mr-1" />KPI</Button>
                </div>
                <div className="space-y-2 mt-2">
                  {(editing.kpi_suggeriti ?? []).map((k, i) => (
                    <div key={i} className="grid grid-cols-12 gap-2 items-center rounded-md border p-2">
                      <Input className="col-span-4" value={k.nome} placeholder="Nome KPI" onChange={(e) => patchKpi(i, { nome: e.target.value })} />
                      <select className="col-span-2 h-9 rounded-md border border-input bg-background px-2 text-sm"
                        value={k.unita} onChange={(e) => patchKpi(i, { unita: e.target.value as KpiUnita })}>
                        {UNITA.map((u) => <option key={u} value={u}>{u}</option>)}
                      </select>
                      <Input className="col-span-2" type="number" step="0.1" placeholder="target"
                        value={k.target ?? ""} onChange={(e) => patchKpi(i, { target: e.target.value === "" ? null : Number(e.target.value) })} />
                      <select className="col-span-3 h-9 rounded-md border border-input bg-background px-2 text-sm"
                        value={k.periodo} onChange={(e) => patchKpi(i, { periodo: e.target.value as KpiPeriodo })}>
                        {PERIODI.map((p) => <option key={p} value={p}>{p}</option>)}
                      </select>
                      <button type="button" className="col-span-1 text-destructive flex justify-center" onClick={() => removeKpi(i)}>
                        <Trash2 className="h-4 w-4" />
                      </button>
                      <select className="col-span-4 h-9 rounded-md border border-input bg-background px-2 text-sm"
                        value={k.direzione} onChange={(e) => patchKpi(i, { direzione: e.target.value as KpiDirezione })}>
                        <option value="su">Più alto è meglio</option>
                        <option value="giu">Più basso è meglio</option>
                      </select>
                    </div>
                  ))}
                  {(editing.kpi_suggeriti ?? []).length === 0 && (
                    <span className="text-xs text-muted-foreground">Nessun KPI suggerito.</span>
                  )}
                </div>
              </div>
            </div>
          </ScrollArea>
        ) : (
          <ScrollArea className="flex-1 pr-3 -mr-3">
            {isLoading ? (
              <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
            ) : mansioni.length === 0 ? (
              <div className="text-center py-10 text-sm text-muted-foreground">
                <Briefcase className="h-8 w-8 mx-auto mb-2 opacity-40" />
                Nessuna mansione nel catalogo. Creane una.
              </div>
            ) : (
              <div className="space-y-2 pb-2">
                {mansioni.map((m) => (
                  <div key={m.id} className="flex items-start gap-2 rounded-lg border p-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-medium text-sm">{m.nome}</span>
                        {m.area && <Badge variant="outline" className="text-[10px] px-1.5 py-0">{m.area}</Badge>}
                      </div>
                      <div className="text-xs text-muted-foreground mt-1">
                        {(m.responsabilita ?? []).length} responsabilità · {(m.kpi_suggeriti ?? []).length} KPI suggeriti
                      </div>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => startEdit(m)} title="Modifica">
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button size="icon" variant="ghost" className="h-8 w-8 text-destructive" title="Elimina">
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>Eliminare la mansione?</AlertDialogTitle>
                            <AlertDialogDescription>
                              {m.nome}. I profili collegati manterranno l'etichetta ma perderanno il link al catalogo.
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Annulla</AlertDialogCancel>
                            <AlertDialogAction onClick={() => remove.mutate(m.id)}>Elimina</AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </ScrollArea>
        )}

        <DialogFooter className="flex-row justify-between sm:justify-between">
          {editing ? (
            <>
              <Button variant="ghost" onClick={() => setEditing(null)}>Indietro</Button>
              <Button onClick={save} disabled={upsert.isPending || !editing.nome.trim()}>
                {upsert.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}Salva mansione
              </Button>
            </>
          ) : (
            <>
              <Button variant="outline" onClick={() => onOpenChange(false)}>Chiudi</Button>
              <Button onClick={startNew}><Plus className="h-4 w-4 mr-1" />Nuova mansione</Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
