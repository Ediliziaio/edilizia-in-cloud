import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { CalendarDays, ArrowRight, Ban, EyeOff } from "lucide-react";

interface SyncPrefsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  syncMode: string;
  importGoogleEvents: boolean;
  createContactsFromGuests: boolean;
  /** 2026-05-26: privacy events Google → mostra solo "Occupato" */
  eventPrivacy: "full" | "busy_only";
  allowTwoWay: boolean;
  allowGuestContactCreate: boolean;
  allowGoogleToImport: boolean;
  onSave: (prefs: {
    sync_mode: string;
    import_google_events_to_crm: boolean;
    create_contacts_from_guests: boolean;
    event_privacy: "full" | "busy_only";
  }) => void;
  isSaving: boolean;
}

export default function GoogleCalendarSyncPrefsDialog({
  open,
  onOpenChange,
  syncMode,
  importGoogleEvents,
  createContactsFromGuests,
  eventPrivacy,
  allowTwoWay,
  allowGuestContactCreate,
  allowGoogleToImport,
  onSave,
  isSaving,
}: SyncPrefsDialogProps) {
  const [mode, setMode] = useState(syncMode);
  const [importEvents, setImportEvents] = useState(importGoogleEvents);
  const [createContacts, setCreateContacts] = useState(createContactsFromGuests);
  const [busyOnly, setBusyOnly] = useState(eventPrivacy === "busy_only");

  useEffect(() => {
    setMode(syncMode);
    setImportEvents(importGoogleEvents);
    setCreateContacts(createContactsFromGuests);
    setBusyOnly(eventPrivacy === "busy_only");
  }, [syncMode, importGoogleEvents, createContactsFromGuests, eventPrivacy, open]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Preferenze di sincronizzazione</DialogTitle>
        </DialogHeader>

        <div className="space-y-6 py-4">
          {/* Illustration */}
          <div className="flex items-center justify-center gap-3 py-4 px-6 rounded-lg bg-muted/50">
            <div className="flex flex-col items-center gap-1">
              <CalendarDays className="h-8 w-8 text-primary" />
              <span className="text-xs text-muted-foreground">Google</span>
            </div>
            <ArrowRight className="h-5 w-5 text-muted-foreground" />
            <div className="flex flex-col items-center gap-1">
              <Ban className="h-8 w-8 text-destructive/60" />
              <span className="text-xs text-muted-foreground">Slot bloccati</span>
            </div>
          </div>

          {/* One-way option */}
          <label
            className={`flex items-start gap-3 p-4 rounded-lg border-2 cursor-pointer transition-colors ${
              mode === "one_way" ? "border-primary bg-primary/5" : "border-border"
            }`}
            onClick={() => setMode("one_way")}
          >
            <input
              type="radio"
              name="sync_mode"
              checked={mode === "one_way"}
              onChange={() => setMode("one_way")}
              className="mt-1"
            />
            <div className="flex-1">
              <div className="flex items-center gap-2">
                <span className="font-medium">Sincronizzazione predefinita</span>
                <Badge variant="secondary" className="text-xs">Consigliato</Badge>
              </div>
              <p className="text-sm text-muted-foreground mt-1">
                Gli eventi di Google Calendar vengono importati come slot occupati (busy) nel CRM.
                Non vengono creati appuntamenti o contatti.
              </p>
            </div>
          </label>

          {/* Two-way option */}
          <label
            className={`flex items-start gap-3 p-4 rounded-lg border-2 transition-colors ${
              !allowTwoWay ? "opacity-50 cursor-not-allowed" : "cursor-pointer"
            } ${mode === "two_way" ? "border-primary bg-primary/5" : "border-border"}`}
            onClick={() => allowTwoWay && setMode("two_way")}
          >
            <input
              type="radio"
              name="sync_mode"
              checked={mode === "two_way"}
              onChange={() => allowTwoWay && setMode("two_way")}
              disabled={!allowTwoWay}
              className="mt-1"
            />
            <div className="flex-1">
              <span className="font-medium">Sincronizzazione bidirezionale</span>
              {!allowTwoWay && (
                <p className="text-xs text-muted-foreground mt-1">
                  Disabilitato dall'amministratore della piattaforma.
                </p>
              )}
              <p className="text-sm text-muted-foreground mt-1">
                Gli appuntamenti CRM vengono sincronizzati con Google Calendar e viceversa.
                Le modifiche su entrambi i lati vengono allineate.
              </p>
            </div>
          </label>

          {/* Extra toggles for two-way */}
          {mode === "two_way" && (
            <div className="space-y-4 pl-4 border-l-2 border-primary/20">
              {allowGoogleToImport && (
                <div className="flex items-center justify-between gap-4">
                  <Label htmlFor="import-events" className="text-sm cursor-pointer">
                    Importa eventi Google come appuntamenti CRM
                    <p className="text-xs text-muted-foreground font-normal mt-0.5">
                      Solo eventi con prefisso [CRM] o crm_sync=true
                    </p>
                  </Label>
                  <Switch
                    id="import-events"
                    checked={importEvents}
                    onCheckedChange={setImportEvents}
                  />
                </div>
              )}
              {allowGuestContactCreate && (
                <div className="flex items-center justify-between gap-4">
                  <Label htmlFor="create-contacts" className="text-sm cursor-pointer">
                    Crea contatti dagli invitati Google
                  </Label>
                  <Switch
                    id="create-contacts"
                    checked={createContacts}
                    onCheckedChange={setCreateContacts}
                  />
                </div>
              )}
            </div>
          )}

          {/* 2026-05-26: privacy events Google — sempre disponibile, anche
              quando sync_mode è one_way (perché gli eventi Google possono
              comunque essere mostrati nel calendario EiC come "busy slot"). */}
          <div className="rounded-lg border border-amber-200 bg-amber-50/50 p-3">
            <div className="flex items-start justify-between gap-3">
              <Label htmlFor="busy-only" className="text-sm cursor-pointer flex-1">
                <span className="inline-flex items-center gap-1.5 font-semibold">
                  <EyeOff className="h-3.5 w-3.5 text-amber-700" />
                  Mostra eventi Google come "Occupato"
                </span>
                <p className="text-xs text-muted-foreground font-normal mt-1">
                  Quando attivo, gli appuntamenti privati del tuo Google Calendar (es. "Dentista", "Cena con Marco") appariranno nel gestionale solo come <strong>"Occupato"</strong> senza titolo o dettagli. I tuoi colleghi vedono che sei impegnato ma non cosa stai facendo.
                </p>
              </Label>
              <Switch
                id="busy-only"
                checked={busyOnly}
                onCheckedChange={setBusyOnly}
              />
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
                sync_mode: mode,
                import_google_events_to_crm: mode === "two_way" ? importEvents : false,
                create_contacts_from_guests: mode === "two_way" ? createContacts : false,
                event_privacy: busyOnly ? "busy_only" : "full",
              })
            }
            disabled={isSaving}
          >
            {isSaving ? "Salvataggio..." : "Salva"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
