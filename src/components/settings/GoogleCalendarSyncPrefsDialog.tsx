import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { EyeOff, Lock } from "lucide-react";
import { DIREZIONI_SYNC, direzioneDaModo, modoDaDirezione, type DirezioneSync } from "@/lib/calendar/direzioneSync";
import { cn } from "@/lib/utils";

interface SyncPrefsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  syncMode: string;
  /** Direzione salvata nelle preferenze utente: se manca si deduce da syncMode. */
  direzione?: DirezioneSync | null;
  importGoogleEvents: boolean;
  createContactsFromGuests: boolean;
  /** 2026-05-26: privacy events Google → mostra solo "Occupato" */
  eventPrivacy: "full" | "busy_only";
  allowTwoWay: boolean;
  allowGuestContactCreate: boolean;
  allowGoogleToImport: boolean;
  onSave: (prefs: {
    sync_mode: string;
    sync_direction: DirezioneSync;
    import_google_events_to_crm: boolean;
    create_contacts_from_guests: boolean;
    event_privacy: "full" | "busy_only";
  }) => void;
  isSaving: boolean;
}

export default function GoogleCalendarSyncPrefsDialog(props: SyncPrefsDialogProps) {
  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Preferenze di sincronizzazione</DialogTitle>
        </DialogHeader>
        {/* Il contenuto nasce all'apertura: cosi' parte dai valori salvati
            senza un effetto che ricopia i prop nello stato a ogni render. */}
        {props.open && <ContenutoPreferenze {...props} />}
      </DialogContent>
    </Dialog>
  );
}

function ContenutoPreferenze({
  onOpenChange,
  syncMode,
  direzione,
  importGoogleEvents,
  createContactsFromGuests,
  eventPrivacy,
  allowTwoWay,
  allowGuestContactCreate,
  allowGoogleToImport,
  onSave,
  isSaving,
}: SyncPrefsDialogProps) {
  const [scelta, setScelta] = useState<DirezioneSync>(direzione || direzioneDaModo(syncMode));
  const [importEvents, setImportEvents] = useState(importGoogleEvents);
  const [createContacts, setCreateContacts] = useState(createContactsFromGuests);
  const [busyOnly, setBusyOnly] = useState(eventPrivacy === "busy_only");

  // La piattaforma può chiudere il ritorno Google → EiC: in quel caso restano
  // solo le direzioni che scrivono su Google.
  const importaDaGoogle = scelta === "both" || scelta === "from_google";

  return (
    <>
        <div className="space-y-4 py-2">
          <p className="text-sm text-muted-foreground">
            In che verso devono muoversi gli appuntamenti fra il gestionale e il tuo Google Calendar.
          </p>

          <div className="space-y-2">
            {DIREZIONI_SYNC.map((opt) => {
              const bloccata = !allowTwoWay && opt.value !== "to_google";
              const attiva = scelta === opt.value;
              return (
                <label
                  key={opt.value}
                  className={cn(
                    "flex items-start gap-3 rounded-lg border-2 p-3 transition-colors",
                    bloccata ? "cursor-not-allowed opacity-50" : "cursor-pointer",
                    attiva ? "border-primary bg-primary/5" : "border-border",
                  )}
                  onClick={() => !bloccata && setScelta(opt.value)}
                >
                  <input
                    type="radio"
                    name="direzione_sync"
                    checked={attiva}
                    onChange={() => !bloccata && setScelta(opt.value)}
                    disabled={bloccata}
                    className="mt-1"
                  />
                  <div className="flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-medium">{opt.label}</span>
                      {opt.value === "both" && !bloccata && (
                        <Badge variant="secondary" className="text-xs">Consigliata</Badge>
                      )}
                      {bloccata && (
                        <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                          <Lock className="h-3 w-3" /> disattivata dalla piattaforma
                        </span>
                      )}
                    </div>
                    <p className="mt-1 text-sm text-muted-foreground">{opt.descrizione}</p>
                  </div>
                </label>
              );
            })}
          </div>

          {importaDaGoogle && (allowGoogleToImport || allowGuestContactCreate) && (
            <div className="space-y-4 border-l-2 border-primary/20 pl-4">
              {allowGoogleToImport && (
                <div className="flex items-center justify-between gap-4">
                  <Label htmlFor="import-events" className="cursor-pointer text-sm">
                    Importa eventi Google come appuntamenti
                    <p className="mt-0.5 text-xs font-normal text-muted-foreground">
                      Solo eventi con prefisso [CRM] o crm_sync=true
                    </p>
                  </Label>
                  <Switch id="import-events" checked={importEvents} onCheckedChange={setImportEvents} />
                </div>
              )}
              {allowGuestContactCreate && (
                <div className="flex items-center justify-between gap-4">
                  <Label htmlFor="create-contacts" className="cursor-pointer text-sm">
                    Crea contatti dagli invitati Google
                  </Label>
                  <Switch id="create-contacts" checked={createContacts} onCheckedChange={setCreateContacts} />
                </div>
              )}
            </div>
          )}

          {/* 2026-05-26: privacy eventi Google — vale in ogni direzione, perché
              gli impegni personali entrano comunque come fasce occupate. */}
          <div className="rounded-lg border border-amber-200 bg-amber-50/50 p-3">
            <div className="flex items-start justify-between gap-3">
              <Label htmlFor="busy-only" className="flex-1 cursor-pointer text-sm">
                <span className="inline-flex items-center gap-1.5 font-semibold">
                  <EyeOff className="h-3.5 w-3.5 text-amber-700" />
                  Mostra gli eventi Google come "Occupato"
                </span>
                <p className="mt-1 text-xs font-normal text-muted-foreground">
                  I tuoi appuntamenti personali ("Dentista", "Cena con Marco") appaiono nel gestionale
                  solo come <strong>"Occupato"</strong>: i colleghi vedono che sei impegnato, non cosa fai.
                </p>
              </Label>
              <Switch id="busy-only" checked={busyOnly} onCheckedChange={setBusyOnly} />
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Annulla
          </Button>
          <Button
            onClick={() =>
              onSave({
                sync_mode: modoDaDirezione(scelta),
                sync_direction: scelta,
                import_google_events_to_crm: importaDaGoogle ? importEvents : false,
                create_contacts_from_guests: importaDaGoogle ? createContacts : false,
                event_privacy: busyOnly ? "busy_only" : "full",
              })
            }
            disabled={isSaving}
          >
            {isSaving ? "Salvataggio..." : "Salva"}
          </Button>
        </DialogFooter>
    </>
  );
}
