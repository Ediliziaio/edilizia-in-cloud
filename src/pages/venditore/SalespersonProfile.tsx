import { useQuery } from "@tanstack/react-query";
import { User, Mail, Phone, Percent, Wallet, AlertCircle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { ChangePasswordForm } from "@/components/settings/ChangePasswordForm";

export default function SalespersonProfile() {
  const { user, profile } = useAuth();

  // Find salesperson record for this user
  const { data: salesperson, isLoading } = useQuery({
    queryKey: ["my-salesperson-record", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("salespeople")
        .select("*")
        .eq("user_id", user!.id)
        .single();

      if (error) throw error;
      return data;
    },
    enabled: !!user,
    staleTime: 5 * 60 * 1000,
  });

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="h-8 w-48 bg-muted animate-pulse rounded" />
        <div className="h-64 bg-muted animate-pulse rounded" />
      </div>
    );
  }

  if (!salesperson) {
    return (
      <div className="text-center py-12">
        <AlertCircle className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
        <p className="text-muted-foreground">Account venditore non trovato</p>
      </div>
    );
  }

  const getCommissionLabel = (type: string) => {
    switch (type) {
      case "fixed":
        return "Fisso per ordine";
      case "percentage_sold":
        return "% sul venduto";
      case "percentage_collected":
        return "% sull'incassato";
      default:
        return type;
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Il Mio Profilo</h1>
        <p className="text-muted-foreground">
          Dati del tuo account venditore
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Profile Info Card */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <User className="h-5 w-5" />
              Dati Personali
            </CardTitle>
            <CardDescription>
              Informazioni del tuo profilo venditore
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center gap-4 p-4 bg-muted/50 rounded-lg">
              <div className="h-16 w-16 rounded-full bg-primary/10 flex items-center justify-center">
                <User className="h-8 w-8 text-primary" />
              </div>
              <div>
                <h3 className="text-lg font-semibold">
                  {salesperson.first_name} {salesperson.last_name}
                </h3>
                <Badge variant="secondary">Venditore</Badge>
              </div>
            </div>

            <Separator />

            <div className="space-y-3">
              {salesperson.email && (
                <div className="flex items-center gap-3">
                  <Mail className="h-4 w-4 text-muted-foreground" />
                  <span>{salesperson.email}</span>
                </div>
              )}
              {salesperson.phone && (
                <div className="flex items-center gap-3">
                  <Phone className="h-4 w-4 text-muted-foreground" />
                  <span>{salesperson.phone}</span>
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Commission Info Card */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Wallet className="h-5 w-5" />
              Condizioni Provvigione
            </CardTitle>
            <CardDescription>
              I termini del tuo contratto provvigionale
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="p-4 bg-primary/5 rounded-lg border border-primary/20">
              <div className="flex items-center gap-2 mb-2">
                <Percent className="h-4 w-4 text-primary" />
                <span className="text-sm font-medium">Tipo Provvigione</span>
              </div>
              <p className="text-lg font-semibold text-primary">
                {getCommissionLabel(salesperson.commission_type)}
              </p>
            </div>

            <div className="p-4 bg-muted/50 rounded-lg">
              <div className="flex items-center gap-2 mb-2">
                <Wallet className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm font-medium">Valore</span>
              </div>
              <p className="text-2xl font-bold">
                {salesperson.commission_type === "fixed"
                  ? `€${salesperson.commission_value}`
                  : `${salesperson.commission_value}%`}
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                {salesperson.commission_type === "fixed"
                  ? "Per ogni ordine chiuso"
                  : salesperson.commission_type === "percentage_sold"
                  ? "Dell'imponibile dell'ordine"
                  : "Dell'imponibile incassato"}
              </p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Change Password */}
      <Card>
        <CardHeader>
          <CardTitle>Sicurezza</CardTitle>
          <CardDescription>
            Gestisci la password del tuo account
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ChangePasswordForm />
        </CardContent>
      </Card>
    </div>
  );
}
