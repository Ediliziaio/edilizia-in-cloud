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
import { useT } from "@/lib/campo/lingua/LinguaCampo";

const salespersonSchema = z.object({
  first_name: z.string().min(1, "Il nome è obbligatorio"),
  last_name: z.string().min(1, "Il cognome è obbligatorio"),
  email: z.string().email("Email non valida").optional().or(z.literal("")),
  phone: z.string().optional(),
  compensation_mode: z.enum(["only_commission", "fixed_plus_commission", "fixed_only"]),
  fixed_monthly_eur: z.coerce.number<number>().min(0, "Il fisso non può essere negativo").default(0),
  commission_type: z.enum(["fixed", "percentage_sold", "percentage_collected"]),
  commission_value: z.coerce.number<number>().min(0, "Il valore non può essere negativo"),
});

type SalespersonFormData = z.infer<typeof salespersonSchema>;

interface Salesperson {
  id: string;
  first_name: string;
  last_name: string;
  email: string | null;
  phone: string | null;
  compensation_mode?: "only_commission" | "fixed_plus_commission" | "fixed_only";
  fixed_monthly_eur?: number | null;
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
  const t = useT();
  const form = useForm<z.input<typeof salespersonSchema>, unknown, SalespersonFormData>({
    resolver: zodResolver(salespersonSchema),
    defaultValues: {
      first_name: "",
      last_name: "",
      email: "",
      phone: "",
      compensation_mode: "only_commission",
      fixed_monthly_eur: 0,
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
          compensation_mode: salesperson.compensation_mode ?? "only_commission",
          fixed_monthly_eur: salesperson.fixed_monthly_eur ?? 0,
          commission_type: salesperson.commission_type,
          commission_value: salesperson.commission_value,
        });
      } else {
        form.reset({
          first_name: "",
          last_name: "",
          email: "",
          phone: "",
          compensation_mode: "only_commission",
          fixed_monthly_eur: 0,
          commission_type: "percentage_sold",
          commission_value: 0,
        });
      }
    }
  }, [open, salesperson, form]);

  const commissionType = form.watch("commission_type");
  const compensationMode = form.watch("compensation_mode");
  const fixedMonthly = form.watch("fixed_monthly_eur");
  const commissionValue = form.watch("commission_value");

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
            {salesperson ? t("Modifica venditore") : t("Nuovo venditore")}
          </DialogTitle>
          <DialogDescription>
            {salesperson
              ? t("Modifica i dati del venditore e le sue provvigioni.")
              : t("Inserisci i dati del nuovo venditore.")}
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
                    <FormLabel>{t("Nome *")}</FormLabel>
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
                    <FormLabel>{t("Cognome *")}</FormLabel>
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
                    <FormLabel>{t("Telefono")}</FormLabel>
                    <FormControl>
                      <Input placeholder="+39 333 1234567" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <div className="border-t pt-4 mt-4">
              <h4 className="font-medium mb-3">{t("Modalità compenso")}</h4>
              <FormField
                control={form.control}
                name="compensation_mode"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t("Come viene pagato")}</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder={t("Seleziona modalità")} />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="only_commission">{t("Solo provvigioni")}</SelectItem>
                        <SelectItem value="fixed_plus_commission">{t("Fisso + provvigioni")}</SelectItem>
                        <SelectItem value="fixed_only">{t("Solo fisso (nessuna provvigione)")}</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {(compensationMode === "fixed_plus_commission" || compensationMode === "fixed_only") && (
                <div className="mt-3">
                  <FormField
                    control={form.control}
                    name="fixed_monthly_eur"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>{t("Fisso mensile (€)")}</FormLabel>
                        <FormControl>
                          <Input type="number" step="0.01" min="0" placeholder="1500.00" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
              )}

              {compensationMode !== "fixed_only" && (
                <>
                  <h4 className="font-medium mt-5 mb-3">{t("Provvigione sul preventivo")}</h4>
                  <div className="grid grid-cols-2 gap-4">
                    <FormField
                      control={form.control}
                      name="commission_type"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>{t("Tipo")}</FormLabel>
                          <Select onValueChange={field.onChange} value={field.value}>
                            <FormControl>
                              <SelectTrigger>
                                <SelectValue placeholder={t("Seleziona tipo")} />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              <SelectItem value="fixed">{t("Importo fisso")}</SelectItem>
                              <SelectItem value="percentage_sold">{t("% sul venduto")}</SelectItem>
                              <SelectItem value="percentage_collected">{t("% sull'incassato")}</SelectItem>
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
                          <FormLabel>{commissionType === "fixed" ? t("Importo (€)") : t("Percentuale (%)")}</FormLabel>
                          <FormControl>
                            <Input type="number" step={commissionType === "fixed" ? "0.01" : "0.1"} min="0"
                              placeholder={commissionType === "fixed" ? "500.00" : "3.0"} {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                </>
              )}

              <div className="mt-3 p-3 rounded-md bg-muted/50 text-xs text-muted-foreground">
                <p className="font-medium text-foreground mb-1">{t("Simulazione su preventivo €10.000")}</p>
                {compensationMode === "fixed_only" && (
                  <p>{t("Fisso mensile: €{valore} · nessuna provvigione per preventivo.", { valore: (fixedMonthly ?? 0).toFixed(2) })}</p>
                )}
                {compensationMode !== "fixed_only" && commissionType === "fixed" && (
                  <p>{t("Provvigione per preventivo: €{valore}", { valore: (commissionValue ?? 0).toFixed(2) })}
                    {compensationMode === "fixed_plus_commission" && ` · ${t("+ fisso €{valore}/mese", { valore: (fixedMonthly ?? 0).toFixed(2) })}`}
                  </p>
                )}
                {compensationMode !== "fixed_only" && commissionType === "percentage_sold" && (
                  <p>{t("Provvigione teorica: €{valore} ({percentuale}% di €10.000)", { valore: (10000 * (commissionValue ?? 0) / 100).toFixed(2), percentuale: commissionValue ?? 0 })}
                    {compensationMode === "fixed_plus_commission" && ` · ${t("+ fisso €{valore}/mese", { valore: (fixedMonthly ?? 0).toFixed(2) })}`}
                  </p>
                )}
                {compensationMode !== "fixed_only" && commissionType === "percentage_collected" && (
                  <p>{t("Provvigione: {percentuale}% di quanto il cliente ha pagato davvero (alla firma è 0, cresce man mano che incassi)", { percentuale: commissionValue ?? 0 })}
                    {compensationMode === "fixed_plus_commission" && ` · ${t("+ fisso €{valore}/mese", { valore: (fixedMonthly ?? 0).toFixed(2) })}`}
                  </p>
                )}
              </div>
            </div>

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => onOpenChange(false)}
                disabled={isLoading}
              >
                {t("Annulla")}
              </Button>
              <Button type="submit" disabled={isLoading}>
                {isLoading && <Loader2 className="h-4 w-4 mr-2 animate-spin" aria-hidden="true" />}
                {salesperson ? t("Salva") : t("Crea")}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
