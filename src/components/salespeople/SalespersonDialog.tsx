import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Loader2 } from "lucide-react";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";

const salespersonSchema = z.object({
  first_name: z.string().min(1, "Il nome è obbligatorio"),
  last_name: z.string().min(1, "Il cognome è obbligatorio"),
  email: z.string().email("Email non valida").optional().or(z.literal("")),
  phone: z.string().optional(),
  commission_type: z.enum(["fixed", "percentage_sold", "percentage_collected"]),
  commission_value: z.coerce.number().min(0, "Il valore deve essere positivo"),
});

type SalespersonFormData = z.infer<typeof salespersonSchema>;

interface Salesperson {
  id: string;
  first_name: string;
  last_name: string;
  email: string | null;
  phone: string | null;
  commission_type: "fixed" | "percentage_sold" | "percentage_collected";
  commission_value: number;
  is_active: boolean;
}

interface SalespersonDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  salesperson: Salesperson | null;
  onSave: (data: Partial<Salesperson> & { id?: string }) => void;
  isLoading: boolean;
}

export function SalespersonDialog({
  open,
  onOpenChange,
  salesperson,
  onSave,
  isLoading,
}: SalespersonDialogProps) {
  const form = useForm<SalespersonFormData>({
    resolver: zodResolver(salespersonSchema),
    defaultValues: {
      first_name: "",
      last_name: "",
      email: "",
      phone: "",
      commission_type: "percentage_sold",
      commission_value: 0,
    },
  });

  useEffect(() => {
    if (open) {
      if (salesperson) {
        form.reset({
          first_name: salesperson.first_name,
          last_name: salesperson.last_name,
          email: salesperson.email || "",
          phone: salesperson.phone || "",
          commission_type: salesperson.commission_type,
          commission_value: salesperson.commission_value,
        });
      } else {
        form.reset({
          first_name: "",
          last_name: "",
          email: "",
          phone: "",
          commission_type: "percentage_sold",
          commission_value: 0,
        });
      }
    }
  }, [open, salesperson, form]);

  const commissionType = form.watch("commission_type");

  const handleSubmit = (data: SalespersonFormData) => {
    onSave({
      ...data,
      id: salesperson?.id,
      email: data.email || null,
      phone: data.phone || null,
      is_active: salesperson?.is_active ?? true,
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>
            {salesperson ? "Modifica Venditore" : "Nuovo Venditore"}
          </DialogTitle>
          <DialogDescription>
            {salesperson
              ? "Modifica i dati del venditore e le sue provvigioni."
              : "Inserisci i dati del nuovo venditore."}
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="first_name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Nome *</FormLabel>
                    <FormControl>
                      <Input placeholder="Mario" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="last_name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Cognome *</FormLabel>
                    <FormControl>
                      <Input placeholder="Rossi" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="email"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Email</FormLabel>
                    <FormControl>
                      <Input
                        type="email"
                        placeholder="mario.rossi@email.com"
                        {...field}
                      />
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

            <div className="border-t pt-4 mt-4">
              <h4 className="font-medium mb-3">Provvigione Default</h4>
              <div className="grid grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="commission_type"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Tipo</FormLabel>
                      <Select
                        onValueChange={field.onChange}
                        value={field.value}
                      >
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Seleziona tipo" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="fixed">Importo Fisso</SelectItem>
                          <SelectItem value="percentage_sold">
                            % sul Venduto
                          </SelectItem>
                          <SelectItem value="percentage_collected">
                            % sull'Incassato
                          </SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="commission_value"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>
                        {commissionType === "fixed" ? "Importo (€)" : "Percentuale (%)"}
                      </FormLabel>
                      <FormControl>
                        <Input
                          type="number"
                          step={commissionType === "fixed" ? "0.01" : "0.1"}
                          min="0"
                          placeholder={commissionType === "fixed" ? "500.00" : "3.0"}
                          {...field}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
              <p className="text-xs text-muted-foreground mt-2">
                {commissionType === "fixed" && "Il venditore riceverà un importo fisso per ogni ordine."}
                {commissionType === "percentage_sold" && "Il venditore riceverà una percentuale sull'imponibile dell'ordine."}
                {commissionType === "percentage_collected" && "Il venditore riceverà una percentuale sull'imponibile effettivamente incassato."}
              </p>
            </div>

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => onOpenChange(false)}
                disabled={isLoading}
              >
                Annulla
              </Button>
              <Button type="submit" disabled={isLoading}>
                {isLoading && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                {salesperson ? "Salva" : "Crea"}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
