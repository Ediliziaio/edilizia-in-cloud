import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type NotifPrefs = {
  // LEAD
  lead_new_in_app: boolean; lead_new_email: boolean; lead_new_sms: boolean;
  lead_assigned_in_app: boolean; lead_assigned_email: boolean; lead_assigned_sms: boolean;
  lead_stage_changed_in_app: boolean; lead_stage_changed_email: boolean; lead_stage_changed_sms: boolean;
  lead_won_in_app: boolean; lead_won_email: boolean; lead_won_sms: boolean;
  // ORDINI
  order_new_in_app: boolean; order_new_email: boolean; order_new_sms: boolean;
  order_assigned_in_app: boolean; order_assigned_email: boolean; order_assigned_sms: boolean;
  order_status_changed_in_app: boolean; order_status_changed_email: boolean; order_status_changed_sms: boolean;
  order_completed_in_app: boolean; order_completed_email: boolean; order_completed_sms: boolean;
  // APPUNTAMENTI
  appointment_new_in_app: boolean; appointment_new_email: boolean; appointment_new_sms: boolean;
  appointment_reminder_in_app: boolean; appointment_reminder_email: boolean; appointment_reminder_sms: boolean;
  appointment_cancelled_in_app: boolean; appointment_cancelled_email: boolean; appointment_cancelled_sms: boolean;
  appointment_rescheduled_in_app: boolean; appointment_rescheduled_email: boolean; appointment_rescheduled_sms: boolean;
  // TASK
  task_assigned_in_app: boolean; task_assigned_email: boolean; task_assigned_sms: boolean;
  task_due_soon_in_app: boolean; task_due_soon_email: boolean; task_due_soon_sms: boolean;
  task_overdue_in_app: boolean; task_overdue_email: boolean; task_overdue_sms: boolean;
  task_completed_in_app: boolean; task_completed_email: boolean; task_completed_sms: boolean;
  // MESSAGGI
  message_whatsapp_in_app: boolean; message_whatsapp_email: boolean; message_whatsapp_sms: boolean;
  message_email_received_in_app: boolean; message_email_received_email: boolean; message_email_received_sms: boolean;
  // REPORT
  report_daily_in_app: boolean; report_daily_email: boolean; report_daily_sms: boolean;
  report_weekly_in_app: boolean; report_weekly_email: boolean; report_weekly_sms: boolean;
  report_monthly_in_app: boolean; report_monthly_email: boolean; report_monthly_sms: boolean;
};

export const DEFAULT_NOTIF_PREFS: NotifPrefs = {
  lead_new_in_app: true, lead_new_email: false, lead_new_sms: false,
  lead_assigned_in_app: true, lead_assigned_email: true, lead_assigned_sms: false,
  lead_stage_changed_in_app: true, lead_stage_changed_email: false, lead_stage_changed_sms: false,
  lead_won_in_app: true, lead_won_email: true, lead_won_sms: false,
  order_new_in_app: true, order_new_email: true, order_new_sms: false,
  order_assigned_in_app: true, order_assigned_email: true, order_assigned_sms: false,
  order_status_changed_in_app: true, order_status_changed_email: false, order_status_changed_sms: false,
  order_completed_in_app: true, order_completed_email: true, order_completed_sms: false,
  appointment_new_in_app: true, appointment_new_email: true, appointment_new_sms: false,
  appointment_reminder_in_app: true, appointment_reminder_email: true, appointment_reminder_sms: false,
  appointment_cancelled_in_app: true, appointment_cancelled_email: true, appointment_cancelled_sms: false,
  appointment_rescheduled_in_app: true, appointment_rescheduled_email: false, appointment_rescheduled_sms: false,
  task_assigned_in_app: true, task_assigned_email: false, task_assigned_sms: false,
  task_due_soon_in_app: true, task_due_soon_email: false, task_due_soon_sms: false,
  task_overdue_in_app: true, task_overdue_email: true, task_overdue_sms: false,
  task_completed_in_app: false, task_completed_email: false, task_completed_sms: false,
  message_whatsapp_in_app: true, message_whatsapp_email: false, message_whatsapp_sms: false,
  message_email_received_in_app: true, message_email_received_email: false, message_email_received_sms: false,
  report_daily_in_app: false, report_daily_email: true, report_daily_sms: false,
  report_weekly_in_app: false, report_weekly_email: true, report_weekly_sms: false,
  report_monthly_in_app: false, report_monthly_email: true, report_monthly_sms: false,
};

// All pref column names for select
const PREF_COLUMNS = Object.keys(DEFAULT_NOTIF_PREFS).join(", ");

export function useUserNotifPrefs(userId: string | undefined) {
  return useQuery({
    queryKey: ["user-notif-prefs", userId],
    queryFn: async (): Promise<NotifPrefs> => {
      if (!userId) return DEFAULT_NOTIF_PREFS;
      const { data } = await supabase
        .from("user_notification_preferences")
        .select(PREF_COLUMNS)
        .eq("user_id", userId)
        .maybeSingle();
      return (data as unknown as NotifPrefs) || DEFAULT_NOTIF_PREFS;
    },
    enabled: !!userId,
  });
}

export function useSaveUserNotifPrefs(userId: string | undefined, companyId: string | undefined) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (prefs: NotifPrefs) => {
      if (!userId || !companyId) throw new Error("userId e companyId richiesti");
      const { error } = await supabase
        .from("user_notification_preferences")
        .upsert(
          { user_id: userId, company_id: companyId, ...prefs, updated_at: new Date().toISOString() } as any,
          { onConflict: "user_id" }
        );
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["user-notif-prefs", userId] });
    },
  });
}
