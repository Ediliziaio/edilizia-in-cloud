import { useEffect, useMemo, useRef, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useQueryClient } from "@tanstack/react-query";
import {
  useConversazioniList,
  useConversazioneTimeline,
  useConversazioneOverlay,
  useConversazioniCerca,
  useAssistenteConversazione,
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
  Mail, MessageSquare, MessageCircle, StickyNote, Search, Inbox, Instagram, Facebook,
  AlertCircle, ChevronLeft, User, Briefcase, RefreshCw, UserCheck, CheckCircle2, RotateCcw, Info,
  Bot, PauseCircle,
} from "lucide-react";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { VisuallyHidden } from "@radix-ui/react-visually-hidden";
import ConversazioneComposer from "./ConversazioneComposer";
import ContactDetailPanel from "./ContactDetailPanel";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

const CANALE_META: Record<CanaleConversazione, { label: string; Icon: typeof Mail; dot: string }> = {
  email:    { label: "Email",    Icon: Mail,          dot: "bg-blue-500" },
  sms:      { label: "SMS",      Icon: MessageSquare, dot: "bg-violet-500" },
  whatsapp: { label: "WhatsApp", Icon: MessageCircle, dot: "bg-green-500" },
  nota:     { label: "Nota",     Icon: StickyNote,    dot: "bg-amber-500" },
  instagram: { label: "Instagram", Icon: Instagram,   dot: "bg-pink-500" },
  messenger: { label: "Messenger", Icon: Facebook,    dot: "bg-blue-600" },
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
  const { profile, effectiveCompany, user } = useAuth();
  const companyId = companyIdOverride ?? effectiveCompany?.id ?? profile?.company_id ?? null;

  const [search, setSearch] = useState("");
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [statoFilter, setStatoFilter] = useState<"tutte" | "non_lette" | "mie" | "chiuse">("tutte");
  const [canaleFilter, setCanaleFilter] = useState<CanaleConversazione | "tutti">("tutti");
  const [shownCount, setShownCount] = useState(30);
  // Scheda contatto/cliente in Sheet sotto xl (il pannello laterale fisso esiste solo da xl in su)
  const [schedaOpen, setSchedaOpen] = useState(false);

  const qc = useQueryClient();
  const { data: lista = [], isLoading, isError, isFetching } = useConversazioniList(companyId);
  const overlay = useConversazioneOverlay(companyId);
  // Ricerca full-content (degrada a client-side se l'RPC non è ancora deployata).
  const contentSearch = useConversazioniCerca(companyId, search);

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

  // Realtime: aggiornamento istantaneo dell'inbox.
  //  • `conversazioni` (già nella publication): cambi stato/assegnazione/letto fatti
  //    da ALTRI operatori → inbox condiviso sempre allineato.
  //  • `messaging_messages` (nuovi WhatsApp): se la tabella non è ancora nella
  //    publication, nessun evento → fallback trasparente sul polling 25s + focus.
  // Invalido a prefisso la timeline (solo quella attiva refetcha) → niente
  // re-subscribe a ogni cambio conversazione.
  useEffect(() => {
    if (!companyId) return;
    const invalidate = () => {
      qc.invalidateQueries({ queryKey: ["conversazioni-lista", companyId] });
      qc.invalidateQueries({ queryKey: ["conversazione-timeline"] });
    };
    const channel = supabase
      .channel(`conversazioni-inbox-${companyId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "conversazioni", filter: `company_id=eq.${companyId}` },
        invalidate,
      )
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "messaging_messages" },
        invalidate,
      )
      // WhatsApp dei numeri collegati a Meta: messaggi nuovi nei due sensi ed
      // esito della consegna (whatsapp_messages è nel realtime dal 24/09/2026).
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "whatsapp_messages", filter: `company_id=eq.${companyId}` },
        invalidate,
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [companyId, qc]);

  const filtrate = useMemo(() => {
    const q = search.trim().toLowerCase();
    return lista.filter((c) => {
      if (statoFilter === "non_lette" && c.non_letti <= 0) return false;
      if (statoFilter === "mie" && c.assegnato_a !== user?.id) return false;
      if (statoFilter === "chiuse" && c.stato !== "chiusa") return false;
      // Le conversazioni chiuse compaiono solo nel filtro dedicato (archivio).
      if (statoFilter !== "chiuse" && c.stato === "chiusa") return false;
      if (canaleFilter !== "tutti" && c.ultimo_canale !== canaleFilter) return false;
      if (q) {
        const clientMatch =
          (c.nome || "").toLowerCase().includes(q) ||
          (c.email || "").toLowerCase().includes(q) ||
          (c.telefono || "").toLowerCase().includes(q) ||
          (c.anteprima || "").toLowerCase().includes(q);
        // Se la ricerca full-content è disponibile, includi anche le entità con un
        // messaggio che combacia nel TESTO (non solo nell'anteprima).
        const contentMatch =
          !!contentSearch.data?.available && contentSearch.data.keys.has(keyOf(c));
        if (!clientMatch && !contentMatch) return false;
      }
      return true;
    });
  }, [lista, search, statoFilter, canaleFilter, user?.id, contentSearch.data]);

  const nonLetteTot = useMemo(
    () => lista.reduce((n, c) => n + (c.stato !== "chiusa" && c.non_letti > 0 ? 1 : 0), 0),
    [lista],
  );

  // Apre una conversazione e la segna come letta (scrive last_read_at sull'overlay
  // → il badge non-letti si azzera davvero; prima restava sempre acceso).
  const handleSelect = (c: ConversazioneListItem) => {
    setSelectedKey(keyOf(c));
    setShownCount(30);
    if (c.non_letti > 0) {
      overlay.mutate({
        entitaTipo: c.entita_tipo,
        entitaId: c.entita_id,
        patch: { last_read_at: new Date().toISOString() },
      });
    }
  };

  const aggiornaStato = (stato: "aperta" | "chiusa") => {
    if (!selectedItem) return;
    overlay.mutate(
      { entitaTipo: selectedItem.entita_tipo, entitaId: selectedItem.entita_id, patch: { stato } },
      { onSuccess: () => toast.success(stato === "chiusa" ? "Conversazione chiusa" : "Conversazione riaperta") },
    );
  };

  // L'agente WhatsApp (25/09/2026): chi prende la chat lo mette in pausa, e
  // l'agente smette di rispondere a quel contatto finché qualcuno non lo riattiva.
  const assistente = useAssistenteConversazione(
    companyId,
    selectedItem?.entita_tipo ?? null,
    selectedItem?.entita_id ?? null,
  );
  const cambiaPausaAssistente = () => {
    if (!selectedItem || !assistente.data) return;
    const pausa = !assistente.data.inPausa;
    overlay.mutate(
      {
        entitaTipo: selectedItem.entita_tipo,
        entitaId: selectedItem.entita_id,
        patch: {
          bot_in_pausa: pausa,
          bot_in_pausa_motivo: pausa ? "Presa in carico da una persona" : null,
          bot_in_pausa_il: pausa ? new Date().toISOString() : null,
        },
      },
      { onSuccess: () => toast.success(pausa ? "Assistente in pausa: la conversazione la segui tu" : "Assistente riattivato") },
    );
  };

  const assegnaAMe = () => {
    if (!selectedItem || !user?.id) return;
    const mine = selectedItem.assegnato_a === user.id;
    overlay.mutate(
      {
        entitaTipo: selectedItem.entita_tipo,
        entitaId: selectedItem.entita_id,
        patch: { assegnato_a: mine ? null : user.id },
      },
      { onSuccess: () => toast.success(mine ? "Assegnazione rimossa" : "Assegnata a te") },
    );
  };

  return (
    <div className="h-full flex overflow-hidden rounded-xl border bg-card">
      {/* ═══ Sidebar lista ═══ */}
      <aside className={cn(
        "w-full md:w-[340px] md:min-w-[300px] min-h-0 border-r flex flex-col bg-background",
        selectedItem ? "hidden md:flex" : "flex",
      )}>
        <div className="p-3 border-b">
          <div className="flex items-center justify-between mb-2">
            <h2 className="text-sm font-semibold flex items-center gap-2">
              <Inbox className="h-4 w-4" /> Conversazioni
            </h2>
            <Button
              variant="ghost" size="icon" className="h-7 w-7"
              aria-label="Aggiorna conversazioni"
              disabled={isFetching}
              onClick={() => {
                qc.invalidateQueries({ queryKey: ["conversazioni-lista", companyId] });
                if (selectedItem) qc.invalidateQueries({ queryKey: ["conversazione-timeline", selectedItem.entita_tipo, selectedItem.entita_id] });
              }}
            >
              <RefreshCw className={cn("h-3.5 w-3.5", isFetching && "animate-spin")} />
            </Button>
          </div>
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Cerca contatto o cliente…" aria-label="Cerca conversazione" className="pl-8 h-9" />
          </div>
          {/* Filtri stato (triage GHL-style) */}
          <div className="mt-2 flex items-center gap-1 flex-wrap">
            {([
              { k: "tutte", label: "Tutte" },
              { k: "non_lette", label: "Non lette" },
              { k: "mie", label: "Mie" },
              { k: "chiuse", label: "Chiuse" },
            ] as const).map((f) => (
              <button
                key={f.k}
                type="button"
                onClick={() => setStatoFilter(f.k)}
                className={cn(
                  "rounded-full px-2.5 py-0.5 text-[11px] font-medium transition-colors",
                  statoFilter === f.k ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:bg-muted/70",
                )}
              >
                {f.label}
                {f.k === "non_lette" && nonLetteTot > 0 && (
                  <span className="ml-1 rounded-full bg-background/20 px-1 tabular-nums">{nonLetteTot}</span>
                )}
              </button>
            ))}
          </div>
          {/* Filtri canale */}
          <div className="mt-1.5 flex items-center gap-1">
            <button
              type="button"
              onClick={() => setCanaleFilter("tutti")}
              className={cn("rounded-full px-2 py-0.5 text-[11px]", canaleFilter === "tutti" ? "bg-foreground/10 font-medium" : "text-muted-foreground hover:bg-muted")}
            >
              Tutti
            </button>
            {(Object.keys(CANALE_META) as CanaleConversazione[]).map((ch) => {
              const M = CANALE_META[ch];
              const active = canaleFilter === ch;
              return (
                <button
                  key={ch}
                  type="button"
                  aria-label={`Filtra ${M.label}`}
                  title={M.label}
                  onClick={() => setCanaleFilter(active ? "tutti" : ch)}
                  className={cn("rounded-full p-1 transition-colors", active ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted")}
                >
                  <M.Icon className="h-3.5 w-3.5" />
                </button>
              );
            })}
          </div>
        </div>

        <ScrollArea className="flex-1 min-h-0">
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
              Non riesco a caricare le conversazioni.
              <p className="text-xs mt-1">Riprova tra qualche secondo. Se il problema persiste, contatta l'assistenza.</p>
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
                      onClick={() => handleSelect(c)}
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
      {/* key per conversazione + slide-in su mobile: il passaggio lista→thread non è più uno scatto secco */}
      <section
        key={selectedKey ?? "vuota"}
        className={cn(
          "flex-1 min-w-0 min-h-0 flex flex-col bg-muted/20",
          selectedItem ? "flex max-md:animate-in max-md:slide-in-from-right-4 max-md:fade-in-0 max-md:duration-200" : "hidden md:flex",
        )}
      >
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
              {/* Azioni GHL: scheda (sotto xl) / assegna a me / chiudi-riapri */}
              <div className="flex items-center gap-1 shrink-0">
                <Button
                  variant="ghost" size="icon" className="h-8 w-8 xl:hidden"
                  aria-label="Apri scheda contatto"
                  onClick={() => setSchedaOpen(true)}
                >
                  <Info className="h-4 w-4" />
                </Button>
                {selectedItem.entita_tipo === "contatto" && assistente.data?.haAgente && (
                  <Button
                    variant={assistente.data.inPausa ? "secondary" : "ghost"}
                    size="sm" className="h-8 gap-1.5 text-xs"
                    onClick={cambiaPausaAssistente} disabled={overlay.isPending}
                    title={assistente.data.inPausa
                      ? `L'assistente non risponde a questo contatto${assistente.data.motivo ? ` (${assistente.data.motivo})` : ""}. Clicca per riattivarlo.`
                      : "Metti in pausa l'assistente WhatsApp per questo contatto"}
                  >
                    {assistente.data.inPausa ? <PauseCircle className="h-3.5 w-3.5" /> : <Bot className="h-3.5 w-3.5" />}
                    <span className="hidden lg:inline">{assistente.data.inPausa ? "Assistente in pausa" : "Pausa assistente"}</span>
                  </Button>
                )}
                <Button
                  variant={selectedItem.assegnato_a === user?.id ? "secondary" : "ghost"}
                  size="sm" className="h-8 gap-1.5 text-xs"
                  onClick={assegnaAMe} disabled={overlay.isPending}
                >
                  <UserCheck className="h-3.5 w-3.5" />
                  <span className="hidden lg:inline">{selectedItem.assegnato_a === user?.id ? "Assegnata a te" : "Assegna a me"}</span>
                </Button>
                {selectedItem.stato === "chiusa" ? (
                  <Button variant="ghost" size="sm" className="h-8 gap-1.5 text-xs" onClick={() => aggiornaStato("aperta")} disabled={overlay.isPending}>
                    <RotateCcw className="h-3.5 w-3.5" /><span className="hidden lg:inline">Riapri</span>
                  </Button>
                ) : (
                  <Button variant="ghost" size="sm" className="h-8 gap-1.5 text-xs" onClick={() => aggiornaStato("chiusa")} disabled={overlay.isPending}>
                    <CheckCircle2 className="h-3.5 w-3.5" /><span className="hidden lg:inline">Chiudi</span>
                  </Button>
                )}
              </div>
            </header>

            <ScrollArea className="flex-1 min-h-0 px-3 sm:px-4 py-4">
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
                  {timeline.length > shownCount && (
                    <div className="text-center pb-1">
                      <Button
                        variant="ghost" size="sm" className="text-xs text-muted-foreground"
                        onClick={() => setShownCount((n) => n + 30)}
                      >
                        Carica precedenti ({timeline.length - shownCount})
                      </Button>
                    </div>
                  )}
                  {timeline.slice(-shownCount).map((m, i) => {
                    // Il canale non basta: "whatsapp" copre sia quello
                    // ufficiale (Meta) sia quello locale. Li distingue la
                    // tabella d'origine — e per il locale `oggetto` porta il
                    // numero da cui e' partito, che con piu' numeri collegati
                    // e' l'informazione che serve davvero.
                    const locale = m.ref_tabella === "openwa_messages";
                    const meta = CANALE_META[m.canale] ?? CANALE_META.email;
                    const etichetta = locale ? "WA Locale" : meta.label;
                    const out = m.direzione === "out";
                    return (
                      <div key={`${m.ref_id}-${i}`} className={cn("flex", out ? "justify-end" : "justify-start")}>
                        <div className={cn("max-w-[80%] rounded-2xl px-3.5 py-2 shadow-sm border", out ? "bg-primary text-primary-foreground border-primary/20" : "bg-background")}>
                          <div className={cn("flex flex-wrap items-center gap-x-1.5 mb-1 text-[10px] font-medium uppercase tracking-wide", out ? "text-primary-foreground/70" : "text-muted-foreground")}>
                            <meta.Icon className="h-3 w-3 shrink-0" />{etichetta}
                            {m.oggetto && (
                              locale ? (
                                // Nome e numero del mittente: con piu' schede
                                // collegate e' cio' che distingue chi ha scritto.
                                <span className="normal-case font-normal" title={`Inviato dal numero ${m.oggetto}`}>
                                  · da {m.oggetto}
                                </span>
                              ) : (
                                <span className="normal-case font-normal truncate max-w-[200px]">· {m.oggetto}</span>
                              )
                            )}
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
              key={keyOf(selectedItem)}
              entitaTipo={selectedItem.entita_tipo}
              entitaId={selectedItem.entita_id}
              email={selectedItem.email}
              telefono={selectedItem.telefono}
            />
          </>
        )}
      </section>

      {/* ═══ Pannello laterale scheda (GHL-style) — fisso da xl in su ═══ */}
      {selectedItem && (
        <div className="hidden min-h-0 w-72 shrink-0 border-l xl:flex xl:w-80">
          <ContactDetailPanel entitaTipo={selectedItem.entita_tipo} entitaId={selectedItem.entita_id} />
        </div>
      )}

      {/* Scheda in Sheet sotto xl (prima era irraggiungibile da mobile/tablet) */}
      {selectedItem && (
        <Sheet open={schedaOpen} onOpenChange={setSchedaOpen}>
          <SheetContent side="right" className="p-0 sm:max-w-md">
            <VisuallyHidden><SheetTitle>Scheda contatto</SheetTitle></VisuallyHidden>
            <ContactDetailPanel entitaTipo={selectedItem.entita_tipo} entitaId={selectedItem.entita_id} />
          </SheetContent>
        </Sheet>
      )}
    </div>
  );
}
