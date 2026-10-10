/**
 * Gli avvisi per evento che partono davvero: messaggi ed email dei contatti in Conversazioni, attività
 * assegnate, in scadenza e in ritardo.
 *
 * Un solo componente per tutti i posti in cui si regolano: la pagina Notifiche e, nel campo e nel team della
 * piattaforma, la scheda Notifiche del profilo. Prima il profilo aveva una copia con ventitré interruttori, di
 * cui quindici non comandavano niente, e da telefono le tre email delle attività non si raggiungevano più.
 *
 * Due colonne: «Nell'app» (la campanella: colonne `*_in_app` di user_notification_preferences; le leggono
 * avvisa_messaggi_conversazioni(), il promemoria giornaliero delle attività e l'assegnazione, migrazioni
 * 20280903110000 e 20280903320000) ed «Email» (solo le tre delle attività: `task-riepilogo-email` manda UNA
 * email al mattino con quelle assegnate nelle ultime 24 ore, quelle che scadono oggi e quelle già scadute). Le
 * altre colonne della tabella non le legge nessuno e qui non compaiono.
 *
 * Si salva subito, e sempre l'intera riga: finché le preferenze non sono arrivate gli interruttori restano
 * fermi, altrimenti si scriverebbero i valori di serie sopra quelli della persona. «Disattiva tutto» scrive UNA
 * volta sola: due scritture di fila partivano dalla stessa copia vecchia e la seconda rimetteva com'era la prima.
 */
import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { AlarmClock, CheckSquare, Clock, Inbox, MessageSquare, type LucideIcon } from "lucide-react";
import { toast } from "sonner";
import { AmbitoImpostazione, SezioneImpostazione } from "@/components/impostazioni/SezioneImpostazione";
import { NotificheSuQuestoDispositivo } from "@/components/notifications/NotificheSuQuestoDispositivo";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { useAuth } from "@/contexts/AuthContext";
import {
  useSaveUserNotifPrefs,
  useUserNotifPrefs,
  type NotifPrefs,
} from "@/hooks/useUserNotificationPrefs";
import { motivoDelRifiuto } from "@/lib/impostazioni/erroriPerUtente";

type ChiaveApp =
  | "message_whatsapp_in_app"
  | "message_email_received_in_app"
  | "task_assigned_in_app"
  | "task_due_soon_in_app"
  | "task_overdue_in_app";
type ChiaveEmail = "task_assigned_email" | "task_due_soon_email" | "task_overdue_email";
type Chiave = ChiaveApp | ChiaveEmail;

const AVVISI: { app: ChiaveApp; email?: ChiaveEmail; icona: LucideIcon; etichetta: string; dettaglio: string }[] = [
  {
    app: "message_whatsapp_in_app",
    icona: MessageSquare,
    etichetta: "Messaggi dai contatti",
    dettaglio: "WhatsApp, SMS, Messenger e Instagram in Conversazioni",
  },
  {
    app: "message_email_received_in_app",
    icona: Inbox,
    etichetta: "Email dai contatti",
    dettaglio: "Email di contatti e clienti in Conversazioni",
  },
  {
    app: "task_assigned_in_app",
    email: "task_assigned_email",
    icona: CheckSquare,
    etichetta: "Attività assegnate a te",
    dettaglio: "Quando qualcuno ti assegna un'attività o un sopralluogo",
  },
  {
    app: "task_due_soon_in_app",
    email: "task_due_soon_email",
    icona: Clock,
    etichetta: "Attività in scadenza",
    dettaglio: "Quelle che scadono oggi",
  },
  {
    app: "task_overdue_in_app",
    email: "task_overdue_email",
    icona: AlarmClock,
    etichetta: "Attività in ritardo",
    dettaglio: "Quelle già scadute",
  },
];

/** Tutti i comandi di questa pagina: sono quelli che «Disattiva tutto» spegne. */
const CHIAVI_AVVISI: Chiave[] = AVVISI.flatMap((a) => (a.email ? [a.app, a.email] : [a.app]));

const RIGA = "grid grid-cols-[minmax(0,1fr)_3.5rem_3.5rem] items-center gap-x-2 px-4 max-sm:px-3";

export function AvvisiPerEvento({ conDispositivo = true, evidenziata = false }: { conDispositivo?: boolean; evidenziata?: boolean } = {}) {
  const { user, effectiveCompany, profile } = useAuth();
  const companyId = effectiveCompany?.id ?? profile?.company_id ?? undefined;
  const { data: prefs } = useUserNotifPrefs(user?.id);
  const salva = useSaveUserNotifPrefs(user?.id, companyId);
  const queryClient = useQueryClient();
  const chiavePrefs = ["user-notif-prefs", user?.id];
  // I valori appena toccati, finché il salvataggio non torna.
  const [inCorso, setInCorso] = useState<Partial<Record<Chiave, boolean>>>({});

  const valore = (chiave: Chiave) => inCorso[chiave] ?? Boolean(prefs?.[chiave]);

  const scrivi = async (modifiche: Partial<Record<Chiave, boolean>>) => {
    if (!prefs) return;
    setInCorso((prima) => ({ ...prima, ...modifiche }));
    // Una scrittura sola, anche se le colonne sono più d'una; i tocchi ancora in volo (`inCorso`) ci sono già.
    const prossime: NotifPrefs = { ...prefs, ...inCorso, ...modifiche };
    try {
      await salva.mutateAsync(prossime);
      // Subito in cache: finché la rilettura non torna, un secondo tocco
      // partirebbe dai valori vecchi e rimetterebbe indietro questo.
      queryClient.setQueryData(chiavePrefs, prossime);
    } catch (errore) {
      toast.error("Non sono riuscito a salvare", { description: motivoDelRifiuto(errore, "Riprova tra qualche secondo.") });
    } finally {
      setInCorso((prima) => {
        const resto = { ...prima };
        for (const chiave of Object.keys(modifiche) as Chiave[]) delete resto[chiave];
        return resto;
      });
    }
  };

  // Finché le preferenze non sono arrivate il pulsante dice «Disattiva tutto» (e sta fermo): non sappiamo ancora com'è.
  const tuttoSpento = !!prefs && CHIAVI_AVVISI.every((chiave) => !valore(chiave));
  const cambiaTutto = () => scrivi(Object.fromEntries(CHIAVI_AVVISI.map((chiave) => [chiave, tuttoSpento])));

  return (
    <SezioneImpostazione
      id="avvisi"
      titolo="Avvisi"
      descrizione="Arrivano nella campanella in alto e, se vuoi, anche con l'app chiusa. Le email sono un riepilogo al mattino. Si salvano da soli."
      ambito={<AmbitoImpostazione>Per te</AmbitoImpostazione>}
      evidenziata={evidenziata}
      azione={
        <Button type="button" size="sm" variant="outline" className="h-8 px-3 text-xs" disabled={!prefs || salva.isPending} onClick={cambiaTutto}>
          {tuttoSpento ? "Attiva tutto" : "Disattiva tutto"}
        </Button>
      }
    >
      {conDispositivo && (
        <div className="px-4 py-3 max-sm:px-3">
          {/* Prima di tutto: arrivano anche ad app chiusa? (per questo dispositivo) */}
          <NotificheSuQuestoDispositivo />
        </div>
      )}
      <div className={`${RIGA} py-2 text-[11px] font-medium uppercase tracking-wide text-muted-foreground`} aria-hidden="true">
        <span />
        <span className="text-center">Nell'app</span>
        <span className="text-center">Email</span>
      </div>
      {AVVISI.map(({ app, email, icona: Icona, etichetta, dettaglio }) => (
        <div key={app} className={`${RIGA} py-3 max-sm:py-2.5`}>
          <div className="flex min-w-0 items-start gap-3">
            <Icona className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
            <div className="min-w-0">
              <p className="text-sm font-medium leading-snug">{etichetta}</p>
              <p className="mt-0.5 text-xs text-muted-foreground max-sm:hidden">{dettaglio}</p>
            </div>
          </div>
          <div className="flex justify-center">
            <Switch
              checked={valore(app)}
              disabled={!prefs}
              onCheckedChange={(acceso) => void scrivi({ [app]: acceso })}
              aria-label={`${etichetta}, nell'app`}
            />
          </div>
          <div className="flex justify-center">
            {email ? (
              <Switch
                checked={valore(email)}
                disabled={!prefs}
                onCheckedChange={(acceso) => void scrivi({ [email]: acceso })}
                aria-label={`${etichetta}, per email`}
              />
            ) : (
              <span className="text-muted-foreground/40" aria-hidden="true">—</span>
            )}
          </div>
        </div>
      ))}
    </SezioneImpostazione>
  );
}
