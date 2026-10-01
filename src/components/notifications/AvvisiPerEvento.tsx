/**
 * Gli avvisi per evento che partono davvero (26/09/2026): messaggi ed email dei
 * contatti in Conversazioni, attività assegnate, in scadenza e in ritardo.
 *
 * Accendono o spengono la campanella: sono le colonne `*_in_app` di
 * user_notification_preferences, le stesse della scheda Notifiche del profilo.
 * Chi le legge: avvisa_messaggi_conversazioni() per i messaggi, il promemoria
 * giornaliero delle attività e l'assegnazione (migrazioni 20280903110000 e
 * 20280903320000). Le altre colonne della tabella non le legge nessuno, quindi
 * qui non compaiono.
 *
 * Si salva subito. Il salvataggio scrive l'intera riga: finché le preferenze non
 * sono arrivate gli interruttori restano fermi, altrimenti si scriverebbero i
 * valori di serie sopra quelli della persona.
 */
import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { AlarmClock, Bell, CheckSquare, Clock, Inbox, MessageSquare, type LucideIcon } from "lucide-react";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { NotificheSuQuestoDispositivo } from "@/components/notifications/NotificheSuQuestoDispositivo";
import { useAuth } from "@/contexts/AuthContext";
import {
  useSaveUserNotifPrefs,
  useUserNotifPrefs,
  type NotifPrefs,
} from "@/hooks/useUserNotificationPrefs";

type Chiave =
  | "message_whatsapp_in_app"
  | "message_email_received_in_app"
  | "task_assigned_in_app"
  | "task_due_soon_in_app"
  | "task_overdue_in_app";

const AVVISI: { chiave: Chiave; icona: LucideIcon; etichetta: string; dettaglio: string }[] = [
  {
    chiave: "message_whatsapp_in_app",
    icona: MessageSquare,
    etichetta: "Messaggi dai contatti",
    dettaglio: "WhatsApp, SMS, Messenger e Instagram in Conversazioni",
  },
  {
    chiave: "message_email_received_in_app",
    icona: Inbox,
    etichetta: "Email dai contatti",
    dettaglio: "Email di contatti e clienti in Conversazioni",
  },
  {
    chiave: "task_assigned_in_app",
    icona: CheckSquare,
    etichetta: "Attività assegnate a te",
    dettaglio: "Quando qualcuno ti assegna un'attività o un sopralluogo",
  },
  {
    chiave: "task_due_soon_in_app",
    icona: Clock,
    etichetta: "Attività in scadenza",
    dettaglio: "Il promemoria del mattino per quelle che scadono oggi",
  },
  {
    chiave: "task_overdue_in_app",
    icona: AlarmClock,
    etichetta: "Attività in ritardo",
    dettaglio: "Il promemoria del mattino per quelle già scadute",
  },
];

export function AvvisiPerEvento() {
  const { user, effectiveCompany, profile } = useAuth();
  const companyId = effectiveCompany?.id ?? profile?.company_id ?? undefined;
  const { data: prefs } = useUserNotifPrefs(user?.id);
  const salva = useSaveUserNotifPrefs(user?.id, companyId);
  const queryClient = useQueryClient();
  // Il valore appena toccato, finché il salvataggio non torna.
  const [inCorso, setInCorso] = useState<Partial<Record<Chiave, boolean>>>({});

  const cambia = async (chiave: Chiave, valore: boolean) => {
    if (!prefs) return;
    setInCorso((prima) => ({ ...prima, [chiave]: valore }));
    const prossime: NotifPrefs = { ...prefs, ...inCorso, [chiave]: valore };
    try {
      await salva.mutateAsync(prossime);
      // Subito in cache: finché la rilettura non torna, un secondo tocco
      // partirebbe dai valori vecchi e rimetterebbe indietro questo.
      queryClient.setQueryData(["user-notif-prefs", user?.id], prossime);
    } catch (errore) {
      toast.error("Non sono riuscito a salvare", {
        description: errore instanceof Error ? errore.message : "Riprova tra qualche secondo.",
      });
    } finally {
      setInCorso((prima) => {
        const { [chiave]: _tolta, ...resto } = prima;
        return resto;
      });
    }
  };

  return (
    <Card>
      <CardHeader className="pb-2 max-sm:px-3 max-sm:pt-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <Bell className="h-4 w-4 text-violet-600" /> Avvisi
        </CardTitle>
        <p className="text-xs text-muted-foreground max-sm:hidden">
          Arrivano nella campanella in alto e, se lo accendi, anche sul telefono. Le modifiche si salvano da sole.
        </p>
      </CardHeader>
      <CardContent className="p-0">
        <ul className="divide-y border-t">
          {/* Prima di tutto: arrivano anche ad app chiusa? (per questo dispositivo) */}
          <li className="px-6 py-2.5 max-sm:px-3 max-sm:py-2">
            <NotificheSuQuestoDispositivo />
          </li>
          {AVVISI.map(({ chiave, icona: Icona, etichetta, dettaglio }) => {
            const acceso = inCorso[chiave] ?? Boolean(prefs?.[chiave]);
            return (
              <li key={chiave} className="flex items-center gap-3 px-6 py-2.5 max-sm:px-3 max-sm:py-2">
                <Icona className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                <div className="min-w-0 flex-1">
                  <p className="text-sm">{etichetta}</p>
                  <p className="text-xs text-muted-foreground max-sm:hidden">{dettaglio}</p>
                </div>
                <Switch
                  checked={acceso}
                  disabled={!prefs}
                  onCheckedChange={(valore) => void cambia(chiave, valore)}
                  aria-label={etichetta}
                />
              </li>
            );
          })}
        </ul>
      </CardContent>
    </Card>
  );
}
