/**
 * @file SmsAutomationForm.tsx
 * @description Form creazione/modifica automazione SMS transazionale.
 * @author Claude Code — AEDIX S.r.l.
 * @date 2026-04-07
 */

import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Info } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import type { SmsAutomation, SmsAutomationFormData } from "@/types/sms";
import {
  SMS_AUTOMATION_EVENTO_LABELS,
  SMS_DESTINATARIO_LABELS,
} from "@/types/sms";

const schema = z.object({
  nome: z.string().min(1, "Nome obbligatorio").max(100),
  descrizione: z.string().max(300).optional(),
  trigger_evento: z.enum([
    "preventivo_firmato", "preventivo_inviato", "fattura_scaduta",
    "cantiere_iniziato", "cantiere_completato", "intervento_programmato",
    "documento_caricato", "pagamento_ricevuto",
  ]),
  delay_minuti: z.number().min(0).max(10080).default(0),
  template_body: z.string().min(1, "Testo messaggio obbligatorio").max(1600),
  tipo_destinatario: z.enum(["cliente", "tecnico", "custom_number"]),
  numero_custom: z.string().optional(),
  attiva: z.boolean().default(true),
}).refine(
  (data) => data.tipo_destinatario !== "custom_number" || !!data.numero_custom,
  { message: "Inserisci il numero personalizzato", path: ["numero_custom"] }
);

type FormValues = z.infer<typeof schema>;

interface SmsAutomationFormProps {
  open: boolean;
  onClose: () => void;
  onSubmit: (data: SmsAutomationFormData) => void;
  isPending: boolean;
  defaultValues?: SmsAutomation | null;
}

const VARIABILI_DISPONIBILI = ["{{nome}}", "{{importo}}", "{{data}}", "{{indirizzo}}", "{{telefono_cliente}}", "{{telefono_tecnico}}"];

export function SmsAutomationForm({
  open,
  onClose,
  onSubmit,
  isPending,
  defaultValues,
}: SmsAutomationFormProps) {
  const {
    register,
    handleSubmit,
    watch,
    setValue,
    reset,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      nome: "",
      descrizione: "",
      trigger_evento: "preventivo_firmato",
      delay_minuti: 0,
      template_body: "",
      tipo_destinatario: "cliente",
      numero_custom: "",
      attiva: true,
    },
  });

  const tipoDestinatario = watch("tipo_destinatario");
  const attiva = watch("attiva");

  useEffect(() => {
    if (defaultValues) {
      reset({
        nome: defaultValues.nome,
        descrizione: defaultValues.descrizione ?? "",
        trigger_evento: defaultValues.trigger_evento,
        delay_minuti: defaultValues.delay_minuti,
        template_body: defaultValues.template_body,
        tipo_destinatario: defaultValues.tipo_destinatario,
        numero_custom: defaultValues.numero_custom ?? "",
        attiva: defaultValues.attiva,
      });
    } else {
      reset();
    }
  }, [defaultValues, reset]);

  const handleFormSubmit = (values: FormValues) => {
    onSubmit({
      nome: values.nome,
      descrizione: values.descrizione,
      trigger_evento: values.trigger_evento,
      delay_minuti: values.delay_minuti,
      template_body: values.template_body,
      tipo_destinatario: values.tipo_destinatario,
      numero_custom: values.tipo_destinatario === "custom_number" ? values.numero_custom : undefined,
      attiva: values.attiva,
    });
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {defaultValues ? "Modifica automazione" : "Nuova automazione SMS"}
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit(handleFormSubmit)} className="space-y-4">
          {/* Nome */}
          <div className="space-y-1.5">
            <Label htmlFor="nome">Nome automazione</Label>
            <Input id="nome" placeholder="Es. Conferma preventivo firmato" {...register("nome")} />
            {errors.nome && <p className="text-xs text-red-600">{errors.nome.message}</p>}
          </div>

          {/* Evento trigger */}
          <div className="space-y-1.5">
            <Label>Evento trigger</Label>
            <Select
              value={watch("trigger_evento")}
              onValueChange={(v) => setValue("trigger_evento", v as FormValues["trigger_evento"])}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(Object.entries(SMS_AUTOMATION_EVENTO_LABELS) as [FormValues["trigger_evento"], string][]).map(([k, label]) => (
                  <SelectItem key={k} value={k}>{label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Delay */}
          <div className="space-y-1.5">
            <Label htmlFor="delay_minuti">Ritardo (minuti)</Label>
            <Input
              id="delay_minuti"
              type="number"
              min={0}
              max={10080}
              placeholder="0 = immediato"
              {...register("delay_minuti", { valueAsNumber: true })}
            />
            <p className="text-xs text-muted-foreground">0 = invio immediato · 1440 = 24h · 10080 = 7 giorni</p>
          </div>

          {/* Destinatario */}
          <div className="space-y-1.5">
            <Label>Destinatario</Label>
            <Select
              value={tipoDestinatario}
              onValueChange={(v) => setValue("tipo_destinatario", v as FormValues["tipo_destinatario"])}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(Object.entries(SMS_DESTINATARIO_LABELS) as [FormValues["tipo_destinatario"], string][]).map(([k, label]) => (
                  <SelectItem key={k} value={k}>{label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            {tipoDestinatario === "custom_number" && (
              <div className="mt-2">
                <Input
                  placeholder="+39 333 123 4567"
                  {...register("numero_custom")}
                  className={errors.numero_custom ? "border-red-400" : ""}
                />
                {errors.numero_custom && (
                  <p className="text-xs text-red-600">{errors.numero_custom.message}</p>
                )}
              </div>
            )}
          </div>

          {/* Template body */}
          <div className="space-y-1.5">
            <Label htmlFor="template_body">Testo messaggio</Label>
            <Textarea
              id="template_body"
              rows={4}
              placeholder="Salve {{nome}}, il suo preventivo di €{{importo}} è stato firmato. Grazie per aver scelto la nostra azienda."
              {...register("template_body")}
              className={errors.template_body ? "border-red-400" : ""}
            />
            {errors.template_body && (
              <p className="text-xs text-red-600">{errors.template_body.message}</p>
            )}
            <div className="flex items-start gap-1.5 text-xs text-muted-foreground">
              <Info className="h-3.5 w-3.5 mt-0.5 shrink-0" />
              <span>Variabili disponibili: {VARIABILI_DISPONIBILI.join(" · ")}</span>
            </div>
          </div>

          {/* Attiva */}
          <div className="flex items-center gap-3">
            <Switch
              id="attiva"
              checked={attiva}
              onCheckedChange={(v) => setValue("attiva", v)}
            />
            <Label htmlFor="attiva" className="cursor-pointer">
              Automazione {attiva ? "attiva" : "disattivata"}
            </Label>
          </div>

          <DialogFooter className="pt-2">
            <Button type="button" variant="outline" onClick={onClose}>
              Annulla
            </Button>
            <Button
              type="submit"
              disabled={isPending}
              className="bg-[#1E3A5F] hover:bg-[#162d4a] text-white"
            >
              {isPending ? "Salvataggio…" : defaultValues ? "Salva modifiche" : "Crea automazione"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
