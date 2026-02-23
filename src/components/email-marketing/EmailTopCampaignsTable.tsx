import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useState } from "react";
import { format } from "date-fns";
import { it } from "date-fns/locale";

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
}

const TYPE_LABELS: Record<string, string> = {
  broadcast: "Email",
  automation: "Flusso",
  bulk: "Azione in blocco",
};

export function EmailTopCampaignsTable({ campaigns }: EmailTopCampaignsTableProps) {
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

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-base">Email con le migliori prestazioni</CardTitle>
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2 text-sm">
            <span className="text-muted-foreground">Mostra in numeri</span>
            <Switch checked={showNumbers} onCheckedChange={setShowNumbers} />
          </div>
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
      <CardContent>
        {sorted.length === 0 ? (
          <div className="flex items-center justify-center h-32 text-muted-foreground text-sm">
            Nessuna campagna inviata ancora.
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Titolo</TableHead>
                <TableHead>Data di esecuzione</TableHead>
                <TableHead className="text-right">Consegnato</TableHead>
                <TableHead className="text-right">Tasso apertura</TableHead>
                <TableHead className="text-right">Tasso clic</TableHead>
                <TableHead>Tipo</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sorted.slice(0, 10).map((c) => (
                <TableRow key={c.id}>
                  <TableCell className="font-medium">{c.name}</TableCell>
                  <TableCell className="text-muted-foreground">
                    {c.sent_at ? format(new Date(c.sent_at), "dd MMM yyyy", { locale: it }) : "—"}
                  </TableCell>
                  <TableCell className="text-right">{c.delivered.toLocaleString("it-IT")}</TableCell>
                  <TableCell className="text-right">{fmt(c.opened, c.delivered)}</TableCell>
                  <TableCell className="text-right">{fmt(c.clicked, c.delivered)}</TableCell>
                  <TableCell>
                    <Badge variant="outline">{TYPE_LABELS[c.type] || c.type}</Badge>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}
