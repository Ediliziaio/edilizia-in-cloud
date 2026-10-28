/**
 * BankConnectionsCard — Salt Edge AIS beta per l'azienda.
 * Collega un conto corrente (consenso PSD2) e importa i movimenti per la
 * riconciliazione. Le chiavi sono esclusivamente nella funzione `bank-saltedge`.
 *
 * Il ritorno porta connection_id e uno stato monouso verificato dal server.
 *
 * In Integrazioni sta nel popup della scheda «Conti bancari» (`senzaCornice`):
 * al ritorno dalla banca la pagina riapre il popup, così questo componente
 * c'è e completa il collegamento. In Tesoreria resta una Card.
 */
import { useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useSaltEdgeReturn } from "@/hooks/useSaltEdgeReturn";
import { supabase } from "@/integrations/supabase/client";
import { useEffectiveCompanyId } from "@/hooks/useEffectiveCompanyId";
import { usePermissions } from "@/hooks/usePermissions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { formatTreasuryCurrency } from "@/lib/treasury";
import { toast } from "sonner";
import { Checkbox } from "@/components/ui/checkbox";
import { invokeSaltEdge, validSaltWidgetUrl, BANKING_QUERY_KEYS } from "@/lib/banking/saltedge";
import { invokeDistyra, validDistyraUrl, distyraAbilitato } from "@/lib/banking/distyra";
import { Landmark, Plus, RefreshCw, Loader2, CheckCircle2, Unlink, AlertTriangle } from "lucide-react";

interface BankConnection {
  id: string;
  institution_name: string | null;
  status: string | null;
  accounts_count: number | null;
  last_sync_at: string | null;
  expires_at: string | null;
  error_message: string | null;
  provider_slug?: string;
  created_at?: string;
}
interface BankAccount {
  id: string;
  connection_id: string | null;
  account_name: string | null;
  iban: string | null;
  currency: string | null;
  current_balance: number | null;
}

const STATUS_LABEL: Record<string, { label: string; cls: string }> = {
  created: { label: "In attesa di consenso", cls: "bg-amber-100 text-amber-700" },
  linked: { label: "Collegato", cls: "bg-emerald-100 text-emerald-700" },
  expired: { label: "Scaduto — ricollega", cls: "bg-rose-100 text-rose-700" },
  error: { label: "Da verificare", cls: "bg-rose-100 text-rose-700" },
  disconnected: { label: "Disconnesso", cls: "bg-muted text-muted-foreground" },
};

interface BankConnectionsCardProps {
  /** Destinazione dopo il consenso, limitata sul server alle due pagine bancarie. */
  redirectPath?: string;
  /** Chiamato dopo un collegamento/sync riuscito, per far aggiornare la pagina che ospita la card. */
  onChanged?: () => void;
  /** Senza Card attorno: per stare in un popup (Integrazioni). */
  senzaCornice?: boolean;
  /** Tesoreria finalizza il ritorno anche quando la scheda non e' montata. */
  handleReturn?: boolean;
}

/** Giorni al termine del consenso comunicato dal provider. */
export function giorniAllaScadenza(c: { expires_at: string | null }): number {
  if (!c.expires_at) return Infinity;
  return Math.ceil((new Date(c.expires_at).getTime() - Date.now()) / 864e5);
}

/** Va ricollegato: consenso scaduto, errore, o scadenza entro 7 giorni (lo stesso caso del pulsante «Ricollega»). */
export function contoDaRicollegare(c: BankConnection): boolean {
  return c.status === "expired" || c.status === "error" || giorniAllaScadenza(c) <= 7;
}

export type { BankConnection };

/** Le banche collegate dall'azienda: stessa chiave per la card e per la pagina Integrazioni. */
export function useConnessioniBanca(abilitato = true) {
  const companyId = useEffectiveCompanyId();
  return useQuery({
    queryKey: ["bank-connections", companyId],
    enabled: abilitato && !!companyId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("bank_connections")
        .select("id, institution_name, status, accounts_count, last_sync_at, expires_at, error_message, provider_slug, created_at")
        .eq("company_id", companyId!)
        .eq("provider_slug", "saltedge")
        .neq("status", "disconnected")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as BankConnection[];
    },
    refetchInterval: query => query.state.data?.some(c => c.provider_slug === "saltedge" && c.status === "created" && c.created_at && Date.now() - Date.parse(c.created_at) < 15 * 60000) ? 5000 : false,
  });
}

/**
 * Il nome di un conto da mostrare. Alcune banche danno come nome un codice
 * («domus-group-s-r-l-5980-bank-account-3»): quello no, meglio l'IBAN
 * accorciato (IT60 ···· 1234).
 */
function nomeConto(a: BankAccount): string {
  const nomeLeggibile = a.account_name && !/^[a-z0-9]+(?:-[a-z0-9]+)+$/.test(a.account_name) ? a.account_name : null;
  const iban = a.iban ? a.iban.replace(/\s+/g, "") : null;
  const ibanBreve = iban && iban.length > 8 ? `${iban.slice(0, 4)} ···· ${iban.slice(-4)}` : iban;
  return [nomeLeggibile, ibanBreve].filter(Boolean).join(" · ") || a.account_name || "Conto";
}

export default function BankConnectionsCard({
  redirectPath = "/azienda/impostazioni/integrazioni",
  onChanged,
  senzaCornice = false,
  handleReturn = true,
}: BankConnectionsCardProps = {}) {
  const companyId = useEffectiveCompanyId();
  const { canViewTesoreria, canEditSettingsIntegrations, isLoading: permsLoading } = usePermissions();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [syncingId, setSyncingId] = useState<string | null>(null);
  const [disconnectId, setDisconnectId] = useState<string | null>(null);
  const [disconnecting, setDisconnecting] = useState(false);
  const observedSync = useRef<string | null>(null);
  const [confirmAccounts, setConfirmAccounts] = useState(false);
  const [reconnectId, setReconnectId] = useState<string | null>(null);
  const [widgetAction, setWidgetAction] = useState("start-auth");
  const bankStatus = useQuery({
    queryKey: ["saltedge-status", companyId], enabled: !!companyId && canViewTesoreria,
    queryFn: () => invokeSaltEdge(companyId, { action: "status" }), retry: false,
  });
  const invalidateBanking = () => {
    BANKING_QUERY_KEYS.forEach(key => qc.invalidateQueries({ queryKey: [key] }));
    onChanged?.();
  };

  const { data: connections = [] } = useConnessioniBanca(canViewTesoreria);
  const syncVersion = connections.map(c => `${c.id}:${c.status}:${c.last_sync_at}`).join("|");
  useEffect(() => {
    if (observedSync.current !== null && observedSync.current !== syncVersion) {
      BANKING_QUERY_KEYS.filter(key => key !== "bank-connections").forEach(key => qc.invalidateQueries({ queryKey: [key] }));
      onChanged?.();
    }
    observedSync.current = syncVersion;
    // The version, not the callback identity, drives external callback updates.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [syncVersion, companyId]);

  const { data: accounts = [] } = useQuery({
    queryKey: ["bank-accounts", companyId],
    enabled: !!companyId && canViewTesoreria,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("bank_accounts")
        .select("id, connection_id, account_name, iban, currency, current_balance")
        .eq("company_id", companyId!)
        .eq("is_active", true);
      if (error) throw error;
      return (data ?? []) as BankAccount[];
    },
  });

  useSaltEdgeReturn(companyId, onChanged, handleReturn);

  const openConnect = (id: string | null = null, action = "reconnect") => {
    setOpen(true);
    setConfirmAccounts(false);
    setReconnectId(id);
    setWidgetAction(id ? action : "start-auth");
  };

  const startConnect = async () => {
    if (!confirmAccounts || !bankStatus.data?.ready || bankStatus.data?.connectReady === false) return;
    setConnecting(true);
    try {
      const data = await invokeSaltEdge(companyId, { action: widgetAction, connection_id: reconnectId, redirect_path: redirectPath, confirm_company_accounts: true });
      if (!validSaltWidgetUrl(data?.url)) throw new Error("Il servizio non ha restituito un indirizzo di collegamento valido.");
      window.location.href = data.url; // redirect al consenso banca
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Errore avvio collegamento");
      setConnecting(false);
    }
  };

  const syncNow = async (connectionId: string) => {
    setSyncingId(connectionId);
    const t = toast.loading("Sincronizzazione movimenti…");
    try {
      const data = await invokeSaltEdge(companyId, { action: "sync", connection_id: connectionId });
      if (data?.processing) toast.info("La banca sta preparando i dati. Riprova fra poco.", { id: t });
      else toast.success(`Sincronizzati ${data?.imported ?? 0} movimenti`, { id: t });
      invalidateBanking();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Errore sincronizzazione", { id: t });
    } finally {
      setSyncingId(null);
    }
  };

  const disconnectConnection = async () => {
    if (!disconnectId) return;
    setDisconnecting(true);
    try {
      await invokeSaltEdge(companyId, { action: "disconnect", connection_id: disconnectId });
      toast.success("Conto disconnesso");
      invalidateBanking();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Errore disconnessione");
    } finally {
      setDisconnecting(false);
      setDisconnectId(null);
    }
  };

  // Sicurezza: solo admin o utenti col permesso Tesoreria possono vedere/gestire
  // i conti bancari. La RLS + l'edge function bank-saltedge applicano lo stesso vincolo
  // lato server; qui nascondiamo la card a chi non è autorizzato.
  if (permsLoading) return null;
  if (!canViewTesoreria) return null;

  // Distyra: strada separata da Salt Edge, accesa solo nelle aziende di prova.
  // Il server crea il link ospitato; qui si controlla solo che l'indirizzo sia davvero suo.
  async function collegaConDistyra() {
    try {
      const data = await invokeDistyra(companyId, { action: "start-link" });
      if (!validDistyraUrl(data?.url)) throw new Error("Il servizio non ha restituito un indirizzo di collegamento valido.");
      window.location.href = data.url;
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Collegamento non avviato");
    }
  }

  const pulsanteCollega = (
    <div className="flex shrink-0 gap-2">
      <Button size="sm" onClick={() => openConnect()} disabled={!canEditSettingsIntegrations} className="shrink-0">
        <Plus className="h-4 w-4 mr-1" /> Collega conto
      </Button>
      {distyraAbilitato(companyId) && (
        <Button size="sm" variant="outline" onClick={() => void collegaConDistyra()} disabled={!canEditSettingsIntegrations} className="shrink-0">
          <Plus className="h-4 w-4 mr-1" /> Collega conto (prova)
        </Button>
      )}
    </div>
  );

  const elenco = connections.length === 0 ? (
    <p className="text-sm text-muted-foreground">
      {senzaCornice
        ? "Nessun conto collegato."
        : "Collega il conto corrente dell'azienda per importare i movimenti e riconciliarli con fatture e costi."}
    </p>
  ) : (
    connections.map((c) => {
      const st = STATUS_LABEL[c.status ?? ""] ?? { label: c.status ?? "—", cls: "bg-muted text-muted-foreground" };
      const accs = accounts.filter((a) => a.connection_id === c.id);
      return (
        <div key={c.id} className="rounded-lg border p-3 space-y-2">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <div className="flex items-center gap-2">
              <span className="font-medium text-sm">{c.institution_name ?? "Banca"}</span>
              <Badge className={`text-[10px] px-1.5 py-0 border-0 ${st.cls}`}>{st.label}</Badge>
            </div>
            <div className="flex items-center gap-1.5">
              {c.provider_slug === "saltedge" && c.status === "created" && (
                <Button size="sm" variant="outline" onClick={() => syncNow(c.id)} disabled={syncingId === c.id}>
                  {syncingId === c.id ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5 mr-1" />}
                  Verifica importazione
                </Button>
              )}
              {canEditSettingsIntegrations && c.provider_slug === "saltedge" && c.status === "linked" && !contoDaRicollegare(c) && <Button size="sm" variant="outline" onClick={() => openConnect(c.id, "refresh")}><RefreshCw className="mr-1 h-3.5 w-3.5" />Aggiorna banca</Button>}
              {canEditSettingsIntegrations && c.provider_slug === "saltedge" && contoDaRicollegare(c) && (
                <Button size="sm" variant="outline" onClick={() => openConnect(c.id)}>
                  <RefreshCw className="h-3.5 w-3.5 mr-1" /> Ricollega
                </Button>
              )}
              {canEditSettingsIntegrations && c.provider_slug === "saltedge" && <Button size="sm" variant="ghost" className="text-muted-foreground hover:text-rose-600" onClick={() => setDisconnectId(c.id)} aria-label="Disconnetti conto">
                <Unlink className="h-3.5 w-3.5" />
              </Button>}
            </div>
          </div>
          {c.error_message && (
            <p className="flex items-start gap-1.5 text-[11px] text-rose-600">
              <AlertTriangle className="h-3 w-3 mt-0.5 shrink-0" />
              {c.error_message}
            </p>
          )}
          {c.status === "linked" && c.expires_at && giorniAllaScadenza(c) <= 7 && (
            <p className="flex items-start gap-1.5 text-[11px] text-amber-700">
              <AlertTriangle className="h-3 w-3 mt-0.5 shrink-0" />
              Il consenso scade il {new Date(c.expires_at).toLocaleDateString("it-IT")}
              {giorniAllaScadenza(c) <= 0 ? " (oggi)" : ` (fra ${giorniAllaScadenza(c)} giorni)`}: ricollega il conto prima, così i movimenti non si fermano.
            </p>
          )}
          {accs.length > 0 && (
            <div className="space-y-1">
              {accs.map((a) => (
                <div key={a.id} className="flex items-center justify-between gap-3 text-xs text-muted-foreground">
                  <span className="flex min-w-0 items-center gap-1.5" title={a.account_name ?? undefined}>
                    <CheckCircle2 className="h-3 w-3 shrink-0 text-emerald-500" />
                    <span className="truncate">{nomeConto(a)}</span>
                  </span>
                  {a.current_balance != null && (
                    <span className="tabular-nums">{formatTreasuryCurrency(a.current_balance, "—", a.currency)}</span>
                  )}
                </div>
              ))}
            </div>
          )}
          {c.last_sync_at && (
            <p className="text-[10px] text-muted-foreground">Ultimo sync: {new Date(c.last_sync_at).toLocaleString("it-IT")}</p>
          )}
        </div>
      );
    })
  );

  const dialoghi = (
    <>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Collega un conto bancario</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <DialogDescription className="text-sm text-muted-foreground">
              {bankStatus.data?.mode === "pending" ? "Beta con banche simulate: non collegare conti reali." : "Autorizza la sola lettura di saldi e movimenti tramite Salt Edge e la tua banca. La durata del consenso dipende dalla banca."}
            </DialogDescription>
            {bankStatus.isLoading ? (
              <div className="flex items-center justify-center py-4"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
            ) : !bankStatus.data?.ready || bankStatus.data?.connectReady === false ? <div role="alert" className="text-sm text-destructive">{bankStatus.error instanceof Error ? bankStatus.error.message : bankStatus.data?.connectError || bankStatus.data?.error || "Beta Salt Edge non configurata."}<Button variant="ghost" size="sm" onClick={() => bankStatus.refetch()}><RefreshCw className="mr-1 h-4 w-4" />Riprova</Button></div> : null}
            <label className="flex items-start gap-2 text-sm"><Checkbox checked={confirmAccounts} onCheckedChange={v => setConfirmAccounts(v === true)} />Confermo di collegare esclusivamente conti dell'azienda selezionata. Nessuna disposizione di pagamento.</label>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Annulla</Button>
            <Button onClick={startConnect} disabled={!confirmAccounts || !bankStatus.data?.ready || bankStatus.data?.connectReady === false || connecting}>
              {connecting ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : null}
              Continua con Salt Edge
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!disconnectId} onOpenChange={(o) => { if (!o && !disconnecting) setDisconnectId(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Disconnettere il conto?</AlertDialogTitle>
            <AlertDialogDescription>
              Il consenso PSD2 viene revocato e il conto disattivato. I movimenti già importati restano salvati. Potrai ricollegarlo quando vuoi.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={disconnecting}>Annulla</AlertDialogCancel>
            <AlertDialogAction onClick={(e) => { e.preventDefault(); disconnectConnection(); }} disabled={disconnecting}>
              {disconnecting ? "Disconnessione…" : "Disconnetti"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );

  if (senzaCornice) {
    return (
      <div className="space-y-3">
        <div className="flex items-start justify-between gap-3">
          <p className="text-sm text-muted-foreground">
            Conti in sola lettura, con il consenso della banca. I movimenti disponibili alimentano la riconciliazione con fatture e costi.
          </p>
          {pulsanteCollega}
        </div>
        {elenco}
        {dialoghi}
      </div>
    );
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-2 pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <Landmark className="h-4 w-4 text-blue-600" />
          Conti bancari <span className="text-xs font-normal text-muted-foreground">(Open Banking)</span>
        </CardTitle>
        {pulsanteCollega}
      </CardHeader>
      <CardContent className="space-y-3">
        {elenco}
      </CardContent>
      {dialoghi}
    </Card>
  );
}
