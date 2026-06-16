/**
 * HrDocumentiSection — documenti, certificati e scadenze di un dipendente.
 * Contratto, visita medica, corsi sicurezza, idoneità, patente, DURC... con
 * data di rilascio/scadenza, file caricato e "avvisa N giorni prima".
 * Le scadenze fanno scattare l'avviso giornaliero all'admin (hr-check-scadenze).
 */
import { useState } from "react";
import {
  useHrDocumenti, useUpsertHrDocumento, useDeleteHrDocumento, uploadHrFile, getHrFileUrl,
} from "@/hooks/useHrDocumenti";
import type { HrDocumento } from "@/types/hrDocumenti";
import { CATEGORIA_DOC, calcStato, STATO_BADGE, categoriaLabel } from "@/types/hrDocumenti";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { FileText, Plus, Download, Pencil, Trash2, Loader2, Paperclip } from "lucide-react";
import { toast } from "sonner";

function fmt(d: string | null): string {
  if (!d) return "—";
  const [y, m, g] = d.split("-");
  return `${g}/${m}/${y}`;
}

interface Props { profiloId: string; companyId: string; }

const EMPTY: Partial<HrDocumento> = { categoria: "contratto", alert_giorni_prima: 30 };

export function HrDocumentiSection({ profiloId, companyId }: Props) {
  const { data: docs = [], isLoading } = useHrDocumenti(profiloId);
  const upsert = useUpsertHrDocumento(profiloId);
  const del = useDeleteHrDocumento(profiloId);

  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<Partial<HrDocumento>>(EMPTY);
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);

  const openNew = () => { setForm(EMPTY); setFile(null); setOpen(true); };
  const openEdit = (d: HrDocumento) => { setForm(d); setFile(null); setOpen(true); };

  const set = (k: keyof HrDocumento, v: any) => setForm((f) => ({ ...f, [k]: v }));

  const onCategoria = (value: string) => {
    const cat = CATEGORIA_DOC.find((c) => c.value === value);
    setForm((f) => ({ ...f, categoria: value as any, alert_giorni_prima: f.id ? f.alert_giorni_prima : (cat?.alert ?? 30) }));
  };

  const save = async () => {
    try {
      setUploading(true);
      let patch: Partial<HrDocumento> = { ...form };
      if (file) {
        const up = await uploadHrFile(companyId, profiloId, file);
        patch.file_path = up.path; patch.file_name = up.name;
      }
      await upsert.mutateAsync(patch as any);
      setOpen(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Errore upload");
    } finally { setUploading(false); }
  };

  const download = async (d: HrDocumento) => {
    if (!d.file_path) return;
    const url = await getHrFileUrl(d.file_path);
    if (url) window.open(url, "_blank");
    else toast.error("File non disponibile");
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-semibold text-muted-foreground">DOCUMENTI & SCADENZE</h4>
        <Button size="sm" variant="outline" onClick={openNew}><Plus className="h-4 w-4 mr-1" />Aggiungi</Button>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-6"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
      ) : docs.length === 0 ? (
        <div className="text-center py-8 text-sm text-muted-foreground">
          <FileText className="h-8 w-8 mx-auto mb-2 opacity-40" />
          Nessun documento. Carica contratto, visita medica, corsi sicurezza…
        </div>
      ) : (
        <div className="space-y-2">
          {docs.map((d) => {
            const stato = calcStato(d.data_scadenza, d.alert_giorni_prima);
            const sb = STATO_BADGE[stato];
            return (
              <div key={d.id} className="flex items-start gap-2 rounded-lg border p-3">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-medium text-sm">{categoriaLabel(d.categoria)}</span>
                    {d.titolo && <span className="text-xs text-muted-foreground">· {d.titolo}</span>}
                    <Badge variant="outline" className={`text-[10px] px-1.5 py-0 ${sb.cls}`}>{sb.label}</Badge>
                  </div>
                  <div className="text-xs text-muted-foreground mt-1">
                    {d.data_scadenza ? <>Scadenza <b>{fmt(d.data_scadenza)}</b></> : "Senza scadenza"}
                    {d.data_rilascio && <> · rilascio {fmt(d.data_rilascio)}</>}
                    {d.ente && <> · {d.ente}</>}
                  </div>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  {d.file_path && (
                    <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => download(d)} title="Scarica">
                      <Download className="h-4 w-4" />
                    </Button>
                  )}
                  <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => openEdit(d)} title="Modifica">
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
                        <AlertDialogTitle>Eliminare il documento?</AlertDialogTitle>
                        <AlertDialogDescription>
                          {categoriaLabel(d.categoria)}{d.titolo ? ` · ${d.titolo}` : ""}. L'operazione è irreversibile.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Annulla</AlertDialogCancel>
                        <AlertDialogAction onClick={() => del.mutate(d)}>Elimina</AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>{form.id ? "Modifica documento" : "Nuovo documento"}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Categoria</Label>
              <select className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                value={form.categoria ?? "contratto"} onChange={(e) => onCategoria(e.target.value)}>
                {CATEGORIA_DOC.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
              </select>
            </div>
            <div>
              <Label>Titolo / descrizione</Label>
              <Input value={form.titolo ?? ""} onChange={(e) => set("titolo", e.target.value)} placeholder="es. Corso primo soccorso" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Data rilascio</Label>
                <Input type="date" value={form.data_rilascio ?? ""} onChange={(e) => set("data_rilascio", e.target.value)} />
              </div>
              <div>
                <Label>Data scadenza</Label>
                <Input type="date" value={form.data_scadenza ?? ""} onChange={(e) => set("data_scadenza", e.target.value)} />
              </div>
              <div>
                <Label>Ente / rilasciato da</Label>
                <Input value={form.ente ?? ""} onChange={(e) => set("ente", e.target.value)} />
              </div>
              <div>
                <Label>Avvisa giorni prima</Label>
                <Input type="number" min={0} value={form.alert_giorni_prima ?? 30}
                  onChange={(e) => set("alert_giorni_prima", Number(e.target.value))} />
              </div>
            </div>
            <div>
              <Label>File {form.file_name && <span className="text-xs text-muted-foreground">(attuale: {form.file_name})</span>}</Label>
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
            <Button onClick={save} disabled={uploading || upsert.isPending}>
              {(uploading || upsert.isPending) && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}Salva
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
