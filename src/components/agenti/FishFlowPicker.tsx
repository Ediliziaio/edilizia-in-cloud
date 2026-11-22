import { useId } from "react";
import { Check, Headphones, LifeBuoy, PhoneOutgoing } from "lucide-react";
import { FISH_FLOW_PRESETS } from "@/lib/fishFlows";

const groups = [
  {
    label: "Rispondi al telefono",
    icon: Headphones,
    flows: ["complete", "callback", "operator", "orders"],
  },
  {
    label: "Assistenza e appuntamenti",
    icon: LifeBuoy,
    flows: ["support_appointment", "support", "appointment"],
  },
  {
    label: "Chiama i contatti",
    icon: PhoneOutgoing,
    flows: ["lead_qualification", "sales_outbound"],
  },
];

export function FishFlowPicker({
  value,
  onChange,
  disabled,
}: {
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
}) {
  const name = useId();
  return (
    <fieldset disabled={disabled} className="space-y-3">
      <legend className="sr-only">Attività dell’assistente</legend>
      {groups.map(({ label, icon: Icon, flows }) => (
        <section key={label} aria-label={label}>
          <h3 className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold">
            <Icon
              aria-hidden="true"
              className="size-3.5 text-sky-700 dark:text-sky-300"
            />
            {label}
          </h3>
          <div className="grid gap-1.5 min-[360px]:grid-cols-2">
            {flows.map((id) => {
              const flow = FISH_FLOW_PRESETS.find((item) => item.id === id);
              if (!flow) return null;
              const optionId = `${name}-${id}`;
              return (
                <label
                  key={id}
                  className="relative min-w-0"
                  title={flow.description}
                >
                  <input
                    type="radio"
                    name={name}
                    checked={id === value}
                    value={id}
                    aria-labelledby={`${optionId}-label`}
                    aria-describedby={`${optionId}-description`}
                    onChange={() => onChange(id)}
                    className="peer sr-only"
                  />
                  <span className="flex h-full min-h-11 cursor-pointer items-center gap-1.5 rounded-lg border bg-card px-2 py-1.5 transition-colors sm:min-h-9 hover:border-sky-400 peer-checked:border-sky-600 peer-checked:bg-sky-50 peer-focus-visible:ring-2 peer-focus-visible:ring-sky-600 peer-disabled:cursor-not-allowed peer-disabled:opacity-60 dark:peer-checked:bg-sky-950/45">
                    <span
                      className={`grid size-3.5 shrink-0 place-items-center rounded-full border ${id === value ? "border-sky-700 bg-sky-700 text-white" : "border-muted-foreground/45"}`}
                      aria-hidden="true"
                    >
                      {id === value && <Check className="size-3" />}
                    </span>
                    <span
                      id={`${optionId}-label`}
                      className="min-w-0 text-xs font-medium leading-4"
                    >
                      {flow.title}
                    </span>
                  </span>
                  <span id={`${optionId}-description`} className="sr-only">
                    {flow.description}
                  </span>
                </label>
              );
            })}
          </div>
        </section>
      ))}
    </fieldset>
  );
}
