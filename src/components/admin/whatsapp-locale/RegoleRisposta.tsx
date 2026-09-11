/**
 * «Quando risponde»: cosa succede quando un destinatario della campagna
 * scrive. In cima la regola di base della campagna (chi risponde esce dal
 * flusso); sotto le regole con una condizione, lette come SE / ALTRIMENTI SE:
 * decide la prima che combacia, nello stesso ordine in cui le valuta il
 * webhook (openwa-webhook, applyRules). Accanto a ogni regola, quante volte è
 * scattata: una regola che non scatta mai è scritta male.
 *
 * Le regole stanno in openwa_rules con campagna_id; quelle generali (senza
 * campagna) restano in Impostazioni → WhatsApp Locale.
 */
import { useMemo, useState, type ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { cn } from "@/lib/utils";
import {
  Plus, Pencil, Trash2, ArrowUp, ArrowDown, Reply, Hand, KanbanSquare, Tag, MessageSquareReply,
  UserCheck, Mail, Ban, X, FlaskConical, Check, Loader2, Wand2, ChevronDown,
} from "lucide-react";
import { testoCombacia, primaCheScatta } from "../../../../supabase/functions/_shared/openwa-regole";
import { useRegoleCampagna, type RegolaCampagna, type TipoConfronto } from "./useRegoleCampagna";

type Bozza = Omit<RegolaCampagna, "id" | "campagna_id" | "priority" | "created_at"> & { id?: string };

const ESITI: Record<string, string> = {
  da_ricontattare: "Da ricontattare",
  appuntamento: "Appuntamento",
  cliente: "Cliente",
  non_interessato: "Non interessato",
};

const CONDIZIONI: Array<{ v: TipoConfronto; label: string }> = [
  { v: "any", label: "Qualsiasi risposta" },
  { v: "contains", label: "Contiene" },
  { v: "equals", label: "È esattamente" },
  { v: "starts_with", label: "Inizia con" },
];

const RUOLI_STAFF = ["super_admin", "platform_manager", "platform_marketing", "platform_sales", "platform_support", "platform_implementation"];

function bozzaVuota(): Bozza {
  return {
    name: "", enabled: true, match_type: "contains", match_keywords: [],
    only_first_contact: false, only_outside_hours: false,
    reply_text: null, add_tags: [], assign_to: null, notify_email: null,
    ferma_flusso: true, imposta_esito: null, optout: false,
  };
}

interface Modello { chiave: string; nome: string; spiega: string; bozza: Partial<Bozza> }

/**
 * Regole pronte per il primo contatto a freddo. L'ordine conta (SE / ALTRIMENTI
 * SE): prima chi chiede di non essere più contattato e chi dice di no, così
 * «ok, ma non mi interessa» non finisce fra gli interessati.
 */
const MODELLI: Modello[] = [
  {
    chiave: "non_scrivere",
    nome: "Non vuole essere contattato",
    spiega: "Non riceve più nulla da nessuna campagna WhatsApp e va in «Non interessato».",
    bozza: {
      match_keywords: [
        "non scrivermi", "non scrivetemi", "non scriveteci", "non mi scriva", "non mi scrivete",
        "non contattarmi", "non contattatemi", "non mi contatti", "non mi contattate",
        "non disturbate", "non disturbarmi", "non disturbatemi",
        "cancellatemi", "cancellami", "toglietemi", "rimuovetemi", "smettetela", "basta messaggi",
      ],
      optout: true, ferma_flusso: true, imposta_esito: "non_interessato",
    },
  },
  {
    chiave: "non_interessato",
    nome: "Non interessato",
    spiega: "Esce dal flusso, va in «Non interessato» e prende l'etichetta.",
    bozza: {
      match_keywords: [
        "non mi interessa", "non ci interessa", "non interessa", "non sono interessato", "non sono interessata",
        "non siamo interessati", "no grazie", "non ho bisogno", "non abbiamo bisogno", "non mi serve",
        "non ci serve", "ho già un fornitore", "abbiamo già un fornitore", "non fa per noi",
      ],
      ferma_flusso: true, imposta_esito: "non_interessato", add_tags: ["wa-non-interessato"],
    },
  },
  {
    chiave: "chiamata",
    nome: "Vuole essere chiamato",
    spiega: "Va in «Da ricontattare» con l'etichetta: è il contatto più caldo.",
    bozza: {
      match_keywords: [
        "chiamami", "chiamatemi", "mi chiami", "mi chiamate", "richiamami", "richiamatemi", "mi richiami",
        "telefonami", "telefonatemi", "mi telefoni", "sentiamoci", "appuntamento", "il mio numero è",
      ],
      ferma_flusso: true, imposta_esito: "da_ricontattare", add_tags: ["wa-da-chiamare"],
    },
  },
  {
    chiave: "prezzi",
    nome: "Chiede prezzi",
    spiega: "Va in «Da ricontattare» con l'etichetta: vuole numeri, non altri messaggi.",
    bozza: {
      match_keywords: [
        "prezzo", "prezzi", "quanto costa", "quanto costano", "quanto viene", "quanto vengono",
        "costo", "costi", "listino", "preventivo", "preventivi", "offerta", "sconto", "scontistica",
      ],
      ferma_flusso: true, imposta_esito: "da_ricontattare", add_tags: ["wa-chiede-prezzi"],
    },
  },
  {
    chiave: "interessato",
    nome: "Interessato",
    spiega: "Va in «Da ricontattare» con l'etichetta. «Non sono interessato» non conta.",
    bozza: {
      match_keywords: [
        "interessato", "interessata", "interessati", "interessante", "mi interessa", "ci interessa",
        "volentieri", "sì grazie", "certo", "va bene", "ok", "mandami", "mandatemi", "inviami", "inviatemi",
        "informazioni", "info", "dettagli", "catalogo", "saperne di più",
      ],
      ferma_flusso: true, imposta_esito: "da_ricontattare", add_tags: ["wa-interessato"],
    },
  },
  {
    chiave: "altro",
    nome: "Qualsiasi altra risposta",
    spiega: "Da mettere in fondo: prende tutto quello che le regole sopra non riconoscono.",
    bozza: { match_type: "any", ferma_flusso: true, add_tags: ["wa-risposto"] },
  },
];

const CONSIGLIATE = ["non_scrivere", "non_interessato", "chiamata", "prezzi", "interessato"];

function unici(v: string[]): string[] {
  const visti = new Set<string>();
  const out: string[] = [];
  for (const s of v.map((x) => x.trim()).filter(Boolean)) {
    const k = s.toLowerCase();
    if (!visti.has(k)) { visti.add(k); out.push(s); }
  }
  return out;
}

function nomeAutomatico(b: Pick<Bozza, "match_type" | "match_keywords">): string {
  if (b.match_type === "any") return "Qualsiasi risposta";
  const p = b.match_keywords.find((k) => k.trim());
  return p ? `Risposta con «${p.trim()}»` : "Nuova regola";
}

/** Riga pronta per openwa_rules: le azioni spente non lasciano valori in giro. */
function perIlDatabase(b: Bozza) {
  return {
    name: b.name.trim() || nomeAutomatico(b),
    enabled: b.enabled,
    match_type: b.match_type,
    match_keywords: b.match_type === "any" ? [] : unici(b.match_keywords),
    only_first_contact: b.only_first_contact,
    only_outside_hours: b.only_outside_hours,
    reply_text: b.reply_text?.trim() || null,
    add_tags: unici(b.add_tags),
    assign_to: b.assign_to || null,
    notify_email: b.notify_email?.trim() || null,
    ferma_flusso: b.ferma_flusso,
    imposta_esito: b.imposta_esito || null,
    optout: b.optout,
    number_id: null as string | null,
    block: false,
  };
}

/** La condizione in forma di frase: «SE scrive «prezzo», «costi» e altre 3». */
function fraseCondizione(r: Pick<Bozza, "match_type" | "match_keywords" | "only_first_contact" | "only_outside_hours">, indice: number): string {
  let s: string;
  if (r.match_type === "any") {
    s = indice === 0 ? "risponde qualsiasi cosa" : "risponde qualsiasi altra cosa";
  } else {
    const p = r.match_keywords ?? [];
    const visti = p.slice(0, 3).map((k) => `«${k}»`).join(", ");
    const altre = p.length > 3 ? ` e altre ${p.length - 3}` : "";
    const verbo = r.match_type === "equals" ? "scrive esattamente" : r.match_type === "starts_with" ? "comincia con" : "scrive";
    s = `${verbo} ${visti || "…"}${altre}`;
  }
  const extra = [r.only_first_contact && "è il suo primo messaggio", r.only_outside_hours && "siamo fuori orario"].filter(Boolean);
  return extra.length ? `${s}, e ${extra.join(" e ")}` : s;
}

interface ChipAzione { icona: typeof Reply; testo: string; rosso?: boolean }

function azioniDi(r: Pick<Bozza, "optout" | "ferma_flusso" | "imposta_esito" | "add_tags" | "reply_text" | "assign_to" | "notify_email">, nomeStaff: (id: string) => string): ChipAzione[] {
  const out: ChipAzione[] = [];
  if (r.optout) out.push({ icona: Ban, testo: "Non scrivergli più", rosso: true });
  else if (r.ferma_flusso) out.push({ icona: Hand, testo: "Ferma il flusso" });
  if (r.imposta_esito) out.push({ icona: KanbanSquare, testo: `Bacheca: ${ESITI[r.imposta_esito] ?? r.imposta_esito}` });
  if (r.add_tags?.length) out.push({ icona: Tag, testo: r.add_tags.join(", ") });
  if (r.reply_text?.trim()) {
    const t = r.reply_text.trim();
    out.push({ icona: MessageSquareReply, testo: `Risponde «${t.length > 38 ? `${t.slice(0, 38)}…` : t}»` });
  }
  if (r.assign_to) out.push({ icona: UserCheck, testo: `Assegna a ${nomeStaff(r.assign_to)}` });
  if (r.notify_email) out.push({ icona: Mail, testo: `Avvisa ${r.notify_email}` });
  return out;
}

function quando(iso: string): string {
  const d = new Date(iso);
  const ora = d.toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" });
  const oggi = new Date();
  const ieri = new Date(); ieri.setDate(oggi.getDate() - 1);
  if (d.toDateString() === oggi.toDateString()) return `oggi alle ${ora}`;
  if (d.toDateString() === ieri.toDateString()) return `ieri alle ${ora}`;
  return `${d.toLocaleDateString("it-IT", { day: "2-digit", month: "2-digit" })} alle ${ora}`;
}

/** Quante volte è scattata ogni regola, e quando l'ultima: conteggi esatti, uno per regola. */
function useScatti(campagnaId: string, ids: string[]) {
  return useQuery({
    queryKey: ["openwa", "regole-scatti", campagnaId, ids.join(",")],
    enabled: ids.length > 0,
    staleTime: 30_000,
    queryFn: async () => {
      const righe = await Promise.all(ids.map(async (id) => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { data, count, error } = await (supabase as any)
          .from("openwa_regole_scatti")
          .select("created_at", { count: "exact" })
          .eq("rule_id", id)
          .order("created_at", { ascending: false })
          .limit(1);
        if (error) throw error;
        return [id, { volte: (count ?? 0) as number, ultima: (data?.[0]?.created_at ?? null) as string | null }] as const;
      }));
      return Object.fromEntries(righe) as Record<string, { volte: number; ultima: string | null }>;
    },
  });
}

/** Chi può seguire una conversazione: lo staff di piattaforma. */
function useStaff() {
  return useQuery({
    queryKey: ["openwa", "staff-regole"],
    staleTime: 10 * 60_000,
    queryFn: async () => {
      // Due query: la FK di user_roles punta ad auth.users, non a profiles.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any).from("user_roles").select("user_id").in("role", RUOLI_STAFF);
      if (error) throw error;
      const ids = [...new Set(((data ?? []) as { user_id: string }[]).map((r) => r.user_id))];
      if (ids.length === 0) return [] as Array<{ id: string; nome: string }>;
      const { data: profili, error: e2 } = await supabase.from("profiles").select("id, first_name, last_name, email").in("id", ids);
      if (e2) throw e2;
      const perId = new Map((profili ?? []).map((p) => [p.id, p]));
      return ids
        .map((id) => {
          const p = perId.get(id);
          return { id, nome: [p?.first_name, p?.last_name].filter(Boolean).join(" ") || p?.email || "Utente" };
        })
        .sort((a, b) => a.nome.localeCompare(b.nome, "it"));
    },
  });
}

export function RegoleRisposta({ campagnaId, stopSeRisponde }: { campagnaId: string; stopSeRisponde: boolean }) {
  const qc = useQueryClient();
  const confirm = useConfirm();
  const regoleQ = useRegoleCampagna(campagnaId);
  const regole = useMemo(() => regoleQ.data ?? [], [regoleQ.data]);
  const scatti = useScatti(campagnaId, regole.map((r) => r.id)).data ?? {};
  const staff = useStaff().data ?? [];
  const nomeStaff = (id: string) => staff.find((s) => s.id === id)?.nome ?? "un collega";
  const [bozza, setBozza] = useState<Bozza | null>(null);
  const [prova, setProva] = useState("");

  const aggiorna = () => {
    qc.invalidateQueries({ queryKey: ["openwa", "rules"] });
    qc.invalidateQueries({ queryKey: ["openwa", "regole-scatti", campagnaId] });
  };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const tabella = () => (supabase as any).from("openwa_rules");
  const prossimaPriorita = () => regole.reduce((m, r) => Math.max(m, r.priority ?? 0), 0) + 10;

  const cambiaBase = useMutation({
    mutationFn: async (v: boolean) => {
      const { error } = await supabase.from("openwa_campagne")
        .update({ stop_se_risponde: v, updated_at: new Date().toISOString() }).eq("id", campagnaId);
      if (error) throw error;
    },
    onSuccess: (_d, v) => {
      toast.success(v ? "Chi risponde esce dal flusso" : "Chi risponde continua a ricevere i follow-up");
      qc.invalidateQueries({ queryKey: ["openwa-campagne-testi"] });
    },
    onError: (e: Error) => toast.error("Regola non aggiornata", { description: e.message }),
  });

  const salva = useMutation({
    mutationFn: async (b: Bozza) => {
      const riga = perIlDatabase(b);
      const { error } = b.id
        ? await tabella().update(riga).eq("id", b.id)
        : await tabella().insert({ ...riga, campagna_id: campagnaId, priority: prossimaPriorita() });
      if (error) throw error;
    },
    onSuccess: (_d, b) => {
      toast.success(b.id ? "Regola aggiornata" : "Regola aggiunta in fondo alla lista");
      setBozza(null);
      aggiorna();
    },
    onError: (e: Error) => toast.error("Regola non salvata", { description: e.message }),
  });

  const aggiungiConsigliate = useMutation({
    mutationFn: async () => {
      const base = prossimaPriorita();
      const righe = CONSIGLIATE.map((k, i) => {
        const m = MODELLI.find((x) => x.chiave === k);
        return { ...perIlDatabase({ ...bozzaVuota(), ...m?.bozza, name: m?.nome ?? "" }), campagna_id: campagnaId, priority: base + i * 10 };
      });
      const { error } = await tabella().insert(righe);
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Regole consigliate aggiunte", { description: "Puoi spegnerle o cambiarle una per una." }); aggiorna(); },
    onError: (e: Error) => toast.error("Regole non aggiunte", { description: e.message }),
  });

  const attiva = useMutation({
    mutationFn: async ({ id, enabled }: { id: string; enabled: boolean }) => {
      const { error } = await tabella().update({ enabled }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: aggiorna,
    onError: (e: Error) => toast.error("Regola non aggiornata", { description: e.message }),
  });

  const elimina = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await tabella().delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Regola eliminata"); aggiorna(); },
    onError: (e: Error) => toast.error("Regola non eliminata", { description: e.message }),
  });

  // Riordino: le priorità diventano 10, 20, 30… nel nuovo ordine, e si scrive
  // solo chi cambia. Con due regole alla stessa priorità uno scambio secco
  // non spostava niente.
  const sposta = useMutation({
    mutationFn: async ({ i, dir }: { i: number; dir: -1 | 1 }) => {
      const j = i + dir;
      if (j < 0 || j >= regole.length) return;
      const ordine = [...regole];
      [ordine[i], ordine[j]] = [ordine[j], ordine[i]];
      for (let k = 0; k < ordine.length; k++) {
        const nuova = (k + 1) * 10;
        if (ordine[k].priority === nuova) continue;
        const { error } = await tabella().update({ priority: nuova }).eq("id", ordine[k].id);
        if (error) throw error;
      }
    },
    onSuccess: aggiorna,
    onError: (e: Error) => toast.error("Ordine non salvato", { description: e.message }),
  });

  const chiedeElimina = async (r: RegolaCampagna) => {
    const ok = await confirm({
      title: `Eliminare la regola «${r.name}»?`,
      description: "Le risposte che la facevano scattare passano alla regola successiva. Per fermarla solo per un po', spegnila.",
      confirmLabel: "Elimina",
      variant: "destructive",
    });
    if (ok) elimina.mutate(r.id);
  };

  const risultatoProva = useMemo(() => {
    if (!prova.trim()) return null;
    const r = primaCheScatta(regole, prova);
    return r ? { regola: r, indice: regole.indexOf(r) } : null;
  }, [prova, regole]);

  const occupato = sposta.isPending || attiva.isPending || elimina.isPending;

  return (
    <div className="min-w-0 space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-0.5">
        <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Quando risponde</span>
        <span className="text-[10px] text-muted-foreground">dall'alto in basso: decide la prima regola che combacia</span>
      </div>

      <div className="rounded-xl border border-border bg-card">
        <div className="flex items-start gap-3 border-b border-border p-3.5">
          <span className={cn("flex h-7 w-7 shrink-0 items-center justify-center rounded-lg", stopSeRisponde ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400" : "bg-muted text-muted-foreground")}>
            <Reply className="h-3.5 w-3.5" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-xs font-semibold text-foreground">Qualsiasi risposta: esce dal flusso</p>
            <p className="text-[11px] text-muted-foreground">
              {stopSeRisponde
                ? "Regola di base: chi risponde non riceve altri follow-up e finisce in «Ha risposto». Le regole qui sotto decidono il resto."
                : "Spenta: chi risponde continua a ricevere i follow-up, a meno che una regola qui sotto lo fermi."}
            </p>
          </div>
          <Switch
            checked={stopSeRisponde}
            disabled={cambiaBase.isPending}
            onCheckedChange={(v) => cambiaBase.mutate(v)}
            aria-label="Chi risponde esce dal flusso"
          />
        </div>

        {regoleQ.isLoading ? (
          <div className="flex items-center gap-2 p-3.5 text-[11px] text-muted-foreground">
            <Loader2 className="h-3.5 w-3.5 animate-spin" /> Regole in caricamento…
          </div>
        ) : regoleQ.error ? (
          <p className="p-3.5 text-[11px] text-destructive">
            Regole non caricate: {(regoleQ.error as Error).message}
          </p>
        ) : regole.length === 0 ? (
          <div className="space-y-3 p-3.5">
            <p className="text-[11px] text-muted-foreground">
              Nessuna regola: ogni risposta resta in «Ha risposto» e basta. Con le regole la bacheca si ordina da sola
              e chi chiede di non essere più contattato esce da tutte le campagne.
            </p>
            <ul className="grid gap-1.5 sm:grid-cols-2">
              {CONSIGLIATE.map((k, i) => {
                const m = MODELLI.find((x) => x.chiave === k);
                if (!m) return null;
                return (
                  <li key={k} className="rounded-lg border border-dashed border-border px-2.5 py-2">
                    <p className="text-[11px] font-medium text-foreground">
                      <span className="tabular-nums text-muted-foreground">{i + 1}.</span> {m.nome}
                    </p>
                    <p className="text-[10px] text-muted-foreground">{m.spiega}</p>
                  </li>
                );
              })}
            </ul>
            <Button size="sm" className="h-8 gap-1.5 text-xs" disabled={aggiungiConsigliate.isPending} onClick={() => aggiungiConsigliate.mutate()}>
              {aggiungiConsigliate.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Wand2 className="h-3.5 w-3.5" />}
              Aggiungi queste {CONSIGLIATE.length} regole
            </Button>
          </div>
        ) : (
          <ol className="divide-y divide-border">
            {regole.map((r, i) => (
              <RigaRegola
                key={r.id}
                r={r}
                indice={i}
                totale={regole.length}
                scatti={scatti[r.id]}
                azioni={azioniDi(r, nomeStaff)}
                evidenziata={risultatoProva?.regola.id === r.id}
                occupato={occupato}
                onAttiva={(v) => attiva.mutate({ id: r.id, enabled: v })}
                onSu={() => sposta.mutate({ i, dir: -1 })}
                onGiu={() => sposta.mutate({ i, dir: 1 })}
                onModifica={() => setBozza({ ...r })}
                onElimina={() => chiedeElimina(r)}
              />
            ))}
          </ol>
        )}

        <div className="flex flex-col gap-2 border-t border-border p-3 sm:flex-row sm:items-center">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button size="sm" variant="outline" className="h-8 shrink-0 gap-1 text-xs">
                <Plus className="h-3.5 w-3.5" /> Aggiungi regola <ChevronDown className="h-3 w-3 opacity-60" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-72">
              <DropdownMenuLabel className="text-[11px] font-medium text-muted-foreground">Pronte da usare</DropdownMenuLabel>
              {MODELLI.map((m) => (
                <DropdownMenuItem key={m.chiave} className="flex-col items-start gap-0" onSelect={() => setBozza({ ...bozzaVuota(), ...m.bozza, name: m.nome })}>
                  <span className="text-xs font-medium">{m.nome}</span>
                  <span className="text-[10px] text-muted-foreground">{m.spiega}</span>
                </DropdownMenuItem>
              ))}
              <DropdownMenuSeparator />
              <DropdownMenuItem className="text-xs" onSelect={() => setBozza(bozzaVuota())}>
                <Pencil className="mr-2 h-3.5 w-3.5" /> Regola vuota, la scrivo io
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <div className="relative min-w-0 flex-1">
            <FlaskConical className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={prova}
              onChange={(e) => setProva(e.target.value)}
              placeholder="Prova: scrivi una risposta d'esempio e guarda cosa succede"
              className="h-8 pl-8 text-xs"
              aria-label="Prova una risposta d'esempio"
            />
          </div>
        </div>
        {prova.trim() && (
          <div className="border-t border-border bg-muted/30 px-3.5 py-2.5 text-[11px]">
            {risultatoProva ? (
              <p className="text-foreground">
                <Check className="mr-1 inline h-3.5 w-3.5 text-emerald-600" />
                Scatta la regola {risultatoProva.indice + 1}, <strong>{risultatoProva.regola.name}</strong>:{" "}
                {azioniDi(risultatoProva.regola, nomeStaff).map((a) => a.testo).join(" · ") || "nessuna azione"}.
                {(risultatoProva.regola.only_first_contact || risultatoProva.regola.only_outside_hours) && (
                  <span className="text-muted-foreground"> Solo se {[
                    risultatoProva.regola.only_first_contact && "è il suo primo messaggio",
                    risultatoProva.regola.only_outside_hours && "siamo fuori orario",
                  ].filter(Boolean).join(" e ")}.</span>
                )}
              </p>
            ) : (
              <p className="text-muted-foreground">
                Nessuna regola scatta: {stopSeRisponde ? "esce dal flusso e resta in «Ha risposto»." : "continua a ricevere i follow-up."}
              </p>
            )}
          </div>
        )}
      </div>

      {bozza && (
        <EditorRegola
          key={bozza.id ?? "nuova"}
          iniziale={bozza}
          staff={staff}
          stopSeRisponde={stopSeRisponde}
          salvando={salva.isPending}
          onAnnulla={() => setBozza(null)}
          onSalva={(b) => salva.mutate(b)}
        />
      )}
    </div>
  );
}

function RigaRegola({
  r, indice, totale, scatti, azioni, evidenziata, occupato, onAttiva, onSu, onGiu, onModifica, onElimina,
}: {
  r: RegolaCampagna;
  indice: number;
  totale: number;
  scatti?: { volte: number; ultima: string | null };
  azioni: ChipAzione[];
  evidenziata: boolean;
  occupato: boolean;
  onAttiva: (v: boolean) => void;
  onSu: () => void;
  onGiu: () => void;
  onModifica: () => void;
  onElimina: () => void;
}) {
  return (
    <li className={cn("flex gap-3 p-3.5 transition-colors", evidenziata && "bg-emerald-50/70 dark:bg-emerald-950/25")}>
      <span className={cn(
        "mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10px] font-semibold tabular-nums",
        r.enabled ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground",
      )}>
        {indice + 1}
      </span>
      <div className={cn("min-w-0 flex-1", !r.enabled && "opacity-55")}>
        <button type="button" className="text-left text-xs font-semibold text-foreground hover:underline" onClick={onModifica}>
          {r.name}
        </button>
        {!r.enabled && <span className="ml-1.5 text-[10px] text-muted-foreground">spenta</span>}
        <p className="mt-0.5 text-[11px] text-muted-foreground">
          <span className="font-semibold uppercase tracking-wide text-[10px] text-foreground/70">{indice === 0 ? "Se" : "Altrimenti se"}</span>{" "}
          {fraseCondizione(r, indice)}
        </p>
        <div className="mt-1.5 flex flex-wrap gap-1">
          {azioni.length === 0 ? (
            <span className="text-[11px] italic text-muted-foreground">nessuna azione</span>
          ) : azioni.map((a) => (
            <span
              key={a.testo}
              className={cn(
                "inline-flex max-w-full items-center gap-1 rounded-md border px-1.5 py-0.5 text-[11px]",
                a.rosso ? "border-red-200 bg-red-50 text-red-700 dark:border-red-900 dark:bg-red-950/40 dark:text-red-400" : "border-border bg-background text-foreground/80",
              )}
            >
              <a.icona className="h-3 w-3 shrink-0" /> <span className="truncate">{a.testo}</span>
            </span>
          ))}
        </div>
        <p className="mt-1 text-[10px] text-muted-foreground">
          {!scatti ? " " : scatti.volte === 0
            ? "non ancora scattata"
            : `scattata ${scatti.volte.toLocaleString("it-IT")} ${scatti.volte === 1 ? "volta" : "volte"}${scatti.ultima ? ` · l'ultima ${quando(scatti.ultima)}` : ""}`}
        </p>
      </div>
      <div className="flex shrink-0 items-start gap-0.5">
        <Switch checked={r.enabled} disabled={occupato} onCheckedChange={onAttiva} aria-label={r.enabled ? "Spegni la regola" : "Accendi la regola"} className="mr-1 mt-0.5" />
        <Button size="sm" variant="ghost" className="h-7 w-7 p-0" title="Sposta su" aria-label="Sposta su" disabled={occupato || indice === 0} onClick={onSu}>
          <ArrowUp className="h-3.5 w-3.5" />
        </Button>
        <Button size="sm" variant="ghost" className="h-7 w-7 p-0" title="Sposta giù" aria-label="Sposta giù" disabled={occupato || indice === totale - 1} onClick={onGiu}>
          <ArrowDown className="h-3.5 w-3.5" />
        </Button>
        <Button size="sm" variant="ghost" className="h-7 w-7 p-0" title="Modifica" aria-label="Modifica la regola" onClick={onModifica}>
          <Pencil className="h-3.5 w-3.5" />
        </Button>
        <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-destructive" title="Elimina" aria-label="Elimina la regola" disabled={occupato} onClick={onElimina}>
          <Trash2 className="h-3.5 w-3.5" />
        </Button>
      </div>
    </li>
  );
}

/** Parole o frasi come etichette: Invio o virgola per aggiungere, × per togliere. */
function Parole({ valori, onChange, placeholder, etichetta }: {
  valori: string[]; onChange: (v: string[]) => void; placeholder: string; etichetta: string;
}) {
  const [testo, setTesto] = useState("");
  const aggiungi = (raw: string) => {
    const nuove = raw.split(/[,\n]/).map((s) => s.trim()).filter(Boolean);
    setTesto("");
    if (nuove.length) onChange(unici([...valori, ...nuove]));
  };
  return (
    <div className="flex min-h-9 flex-wrap items-center gap-1 rounded-md border border-input bg-background px-2 py-1.5 focus-within:ring-1 focus-within:ring-ring">
      {valori.map((v) => (
        <span key={v} className="inline-flex items-center gap-1 rounded bg-muted px-1.5 py-0.5 text-[11px] text-foreground">
          {v}
          <button type="button" className="text-muted-foreground hover:text-foreground" aria-label={`Togli ${v}`} onClick={() => onChange(valori.filter((x) => x !== v))}>
            <X className="h-3 w-3" />
          </button>
        </span>
      ))}
      <input
        className="h-6 min-w-[9rem] flex-1 bg-transparent text-xs outline-none placeholder:text-muted-foreground"
        value={testo}
        aria-label={etichetta}
        placeholder={valori.length ? "aggiungi…" : placeholder}
        onChange={(e) => {
          const v = e.target.value;
          if (/[,\n]/.test(v)) aggiungi(v);
          else setTesto(v);
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") { e.preventDefault(); aggiungi(testo); }
          else if (e.key === "Backspace" && !testo && valori.length) onChange(valori.slice(0, -1));
        }}
        onBlur={() => aggiungi(testo)}
      />
    </div>
  );
}

function Azione({ icona: Icona, titolo, spiega, attiva, onAttiva, disabilitata, rosso, children }: {
  icona: typeof Reply;
  titolo: string;
  spiega: string;
  attiva: boolean;
  onAttiva: (v: boolean) => void;
  disabilitata?: boolean;
  rosso?: boolean;
  children?: ReactNode;
}) {
  return (
    <div className={cn(
      "rounded-lg border p-3 transition-colors",
      attiva ? (rosso ? "border-red-200 bg-red-50/50 dark:border-red-900 dark:bg-red-950/20" : "border-primary/30 bg-primary/[0.03]") : "border-border",
    )}>
      <div className="flex items-start gap-3">
        <Icona className={cn("mt-0.5 h-4 w-4 shrink-0", rosso ? "text-red-600 dark:text-red-400" : "text-muted-foreground")} />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-foreground">{titolo}</p>
          <p className="text-[11px] text-muted-foreground">{spiega}</p>
        </div>
        <Switch checked={attiva} disabled={disabilitata} onCheckedChange={onAttiva} aria-label={titolo} />
      </div>
      {attiva && children && <div className="mt-2.5 pl-7">{children}</div>}
    </div>
  );
}

function EditorRegola({ iniziale, staff, stopSeRisponde, salvando, onAnnulla, onSalva }: {
  iniziale: Bozza;
  staff: Array<{ id: string; nome: string }>;
  stopSeRisponde: boolean;
  salvando: boolean;
  onAnnulla: () => void;
  onSalva: (b: Bozza) => void;
}) {
  const [b, setB] = useState<Bozza>(iniziale);
  const [usa, setUsa] = useState({
    esito: !!iniziale.imposta_esito,
    etichette: iniziale.add_tags.length > 0,
    risposta: !!iniziale.reply_text?.trim(),
    assegna: !!iniziale.assign_to,
    email: !!iniziale.notify_email?.trim(),
  });
  const [prova, setProva] = useState("");
  const set = (p: Partial<Bozza>) => setB((x) => ({ ...x, ...p }));

  // Le azioni spente non si salvano: il valore scritto resta solo finché la
  // finestra è aperta, così spegnere e riaccendere non fa perdere il testo.
  const finale: Bozza = {
    ...b,
    imposta_esito: usa.esito ? b.imposta_esito : null,
    add_tags: usa.etichette ? b.add_tags : [],
    reply_text: usa.risposta ? b.reply_text : null,
    assign_to: usa.assegna ? b.assign_to : null,
    notify_email: usa.email ? b.notify_email : null,
  };

  const problema = (() => {
    if (finale.match_type !== "any" && unici(finale.match_keywords).length === 0) return "Scrivi almeno una parola o frase da riconoscere.";
    if (usa.esito && !finale.imposta_esito) return "Scegli la colonna della bacheca.";
    if (usa.etichette && unici(finale.add_tags).length === 0) return "Scrivi almeno un'etichetta.";
    if (usa.risposta && !finale.reply_text?.trim()) return "Scrivi il testo della risposta automatica.";
    if (usa.assegna && !finale.assign_to) return "Scegli a chi assegnare la conversazione.";
    if (usa.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(finale.notify_email?.trim() ?? "")) return "Controlla l'indirizzo email da avvisare.";
    const qualcosa = finale.ferma_flusso || finale.optout || usa.esito || usa.etichette || usa.risposta || usa.assegna || usa.email;
    if (!qualcosa) return "Scegli almeno una cosa da fare.";
    return null;
  })();

  const esitoProva = prova.trim()
    ? (finale.match_type === "any"
      ? { scatta: testoCombacia("any", [], prova), per: null as string | null }
      : (() => {
        const per = finale.match_keywords.find((k) => testoCombacia(finale.match_type, [k], prova)) ?? null;
        return { scatta: !!per, per };
      })())
    : null;

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onAnnulla(); }}>
      <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{iniziale.id ? "Modifica regola" : "Nuova regola"}</DialogTitle>
          <DialogDescription>
            Vale solo per le risposte dei destinatari di questa campagna. Le regole si leggono dall'alto in basso: decide la prima che combacia.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="nome-regola">Nome</Label>
            <Input id="nome-regola" value={b.name} placeholder={nomeAutomatico(b)} onChange={(e) => set({ name: e.target.value })} />
          </div>

          <section className="space-y-3 rounded-xl border border-border p-4">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Quando risponde e il messaggio…</p>
            <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="Tipo di condizione">
              {CONDIZIONI.map((c) => (
                <button
                  key={c.v}
                  type="button"
                  role="radio"
                  aria-checked={b.match_type === c.v}
                  onClick={() => set({ match_type: c.v })}
                  className={cn(
                    "rounded-full border px-3 py-1 text-xs transition-colors",
                    b.match_type === c.v ? "border-primary bg-primary text-primary-foreground" : "border-border bg-background text-foreground hover:bg-muted",
                  )}
                >
                  {c.label}
                </button>
              ))}
            </div>
            {b.match_type !== "any" && (
              <div className="space-y-1.5">
                <Parole
                  valori={b.match_keywords}
                  onChange={(v) => set({ match_keywords: v })}
                  etichetta="Parole o frasi da riconoscere"
                  placeholder="es. quanto costa, preventivo — Invio per aggiungere"
                />
                <p className="text-[11px] text-muted-foreground">
                  {b.match_type === "contains" ? "Basta una delle parole o frasi. " : ""}
                  Maiuscole, accenti e punteggiatura non contano; una parola vale solo intera («no» non scatta dentro «buongiorno»)
                  {b.match_type === "contains" ? " e non conta se è negata poco prima («interessato» non scatta su «non sono interessato»)." : "."}
                </p>
              </div>
            )}
            <div className="flex flex-wrap gap-x-5 gap-y-2">
              <label className="flex items-center gap-2 text-xs">
                <Checkbox checked={b.only_first_contact} onCheckedChange={(v) => set({ only_first_contact: v === true })} />
                Solo se è il primo messaggio che ci scrive
              </label>
              <label className="flex items-center gap-2 text-xs">
                <Checkbox checked={b.only_outside_hours} onCheckedChange={(v) => set({ only_outside_hours: v === true })} />
                Solo fuori orario
              </label>
            </div>
            <div className="flex flex-col gap-1.5 rounded-lg bg-muted/40 p-2.5 sm:flex-row sm:items-center">
              <div className="relative min-w-0 flex-1">
                <FlaskConical className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                <Input value={prova} onChange={(e) => setProva(e.target.value)} placeholder="Prova con una risposta d'esempio" className="h-8 bg-background pl-8 text-xs" aria-label="Prova la condizione" />
              </div>
              {esitoProva && (
                <span className={cn("shrink-0 text-[11px] font-medium", esitoProva.scatta ? "text-emerald-700 dark:text-emerald-400" : "text-muted-foreground")}>
                  {esitoProva.scatta ? `Scatta${esitoProva.per ? ` per «${esitoProva.per}»` : ""}` : "Non scatta"}
                </span>
              )}
            </div>
          </section>

          <section className="space-y-2 rounded-xl border border-border p-4">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">…allora</p>
            <Azione
              icona={Hand}
              titolo="Ferma il flusso"
              spiega={finale.optout
                ? "Compreso in «Non scrivergli più»."
                : stopSeRisponde
                  ? "Già così per ogni risposta (regola di base accesa): conta se la spegni."
                  : "Nessun altro follow-up a questa persona."}
              attiva={finale.ferma_flusso || finale.optout}
              disabilitata={finale.optout}
              onAttiva={(v) => set({ ferma_flusso: v })}
            />
            <Azione
              icona={KanbanSquare}
              titolo="Sposta sulla bacheca"
              spiega="Solo se non ha già un esito: una scelta fatta a mano non la sposta nessuna regola."
              attiva={usa.esito}
              onAttiva={(v) => setUsa((u) => ({ ...u, esito: v }))}
            >
              <Select value={b.imposta_esito ?? ""} onValueChange={(v) => set({ imposta_esito: v })}>
                <SelectTrigger className="h-8 w-full text-xs sm:w-60"><SelectValue placeholder="Scegli la colonna" /></SelectTrigger>
                <SelectContent>
                  {Object.entries(ESITI).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
                </SelectContent>
              </Select>
            </Azione>
            <Azione
              icona={Tag}
              titolo="Aggiungi etichette"
              spiega="Sul contatto: poi le usi per filtrare liste, campagne e sequenze."
              attiva={usa.etichette}
              onAttiva={(v) => setUsa((u) => ({ ...u, etichette: v }))}
            >
              <Parole valori={b.add_tags} onChange={(v) => set({ add_tags: v })} etichetta="Etichette da aggiungere" placeholder="es. wa-interessato" />
            </Azione>
            <Azione
              icona={MessageSquareReply}
              titolo="Rispondi automaticamente"
              spiega="Dallo stesso numero a cui ha scritto, una volta sola per persona. Se scattano più risposte, ne parte una."
              attiva={usa.risposta}
              onAttiva={(v) => setUsa((u) => ({ ...u, risposta: v }))}
            >
              <Textarea
                rows={3}
                value={b.reply_text ?? ""}
                onChange={(e) => set({ reply_text: e.target.value })}
                placeholder="{Grazie|Grazie mille} {{nome}}! Ti chiamo io in giornata."
                className="text-xs"
              />
              <p className="mt-1 text-[11px] text-muted-foreground">
                {"{{nome}}"} e {"{{azienda}}"} si riempiono da soli; {"{Ciao|Salve}"} varia il testo da una persona all'altra.
              </p>
            </Azione>
            <Azione
              icona={UserCheck}
              titolo="Assegna a"
              spiega="La conversazione va a questa persona, se non la segue già qualcuno."
              attiva={usa.assegna}
              onAttiva={(v) => setUsa((u) => ({ ...u, assegna: v }))}
            >
              <Select value={b.assign_to ?? ""} onValueChange={(v) => set({ assign_to: v })}>
                <SelectTrigger className="h-8 w-full text-xs sm:w-60"><SelectValue placeholder="Scegli la persona" /></SelectTrigger>
                <SelectContent>
                  {staff.map((s) => <SelectItem key={s.id} value={s.id}>{s.nome}</SelectItem>)}
                </SelectContent>
              </Select>
            </Azione>
            <Azione
              icona={Mail}
              titolo="Avvisami via email"
              spiega="Con il testo della risposta e il nome della regola."
              attiva={usa.email}
              onAttiva={(v) => setUsa((u) => ({ ...u, email: v }))}
            >
              <Input type="email" value={b.notify_email ?? ""} onChange={(e) => set({ notify_email: e.target.value })} placeholder="nome@azienda.it" className="h-8 text-xs sm:w-72" />
            </Azione>
            <Azione
              icona={Ban}
              titolo="Non scrivergli più"
              spiega="Esce da questa e da tutte le altre campagne WhatsApp, per sempre."
              attiva={b.optout}
              rosso
              onAttiva={(v) => set({ optout: v })}
            />
          </section>

          <label className="flex items-center gap-2 text-xs">
            <Switch checked={b.enabled} onCheckedChange={(v) => set({ enabled: v })} /> Regola accesa
          </label>
        </div>

        <DialogFooter className="items-center gap-2 sm:justify-between">
          <p className="text-[11px] text-amber-700 dark:text-amber-400">{problema ?? " "}</p>
          <div className="flex gap-2">
            <Button variant="outline" onClick={onAnnulla}>Annulla</Button>
            <Button disabled={!!problema || salvando} onClick={() => onSalva(finale)}>
              {salvando ? "Salvataggio…" : iniziale.id ? "Salva modifiche" : "Aggiungi regola"}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
