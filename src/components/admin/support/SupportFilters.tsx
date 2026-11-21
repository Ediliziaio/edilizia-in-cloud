import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supportPriorityLabels, supportStatusLabels } from "./supportInbox";

interface SupportFiltersProps {
  statusFilter: string;
  onStatusChange: (status: string) => void;
  priorityFilter: string;
  onPriorityChange: (priority: string) => void;
  sortBy: string;
  onSortChange: (sort: string) => void;
  overdueOnly: boolean;
  onOverdueChange: (value: boolean) => void;
}

export function SupportFilters({
  statusFilter,
  onStatusChange,
  priorityFilter,
  onPriorityChange,
  sortBy,
  onSortChange,
  overdueOnly,
  onOverdueChange,
}: SupportFiltersProps) {
  return (
    <div className="space-y-4">
      <div className="space-y-1.5">
        <Label htmlFor="support-filter-status">Stato</Label>
        <Select value={statusFilter} onValueChange={onStatusChange}>
          <SelectTrigger id="support-filter-status"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Tutti gli stati</SelectItem>
            {Object.entries(supportStatusLabels).map(([value, label]) => (
              <SelectItem key={value} value={value}>{label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="support-filter-priority">Priorità</Label>
        <Select value={priorityFilter} onValueChange={onPriorityChange}>
          <SelectTrigger id="support-filter-priority"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Tutte le priorità</SelectItem>
            <SelectItem value="high_or_urgent">Alta o urgente</SelectItem>
            {Object.entries(supportPriorityLabels).map(([value, label]) => (
              <SelectItem key={value} value={value}>{label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="support-filter-sort">Ordina per</Label>
        <Select value={sortBy} onValueChange={onSortChange}>
          <SelectTrigger id="support-filter-sort"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="recent">Più recenti</SelectItem>
            <SelectItem value="oldest">Più vecchi</SelectItem>
            <SelectItem value="priority">Priorità</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="flex items-start gap-2">
        <Checkbox id="support-filter-overdue" checked={overdueOnly} onCheckedChange={(value) => onOverdueChange(value === true)} />
        <Label htmlFor="support-filter-overdue" className="leading-snug">Oltre 24 ore senza risposta</Label>
      </div>
    </div>
  );
}
