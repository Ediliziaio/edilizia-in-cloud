/**
 * HrAssenzeSection — malattie, infortuni e assenze del dipendente.
 * Periodo (dal–al), giorni, protocollo INPS e certificato caricabile.
 */
import { useState } from "react";
import { useHrAssenze, useUpsertHrAssenza, useDeleteHrAssenza } from "@/hooks/useHrAssenze";
import { uploadHrFile, getHrFileUrl } from "@/hooks/useHrDocumenti";
import type { HrAssenza } from "@/types/hrDocumenti";
import { TIPO_ASSENZA, tipoAssenzaLabel } from "@/types/hrDocumenti";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { HeartPulse, Plus, Download, Pencil, Trash2, Loader2, Paperclip } from "lucide-react";
import { toast } from "sonner";

function fmt(d: string | null): string {
  if (!d) return "—";
  const [y, m, g] = d.split("-");
  return `${g}/${m}/${y}`;
}
function calcGiorni(a?: string | null, b?: string | null): number | null {
  if (!a || !b) return null;
  const d = (new Date(b + "T00:00:00").getTime() - new Date(a + "T00:00:00").getTime()) / 864e5 + 1;
  return d > 0 ? d : null;
}

interface Props { profiloId: string; companyId: string; }
const EMPTY: Partial<HrAssenza> = { tipo: "malattia" };

export function HrAssenzeSection({ profiloId, companyId }: Props) {
  const { data: list = [], isLoading } = useHrAssenze(profiloId);
  const upsert = useUpsertHrAssenza(profiloId);
  const del = useDeleteHrAssenza(profiloId);

  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<Partial<HrAssenza>>(EMPTY);
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);

  const set = (k: keyof HrAssenza, v: any) => setForm((f) => ({ ...f, [k]: v }));
  const openNew = () => { setForm(EMPTY); setFile(null); setOpen(true); };
  const openEdit = (a: HrAssenza) => { setForm(a); setFile(null); setOpen(true); };

  const save = async () => {
    if (!form.data_inizio) { toast.error("Inserisci la data di inizio"); return; }
    try {
      setBusy(true);
      const patch: Partial<HrAssenza> = { ...form, giorni: form.giorni ?? calcGiorni(form.data_inizio, form.data_fine) };
      if (file) {
        const up = await uploadHrFile(companyId, profiloId, file);
        patch.certificato_path = up.path; patch.certificato_name = up.name;
      }
      await upsert.mutateAsync(patch as any);
      setOpen(false);
    } catch (e) { toast.error(e instanceof Error ? e.message : "Errore"); }
    finally { setBusy(false); }
  };

  const download = async (a: HrAssenza) => {
    if (!a.certificato_path) return;
    const url = await getHrFileUrl(a.certificato_path);
    if (url) window.open(url, "_blank"); else toast.error("Certificato non disponibile");
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-semibold text-muted-foreground">ASSENZE & MALATTIE</h4>
        <Button size="sm" variant="outline" onClick={openNew}><Plus className="h-4 w-4 mr-1" />Aggiungi</Button>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-6"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
      ) : list.length === 0 ? (
        <div className="text-center py-8 text-sm text-muted-foreground">
          <HeartPulse className="h-8 w-8 mx-auto mb-2 opacity-40" />
          Nessuna assenza registrata.
        </div>
      ) : (
        <div className="space-y-2">
          {list.map((a) => (
            <div key={a.id} className="flex items-start gap-2 rounded-lg border p-3">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-medium text-sm">{tipoAssenzaLabel(a.tipo)}</span>
                  {a.giorni != null && <span className="text-xs text-muted-foreground">· {a.giorni} gg</span>}
                </div>
                <div className="text-xs text-muted-foreground mt-1">
                  {fmt(a.data_inizio)}{a.data_fine ? ` → ${fmt(a.data_fine)}` : ""}
                  {a.protocollo && <> · prot. {a.protocollo}</>}
                </div>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                {a.certificato_path && (
                  <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => download(a)} title="Certificato">
                    <Download className="h-4 w-4" />
                  </Button>
                )}
                <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => openEdit(a)} title="Modifica">
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
                      <AlertDialogTitle>Eliminare l'assenza?</AlertDialogTitle>
                      <AlertDialogDescription>{tipoAssenzaLabel(a.tipo)} del {fmt(a.data_inizio)}. Irreversibile.</AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Annulla</AlertDialogCancel>
                      <AlertDialogAction onClick={() => del.mutate(a)}>Elimina</AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </div>
            </div>
          ))}
        </div>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>{form.id ? "Modifica assenza" : "Nuova assenza"}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Tipo</Label>
              <select className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                value={form.tipo ?? "malattia"} onChange={(e) => set("tipo", e.target.value)}>
                {TIPO_ASSENZA.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
              </select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Dal *</Label>
                <Input type="date" value={form.data_inizio ?? ""} onChange={(e) => set("data_inizio", e.target.value)} required />
              </div>
              <div>
                <Label>Al</Label>
                <Input type="date" value={form.data_fine ?? ""} onChange={(e) => set("data_fine", e.target.value)} />
              </div>
              <div>
                <Label>Giorni</Label>
                <Input type="number" step="0.5" value={form.giorni ?? ""} placeholder={String(calcGiorni(form.data_inizio, form.data_fine) ?? "")}
                  onChange={(e) => set("giorni", e.target.value === "" ? null : Number(e.target.value))} />
              </div>
              <div>
                <Label>Protocollo INPS</Label>
                <Input value={form.protocollo ?? ""} onChange={(e) => set("protocollo", e.target.value)} />
              </div>
            </div>
            <div>
              <Label>Certificato {form.certificato_name && <span className="text-xs text-muted-foreground">(attuale: {form.certificato_name})</span>}</Label>
              <div className="flex items-center gap-2">
                <Paperclip className="h-4 w-4 text-muted-foreground shrink-0" />
                <Input type="file" accept=".pdf,.jpg,.jpeg,.png,.heic" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
              </div>
            </div>
            <div>
              <Label>Note</Label>
              <Textarea rows={2} value={form.note ?? ""} onChange={(e) => set("note", e.target.value)} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Annulla</Button>
            <Button onClick={save} disabled={busy || upsert.isPending}>
              {(busy || upsert.isPending) && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}Salva
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
