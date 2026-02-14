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
  amount: z.coerce.number().min(0.01, "Importo obbligatorio"),
  period_start: z.string().min(1, "Data inizio obbligatoria"),
  period_end: z.string().min(1, "Data fine obbligatoria"),
  payment_method: z.enum(["bank_transfer", "paypal", "other"]),
  notes: z.string().optional().or(z.literal("")),
});

type FormData = z.infer<typeof schema>;

interface Props {
  referrer: Referrer | null;
  onOpenChange: () => void;
}

export function PayoutDialog({ referrer, onOpenChange }: Props) {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const form = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: {
      amount: 0,
      period_start: "",
      period_end: "",
      payment_method: "bank_transfer",
      notes: "",
    },
  });

  const mutation = useMutation({
    mutationFn: async (data: FormData) => {
      const { error: payoutError } = await supabase.from("referral_payouts").insert({
        referrer_id: referrer!.id,
        amount: data.amount,
        period_start: data.period_start,
        period_end: data.period_end,
        payment_method: data.payment_method,
        notes: data.notes || null,
      });
      if (payoutError) throw payoutError;

      // Update total_paid on referrer
      const { error: updateError } = await supabase
        .from("referrers")
        .update({ total_paid: (referrer!.total_paid || 0) + data.amount })
        .eq("id", referrer!.id);
      if (updateError) throw updateError;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["referrers"] });
      queryClient.invalidateQueries({ queryKey: ["referral_payouts"] });
      toast({ title: "Pagamento registrato" });
      form.reset();
      onOpenChange();
    },
    onError: (err: any) => {
      toast({ title: "Errore", description: err.message, variant: "destructive" });
    },
  });

  if (!referrer) return null;

  return (
    <Dialog open={!!referrer} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Registra Pagamento</DialogTitle>
          <DialogDescription>Pagamento per {referrer.name}</DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit((d) => mutation.mutate(d))} className="space-y-4">
            <FormField control={form.control} name="amount" render={({ field }) => (
              <FormItem>
                <FormLabel>Importo (€)</FormLabel>
                <FormControl><Input type="number" step="0.01" {...field} /></FormControl>
                <FormMessage />
              </FormItem>
            )} />
            <div className="grid grid-cols-2 gap-4">
              <FormField control={form.control} name="period_start" render={({ field }) => (
                <FormItem>
                  <FormLabel>Periodo Da</FormLabel>
                  <FormControl><Input type="date" {...field} /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />
              <FormField control={form.control} name="period_end" render={({ field }) => (
                <FormItem>
                  <FormLabel>Periodo A</FormLabel>
                  <FormControl><Input type="date" {...field} /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />
            </div>
            <FormField control={form.control} name="payment_method" render={({ field }) => (
              <FormItem>
                <FormLabel>Metodo</FormLabel>
                <Select onValueChange={field.onChange} value={field.value}>
                  <FormControl>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    <SelectItem value="bank_transfer">Bonifico</SelectItem>
                    <SelectItem value="paypal">PayPal</SelectItem>
                    <SelectItem value="other">Altro</SelectItem>
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )} />
            <FormField control={form.control} name="notes" render={({ field }) => (
              <FormItem>
                <FormLabel>Note (opzionale)</FormLabel>
                <FormControl><Textarea placeholder="Note..." {...field} /></FormControl>
                <FormMessage />
              </FormItem>
            )} />
            <Button type="submit" className="w-full" disabled={mutation.isPending}>
              Registra Pagamento
            </Button>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
