/**
 * Lista template SMS con azioni modifica/elimina.
 */
import { useState } from "react";
import { Plus, Pencil, Trash2, Loader2, FileText } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { useSmsTemplates } from "@/hooks/useSmsTemplates";
import { SmsTemplateForm } from "./SmsTemplateForm";
import type { SmsTemplate } from "@/types/sms-marketing";

const CATEGORIA_LABEL: Record<string, string> = {
  generico: "Generico",
  promozionale: "Promozionale",
  transazionale: "Transazionale",
  reminder: "Reminder",
  preventivo: "Preventivo",
};

export function SmsTemplateList() {
  const { templates, isLoading, remove, isRemoving } = useSmsTemplates();
  const [editTemplate, setEditTemplate] = useState<SmsTemplate | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);

  if (isLoading) {
    return (
      <div className="space-y-2">
        {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-20 w-full" />)}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex justify-end">
        <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
          <SheetTrigger asChild>
            <Button size="sm" onClick={() => setEditTemplate(null)}>
              <Plus className="h-4 w-4 mr-1" /> Nuovo template
            </Button>
          </SheetTrigger>
          <SheetContent>
            <SheetHeader>
              <SheetTitle>{editTemplate ? "Modifica template" : "Nuovo template"}</SheetTitle>
            </SheetHeader>
            <div className="mt-4">
              <SmsTemplateForm
                initialData={editTemplate ?? undefined}
                onSuccess={() => setSheetOpen(false)}
                onCancel={() => setSheetOpen(false)}
              />
            </div>
          </SheetContent>
        </Sheet>
      </div>

      {templates.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12 gap-3 text-center">
            <FileText className="h-8 w-8 text-muted-foreground/40" />
            <p className="text-sm text-muted-foreground">Nessun template SMS. Crea il primo.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {templates.map((t) => (
            <Card key={t.id}>
              <CardContent className="p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="font-medium text-sm">{t.nome}</span>
                      <Badge variant="secondary" className="text-xs">{CATEGORIA_LABEL[t.categoria] ?? t.categoria}</Badge>
                      {!t.attivo && <Badge variant="outline" className="text-xs text-muted-foreground">Disattivo</Badge>}
                    </div>
                    <p className="text-sm text-muted-foreground truncate">{t.messaggio}</p>
                    {t.variabili.length > 0 && (
                      <div className="flex gap-1 mt-1">
                        {t.variabili.map((v) => (
                          <Badge key={v} variant="outline" className="text-xs font-mono">{v}</Badge>
                        ))}
                      </div>
                    )}
                  </div>
                  <div className="flex gap-1 shrink-0">
                    <Sheet>
                      <SheetTrigger asChild>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 w-7 p-0"
                          onClick={() => { setEditTemplate(t); setSheetOpen(true); }}
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                      </SheetTrigger>
                    </Sheet>
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-destructive hover:text-destructive">
                          {isRemoving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Eliminare il template?</AlertDialogTitle>
                          <AlertDialogDescription>Questa azione è irreversibile.</AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Annulla</AlertDialogCancel>
                          <AlertDialogAction
                            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                            onClick={() => remove(t.id)}
                          >
                            Elimina
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
