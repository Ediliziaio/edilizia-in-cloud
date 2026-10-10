// Impostazioni → CRM & Vendite → Motivi di perdita.
// Route protetta in companyRoutes.tsx con withCompanyPermission("canViewSettingsCustomization").
import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { AvvisoSolaLettura } from "@/components/common/AvvisoSolaLettura";
import { useSettingsDraftGuard } from "@/hooks/useSettingsDraftGuard";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Check, Loader2, Lock, Pencil, Plus, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { usePermissions } from "@/hooks/usePermissions";
import {
  useAddLossReason, useDeleteLossReason, useLossReasons, useLossReasonUsage, useRenameLossReason,
  type MotivoPerdita,
} from "@/hooks/useLossReasons";

const messaggio = (e: unknown) => (e instanceof Error ? e.message : String(e));

export default function SettingsMotiviPerdita() {
  const permissions = usePermissions();
  const { motivi, isLoading, isError, refetch } = useLossReasons();
  const { data: utilizzo, isError: usageError, isLoading: usageLoading, refetch: refetchUsage } = useLossReasonUsage();
  // Chi può modificare per permesso (a prescindere dal caricamento): serve a dire, a chi non può, perché mancano i comandi.
  const puoModificare = !permissions.isLoading && (permissions.isAdmin || permissions.canEditSettingsCustomization);
  const canEdit = puoModificare && !isLoading && !isError;
  const aggiungi = useAddLossReason();
  const rinomina = useRenameLossReason();
  const elimina = useDeleteLossReason();
  const busy = aggiungi.isPending || rinomina.isPending || elimina.isPending;

  const [nuovo, setNuovo] = useState("");
  const [inModifica, setInModifica] = useState<{ id: string; label: string } | null>(null);
  const [daEliminare, setDaEliminare] = useState<MotivoPerdita | null>(null);
  const confermaUscita = useSettingsDraftGuard(!!nuovo.trim() || !!inModifica || busy);

  const standard = motivi.filter((m) => m.predefinito);
  const aziendali = motivi.filter((m) => !m.predefinito);
  const usi = (m: MotivoPerdita) => utilizzo?.[m.value] ?? 0;

  const salvaNuovo = () => {
    if (!canEdit || busy || !nuovo.trim()) return;
    aggiungi.mutate(nuovo, {
      onSuccess: (label) => { setNuovo(""); toast.success(`«${label}» aggiunto`); },
      onError: (e) => toast.error("Motivo non aggiunto", { description: messaggio(e) }),
    });
  };

  const salvaNome = () => {
    if (!inModifica || !canEdit || busy) return;
    rinomina.mutate(inModifica, {
      onSuccess: ({ label, opportunita }) => {
        setInModifica(null);
        toast.success(`Rinominato in «${label}»`, {
          description: opportunita > 0 ? `Aggiornate anche ${opportunita} opportunità già perse.` : undefined,
        });
      },
      onError: (e) => toast.error("Nome non cambiato", { description: messaggio(e) }),
    });
  };

  const riga = (m: MotivoPerdita) => {
    const modifica = inModifica && m.id === inModifica.id;
    return (
      <li key={m.value} className="flex flex-wrap items-center gap-2 py-2 px-1 min-h-[44px]">
        {modifica ? (
          <Input
            autoFocus
            aria-label={`Nome motivo ${m.label}`}
            disabled={busy}
            value={inModifica.label}
            onChange={(e) => setInModifica({ ...inModifica, label: e.target.value })}
            onKeyDown={(e) => {
              if (e.key === "Enter") salvaNome();
              if (e.key === "Escape") setInModifica(null);
            }}
            className="h-8 text-sm flex-1 max-md:h-11"
          />
        ) : (
          <span className="min-w-0 flex-1 break-words text-sm">{m.label}</span>
        )}
        <span className="text-xs text-muted-foreground tabular-nums whitespace-nowrap">
          {usageError || usageLoading ? "Utilizzi non disponibili" : usi(m) === 1 ? "1 opportunità" : `${usi(m)} opportunità`}
        </span>
        {m.predefinito ? (
          <Lock className="h-3.5 w-3.5 text-muted-foreground" aria-label="Motivo standard" />
        ) : !canEdit ? null : modifica ? (
          <fieldset disabled={busy} className="m-0 min-w-0 border-0 p-0 flex gap-1">
            <Button size="icon" variant="ghost" className="h-8 w-8 max-md:h-11 max-md:w-11" onClick={salvaNome} disabled={rinomina.isPending} aria-label="Salva nome">
              {rinomina.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
            </Button>
            <Button size="icon" variant="ghost" className="h-8 w-8 max-md:h-11 max-md:w-11" onClick={() => setInModifica(null)} aria-label="Annulla">
              <X className="h-4 w-4" />
            </Button>
          </fieldset>
        ) : (
          <fieldset disabled={busy} className="m-0 min-w-0 border-0 p-0 flex gap-1">
            <Button size="icon" variant="ghost" className="h-8 w-8 max-md:h-11 max-md:w-11" onClick={() => { if (confermaUscita()) setInModifica({ id: m.id!, label: m.label }); }} aria-label={`Rinomina ${m.label}`}>
              <Pencil className="h-4 w-4" />
            </Button>
            <Button size="icon" variant="ghost" className="h-8 w-8 text-destructive max-md:h-11 max-md:w-11" onClick={() => setDaEliminare(m)} aria-label={`Togli ${m.label}`}>
              <Trash2 className="h-4 w-4" />
            </Button>
          </fieldset>
        )}
      </li>
    );
  };

  return (
    <div className="space-y-4 max-w-2xl">
      <Card>
        <CardHeader className="pb-3">
          <CardDescription>
            Compaiono nella finestra che si apre quando segni un'opportunità come persa. Quelli standard sono comuni
            a tutte le aziende; puoi aggiungere quelli del tuo lavoro.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          {!puoModificare && !permissions.isLoading && (
            <AvvisoSolaLettura>
              Sola lettura: per aggiungere, rinominare o togliere un motivo serve il permesso «Modifica» su Personalizzazione.
            </AvvisoSolaLettura>
          )}
          {isError && <Alert variant="destructive"><AlertDescription>Motivi aziendali non disponibili. Restano visibili solo gli standard.<Button size="sm" variant="outline" onClick={() => refetch()} className="max-md:h-11">Riprova motivi</Button></AlertDescription></Alert>}
          {usageError && <Alert><AlertDescription>Conteggi non disponibili.<Button size="sm" variant="ghost" onClick={() => refetchUsage()} className="max-md:h-11">Ricalcola utilizzi</Button></AlertDescription></Alert>}

          <section aria-labelledby="motivi-azienda-titolo">
            <div className="flex items-center gap-2 mb-1">
              <h2 id="motivi-azienda-titolo" className="text-sm font-semibold">Della tua azienda</h2>
              <Badge variant="secondary" className="text-[10px]">{aziendali.length}</Badge>
            </div>
            {/* Il campo per aggiungere sta subito sotto il titolo: prima si scorrevano sette righe fisse. */}
            {canEdit && (
              <div className="flex gap-2 mt-2 mb-1">
                <Input
                  id="nuovo-motivo-perdita"
                  placeholder="Nuovo motivo…"
                  aria-label="Nuovo motivo di perdita"
                  disabled={busy}
                  value={nuovo}
                  onChange={(e) => setNuovo(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter" && nuovo.trim()) salvaNuovo(); }}
                  className="h-9 max-md:h-11"
                />
                <Button size="sm" onClick={salvaNuovo} disabled={!nuovo.trim() || busy} className="h-9 shrink-0 max-md:h-11">
                  {aggiungi.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Plus className="h-4 w-4 mr-1" />}
                  Aggiungi
                </Button>
              </div>
            )}
            {isLoading ? (
              <Skeleton className="h-10 w-full" />
            ) : isError ? null : aziendali.length === 0 ? (
              <p className="text-sm text-muted-foreground py-2">
                Nessun motivo aggiunto. Esempi: «Misure non realizzabili», «Condominio non delibera».
              </p>
            ) : (
              <ul className="divide-y">{aziendali.map(riga)}</ul>
            )}
          </section>

          {/* I sette motivi standard non si cambiano: chiusi, per non far scorrere sette righe fisse prima di arrivare ai propri. */}
          <details className="group rounded-md border">
            <summary className="flex cursor-pointer list-none items-center gap-2 px-3 py-2 max-md:min-h-11">
              <h2 className="text-sm font-semibold">Motivi standard</h2>
              <Badge variant="secondary" className="text-[10px]">{standard.length}</Badge>
              <span className="ml-auto text-xs text-muted-foreground group-open:hidden">Mostra</span>
              <span className="ml-auto hidden text-xs text-muted-foreground group-open:inline">Nascondi</span>
            </summary>
            <div className="border-t px-3 pb-2">
              <p className="py-2 text-xs text-muted-foreground">Sono uguali per tutte le aziende e non si cambiano.</p>
              <ul className="divide-y">{standard.map(riga)}</ul>
            </div>
          </details>
        </CardContent>
      </Card>

      <AlertDialog open={!!daEliminare} onOpenChange={(o) => { if (!o) setDaEliminare(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Togliere «{daEliminare?.label}»?</AlertDialogTitle>
            <AlertDialogDescription>
              Non si potrà più scegliere per le nuove perdite.
              {daEliminare && !usageError && !usageLoading && usi(daEliminare) > 0
                ? ` Le ${usi(daEliminare)} opportunità che lo usano già lo tengono, e i report continuano a contarle.`
                : " Le opportunità già perse conservano il motivo e la storia dei report."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annulla</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={busy || !canEdit}
              onClick={() => {
                const m = daEliminare;
                if (!m?.id || !canEdit || busy) return;
                elimina.mutate(m.id, {
                  onSuccess: () => toast.success(`«${m.label}» tolto`),
                  onError: (e) => toast.error("Motivo non tolto", { description: messaggio(e) }),
                });
              }}
            >
              Togli
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
