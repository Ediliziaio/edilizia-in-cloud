/**
 * @file SmsHistory.tsx
 * @description Tabella storico messaggi SMS con filtri stato/direzione/data e paginazione.
 * @author Claude Code — AEDIX S.r.l.
 * @date 2026-04-07
 */

import { useState } from "react";
import { RigaMobile } from "@/components/mobile/FiltriMobile";
import { format } from "date-fns";
import { it } from "date-fns/locale";
import { Search, ChevronLeft, ChevronRight, MessageSquare } from "lucide-react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useSmsMessages } from "@/hooks/useSmsMessages";
import { SmsStatusBadge } from "@/components/sms/SmsStatusBadge";
import { SmsDirectionIcon } from "@/components/sms/SmsDirectionIcon";
import { SmsTriggerBadge } from "@/components/sms/SmsTriggerBadge";
import { SmsSkeletonLoader } from "@/components/sms/SmsSkeletonLoader";
import type { SmsDirection, SmsStatus } from "@/types/sms";

export function SmsHistory() {
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState<SmsStatus | "tutti">("tutti");
  const [filterDirection, setFilterDirection] = useState<SmsDirection | "tutti">("tutti");

  const { messages, totalCount, isLoading, hasNextPage } = useSmsMessages({
    filtri: {
      search: search || undefined,
      status: filterStatus !== "tutti" ? filterStatus : undefined,
      direction: filterDirection !== "tutti" ? filterDirection : undefined,
    },
    page,
  });

  const totalPages = Math.ceil(totalCount / 30);

  const handleSearch = (val: string) => {
    setSearch(val);
    setPage(1);
  };

  return (
    // Telefono: niente titolo (lo dice la scheda), ricerca a tutta larghezza,
    // i due filtri affiancati e una riga per messaggio.
    <Card>
      <CardHeader className="max-md:p-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 max-md:gap-2">
          {/* Filtri — anche da tablet senza titolo: «Storico Messaggi» ripeteva la
              scheda e a 1024 andava a capo in due righe. Il totale resta, a destra. */}
          <div className="flex flex-wrap gap-2">
            <div className="relative max-md:basis-full">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Cerca numero o testo…"
                className="pl-8 w-48 h-9 text-sm max-md:w-full"
                value={search}
                onChange={(e) => handleSearch(e.target.value)}
              />
            </div>

            <Select
              value={filterDirection}
              onValueChange={(v) => { setFilterDirection(v as SmsDirection | "tutti"); setPage(1); }}
            >
              <SelectTrigger className="h-9 w-32 text-sm max-md:w-auto max-md:min-w-0 max-md:flex-1">
                <SelectValue placeholder="Direzione" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="tutti">Tutti</SelectItem>
                <SelectItem value="outbound">Uscita</SelectItem>
                <SelectItem value="inbound">Entrata</SelectItem>
              </SelectContent>
            </Select>

            <Select
              value={filterStatus}
              onValueChange={(v) => { setFilterStatus(v as SmsStatus | "tutti"); setPage(1); }}
            >
              <SelectTrigger className="h-9 w-36 text-sm max-md:w-auto max-md:min-w-0 max-md:flex-1">
                <SelectValue placeholder="Stato" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="tutti">Tutti gli stati</SelectItem>
                <SelectItem value="queued">In coda</SelectItem>
                <SelectItem value="sending">In invio</SelectItem>
                <SelectItem value="sent">Inviato</SelectItem>
                <SelectItem value="delivered">Consegnato</SelectItem>
                <SelectItem value="failed">Fallito</SelectItem>
                <SelectItem value="received">Ricevuto</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {totalCount > 0 && (
            <span className="text-sm text-muted-foreground max-md:hidden">
              {new Intl.NumberFormat("it-IT").format(totalCount)} messaggi
            </span>
          )}
        </div>
      </CardHeader>

      <CardContent className="p-0">
        {isLoading ? (
          <div className="p-4">
            <SmsSkeletonLoader rows={8} variant="table" />
          </div>
        ) : messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-muted-foreground gap-2 max-md:py-6">
            <MessageSquare className="h-10 w-10 opacity-30 max-md:hidden" />
            <p className="text-sm">Nessun messaggio trovato</p>
          </div>
        ) : (
          <>
            {/* Table header */}
            <div className="hidden md:grid grid-cols-[32px_140px_1fr_100px_100px_130px] gap-3 px-4 py-2 border-b text-xs font-medium text-muted-foreground uppercase tracking-wide">
              <span />
              <span>Numero</span>
              <span>Messaggio</span>
              <span>Stato</span>
              <span>Trigger</span>
              <span>Data</span>
            </div>

            {/* Rows — telefono: numero, testo, data e stato su una riga */}
            <div className="divide-y md:hidden">
              {messages.map((msg) => (
                <RigaMobile
                  key={msg.id}
                  sinistra={<SmsDirectionIcon direction={msg.direction} />}
                  titolo={<span className="font-mono">{msg.direction === "outbound" ? msg.to_number : msg.from_number}</span>}
                  sottotitolo={msg.body}
                  valore={<span className="text-[11px] font-normal text-muted-foreground">{format(new Date(msg.created_at), "dd/MM HH:mm", { locale: it })}</span>}
                  stato={<SmsStatusBadge status={msg.status} />}
                />
              ))}
            </div>
            <div className="divide-y max-md:hidden">
              {messages.map((msg) => (
                <div
                  key={msg.id}
                  className="grid grid-cols-1 md:grid-cols-[32px_140px_1fr_100px_100px_130px] gap-3 px-4 py-3 items-center hover:bg-muted/40 transition-colors"
                >
                  {/* Direzione */}
                  <SmsDirectionIcon direction={msg.direction} />

                  {/* Numero */}
                  <span className="text-sm font-mono truncate">
                    {msg.direction === "outbound" ? msg.to_number : msg.from_number}
                  </span>

                  {/* Body */}
                  <span className="text-sm text-muted-foreground truncate" title={msg.body}>
                    {msg.body}
                  </span>

                  {/* Status */}
                  <SmsStatusBadge status={msg.status} />

                  {/* Trigger */}
                  <SmsTriggerBadge triggerType={msg.trigger_type} />

                  {/* Data */}
                  <span className="text-xs text-muted-foreground">
                    {format(new Date(msg.created_at), "dd/MM/yyyy HH:mm", { locale: it })}
                  </span>
                </div>
              ))}
            </div>

            {/* Paginazione */}
            {totalPages > 1 && (
              <div className="flex items-center justify-between px-4 py-3 border-t text-sm text-muted-foreground">
                <span>
                  Pagina {page} di {totalPages}
                </span>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                    disabled={page === 1}
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setPage((p) => p + 1)}
                    disabled={!hasNextPage}
                  >
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
