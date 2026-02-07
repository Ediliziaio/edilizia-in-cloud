import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";

const teamSchema = z.object({
  name: z.string().min(1, "Nome ditta obbligatorio"),
  contact_name: z.string().optional(),
  phone: z.string().optional(),
  email: z.string().email("Email non valida").optional().or(z.literal("")),
  notes: z.string().optional(),
  is_active: z.boolean(),
});

export type ExternalTeamFormData = z.infer<typeof teamSchema>;

interface ExternalTeamDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  team: {
    id: string;
    name: string;
    contact_name: string | null;
    phone: string | null;
    email: string | null;
    notes: string | null;
    is_active: boolean;
  } | null;
  onSave: (data: ExternalTeamFormData) => void;
  isSaving: boolean;
}

export function ExternalTeamDialog({
  open,
  onOpenChange,
  team,
  onSave,
  isSaving,
}: ExternalTeamDialogProps) {
  const form = useForm<ExternalTeamFormData>({
    resolver: zodResolver(teamSchema),
    defaultValues: {
      name: "",
      contact_name: "",
      phone: "",
      email: "",
      notes: "",
      is_active: true,
    },
  });

  useEffect(() => {
    if (team) {
      form.reset({
        name: team.name,
        contact_name: team.contact_name || "",
        phone: team.phone || "",
        email: team.email || "",
        notes: team.notes || "",
        is_active: team.is_active,
      });
    } else {
      form.reset({
        name: "",
        contact_name: "",
        phone: "",
        email: "",
        notes: "",
        is_active: true,
      });
    }
  }, [team, form]);

  const handleSubmit = (data: ExternalTeamFormData) => {
    onSave(data);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>
            {team ? "Modifica Squadra Esterna" : "Nuova Squadra Esterna"}
          </DialogTitle>
          <DialogDescription>
            {team
              ? "Modifica i dati della squadra esterna"
              : "Inserisci i dati della nuova squadra esterna"}
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Nome Ditta/Squadra *</FormLabel>
                  <FormControl>
                    <Input placeholder="ABC Installazioni Srl" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="contact_name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Nome Referente</FormLabel>
                  <FormControl>
                    <Input placeholder="Mario Rossi" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="email"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Email</FormLabel>
                    <FormControl>
                      <Input type="email" placeholder="info@ditta.it" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="phone"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Telefono</FormLabel>
                    <FormControl>
                      <Input placeholder="+39 333 1234567" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <FormField
              control={form.control}
              name="notes"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Note</FormLabel>
                  <FormControl>
                    <Textarea
                      placeholder="Note aggiuntive sulla squadra..."
                      rows={3}
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="is_active"
              render={({ field }) => (
                <FormItem className="flex flex-row items-center justify-between rounded-lg border p-3">
                  <div className="space-y-0.5">
                    <FormLabel>Squadra Attiva</FormLabel>
                    <FormDescription>
                      Le squadre inattive non sono selezionabili per nuovi ordini
                    </FormDescription>
                  </div>
                  <FormControl>
                    <Switch
                      checked={field.value}
                      onCheckedChange={field.onChange}
                    />
                  </FormControl>
                </FormItem>
              )}
            />

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => onOpenChange(false)}
              >
                Annulla
              </Button>
              <Button type="submit" disabled={isSaving}>
                {isSaving ? "Salvataggio..." : team ? "Salva Modifiche" : "Crea Squadra"}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
