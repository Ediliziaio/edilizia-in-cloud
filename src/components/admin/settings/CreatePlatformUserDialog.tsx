import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { queryKeys } from "@/lib/queryKeys";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Loader2, Check } from "lucide-react";
import { toast } from "sonner";
import { PLATFORM_ROLES, PLATFORM_ROLE_LABELS, PLATFORM_ROLE_DESCRIPTIONS, PLATFORM_ROLE_COLORS, type PlatformRole } from "@/types/auth";
import { cn } from "@/lib/utils";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export default function CreatePlatformUserDialog({ open, onOpenChange }: Props) {
  const queryClient = useQueryClient();
  const [step, setStep] = useState(0);
  const [selectedRole, setSelectedRole] = useState<PlatformRole | null>(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");

  const resetForm = () => {
    setStep(0);
    setSelectedRole(null);
    setEmail("");
    setPassword("");
    setFirstName("");
    setLastName("");
  };

  const createMutation = useMutation({
    mutationFn: async () => {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await supabase.functions.invoke("manage-platform-users", {
        body: {
          action: "create",
          email,
          password,
          firstName,
          lastName,
          platformRole: selectedRole,
        },
        headers: { Authorization: `Bearer ${session?.access_token}` },
      });
      if (res.error) throw new Error(res.error.message);
      if (res.data?.error) throw new Error(res.data.error);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.admin.superAdmins });
      onOpenChange(false);
      resetForm();
      toast.success("Membro del team creato con successo");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const canProceedStep0 = !!selectedRole;
  const canProceedStep1 = email.trim() !== "" && password.length >= 8 && firstName.trim() !== "" && lastName.trim() !== "";

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) resetForm(); onOpenChange(o); }}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Nuovo Membro del Team</DialogTitle>
          <DialogDescription>
            {step === 0 ? "Scegli il ruolo per il nuovo membro" : step === 1 ? "Inserisci i dati del nuovo membro" : "Conferma e crea"}
          </DialogDescription>
        </DialogHeader>

        {step === 0 && (
          <div className="grid gap-3">
            {PLATFORM_ROLES.map((role) => (
              <Card
                key={role}
                className={cn(
                  "cursor-pointer transition-all hover:shadow-md",
                  selectedRole === role && "ring-2 ring-primary"
                )}
                onClick={() => setSelectedRole(role)}
              >
                <CardContent className="flex items-center gap-4 p-4">
                  <div className={cn("w-3 h-3 rounded-full shrink-0", PLATFORM_ROLE_COLORS[role].split(" ")[0])} />
                  <div className="flex-1">
                    <div className="font-medium">{PLATFORM_ROLE_LABELS[role]}</div>
                    <div className="text-sm text-muted-foreground">{PLATFORM_ROLE_DESCRIPTIONS[role]}</div>
                  </div>
                  {selectedRole === role && <Check className="h-5 w-5 text-primary" />}
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        {step === 1 && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Nome</Label>
                <Input value={firstName} onChange={(e) => setFirstName(e.target.value)} placeholder="Mario" />
              </div>
              <div className="space-y-2">
                <Label>Cognome</Label>
                <Input value={lastName} onChange={(e) => setLastName(e.target.value)} placeholder="Rossi" />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Email</Label>
              <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="mario@esempio.it" />
            </div>
            <div className="space-y-2">
              <Label>Password (min 8 caratteri)</Label>
              <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" />
            </div>
          </div>
        )}

        {step === 2 && selectedRole && (
          <div className="space-y-3 text-sm">
            <div className="grid grid-cols-2 gap-2">
              <div className="text-muted-foreground">Ruolo</div>
              <div className="font-medium">{PLATFORM_ROLE_LABELS[selectedRole]}</div>
              <div className="text-muted-foreground">Nome</div>
              <div className="font-medium">{firstName} {lastName}</div>
              <div className="text-muted-foreground">Email</div>
              <div className="font-medium">{email}</div>
            </div>
          </div>
        )}

        <DialogFooter className="gap-2">
          {step > 0 && (
            <Button variant="outline" onClick={() => setStep(step - 1)}>Indietro</Button>
          )}
          {step < 2 ? (
            <Button
              onClick={() => setStep(step + 1)}
              disabled={step === 0 ? !canProceedStep0 : !canProceedStep1}
            >
              Avanti
            </Button>
          ) : (
            <Button onClick={() => createMutation.mutate()} disabled={createMutation.isPending}>
              {createMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Crea Membro
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
