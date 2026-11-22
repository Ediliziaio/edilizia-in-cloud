import { useId } from "react";
import { Check, Headphones, LifeBuoy, PhoneOutgoing } from "lucide-react";
import { FISH_FLOW_PRESETS } from "@/lib/fishFlows";

const groups = [
  { label: "Rispondi al telefono", icon: Headphones, flows: ["complete", "callback", "operator", "orders"] },
  { label: "Assistenza e appuntamenti", icon: LifeBuoy, flows: ["support_appointment", "support", "appointment"] },
  { label: "Chiama i contatti", icon: PhoneOutgoing, flows: ["lead_qualification", "sales_outbound"] },
];
const quickFlows = ["lead_qualification", "support_appointment", "complete"];

export function FishFlowPicker({ value, onChange, disabled, quickStart = false }: {
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  quickStart?: boolean;
}) {
  const name = useId();

  function renderOptions(ids: string[], description = false) {
    return ids.map(id => {
      const flow = FISH_FLOW_PRESETS.find(item => item.id === id);
      if (!flow) return null;
      const optionId = `${name}-${id}`;
      return (
        <label key={id} className="relative min-w-0" title={flow.description}>
          <input type="radio" name={name} checked={id === value} value={id} onChange={() => onChange(id)}
            aria-labelledby={`${optionId}-label`} aria-describedby={`${optionId}-description`} className="peer sr-only" />
          <span className="flex h-full min-h-11 cursor-pointer items-center gap-2 rounded-lg border bg-card px-2.5 py-2 transition-colors hover:border-sky-400 peer-checked:border-sky-600 peer-checked:bg-sky-50 peer-focus-visible:ring-2 peer-focus-visible:ring-sky-600 peer-disabled:cursor-not-allowed peer-disabled:opacity-60 dark:peer-checked:bg-sky-950/45">
            <span className={`grid size-3.5 shrink-0 place-items-center rounded-full border ${id === value ? "border-sky-700 bg-sky-700 text-white" : "border-muted-foreground/45"}`} aria-hidden="true">
              {id === value && <Check className="size-3" />}
            </span>
            <span className="grid min-w-0 gap-0.5">
              <span id={`${optionId}-label`} className="text-xs font-medium leading-4">{flow.title}</span>
              <span id={`${optionId}-description`} className={description ? "text-xs leading-4 text-muted-foreground" : "sr-only"}>{flow.description}</span>
            </span>
          </span>
        </label>
      );
    });
  }

  const alternatives = groups.map(({ label, icon: Icon, flows }) => {
    const options = quickStart ? flows.filter(id => !quickFlows.includes(id)) : flows;
    return (
      <section key={label} aria-label={label}>
        <h3 className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold">
          <Icon aria-hidden="true" className="size-3.5 text-sky-700 dark:text-sky-300" /> {label}
        </h3>
        <div className="grid gap-1.5 min-[360px]:grid-cols-2">{renderOptions(options)}</div>
      </section>
    );
  });

  return (
    <fieldset disabled={disabled} className="space-y-3">
      <legend className="sr-only">Attività dell’assistente</legend>
      {quickStart ? (
        <>
          <div className="grid gap-2">{renderOptions(quickFlows, true)}</div>
          <details className="rounded-lg border px-2.5 py-2">
            <summary className="cursor-pointer text-sm font-medium">Altri flussi</summary>
            <div className="mt-3 space-y-3">{alternatives}</div>
          </details>
        </>
      ) : alternatives}
    </fieldset>
  );
}
