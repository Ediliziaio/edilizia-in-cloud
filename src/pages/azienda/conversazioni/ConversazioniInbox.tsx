import { useEffect, useMemo, useRef, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import {
  useConversazioniList,
  useConversazioneTimeline,
  type CanaleConversazione,
  type ConversazioneListItem,
} from "@/hooks/useConversazioni";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import {
  Mail, MessageSquare, MessageCircle, StickyNote, Search, Inbox,
  AlertCircle, ChevronLeft, User, Briefcase,
} from "lucide-react";
import ConversazioneComposer from "./ConversazioneComposer";
import ContactDetailPanel from "./ContactDetailPanel";

const CANALE_META: Record<CanaleConversazione, { label: string; Icon: typeof Mail; dot: string }> = {
  email:    { label: "Email",    Icon: Mail,          dot: "bg-blue-500" },
  sms:      { label: "SMS",      Icon: MessageSquare, dot: "bg-violet-500" },
  whatsapp: { label: "WhatsApp", Icon: MessageCircle, dot: "bg-green-500" },
  nota:     { label: "Nota",     Icon: StickyNote,    dot: "bg-amber-500" },
};

const keyOf = (c: ConversazioneListItem) => `${c.entita_tipo}:${c.entita_id}`;

function iniziali(nome: string | null, email: string | null): string {
  const base = (nome || email || "?").trim();
  const parts = base.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return base.slice(0, 2).toUpperCase();
}

function formatOra(ts: string | null): string {
  if (!ts) return "";
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return "";
  return new Intl.DateTimeFormat("it-IT", {
    day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit",
  }).format(d);
}

interface Props {
  companyIdOverride?: string;
}

export default function ConversazioniInbox({ companyIdOverride }: Props = {}) {
  const { profile, effectiveCompany } = useAuth();
  const companyId = companyIdOverride ?? effectiveCompany?.id ?? profile?.company_id ?? null;

  const [search, setSearch] = useState("");
  const [selectedKey, setSelectedKey] = useState<string | null>(null);

  const { data: lista = [], isLoading, isError } = useConversazioniList(companyId);

  const selectedItem = useMemo(
    () => lista.find((c) => keyOf(c) === selectedKey) ?? null,
    [lista, selectedKey],
  );

  const { data: timeline = [], isLoading: timelineLoading } = useConversazioneTimeline(
    selectedItem?.entita_tipo ?? null,
    selectedItem?.entita_id ?? null,
  );

  // Auto-scroll all'ultimo messaggio quando si apre una conversazione o ne arriva
  // uno nuovo (timeline ordinata ASC → il più recente è in fondo). Solo scroll, no
  // setState → nessun re-render / lint set-state-in-effect.
  const bottomRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: "end" });
  }, [timeline, selectedKey]);

  const filtrate = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return lista;
    return lista.filter((c) =>
      (c.nome || "").toLowerCase().includes(q) ||
      (c.email || "").toLowerCase().includes(q) ||
      (c.telefono || "").toLowerCase().includes(q),
    );
  }, [lista, search]);

  return (
    <div className="h-full flex overflow-hidden rounded-xl border bg-card">
      {/* ═══ Sidebar lista ═══ */}
      <aside className={cn(
        "w-full md:w-[340px] md:min-w-[300px] border-r flex flex-col bg-background",
        selectedItem ? "hidden md:flex" : "flex",
      )}>
        <div className="p-3 border-b">
          <h2 className="text-sm font-semibold mb-2 flex items-center gap-2">
            <Inbox className="h-4 w-4" /> Conversazioni
          </h2>
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Cerca contatto o cliente…" aria-label="Cerca conversazione" className="pl-8 h-9" />
          </div>
        </div>

        <ScrollArea className="flex-1">
          {isLoading ? (
            <div className="p-2 space-y-2">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="flex gap-3 p-2">
                  <Skeleton className="h-10 w-10 rounded-full" />
                  <div className="flex-1 space-y-2"><Skeleton className="h-3 w-2/3" /><Skeleton className="h-3 w-1/2" /></div>
                </div>
              ))}
            </div>
          ) : isError ? (
            <div className="p-6 text-center text-sm text-muted-foreground">
              <AlertCircle className="h-5 w-5 mx-auto mb-2 text-amber-500" />
              Inbox non ancora attivo.
              <p className="text-xs mt-1">Applica la migration <code className="text-[11px]">conversazioni</code> per abilitare l'aggregatore.</p>
            </div>
          ) : filtrate.length === 0 ? (
            <div className="p-6 text-center text-sm text-muted-foreground">
              <Inbox className="h-5 w-5 mx-auto mb-2 opacity-50" />
              Nessuna conversazione{search ? " trovata" : ""}.
            </div>
          ) : (
            <ul className="divide-y">
              {filtrate.map((c) => {
                const meta = c.ultimo_canale ? CANALE_META[c.ultimo_canale] : null;
                const attivo = keyOf(c) === selectedKey;
                const isCliente = c.entita_tipo === "cliente";
                return (
                  <li key={keyOf(c)}>
                    <button
                      onClick={() => setSelectedKey(keyOf(c))}
                      className={cn(
                        "w-full text-left px-3 py-2.5 flex gap-3 hover:bg-muted/60 transition-colors",
                        attivo && "bg-muted",
                      )}
                    >
                      <div className="relative shrink-0">
                        <Avatar className="h-10 w-10">
                          <AvatarFallback className={cn("text-xs", isCliente ? "bg-indigo-100 text-indigo-700" : "bg-primary/10 text-primary")}>
                            {iniziali(c.nome, c.email)}
                          </AvatarFallback>
                        </Avatar>
                        {meta && (
                          <span className={cn("absolute -bottom-0.5 -right-0.5 h-4 w-4 rounded-full ring-2 ring-background flex items-center justify-center", meta.dot)}>
                            <meta.Icon className="h-2.5 w-2.5 text-white" />
                          </span>
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-medium text-sm truncate flex items-center gap-1.5">
                            {isCliente ? <Briefcase className="h-3 w-3 text-indigo-500 shrink-0" /> : <User className="h-3 w-3 text-muted-foreground shrink-0" />}
                            {c.nome || c.email || c.telefono || "Senza nome"}
                          </span>
                          <span className="text-[10px] text-muted-foreground shrink-0">{formatOra(c.ultimo_ts)}</span>
                        </div>
                        <div className="flex items-center justify-between gap-2 mt-0.5">
                          <span className="text-xs text-muted-foreground truncate">
                            {c.ultimo_direzione === "out" ? "Tu: " : ""}{c.anteprima || "—"}
                          </span>
                          {c.non_letti > 0 && (
                            <Badge className="h-5 min-w-5 px-1.5 rounded-full text-[10px] shrink-0">{c.non_letti}</Badge>
                          )}
                        </div>
                      </div>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </ScrollArea>
      </aside>

      {/* ═══ Thread ═══ */}
      <section className={cn("flex-1 min-w-0 flex flex-col bg-muted/20", selectedItem ? "flex" : "hidden md:flex")}>
        {!selectedItem ? (
          <div className="flex-1 flex items-center justify-center text-center text-muted-foreground p-8">
            <div>
              <MessageCircle className="h-10 w-10 mx-auto mb-3 opacity-30" />
              <p className="text-sm">Seleziona una conversazione per vedere tutti i messaggi<br />(email, SMS, WhatsApp) con quel contatto o cliente.</p>
            </div>
          </div>
        ) : (
          <>
            <header className="h-14 px-3 sm:px-4 border-b flex items-center gap-3 bg-background shrink-0">
              <Button variant="ghost" size="icon" className="md:hidden -ml-1" aria-label="Torna alla lista" onClick={() => setSelectedKey(null)}>
                <ChevronLeft className="h-5 w-5" />
              </Button>
              <Avatar className="h-9 w-9">
                <AvatarFallback className={cn("text-xs", selectedItem.entita_tipo === "cliente" ? "bg-indigo-100 text-indigo-700" : "bg-primary/10 text-primary")}>
                  {iniziali(selectedItem.nome, selectedItem.email)}
                </AvatarFallback>
              </Avatar>
              <div className="min-w-0 flex-1">
                <div className="font-semibold text-sm truncate flex items-center gap-2">
                  {selectedItem.nome || selectedItem.email || "Senza nome"}
                  <Badge variant="secondary" className="gap-1 shrink-0">
                    {selectedItem.entita_tipo === "cliente" ? <Briefcase className="h-3 w-3" /> : <User className="h-3 w-3" />}
                    {selectedItem.entita_tipo === "cliente" ? "Cliente" : "Contatto"}
                  </Badge>
                </div>
                <div className="text-xs text-muted-foreground truncate flex items-center gap-3">
                  {selectedItem.email && <span className="inline-flex items-center gap-1"><Mail className="h-3 w-3" />{selectedItem.email}</span>}
                  {selectedItem.telefono && <span className="inline-flex items-center gap-1"><MessageSquare className="h-3 w-3" />{selectedItem.telefono}</span>}
                </div>
              </div>
            </header>

            <ScrollArea className="flex-1 px-3 sm:px-4 py-4">
              {timelineLoading ? (
                <div className="space-y-3 max-w-3xl mx-auto">
                  {Array.from({ length: 5 }).map((_, i) => (
                    <Skeleton key={i} className={cn("h-14 rounded-2xl w-2/3", i % 2 ? "ml-auto" : "")} />
                  ))}
                </div>
              ) : timeline.length === 0 ? (
                <div className="text-center text-sm text-muted-foreground py-10">Nessun messaggio in questa conversazione.</div>
              ) : (
                <div className="space-y-3 max-w-3xl mx-auto">
                  {timeline.map((m, i) => {
                    const meta = CANALE_META[m.canale];
                    const out = m.direzione === "out";
                    return (
                      <div key={`${m.ref_id}-${i}`} className={cn("flex", out ? "justify-end" : "justify-start")}>
                        <div className={cn("max-w-[80%] rounded-2xl px-3.5 py-2 shadow-sm border", out ? "bg-primary text-primary-foreground border-primary/20" : "bg-background")}>
                          <div className={cn("flex items-center gap-1.5 mb-1 text-[10px] font-medium uppercase tracking-wide", out ? "text-primary-foreground/70" : "text-muted-foreground")}>
                            <meta.Icon className="h-3 w-3" />{meta.label}
                            {m.oggetto && <span className="normal-case font-normal truncate max-w-[200px]">· {m.oggetto}</span>}
                          </div>
                          <p className="text-sm whitespace-pre-wrap break-words">{m.testo || (m.media_url ? "[allegato]" : "—")}</p>
                          <div className={cn("text-[10px] mt-1 text-right", out ? "text-primary-foreground/60" : "text-muted-foreground")}>{formatOra(m.ts)}</div>
                        </div>
                      </div>
                    );
                  })}
                  <div ref={bottomRef} aria-hidden="true" />
                </div>
              )}
            </ScrollArea>

            <ConversazioneComposer
              entitaTipo={selectedItem.entita_tipo}
              entitaId={selectedItem.entita_id}
              email={selectedItem.email}
              telefono={selectedItem.telefono}
            />
          </>
        )}
      </section>

      {/* ═══ Pannello laterale scheda (GHL-style) ═══ */}
      {selectedItem && (
        <ContactDetailPanel entitaTipo={selectedItem.entita_tipo} entitaId={selectedItem.entita_id} />
      )}
    </div>
  );
}
