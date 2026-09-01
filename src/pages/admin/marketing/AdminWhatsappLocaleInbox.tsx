/**
 * WhatsApp Locale — Inbox realtime (piattaforma).
 *
 * Mostra le conversazioni del canale non-ufficiale (openwa_messages), raggruppate
 * per chat. Le risposte partono dallo STESSO numero con cui si è parlato col
 * contatto (continuità); i nuovi messaggi usano la rotazione tag+cap del gateway.
 * Realtime via postgres_changes su openwa_messages.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { Send, Plus, MessageCircle, Smartphone, RefreshCw, Paperclip, Bell, BellOff, Search, Check, CheckCheck, AlertCircle, Ban, WifiOff } from "lucide-react";
import { Link } from "react-router-dom";
import { cn } from "@/lib/utils";
import { PLATFORM_ADMIN_COMPANY_ID } from "@/lib/adminConstants";
import { usePushNotifications } from "@/hooks/usePushNotifications";
import IdentitaThread from "@/components/admin/whatsapp-locale/IdentitaThread";

interface OpenWaMessage {
  id: string;
  number_id: string | null;
  contact_id: string | null;
  wa_chat_id: string;
  contact_phone: string | null;
  contact_name: string | null;
  direction: string;
  body: string | null;
  media_url: string | null;
  status: string;
  error?: string | null;
  created_at: string;
  read_at: string | null;
}

interface OpenWaNumber {
  id: string;
  display_name: string | null;
  numero: string | null;
  stato: string;
  daily_sent: number | null;
  daily_cap: number | null;
  daily_sent_date: string | null;
}

interface Thread {
  chatId: string;
  name: string;
  phone: string | null;
  lastAt: string;
  lastBody: string;
  numberId: string | null;
  contactId: string | null;
  unread: number;
  messages: OpenWaMessage[];
}

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

function fmtTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString("it-IT", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
}

/** Etichetta del separatore di giorno: Oggi / Ieri / data. */
function etichettaGiorno(iso: string): string {
  const d = new Date(iso);
  const oggi = new Date();
  const ieri = new Date(); ieri.setDate(oggi.getDate() - 1);
  const stesso = (a: Date, b: Date) => a.toDateString() === b.toDateString();
  if (stesso(d, oggi)) return "Oggi";
  if (stesso(d, ieri)) return "Ieri";
  return d.toLocaleDateString("it-IT", { day: "numeric", month: "long", year: d.getFullYear() !== oggi.getFullYear() ? "numeric" : undefined });
}

function fmtOra(iso: string): string {
  return new Date(iso).toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" });
}

// Avatar: stessa persona → stesso colore, sempre. La tinta nasce dal numero.
const AVATAR_TINTE = [
  "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300",
  "bg-sky-100 text-sky-800 dark:bg-sky-950 dark:text-sky-300",
  "bg-violet-100 text-violet-800 dark:bg-violet-950 dark:text-violet-300",
  "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300",
  "bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300",
  "bg-teal-100 text-teal-800 dark:bg-teal-950 dark:text-teal-300",
];
function tintaAvatar(chiave: string): string {
  let h = 0;
  for (let i = 0; i < chiave.length; i++) h = (h * 31 + chiave.charCodeAt(i)) >>> 0;
  return AVATAR_TINTE[h % AVATAR_TINTE.length];
}

/** Iniziali per l'avatar: da un nome vero, altrimenti le ultime cifre del numero. */
function iniziali(nome: string): string {
  const parole = nome.trim().split(/\s+/).filter((w) => /[a-zA-Z]/.test(w));
  if (parole.length >= 2) return (parole[0][0] + parole[1][0]).toUpperCase();
  if (parole.length === 1) return parole[0].slice(0, 2).toUpperCase();
  const cifre = nome.replace(/\D/g, "");
  return cifre.slice(-2) || "?";
}

function isHttpUrl(u: string): boolean {
  return /^https?:\/\//i.test(u);
}
function extOf(u: string): string {
  const m = u.split("?")[0].match(/\.(\w+)$/);
  return m ? m[1].toLowerCase() : "";
}

/** Allegato media: i path del bucket privato openwa-media diventano signed URL. */
function MediaAttachment({ path }: { path: string }) {
  const { data: url } = useQuery({
    queryKey: ["openwa", "media", path],
    queryFn: async () => {
      if (isHttpUrl(path)) return path;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data } = await (supabase as any).storage.from("openwa-media").createSignedUrl(path, 3600);
      return data?.signedUrl ?? null;
    },
    staleTime: 50 * 60 * 1000,
  });
  const ext = extOf(path);
  if (!url) return <span className="text-xs opacity-70">📎 media…</span>;
  if (["jpg", "jpeg", "png", "webp", "gif"].includes(ext)) {
    return <img src={url} alt="allegato" className="max-h-48 rounded" />;
  }
  if (["mp3", "ogg", "m4a", "amr", "wav"].includes(ext)) {
    return <audio controls src={url} className="max-w-full" />;
  }
  if (["mp4", "3gp", "mov"].includes(ext)) {
    return <video controls src={url} className="max-h-48 rounded" />;
  }
  return <a href={url} target="_blank" rel="noopener noreferrer" className="underline">📎 Allegato</a>;
}

export default function AdminWhatsappLocaleInbox() {
  const queryClient = useQueryClient();
  const [selectedChat, setSelectedChat] = useState<string | null>(null);
  const [filtro, setFiltro] = useState("");
  const [soloNonLetti, setSoloNonLetti] = useState(false);
  const [reply, setReply] = useState("");
  // Avviso sul telefono quando arriva una risposta. Web push: funziona nel
  // browser del telefono o nella PWA in home, NON dentro l'app nativa
  // (il WebView non implementa la Push API).
  const {
    supported: pushSupportato,
    isSubscribed: pushAttivo,
    isLoading: pushInCorso,
    subscribe: attivaPush,
    unsubscribe: disattivaPush,
  } = usePushNotifications();

  const [newOpen, setNewOpen] = useState(false);
  const [newPhone, setNewPhone] = useState("");
  const [newText, setNewText] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);
  const attachRef = useRef<HTMLInputElement>(null);
  const [uploadingMedia, setUploadingMedia] = useState(false);

  const messagesQuery = useQuery({
    queryKey: ["openwa", "messages"],
    queryFn: async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any)
        .from("openwa_messages")
        .select("id, number_id, contact_id, wa_chat_id, contact_phone, contact_name, direction, body, media_url, status, error, created_at, read_at")
        .order("created_at", { ascending: false })
        .limit(1000);
      if (error) throw error;
      return (data ?? []) as OpenWaMessage[];
    },
    staleTime: 15_000,
  });

  // I nostri numeri: servono a dire da QUALE numero si sta parlando (con piu'
  // numeri collegati, rispondere dal numero sbagliato confonde il destinatario)
  // e a mostrare quanti messaggi restano oggi prima del tetto anti-ban.
  const numbersQuery = useQuery({
    queryKey: ["openwa", "numbers"],
    queryFn: async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any)
        .from("openwa_numbers")
        .select("id, display_name, numero, stato, daily_sent, daily_cap, daily_sent_date")
        .is("deleted_at", null);
      if (error) throw error;
      return (data ?? []) as OpenWaNumber[];
    },
    staleTime: 60_000,
  });

  const numeriInProblema = useMemo(
    () => (numbersQuery.data ?? []).filter((n) => n.stato === "banned" || n.stato === "disconnected"),
    [numbersQuery.data],
  );

  const numeriById = useMemo(() => {
    const m = new Map<string, OpenWaNumber>();
    for (const n of numbersQuery.data ?? []) m.set(n.id, n);
    return m;
  }, [numbersQuery.data]);

  // Realtime: nuovi messaggi (inbound webhook o outbound) → refetch inbox.
  useEffect(() => {
    const channel = supabase
      .channel("openwa-inbox")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "openwa_messages" },
        () => queryClient.invalidateQueries({ queryKey: ["openwa", "messages"] }),
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [queryClient]);

  // Raggruppa i messaggi per chat (thread), ordinati per ultimo messaggio.
  const threads = useMemo<Thread[]>(() => {
    const rows = messagesQuery.data ?? [];
    const map = new Map<string, Thread>();
    // rows è desc: il primo visto per chat è il più recente.
    for (const m of rows) {
      let t = map.get(m.wa_chat_id);
      if (!t) {
        t = {
          chatId: m.wa_chat_id,
          name: m.contact_name || m.contact_phone || m.wa_chat_id.replace("@c.us", ""),
          phone: m.contact_phone,
          lastAt: m.created_at,
          lastBody: m.body || (m.media_url ? "📎 media" : ""),
          numberId: m.number_id,
          contactId: m.contact_id,
          unread: 0,
          messages: [],
        };
        map.set(m.wa_chat_id, t);
      }
      t.messages.push(m);
      if (!t.contactId && m.contact_id) t.contactId = m.contact_id;
      if (m.direction === "inbound" && !m.read_at) t.unread++;
    }
    // messaggi in ordine cronologico crescente per il thread
    for (const t of map.values()) t.messages.reverse();
    return [...map.values()].sort((a, b) => (a.lastAt < b.lastAt ? 1 : -1));
  }, [messagesQuery.data]);

  // Ricerca su nome, numero e testo dell'ultimo messaggio: con qualche decina di
  // conversazioni scorrere la lista a mano diventa il collo di bottiglia.
  const threadsVisibili = useMemo(() => {
    const q = filtro.trim().toLowerCase();
    const cifre = q.replace(/\D/g, "");
    return threads.filter((t) => {
      if (soloNonLetti && t.unread === 0) return false;
      if (!q) return true;
      if (cifre.length >= 3 && (t.phone ?? t.chatId).replace(/\D/g, "").includes(cifre)) return true;
      return t.name.toLowerCase().includes(q) || t.lastBody.toLowerCase().includes(q);
    });
  }, [threads, filtro, soloNonLetti]);

  const totNonLetti = useMemo(() => threads.reduce((n, t) => n + t.unread, 0), [threads]);

  const active = threads.find((t) => t.chatId === selectedChat) ?? null;
  const numeroAttivo = active?.numberId ? numeriById.get(active.numberId) ?? null : null;
  const piuNumeri = (numbersQuery.data?.length ?? 0) > 1;

  // Quanti invii restano oggi: il tetto sale ogni giorno durante il riscaldamento
  // del numero, quindi il valore va letto, non dato per scontato. Le risposte in
  // una conversazione aperta passano comunque; questo limita le campagne a freddo.
  const capacitaOggi = useMemo(() => {
    const nums = numbersQuery.data ?? [];
    if (!nums.length) return null;
    const oggi = new Date().toLocaleDateString("en-CA", { timeZone: "Europe/Rome" });
    return nums
      .filter((n) => n.stato === "connected")
      .reduce((tot, n) => {
        const usati = n.daily_sent_date === oggi ? (n.daily_sent ?? 0) : 0;
        return tot + Math.max(0, (n.daily_cap ?? 0) - usati);
      }, 0);
  }, [numbersQuery.data]);

  // Apri un thread = segna letti i suoi messaggi in arrivo.
  const openThread = (chatId: string) => {
    setSelectedChat(chatId);
    void (async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (supabase as any)
        .from("openwa_messages")
        .update({ read_at: new Date().toISOString() })
        .eq("wa_chat_id", chatId)
        .eq("direction", "inbound")
        .is("read_at", null);
      queryClient.invalidateQueries({ queryKey: ["openwa", "messages"] });
    })();
  };

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [active?.messages.length, selectedChat]);

  // Allega e invia un file (immagine → send-image, altro → send-document).
  async function handleAttachFile(file: File) {
    if (!active || uploadingMedia) return;
    setUploadingMedia(true);
    try {
      const ext = file.name.split(".").pop()?.toLowerCase() || "bin";
      const path = `outbound/${crypto.randomUUID()}.${ext}`;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error: upErr } = await (supabase as any).storage.from("openwa-media").upload(path, file, { contentType: file.type, upsert: true });
      if (upErr) throw new Error(upErr.message);
      const { error } = await supabase.functions.invoke("openwa-gateway", {
        body: {
          action: "send_media",
          to: active.phone || active.chatId,
          caption: reply.trim() || undefined,
          media_path: path,
          media_kind: file.type.startsWith("image/") ? "image" : "document",
          media_filename: file.name,
          number_id: numeroAttivo && numeroAttivo.stato === "connected" ? numeroAttivo.id : undefined,
        },
      });
      if (error) throw new Error(await readInvokeError(error));
      setReply("");
      toast.success("Allegato inviato");
      queryClient.invalidateQueries({ queryKey: ["openwa", "messages"] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Errore invio allegato");
    } finally {
      setUploadingMedia(false);
    }
  }

  const sendReply = useMutation({
    mutationFn: async () => {
      if (!active) throw new Error("Nessuna conversazione selezionata");
      const { data, error } = await supabase.functions.invoke("openwa-gateway", {
        body: {
          action: "send_text",
          to: active.phone || active.chatId,
          text: reply.trim(),
          // Continuità: rispondi dallo stesso numero del thread. Ma se quel
          // numero e' caduto o bannato, forzarlo farebbe solo fallire l'invio:
          // meglio lasciar scegliere la rotazione fra i numeri connessi.
          number_id: numeroAttivo && numeroAttivo.stato === "connected" ? numeroAttivo.id : undefined,
        },
      });
      if (error) throw new Error(await readInvokeError(error));
      return data;
    },
    onSuccess: () => {
      setReply("");
      queryClient.invalidateQueries({ queryKey: ["openwa", "messages"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const sendNew = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke("openwa-gateway", {
        body: { action: "send_text", to: newPhone.trim(), text: newText.trim() },
      });
      if (error) throw new Error(await readInvokeError(error));
      return data;
    },
    onSuccess: () => {
      toast.success("Messaggio inviato");
      setNewOpen(false);
      setNewPhone("");
      setNewText("");
      queryClient.invalidateQueries({ queryKey: ["openwa", "messages"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <h1 className="flex items-center gap-2 text-2xl font-bold">
            <MessageCircle className="h-6 w-6 shrink-0" /> WhatsApp Locale
          </h1>
          <p className="text-muted-foreground">
            Conversazioni del canale non-ufficiale. Le risposte arrivano in tempo reale.
          </p>
          {threads.length > 0 && (
            <p className="mt-0.5 text-xs text-muted-foreground">
              {threads.length} {threads.length === 1 ? "conversazione" : "conversazioni"}
              {totNonLetti > 0 && <> · <span className="font-medium text-emerald-700 dark:text-emerald-400">{totNonLetti} da leggere</span></>}
              {capacitaOggi !== null && <> · {capacitaOggi} {capacitaOggi === 1 ? "invio" : "invii"} disponibili oggi</>}
            </p>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-2 self-start sm:self-auto">
          {/* Le risposte a freddo valgono finché sono calde: qui si attiva
              l'avviso sul telefono, una volta per dispositivo. */}
          {pushSupportato && (
            <Button
              variant={pushAttivo ? "outline" : "secondary"}
              disabled={pushInCorso}
              onClick={() => (pushAttivo ? disattivaPush() : attivaPush())}
              title={pushAttivo
                ? "Non ricevere più l'avviso su questo dispositivo"
                : "Ricevi un avviso sul telefono quando qualcuno risponde"}
            >
              {pushAttivo
                ? <><BellOff className="mr-2 h-4 w-4" /> Avvisi attivi</>
                : <><Bell className="mr-2 h-4 w-4" /> Avvisami</>}
            </Button>
          )}
          <Button onClick={() => setNewOpen(true)}>
            <Plus className="mr-2 h-4 w-4" /> Nuovo messaggio
          </Button>
        </div>
      </div>

      {/* Un numero bannato o caduto fa fallire le risposte: va detto PRIMA
          che l'operatore scriva, non con un errore dopo l'invio. */}
      {numeriInProblema.length > 0 && (
        <Card className="border-amber-300 bg-amber-50 p-3 dark:border-amber-900 dark:bg-amber-950/40">
          <div className="flex flex-wrap items-center gap-2 text-sm">
            {numeriInProblema.some((n) => n.stato === "banned")
              ? <Ban className="h-4 w-4 shrink-0 text-red-600" />
              : <WifiOff className="h-4 w-4 shrink-0 text-amber-600" />}
            <span>
              {numeriInProblema.map((n) => (
                <span key={n.id} className="mr-2">
                  <strong>{n.display_name || n.numero}</strong>{" "}
                  {n.stato === "banned" ? "è stato bannato da WhatsApp." : "è disconnesso."}
                </span>
              ))}
            </span>
            <Link to="/admin/impostazioni/whatsapp-locale" className="font-medium underline underline-offset-2">
              Vai ai numeri
            </Link>
          </div>
        </Card>
      )}

      <div className="grid grid-cols-1 gap-4 md:grid-cols-[320px_1fr]">
        {/* Lista thread */}
        <Card className="flex h-[70vh] flex-col overflow-hidden">
          <div className="flex items-center gap-2 border-b p-2">
            <div className="relative flex-1">
              <Search className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={filtro}
                onChange={(e) => setFiltro(e.target.value)}
                placeholder="Cerca nome, numero o testo…"
                className="h-8 pl-7 text-sm"
                aria-label="Cerca fra le conversazioni"
              />
            </div>
            <Button
              size="sm"
              variant={soloNonLetti ? "default" : "outline"}
              className="h-8 shrink-0 px-2 text-xs"
              onClick={() => setSoloNonLetti((v) => !v)}
              aria-pressed={soloNonLetti}
              title="Mostra solo le conversazioni con messaggi da leggere"
            >
              Da leggere{totNonLetti > 0 && ` (${totNonLetti})`}
            </Button>
          </div>
          <div className="flex-1 overflow-y-auto">
          {messagesQuery.isLoading ? (
            <div className="space-y-2 p-3">
              <Skeleton className="h-14 w-full" />
              <Skeleton className="h-14 w-full" />
            </div>
          ) : threads.length === 0 ? (
            <div className="p-6 text-center text-sm text-muted-foreground">
              Nessuna conversazione. Invia un messaggio o attendi una risposta.
            </div>
          ) : threadsVisibili.length === 0 ? (
            <div className="p-6 text-center text-sm text-muted-foreground">
              {soloNonLetti && !filtro.trim()
                ? "Nessun messaggio da leggere."
                : "Nessuna conversazione corrisponde alla ricerca."}
            </div>
          ) : (
            <ul className="divide-y">
              {threadsVisibili.map((t) => (
                <li key={t.chatId}>
                  <button
                    type="button"
                    onClick={() => openThread(t.chatId)}
                    className={cn(
                      "flex w-full items-start gap-2.5 border-l-2 px-3 py-2.5 text-left transition-colors hover:bg-muted/60",
                      selectedChat === t.chatId ? "border-l-emerald-500 bg-muted" : "border-l-transparent",
                    )}
                  >
                    <span
                      aria-hidden
                      className={cn(
                        "mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-xs font-semibold",
                        tintaAvatar(t.phone ?? t.chatId),
                      )}
                    >
                      {iniziali(t.name)}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="flex w-full items-center justify-between gap-2">
                        <span className={cn("truncate", t.unread > 0 ? "font-semibold" : "font-medium")}>{t.name}</span>
                        <span className={cn("shrink-0 text-[11px]", t.unread > 0 ? "font-semibold text-emerald-600" : "text-muted-foreground")}>{fmtTime(t.lastAt)}</span>
                      </span>
                      {/* Il numero resta sempre visibile: e' il dato con cui si
                          riconosce davvero chi scrive, il nome WhatsApp lo sceglie
                          il mittente e puo' essere qualsiasi cosa. */}
                      {t.phone && t.phone !== t.name && (
                        <span className="block truncate font-mono text-[11px] text-muted-foreground">{t.phone}</span>
                      )}
                      <span className="flex w-full items-center justify-between gap-2">
                        <span className={cn("line-clamp-1 text-xs", t.unread > 0 ? "font-medium text-foreground" : "text-muted-foreground")}>{t.lastBody}</span>
                        {t.unread > 0 && (
                          <Badge className="shrink-0 bg-emerald-600 hover:bg-emerald-600">{t.unread}</Badge>
                        )}
                      </span>
                      {piuNumeri && t.numberId && numeriById.get(t.numberId) && (
                        <span className="mt-0.5 block truncate text-[10px] text-muted-foreground">
                          via {numeriById.get(t.numberId)!.display_name || numeriById.get(t.numberId)!.numero}
                        </span>
                      )}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
          </div>
        </Card>

        {/* Thread attivo */}
        <Card className="flex h-[70vh] flex-col">
          {!active ? (
            <div className="flex flex-1 flex-col items-center justify-center gap-2 text-muted-foreground">
              <MessageCircle className="h-10 w-10 opacity-30" />
              <p className="text-sm">Seleziona una conversazione</p>
              <p className="text-xs opacity-70">oppure inizia con "Nuovo messaggio"</p>
            </div>
          ) : (
            <>
              <div className="space-y-2 border-b p-3">
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                  <Smartphone className="h-4 w-4 shrink-0 text-muted-foreground" />
                  <span className="font-medium">{active.name}</span>
                  {active.phone && (
                    <a
                      href={`tel:${active.phone}`}
                      className="font-mono text-sm text-muted-foreground underline-offset-2 hover:underline"
                      title="Chiama questo numero"
                    >
                      {active.phone}
                    </a>
                  )}
                  {numeroAttivo && (
                    <Badge variant="outline" className="ml-auto text-[10px]">
                      dal nostro {numeroAttivo.display_name || numeroAttivo.numero}
                    </Badge>
                  )}
                </div>
                <IdentitaThread
                  chatId={active.chatId}
                  phone={active.phone}
                  contactId={active.contactId}
                  nomeVisualizzato={active.name}
                  onCambiato={() => queryClient.invalidateQueries({ queryKey: ["openwa", "messages"] })}
                />
              </div>
              <div ref={scrollRef} className="flex-1 space-y-1.5 overflow-y-auto bg-slate-50 p-4 dark:bg-slate-950/40">
                {active.messages.map((m, i) => {
                  const prev = active.messages[i - 1];
                  const nuovoGiorno = !prev || new Date(prev.created_at).toDateString() !== new Date(m.created_at).toDateString();
                  const stessoBlocco = !nuovoGiorno && prev?.direction === m.direction;
                  return (
                  <div key={m.id}>
                    {nuovoGiorno && (
                      <div className="my-3 flex justify-center">
                        <span className="rounded-full bg-background px-3 py-1 text-[11px] font-medium text-muted-foreground shadow-sm">
                          {etichettaGiorno(m.created_at)}
                        </span>
                      </div>
                    )}
                  <div
                    className={cn("flex", m.direction === "outbound" ? "justify-end" : "justify-start", stessoBlocco && "mt-0.5")}
                  >
                    <div
                      className={cn(
                        "max-w-[75%] rounded-2xl px-3 py-2 text-sm shadow-sm",
                        m.direction === "outbound"
                          ? "rounded-br-md bg-emerald-600 text-white"
                          : "rounded-bl-md border bg-background text-foreground",
                      )}
                    >
                      {m.body && <p className="whitespace-pre-wrap break-words">{m.body}</p>}
                      {m.media_url && <MediaAttachment path={m.media_url} />}
                      <div className={cn(
                        "mt-1 text-[10px]",
                        m.direction === "outbound" ? "text-emerald-100" : "text-muted-foreground",
                      )}>
                        {fmtOra(m.created_at)}
                        {m.direction === "outbound" && (
                          m.status === "failed" ? (
                            <span className="ml-1 inline-flex items-center gap-0.5 font-medium" title={m.error ?? "Invio non riuscito"}>
                              <AlertCircle className="h-3 w-3" /> non inviato
                            </span>
                          ) : m.status === "read" ? (
                            <CheckCheck className="ml-1 inline h-3 w-3" aria-label="letto" />
                          ) : m.status === "delivered" ? (
                            <CheckCheck className="ml-1 inline h-3 w-3 opacity-70" aria-label="consegnato" />
                          ) : (
                            <Check className="ml-1 inline h-3 w-3 opacity-70" aria-label="inviato" />
                          )
                        )}
                      </div>
                    </div>
                  </div>
                  </div>
                  );
                })}
              </div>
              {numeroAttivo && numeroAttivo.stato !== "connected" && (
                <div className="border-t bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:bg-amber-950/40 dark:text-amber-300">
                  {numeroAttivo.stato === "banned"
                    ? <>Il numero di questa conversazione ({numeroAttivo.display_name || numeroAttivo.numero}) è stato <strong>bannato</strong>: la risposta partirà da un altro numero connesso, se disponibile.</>
                    : <>Il numero di questa conversazione ({numeroAttivo.display_name || numeroAttivo.numero}) è <strong>disconnesso</strong>: la risposta partirà da un altro numero connesso, se disponibile.</>}
                </div>
              )}
              <div className="flex items-end gap-2 border-t p-3">
                <input
                  ref={attachRef}
                  type="file"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) void handleAttachFile(f);
                    e.target.value = "";
                  }}
                />
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-10 w-10 shrink-0 rounded-full text-muted-foreground"
                  onClick={() => attachRef.current?.click()}
                  disabled={uploadingMedia}
                  title="Allega file"
                >
                  {uploadingMedia ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Paperclip className="h-5 w-5" />}
                </Button>
                <Textarea
                  placeholder="Scrivi una risposta…"
                  value={reply}
                  onChange={(e) => setReply(e.target.value)}
                  rows={1}
                  className="max-h-32 min-h-10 flex-1 resize-none rounded-3xl bg-muted/60 px-4 py-2.5"
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      if (reply.trim() && !sendReply.isPending) sendReply.mutate();
                    }
                  }}
                />
                <Button
                  size="icon"
                  className="h-10 w-10 shrink-0 rounded-full bg-emerald-600 hover:bg-emerald-700"
                  onClick={() => sendReply.mutate()}
                  disabled={!reply.trim() || sendReply.isPending}
                  title="Invia (Invio)"
                >
                  {sendReply.isPending ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                </Button>
              </div>
            </>
          )}
        </Card>
      </div>

      {/* Nuovo messaggio */}
      <Dialog open={newOpen} onOpenChange={setNewOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Nuovo messaggio WhatsApp</DialogTitle>
            <DialogDescription>
              Il numero mittente viene scelto automaticamente in base a tag e capacità giornaliera.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <label className="text-sm font-medium" htmlFor="new-phone">Numero destinatario</label>
              <Input
                id="new-phone"
                placeholder="+39 333 1234567"
                value={newPhone}
                onChange={(e) => setNewPhone(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium" htmlFor="new-text">Messaggio</label>
              <Textarea
                id="new-text"
                rows={4}
                value={newText}
                onChange={(e) => setNewText(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              onClick={() => sendNew.mutate()}
              disabled={!newPhone.trim() || !newText.trim() || sendNew.isPending}
            >
              <Send className="mr-2 h-4 w-4" />
              {sendNew.isPending ? "Invio…" : "Invia"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
