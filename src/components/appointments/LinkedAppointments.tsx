import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Plus, CalendarClock, Search, Truck, Users, UserCheck, Clock } from "lucide-react";
import { format, parseISO } from "date-fns";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { AppointmentDialog, type AppointmentData } from "./AppointmentDialog";

interface LinkedAppointmentsProps {
  orderId: string;
}

const TYPE_CONFIG: Record<string, { label: string; icon: typeof CalendarClock }> = {
  sopralluogo: { label: "Sopralluogo", icon: Search },
  consegna: { label: "Consegna", icon: Truck },
  riunione: { label: "Riunione", icon: Users },
  cliente: { label: "Cliente", icon: UserCheck },
  generico: { label: "Generico", icon: CalendarClock },
};

export function LinkedAppointments({ orderId }: LinkedAppointmentsProps) {
  const { effectiveCompany } = useAuth();
  const companyId = effectiveCompany?.id;
  const queryClient = useQueryClient();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingAppointment, setEditingAppointment] = useState<AppointmentData | null>(null);

  const { data: appointments = [] } = useQuery({
    queryKey: ["order-appointments", orderId],
    queryFn: async () => {
      if (!companyId) return [];
      const { data, error } = await supabase
        .from("appointments")
        .select("*")
        .eq("order_id", orderId)
        .order("appointment_date", { ascending: true });
      if (error) throw error;
      return data || [];
    },
    enabled: !!companyId && !!orderId,
  });

  const toggleMutation = useMutation({
    mutationFn: async ({ id, completed }: { id: string; completed: boolean }) => {
      const { error } = await supabase
        .from("appointments")
        .update({ is_completed: completed })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["order-appointments", orderId] });
      queryClient.invalidateQueries({ queryKey: ["appointments"] });
    },
  });

  const handleAdd = () => {
    setEditingAppointment(null);
    setDialogOpen(true);
  };

  const handleEdit = (apt: any) => {
    setEditingAppointment({
      id: apt.id,
      title: apt.title,
      description: apt.description,
      appointment_date: apt.appointment_date,
      appointment_time: apt.appointment_time,
      appointment_type: apt.appointment_type,
      assigned_to: apt.assigned_to,
      order_id: apt.order_id,
      is_completed: apt.is_completed,
    });
    setDialogOpen(true);
  };

  const activeCount = appointments.filter((a: any) => !a.is_completed).length;

  return (
    <>
      <Card>
        <CardHeader className="flex flex-row items-center justify-between pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            <CalendarClock className="h-4 w-4" />
            Appuntamenti
            {activeCount > 0 && (
              <Badge variant="secondary" className="ml-1 text-xs">{activeCount}</Badge>
            )}
          </CardTitle>
          <Button variant="ghost" size="sm" onClick={handleAdd}>
            <Plus className="h-4 w-4 mr-1" />
            Aggiungi
          </Button>
        </CardHeader>
        <CardContent className="pt-0">
          {appointments.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-3">
              Nessun appuntamento collegato
            </p>
          ) : (
            <div className="space-y-2">
              {appointments.map((apt: any) => {
                const config = TYPE_CONFIG[apt.appointment_type] || TYPE_CONFIG.generico;
                const Icon = config.icon;

                return (
                  <div
                    key={apt.id}
                    className="flex items-start gap-2 p-2 rounded-md hover:bg-muted/50 cursor-pointer group"
                    onClick={() => handleEdit(apt)}
                  >
                    <div
                      className="mt-0.5"
                      onClick={(e) => {
                        e.stopPropagation();
                        toggleMutation.mutate({ id: apt.id, completed: !apt.is_completed });
                      }}
                    >
                      <Checkbox checked={apt.is_completed} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5">
                        <Icon className="h-3.5 w-3.5 text-indigo-500 flex-shrink-0" />
                        <p className={`text-sm font-medium truncate ${apt.is_completed ? "line-through text-muted-foreground" : ""}`}>
                          {apt.title}
                        </p>
                      </div>
                      <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                        <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                          {config.label}
                        </Badge>
                        <span className="text-[11px] text-muted-foreground flex items-center gap-0.5">
                          <CalendarClock className="h-3 w-3" />
                          {format(parseISO(apt.appointment_date), "dd/MM")}
                          {apt.appointment_time && (
                            <>
                              <Clock className="h-3 w-3 ml-1" />
                              {apt.appointment_time.slice(0, 5)}
                            </>
                          )}
                        </span>
                        {apt.assigned?.first_name && (
                          <span className="text-[11px] text-muted-foreground">
                            {apt.assigned.first_name} {apt.assigned.last_name?.[0]}.
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      <AppointmentDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        appointment={editingAppointment}
        onSaved={() => {
          queryClient.invalidateQueries({ queryKey: ["order-appointments", orderId] });
          queryClient.invalidateQueries({ queryKey: ["appointments"] });
        }}
        defaultOrderId={orderId}
      />
    </>
  );
}
