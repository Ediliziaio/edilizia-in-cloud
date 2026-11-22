import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

interface Pipeline {
  id: string;
  name: string;
}

export function PipelineSelector({ pipelines, value, onChange }: {
  pipelines: Pipeline[];
  value: string | null;
  onChange: (id: string) => void;
}) {
  return (
    <Select value={value || ""} onValueChange={onChange}>
      <SelectTrigger aria-label="Pipeline commerciale" className="h-11 w-full min-w-0 text-base md:h-9 md:w-[220px] md:text-sm">
        <SelectValue placeholder="Seleziona pipeline" />
      </SelectTrigger>
      <SelectContent>
        {pipelines.map((p) => (
          <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
