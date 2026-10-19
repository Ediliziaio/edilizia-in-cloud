import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { formatCurrency } from "@/lib/formatters";

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
import { costoOrarioDipendente } from "@/lib/costoOrarioDipendente";
import { ETICHETTA_PROFILO, PROFILI_COSTO, oneriPercento, parametriDelProfilo, profiloCostoDipendente } from "@/lib/costoPersonale";
import { useParametriCostoPersonale } from "@/hooks/useParametriCostoPersonale";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { EntityCustomFieldsSection } from "@/components/shared/EntityCustomFieldsSection";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const employeeSchema = z.object({
  first_name: z.string().min(1, "Nome obbligatorio"),
  last_name: z.string().min(1, "Cognome obbligatorio"),
  email: z.string().email("Email non valida").optional().or(z.literal("")),
  phone: z.string().optional(),
  phone_whatsapp: z.string().optional(),
  gross_salary: z.coerce.number<number>().min(0, "Deve essere >= 0"),
  net_salary: z.coerce.number<number>().min(0, "Deve essere >= 0"),
  monthly_hours: z.coerce.number<number>().min(1, "Deve essere >= 1").max(744, "Max 744 ore"),
  costo_orario: z.coerce.number<number>().min(0, "Deve essere >= 0").optional(),
  is_active: z.boolean(),
  area: z.enum(["cantiere", "commerciale", "amministrazione", "tecnico"]).default("cantiere"),
  // "auto" = ricavato da ruolo e qualifica; si salva come null.
  profilo_costo: z.enum(["auto", "operaio", "apprendista", "impiegato"]).default("auto"),
});

export type EmployeeFormData = z.infer<typeof employeeSchema>;

interface EmployeeDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  employee: {
    id: string;
    first_name: string;
    last_name: string;
    email: string | null;
    phone: string | null;
    phone_whatsapp?: string | null;
    gross_salary: number;
    net_salary: number;
    monthly_hours: number;
    is_active: boolean;
    role_type?: string;
    area?: string | null;
    costo_orario?: number | null;
    inps_rate?: number | null;
    qualifica?: string | null;
    profilo_costo?: string | null;
  } | null;
  onSave: (data: EmployeeFormData) => void;
  isSaving: boolean;
  roleType?: 'operaio' | 'staff_interno';
}

export function EmployeeDialog({
  open,
  onOpenChange,
  employee,
  onSave,
  isSaving,
  roleType = 'operaio',
}: EmployeeDialogProps) {
  const effectiveRoleType = employee?.role_type || roleType;
  const isStaffInterno = effectiveRoleType === 'staff_interno';
  const entityLabel = isStaffInterno ? 'Staff' : 'Operaio';
  const form = useForm<z.input<typeof employeeSchema>, unknown, EmployeeFormData>({
    resolver: zodResolver(employeeSchema),
    defaultValues: {
      first_name: "",
      last_name: "",
      email: "",
      phone: "",
      phone_whatsapp: "",
      gross_salary: 0,
      net_salary: 0,
      monthly_hours: 173,
      is_active: true,
      area: "cantiere" as const,
      profilo_costo: "auto" as const,
    },
  });

  useEffect(() => {
    if (employee) {
      form.reset({
        first_name: employee.first_name,
        last_name: employee.last_name,
        email: employee.email || "",
        phone: employee.phone || "",
        phone_whatsapp: employee.phone_whatsapp || "",
        gross_salary: employee.gross_salary,
        net_salary: employee.net_salary,
        monthly_hours: employee.monthly_hours,
        costo_orario: employee.costo_orario ?? undefined,
        is_active: employee.is_active,
        area: employeeSchema.shape.area.removeDefault().safeParse(employee.area).data ?? (employee.role_type === "staff_interno" ? "amministrazione" : "cantiere"),
        profilo_costo: employeeSchema.shape.profilo_costo.removeDefault().safeParse(employee.profilo_costo).data ?? "auto",
      });
    } else {
      form.reset({
        first_name: "",
        last_name: "",
        email: "",
        phone: "",
        phone_whatsapp: "",
        gross_salary: 0,
        net_salary: 0,
        monthly_hours: 173,
        is_active: true,
        area: "cantiere" as const,
        profilo_costo: "auto" as const,
      });
    }
  }, [employee, form]);

  const grossSalary = form.watch("gross_salary");
  const monthlyHours = form.watch("monthly_hours");
  const area = form.watch("area");
  const profiloScelto = form.watch("profilo_costo");
  const { data: parametri } = useParametriCostoPersonale();
  const datiProfilo = {
    profilo_costo: profiloScelto === "auto" ? null : profiloScelto,
    role_type: effectiveRoleType, qualifica: employee?.qualifica ?? null, area,
  };
  const profilo = profiloCostoDipendente(datiProfilo);
  const profiloAuto = profiloCostoDipendente({ ...datiProfilo, profilo_costo: null });
  const p = parametriDelProfilo(profilo, parametri);
  const inpsRate = employee?.inps_rate ?? null;
  // Stesso calcolo del database: il numero suggerito qui è ESATTAMENTE quello
  // che finirà in commessa se il campo resta vuoto.
  const hourlyCost = costoOrarioDipendente({
    ...datiProfilo,
    gross_salary: grossSalary,
    monthly_hours: monthlyHours,
    inps_rate: inpsRate,
  }, parametri);

  const handleSubmit = (data: EmployeeFormData) => {
    onSave(data);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>
            {employee ? `Modifica ${entityLabel}` : `Nuovo ${entityLabel}`}
          </DialogTitle>
          <DialogDescription>
            {employee
              ? `Modifica i dati del ${entityLabel.toLowerCase()}`
              : `Inserisci i dati del nuovo ${entityLabel.toLowerCase()}`}
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
                      <Input type="email" placeholder="mario@esempio.it" {...field} />
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
              name="phone_whatsapp"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Numero WhatsApp (Bot AI)</FormLabel>
                  <FormControl>
                    <Input placeholder="+39 333 1234567 (per il bot cantiere)" {...field} />
                  </FormControl>
                  <FormDescription>
                    Numero WhatsApp per inviare rapportini, DDT e foto via bot AI.
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="area"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Area Aziendale *</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Seleziona area" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="cantiere">
                        <span className="flex items-center gap-2">🏗️ Cantiere</span>
                      </SelectItem>
                      <SelectItem value="commerciale">
                        <span className="flex items-center gap-2">💼 Commerciale</span>
                      </SelectItem>
                      <SelectItem value="amministrazione">
                        <span className="flex items-center gap-2">🏢 Amministrazione</span>
                      </SelectItem>
                      <SelectItem value="tecnico">
                        <span className="flex items-center gap-2">🔧 Tecnico</span>
                      </SelectItem>
                    </SelectContent>
                  </Select>
                  <FormDescription>
                    Determina in quale calendario e in quali assegnazioni appare questo dipendente
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="profilo_costo"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Contratto per il costo</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="auto">Automatico · {ETICHETTA_PROFILO[profiloAuto]}</SelectItem>
                      {PROFILI_COSTO.map((k) => (
                        <SelectItem key={k} value={k}>{ETICHETTA_PROFILO[k]}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormDescription>
                    Decide mensilità e oneri (INPS, INAIL, Cassa Edile, TFR). I valori sono in «Valori del costo», in cima alla pagina.
                  </FormDescription>
                </FormItem>
              )}
            />

            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="gross_salary"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Stipendio Lordo (€/mese) *</FormLabel>
                    <FormControl>
                      <Input type="number" step="0.01" min="0" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="net_salary"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Stipendio Netto (€/mese) *</FormLabel>
                    <FormControl>
                      <Input type="number" step="0.01" min="0" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <FormField
              control={form.control}
              name="monthly_hours"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Ore Lavorative Mensili *</FormLabel>
                  <FormControl>
                    <Input type="number" min="1" max="744" {...field} />
                  </FormControl>
                  <FormDescription>
                    Costo orario vero: <strong>{formatCurrency(hourlyCost)}/h</strong>
                    {" "}· {p.mensilita} mensilità, {oneriPercento(p, inpsRate).toLocaleString("it-IT")}% di oneri, {p.ore_produttive}% di ore produttive
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="costo_orario"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Costo orario in commessa (€/h)</FormLabel>
                  <FormControl>
                    <Input type="number" min="0" step="0.5" placeholder={String(hourlyCost || "")} {...field} value={field.value ?? ""} />
                  </FormControl>
                  <FormDescription>
                    Quando un rapportino viene approvato, le ore diventano costo di
                    commessa a questa tariffa. Se lasci vuoto si usa il costo vero
                    calcolato dallo stipendio, il valore suggerito qui sopra.
                  </FormDescription>
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
                    <FormLabel>Dipendente Attivo</FormLabel>
                    <FormDescription>
                      I dipendenti inattivi non sono selezionabili per nuovi ordini
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

            {/* v8.6.113 — Campi personalizzati dipendenti (object_type='employee'). */}
            {employee?.id && (
              <div className="pt-3 border-t">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">
                  Campi personalizzati
                </p>
                <EntityCustomFieldsSection entityType="employee" entityId={employee.id} />
              </div>
            )}

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => onOpenChange(false)}
              >
                Annulla
              </Button>
              <Button type="submit" disabled={isSaving}>
                {isSaving ? "Salvataggio..." : employee ? "Salva Modifiche" : `Crea ${entityLabel}`}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
