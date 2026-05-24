import { useEffect, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { CreditCard, Eye, EyeOff, Pencil, Check, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { formatDistanceToNow } from "date-fns";
import { it } from "date-fns/locale";
import { formatTreasuryCurrency, toFiniteAmount } from "@/lib/treasury";

const formatEur = (val: unknown) => formatTreasuryCurrency(val);

function maskIban(iban: string | null) {
  if (!iban || iban.length < 8) return iban || "—";
  return iban.slice(0, 4) + " •••• •••• •••• •••• " + iban.slice(-4);
}

const accountTypes: Record<string, string> = {
  checking: "Conto Corrente",
  savings: "Risparmio",
  credit: "Credito",
  business: "Business",
};

interface Props {
  companyId: string;
  refreshKey?: number;
}

export default function BankAccountsList({ companyId, refreshKey = 0 }: Props) {
  const [accounts, setAccounts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [showAllIban, setShowAllIban] = useState(false);
  const [shownIbans, setShownIbans] = useState<Set<string>>(new Set());
  const [editingName, setEditingName] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");
  const [savingNameId, setSavingNameId] = useState<string | null>(null);

  useEffect(() => {
    if (companyId) void loadAccounts();
    else {
      setAccounts([]);
      setLoading(false);
    }
  }, [companyId, refreshKey]);

  async function loadAccounts() {
    setLoading(true);
    setLoadError(null);
    try {
      const { data, error } = await supabase
        .from("bank_accounts")
        .select("*, bank_connections(institution_name, institution_logo)")
        .eq("company_id", companyId)
        .eq("is_active", true)
        .order("created_at");
      if (error) throw error;
      setAccounts(data || []);
    } catch (e: any) {
      setLoadError(e.message || "Impossibile caricare i conti");
      toast.error("Errore caricamento conti bancari");
    } finally {
      setLoading(false);
    }
  }

  async function saveName(accountId: string) {
    const displayName = editValue.trim();
    if (!displayName) {
      toast.error("Il nome del conto non può essere vuoto");
      return;
    }

    setSavingNameId(accountId);
    try {
      const { error } = await supabase
        .from("bank_accounts")
        .update({ display_name: displayName })
        .eq("id", accountId)
        .eq("company_id", companyId);
      if (error) throw error;
      toast.success("Nome aggiornato");
      setAccounts((prev) =>
        prev.map((a) => (a.id === accountId ? { ...a, display_name: displayName } : a))
      );
      setEditingName(null);
    } catch (e: any) {
      toast.error(e.message || "Aggiornamento non riuscito");
    } finally {
      setSavingNameId(null);
    }
  }

  const totalBalance = accounts.reduce((sum, a) => sum + toFiniteAmount(a.current_balance), 0);
  const bankCount = new Set(accounts.map((a) => a.connection_id)).size;

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-16 w-full" />
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3].map((i) => <Skeleton key={i} className="h-48" />)}
        </div>
      </div>
    );
  }

  if (loadError) {
    return (
      <Card className="border-destructive/30">
        <CardContent className="flex flex-col gap-3 py-6 text-center sm:flex-row sm:items-center sm:justify-between sm:text-left">
          <p className="text-sm text-destructive">{loadError}</p>
          <Button variant="outline" size="sm" onClick={() => loadAccounts()}>Riprova</Button>
        </CardContent>
      </Card>
    );
  }

  if (accounts.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-4 text-center">
        <CreditCard className="h-16 w-16 text-muted-foreground" />
        <h2 className="text-xl font-semibold">Nessun conto collegato</h2>
        <p className="text-muted-foreground">Vai al tab Connessioni per collegare la tua prima banca.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <p className="text-3xl font-bold">{formatEur(totalBalance)}</p>
          <p className="text-sm text-muted-foreground">
            {accounts.length} conti su {bankCount} banche
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Switch checked={showAllIban} onCheckedChange={setShowAllIban} id="show-iban" />
          <Label htmlFor="show-iban" className="text-sm">Mostra IBAN</Label>
        </div>
      </div>

      {/* Cards Grid */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {accounts.map((account) => {
          const isIbanVisible = showAllIban || shownIbans.has(account.id);
          const conn = account.bank_connections;

          return (
            <Card key={account.id}>
              <CardContent className="pt-6 space-y-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    {conn?.institution_logo ? (
                      <img src={conn.institution_logo} alt="" className="h-6 w-6 rounded" loading="lazy" />
                    ) : (
                      <CreditCard className="h-5 w-5 text-muted-foreground" />
                    )}
                    <span className="text-xs text-muted-foreground">{conn?.institution_name || "Banca"}</span>
                  </div>
                  <Badge variant="outline" className="text-xs">
                    {accountTypes[account.account_type] || account.account_type}
                  </Badge>
                </div>

                {/* Name */}
                <div className="flex items-center gap-2">
                  {editingName === account.id ? (
                    <>
                      <Input
                        value={editValue}
                        onChange={(e) => setEditValue(e.target.value)}
                        className="h-7 text-sm"
                        autoFocus
                      />
                      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => saveName(account.id)}>
                        {savingNameId === account.id ? (
                          <span className="h-3 w-3 rounded-full border-2 border-current border-t-transparent animate-spin" />
                        ) : (
                          <Check className="h-3 w-3" />
                        )}
                      </Button>
                      <Button variant="ghost" size="icon" className="h-7 w-7" disabled={savingNameId === account.id} onClick={() => setEditingName(null)}>
                        <X className="h-3 w-3" />
                      </Button>
                    </>
                  ) : (
                    <>
                      <p className="font-medium text-sm">
                        {account.display_name || account.account_name || "Conto"}
                      </p>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6"
                        onClick={() => {
                          setEditingName(account.id);
                          setEditValue(account.display_name || account.account_name || "");
                        }}
                      >
                        <Pencil className="h-3 w-3" />
                      </Button>
                    </>
                  )}
                </div>

                {/* IBAN */}
                <div className="flex items-center gap-2">
                  <code className="text-xs text-muted-foreground font-mono">
                    {isIbanVisible ? account.iban : maskIban(account.iban)}
                  </code>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-5 w-5"
                    onClick={() => {
                      setShownIbans((prev) => {
                        const next = new Set(prev);
                        if (next.has(account.id)) next.delete(account.id); else next.add(account.id);
                        return next;
                      });
                    }}
                  >
                    {isIbanVisible ? <EyeOff className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
                  </Button>
                </div>

                {/* Balances */}
                <div>
                  <p className="text-2xl font-bold">
                    {formatEur(account.available_balance ?? account.current_balance)}
                  </p>
                  {account.available_balance != null && account.current_balance != null && account.available_balance !== account.current_balance && (
                    <p className="text-xs text-muted-foreground">
                      Saldo corrente: {formatEur(account.current_balance)}
                    </p>
                  )}
                </div>

                {account.balance_updated_at && (
                  <p className="text-xs text-muted-foreground">
                    Aggiornato: {formatDistanceToNow(new Date(account.balance_updated_at), { addSuffix: true, locale: it })}
                  </p>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
