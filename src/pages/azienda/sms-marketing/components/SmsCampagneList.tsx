/**
 * Lista campagne SMS con stato, statistiche e azioni.
 */
import { useState } from "react";
import { Plus, Play, XCircle, BarChart3, Loader2 } from "lucide-react";
import { format } from "date-fns";
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
import { useSmsCampagne } from "@/hooks/useSmsCampagne";
import { SmsCampagnaForm } from "./SmsCampagnaForm";
import { SmsStatsBadge } from "./SmsStatsBadge";
import { SmsCampagnaDetail } from "./SmsCampagnaDetail";
import type { SmsCampagna } from "@/types/sms-marketing";
import { useT, intlCampo, dateFnsCampo } from "@/lib/campo/lingua/LinguaCampo";

export function SmsCampagneList() {
  const t = useT();
  const { campagne, isLoading, avvia, annulla, isAvviando, isAnnullando } = useSmsCampagne();
  const [newSheetOpen, setNewSheetOpen] = useState(false);
  const [detailCampagna, setDetailCampagna] = useState<SmsCampagna | null>(null);
  const [avviandoId, setAvviandoId] = useState<string | null>(null);
  const [annullandoId, setAnnullandoId] = useState<string | null>(null);

  const handleAvvia = async (id: string) => {
    setAvviandoId(id);
    try {
      await avvia(id);
    } finally {
      setAvviandoId(null);
    }
  };

  if (isLoading) {
    return (
      <div className="space-y-3">
        {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-24 w-full" />)}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex justify-end">
        <Sheet open={newSheetOpen} onOpenChange={setNewSheetOpen}>
          <SheetTrigger asChild>
            <Button size="sm">
              <Plus className="h-4 w-4 mr-1" /> {t("Nuova campagna")}
            </Button>
          </SheetTrigger>
          <SheetContent className="w-full sm:max-w-lg overflow-y-auto">
            <SheetHeader>
              <SheetTitle>{t("Nuova campagna SMS")}</SheetTitle>
            </SheetHeader>
            <div className="mt-4">
              <SmsCampagnaForm onSuccess={() => setNewSheetOpen(false)} onCancel={() => setNewSheetOpen(false)} />
            </div>
          </SheetContent>
        </Sheet>
      </div>

      {campagne.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12 gap-3 text-center">
            <BarChart3 className="h-8 w-8 text-muted-foreground/40" />
            <p className="text-sm text-muted-foreground">{t("Nessuna campagna SMS. Crea la prima.")}</p>
          </CardContent>
        </Card>
      ) : (
        campagne.map((c) => (
          <Card key={c.id} className="hover:shadow-sm transition-shadow">
            <CardContent className="p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="font-medium text-sm truncate">{c.nome}</span>
                    <SmsStatsBadge stato={c.stato} />
                  </div>
                  <p className="text-xs text-muted-foreground truncate mb-2">{c.messaggio}</p>
                  <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
                    <span>{t("📤 {inviati} inviati", { inviati: c.inviati.toLocaleString(intlCampo()) })}</span>
                    <span>{t("✅ {consegnati} consegnati", { consegnati: c.consegnati.toLocaleString(intlCampo()) })}</span>
                    {c.errori > 0 && <span className="text-destructive">{t("❌ {errori} errori", { errori: c.errori.toLocaleString(intlCampo()) })}</span>}
                    {c.costo_totale > 0 && (
                      <span>💶 {new Intl.NumberFormat(intlCampo(), { style: "currency", currency: "EUR", useGrouping: "always" }).format(c.costo_totale)}</span>
                    )}
                    <span>{format(new Date(c.created_at), "d MMM yyyy", { locale: dateFnsCampo() })}</span>
                  </div>
                </div>
                <div className="flex gap-1 shrink-0">
                  {(c.stato === "bozza" || c.stato === "pianificata") && (
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button variant="outline" size="sm" className="h-7 text-xs gap-1" disabled={isAvviando && avviandoId === c.id}>
                          {isAvviando && avviandoId === c.id
                            ? <Loader2 className="h-3 w-3 animate-spin" />
                            : <Play className="h-3 w-3" />
                          }
                          {t("Avvia")}
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>{t("Avviare \"{nome}\"?", { nome: c.nome })}</AlertDialogTitle>
                          <AlertDialogDescription>{t("La campagna SMS verrà inviata immediatamente ai destinatari con consenso marketing.")}</AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>{t("Annulla")}</AlertDialogCancel>
                          <AlertDialogAction onClick={() => handleAvvia(c.id)}>{t("Avvia")}</AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  )}
                  {c.stato === "in_corso" && (
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button variant="outline" size="sm" className="h-7 text-xs gap-1 text-destructive hover:text-destructive" disabled={isAnnullando && annullandoId === c.id}>
                          <XCircle className="h-3 w-3" /> {t("Annulla")}
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>{t("Annullare la campagna?")}</AlertDialogTitle>
                          <AlertDialogDescription>{t("Gli SMS non ancora inviati non verranno spediti.")}</AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>{t("Indietro")}</AlertDialogCancel>
                          <AlertDialogAction
                            className="bg-destructive text-destructive-foreground"
                            onClick={() => { setAnnullandoId(c.id); annulla(c.id).finally(() => setAnnullandoId(null)); }}
                          >
                            {t("Annulla campagna")}
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  )}
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 text-xs"
                    onClick={() => setDetailCampagna(c)}
                  >
                    <BarChart3 className="h-3 w-3 mr-1" /> {t("Log")}
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        ))
      )}

      {/* Detail sheet */}
      <Sheet open={!!detailCampagna} onOpenChange={(o) => { if (!o) setDetailCampagna(null); }}>
        <SheetContent className="w-full sm:max-w-2xl overflow-y-auto">
          <SheetHeader>
            <SheetTitle>{t("Dettaglio campagna")}</SheetTitle>
          </SheetHeader>
          <div className="mt-4">
            {detailCampagna && <SmsCampagnaDetail campagna={detailCampagna} />}
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}
