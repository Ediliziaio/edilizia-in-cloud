import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { CalendarIcon, RefreshCw, ScrollText } from "lucide-react";
import { format } from "date-fns";
import { it } from "date-fns/locale";
import { cn } from "@/lib/utils";

export function AutomationLogsTab() {
  const [startDate, setStartDate] = useState<Date>();
  const [endDate, setEndDate] = useState<Date>();

  return (
    <div className="flex-1 overflow-y-auto p-6 space-y-4">
      <div>
        <h2 className="text-lg font-semibold">Registro di esecuzione</h2>
        <p className="text-sm text-muted-foreground mt-1">
          Visualizza il registro di tutte le azioni eseguite da questo flusso di lavoro.
        </p>
      </div>

      {/* Filtri */}
      <div className="flex flex-wrap items-center gap-2">
        <Popover>
          <PopoverTrigger asChild>
            <Button variant="outline" size="sm" className={cn("justify-start text-left font-normal min-w-[140px]", !startDate && "text-muted-foreground")}>
              <CalendarIcon className="h-3.5 w-3.5 mr-1.5" />
              {startDate ? format(startDate, "dd/MM/yyyy", { locale: it }) : "Data di inizio"}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-0" align="start">
            <Calendar mode="single" selected={startDate} onSelect={setStartDate} className="p-3 pointer-events-auto" />
          </PopoverContent>
        </Popover>

        <span className="text-muted-foreground text-sm">→</span>

        <Popover>
          <PopoverTrigger asChild>
            <Button variant="outline" size="sm" className={cn("justify-start text-left font-normal min-w-[140px]", !endDate && "text-muted-foreground")}>
              <CalendarIcon className="h-3.5 w-3.5 mr-1.5" />
              {endDate ? format(endDate, "dd/MM/yyyy", { locale: it }) : "Data di fine"}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-0" align="start">
            <Calendar mode="single" selected={endDate} onSelect={setEndDate} className="p-3 pointer-events-auto" />
          </PopoverContent>
        </Popover>

        <Select defaultValue="all_activity">
          <SelectTrigger className="w-[160px] h-8 text-sm">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all_activity">Ogni attività</SelectItem>
            <SelectItem value="email">Email</SelectItem>
            <SelectItem value="sms">SMS</SelectItem>
            <SelectItem value="whatsapp">WhatsApp</SelectItem>
            <SelectItem value="webhook">Webhook</SelectItem>
          </SelectContent>
        </Select>

        <Select defaultValue="all_status">
          <SelectTrigger className="w-[140px] h-8 text-sm">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all_status">Ogni Stato</SelectItem>
            <SelectItem value="success">Successo</SelectItem>
            <SelectItem value="failed">Fallito</SelectItem>
            <SelectItem value="pending">In attesa</SelectItem>
          </SelectContent>
        </Select>

        <Input placeholder="Seleziona Contatto" className="w-[200px] h-8 text-sm" />

        <Button variant="ghost" size="icon" className="h-8 w-8">
          <RefreshCw className="h-3.5 w-3.5" />
        </Button>
      </div>

      {/* Tabella */}
      <div className="border rounded-lg">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Contatto</TableHead>
              <TableHead>Azione</TableHead>
              <TableHead>Stato</TableHead>
              <TableHead>Eseguito (CET +01:00)</TableHead>
              <TableHead className="w-[80px]">Attività</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            <TableRow>
              <TableCell colSpan={5} className="h-48">
                <div className="flex flex-col items-center justify-center text-muted-foreground">
                  <ScrollText className="h-10 w-10 mb-3 opacity-30" />
                  <p className="text-sm font-medium">Nessun registro di controllo trovato</p>
                  <p className="text-xs mt-1">I registri di esecuzione sono disponibili fino agli ultimi 30 giorni.</p>
                </div>
              </TableCell>
            </TableRow>
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
