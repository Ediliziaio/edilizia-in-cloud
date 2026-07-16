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
      <SelectTrigger className="h-8 w-[150px] min-w-0 sm:h-9 sm:w-[220px]">
        <SelectValue placeholder="Seleziona sequenza" />
      </SelectTrigger>
      <SelectContent>
        {pipelines.map((p) => (
          <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
