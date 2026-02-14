import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

interface SupportFiltersProps {
  statusFilter: string;
  onStatusChange: (status: string) => void;
  priorityFilter: string;
  onPriorityChange: (priority: string) => void;
  sortBy: string;
  onSortChange: (sort: string) => void;
}

export function SupportFilters({
  statusFilter,
  onStatusChange,
  priorityFilter,
  onPriorityChange,
  sortBy,
  onSortChange,
}: SupportFiltersProps) {
  return (
    <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center">
      <Tabs value={statusFilter} onValueChange={onStatusChange} className="w-full sm:w-auto">
        <TabsList className="w-full sm:w-auto">
          <TabsTrigger value="all" className="text-xs">Tutti</TabsTrigger>
          <TabsTrigger value="open" className="text-xs">Aperte</TabsTrigger>
          <TabsTrigger value="in_progress" className="text-xs">In lavorazione</TabsTrigger>
          <TabsTrigger value="resolved" className="text-xs">Risolte</TabsTrigger>
          <TabsTrigger value="closed" className="text-xs">Chiuse</TabsTrigger>
        </TabsList>
      </Tabs>

      <div className="flex gap-2">
        <Select value={priorityFilter} onValueChange={onPriorityChange}>
          <SelectTrigger className="w-[130px] h-9 text-xs">
            <SelectValue placeholder="Priorità" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Tutte</SelectItem>
            <SelectItem value="low">Bassa</SelectItem>
            <SelectItem value="normal">Normale</SelectItem>
            <SelectItem value="high">Alta</SelectItem>
            <SelectItem value="urgent">Urgente</SelectItem>
          </SelectContent>
        </Select>

        <Select value={sortBy} onValueChange={onSortChange}>
          <SelectTrigger className="w-[140px] h-9 text-xs">
            <SelectValue placeholder="Ordina per" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="recent">Più recenti</SelectItem>
            <SelectItem value="oldest">Più vecchie</SelectItem>
            <SelectItem value="priority">Priorità</SelectItem>
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}
