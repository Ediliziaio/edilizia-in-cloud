import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCompanyStaffUsers } from "@/hooks/useCompanyStaffUsers";
import { useGoogleCalendarSync } from "@/hooks/useGoogleCalendarSync";
import { Button } from "@/components/ui/button";
import { CalendarPlus, Info } from "lucide-react";
import { toast } from "sonner";
import MarketingAppointmentDialog from "@/components/marketing/MarketingAppointmentDialog";

/**
 * OutreachBookDemoAction — azione "Prenota demo" del flusso Outreach.
 *
 * RIUSA interamente l'infrastruttura appuntamenti esistente: NON crea una nuova
 * tabella né un nuovo flusso di sync. Monta {@link MarketingAppointmentDialog}
 * (la stessa dialog del Calendario CRM) precompilando il contatto del lead e un
 * titolo demo. La dialog:
 *   - inserisce in `appointments` (stessa tabella letta da /admin/marketing/calendario),
 *   - sincronizza con Google/Apple Calendar se l'utente è collegato (via
 *     useGoogleCalendarSync / useAppleCalendarSync, edge esistenti),
 *   - quindi l'appuntamento compare automaticamente nel Calendario marketing.
 *
 * Qui aggiungiamo solo: caricamento calendari + staff commerciale (gli stessi
 * dati che usa la pagina Calendario), titolo demo precompilato e un hint
 * discreto se Google Calendar non è collegato (con link alle Impostazioni).
 */
export function OutreachBookDemoAction({
  companyId,
  contactId,
  contactName,
  disabled,
  /** Route impostazioni dove collegare Google Calendar (default: super-admin). */
  settingsPath = "/admin/impostazioni/calendari",
}: {
  companyId: string;
  contactId: string | null;
  contactName: string;
  disabled?: boolean;
  settingsPath?: string;
}) {
  const queryClient = useQueryClient();
  const googleSync = useGoogleCalendarSync();
  const [open, setOpen] = useState(false);

  // Calendari CRM attivi della company — stessa fonte del Calendario marketing.
  // Caricati solo quando la dialog è aperta (la prenotazione è on-demand).
  const { data: calendars = [] } = useQuery({
    queryKey: ["outreach-demo-calendars", companyId],
    enabled: open && !!companyId,
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("marketing_calendars")
        .select("id, name, base_lat, base_lng, base_formatted_address, duration_minutes, default_meeting_provider, default_meeting_enabled")
        .eq("company_id", companyId)
        .eq("is_active", true)
        .order("name");
      if (error) throw error;
      return data ?? [];
    },
  });

  // Staff commerciale (assegnatari) — scope "sales", come la pagina Calendario.
  const { data: rawStaff = [] } = useCompanyStaffUsers(open ? companyId : undefined, "sales");
  const users = useMemo(
    () => rawStaff.map((u) => ({ id: u.id, first_name: u.first_name ?? "", last_name: u.last_name ?? "" })),
    [rawStaff],
  );

  // Titolo demo precompilato (il nome lead arriva dal pannello Contesto).
  const defaultTitle = useMemo(() => {
    const who = contactName?.trim();
    return who ? `Demo EdiliziaInCloud — ${who}` : "Demo EdiliziaInCloud";
  }, [contactName]);

  const googleConnected = googleSync.isGoogleConnected || googleSync.hasAnyCompanyGoogleConnection;

  const handleOpen = () => {
    if (!contactId) return;
    setOpen(true);
  };

  return (
    <>
      <div className="space-y-1.5">
        <Button
          size="sm"
          variant="outline"
          className="h-8 w-full gap-1.5 text-xs"
          disabled={disabled || !contactId}
          onClick={handleOpen}
          title={contactId ? "Prenota una demo/appuntamento per questo lead" : "Collega un contatto per prenotare una demo"}
        >
          <CalendarPlus className="h-3.5 w-3.5" /> Prenota demo
        </Button>
        {/* Hint discreto: se Google Calendar non è collegato la prenotazione
            interna funziona comunque, ma niente sync. Link alle Impostazioni. */}
        {!googleConnected && (
          <p className="flex items-start gap-1 text-[10px] leading-snug text-muted-foreground">
            <Info className="mt-px h-3 w-3 shrink-0" />
            <span>
              Per sincronizzare con Google Calendar{" "}
              <a
                href={`${settingsPath}?tab=calendari`}
                target="_blank"
                rel="noopener noreferrer"
                className="font-medium text-primary underline-offset-2 hover:underline"
              >
                collegalo in Impostazioni
              </a>
              .
            </span>
          </p>
        )}
      </div>

      {open && (
        <MarketingAppointmentDialog
          open={open}
          onOpenChange={setOpen}
          appointment={null}
          defaultContactId={contactId ?? undefined}
          defaultTitle={defaultTitle}
          calendars={calendars}
          users={users}
          onSaved={() => {
            toast.success("Demo prenotata", {
              description: "L'appuntamento è nel Calendario marketing" + (googleConnected ? " e sincronizzato con Google." : "."),
            });
            // Allinea le viste che leggono gli appuntamenti (calendario marketing,
            // tab appuntamento opportunità, slot picker).
            queryClient.invalidateQueries({ queryKey: ["marketing-appointments", companyId] });
            queryClient.invalidateQueries({ queryKey: ["contact_future_appointment"] });
            queryClient.invalidateQueries({ queryKey: ["appointments_for_slot"] });
          }}
        />
      )}
    </>
  );
}
