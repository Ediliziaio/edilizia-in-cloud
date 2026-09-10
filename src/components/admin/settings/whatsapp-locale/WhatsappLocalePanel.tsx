/**
 * WhatsApp Locale — pannello superadmin.
 *
 * Configura il gateway OpenWA self-hosted (canale WhatsApp NON-ufficiale, solo
 * piattaforma) e collega fino a 10 numeri reali via QR. Ogni numero ha dei tag
 * (per instradare i contatti) e un tetto giornaliero (anti-spam).
 *
 * Separato al 100% dal canale Meta ufficiale: opera su openwa_numbers /
 * openwa_messages via edge function openwa-gateway. Nessun impatto su
 * ai_whatsapp_numbers, whatsapp-send, ecc.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { edgeErrorMessage } from "@/lib/edgeFunctionError";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
 } from "@/components/ui/dialog";
import { toast } from "sonner";
import {
  Smartphone, Plus, Trash2, Link2, ShieldCheck, RefreshCw, Server, CheckCircle2, XCircle, AlertTriangle, Activity,
  BookOpen, ExternalLink, Send, Settings2, Pencil, QrCode, KeyRound, Check, X } from "lucide-react";
import { useConfirm } from "@/components/ui/confirm-dialog";
import RulesManager from "./RulesManager";

const MAX_NUMBERS = 10;

// URL del webhook da incollare nel gateway OpenWA (informativo).
const WEBHOOK_URL = `${(import.meta.env.VITE_SUPABASE_URL ?? "").replace(/\/+$/, "")}/functions/v1/openwa-webhook`;

interface OpenWaNumberRow {
  id: string;
  session_id: string;
  numero: string | null;
  display_name: string | null;
  stato: string;
  tags: string[];
  daily_cap: number;
  // Mancava dal select: il campo "Cap/sett." mostrava sempre 40 e ogni
  // salvataggio (anche dei soli tag) sovrascriveva il valore vero in DB.
  weekly_cap: number | null;
  errori_consecutivi?: number | null;
  ultimo_errore?: string | null;
  daily_sent: number;
  daily_sent_date: string | null;
  last_seen_at: string | null;
  connected_since: string | null;
  warmup_base: number | null;
  warmup_step: number | null;
  min_gap_seconds: number | null;
}

/** Cap effettivo di oggi con warm-up (replica client di effectiveCapOpenWa). */
function effectiveCapToday(n: OpenWaNumberRow): number {
  const cap = Math.max(0, n.daily_cap);
  if (n.warmup_base == null || n.warmup_step == null) return cap;
  if (!n.connected_since) return Math.min(cap, Math.max(0, n.warmup_base));
  const a = Date.parse(`${n.connected_since}T00:00:00Z`);
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Rome" }).format(new Date());
  const b = Date.parse(`${today}T00:00:00Z`);
  const days = Number.isNaN(a) || Number.isNaN(b) ? 0 : Math.max(0, Math.floor((b - a) / 86_400_000));
  return Math.max(0, Math.min(cap, n.warmup_base + days * n.warmup_step));
}

/** Estrae il messaggio d'errore dal body della edge function (FunctionsHttpError). */
async function readInvokeError(error: unknown): Promise<string> {
  try {
    const ctx = (error as { context?: Response }).context;
    if (ctx && typeof ctx.json === "function") {
      const body = await ctx.json();
      if (body?.error) return body.error;
    }
  } catch { /* ignore */ }
  return (error as Error)?.message ?? "Errore imprevisto";
}

async function invokeGateway(action: string, payload: Record<string, unknown> = {}) {
  const { data, error } = await supabase.functions.invoke("openwa-gateway", {
    body: { action, ...payload },
  });
  if (error) throw new Error(await readInvokeError(error));
  return data as Record<string, unknown>;
}

function statoBadge(stato: string) {
  if (stato === "connected") return <Badge className="bg-emerald-600 hover:bg-emerald-600">Connesso</Badge>;
  if (stato === "connecting") return <Badge variant="secondary">In attesa QR</Badge>;
  if (stato === "banned") return <Badge variant="destructive">Bloccato</Badge>;
  return <Badge variant="outline">Disconnesso</Badge>;
}

/** "3 min fa", "ieri", … — quanto è vecchio l'ultimo segno di vita del numero. */
function tempoFa(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const ms = Date.now() - Date.parse(iso);
  if (!Number.isFinite(ms) || ms < 0) return null;
  const min = Math.floor(ms / 60_000);
  if (min < 1) return "adesso";
  if (min < 60) return `${min} min fa`;
  const ore = Math.floor(min / 60);
  if (ore < 24) return `${ore} or${ore === 1 ? "a" : "e"} fa`;
  const giorni = Math.floor(ore / 24);
  return giorni === 1 ? "ieri" : `${giorni} giorni fa`;
}

export default function WhatsappLocalePanel() {
  const queryClient = useQueryClient();

  // ── Config gateway ─────────────────────────────────────────────────────────
  const settingsQuery = useQuery({
    queryKey: ["openwa", "settings"],
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke("manage-super-admins", {
        body: { action: "get-settings" },
      });
      if (error) throw new Error(await readInvokeError(error));
      return (data as { settings: Record<string, { value: string; masked?: string }> }).settings ?? {};
    },
  });

  const [baseUrl, setBaseUrl] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [webhookSecret, setWebhookSecret] = useState("");
  const [quietStart, setQuietStart] = useState("8");
  const [quietEnd, setQuietEnd] = useState("21");
  const configInit = useRef(false);

  useEffect(() => {
    if (settingsQuery.data && !configInit.current) {
      setBaseUrl(settingsQuery.data.openwa_base_url?.value ?? "");
      setQuietStart(settingsQuery.data.openwa_quiet_start?.value ?? "8");
      setQuietEnd(settingsQuery.data.openwa_quiet_end?.value ?? "21");
      configInit.current = true;
    }
  }, [settingsQuery.data]);

  const apiKeyMasked = settingsQuery.data?.openwa_api_key?.value ?? "";
  const webhookMasked = settingsQuery.data?.openwa_webhook_secret?.value ?? "";

  const saveConfig = useMutation({
    mutationFn: async () => {
      const settings: Record<string, string> = {};
      if (baseUrl.trim()) settings.openwa_base_url = baseUrl.trim();
      if (apiKey.trim()) settings.openwa_api_key = apiKey.trim();
      if (webhookSecret.trim()) settings.openwa_webhook_secret = webhookSecret.trim();
      if (quietStart.trim()) settings.openwa_quiet_start = quietStart.trim();
      if (quietEnd.trim()) settings.openwa_quiet_end = quietEnd.trim();
      const { error } = await supabase.functions.invoke("manage-super-admins", {
        body: { action: "update-settings", settings },
      });
      if (error) throw new Error(await readInvokeError(error));
    },
    onSuccess: () => {
      toast.success("Configurazione gateway salvata");
      setApiKey("");
      setWebhookSecret("");
      queryClient.invalidateQueries({ queryKey: ["openwa", "settings"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const testPing = useMutation({
    mutationFn: async () => invokeGateway("ping"),
    onSuccess: (data) => toast.success(`Gateway raggiungibile · ${(data.sessions as number | null) ?? 0} sessioni attive`),
    onError: (e: Error) => toast.error(e.message),
  });


  // ── Numeri collegati ───────────────────────────────────────────────────────
  const numbersQuery = useQuery({
    queryKey: ["openwa", "numbers"],
    queryFn: async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any)
        .from("openwa_numbers")
        .select("id, session_id, numero, display_name, stato, tags, daily_cap, weekly_cap, daily_sent, daily_sent_date, last_seen_at, connected_since, warmup_base, warmup_step, min_gap_seconds, errori_consecutivi, ultimo_errore")
        .is("deleted_at", null)
        .order("created_at", { ascending: true });
      if (error) throw error;
      return (data ?? []) as OpenWaNumberRow[];
    },
  });

  const numbers = numbersQuery.data ?? [];
  const gatewayConfigured = Boolean((baseUrl || "").trim()) && Boolean(apiKeyMasked || apiKey.trim());

  // NB: sta QUI, sotto gatewayConfigured, perché lo legge: dichiararlo più
  // in alto lo rende inaccessibile durante il render e la pagina esplode.
  // Stato del gateway verificato all'apertura: prima bisognava premere "Testa
  // connessione" e leggere un avviso che spariva, quindi riaprendo la pagina non
  // si sapeva più se il server rispondeva. Ora si vede a colpo d'occhio.
  const statoGateway = useQuery({
    queryKey: ["owa-stato-gateway"],
    enabled: gatewayConfigured,
    staleTime: 60_000,
    retry: false,
    queryFn: async () => {
      const inizio = Date.now();
      const data = await invokeGateway("ping");
      return { sessioni: (data.sessions as number | null) ?? 0, ms: Date.now() - inizio };
    },
  });

  // ── Dialog "Collega numero" (QR) ───────────────────────────────────────────
  const [connectOpen, setConnectOpen] = useState(false);
  const [displayName, setDisplayName] = useState("");
  const [sessionId, setSessionId] = useState("");
  const [qr, setQr] = useState("");
  const [polling, setPolling] = useState(false);
  // Lo stesso dialog serve anche a RICOLLEGARE un numero già in lista: cambia
  // solo il testo e il fatto che la sessione esiste già.
  const [relink, setRelink] = useState<{ id: string; nome: string; sessionId: string } | null>(null);
  const [relinkLoading, setRelinkLoading] = useState(false);
  // Alternativa al QR: codice a 8 cifre da digitare sul telefono.
  const [pairingPhone, setPairingPhone] = useState("");
  const [pairingCode, setPairingCode] = useState("");
  const [pairingLoading, setPairingLoading] = useState(false);
  const confirm = useConfirm();

  const startConnect = useMutation({
    mutationFn: async () => invokeGateway("create_session", { display_name: displayName.trim() }),
    onSuccess: async (data) => {
      const number = (data.number ?? {}) as { session_id?: string };
      const sid = number.session_id ?? "";
      setSessionId(sid);
      queryClient.invalidateQueries({ queryKey: ["openwa", "numbers"] });
      setPolling(true);
      try {
        const qrData = await invokeGateway("get_qr", { session_id: sid });
        setQr(String(qrData.qr ?? ""));
      } catch (e) {
        toast.error((e as Error).message);
      }
    },
    onError: (e: Error) => toast.error(e.message),
  });

  // Poll dello stato finché il numero non risulta connesso.
  useEffect(() => {
    if (!connectOpen || !sessionId || !polling) return;
    let cancelled = false;
    let ticks = 0;
    const tick = async () => {
      ticks++;
      // Ogni ~21s ri-scarica il QR: OpenWA lo rigenera e quello mostrato scade.
      if (ticks % 7 === 0) {
        try {
          const q = await invokeGateway("get_qr", { session_id: sessionId });
          if (!cancelled) setQr(String(q.qr ?? ""));
        } catch { /* riprova dopo */ }
      }
      try {
        const res = await invokeGateway("session_status", { session_id: sessionId });
        if (cancelled) return;
        if (res.stato === "connected") {
          setPolling(false);
          setConnectOpen(false);
          toast.success(relink ? `${relink.nome}: ricollegato` : "Numero collegato con successo");
          queryClient.invalidateQueries({ queryKey: ["openwa", "numbers"] });
        }
      } catch { /* ritenta al prossimo tick */ }
    };
    const id = setInterval(tick, 3000);
    return () => { cancelled = true; clearInterval(id); };
  }, [connectOpen, sessionId, polling, queryClient, relink]);

  function openConnectDialog() {
    setDisplayName("");
    setSessionId("");
    setQr("");
    setRelink(null);
    setPairingPhone("");
    setPairingCode("");
    setPolling(false);
    setConnectOpen(true);
  }

  // Ricollega: la riga resta (tag, limiti, riscaldamento compresi), si riavvia
  // la sessione sul gateway e si mostra un QR nuovo. Se il gateway aveva perso
  // la sessione, l'edge ne crea una nuova e ci ridà il session_id aggiornato.
  // Riavvio ripetibile: se il gateway non risponde al primo colpo il dialog
  // deve poter riprovare. Prima l'unico bottone rimasto era "Genera QR", che
  // chiama create_session e su un nome già esistente risponde 409 in eterno.
  async function avviaRicollegamento(sid: string) {
    setRelinkLoading(true);
    try {
      const r = await invokeGateway("restart_session", { session_id: sid });
      const nuovoSid = String(r.session_id ?? sid);
      setSessionId(nuovoSid);
      if (r.ricreata) toast.message("Sessione ricreata sul gateway: inquadra il nuovo QR.");
      const qrData = await invokeGateway("get_qr", { session_id: nuovoSid });
      setQr(String(qrData.qr ?? ""));
      setPolling(true);
      queryClient.invalidateQueries({ queryKey: ["openwa", "numbers"] });
    } catch (e) {
      // Torniamo allo stato "nessun QR" così il footer mostra "Riprova".
      setSessionId("");
      setQr("");
      setPolling(false);
      toast.error((e as Error).message);
    } finally {
      setRelinkLoading(false);
    }
  }

  async function openRelinkDialog(n: OpenWaNumberRow) {
    setDisplayName(n.display_name ?? "");
    setSessionId(n.session_id);
    setQr("");
    setPairingPhone(n.numero ?? "");
    setPairingCode("");
    setRelink({ id: n.id, nome: n.display_name || n.numero || n.session_id, sessionId: n.session_id });
    setConnectOpen(true);
    await avviaRicollegamento(n.session_id);
  }

  async function chiediPairingCode() {
    const phone = pairingPhone.replace(/[^\d]/g, "");
    if (phone.length < 8) { toast.error("Scrivi il numero del telefono da collegare, con prefisso (es. +39…)"); return; }
    setPairingLoading(true);
    try {
      const r = await invokeGateway("get_pairing_code", { session_id: sessionId, phone });
      setPairingCode(String(r.pairing_code ?? ""));
      if (!r.pairing_code) toast.error("Il gateway non ha restituito un codice: riprova col QR.");
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setPairingLoading(false);
    }
  }

  const disconnectNumber = useMutation({
    mutationFn: async (sid: string) => invokeGateway("delete_session", { session_id: sid }),
    onSuccess: () => {
      toast.success("Numero scollegato");
      queryClient.invalidateQueries({ queryKey: ["openwa", "numbers"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="space-y-6">
      <SetupGuide configured={gatewayConfigured} />
      <OpenWaDashboard numbers={numbers} />
      {!settingsQuery.isLoading && !webhookMasked && (
        <div className="flex items-start gap-2 rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>
            Configura il <strong>Webhook secret</strong>: senza, i messaggi in arrivo vengono rifiutati
            per sicurezza (nessuna firma da verificare).
          </span>
        </div>
      )}
      {/* Config gateway */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Server className="h-5 w-5" /> Gateway OpenWA
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Server self-hosted (VPS) che gestisce le sessioni WhatsApp. Inserisci l'URL pubblico e la
            API key del gateway. Il webhook secret firma i messaggi in arrivo.
          </p>
          {settingsQuery.isLoading ? (
            <Skeleton className="h-32 w-full" />
          ) : (
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5 sm:col-span-2">
                <Label htmlFor="owa-base">URL gateway</Label>
                <Input
                  id="owa-base"
                  placeholder="https://openwa.miodominio.com"
                  value={baseUrl}
                  onChange={(e) => setBaseUrl(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="owa-key">API key</Label>
                <Input
                  id="owa-key"
                  type="password"
                  placeholder={apiKeyMasked || "Inserisci la API key"}
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                />
                {apiKeyMasked && !apiKey && (
                  <p className="text-xs text-muted-foreground">Salvata: {apiKeyMasked}</p>
                )}
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="owa-secret">Webhook secret</Label>
                <Input
                  id="owa-secret"
                  type="password"
                  placeholder={webhookMasked || "Segreto per firmare i webhook"}
                  value={webhookSecret}
                  onChange={(e) => setWebhookSecret(e.target.value)}
                />
                {webhookMasked && !webhookSecret && (
                  <p className="text-xs text-muted-foreground">Salvato: {webhookMasked}</p>
                )}
              </div>
            </div>
          )}
          <div className="grid max-w-md gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="owa-quiet-start">Invii automatici · dalle ore</Label>
              <Input id="owa-quiet-start" type="number" min={0} max={23} value={quietStart} onChange={(e) => setQuietStart(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="owa-quiet-end">…alle ore</Label>
              <Input id="owa-quiet-end" type="number" min={1} max={24} value={quietEnd} onChange={(e) => setQuietEnd(e.target.value)} />
            </div>
            <p className="sm:col-span-2 text-xs text-muted-foreground">
              Anti-ban: fuori da questa fascia oraria gli invii automatici (automazioni) vengono rifiutati. Gli invii manuali non sono bloccati.
            </p>
          </div>
          {/* Stato in chiaro, senza dover premere niente */}
          {gatewayConfigured && (
            <div className={`flex flex-wrap items-center gap-2 rounded-lg border px-3 py-2 text-sm ${
              statoGateway.isLoading ? "border-border bg-muted/40 text-muted-foreground"
                : statoGateway.isError ? "border-red-200 bg-red-50 text-red-800"
                : "border-emerald-200 bg-emerald-50 text-emerald-800"
            }`}>
              <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${
                statoGateway.isLoading ? "animate-pulse bg-muted-foreground"
                  : statoGateway.isError ? "bg-red-500" : "bg-emerald-500"
              }`} />
              {statoGateway.isLoading ? (
                <span>Controllo il gateway…</span>
              ) : statoGateway.isError ? (
                <>
                  <span className="font-semibold">Gateway non raggiungibile.</span>
                  <span className="text-xs">
                    {(statoGateway.error as Error)?.message?.slice(0, 120) ||
                      "Controlla che il server sia acceso e che URL e API key siano quelli giusti."}
                  </span>
                </>
              ) : (
                <>
                  <span className="font-semibold">Gateway connesso</span>
                  <span className="text-xs">
                    {statoGateway.data?.sessioni ?? 0} session{(statoGateway.data?.sessioni ?? 0) === 1 ? "e" : "i"} sul server
                    {statoGateway.data?.ms != null ? ` · risposta in ${statoGateway.data.ms} ms` : ""}
                  </span>
                </>
              )}
            </div>
          )}

          <div className="flex flex-wrap items-center gap-3">
            <Button onClick={() => saveConfig.mutate()} disabled={saveConfig.isPending}>
              <ShieldCheck className="mr-2 h-4 w-4" />
              {saveConfig.isPending ? "Salvataggio…" : "Salva configurazione"}
            </Button>
            <Button
              variant="outline"
              onClick={() => { testPing.mutate(); void statoGateway.refetch(); }}
              disabled={testPing.isPending || !gatewayConfigured}
            >
              {testPing.isPending ? "Controllo…" : "Ricontrolla"}
            </Button>
          </div>
          {/* Il webhook lo registra EiC da sola quando colleghi un numero: qui
              l'indirizzo serve solo se lo devi configurare a mano sul gateway. */}
          <p className="text-xs text-muted-foreground">
            Il webhook viene registrato in automatico su ogni numero che colleghi.
            Se ti serve impostarlo a mano sul gateway, l'indirizzo è <code>{WEBHOOK_URL}</code>
          </p>
        </CardContent>
      </Card>

      {/* Numeri collegati */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <Smartphone className="h-5 w-5" /> Numeri collegati
            <span className="text-sm font-normal text-muted-foreground">
              {numbers.length}/{MAX_NUMBERS}
            </span>
          </CardTitle>
          <Button
            onClick={openConnectDialog}
            disabled={!gatewayConfigured || numbers.length >= MAX_NUMBERS}
          >
            <Plus className="mr-2 h-4 w-4" /> Collega numero
          </Button>
        </CardHeader>
        <CardContent className="space-y-3">
          {!gatewayConfigured && (
            <p className="text-sm text-amber-600">
              Configura e salva il gateway prima di collegare i numeri.
            </p>
          )}
          {numbersQuery.isLoading ? (
            <Skeleton className="h-24 w-full" />
          ) : numbers.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nessun numero collegato.</p>
          ) : (
            numbers.map((n) => (
              <NumberRow
                key={n.id}
                number={n}
                onSaved={() => queryClient.invalidateQueries({ queryKey: ["openwa", "numbers"] })}
                onRelink={() => { void openRelinkDialog(n); }}
                onDisconnect={async () => {
                  const ok = await confirm({
                    title: `Scollegare ${n.display_name || n.numero || n.session_id}?`,
                    description: "La sessione WhatsApp viene chiusa e il numero sparisce dalla lista con i suoi tag, limiti e riscaldamento. Se il telefono ha solo perso il collegamento, usa \"Ricollega\" invece.",
                    confirmLabel: "Scollega",
                  });
                  if (ok) disconnectNumber.mutate(n.session_id);
                }}
                disconnecting={disconnectNumber.isPending}
              />
            ))
          )}
        </CardContent>
      </Card>

      {/* Regole automatiche */}
      <RulesManager numbers={numbers} />

      {/* Dialog QR */}
      <Dialog open={connectOpen} onOpenChange={(o) => { if (!o) { setPolling(false); } setConnectOpen(o); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{relink ? `Ricollega ${relink.nome}` : "Collega un numero WhatsApp"}</DialogTitle>
            <DialogDescription>
              {relink
                ? "Sul telefono: WhatsApp → Dispositivi collegati → Collega un dispositivo, poi inquadra il QR. Tag, limiti e riscaldamento restano quelli di prima."
                : "Dai un nome al numero, genera il QR e scansionalo da WhatsApp → Dispositivi collegati."}
            </DialogDescription>
          </DialogHeader>

          {!sessionId ? (
            <div className="space-y-3">
              <div className="space-y-1.5">
                <Label htmlFor="owa-name">Nome numero</Label>
                <Input
                  id="owa-name"
                  placeholder="Es. Marketing Lombardia"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                />
              </div>
            </div>
          ) : (
            <div className="flex flex-col items-center gap-3 py-2">
              {qr ? (
                qr.startsWith("data:") ? (
                  <img src={qr} alt="QR code WhatsApp" className="h-56 w-56" />
                ) : (
                  <div className="max-w-full overflow-x-auto rounded border bg-muted p-3 text-center text-xs">
                    <p className="mb-2 text-muted-foreground">Codice pairing:</p>
                    <code className="break-all">{qr}</code>
                  </div>
                )
              ) : (
                <Skeleton className="h-56 w-56" />
              )}
              <p className="flex items-center gap-2 text-sm text-muted-foreground">
                <RefreshCw className="h-4 w-4 animate-spin" />
                {relinkLoading ? "Riavvio della sessione sul gateway…" : "In attesa della scansione… il QR si rinnova da solo."}
              </p>

              {/* Il QR a volte non si lascia inquadrare (schermo piccolo, fotocamera
                  che non mette a fuoco): il codice a 8 cifre è la via di riserva. */}
              <div className="w-full rounded-md border p-3 space-y-2">
                <p className="text-xs font-medium flex items-center gap-1.5">
                  <KeyRound className="h-3.5 w-3.5" /> Non riesci a inquadrare? Usa il codice
                </p>
                <div className="flex gap-2">
                  <Input
                    placeholder="+39 333 1234567"
                    value={pairingPhone}
                    onChange={(e) => setPairingPhone(e.target.value)}
                    className="h-8 text-sm"
                  />
                  <Button type="button" variant="outline" size="sm" className="h-8 shrink-0" onClick={() => { void chiediPairingCode(); }} disabled={pairingLoading || !sessionId}>
                    {pairingLoading ? "…" : "Ottieni codice"}
                  </Button>
                </div>
                {pairingCode && (
                  <p className="text-sm">
                    Sul telefono scegli <em>Collega con numero di telefono</em> e digita{" "}
                    <code className="rounded bg-muted px-1.5 py-0.5 text-base font-semibold tracking-widest">{pairingCode}</code>
                  </p>
                )}
              </div>
            </div>
          )}

          <DialogFooter>
            {!sessionId ? (
              relink ? (
                <Button onClick={() => { void avviaRicollegamento(relink.sessionId); }} disabled={relinkLoading}>
                  <RefreshCw className={`mr-2 h-4 w-4 ${relinkLoading ? "animate-spin" : ""}`} />
                  {relinkLoading ? "Riavvio…" : "Riprova a ricollegare"}
                </Button>
              ) : (
                <Button onClick={() => startConnect.mutate()} disabled={startConnect.isPending || !displayName.trim()}>
                  <Link2 className="mr-2 h-4 w-4" />
                  {startConnect.isPending ? "Generazione…" : "Genera QR"}
                </Button>
              )
            ) : (
              <Button variant="outline" onClick={() => { setPolling(false); setConnectOpen(false); }}>
                Chiudi
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ── Riga singolo numero: tag + cap editabili ─────────────────────────────────
function NumberRow({
  number, onSaved, onRelink, onDisconnect, disconnecting,
}: {
  number: OpenWaNumberRow;
  onSaved: () => void;
  onRelink: () => void;
  onDisconnect: () => void;
  disconnecting: boolean;
}) {
  // Rinomina in riga: il nome del telefono (pushName) arrivava come default e
  // finora non si poteva cambiare — due numeri diversi entrambi "Giusy".
  const [rinomina, setRinomina] = useState(false);
  const [nuovoNome, setNuovoNome] = useState(number.display_name ?? "");
  const [salvandoNome, setSalvandoNome] = useState(false);
  async function salvaNome() {
    const nome = nuovoNome.trim();
    if (!nome || nome === (number.display_name ?? "")) { setRinomina(false); return; }
    setSalvandoNome(true);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (supabase as any).from("openwa_numbers").update({ display_name: nome }).eq("id", number.id);
    setSalvandoNome(false);
    if (error) { toast.error("Nome non salvato"); return; }
    setRinomina(false);
    toast.success("Nome aggiornato");
    onSaved();
  }
  const [tagsText, setTagsText] = useState((number.tags ?? []).join(", "));
  const [cap, setCap] = useState(String(number.daily_cap ?? 10));
  const [weeklyCap, setWeeklyCap] = useState(String(number.weekly_cap ?? 40));
  const [minGap, setMinGap] = useState(String(number.min_gap_seconds ?? 45));
  const [saving, setSaving] = useState(false);
  // Impostazioni chiuse per default: con dieci numeri, tre campi aperti per
  // ciascuno rendono la pagina un chilometro di moduli.
  const [impostazioniAperte, setImpostazioniAperte] = useState(false);
  // Prova di invio: dopo aver collegato un numero l'unico modo di sapere se
  // funziona davvero era aspettare la prima campagna.
  const [provaAperta, setProvaAperta] = useState(false);
  const [provaA, setProvaA] = useState("");
  const [provaTesto, setProvaTesto] = useState("Messaggio di prova da Edilizia in Cloud.");
  const [inviando, setInviando] = useState(false);

  async function inviaProva() {
    const destinatario = provaA.replace(/[^\d+]/g, "");
    if (destinatario.replace(/\D/g, "").length < 8) {
      toast.error("Scrivi il numero del destinatario con il prefisso, es. +39 333 1234567");
      return;
    }
    setInviando(true);
    try {
      const { data, error } = await supabase.functions.invoke("openwa-gateway", {
        body: { action: "send_text", to: destinatario, text: provaTesto, number_id: number.id },
      });
      if (error) throw new Error(await edgeErrorMessage(error, "Invio non riuscito"));
      if ((data as { error?: string })?.error) throw new Error(String((data as { error?: string }).error));
      toast.success("Messaggio inviato: controlla il telefono del destinatario");
      setProvaAperta(false);
      onSaved();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Invio non riuscito");
    } finally {
      setInviando(false);
    }
  }

  const dirty = useMemo(() => {
    const parsed = tagsText.split(",").map((t) => t.trim()).filter(Boolean);
    const same =
      parsed.join("|") === (number.tags ?? []).join("|") &&
      Number(cap) === number.daily_cap &&
      Number(weeklyCap) === (number.weekly_cap ?? 40) &&
      Number(minGap) === (number.min_gap_seconds ?? 45);
    return !same;
  }, [tagsText, cap, weeklyCap, minGap, number.tags, number.daily_cap, number.weekly_cap, number.min_gap_seconds]);

  async function save() {
    if (saving) return;
    setSaving(true);
    const tags = tagsText.split(",").map((t) => t.trim()).filter(Boolean);
    const capNum = Math.max(0, Number(cap) || 0);
    const weeklyNum = Math.max(0, Number(weeklyCap) || 0);
    const gapNum = Math.max(0, Number(minGap) || 0);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (supabase as any)
      .from("openwa_numbers")
      .update({ tags, daily_cap: capNum, weekly_cap: weeklyNum, min_gap_seconds: gapNum })
      .eq("id", number.id);
    setSaving(false);
    if (error) { toast.error("Salvataggio non riuscito"); return; }
    toast.success("Numero aggiornato");
    onSaved();
  }

  // Il contatore vale solo se e' di OGGI: un numero che ieri ha inviato 30
  // mostrava "Oggi 30 su 10".
  const oggiRoma = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Rome" }).format(new Date());
  const sentToday = number.daily_sent_date === oggiRoma ? (number.daily_sent ?? 0) : 0;
  const effCap = effectiveCapToday(number);
  const warming = effCap < number.daily_cap;

  return (
    <div className="rounded-lg border p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          {number.stato === "connected"
            ? <CheckCircle2 className="h-4 w-4 text-emerald-600" />
            : <XCircle className="h-4 w-4 text-muted-foreground" />}
          {rinomina ? (
            <span className="flex items-center gap-1">
              <Input
                autoFocus
                value={nuovoNome}
                onChange={(e) => setNuovoNome(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") void salvaNome(); if (e.key === "Escape") setRinomina(false); }}
                className="h-8 w-52 text-sm"
                maxLength={60}
              />
              <Button variant="ghost" size="sm" className="h-8 px-2" onClick={() => { void salvaNome(); }} disabled={salvandoNome} title="Salva nome">
                <Check className="h-4 w-4" />
              </Button>
              <Button variant="ghost" size="sm" className="h-8 px-2" onClick={() => { setRinomina(false); setNuovoNome(number.display_name ?? ""); }} title="Annulla">
                <X className="h-4 w-4" />
              </Button>
            </span>
          ) : (
            <span className="flex items-center gap-1">
              <span className="font-medium">{number.display_name || number.numero || number.session_id}</span>
              <Button variant="ghost" size="sm" className="h-7 px-1.5 text-muted-foreground" onClick={() => { setNuovoNome(number.display_name ?? ""); setRinomina(true); }} title="Rinomina">
                <Pencil className="h-3.5 w-3.5" />
              </Button>
            </span>
          )}
          {number.numero && <span className="text-sm text-muted-foreground">{number.numero}</span>}
          {statoBadge(number.stato)}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs text-muted-foreground">
            Oggi {sentToday} messagg{sentToday === 1 ? "io" : "i"} su {effCap}
          </span>
          {warming && (
            <Badge
              variant="outline"
              className="text-[10px]"
              title={`Numero nuovo: oggi può mandarne ${effCap}. Il limite sale da solo ogni giorno fino a ${number.daily_cap}, così WhatsApp non lo blocca.`}
            >
              in riscaldamento · si arriva a {number.daily_cap}
            </Badge>
          )}
          {number.stato === "connected" ? (
            <Button variant="outline" size="sm" onClick={() => setProvaAperta(true)}>
              <Send className="mr-1 h-3.5 w-3.5" /> Prova
            </Button>
          ) : (
            // Non connesso: il QR è l'unica cosa che serve, quindi sta in vista.
            <Button variant="default" size="sm" onClick={onRelink} title="Mostra un nuovo QR e ricollega il telefono">
              <QrCode className="mr-1 h-3.5 w-3.5" /> {number.stato === "connecting" ? "Mostra QR" : "Ricollega"}
            </Button>
          )}
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setImpostazioniAperte((v) => !v)}
            title="Tag, limiti, pausa e ricollegamento"
          >
            <Settings2 className="h-4 w-4" />
          </Button>
          <Button variant="ghost" size="sm" onClick={onDisconnect} disabled={disconnecting} title="Scollega numero">
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      </div>
      {warming && (
        <p className="mt-1 text-[11px] text-muted-foreground">
          Numero nuovo: oggi può mandarne {effCap}. Il tetto cresce da solo ogni giorno
          fino a {number.daily_cap} — è così che si evita il blocco.
        </p>
      )}
      <p className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-[11px] text-muted-foreground">
        {tempoFa(number.last_seen_at) && <span>Ultimo segno di vita: {tempoFa(number.last_seen_at)}</span>}
        {number.connected_since && <span>Collegato dal {new Date(`${number.connected_since}T00:00:00`).toLocaleDateString("it-IT")}</span>}
        {(number.errori_consecutivi ?? 0) > 0 && (
          <span className="text-amber-700">
            {number.errori_consecutivi} invii falliti di fila{number.ultimo_errore ? ` — ${number.ultimo_errore.slice(0, 80)}` : ""}
          </span>
        )}
        {number.stato === "banned" && <span className="text-destructive">WhatsApp ha bloccato questo numero: non usarlo per le campagne.</span>}
      </p>
      {impostazioniAperte && (
      <div className="mt-3 space-y-2">
        <div className="space-y-1">
          <Label className="text-xs">Tag (separati da virgola)</Label>
          <Input
            placeholder="es. lombardia, lead-freddi"
            value={tagsText}
            onChange={(e) => setTagsText(e.target.value)}
          />
        </div>
        <div className="flex flex-wrap items-end gap-3">
          <div className="space-y-1">
            <Label className="text-xs">Cap/giorno</Label>
            <Input type="number" min={0} className="w-20" value={cap} onChange={(e) => setCap(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Cap/sett.</Label>
            <Input type="number" min={0} className="w-20" value={weeklyCap} onChange={(e) => setWeeklyCap(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Pausa (s)</Label>
            <Input type="number" min={0} className="w-20" value={minGap} onChange={(e) => setMinGap(e.target.value)} />
          </div>
          <Button size="sm" onClick={save} disabled={!dirty || saving}>
            {saving ? "…" : "Salva"}
          </Button>
        </div>
        {number.stato === "connected" && (
          <div className="flex items-center justify-between gap-3 rounded-md border border-dashed p-2">
            <p className="text-[11px] text-muted-foreground">
              Il telefono non riceve più? Un QR nuovo ricollega questo stesso numero senza perdere tag, limiti e riscaldamento.
            </p>
            <Button variant="outline" size="sm" className="shrink-0" onClick={onRelink}>
              <QrCode className="mr-1 h-3.5 w-3.5" /> Ricollega con nuovo QR
            </Button>
          </div>
        )}
      </div>
      )}

      <Dialog open={provaAperta} onOpenChange={setProvaAperta}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Invio di prova da {number.display_name || number.numero}</DialogTitle>
            <DialogDescription>
              Manda un messaggio a un numero che conosci — il tuo, per esempio — per
              vedere se questo numero funziona davvero.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label className="text-xs">Numero destinatario</Label>
              <Input
                placeholder="+39 333 1234567"
                value={provaA}
                onChange={(e) => setProvaA(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Testo</Label>
              <Input value={provaTesto} onChange={(e) => setProvaTesto(e.target.value)} />
            </div>
            <p className="text-[11px] text-muted-foreground">
              La prova conta nel tetto giornaliero di questo numero e ignora la fascia oraria.
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setProvaAperta(false)}>Annulla</Button>
            <Button onClick={inviaProva} disabled={inviando}>
              {inviando ? "Invio…" : "Invia"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ── Dashboard: stato pool + statistiche messaggi ─────────────────────────────
function StatTile({ label, value, sub, tone }: { label: string; value: string | number; sub?: string; tone?: string }) {
  return (
    <div className="rounded-lg border p-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={`text-2xl font-bold ${tone ?? ""}`}>{value}</p>
      {sub && <p className="text-[11px] text-muted-foreground">{sub}</p>}
    </div>
  );
}

function OpenWaDashboard({ numbers }: { numbers: OpenWaNumberRow[] }) {
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Rome" }).format(new Date());
  const connessi = numbers.filter((n) => n.stato === "connected").length;
  const capResidua = numbers.reduce((s, n) => {
    if (n.stato !== "connected") return s;
    const eff = effectiveCapToday(n);
    const sent = n.daily_sent_date === today ? (n.daily_sent ?? 0) : 0;
    return s + Math.max(0, eff - sent);
  }, 0);

  const statsQuery = useQuery({
    queryKey: ["openwa", "stats"],
    queryFn: async () => {
      const now = new Date();
      const dayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
      const weekStart = new Date(now.getTime() - 7 * 86_400_000).toISOString();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const tbl = () => (supabase as any).from("openwa_messages").select("*", { count: "exact", head: true });
      const [sentToday, recvToday, sent7, recv7, failed7] = await Promise.all([
        tbl().eq("direction", "outbound").gte("created_at", dayStart),
        tbl().eq("direction", "inbound").gte("created_at", dayStart),
        tbl().eq("direction", "outbound").gte("created_at", weekStart),
        tbl().eq("direction", "inbound").gte("created_at", weekStart),
        tbl().eq("direction", "outbound").eq("status", "failed").gte("created_at", weekStart),
      ]);
      return {
        sentToday: sentToday.count ?? 0,
        recvToday: recvToday.count ?? 0,
        sent7: sent7.count ?? 0,
        recv7: recv7.count ?? 0,
        failed7: failed7.count ?? 0,
      };
    },
    staleTime: 30_000,
  });

  const s = statsQuery.data;
  const replyRate = s && s.sent7 > 0 ? Math.round((s.recv7 / s.sent7) * 100) : 0;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Activity className="h-5 w-5" /> Panoramica
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {/* Con zero numeri collegati i sei contatori a zero non dicono niente:
            meglio dire qual è il prossimo passo. */}
        {numbers.length === 0 && (
          <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
            Nessun numero collegato: i contatori restano a zero finché non ne abbini uno.
            Configura il gateway qui sotto, poi premi <strong>Collega numero</strong> e inquadra il QR
            con il telefono di quel numero.
          </div>
        )}
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
          <StatTile label="Numeri connessi" value={`${connessi}/${numbers.length}`} tone={connessi === 0 ? "text-amber-600" : "text-emerald-600"} />
          <StatTile label="Capacità oggi" value={capResidua} sub="messaggi residui" />
          <StatTile label="Inviati oggi" value={s ? s.sentToday : "—"} />
          <StatTile label="Risposte oggi" value={s ? s.recvToday : "—"} />
          <StatTile label="Tasso risposta 7gg" value={`${replyRate}%`} sub={s ? `${s.recv7} su ${s.sent7}` : ""} />
          <StatTile label="Falliti 7gg" value={s ? s.failed7 : "—"} tone={s && s.failed7 > 0 ? "text-destructive" : ""} />
        </div>
      </CardContent>
    </Card>
  );
}

// ── Guida "Come funziona" (non-tecnica) ──────────────────────────────────────
function SetupGuide({ configured }: { configured: boolean }) {
  return (
    <Card>
      <CardContent className="pt-6">
        <details open={!configured}>
          <summary className="flex cursor-pointer select-none items-center gap-2 text-base font-semibold">
            <BookOpen className="h-5 w-5" /> Come funziona · guida al collegamento
          </summary>
          <div className="mt-4 space-y-3 text-sm text-muted-foreground">
            <p>
              WhatsApp Locale <strong>non</strong> usa le API ufficiali di Meta. Un piccolo programma (il
              “gateway” OpenWA) gira su un tuo server e si collega a WhatsApp come quando usi WhatsApp Web sul computer.
            </p>
            <p>Ti serve un <strong>server sempre acceso</strong> (un VPS, da circa 5 €/mese) su cui installare quel programma.</p>
            <ol className="ml-4 list-decimal space-y-2">
              <li>
                Attiva un <strong>VPS</strong> con Ubuntu (Hetzner, Contabo, DigitalOcean…).
                Ogni numero collegato occupa 30-80 MB: con <strong>4 GB</strong> stai comodo
                fino a venticinque numeri, e il volume di messaggi non incide.
              </li>
              <li>
                Fai puntare un <strong>sottodominio</strong> all'IP del server (record A).
                Se usi Cloudflare tieni la nuvoletta <strong>grigia</strong> (“DNS only”):
                con il proxy acceso il certificato HTTPS non si genera.
              </li>
              <li>
                Installa <strong>Docker</strong> e avvia <strong>OpenWA</strong> con un reverse
                proxy che faccia da solo l'HTTPS (Caddy). Nel repository di EiC trovi la
                configurazione pronta in <code>deploy/whatsapp-gateway/</code>.
              </li>
              <li>
                Recupera la <strong>API key</strong>: OpenWA la genera al primo avvio e la salva
                in <code>data/.api-key</code> —
                <code>docker exec openwa cat /app/data/.api-key</code>. Se preferisci sceglierla
                tu, va passata nella variabile <strong>API_MASTER_KEY</strong> (con altri nomi
                viene ignorata e ogni chiamata risponde 401).
              </li>
              <li>Torna qui, incolla <strong>URL gateway</strong> e <strong>API key</strong>, poi <strong>Salva configurazione</strong>.</li>
              <li>Controlla che la riga di stato qui sopra sia <strong>verde</strong>.</li>
              <li>Premi <strong>Collega numero</strong>, apri WhatsApp sul telefono → Impostazioni → Dispositivi collegati → Collega un dispositivo, e inquadra il <strong>QR</strong>.</li>
              <li>Ripeti per gli altri numeri. Ognuno ha i suoi tag, tetti e orari.</li>
            </ol>
            <p>
              Progetto del gateway:{" "}
              <a className="text-primary underline" href="https://github.com/rmyndharis/OpenWA" target="_blank" rel="noopener noreferrer">
                github.com/rmyndharis/OpenWA <ExternalLink className="inline h-3 w-3" />
              </a>
            </p>
            <p className="text-xs">
              Consiglio anti-blocco: parti con pochi messaggi al giorno per numero e aumenta gradualmente — il sistema lo fa già da sé col “warm-up”.
            </p>
          </div>
        </details>
      </CardContent>
    </Card>
  );
}
