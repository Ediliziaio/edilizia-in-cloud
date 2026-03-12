import { useState, useMemo } from "react";
import { useHrFestivita, useCreateHrFestivita, useUpdateHrFestivita, useDeleteHrFestivita } from "@/hooks/useHrFestivita";
import type { HrFestivita } from "@/types/hr";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Calendar } from "@/components/ui/calendar";
import { Plus, CalendarCheck, Pencil, Trash2, RefreshCw, CalendarDays } from "lucide-react";
import { format, parseISO, isSameDay } from "date-fns";
import { it } from "date-fns/locale";
import { toast } from "sonner";

const FESTIVITA_ITALIANE = [
  { data: "01-01", descrizione: "Capodanno" },
  { data: "01-06", descrizione: "Epifania" },
  { data: "04-25", descrizione: "Festa della Liberazione" },
  { data: "05-01", descrizione: "Festa dei Lavoratori" },
  { data: "06-02", descrizione: "Festa della Repubblica" },
  { data: "08-15", descrizione: "Ferragosto" },
  { data: "11-01", descrizione: "Tutti i Santi" },
  { data: "12-08", descrizione: "Immacolata Concezione" },
  { data: "12-25", descrizione: "Natale" },
  { data: "12-26", descrizione: "Santo Stefano" },
];

export function TabFestivita() {
  const { data: festivita = [], isLoading } = useHrFestivita();
  const createMut = useCreateHrFestivita();
  const deleteMut = useDeleteHrFestivita();
  const [editItem, setEditItem] = useState<HrFestivita | null>(null);
  const [showNew, setShowNew] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const ricorrenti = festivita.filter((f) => f.ricorrente).length;
  const anno = new Date().getFullYear();

  // Dates for calendar highlighting
  const festivitaDates = useMemo(() => {
    return festivita.map((f) => parseISO(f.data));
  }, [festivita]);

  const handlePopulateItaliane = () => {
    const existing = festivita.map((f) => f.data.slice(5)); // MM-DD
    const toAdd = FESTIVITA_ITALIANE.filter((fi) => !existing.includes(fi.data));
    if (toAdd.length === 0) {
      toast.info("Tutte le festività italiane sono già presenti");
      return;
    }
    Promise.all(
      toAdd.map((fi) =>
        createMut.mutateAsync({ data: `${anno}-${fi.data}`, descrizione: fi.descrizione, ricorrente: true })
      )
    ).then(() => toast.success(`${toAdd.length} festività italiane aggiunte`));
  };

  return (
    <div className="space-y-4">
      {/* KPI */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="p-2 rounded-lg bg-muted"><CalendarCheck className="h-5 w-5 text-muted-foreground" /></div>
            <div>
              <p className="text-2xl font-bold">{festivita.length}</p>
              <p className="text-xs text-muted-foreground">Festività totali</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="p-2 rounded-lg bg-muted"><RefreshCw className="h-5 w-5 text-muted-foreground" /></div>
            <div>
              <p className="text-2xl font-bold">{ricorrenti}</p>
              <p className="text-xs text-muted-foreground">Ricorrenti</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="p-2 rounded-lg bg-muted"><CalendarDays className="h-5 w-5 text-muted-foreground" /></div>
            <div>
              <p className="text-2xl font-bold">{festivita.length - ricorrenti}</p>
              <p className="text-xs text-muted-foreground">Una tantum</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="outline" size="sm" onClick={handlePopulateItaliane} disabled={createMut.isPending}>
          🇮🇹 Aggiungi festività italiane {anno}
        </Button>
        <div className="ml-auto">
          <Button size="sm" onClick={() => setShowNew(true)}>
            <Plus className="h-4 w-4 mr-1" /> Nuova Festività
          </Button>
        </div>
      </div>

      {/* Calendar + List side by side */}
      <div className="grid md:grid-cols-[auto_1fr] gap-4">
        {/* Mini calendar */}
        <Card className="w-fit">
          <CardContent className="p-3">
            <Calendar
              mode="multiple"
              selected={festivitaDates}
              locale={it}
              className="pointer-events-none"
            />
          </CardContent>
        </Card>

        {/* List */}
        <div className="space-y-2">
          {isLoading ? (
            <div className="text-center py-12 text-muted-foreground">Caricamento...</div>
          ) : festivita.length === 0 ? (
            <Card><CardContent className="py-12 text-center text-muted-foreground">Nessuna festività configurata. Usa il bottone "Aggiungi festività italiane" per iniziare.</CardContent></Card>
          ) : (
            festivita.map((f) => (
              <Card key={f.id}>
                <CardContent className="p-3 flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-primary/10 shrink-0">
                    <CalendarCheck className="h-4 w-4 text-primary" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-sm">{f.descrizione}</span>
                      {f.ricorrente && (
                        <Badge variant="outline" className="text-xs gap-1">
                          <RefreshCw className="h-3 w-3" /> Ricorrente
                        </Badge>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {format(parseISO(f.data), "EEEE d MMMM yyyy", { locale: it })}
                    </p>
                  </div>
                  <div className="flex gap-1 shrink-0">
                    <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setEditItem(f)}>
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                    <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => setDeleteId(f.id)}>
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))
          )}
        </div>
      </div>

      {/* Create/Edit dialog */}
      {(showNew || editItem) && (
        <FestivitaDialog
          item={editItem}
          open={showNew || !!editItem}
          onClose={() => { setShowNew(false); setEditItem(null); }}
        />
      )}

      {/* Delete confirm */}
      <AlertDialog open={!!deleteId} onOpenChange={() => setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Elimina Festività</AlertDialogTitle>
            <AlertDialogDescription>Questa festività sarà rimossa permanentemente.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annulla</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => { if (deleteId) deleteMut.mutate(deleteId); setDeleteId(null); }}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Elimina
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function FestivitaDialog({ item, open, onClose }: { item: HrFestivita | null; open: boolean; onClose: () => void }) {
  const createMut = useCreateHrFestivita();
  const updateMut = useUpdateHrFestivita();
  const isEdit = !!item;

  const [data, setData] = useState(item?.data || "");
  const [descrizione, setDescrizione] = useState(item?.descrizione || "");
  const [ricorrente, setRicorrente] = useState(item?.ricorrente ?? false);

  const handleSubmit = () => {
    if (!data || !descrizione.trim()) { toast.error("Compila tutti i campi"); return; }
    const payload = { data, descrizione: descrizione.trim(), ricorrente };

    if (isEdit) {
      updateMut.mutate({ id: item!.id, ...payload }, { onSuccess: onClose });
    } else {
      createMut.mutate(payload, { onSuccess: onClose });
    }
  };

  const isPending = createMut.isPending || updateMut.isPending;

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Modifica Festività" : "Nuova Festività"}</DialogTitle>
          <DialogDescription>
            {isEdit ? "Modifica i dati della festività." : "Aggiungi una nuova festività al calendario aziendale."}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label>Data *</Label>
            <Input type="date" value={data} onChange={(e) => setData(e.target.value)} />
          </div>
          <div>
            <Label>Descrizione *</Label>
            <Input value={descrizione} onChange={(e) => setDescrizione(e.target.value)} placeholder="Es. Natale" />
          </div>
          <div className="flex items-center justify-between">
            <div>
              <Label>Ricorrente ogni anno</Label>
              <p className="text-xs text-muted-foreground">Verrà ripetuta automaticamente ogni anno</p>
            </div>
            <Switch checked={ricorrente} onCheckedChange={setRicorrente} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Annulla</Button>
          <Button onClick={handleSubmit} disabled={isPending}>
            {isPending ? "Salvataggio..." : isEdit ? "Salva" : "Aggiungi"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
