import { useState, useMemo } from "react";
import { useHrFestivita, useCreateHrFestivita, useUpdateHrFestivita, useDeleteHrFestivita, useImportHrFestivita } from "@/hooks/useHrFestivita";
import { projectHoliday } from "@/lib/personale/calendarioLavorativo";
import { usePermissions } from "@/hooks/usePermissions";
import { HrQueryError } from "@/components/hr/HrQueryError";
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
import { format, parseISO } from "date-fns";
import { it } from "date-fns/locale";
import { toast } from "sonner";
import { useT, dateFnsCampo } from "@/lib/campo/lingua/LinguaCampo";

export function TabFestivita() {
  const t = useT();
  const { data: festivita = [], isLoading, isError, refetch } = useHrFestivita();
  const importMut = useImportHrFestivita();
  const permissions = usePermissions();
  const canEdit = !permissions.isLoading && !permissions.solaLettura && (permissions.isAdmin || permissions.canViewPersone);
  const deleteMut = useDeleteHrFestivita();
  const [editItem, setEditItem] = useState<HrFestivita | null>(null);
  const [showNew, setShowNew] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const [month, setMonth] = useState(new Date());
  const anno = month.getFullYear();
  const projected = useMemo(() => festivita.flatMap((f) => { const p = projectHoliday(f, anno); return p ? [p] : []; }).sort((a, b) => a.projectedDate.localeCompare(b.projectedDate)), [festivita, anno]);
  const ricorrenti = projected.filter((f) => f.ricorrente).length;

  // Dates for calendar highlighting
  const festivitaDates = useMemo(() => {
    return projected.map((f) => parseISO(f.projectedDate));
  }, [projected]);

  const handlePopulateItaliane = () => {
    if (canEdit) importMut.mutate(anno);
  };

  return (
    <div className="space-y-4">
      {isError && <HrQueryError label={t("Calendario non disponibile")} onRetry={refetch} />}
      <p className="text-sm text-muted-foreground">{t("Calendario {anno}: ricorrenze proiettate nell’anno selezionato. Pasqua e Lunedì dell’Angelo sono specifici dell’anno. Verifica patrono locale, chiusure e accordi con il consulente.", { anno: String(anno ?? "") })}</p>
      {/* KPI */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="p-2 rounded-lg bg-muted"><CalendarCheck className="h-5 w-5 text-muted-foreground" /></div>
            <div>
              <p className="text-2xl font-bold">{isError || isLoading ? "—" : projected.length}</p>
              <p className="text-xs text-muted-foreground">{t("Festività nel {anno}", { anno: String(anno ?? "") })}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="p-2 rounded-lg bg-muted"><RefreshCw className="h-5 w-5 text-muted-foreground" /></div>
            <div>
              <p className="text-2xl font-bold">{isError || isLoading ? "—" : ricorrenti}</p>
              <p className="text-xs text-muted-foreground">{t("Ricorrenti")}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="p-2 rounded-lg bg-muted"><CalendarDays className="h-5 w-5 text-muted-foreground" /></div>
            <div>
              <p className="text-2xl font-bold">{isError || isLoading ? "—" : projected.length - ricorrenti}</p>
              <p className="text-xs text-muted-foreground">{t("Una tantum")}</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="outline" size="sm" onClick={handlePopulateItaliane} disabled={!canEdit || isError || isLoading || importMut.isPending}>{t("🇮🇹 Aggiungi festività italiane {anno}", { anno: String(anno ?? "") })}</Button>
        <div className="ml-auto">
          <Button disabled={!canEdit} size="sm" onClick={() => setShowNew(true)}>
            <Plus className="h-4 w-4 mr-1" /> {t("Nuova Festività")}
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
              month={month}
              onMonthChange={setMonth}
              onSelect={() => undefined}
            />
            <div className="flex items-center justify-between gap-2">
              <Button size="sm" variant="ghost" onClick={() => setMonth(new Date(anno - 1, month.getMonth(), 1))} aria-label={t("Anno precedente")}>{anno - 1}</Button>
              <Button size="sm" variant="ghost" onClick={() => setMonth(new Date())}>{t("Oggi")}</Button>
              <Button size="sm" variant="ghost" onClick={() => setMonth(new Date(anno + 1, month.getMonth(), 1))} aria-label={t("Anno successivo")}>{anno + 1}</Button>
            </div>
          </CardContent>
        </Card>

        {/* List */}
        <div className="space-y-2">
          {isLoading ? (
            <div className="text-center py-12 text-muted-foreground">{t("Caricamento...")}</div>
          ) : isError ? null : projected.length === 0 ? (
            <Card><CardContent className="py-12 text-center text-muted-foreground">{t("Nessuna festività configurata. Usa il bottone \"Aggiungi festività italiane\" per iniziare.")}</CardContent></Card>
          ) : (
            projected.map((f) => (
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
                          <RefreshCw className="h-3 w-3" /> {t("Ricorrente")}
                        </Badge>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {format(parseISO(f.projectedDate), "EEEE d MMMM yyyy", { locale: dateFnsCampo() })}
                    </p>
                  </div>
                  <div className="flex gap-1 shrink-0">
                    <Button disabled={!canEdit} aria-label={t("Modifica {descrizione}", { descrizione: String(f.descrizione ?? "") })} variant="ghost" size="icon" className="h-8 w-8" onClick={() => setEditItem(f)}>
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                    <Button disabled={!canEdit} aria-label={t("Elimina {descrizione}", { descrizione: String(f.descrizione ?? "") })} variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => setDeleteId(f.id)}>
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
            <AlertDialogTitle>{t("Elimina Festività")}</AlertDialogTitle>
            <AlertDialogDescription>{t("Questa festività sarà rimossa permanentemente.")}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("Annulla")}</AlertDialogCancel>
            <AlertDialogAction
              disabled={!canEdit || deleteMut.isPending}
              onClick={(event) => { event.preventDefault(); if (deleteId) deleteMut.mutate(deleteId, { onSuccess: () => setDeleteId(null) }); }}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {t("Elimina")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function FestivitaDialog({ item, open, onClose }: { item: HrFestivita | null; open: boolean; onClose: () => void }) {
  const t = useT();
  const createMut = useCreateHrFestivita();
  const updateMut = useUpdateHrFestivita();
  const isEdit = !!item;

  const [data, setData] = useState(item?.data || "");
  const [descrizione, setDescrizione] = useState(item?.descrizione || "");
  const [ricorrente, setRicorrente] = useState(item?.ricorrente ?? false);

  const handleSubmit = () => {
    if (!data || !descrizione.trim()) { toast.error(t("Compila tutti i campi")); return; }
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
      <DialogContent className="max-w-sm max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isEdit ? t("Modifica Festività") : t("Nuova Festività")}</DialogTitle>
          <DialogDescription>
            {isEdit ? t("Modifica i dati della festività.") : t("Aggiungi una nuova festività al calendario aziendale.")}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label>{t("Data *")}</Label>
            <Input type="date" value={data} onChange={(e) => setData(e.target.value)} />
          </div>
          <div>
            <Label>{t("Descrizione *")}</Label>
            <Input value={descrizione} onChange={(e) => setDescrizione(e.target.value)} placeholder={t("Es. Natale")} />
          </div>
          <div className="flex items-center justify-between">
            <div>
              <Label>{t("Ricorrente ogni anno")}</Label>
              <p className="text-xs text-muted-foreground">{t("Verrà ripetuta automaticamente ogni anno")}</p>
            </div>
            <Switch checked={ricorrente} onCheckedChange={setRicorrente} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>{t("Annulla")}</Button>
          <Button onClick={handleSubmit} disabled={isPending}>
            {isPending ? t("Salvataggio...") : isEdit ? t("Salva") : t("Aggiungi")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
