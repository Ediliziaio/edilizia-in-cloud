/**
 * @file SmsAutomations.tsx
 * @description Lista automazioni SMS con toggle attiva/disattiva e CRUD.
 * @author Claude Code — AEDIX S.r.l.
 * @date 2026-04-07
 */

import { useState } from "react";
import { format } from "date-fns";
import { Plus, Pencil, Trash2, Zap } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useSmsAutomations } from "@/hooks/useSmsAutomations";
import { SmsSkeletonLoader } from "@/components/sms/SmsSkeletonLoader";
import { SmsAutomationForm } from "./SmsAutomationForm";
import type { SmsAutomation, SmsAutomationFormData } from "@/types/sms";
import { SMS_AUTOMATION_EVENTO_LABELS, SMS_DESTINATARIO_LABELS } from "@/types/sms";
import { useT, dateFnsCampo, intlCampo } from "@/lib/campo/lingua/LinguaCampo";

export function SmsAutomations() {
  const t = useT();
  const { automations, isLoading, create, isCreating, update, isUpdating, toggleAttiva, remove } =
    useSmsAutomations();

  const [formOpen, setFormOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<SmsAutomation | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<SmsAutomation | null>(null);

  const handleFormSubmit = (data: SmsAutomationFormData) => {
    if (editTarget) {
      update(
        { id: editTarget.id, formData: data },
        { onSuccess: () => { setFormOpen(false); setEditTarget(null); } }
      );
    } else {
      create(data, { onSuccess: () => setFormOpen(false) });
    }
  };

  const handleEdit = (a: SmsAutomation) => {
    setEditTarget(a);
    setFormOpen(true);
  };

  const handleDelete = () => {
    if (deleteTarget) {
      remove(deleteTarget.id);
      setDeleteTarget(null);
    }
  };

  return (
    <>
      {/* Come la scheda Campagne: il bottone sopra a destra e la lista nella
          card. Via il titolo «Automazioni SMS» (è il nome della scheda), il
          bottone blu notte diverso da tutti gli altri e il secondo «Crea
          automazione» nel riquadro vuoto. Questa scheda c'è solo da 768. */}
      <div className="mb-3 flex justify-end">
        <Button size="sm" onClick={() => { setEditTarget(null); setFormOpen(true); }}>
          <Plus className="h-4 w-4 mr-1" />
          {t("Nuova automazione")}
        </Button>
      </div>
      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-4">
              <SmsSkeletonLoader rows={4} variant="cards" />
            </div>
          ) : automations.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-muted-foreground gap-3">
              <Zap className="h-10 w-10 opacity-30" />
              <p className="text-sm text-center max-w-xs">
                {t("Nessuna automazione configurata. Crea la prima regola per inviare SMS in automatico sugli eventi della tua azienda.")}
              </p>
            </div>
          ) : (
            <div className="divide-y">
              {automations.map((a) => (
                <div key={a.id} className="flex items-start gap-4 px-4 py-4 hover:bg-muted/40 transition-colors">
                  {/* Toggle */}
                  <div className="mt-0.5">
                    <Switch
                      checked={a.attiva}
                      onCheckedChange={(v) => toggleAttiva({ id: a.id, attiva: v })}
                      aria-label={a.attiva ? t("Disattiva automazione") : t("Attiva automazione")}
                    />
                  </div>

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className={`font-medium text-sm ${!a.attiva ? "text-muted-foreground line-through" : ""}`}>
                        {a.nome}
                      </span>
                      <Badge variant="outline" className="text-xs">
                        {t(SMS_AUTOMATION_EVENTO_LABELS[a.trigger_evento])}
                      </Badge>
                      {a.delay_minuti > 0 && (
                        <Badge variant="outline" className="text-xs text-blue-600">{t("+{n}min", { n: a.delay_minuti })}</Badge>
                      )}
                    </div>

                    <p className="text-xs text-muted-foreground mt-1 truncate max-w-md">
                      {a.template_body}
                    </p>

                    <div className="flex items-center gap-3 mt-1.5 text-xs text-muted-foreground">
                      <span>→ {t(SMS_DESTINATARIO_LABELS[a.tipo_destinatario])}</span>
                      <span>·</span>
                      <span>{t("{n} invii", { n: new Intl.NumberFormat(intlCampo()).format(a.contatore_invii) })}</span>
                      {a.ultima_esecuzione && (
                        <>
                          <span>·</span>
                          <span>{t("Ultima: {data}", { data: format(new Date(a.ultima_esecuzione), "dd/MM/yyyy", { locale: dateFnsCampo() }) })}</span>
                        </>
                      )}
                    </div>
                  </div>

                  {/* Azioni */}
                  <div className="flex gap-1.5 shrink-0">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8"
                      onClick={() => handleEdit(a)}
                      title={t("Modifica")}
                    >
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-red-500 hover:text-red-700 hover:bg-red-50"
                      onClick={() => setDeleteTarget(a)}
                      title={t("Elimina")}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Form dialog */}
      <SmsAutomationForm
        open={formOpen}
        onClose={() => { setFormOpen(false); setEditTarget(null); }}
        onSubmit={handleFormSubmit}
        isPending={isCreating || isUpdating}
        defaultValues={editTarget}
      />

      {/* Delete confirm */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("Elimina automazione")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("Sei sicuro di voler eliminare l'automazione \"{nome}\"? Questa azione non può essere annullata.", { nome: deleteTarget?.nome ?? "" })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("Annulla")}</AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-600 hover:bg-red-700 text-white"
              onClick={handleDelete}
            >
              {t("Elimina")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
