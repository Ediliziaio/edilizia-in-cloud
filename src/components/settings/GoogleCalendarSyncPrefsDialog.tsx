import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Eye, Lock } from "lucide-react";
import { DIREZIONI_SYNC, direzioneDaModo, modoDaDirezione, type DirezioneSync } from "@/lib/calendar/direzioneSync";
import { cn } from "@/lib/utils";

/**
 * Preferenze del collegamento con Google Calendar.
 *
 * 09/10/2026: due comandi sono usciti perché nessun codice li leggeva. «Crea contatti dagli invitati Google»
 * (`create_contacts_from_guests`) non creava nessun contatto; «Mostra gli eventi Google come "Occupato"»
 * (`event_privacy`) prometteva ai colleghi un "Occupato" che non c'è: `google-calendar-sync` salva il titolo vero
 * di ogni evento e i colleghi lo leggono. Le colonne restano dov'erano, il salvataggio non le tocca più, e al
 * posto dell'interruttore c'è la riga che dice come stanno le cose.
 */
interface SyncPrefsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  syncMode: string;
  /** Direzione salvata nelle preferenze utente: se manca si deduce da syncMode. */
  direzione?: DirezioneSync | null;
  importGoogleEvents: boolean;
  allowTwoWay: boolean;
  allowGoogleToImport: boolean;
  onSave: (prefs: {
    sync_mode: string;
    sync_direction: DirezioneSync;
    import_google_events_to_crm: boolean;
  }) => void;
  isSaving: boolean;
}

export default function GoogleCalendarSyncPrefsDialog(props: SyncPrefsDialogProps) {
  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Preferenze del calendario</DialogTitle>
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
  allowTwoWay,
  allowGoogleToImport,
  onSave,
  isSaving,
}: SyncPrefsDialogProps) {
  const [scelta, setScelta] = useState<DirezioneSync>(direzione || direzioneDaModo(syncMode));
  const [importEvents, setImportEvents] = useState(importGoogleEvents);

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

          {importaDaGoogle && allowGoogleToImport && (
            <div className="flex items-start justify-between gap-4 border-l-2 border-primary/20 pl-4">
              <Label htmlFor="import-events" className="cursor-pointer text-sm leading-snug">
                Importa tutti gli eventi di Google come appuntamenti
                <span className="mt-0.5 block text-xs font-normal text-muted-foreground">
                  Se è acceso, ogni evento del tuo Google Calendar diventa un appuntamento nel gestionale, anche quelli
                  personali. Se è spento, entrano solo gli eventi che iniziano con [CRM].
                </span>
              </Label>
              <Switch id="import-events" checked={importEvents} onCheckedChange={setImportEvents} className="mt-0.5" />
            </div>
          )}

          {/* Vale in ogni direzione: gli impegni personali entrano comunque come fasce occupate, col loro titolo. */}
          <p className="flex items-start gap-2 rounded-lg bg-muted/50 p-3 text-xs text-muted-foreground">
            <Eye className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            Per ora i colleghi dell'azienda vedono il titolo degli eventi di Google nel calendario.
          </p>
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
