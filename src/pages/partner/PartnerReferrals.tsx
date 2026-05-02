import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Loader2, Search, Users } from "lucide-react";
import { formatCurrency } from "@/lib/formatters";
import { format } from "date-fns";
import { it } from "date-fns/locale";

type ReferralRow = {
  id: string;
  company_id: string | null;
  status: string;
  revenue: number | null;
  commission_amount: number | null;
  fraud_status: string | null;
  created_at: string;
  companies?: { name?: string | null; status?: string | null; subscription_plan_id?: string | null } | null;
};

const statusLabel: Record<string, string> = {
  click: "Click",
  registered: "Registrato",
  active: "Attivo",
  paying: "Pagante",
  approved: "Approvato",
  rejected: "Rifiutato",
  expired: "Scaduto",
};

function statusBadge(status: string, fraudStatus?: string | null) {
  if (fraudStatus === "blocked") return <Badge variant="destructive">Bloccato</Badge>;
  if (fraudStatus === "review") return <Badge className="bg-amber-100 text-amber-800">In verifica</Badge>;
  if (status === "paying" || status === "approved") return <Badge className="bg-emerald-100 text-emerald-800">{statusLabel[status] || status}</Badge>;
  if (status === "rejected" || status === "expired") return <Badge variant="secondary">{statusLabel[status] || status}</Badge>;
  return <Badge variant="outline">{statusLabel[status] || status}</Badge>;
}

export default function PartnerReferrals() {
  const { user } = useAuth();
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("all");

  const { data: referrer } = useQuery({
    queryKey: ["my-referrer-referrals", user?.id],
    enabled: !!user?.id,
    queryFn: async () => {
      const { data } = await supabase
        .from("referrers")
        .select("id")
        .eq("user_id", user!.id)
        .maybeSingle();
      return data;
    },
  });

  const { data: referrals = [], isLoading } = useQuery({
    queryKey: ["partner-referral-conversions", referrer?.id],
    enabled: !!referrer?.id,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("referral_conversions")
        .select("id, company_id, status, revenue, commission_amount, fraud_status, created_at, companies(name,status,subscription_plan_id)")
        .eq("referrer_id", referrer!.id)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data || []) as ReferralRow[];
    },
  });

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return referrals.filter((row) => {
      const name = row.companies?.name?.toLowerCase() || "";
      const matchesSearch = !q || name.includes(q) || row.company_id?.toLowerCase().includes(q);
      const matchesStatus = status === "all" || row.status === status;
      return matchesSearch && matchesStatus;
    });
  }, [referrals, search, status]);

  const totals = useMemo(() => {
    const paying = referrals.filter((r) => r.status === "paying" || r.status === "approved").length;
    const pending = referrals.filter((r) => r.status === "registered" || r.status === "active").length;
    const revenue = referrals.reduce((sum, r) => sum + Number(r.revenue || 0), 0);
    return { paying, pending, revenue };
  }, [referrals]);

  return (
    <div className="space-y-6 p-6 max-w-6xl mx-auto">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Referenze</h1>
        <p className="text-sm text-muted-foreground">Monitora registrazioni, stati e valore generato dai tuoi referral.</p>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">Referenze totali</CardTitle></CardHeader>
          <CardContent><p className="text-2xl font-bold">{referrals.length}</p></CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">Paganti</CardTitle></CardHeader>
          <CardContent><p className="text-2xl font-bold text-emerald-600">{totals.paying}</p></CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">Revenue tracciata</CardTitle></CardHeader>
          <CardContent><p className="text-2xl font-bold">{formatCurrency(totals.revenue)}</p></CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="space-y-4">
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <CardTitle className="text-base">Lista referral</CardTitle>
            <div className="flex gap-2">
              <div className="relative">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input className="pl-8 w-72" placeholder="Cerca azienda o ID..." value={search} onChange={(e) => setSearch(e.target.value)} />
              </div>
              <Select value={status} onValueChange={setStatus}>
                <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Tutti gli stati</SelectItem>
                  <SelectItem value="registered">Registrati</SelectItem>
                  <SelectItem value="active">Attivi</SelectItem>
                  <SelectItem value="paying">Paganti</SelectItem>
                  <SelectItem value="approved">Approvati</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin" /></div>
          ) : filtered.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <Users className="h-10 w-10 mx-auto mb-3 opacity-40" />
              <p>Nessuna referenza trovata</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Azienda</TableHead>
                  <TableHead>Stato</TableHead>
                  <TableHead>Data</TableHead>
                  <TableHead className="text-right">Valore</TableHead>
                  <TableHead className="text-right">Commissione</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((row) => (
                  <TableRow key={row.id}>
                    <TableCell className="font-medium">{row.companies?.name || row.company_id || "Azienda non disponibile"}</TableCell>
                    <TableCell>{statusBadge(row.status, row.fraud_status)}</TableCell>
                    <TableCell>{format(new Date(row.created_at), "dd MMM yyyy", { locale: it })}</TableCell>
                    <TableCell className="text-right">{formatCurrency(Number(row.revenue || 0))}</TableCell>
                    <TableCell className="text-right font-semibold">{formatCurrency(Number(row.commission_amount || 0))}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
