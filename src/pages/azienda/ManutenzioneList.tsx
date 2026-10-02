import { useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { usePermissions } from "@/hooks/usePermissions";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import {
  Settings, AlertCircle, Plus, Search, List, Columns3, ClipboardList, FileText,
  AlertTriangle, CheckCircle2, CircleDashed,
} from "lucide-react";
import { addDays } from "date-fns";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { NuovoImpiantoWizard } from "@/components/manutenzione/NuovoImpiantoWizard";
import { StatTile } from "@/components/common/StatTile";
import { ExportButton } from "@/components/shared/ExportButton";
import { ManutenzionePipeline, type ImpiantoStato } from "@/components/manutenzione/ManutenzionePipeline";
import { ImpiantiTable } from "@/components/manutenzione/ImpiantiTable";
import { statoManutenzione, type StatoManutenzione } from "@/lib/manutenzione/statoManutenzione";

type ProfileSummary = { first_name: string | null; last_name: string | null };

type ImpiantoCliente = {
  id: string;
  tipo_impianto: string;
  marca: string | null;
  modello: string | null;
  garanzia_scadenza: string | null;
  data_installazione: string | null;
  customer: ProfileSummary | null;
};

type ContrattoManutenzione = {
  id: string;
  nome_contratto: string;
  stato: string | null;
  importo_canone: number;
  tipo_fatturazione: string | null;
  customer: ProfileSummary | null;
  impianto: { tipo_impianto: string | null; marca: string | null; modello: string | null } | null;
};

/** Piano con quel che serve per pianificare/completare + il legame all'impianto. */
type PianoAttivo = {
  id: string;
  titolo: string;
  frequenza_tipo: string;
  frequenza_giorni: number | null;
  prossima_scadenza: string | null;
  tecnico_preferito: string | null;
  contratto: { nome_contratto: string | null; customer_id: string | null; impianto_id: string | null } | null;
};

/** `incorporata`: dentro Assistenza (scheda «Manutenzioni»); `actionsSlot`: dove
 *  teletrasportare i pulsanti, sulla riga delle due schede. */
export default function ManutenzioneList({ incorporata = false, actionsSlot = null }: { incorporata?: boolean; actionsSlot?: HTMLElement | null } = {}) {
  const { effectiveCompany, user } = useAuth();
  const permissions = usePermissions();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [wizardOpen, setWizardOpen] = useState(false);
  const [search, setSearch] = useState("");
  // Pillola attiva (per STATO, non per tipo): "all" · "urgenti" (scadenza
  // imminente = scadute o in scadenza) · "in_regola" · "senza_piano" · "__contratti__".
  const [pill, setPill] = useState("all");
  const [vista, setVista] = useState<"tabella" | "kanban">(() => {
    try { return (localStorage.getItem("manutenzione-vista") as "tabella" | "kanban") || "tabella"; }
    catch { return "tabella"; }
  });
  const cambiaVista = (v: "tabella" | "kanban") => {
    setVista(v);
    try { localStorage.setItem("manutenzione-vista", v); } catch { /* private mode */ }
  };
  // Selezione righe (come l'assistenza): l'Esporta segue la selezione.
  const [selezionati, setSelezionati] = useState<Set<string>>(new Set());
  const toggleUno = (id: string) => setSelezionati((prev) => {
    const next = new Set(prev);
    next.has(id) ? next.delete(id) : next.add(id);
    return next;
  });

  const soloMie = permissions.onlyAssigned && user?.id;

  const { data: impianti = [], isLoading: loadingImpianti, isError: impiantiError } = useQuery({
    queryKey: ["impianti", effectiveCompany?.id, permissions.onlyAssigned, user?.id],
    queryFn: async () => {
      if (!effectiveCompany?.id) return [];
      let query = supabase
        .from("impianti_cliente")
        .select("id, tipo_impianto, marca, modello, garanzia_scadenza, data_installazione, customer:profiles!impianti_cliente_customer_id_fkey(first_name, last_name)")
        .eq("company_id", effectiveCompany.id)
        .eq("attivo", true)
        .order("created_at", { ascending: false });
      if (soloMie) query = query.eq("tecnico_preferito", user!.id);
      const { data, error } = await query;
      if (error) throw error;
      return (data ?? []) as unknown as ImpiantoCliente[];
    },
    enabled: !!effectiveCompany?.id,
  });

  const { data: contratti = [], isLoading: loadingContratti, isError: contrattiError } = useQuery({
    queryKey: ["contratti-manutenzione", effectiveCompany?.id, permissions.onlyAssigned, user?.id],
    queryFn: async () => {
      if (!effectiveCompany?.id) return [];
      let query = supabase
        .from("contratti_manutenzione")
        .select("*, impianto:impianti_cliente(tipo_impianto, marca, modello), customer:profiles!contratti_manutenzione_customer_id_fkey(first_name, last_name)")
        .eq("company_id", effectiveCompany.id)
        .order("created_at", { ascending: false });
      if (soloMie) query = query.eq("tecnico_preferito", user!.id);
      const { data, error } = await query;
      if (error) throw error;
      return (data ?? []) as unknown as ContrattoManutenzione[];
    },
    enabled: !!effectiveCompany?.id,
  });

  // Tutti i piani attivi: servono a dare a ogni impianto la sua prossima
  // manutenzione (e quindi lo stato del kanban), non solo quelli in scadenza.
  const { data: piani = [], isError: pianiError } = useQuery({
    queryKey: ["piani-attivi", effectiveCompany?.id, permissions.onlyAssigned, user?.id],
    queryFn: async () => {
      if (!effectiveCompany?.id) return [];
      let query = supabase
        .from("piani_manutenzione")
        .select("id, titolo, frequenza_tipo, frequenza_giorni, prossima_scadenza, tecnico_preferito, contratto:contratti_manutenzione(nome_contratto, customer_id, impianto_id)")
        .eq("company_id", effectiveCompany.id)
        .eq("attivo", true)
        .order("prossima_scadenza", { ascending: true });
      if (soloMie) query = query.eq("tecnico_preferito", user!.id);
      const { data, error } = await query;
      if (error) throw error;
      return (data ?? []) as unknown as PianoAttivo[];
    },
    enabled: !!effectiveCompany?.id,
  });

  // Per ogni impianto: il piano con la scadenza più vicina (se c'è).
  const pianoPerImpianto = useMemo(() => {
    const m = new Map<string, PianoAttivo>();
    for (const p of piani) {
      const imp = p.contratto?.impianto_id;
      if (!imp) continue;
      const cur = m.get(imp);
      if (!cur || (p.prossima_scadenza ?? "9999") < (cur.prossima_scadenza ?? "9999")) m.set(imp, p);
    }
    return m;
  }, [piani]);

  // Nome del tecnico assegnato (sta sul piano, non sull'impianto): risolvo gli
  // id in nomi, come fa l'assistenza con l'assegnatario.
  const tecnicoIds = useMemo(
    () => [...new Set(piani.map((p) => p.tecnico_preferito).filter(Boolean))] as string[],
    [piani],
  );
  const { data: tecnici = {} } = useQuery({
    queryKey: ["manutenzione-tecnici", effectiveCompany?.id, tecnicoIds],
    enabled: !!effectiveCompany?.id && tecnicoIds.length > 0,
    staleTime: 10 * 60 * 1000,
    queryFn: async () => {
      const { data, error } = await supabase.from("profiles").select("id, first_name, last_name").in("id", tecnicoIds);
      if (error) throw error;
      const m: Record<string, string> = {};
      (data ?? []).forEach((p) => { m[p.id] = [p.first_name, p.last_name].filter(Boolean).join(" ") || "Tecnico"; });
      return m;
    },
  });

  const FREQ_GIORNI: Record<string, number> = { mensile: 30, trimestrale: 90, semestrale: 180, annuale: 365 };

  const pianificaMutation = useMutation({
    mutationFn: async (piano: PianoAttivo) => {
      const customerId = piano.contratto?.customer_id;
      if (!customerId || !effectiveCompany?.id) throw new Error("Dati mancanti");
      const giorni = piano.frequenza_giorni ?? FREQ_GIORNI[piano.frequenza_tipo] ?? 365;
      const prossima = addDays(new Date(), giorni).toISOString().split("T")[0];
      const { error: ticketErr } = await supabase.from("tickets").insert({
        company_id: effectiveCompany.id,
        customer_id: customerId,
        subject: `Manutenzione programmata: ${piano.titolo}`,
        tipo: "intervento",
        status: "aperto",
        priority: "normale",
        assigned_to: piano.tecnico_preferito || null,
        impianto_id: piano.contratto?.impianto_id ?? null,
      } as never);
      if (ticketErr) throw ticketErr;
      const { error: pianoErr } = await supabase.from("piani_manutenzione").update({ prossima_scadenza: prossima }).eq("id", piano.id);
      if (pianoErr) throw pianoErr;
    },
    onSuccess: () => {
      toast.success("Intervento pianificato e ticket creato");
      queryClient.invalidateQueries({ queryKey: ["piani-attivi", effectiveCompany?.id] });
    },
    onError: (err: Error) => toast.error(err.message || "Errore nella pianificazione"),
  });

  const completaMutation = useMutation({
    mutationFn: async (piano: PianoAttivo) => {
      if (!effectiveCompany?.id) return;
      const todayIso = new Date().toISOString().split("T")[0];
      const giorni = piano.frequenza_giorni ?? FREQ_GIORNI[piano.frequenza_tipo] ?? 365;
      const prossima = addDays(new Date(), giorni).toISOString().split("T")[0];
      const { error: eErr } = await supabase.from("esecuzioni_manutenzione").insert({
        piano_id: piano.id,
        tecnico_id: piano.tecnico_preferito || null,
        data_esecuzione: todayIso,
        esito: "ok",
        note: "Manutenzione completata dalla lista",
      });
      if (eErr) throw eErr;
      const { error: pErr } = await supabase.from("piani_manutenzione")
        .update({ ultima_esecuzione: todayIso, prossima_scadenza: prossima })
        .eq("company_id", effectiveCompany.id).eq("id", piano.id);
      if (pErr) throw pErr;
    },
    onSuccess: () => {
      toast.success("Manutenzione completata");
      queryClient.invalidateQueries({ queryKey: ["piani-attivi", effectiveCompany?.id] });
    },
    onError: (err: Error) => toast.error(err.message || "Completamento non riuscito"),
  });

  // ── Impianti arricchiti con lo stato + filtri ────────────────────────────
  const q = search.trim().toLowerCase();
  const nomeCliente = (c: ProfileSummary | null) => [c?.first_name, c?.last_name].filter(Boolean).join(" ").toLowerCase();

  const impiantiConStato = useMemo<ImpiantoStato[]>(() => impianti.map((im) => {
    const piano = pianoPerImpianto.get(im.id) ?? null;
    const stato = statoManutenzione(piano?.prossima_scadenza ?? null, !!piano);
    // Priorità = urgenza derivata dallo stato (l'impianto non ne ha una propria).
    const priorita = stato === "scaduta" ? "alta" : stato === "in_scadenza" ? "media" : stato === "in_regola" ? "bassa" : null;
    const tecnicoId = piano?.tecnico_preferito ?? null;
    return {
      id: im.id,
      tipo_impianto: im.tipo_impianto,
      marca: im.marca,
      modello: im.modello,
      garanzia_scadenza: im.garanzia_scadenza,
      data_installazione: im.data_installazione,
      customer: im.customer,
      stato,
      prossimaScadenza: piano?.prossima_scadenza ?? null,
      prossimoPianoId: piano?.id ?? null,
      contrattoNome: piano?.contratto?.nome_contratto ?? null,
      tecnicoId,
      tecnicoNome: tecnicoId ? (tecnici[tecnicoId] ?? null) : null,
      priorita,
    };
  }), [impianti, pianoPerImpianto, tecnici]);

  const impiantiFiltrati = useMemo(() => impiantiConStato.filter((im) => {
    if (pill === "urgenti" && !(im.stato === "scaduta" || im.stato === "in_scadenza")) return false;
    if (pill === "in_regola" && im.stato !== "in_regola") return false;
    if (pill === "senza_piano" && im.stato !== "senza_piano") return false;
    if (!q) return true;
    return `${im.tipo_impianto} ${im.marca ?? ""} ${im.modello ?? ""} ${nomeCliente(im.customer)}`.toLowerCase().includes(q);
  }), [impiantiConStato, pill, q]);

  const contrattiFiltrati = useMemo(() => contratti.filter((c) => {
    if (!q) return true;
    return `${c.nome_contratto} ${c.impianto?.tipo_impianto ?? ""} ${nomeCliente(c.customer)}`.toLowerCase().includes(q);
  }), [contratti, q]);

  // Conteggi per stato — per le pillole e i KPI.
  const contaStato = useMemo(() => {
    const c: Record<StatoManutenzione, number> = { scaduta: 0, in_scadenza: 0, in_regola: 0, senza_piano: 0 };
    impiantiConStato.forEach((im) => { c[im.stato] += 1; });
    return c;
  }, [impiantiConStato]);
  const nScaduteInScadenza = contaStato.scaduta + contaStato.in_scadenza;
  const mrr = contratti.filter((c) => c.stato === "attivo").reduce((sum, c) => {
    const mensile = c.tipo_fatturazione === "mensile" ? c.importo_canone
      : c.tipo_fatturazione === "trimestrale" ? c.importo_canone / 3
      : c.tipo_fatturazione === "semestrale" ? c.importo_canone / 6
      : c.importo_canone / 12;
    return sum + mensile;
  }, 0);

  // Selezione "tutti": sugli impianti visibili (filtrati).
  const tutteSelezionate = impiantiFiltrati.length > 0 && impiantiFiltrati.every((im) => selezionati.has(im.id));
  const toggleTutti = () => setSelezionati((prev) => {
    if (impiantiFiltrati.every((im) => prev.has(im.id))) {
      const next = new Set(prev);
      impiantiFiltrati.forEach((im) => next.delete(im.id));
      return next;
    }
    return new Set([...prev, ...impiantiFiltrati.map((im) => im.id)]);
  });
  const impiantiDaEsportare = selezionati.size > 0
    ? impiantiConStato.filter((im) => selezionati.has(im.id))
    : impiantiFiltrati;

  const openImpianto = (id: string) => navigate(`/azienda/manutenzione/impianto/${id}`);
  const pianificaImpianto = (impiantoId: string) => {
    const piano = pianoPerImpianto.get(impiantoId);
    if (piano) pianificaMutation.mutate(piano);
  };
  const completaImpianto = (impiantoId: string) => {
    const piano = pianoPerImpianto.get(impiantoId);
    if (piano) completaMutation.mutate(piano);
  };
  const busy = pianificaMutation.isPending || completaMutation.isPending;

  const mostraContratti = pill === "__contratti__";

  const azioni = (
    <>
      <div className="hidden sm:contents">
        <ExportButton
          getData={() => impiantiDaEsportare.map((im) => ({
            tipo: im.tipo_impianto?.replace("_", " ") || "",
            marca: im.marca || "",
            modello: im.modello || "",
            cliente: [im.customer?.first_name, im.customer?.last_name].filter(Boolean).join(" "),
            stato: im.stato,
            prossima_manutenzione: im.prossimaScadenza ? new Date(im.prossimaScadenza).toLocaleDateString("it-IT") : "",
            garanzia: im.garanzia_scadenza ? new Date(im.garanzia_scadenza).toLocaleDateString("it-IT") : "",
          }))}
          columns={[
            { key: "tipo", label: "Tipo" },
            { key: "marca", label: "Marca" },
            { key: "modello", label: "Modello" },
            { key: "cliente", label: "Cliente" },
            { key: "stato", label: "Stato" },
            { key: "prossima_manutenzione", label: "Prossima manutenzione" },
            { key: "garanzia", label: "Scadenza garanzia" },
          ]}
          filename="impianti-manutenzione"
        />
      </div>
      <Button
        onClick={() => setWizardOpen(true)}
        className="bg-gradient-to-r from-orange-500 to-eic-amber-strong text-white shadow-sm hover:from-orange-600 hover:to-amber-600 max-sm:h-9 max-sm:px-3 max-sm:text-xs"
      >
        <Plus className="mr-2 h-4 w-4" />
        <span className="sm:hidden">Nuovo</span>
        <span className="hidden sm:inline">Nuovo Impianto</span>
      </Button>
    </>
  );

  return (
    <div className="space-y-6 max-sm:space-y-3">
      {/* Azioni: sulla riga delle schede (portal) o, da soli, con la testata. */}
      {incorporata && actionsSlot ? (
        createPortal(azioni, actionsSlot)
      ) : (
        <div className={incorporata ? "flex items-center justify-end gap-2" : "testata-pagina rounded-2xl border border-slate-200 bg-gradient-to-br from-white via-white to-orange-50/40 px-4 py-5 shadow-sm sm:px-6"}>
          <div className={incorporata ? "flex items-center gap-2" : "flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4"}>
            {!incorporata && (
              <div className="flex min-w-0 items-start gap-3">
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-orange-500 to-eic-amber text-white shadow-[0_4px_12px_rgba(249,115,22,0.3)]">
                  <Settings className="h-5 w-5" />
                </div>
                <div className="min-w-0">
                  <h1 className="text-2xl font-bold tracking-tight">Manutenzione</h1>
                  <p className="text-sm text-muted-foreground">Impianti, contratti e piani di manutenzione dei clienti.</p>
                </div>
              </div>
            )}
            <div className="flex items-center gap-2">{azioni}</div>
          </div>
        </div>
      )}

      {/* Pill in alto — per STATO (come le pill dell'assistenza): Tutti ·
          Scadenza imminente · In regola · Senza piano · Contratti. */}
      <div className="flex gap-1 overflow-x-auto rounded-2xl border border-slate-200 bg-white p-2 shadow-sm">
        {[
          { value: "all", label: "Tutti", icon: ClipboardList, n: impianti.length },
          { value: "urgenti", label: "Scadenza imminente", icon: AlertTriangle, n: nScaduteInScadenza },
          { value: "in_regola", label: "In regola", icon: CheckCircle2, n: contaStato.in_regola },
          { value: "senza_piano", label: "Senza piano", icon: CircleDashed, n: contaStato.senza_piano },
          { value: "__contratti__", label: "Contratti", icon: FileText, n: contratti.length },
        ].map((tab) => {
          const Icon = tab.icon;
          const active = pill === tab.value;
          return (
            <button
              key={tab.value}
              onClick={() => setPill(tab.value)}
              className={cn(
                "tap-compact flex shrink-0 items-center gap-1.5 rounded-xl px-4 py-2 text-sm font-medium transition-all whitespace-nowrap max-sm:h-8 max-sm:rounded-full max-sm:border max-sm:px-3 max-sm:py-0 max-sm:text-xs",
                active ? "bg-orange-50 text-orange-700 shadow-sm ring-1 ring-orange-100" : "text-muted-foreground hover:bg-slate-50 hover:text-slate-900",
              )}
            >
              <Icon className="h-4 w-4" />
              {tab.label}
              <span className={cn("ml-0.5 rounded-full px-1.5 text-[11px] font-semibold tabular-nums", active ? "bg-orange-100 text-orange-700" : "bg-slate-100 text-slate-500")}>{tab.n}</span>
            </button>
          );
        })}
      </div>

      {/* KPI desktop — StatTile come l'assistenza. Su telefono i numeri stanno
          già nelle pillole in alto (come le assistenze): niente riga in più. */}
      <div className="hidden grid-cols-2 gap-2 sm:grid sm:grid-cols-4 sm:gap-3">
        <StatTile label="Impianti" value={impianti.length} tone={impianti.length > 0 ? "blue" : "neutral"} />
        <StatTile label="Da manutenere" value={nScaduteInScadenza} hint="scadute o in scadenza" tone={nScaduteInScadenza > 0 ? "amber" : "neutral"} />
        <StatTile label="Contratti attivi" value={contratti.filter((c) => c.stato === "attivo").length} tone={contratti.some((c) => c.stato === "attivo") ? "green" : "neutral"} />
        <StatTile label="Canoni al mese" value={`${mrr.toLocaleString("it-IT", { maximumFractionDigits: 0, useGrouping: true })} €`} tone={mrr > 0 ? "violet" : "neutral"} />
      </div>

      {(impiantiError || contrattiError || pianiError) && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>Errore nel caricamento. Riprova.</AlertDescription>
        </Alert>
      )}

      {/* Toolbar: ricerca + (per gli impianti) filtro stato e toggle vista */}
      <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
        <div className="relative flex-1 min-w-0 sm:min-w-[220px]">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder={mostraContratti ? "Cerca un contratto…" : "Cerca per cliente o impianto…"}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="h-9 bg-white pl-10"
          />
        </div>
        {/* Toggle elenco/kanban: solo da tablet in su. Su telefono la vista è
            sempre l'elenco compatto, come le assistenze (la pipeline è desktop). */}
        {!mostraContratti && (
          <ToggleGroup type="single" value={vista} onValueChange={(v) => v && cambiaVista(v as "tabella" | "kanban")} className="hidden shrink-0 sm:flex">
            <ToggleGroupItem value="tabella" aria-label="Vista elenco" className="px-3"><List className="h-4 w-4" /></ToggleGroupItem>
            <ToggleGroupItem value="kanban" aria-label="Vista kanban" className="px-3"><Columns3 className="h-4 w-4" /></ToggleGroupItem>
          </ToggleGroup>
        )}
      </div>

      {/* Barra selezione (desktop): l'Esporta in alto segue la selezione. */}
      {selezionati.size > 0 && !mostraContratti && (
        <div className="hidden items-center justify-between gap-2 rounded-xl border border-orange-200 bg-orange-50/60 px-4 py-2 text-sm sm:flex">
          <span className="font-medium text-orange-800">{selezionati.size} impianti selezionati · l'Esporta scarica solo questi</span>
          <Button variant="ghost" size="sm" className="h-8" onClick={() => setSelezionati(new Set())}>Deseleziona</Button>
        </div>
      )}

      {/* Contenuto */}
      {mostraContratti ? (
        loadingContratti ? (
          <div className="space-y-3">{[1, 2].map((n) => <Skeleton key={n} className="h-16 rounded-lg" />)}</div>
        ) : contrattiFiltrati.length === 0 ? (
          <div className="rounded-2xl border border-dashed py-12 text-center text-sm text-muted-foreground">
            {q ? "Nessun contratto con questa ricerca" : "Nessun contratto attivo"}
          </div>
        ) : (
          <div className="space-y-2">
            {contrattiFiltrati.map((c) => (
              <div key={c.id} className="rounded-lg border bg-white p-4 max-sm:px-3 max-sm:py-2.5">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold max-sm:truncate max-sm:text-[13px]">{c.nome_contratto}</span>
                      <Badge className={cn("text-xs capitalize", c.stato === "attivo" ? "bg-emerald-100 text-emerald-700" : c.stato === "sospeso" ? "bg-yellow-100 text-yellow-800" : "bg-slate-100 text-slate-600")}>{c.stato}</Badge>
                    </div>
                    <div className="mt-1 truncate text-sm text-muted-foreground max-sm:text-[11px]">
                      {[c.customer?.first_name, c.customer?.last_name].filter(Boolean).join(" ") || "—"} · {c.impianto?.tipo_impianto?.replace("_", " ")} {c.impianto?.marca}
                    </div>
                  </div>
                  <div className="shrink-0 text-right">
                    <div className="font-bold text-violet-700 max-sm:text-[13px]">{Number(c.importo_canone).toLocaleString("it-IT", { minimumFractionDigits: 2, maximumFractionDigits: 2, useGrouping: true })} €</div>
                    <div className="text-xs text-muted-foreground">{c.tipo_fatturazione}</div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )
      ) : loadingImpianti ? (
        <div className="space-y-3">{[1, 2, 3].map((n) => <Skeleton key={n} className="h-16 rounded-lg" />)}</div>
      ) : impiantiFiltrati.length === 0 ? (
        <div className="rounded-2xl border border-dashed py-12 text-center text-sm text-muted-foreground">
          {q || pill !== "all" ? "Nessun impianto con questi filtri" : (
            <div className="space-y-3">
              <p>Nessun impianto registrato</p>
              <Button size="sm" className="gap-2" onClick={() => setWizardOpen(true)}><Plus className="h-4 w-4" /> Aggiungi impianto</Button>
            </div>
          )}
        </div>
      ) : (
        <>
          {/* Kanban: solo desktop (come la pipeline dell'assistenza). */}
          {vista === "kanban" && (
            <div className="hidden sm:block">
              <ManutenzionePipeline
                impianti={impiantiFiltrati}
                onOpen={openImpianto}
                onPianifica={pianificaImpianto}
                onCompleta={completaImpianto}
                busy={busy}
              />
            </div>
          )}
          {/* Elenco: sempre su telefono; su desktop quando la vista è «tabella». */}
          <div className={vista === "kanban" ? "sm:hidden" : undefined}>
            <ImpiantiTable
              impianti={impiantiFiltrati}
              onOpen={openImpianto}
              selezionati={selezionati}
              onToggle={toggleUno}
              onToggleTutti={toggleTutti}
              tutteSelezionate={tutteSelezionate}
            />
          </div>
        </>
      )}

      <NuovoImpiantoWizard
        open={wizardOpen}
        onClose={() => setWizardOpen(false)}
        companyId={effectiveCompany?.id ?? ""}
        onSuccess={() => {
          queryClient.invalidateQueries({ queryKey: ["impianti", effectiveCompany?.id] });
          queryClient.invalidateQueries({ queryKey: ["contratti-manutenzione", effectiveCompany?.id] });
          queryClient.invalidateQueries({ queryKey: ["piani-attivi", effectiveCompany?.id] });
        }}
      />
    </div>
  );
}
