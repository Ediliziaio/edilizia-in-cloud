import { useState, useMemo } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { CalendarIcon, TrendingUp, Users, Target, DollarSign } from "lucide-react";
import { format, subDays, startOfMonth, endOfMonth } from "date-fns";
import { it } from "date-fns/locale";

interface DateRange {
  from: Date;
  to: Date;
}

interface AttributionRow {
  campaign_name: string;
  source_campaign_id: string | null;
  leads: number;
  contacts_created: number;
  opportunities_open: number;
  opportunities_won: number;
  value_won: number;
  spend: number;
  roas: number;
}

const DATE_PRESETS = [
  { label: "7gg", days: 7 },
  { label: "30gg", days: 30 },
  { label: "90gg", days: 90 },
];

export default function AttributionReport() {
  const { effectiveCompany } = useAuth();
  const companyId = (effectiveCompany as any)?.id;
  const [dateRange, setDateRange] = useState<DateRange>({
    from: subDays(new Date(), 30),
    to: new Date(),
  });

  // Get contacts from Facebook source with campaign info
  const { data: contactData, isLoading: loadingContacts } = useQuery({
    queryKey: ["attribution-contacts", companyId, dateRange.from, dateRange.to],
    queryFn: async () => {
      if (!companyId) return [];
      const { data } = await supabase
        .from("marketing_contacts")
        .select("id, source, source_campaign_id, created_at")
        .eq("company_id", companyId)
        .gte("created_at", dateRange.from.toISOString())
        .lte("created_at", dateRange.to.toISOString())
        .ilike("source", "%meta%");
      return data || [];
    },
    enabled: !!companyId,
  });

  // Get opportunities linked to those contacts
  const contactIds = useMemo(() => (contactData || []).map((c) => c.id), [contactData]);

  const { data: oppData, isLoading: loadingOpps } = useQuery({
    queryKey: ["attribution-opportunities", companyId, contactIds],
    queryFn: async () => {
      if (!companyId || contactIds.length === 0) return [];
      const { data } = await supabase
        .from("marketing_opportunities")
        .select("id, contact_id, status, value, source")
        .eq("company_id", companyId)
        .in("contact_id", contactIds);
      return data || [];
    },
    enabled: !!companyId && contactIds.length > 0,
  });

  // Get campaign spend from campaign_costs
  const { data: spendData, isLoading: loadingSpend } = useQuery({
    queryKey: ["attribution-spend", companyId, dateRange.from, dateRange.to],
    queryFn: async () => {
      if (!companyId) return [];
      const { data } = await supabase
        .from("campaign_costs")
        .select("campaign_name, spend_amount, source")
        .eq("company_id", companyId)
        .gte("date", format(dateRange.from, "yyyy-MM-dd"))
        .lte("date", format(dateRange.to, "yyyy-MM-dd"))
        .ilike("source", "%facebook%");
      return data || [];
    },
    enabled: !!companyId,
  });

  // Get lead counts from webhook events (as proxy for raw Meta leads)
  const { data: webhookLeads, isLoading: loadingWebhook } = useQuery({
    queryKey: ["attribution-webhook-leads", companyId, dateRange.from, dateRange.to],
    queryFn: async () => {
      if (!companyId) return [];
      const { data } = await supabase
        .from("integration_webhook_events")
        .select("id, payload, received_at")
        .eq("company_id", companyId)
        .eq("provider", "meta")
        .eq("event_type", "leadgen")
        .gte("received_at", dateRange.from.toISOString())
        .lte("received_at", dateRange.to.toISOString());
      return data || [];
    },
    enabled: !!companyId,
  });

  const isLoading = loadingContacts || loadingOpps || loadingSpend || loadingWebhook;

  // Aggregate by campaign
  const rows: AttributionRow[] = useMemo(() => {
    const campaignMap = new Map<string, AttributionRow>();

    // Group contacts by campaign
    for (const c of contactData || []) {
      const campName = c.source_campaign_id || "Sconosciuta";
      if (!campaignMap.has(campName)) {
        campaignMap.set(campName, {
          campaign_name: campName,
          source_campaign_id: c.source_campaign_id,
          leads: 0,
          contacts_created: 0,
          opportunities_open: 0,
          opportunities_won: 0,
          value_won: 0,
          spend: 0,
          roas: 0,
        });
      }
      campaignMap.get(campName)!.contacts_created++;
    }

    // Count leads from webhooks per campaign (using payload.campaign_name if available)
    for (const wh of webhookLeads || []) {
      const campName = (wh.payload as any)?.campaign_name || "Sconosciuta";
      if (!campaignMap.has(campName)) {
        campaignMap.set(campName, {
          campaign_name: campName,
          source_campaign_id: null,
          leads: 0,
          contacts_created: 0,
          opportunities_open: 0,
          opportunities_won: 0,
          value_won: 0,
          spend: 0,
          roas: 0,
        });
      }
      campaignMap.get(campName)!.leads++;
    }

    // Add opportunity data
    for (const opp of oppData || []) {
      const contact = (contactData || []).find((c) => c.id === opp.contact_id);
      const campName = contact?.source_campaign_id || "Sconosciuta";
      const row = campaignMap.get(campName);
      if (!row) continue;
      if (opp.status === "open") row.opportunities_open++;
      if (opp.status === "won") {
        row.opportunities_won++;
        row.value_won += opp.value || 0;
      }
    }

    // Add spend data
    for (const s of spendData || []) {
      const campName = s.campaign_name || "Sconosciuta";
      const row = campaignMap.get(campName);
      if (row) {
        row.spend += s.spend_amount || 0;
      }
    }

    // Calculate ROAS
    for (const row of campaignMap.values()) {
      row.roas = row.spend > 0 ? row.value_won / row.spend : 0;
    }

    return Array.from(campaignMap.values()).sort((a, b) => b.value_won - a.value_won);
  }, [contactData, oppData, spendData, webhookLeads]);

  // Totals
  const totals = useMemo(() => {
    return rows.reduce(
      (acc, r) => ({
        leads: acc.leads + r.leads,
        contacts: acc.contacts + r.contacts_created,
        opps_won: acc.opps_won + r.opportunities_won,
        value: acc.value + r.value_won,
        spend: acc.spend + r.spend,
      }),
      { leads: 0, contacts: 0, opps_won: 0, value: 0, spend: 0 }
    );
  }, [rows]);

  const formatCurrency = (v: number) =>
    new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR" }).format(v);

  return (
    <div className="space-y-6">
      {/* Date controls */}
      <div className="flex flex-wrap items-center gap-2">
        {DATE_PRESETS.map((p) => (
          <Button
            key={p.days}
            variant="outline"
            size="sm"
            onClick={() => setDateRange({ from: subDays(new Date(), p.days), to: new Date() })}
          >
            {p.label}
          </Button>
        ))}
        <Popover>
          <PopoverTrigger asChild>
            <Button variant="outline" size="sm" className="gap-1.5">
              <CalendarIcon className="h-3.5 w-3.5" />
              {format(dateRange.from, "dd/MM", { locale: it })} – {format(dateRange.to, "dd/MM", { locale: it })}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-0" align="start">
            <Calendar
              mode="range"
              selected={{ from: dateRange.from, to: dateRange.to }}
              onSelect={(range) => {
                if (range?.from && range?.to) setDateRange({ from: range.from, to: range.to });
              }}
              locale={it}
              numberOfMonths={2}
            />
          </PopoverContent>
        </Popover>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-1.5">
              <Users className="h-4 w-4" /> Lead ricevuti
            </CardTitle>
          </CardHeader>
          <CardContent><p className="text-2xl font-bold">{totals.leads}</p></CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-1.5">
              <Target className="h-4 w-4" /> Contratti vinti
            </CardTitle>
          </CardHeader>
          <CardContent><p className="text-2xl font-bold">{totals.opps_won}</p></CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-1.5">
              <DollarSign className="h-4 w-4" /> Valore vinto
            </CardTitle>
          </CardHeader>
          <CardContent><p className="text-2xl font-bold">{formatCurrency(totals.value)}</p></CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-1.5">
              <TrendingUp className="h-4 w-4" /> ROAS globale
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">
              {totals.spend > 0 ? (totals.value / totals.spend).toFixed(2) + "x" : "N/D"}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Attribution table */}
      <Card>
        <CardHeader>
          <CardTitle>Attribuzione per campagna Facebook</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-2">
              {[1, 2, 3].map((i) => <Skeleton key={i} className="h-10 w-full" />)}
            </div>
          ) : rows.length === 0 ? (
            <p className="text-sm text-muted-foreground py-8 text-center">
              Nessun dato di attribuzione per il periodo selezionato. Assicurati di avere lead Facebook e dati di spesa configurati.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Campagna</TableHead>
                  <TableHead className="text-right">Lead</TableHead>
                  <TableHead className="text-right">Contatti CRM</TableHead>
                  <TableHead className="text-right">Opp. aperte</TableHead>
                  <TableHead className="text-right">Opp. vinte</TableHead>
                  <TableHead className="text-right">Valore vinto</TableHead>
                  <TableHead className="text-right">Spesa</TableHead>
                  <TableHead className="text-right">ROAS</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((r, i) => (
                  <TableRow key={i}>
                    <TableCell className="font-medium max-w-[200px] truncate" title={r.campaign_name}>
                      {r.campaign_name}
                    </TableCell>
                    <TableCell className="text-right">{r.leads}</TableCell>
                    <TableCell className="text-right">{r.contacts_created}</TableCell>
                    <TableCell className="text-right">{r.opportunities_open}</TableCell>
                    <TableCell className="text-right">
                      {r.opportunities_won > 0 && (
                        <Badge variant="default" className="text-xs">{r.opportunities_won}</Badge>
                      )}
                      {r.opportunities_won === 0 && "0"}
                    </TableCell>
                    <TableCell className="text-right">{formatCurrency(r.value_won)}</TableCell>
                    <TableCell className="text-right">{formatCurrency(r.spend)}</TableCell>
                    <TableCell className="text-right font-semibold">
                      {r.spend > 0 ? r.roas.toFixed(2) + "x" : "N/D"}
                    </TableCell>
                  </TableRow>
                ))}
                {/* Totals row */}
                <TableRow className="bg-muted/50 font-semibold">
                  <TableCell>Totale</TableCell>
                  <TableCell className="text-right">{totals.leads}</TableCell>
                  <TableCell className="text-right">{totals.contacts}</TableCell>
                  <TableCell className="text-right">
                    {rows.reduce((s, r) => s + r.opportunities_open, 0)}
                  </TableCell>
                  <TableCell className="text-right">{totals.opps_won}</TableCell>
                  <TableCell className="text-right">{formatCurrency(totals.value)}</TableCell>
                  <TableCell className="text-right">{formatCurrency(totals.spend)}</TableCell>
                  <TableCell className="text-right">
                    {totals.spend > 0 ? (totals.value / totals.spend).toFixed(2) + "x" : "N/D"}
                  </TableCell>
                </TableRow>
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
