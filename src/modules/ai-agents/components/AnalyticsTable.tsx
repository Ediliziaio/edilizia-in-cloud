import { Fragment, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { ChevronDown, ChevronRight, Search } from "lucide-react";
import { format } from "date-fns";
import { it } from "date-fns/locale";

interface Conversation {
  id: string;
  status: string;
  duration_seconds: number;
  messages_count: number;
  appointment_created: boolean;
  started_at: string;
  elevenlabs_conversation_id: string | null;
  contact_id: string | null;
}

interface AnalyticsTableProps {
  conversations: Conversation[];
}

const formatDuration = (sec: number) => {
  if (sec < 60) return `${sec}s`;
  const min = Math.floor(sec / 60);
  const s = sec % 60;
  return `${min}m ${s}s`;
};

export function AnalyticsTable({ conversations }: AnalyticsTableProps) {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const filtered = conversations.filter((c) => {
    const matchStatus = statusFilter === "all" || c.status === statusFilter;
    const matchSearch = search === "" ||
      c.id.toLowerCase().includes(search.toLowerCase()) ||
      (c.elevenlabs_conversation_id || "").toLowerCase().includes(search.toLowerCase());
    return matchStatus && matchSearch;
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Cerca conversazione..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-[160px]">
            <SelectValue placeholder="Stato" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Tutti gli stati</SelectItem>
            <SelectItem value="completed">Completata</SelectItem>
            <SelectItem value="failed">Fallita</SelectItem>
            <SelectItem value="in_progress">In corso</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-10" />
              <TableHead>Data</TableHead>
              <TableHead>Durata</TableHead>
              <TableHead>Messaggi</TableHead>
              <TableHead>Stato</TableHead>
              <TableHead>Appuntamento</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                  Nessuna conversazione trovata
                </TableCell>
              </TableRow>
            ) : (
              filtered.map((conv) => (
                <Fragment key={conv.id}>
                  <TableRow
                    className="cursor-pointer hover:bg-muted/50"
                    onClick={() => setExpandedId(expandedId === conv.id ? null : conv.id)}
                  >
                    <TableCell>
                      {expandedId === conv.id
                        ? <ChevronDown className="h-4 w-4 text-muted-foreground" />
                        : <ChevronRight className="h-4 w-4 text-muted-foreground" />}
                    </TableCell>
                    <TableCell className="text-sm">
                      {format(new Date(conv.started_at), "d MMM yyyy HH:mm", { locale: it })}
                    </TableCell>
                    <TableCell className="text-sm font-medium">
                      {formatDuration(conv.duration_seconds)}
                    </TableCell>
                    <TableCell className="text-sm">{conv.messages_count}</TableCell>
                    <TableCell>
                      <Badge
                        variant={conv.status === "completed" ? "default" : conv.status === "failed" ? "destructive" : "secondary"}
                      >
                        {conv.status === "completed" ? "Completata" : conv.status === "failed" ? "Fallita" : conv.status}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      {conv.appointment_created && (
                        <Badge variant="outline" className="text-xs">Sì</Badge>
                      )}
                    </TableCell>
                  </TableRow>
                  {expandedId === conv.id && (
                    <TableRow key={`${conv.id}-details`}>
                      <TableCell colSpan={6} className="bg-muted/30 p-4">
                        <div className="space-y-2 text-sm">
                          <p><span className="text-muted-foreground">ID:</span> {conv.id}</p>
                          {conv.elevenlabs_conversation_id && (
                            <p><span className="text-muted-foreground">ElevenLabs ID:</span> {conv.elevenlabs_conversation_id}</p>
                          )}
                          {conv.contact_id && (
                            <p><span className="text-muted-foreground">Contatto:</span> {conv.contact_id}</p>
                          )}
                          <p className="text-xs text-muted-foreground italic">
                            La trascrizione completa sarà disponibile con l'integrazione webhook.
                          </p>
                        </div>
                      </TableCell>
                    </TableRow>
                  )}
                </Fragment>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
