import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { User, Mail, Phone, Building2, Save } from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { ChangePasswordForm } from "@/components/settings/ChangePasswordForm";

export default function EmployeeProfile() {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");

  // Fetch employee profile
  const { data: employee, isLoading } = useQuery({
    queryKey: ["my-employee-profile", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("employees")
        .select("*, company:companies(name)")
        .eq("user_id", user!.id)
        .single();
      
      if (error) throw error;
      
      // Init form
      setEmail(data.email || "");
      setPhone(data.phone || "");
      
      return data;
    },
    enabled: !!user?.id,
    staleTime: 10 * 60 * 1000,
  });

  // Update mutation
  const updateMutation = useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from("employees")
        .update({
          email: email || null,
          phone: phone || null,
        })
        .eq("id", employee!.id);
      
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["my-employee-profile"] });
      toast({
        title: "Profilo aggiornato",
        description: "I tuoi dati sono stati salvati.",
      });
    },
    onError: () => {
      toast({
        title: "Errore",
        description: "Impossibile aggiornare il profilo.",
        variant: "destructive",
      });
    },
  });

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="h-8 w-48 bg-muted animate-pulse rounded" />
        <Card>
          <CardContent className="p-6">
            <div className="h-40 bg-muted animate-pulse rounded" />
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Il Mio Profilo</h1>
        <p className="text-muted-foreground">
          Gestisci i tuoi dati personali
        </p>
      </div>

      {/* Profile Info */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <User className="h-5 w-5" />
            Informazioni Personali
          </CardTitle>
          <CardDescription>
            Alcuni dati sono gestiti dall'azienda
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Read-only info */}
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label className="text-muted-foreground">Nome</Label>
              <div className="p-3 bg-muted rounded-md font-medium">
                {employee?.first_name}
              </div>
            </div>
            <div className="space-y-2">
              <Label className="text-muted-foreground">Cognome</Label>
              <div className="p-3 bg-muted rounded-md font-medium">
                {employee?.last_name}
              </div>
            </div>
          </div>

          <div className="space-y-2">
            <Label className="text-muted-foreground flex items-center gap-2">
              <Building2 className="h-4 w-4" />
              Azienda
            </Label>
            <div className="p-3 bg-muted rounded-md font-medium">
              {(employee?.company as any)?.name || "Non specificata"}
            </div>
          </div>

          <Separator />

          {/* Editable info */}
          <form 
            onSubmit={(e) => {
              e.preventDefault();
              updateMutation.mutate();
            }}
            className="space-y-4"
          >
            <div className="space-y-2">
              <Label htmlFor="email" className="flex items-center gap-2">
                <Mail className="h-4 w-4" />
                Email
              </Label>
              <Input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="La tua email personale"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="phone" className="flex items-center gap-2">
                <Phone className="h-4 w-4" />
                Telefono
              </Label>
              <Input
                id="phone"
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="Il tuo numero di telefono"
              />
            </div>

            <Button 
              type="submit" 
              disabled={updateMutation.isPending}
              className="w-full"
            >
              {updateMutation.isPending ? (
                "Salvataggio..."
              ) : (
                <>
                  <Save className="h-4 w-4 mr-2" />
                  Salva Modifiche
                </>
              )}
            </Button>
          </form>
        </CardContent>
      </Card>

      {/* Change Password */}
      <Card>
        <CardHeader>
          <CardTitle>Cambia Password</CardTitle>
          <CardDescription>
            Aggiorna la password del tuo account
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ChangePasswordForm />
        </CardContent>
      </Card>
    </div>
  );
}
