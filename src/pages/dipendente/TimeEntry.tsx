import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useSearchParams, useNavigate } from "react-router-dom";
import { format, parseISO } from "date-fns";
import { it } from "date-fns/locale";
import { CalendarIcon, Clock, Save, ArrowLeft } from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";

const ACTIVITY_TYPES = [
  { value: "lavoro", label: "Lavoro" },
  { value: "trasferta", label: "Trasferta" },
  { value: "formazione", label: "Formazione" },
  { value: "malattia", label: "Malattia" },
  { value: "ferie", label: "Ferie" },
  { value: "permesso", label: "Permesso" },
];

export default function TimeEntry() {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  
  const initialDate = searchParams.get("data") 
    ? parseISO(searchParams.get("data")!) 
    : new Date();

  const [selectedDate, setSelectedDate] = useState<Date>(initialDate);
  const [hours, setHours] = useState("");
  const [description, setDescription] = useState("");
  const [activityType, setActivityType] = useState("lavoro");
  const [selectedOrderId, setSelectedOrderId] = useState<string>("");

  // Fetch employee profile
  const { data: employee } = useQuery({
    queryKey: ["my-employee-profile", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("employees")
        .select("*")
        .eq("user_id", user!.id)
        .single();
      
      if (error) throw error;
      return data;
    },
    enabled: !!user?.id,
    staleTime: 10 * 60 * 1000,
  });

  // Fetch existing log for selected date
  const { data: existingLog, isLoading: loadingLog } = useQuery({
    queryKey: ["work-log", employee?.id, format(selectedDate, "yyyy-MM-dd")],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("work_logs")
        .select("*")
        .eq("employee_id", employee!.id)
        .eq("work_date", format(selectedDate, "yyyy-MM-dd"))
        .maybeSingle();
      
      if (error) throw error;
      return data;
    },
    enabled: !!employee?.id,
    staleTime: 1 * 60 * 1000,
  });

  // Fetch company orders for selection
  const { data: orders = [] } = useQuery({
    queryKey: ["employee-orders", employee?.company_id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("orders")
        .select("id, order_code, description, customer:profiles!orders_customer_id_fkey(first_name, last_name)")
        .eq("company_id", employee!.company_id)
        .order("created_at", { ascending: false })
        .limit(50);
      
      if (error) throw error;
      return data;
    },
    enabled: !!employee?.company_id,
    staleTime: 5 * 60 * 1000,
  });

  // Update form when existing log loads
  useEffect(() => {
    if (existingLog) {
      setHours(String(existingLog.hours_worked));
      setDescription(existingLog.description || "");
      setActivityType(existingLog.activity_type || "lavoro");
      setSelectedOrderId(existingLog.order_id || "");
    } else {
      setHours("");
      setDescription("");
      setActivityType("lavoro");
      setSelectedOrderId("");
    }
  }, [existingLog]);

  // Save mutation
  const saveMutation = useMutation({
    mutationFn: async () => {
      const payload = {
        employee_id: employee!.id,
        work_date: format(selectedDate, "yyyy-MM-dd"),
        hours_worked: parseFloat(hours),
        description: description || null,
        activity_type: activityType,
        order_id: selectedOrderId || null,
        is_approved: false, // Reset approval on edit
      };

      if (existingLog) {
        const { error } = await supabase
          .from("work_logs")
          .update(payload)
          .eq("id", existingLog.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("work_logs")
          .insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["work-log"] });
      queryClient.invalidateQueries({ queryKey: ["my-work-logs"] });
      toast({
        title: existingLog ? "Rapportino aggiornato" : "Rapportino salvato",
        description: `Ore registrate per ${format(selectedDate, "d MMMM yyyy", { locale: it })}`,
      });
      navigate("/dipendente");
    },
    onError: (error: Error) => {
      toast({
        title: "Errore",
        description: error.message || "Impossibile salvare il rapportino.",
        variant: "destructive",
      });
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    const hoursNum = parseFloat(hours);
    if (isNaN(hoursNum) || hoursNum <= 0 || hoursNum > 24) {
      toast({
        title: "Errore",
        description: "Inserisci un numero di ore valido (1-24).",
        variant: "destructive",
      });
      return;
    }

    saveMutation.mutate();
  };

  const isEditing = !!existingLog;
  const isApproved = existingLog?.is_approved;

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div>
          <h1 className="text-2xl font-bold">
            {isEditing ? "Modifica Rapportino" : "Registra Ore"}
          </h1>
          <p className="text-muted-foreground">
            Inserisci le ore lavorate per la giornata selezionata
          </p>
        </div>
      </div>

      {isApproved && (
        <div className="bg-orange-100 border border-orange-200 text-orange-800 rounded-lg p-4 dark:bg-orange-900/20 dark:border-orange-800 dark:text-orange-200">
          <p className="font-medium">Attenzione</p>
          <p className="text-sm">
            Questo rapportino è già stato approvato. Modificandolo, verrà rimesso in attesa di approvazione.
          </p>
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Clock className="h-5 w-5" />
            Dettagli Rapportino
          </CardTitle>
          <CardDescription>
            {format(selectedDate, "EEEE d MMMM yyyy", { locale: it })}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-6">
            {/* Date Picker */}
            <div className="space-y-2">
              <Label>Data</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className={cn(
                      "w-full justify-start text-left font-normal",
                      !selectedDate && "text-muted-foreground"
                    )}
                  >
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {selectedDate ? (
                      format(selectedDate, "PPP", { locale: it })
                    ) : (
                      <span>Seleziona una data</span>
                    )}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="single"
                    selected={selectedDate}
                    onSelect={(date) => date && setSelectedDate(date)}
                    disabled={(date) => date > new Date()}
                    initialFocus
                    locale={it}
                  />
                </PopoverContent>
              </Popover>
            </div>

            {/* Hours */}
            <div className="space-y-2">
              <Label htmlFor="hours">Ore Lavorate *</Label>
              <Input
                id="hours"
                type="number"
                step="0.5"
                min="0.5"
                max="24"
                value={hours}
                onChange={(e) => setHours(e.target.value)}
                placeholder="Es. 8"
                required
              />
              <p className="text-xs text-muted-foreground">
                Inserisci le ore (es. 8, 8.5, 4)
              </p>
            </div>

            {/* Activity Type */}
            <div className="space-y-2">
              <Label>Tipo Attività</Label>
              <Select value={activityType} onValueChange={setActivityType}>
                <SelectTrigger>
                  <SelectValue placeholder="Seleziona tipo" />
                </SelectTrigger>
                <SelectContent>
                  {ACTIVITY_TYPES.map((type) => (
                    <SelectItem key={type.value} value={type.value}>
                      {type.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Order Selection */}
            <div className="space-y-2">
              <Label>Ordine (opzionale)</Label>
              <Select value={selectedOrderId} onValueChange={setSelectedOrderId}>
                <SelectTrigger>
                  <SelectValue placeholder="Seleziona un ordine" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="">Nessun ordine specifico</SelectItem>
                  {orders.map((order) => (
                    <SelectItem key={order.id} value={order.id}>
                      {order.order_code || order.description.substring(0, 40)}
                      {order.customer && ` - ${order.customer.first_name} ${order.customer.last_name}`}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Description */}
            <div className="space-y-2">
              <Label htmlFor="description">Descrizione Attività</Label>
              <Textarea
                id="description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Descrivi brevemente le attività svolte..."
                rows={4}
              />
            </div>

            {/* Submit */}
            <div className="flex gap-3">
              <Button
                type="button"
                variant="outline"
                onClick={() => navigate(-1)}
                className="flex-1"
              >
                Annulla
              </Button>
              <Button 
                type="submit" 
                className="flex-1"
                disabled={saveMutation.isPending || loadingLog}
              >
                {saveMutation.isPending ? (
                  <>
                    <span className="animate-spin mr-2">⏳</span>
                    Salvataggio...
                  </>
                ) : (
                  <>
                    <Save className="h-4 w-4 mr-2" />
                    {isEditing ? "Aggiorna" : "Salva"}
                  </>
                )}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
