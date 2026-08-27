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
import { Send, Plus, MessageCircle, Smartphone, RefreshCw, Paperclip, UserPlus, Bell, BellOff } from "lucide-react";
import { cn } from "@/lib/utils";
import { PLATFORM_ADMIN_COMPANY_ID } from "@/lib/adminConstants";
import { usePushNotifications } from "@/hooks/usePushNotifications";

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
  created_at: string;
  read_at: string | null;
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
        .select("id, number_id, contact_id, wa_chat_id, contact_phone, contact_name, direction, body, media_url, status, created_at, read_at")
        .order("created_at", { ascending: false })
        .limit(1000);
      if (error) throw error;
      return (data ?? []) as OpenWaMessage[];
    },
    staleTime: 15_000,
  });

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

  const active = threads.find((t) => t.chatId === selectedChat) ?? null;

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

  // Crea al volo un contatto piattaforma da un numero sconosciuto e aggancia il thread.
  async function addContact(t: Thread) {
    const looksLikeNumber = /^\+?[\d\s]+$/.test((t.name || "").trim());
    const parts = (t.name || "").trim().split(/\s+/);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: created, error } = await (supabase as any)
      .from("marketing_contacts")
      .insert({
        company_id: PLATFORM_ADMIN_COMPANY_ID,
        phone: t.phone || t.chatId.replace("@c.us", ""),
        first_name: looksLikeNumber ? null : (parts[0] || null),
        last_name: looksLikeNumber ? null : (parts.slice(1).join(" ") || null),
        source: "whatsapp_locale",
      })
      .select("id")
      .single();
    if (error) { toast.error("Creazione contatto non riuscita"); return; }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (supabase as any).from("openwa_messages").update({ contact_id: created.id }).eq("wa_chat_id", t.chatId);
    toast.success("Contatto creato e agganciato");
    queryClient.invalidateQueries({ queryKey: ["openwa", "messages"] });
  }

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
          number_id: active.numberId ?? undefined,
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
          // continuità: rispondi dallo stesso numero del thread, se noto.
          number_id: active.numberId ?? undefined,
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

      <div className="grid grid-cols-1 gap-4 md:grid-cols-[320px_1fr]">
        {/* Lista thread */}
        <Card className="h-[70vh] overflow-y-auto">
          {messagesQuery.isLoading ? (
            <div className="space-y-2 p-3">
              <Skeleton className="h-14 w-full" />
              <Skeleton className="h-14 w-full" />
            </div>
          ) : threads.length === 0 ? (
            <div className="p-6 text-center text-sm text-muted-foreground">
              Nessuna conversazione. Invia un messaggio o attendi una risposta.
            </div>
          ) : (
            <ul className="divide-y">
              {threads.map((t) => (
                <li key={t.chatId}>
                  <button
                    type="button"
                    onClick={() => openThread(t.chatId)}
                    className={cn(
                      "flex w-full flex-col items-start gap-0.5 px-3 py-2.5 text-left hover:bg-muted/60",
                      selectedChat === t.chatId && "bg-muted",
                    )}
                  >
                    <div className="flex w-full items-center justify-between gap-2">
                      <span className={cn("truncate", t.unread > 0 ? "font-semibold" : "font-medium")}>{t.name}</span>
                      <span className="shrink-0 text-[11px] text-muted-foreground">{fmtTime(t.lastAt)}</span>
                    </div>
                    <div className="flex w-full items-center justify-between gap-2">
                      <span className={cn("line-clamp-1 text-xs", t.unread > 0 ? "font-medium text-foreground" : "text-muted-foreground")}>{t.lastBody}</span>
                      {t.unread > 0 && (
                        <Badge className="shrink-0 bg-emerald-600 hover:bg-emerald-600">{t.unread}</Badge>
                      )}
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </Card>

        {/* Thread attivo */}
        <Card className="flex h-[70vh] flex-col">
          {!active ? (
            <div className="flex flex-1 items-center justify-center text-sm text-muted-foreground">
              Seleziona una conversazione
            </div>
          ) : (
            <>
              <div className="flex items-center gap-2 border-b p-3">
                <Smartphone className="h-4 w-4 text-muted-foreground" />
                <span className="font-medium">{active.name}</span>
                {active.phone && <span className="text-sm text-muted-foreground">{active.phone}</span>}
                {!active.contactId && (
                  <div className="ml-auto flex items-center gap-2">
                    <Badge variant="outline">Sconosciuto</Badge>
                    <Button size="sm" variant="outline" onClick={() => addContact(active)}>
                      <UserPlus className="mr-1 h-3.5 w-3.5" /> Aggiungi ai contatti
                    </Button>
                  </div>
                )}
              </div>
              <div ref={scrollRef} className="flex-1 space-y-2 overflow-y-auto p-4">
                {active.messages.map((m) => (
                  <div
                    key={m.id}
                    className={cn("flex", m.direction === "outbound" ? "justify-end" : "justify-start")}
                  >
                    <div
                      className={cn(
                        "max-w-[75%] rounded-lg px-3 py-2 text-sm",
                        m.direction === "outbound"
                          ? "bg-emerald-600 text-white"
                          : "bg-muted text-foreground",
                      )}
                    >
                      {m.body && <p className="whitespace-pre-wrap break-words">{m.body}</p>}
                      {m.media_url && <MediaAttachment path={m.media_url} />}
                      <div className={cn(
                        "mt-1 text-[10px]",
                        m.direction === "outbound" ? "text-emerald-100" : "text-muted-foreground",
                      )}>
                        {fmtTime(m.created_at)}
                        {m.direction === "outbound" && m.status === "failed" && " · non inviato"}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
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
                  variant="outline"
                  size="icon"
                  onClick={() => attachRef.current?.click()}
                  disabled={uploadingMedia}
                  title="Allega file"
                >
                  {uploadingMedia ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Paperclip className="h-4 w-4" />}
                </Button>
                <Textarea
                  placeholder="Scrivi una risposta…"
                  value={reply}
                  onChange={(e) => setReply(e.target.value)}
                  rows={2}
                  className="resize-none"
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      if (reply.trim() && !sendReply.isPending) sendReply.mutate();
                    }
                  }}
                />
                <Button
                  onClick={() => sendReply.mutate()}
                  disabled={!reply.trim() || sendReply.isPending}
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
