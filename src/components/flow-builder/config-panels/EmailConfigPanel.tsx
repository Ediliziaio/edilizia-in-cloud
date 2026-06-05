import { forwardRef } from "react";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { VariablePicker } from "./VariablePicker";
import { EmailBodyEditor, type EmailVariable } from "./EmailBodyEditor";
import { EmailPreviewActions } from "./EmailPreviewActions";

/** Variabili lato azienda (contatto/opportunità) per il corpo email. */
const COMPANY_EMAIL_VARIABLES: EmailVariable[] = [
  { key: "contatto.first_name", label: "Nome contatto" },
  { key: "contatto.last_name", label: "Cognome contatto" },
  { key: "contatto.email", label: "Email contatto" },
  { key: "contatto.company_name", label: "Azienda contatto" },
  { key: "opportunita.name", label: "Nome opportunità" },
];

interface EmailConfigPanelProps {
  config: Record<string, any>;
  onChange: (field: string, value: any) => void;
}

export const EmailConfigPanel = forwardRef<HTMLDivElement, EmailConfigPanelProps>(function EmailConfigPanel({ config, onChange }, ref) {
  return (
    <div ref={ref} className="space-y-4">
      {/* Sender */}
      <div className="space-y-1.5">
        <Label className="text-xs">Da (mittente)</Label>
        <Input
          value={config.da_nome || ""}
          onChange={e => onChange("da_nome", e.target.value)}
          placeholder="Nome mittente"
          className="h-8 text-xs"
        />
        <Input
          value={config.da_email || ""}
          onChange={e => onChange("da_email", e.target.value)}
          placeholder="email@azienda.it"
          className="h-8 text-xs"
        />
      </div>

      {/* Recipient */}
      <div className="space-y-1.5">
        <div className="flex items-center justify-between">
          <Label className="text-xs">Destinatario</Label>
          <VariablePicker onInsert={v => onChange("destinatario", (config.destinatario || "") + v)} />
        </div>
        <Input
          value={config.destinatario || ""}
          onChange={e => onChange("destinatario", e.target.value)}
          placeholder="{{contatto.email}}"
          className="h-8 text-xs"
        />
      </div>

      {/* CC */}
      <div className="space-y-1.5">
        <Label className="text-xs">CC (opzionale)</Label>
        <Input
          value={config.cc || ""}
          onChange={e => onChange("cc", e.target.value)}
          placeholder="cc@azienda.it"
          className="h-8 text-xs"
        />
      </div>

      {/* Subject */}
      <div className="space-y-1.5">
        <div className="flex items-center justify-between">
          <Label className="text-xs">Oggetto</Label>
          <VariablePicker onInsert={v => onChange("oggetto", (config.oggetto || "") + v)} />
        </div>
        <Input
          value={config.oggetto || ""}
          onChange={e => onChange("oggetto", e.target.value)}
          placeholder="Es: Conferma appuntamento - {{appuntamento.appointment_date}}"
          className="h-8 text-xs"
        />
      </div>

      {/* Body — editor visuale (niente HTML a mano) */}
      <div className="space-y-1.5">
        <Label className="text-xs">Corpo email</Label>
        <EmailBodyEditor
          value={config.corpo}
          onChange={(html) => onChange("corpo", html)}
          variables={COMPANY_EMAIL_VARIABLES}
        />
      </div>

      {/* Send delay */}
      <div className="space-y-1.5">
        <Label className="text-xs">Ritardo invio</Label>
        <div className="flex gap-2">
          <Input
            type="number"
            min={0}
            value={config.ritardo_valore || 0}
            onChange={e => onChange("ritardo_valore", parseInt(e.target.value) || 0)}
            className="h-8 text-xs w-20"
          />
          <Select value={config.ritardo_unita || "minuti"} onValueChange={v => onChange("ritardo_unita", v)}>
            <SelectTrigger className="h-8 text-xs flex-1">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="minuti">Minuti</SelectItem>
              <SelectItem value="ore">Ore</SelectItem>
              <SelectItem value="giorni">Giorni</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Anteprima + invio di prova */}
      <EmailPreviewActions oggetto={config.oggetto} corpo={config.corpo} mittenteNome={config.da_nome} />
    </div>
  );
});
