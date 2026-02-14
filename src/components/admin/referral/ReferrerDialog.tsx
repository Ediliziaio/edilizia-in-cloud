import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import {
  Form, FormControl, FormField, FormItem, FormLabel, FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import type { Referrer } from "@/pages/admin/ReferralDashboard";

const schema = z.object({
  name: z.string().min(2, "Minimo 2 caratteri"),
  email: z.string().email("Email non valida"),
  phone: z.string().optional().or(z.literal("")),
  commission_type: z.enum(["percentage", "fixed"]),
  commission_value: z.coerce.number().min(0),
  notes: z.string().optional().or(z.literal("")),
});

type FormData = z.infer<typeof schema>;

function generateCode(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";
  for (let i = 0; i < 6; i++) code += chars[Math.floor(Math.random() * chars.length)];
  return code;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  referrer: Referrer | null;
}

export function ReferrerDialog({ open, onOpenChange, referrer }: Props) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const isEdit = !!referrer;

  const form = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: {
      name: "", email: "", phone: "",
      commission_type: "percentage", commission_value: 10, notes: "",
    },
  });

  useEffect(() => {
    if (referrer) {
      form.reset({
        name: referrer.name,
        email: referrer.email,
        phone: referrer.phone || "",
        commission_type: referrer.commission_type as "percentage" | "fixed",
        commission_value: referrer.commission_value,
        notes: referrer.notes || "",
      });
    } else {
      form.reset({
        name: "", email: "", phone: "",
        commission_type: "percentage", commission_value: 10, notes: "",
      });
    }
  }, [referrer, open]);

  const mutation = useMutation({
    mutationFn: async (data: FormData) => {
      if (isEdit) {
        const { error } = await supabase
          .from("referrers")
          .update({
            name: data.name,
            email: data.email,
            phone: data.phone || null,
            commission_type: data.commission_type,
            commission_value: data.commission_value,
            notes: data.notes || null,
          })
          .eq("id", referrer!.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("referrers").insert({
          name: data.name,
          email: data.email,
          phone: data.phone || null,
          referral_code: generateCode(),
          commission_type: data.commission_type,
          commission_value: data.commission_value,
          notes: data.notes || null,
        });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["referrers"] });
      toast({ title: isEdit ? "Referrer aggiornato" : "Referrer creato" });
      onOpenChange(false);
    },
    onError: (err: any) => {
      toast({ title: "Errore", description: err.message, variant: "destructive" });
    },
  });

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onOpenChange(false); }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Modifica Referrer" : "Nuovo Referrer"}</DialogTitle>
          <DialogDescription>
            {isEdit ? "Aggiorna i dati del referrer" : "Il codice referral verrà generato automaticamente"}
          </DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit((d) => mutation.mutate(d))} className="space-y-4">
            <FormField control={form.control} name="name" render={({ field }) => (
              <FormItem>
                <FormLabel>Nome</FormLabel>
                <FormControl><Input placeholder="Mario Rossi" {...field} /></FormControl>
                <FormMessage />
              </FormItem>
            )} />
            <FormField control={form.control} name="email" render={({ field }) => (
              <FormItem>
                <FormLabel>Email</FormLabel>
                <FormControl><Input type="email" placeholder="email@esempio.it" {...field} /></FormControl>
                <FormMessage />
              </FormItem>
            )} />
            <FormField control={form.control} name="phone" render={({ field }) => (
              <FormItem>
                <FormLabel>Telefono (opzionale)</FormLabel>
                <FormControl><Input placeholder="+39 333 1234567" {...field} /></FormControl>
                <FormMessage />
              </FormItem>
            )} />
            <div className="grid grid-cols-2 gap-4">
              <FormField control={form.control} name="commission_type" render={({ field }) => (
                <FormItem>
                  <FormLabel>Tipo Commissione</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="percentage">Percentuale (%)</SelectItem>
                      <SelectItem value="fixed">Fisso (€)</SelectItem>
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )} />
              <FormField control={form.control} name="commission_value" render={({ field }) => (
                <FormItem>
                  <FormLabel>Valore</FormLabel>
                  <FormControl><Input type="number" step="0.01" {...field} /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />
            </div>
            <FormField control={form.control} name="notes" render={({ field }) => (
              <FormItem>
                <FormLabel>Note (opzionale)</FormLabel>
                <FormControl><Textarea placeholder="Note libere..." {...field} /></FormControl>
                <FormMessage />
              </FormItem>
            )} />
            <Button type="submit" className="w-full" disabled={mutation.isPending}>
              {isEdit ? "Salva Modifiche" : "Crea Referrer"}
            </Button>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
