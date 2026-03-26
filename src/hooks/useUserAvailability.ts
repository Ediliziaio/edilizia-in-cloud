import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface AvailabilitySlot {
  id?: string;
  day_of_week: number; // 1=Lun ... 7=Dom
  start_time: string;  // "HH:MM"
  end_time: string;
}

export interface AvailabilityException {
  id?: string;
  exception_date: string; // "YYYY-MM-DD"
  is_day_off: boolean;
  start_time?: string | null;
  end_time?: string | null;
  reason?: string | null;
}

export interface UserAvailabilityData {
  id?: string;
  timezone: string;
  slots: AvailabilitySlot[];
  exceptions: AvailabilityException[];
}

const DEFAULT_SLOTS: AvailabilitySlot[] = [1, 2, 3, 4, 5].flatMap((day) => [
  { day_of_week: day, start_time: "09:00", end_time: "13:00" },
  { day_of_week: day, start_time: "14:00", end_time: "18:00" },
]);

export function useUserAvailability(userId: string | undefined) {
  return useQuery({
    queryKey: ["user-availability", userId],
    queryFn: async (): Promise<UserAvailabilityData> => {
      if (!userId) throw new Error("userId required");

      const { data: avail } = await supabase
        .from("user_availability")
        .select("id, timezone")
        .eq("user_id", userId)
        .maybeSingle();

      if (!avail) {
        return { timezone: "Europe/Rome", slots: DEFAULT_SLOTS, exceptions: [] };
      }

      const [slotsRes, exceptionsRes] = await Promise.all([
        supabase
          .from("user_availability_slots")
          .select("id, day_of_week, start_time, end_time")
          .eq("availability_id", avail.id)
          .order("day_of_week")
          .order("start_time"),
        supabase
          .from("user_availability_exceptions")
          .select("id, exception_date, is_day_off, start_time, end_time, reason")
          .eq("availability_id", avail.id)
          .order("exception_date"),
      ]);

      return {
        id: avail.id,
        timezone: avail.timezone,
        slots: (slotsRes.data || []).map(s => ({
          ...s,
          start_time: s.start_time?.slice(0, 5) || "",
          end_time: s.end_time?.slice(0, 5) || "",
        })),
        exceptions: (exceptionsRes.data || []).map(e => ({
          ...e,
          start_time: e.start_time?.slice(0, 5) || null,
          end_time: e.end_time?.slice(0, 5) || null,
        })),
      };
    },
    enabled: !!userId,
    staleTime: 5 * 60 * 1000,
    gcTime: 15 * 60 * 1000,
  });
}

export function useSaveUserAvailability(userId: string | undefined, companyId: string | undefined) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: UserAvailabilityData) => {
      if (!userId || !companyId) throw new Error("userId e companyId richiesti");

      const { data: avail, error: availError } = await supabase
        .from("user_availability")
        .upsert(
          { user_id: userId, company_id: companyId, timezone: data.timezone, updated_at: new Date().toISOString() } as any,
          { onConflict: "user_id" }
        )
        .select("id")
        .single();

      if (availError) throw availError;
      const availId = avail.id;

      await supabase.from("user_availability_slots").delete().eq("availability_id", availId);
      if (data.slots.length > 0) {
        const { error: slotsError } = await supabase.from("user_availability_slots").insert(
          data.slots.map((s) => ({
            availability_id: availId,
            day_of_week: s.day_of_week,
            start_time: s.start_time,
            end_time: s.end_time,
          }))
        );
        if (slotsError) throw slotsError;
      }

      await supabase.from("user_availability_exceptions").delete().eq("availability_id", availId);
      if (data.exceptions.length > 0) {
        const { error: excError } = await supabase.from("user_availability_exceptions").insert(
          data.exceptions.map((e) => ({
            availability_id: availId,
            exception_date: e.exception_date,
            is_day_off: e.is_day_off,
            start_time: e.is_day_off ? null : e.start_time,
            end_time: e.is_day_off ? null : e.end_time,
            reason: e.reason || null,
          }))
        );
        if (excError) throw excError;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["user-availability", userId] });
    },
  });
}
