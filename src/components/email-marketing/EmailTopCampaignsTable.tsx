import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { RigaMobile } from "@/components/mobile/FiltriMobile";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useState } from "react";
import { format } from "date-fns";
import { it } from "date-fns/locale";
import { Download } from "lucide-react";
import { escapeCsvCell } from "@/lib/csvExport";

interface CampaignRow {
  id: string;
  name: string;
  sent_at: string | null;
  delivered: number;
  opened: number;
  clicked: number;
  type: string;
}

interface EmailTopCampaignsTableProps {
  campaigns: CampaignRow[];
  /** Apre il drill-down per-destinatario della campagna. */
  onCampaignClick?: (id: string, name: string) => void;
}

const TYPE_LABELS: Record<string, string> = {
  broadcast: "Email",
  automation: "Flusso",
  bulk: "Azione in blocco",
};

export function EmailTopCampaignsTable({ campaigns, onCampaignClick }: EmailTopCampaignsTableProps) {
  const [showNumbers, setShowNumbers] = useState(false);
  const [sortBy, setSortBy] = useState("open_rate");

  const sorted = [...campaigns].sort((a, b) => {
    if (sortBy === "open_rate") {
      const rA = a.delivered > 0 ? a.opened / a.delivered : 0;
      const rB = b.delivered > 0 ? b.opened / b.delivered : 0;
      return rB - rA;
    }
    if (sortBy === "click_rate") {
      const rA = a.delivered > 0 ? a.clicked / a.delivered : 0;
      const rB = b.delivered > 0 ? b.clicked / b.delivered : 0;
      return rB - rA;
    }
    return b.delivered - a.delivered;
  });

  const rate = (num: number, den: number) => den > 0 ? ((num / den) * 100).toFixed(1) + "%" : "0%";
  const fmt = (num: number, den: number) => showNumbers ? num.toLocaleString("it-IT") : rate(num, den);

  const exportCsv = () => {
    const header = ["Titolo", "Data", "Consegnate", "Aperte", "Cliccate", "Tasso apertura", "Tasso clic", "Tipo"];
    const rows = sorted.map((c) => [
      c.name,
      c.sent_at ? format(new Date(c.sent_at), "yyyy-MM-dd") : "",
      c.delivered, c.opened, c.clicked,
      rate(c.opened, c.delivered), rate(c.clicked, c.delivered),
      TYPE_LABELS[c.type] || c.type,
    ].map((v) => escapeCsvCell(v as string | number, ",")).join(","));
    const blob = new Blob(["﻿" + [header.join(","), ...rows].join("\n")], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `campagne-email-${new Date().toLocaleDateString("en-CA")}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    // Telefono: una riga per campagna (data e tipo, apertura e clic), senza
    // interruttore, CSV e ordinamento.
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-2 max-md:p-3 max-md:pb-1">
        <CardTitle className="text-base max-md:text-sm">Email con le migliori prestazioni</CardTitle>
        <div className="flex items-center gap-4 max-md:hidden">
          <div className="flex items-center gap-2 text-sm">
            <span className="text-muted-foreground">Valori assoluti</span>
            <Switch checked={showNumbers} onCheckedChange={setShowNumbers} />
          </div>
          <Button variant="ghost" size="sm" className="gap-1.5" onClick={exportCsv} disabled={sorted.length === 0}>
            <Download className="h-3.5 w-3.5" /> CSV
          </Button>
          <Select value={sortBy} onValueChange={setSortBy}>
            <SelectTrigger className="w-[160px] h-8 text-sm"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="open_rate">Tasso apertura</SelectItem>
              <SelectItem value="click_rate">Tasso clic</SelectItem>
              <SelectItem value="delivered">Consegnate</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </CardHeader>
      <CardContent className="max-md:p-0">
        {sorted.length === 0 ? (
          <div className="flex items-center justify-center h-32 text-muted-foreground text-sm max-md:h-auto max-md:px-3 max-md:pb-3 max-md:text-[13px]">
            Nessuna campagna inviata ancora.
          </div>
        ) : (
          <>
          <div className="divide-y border-t md:hidden">
            {sorted.slice(0, 10).map((c) => (
              <RigaMobile
                key={c.id}
                onClick={onCampaignClick ? () => onCampaignClick(c.id, c.name) : undefined}
                titolo={c.name}
                sottotitolo={`${c.sent_at ? format(new Date(c.sent_at), "dd MMM yyyy", { locale: it }) : "—"} · ${TYPE_LABELS[c.type] || c.type} · ${c.delivered.toLocaleString("it-IT")} consegnate`}
                valore={`${rate(c.opened, c.delivered)} aperte`}
                stato={<span className="text-muted-foreground">{rate(c.clicked, c.delivered)} clic</span>}
              />
            ))}
          </div>
          {/* Intestazioni corte e su una riga, «Tipo» solo da 1280: a 1024 i titoli
              andavano a capo in tre o quattro righe e il bollino usciva dalla card. */}
          <Table className="max-md:hidden [&_td]:py-3">
            <TableHeader>
              <TableRow className="[&_th]:whitespace-nowrap">
                <TableHead>Titolo</TableHead>
                <TableHead>Inviata il</TableHead>
                <TableHead className="text-right">Consegnate</TableHead>
                <TableHead className="text-right">Aperture</TableHead>
                <TableHead className="text-right">Clic</TableHead>
                <TableHead className="hidden xl:table-cell">Tipo</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sorted.slice(0, 10).map((c) => (
                <TableRow
                  key={c.id}
                  className={onCampaignClick ? "cursor-pointer" : undefined}
                  onClick={onCampaignClick ? () => onCampaignClick(c.id, c.name) : undefined}
                >
                  <TableCell className="font-medium">{c.name}</TableCell>
                  <TableCell className="whitespace-nowrap text-muted-foreground">
                    {c.sent_at ? format(new Date(c.sent_at), "dd MMM yyyy", { locale: it }) : "—"}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{c.delivered.toLocaleString("it-IT")}</TableCell>
                  <TableCell className="text-right tabular-nums">{fmt(c.opened, c.delivered)}</TableCell>
                  <TableCell className="text-right tabular-nums">{fmt(c.clicked, c.delivered)}</TableCell>
                  <TableCell className="hidden xl:table-cell">
                    <Badge variant="outline">{TYPE_LABELS[c.type] || c.type}</Badge>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          </>
        )}
      </CardContent>
    </Card>
  );
}
