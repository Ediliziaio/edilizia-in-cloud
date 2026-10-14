import React, { useState, useCallback, useMemo } from "react";
import { Link } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { Plus, Loader2, AlertTriangle, Save, ListChecks, Users, CalendarDays, ArrowUpRight } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { usePermissions } from "@/hooks/usePermissions";
import { useSettingsDraftGuard } from "@/hooks/useSettingsDraftGuard";
import { useSettingsFloatingBar } from "@/hooks/useSettingsFloatingBar";
import { useOrderStatusUsage } from "@/hooks/useOrderStatusUsage";
import { loadCatalogPages } from "@/lib/listino/loadCatalogPages";
import { SQUADRE_OPERAI, CALENDARI_SQUADRE } from "@/lib/manodopera/collegamentiSquadre";
import { useVaiASezione } from "@/hooks/useVaiASezione";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  AmbitoImpostazione,
  IndiceSezioni,
  RigaInterruttore,
  SezioneImpostazione,
  type VoceIndice,
} from "@/components/impostazioni/SezioneImpostazione";
import { AvvisoAreaClienti } from "@/components/impostazioni/AvvisoAreaClienti";
import { AvvisoSolaLetturaImpostazioni } from "@/components/impostazioni/AvvisoSolaLetturaImpostazioni";
import { StatusItem } from "./StatusItem";
import { OrderProgressTracker, type OrderStatus } from "@/components/orders/OrderProgressTracker";
import { cn } from "@/lib/utils";
import { ORDER_WORKFLOW_MODELS, addWorkflowStatuses } from "@/lib/orders/workflowModels";

const PIPELINE_PRESETS = ORDER_WORKFLOW_MODELS;

// Le sezioni, nell'ordine in cui compaiono: quello che si viene a fare (la lista degli stati) per primo.
const SEZIONI: VoceIndice[] = [
  { id: "stati", etichetta: "Stati" },
  { id: "cliente", etichetta: "Cliente" },
];

/** Il database risponde con codici e testi tecnici: al titolare si dice solo cosa fare. */
function messaggioErroreSalvataggioStati(errore: unknown): string {
  // L'errore di una RPC Supabase è un oggetto con `message`, non un Error.
  const grezzo =
    (errore && typeof errore === "object" && "message" in errore && typeof errore.message === "string" && errore.message) || "";
  if (grezzo.includes("status_in_use")) {
    const trovato = grezzo.match(/lo stato "([^"]+)" è associato a (\d+) ordine/);
    if (trovato) {
      const quante = Number(trovato[2]);
      const dove = quante === 1 ? "c'è 1 commessa" : `ci sono ${quante} commesse`;
      return `Non posso eliminare lo stato «${trovato[1]}»: ${dove} in questo stato. Sposta prima le commesse su un altro stato.`;
    }
    return "Non posso eliminare uno stato che ha commesse: sposta prima le commesse su un altro stato.";
  }
  if (grezzo.includes("support_phase_required")) {
    return "Lo stato Assistenza non si può eliminare: la commessa ci passa da sola quando apri un ticket.";
  }
  if (grezzo.includes("forbidden") || grezzo.includes("not_authenticated")) {
    return "Non hai il permesso di modificare gli stati.";
  }
  if (grezzo.includes("almeno 2 stati")) {
    return "Servono almeno 2 stati.";
  }
  return "Non sono riuscito a salvare. Riprova tra poco.";
}

export function OrderStatusConfig() {
  const { effectiveCompany } = useAuth();
  if (!effectiveCompany?.id) return <Alert><AlertDescription>Seleziona un’azienda per consultare gli stati delle commesse.</AlertDescription></Alert>;
  return <OrderStatusConfigCompany key={effectiveCompany.id} />;
}

function OrderStatusConfigCompany() {
  const { effectiveCompany } = useAuth();
  const permissions = usePermissions();
  const company = effectiveCompany;
  const queryClient = useQueryClient();
  // Gli stati si salvano con una funzione del database che chiede «Configurazione Ordini» in modifica.
  const puoModificare = !permissions.isLoading && Boolean(permissions.isAdmin || permissions.canEditSettingsOrders);
  const puoVedereAutomazioni = Boolean(permissions.isAdmin || permissions.canViewAutomazioni);

  // La lista in modifica: finché non si tocca niente c'è solo quella salvata (nessuna copia da tenere allineata).
  const [bozza, setBozza] = useState<OrderStatus[] | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [avvisoInCorso, setAvvisoInCorso] = useState(false);
  const [selectedPreset, setSelectedPreset] = useState<string | null>(null);
  const [previewId, setPreviewId] = useState<string | null>(null);
  const { contenitore, barra, stile, altezza } = useSettingsFloatingBar();
  const vedeCommesse = Boolean(permissions.isAdmin || permissions.canViewOrders);
  const uso = useOrderStatusUsage(company?.id, vedeCommesse);

  // Email al cliente a ogni cambio di stato (trigger trg_cliente_stato_commessa).
  const { data: avvisaCliente, isLoading: caricoAvviso, isError: erroreAvviso, refetch: rileggiAvviso } = useQuery({
    queryKey: ["company-avvisa-cliente-cambio-fase", company?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("companies")
        .select("avvisa_cliente_cambio_fase")
        .eq("id", company!.id)
        .maybeSingle();
      if (error) throw error;
      if (!data) throw new Error("Scelta delle email non disponibile");
      return (data as { avvisa_cliente_cambio_fase?: boolean } | null)?.avvisa_cliente_cambio_fase !== false;
    },
    enabled: !!company?.id,
    staleTime: 5 * 60 * 1000,
  });
  const cambiaAvvisoCliente = async (valore: boolean) => {
    if (!company?.id || !puoModificare || isSaving || avvisoInCorso || caricoAvviso || erroreAvviso || avvisaCliente == null) return;
    const chiave = ["company-avvisa-cliente-cambio-fase", company.id];
    const prima = avvisaCliente;
    queryClient.setQueryData(chiave, valore);
    setAvvisoInCorso(true);
    // `select("id")`: se la regola del database non lascia modificare, l'update non dà errore ma non tocca nessuna riga.
    const { data, error } = await supabase
      .from("companies")
      .update({ avvisa_cliente_cambio_fase: valore } as never)
      .eq("id", company.id)
      .select("id");
    setAvvisoInCorso(false);
    if (error || !data || data.length === 0) {
      queryClient.setQueryData(chiave, prima);
      toast.error(
        error
          ? "Non sono riuscito a salvare la scelta. Riprova tra poco."
          : "Non hai il permesso di cambiare questa scelta: la cambia l'amministratore.",
      );
      return;
    }
    toast.success(valore ? "Il cliente riceverà un'email a ogni cambio di stato." : "Niente più email al cliente sui cambi di stato.");
  };

  const { data: queryData, isLoading, isError, refetch } = useQuery({
    queryKey: ["order-statuses-config", company?.id],
    queryFn: async () => {
      return loadCatalogPages<OrderStatus>((from, to) => supabase.from("order_statuses")
        .select("*").eq("company_id", company!.id).order("position").order("id").range(from, to) as unknown as PromiseLike<{ data: OrderStatus[] | null; error: { message: string } | null }>);
    },
    enabled: !!company?.id,
    staleTime: 5 * 60 * 1000,
  });
  const { evidenziata, vai } = useVaiASezione(!isLoading && !isError);

  const statuses = useMemo<OrderStatus[]>(() => bozza ?? queryData ?? [], [bozza, queryData]);
  const configura = (lista: OrderStatus[]) => lista.map((r) => [r.id, r.name.trim(), r.icon ?? "Circle", r.color, r.is_support_phase === true]);
  const hasChanges = bozza != null && JSON.stringify(configura(bozza)) !== JSON.stringify(configura(queryData ?? []));
  const canChange = puoModificare && !isSaving && !isLoading && !isError;
  useSettingsDraftGuard(hasChanges || isSaving || avvisoInCorso);
  const impedimentoEliminazione = useCallback((s: OrderStatus) => {
    if (s.id.startsWith("temp-")) return undefined;
    if (!vedeCommesse) return undefined; // La RPC verifica comunque gli stati in uso.
    if (uso.isLoading || !uso.data || uso.isError) return "Uso dello stato non disponibile: ricarica il conteggio prima di eliminarlo.";
    return (uso.data[s.id] ?? 0) > 0 ? "Questo stato è usato da commesse: spostale su un altro stato prima di eliminarlo." : undefined;
  }, [vedeCommesse, uso.isLoading, uso.data, uso.isError]);
  // Ogni modifica parte dalla lista che c'è in quel momento (la bozza, o quella salvata se non si è toccato niente).
  const modifica = useCallback(
    (cambia: (lista: OrderStatus[]) => OrderStatus[]) => setBozza((prima) => cambia(prima ?? queryData ?? [])),
    [queryData],
  );

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  // Handle drag end
  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!canChange || !over || active.id === over.id) return;
    modifica((lista) => {
      const oldIndex = lista.findIndex((i) => i.id === active.id);
      const newIndex = lista.findIndex((i) => i.id === over.id);
      if (oldIndex < 0 || newIndex < 0) return lista;
      return arrayMove(lista, oldIndex, newIndex).map((item, index) => ({ ...item, position: index }));
    });
  }

  // Update a single status
  const handleUpdateStatus = useCallback(
    (id: string, updates: Partial<OrderStatus>) => {
      if (!canChange) return;
      modifica((lista) => lista.map((s) => (s.id === id ? { ...s, ...updates } : s)));
    },
    [canChange, modifica],
  );

  // Delete a status — blocca eliminazione dello stato Assistenza
  const handleDeleteStatus = useCallback(
    (id: string) => {
      if (!canChange) return;
      const target = statuses.find((s) => s.id === id);
      if (target && impedimentoEliminazione(target)) return;
      if (target?.is_support_phase) {
        toast.error("Lo stato Assistenza non si può eliminare: la commessa ci passa da sola quando apri un ticket.");
        return;
      }
      modifica((lista) => lista.filter((s) => s.id !== id).map((s, index) => ({ ...s, position: index })));
    },
    [canChange, statuses, modifica, impedimentoEliminazione],
  );

  // Aggiunge un modello senza cancellare stati, nemmeno quelli usati solo da automazioni.
  const applyPreset = useCallback(
    (presetKey: string) => {
      const preset = PIPELINE_PRESETS.find((p) => p.key === presetKey);
      if (!preset || !canChange) return;
      setBozza(addWorkflowStatuses(statuses, preset, () => `temp-${crypto.randomUUID()}`));
      setSelectedPreset(presetKey);
      toast.info(`Modello «${preset.label}» aggiunto alla bozza. Gli stati esistenti restano invariati: controlla e salva.`);
    },
    [canChange, statuses],
  );

  // Add a new status
  const handleAddStatus = useCallback(() => {
    if (!canChange) return;
    modifica((lista) => [
      ...lista,
      { id: `temp-${crypto.randomUUID()}`, name: "Nuovo stato", icon: "Circle", color: "#2563EB", position: lista.length },
    ]);
  }, [canChange, modifica]);

  const annullaModifiche = () => {
    setBozza(null);
    setSelectedPreset(null);
  };

  // Save all changes — usa RPC atomica save_order_statuses (non distruttiva,
  // preserva UUID, storico commesse e current_status_id delle commesse esistenti)
  async function handleSave() {
    if (!canChange || !hasChanges) return;
    if (statuses.length < 2) { toast.error("Servono almeno 2 stati."); return; }
    if (!company?.id) {
      toast.error("Azienda non selezionata: impossibile salvare gli stati.");
      return;
    }

    const normalizedNames = statuses.map((s) => s.name.trim().toLowerCase());
    if (normalizedNames.some((name) => !name)) {
      toast.error("Ogni stato deve avere un nome.");
      return;
    }
    if (new Set(normalizedNames).size !== normalizedNames.length) {
      toast.error("Hai inserito due stati con lo stesso nome.");
      return;
    }

    setIsSaving(true);
    try {
      const payload = statuses.map((s, index) => ({
        // Mantieni UUID solo se è un ID reale (non "temp-*")
        id: s.id && !s.id.startsWith("temp-") ? s.id : undefined,
        name: s.name.trim(),
        icon: s.icon,
        color: s.color,
        position: index,
        is_support_phase: s.is_support_phase === true,
      }));

      const { data, error } = await supabase.rpc("save_order_statuses", {
        p_company_id: company.id,
        p_statuses: payload,
      });

      if (error) throw error;
      if (!Array.isArray(data) || data.length < 2) throw new Error("Conferma del salvataggio non disponibile");

      // Quello che il database ha salvato diventa la lista di partenza: la bozza si chiude.
      if (data) queryClient.setQueryData(["order-statuses-config", company.id], data as OrderStatus[]);
      await queryClient.invalidateQueries({ queryKey: ["order-statuses-config", company.id] });
      await queryClient.invalidateQueries({ queryKey: ["orders", "statuses", company.id] });
      // OrdersList/CreateOrder/Calendar usano la chiave storica "order-statuses":
      // senza questa riga vedevano gli stati vecchi fino a 10 minuti.
      await queryClient.invalidateQueries({ queryKey: ["order-statuses", company.id] });
      await queryClient.invalidateQueries({ queryKey: ["orders"] });
      await queryClient.invalidateQueries({ queryKey: ["dashboard"] });
      await queryClient.invalidateQueries({ queryKey: ["order-statuses-usage", company.id] });
      setBozza(null);
      setSelectedPreset(null);
      toast.success("Stati salvati");
    } catch (error: unknown) {
      toast.error(messaggioErroreSalvataggioStati(error));
    } finally {
      setIsSaving(false);
    }
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12" role="status" aria-label="Caricamento degli stati">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (isError) {
    return (
      <Alert variant="destructive">
        <AlertTriangle className="h-4 w-4" />
        <AlertTitle>Stati non disponibili</AlertTitle>
        <AlertDescription className="space-y-3">
          <p>Non riesco a leggere gli stati. Controlla la connessione e riprova: nessuna modifica verrà salvata.</p>
          <Button variant="outline" size="sm" onClick={() => refetch()}>
            Riprova
          </Button>
        </AlertDescription>
      </Alert>
    );
  }

  const canDeleteStatus = statuses.length > 2;
  const previewStatusId = statuses.some(s => s.id === previewId) ? previewId : statuses[0]?.id;

  return (
    <div className="w-full min-w-0 space-y-4 [&_section]:scroll-mt-44 sm:[&_section]:scroll-mt-32" data-testid="stati-commessa-pagina">
      {!permissions.isLoading && !puoModificare && <AvvisoSolaLetturaImpostazioni permesso="Configurazione Ordini" />}
      <p className="text-sm text-muted-foreground">Gli stati descrivono il percorso operativo della commessa. La pipeline delle Opportunità segue la vendita; le lavorazioni seguono l'avanzamento del cantiere. Pagamenti, materiali e assistenza restano distinti.</p>
      <div ref={contenitore} className="sticky top-2 z-20" style={{ height: altezza }}>
        <div ref={barra} style={stile} className="z-20 flex flex-wrap items-center gap-x-3 gap-y-2 rounded-lg border bg-card/95 px-3 py-2 shadow-sm backdrop-blur">
          <IndiceSezioni voci={SEZIONI} onVai={vai} />
          <div className="ml-auto flex flex-wrap items-center justify-end gap-2">
            {/* A riposo lo stato lo legge solo il lettore di schermo: la barra serve alle scorciatoie e ai pulsanti. */}
            <p
              role="status"
              className={cn(
                "text-xs max-sm:sr-only",
                isSaving || hasChanges ? "text-muted-foreground" : "sr-only",
                hasChanges && !isSaving && "font-medium text-amber-700 dark:text-amber-400",
              )}
            >
              {isSaving ? "Salvataggio…" : hasChanges ? "Modifiche non salvate" : "Nessuna modifica da salvare"}
            </p>
            {hasChanges && (
              <Button size="sm" variant="ghost" onClick={annullaModifiche} disabled={isSaving}>
                <span className="max-sm:sr-only">Annulla le modifiche</span>
                <span className="sm:hidden" aria-hidden="true">Annulla</span>
              </Button>
            )}
            <Button size="sm" onClick={handleSave} disabled={!hasChanges || isSaving}>
              {isSaving ? <Loader2 className="h-4 w-4 animate-spin sm:mr-2" /> : <Save className="h-4 w-4 sm:mr-2" />}
              {/* Da telefono resta l'icona: il nome lo legge comunque il lettore di schermo. */}
              <span>Salva modifiche</span>
            </Button>
          </div>
        </div>
      </div>
      <div className="grid min-w-0 items-start gap-4 xl:grid-cols-[minmax(0,1.7fr)_minmax(0,1fr)]">
      <fieldset disabled={!canChange} className="m-0 min-w-0 space-y-4 border-0 p-0">


        {/* La lista degli stati: è quello che si viene a fare */}
        <SezioneImpostazione
          id="stati"
          titolo="I tuoi stati"
          descrizione="Trascina per riordinare. Le nuove commesse mantengono il primo stato; scegliere un percorso non cambia lo stato attuale."
          evidenziata={evidenziata === "stati"}
        >
          <div className="space-y-3 px-4 py-4">
            <p className="text-xs text-muted-foreground">Primo stato: <strong className="text-foreground">{statuses[0]?.name || "da definire"}</strong>. Per riordinare puoi usare anche le frecce. Gli stati in uso mantengono i collegamenti alle commesse.</p>
            {vedeCommesse && uso.isError && <Alert><AlertDescription>Conteggi delle commesse non disponibili: non sono zero. <Button variant="ghost" size="sm" onClick={() => uso.refetch()}>Ricalcola</Button></AlertDescription></Alert>}
            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
              <SortableContext items={statuses.map((s) => s.id)} strategy={verticalListSortingStrategy}>
                <div className="space-y-2">
                  {statuses.map((status, index) => (
                    <StatusItem
                      key={status.id}
                      status={status}
                      onUpdate={handleUpdateStatus}
                      onDelete={handleDeleteStatus}
                      canDelete={canDeleteStatus}
                      disabled={!canChange}
                      usedBy={vedeCommesse && uso.data && !uso.isError ? (uso.data[status.id] ?? 0) : undefined}
                      deletionBlocked={impedimentoEliminazione(status)}
                      isFirst={index === 0} isLast={index === statuses.length - 1}
                      onMove={(id, direction) => {
                        if (!canChange) return;
                        modifica(lista => { const from = lista.findIndex(s => s.id === id); const to = from + direction; return from < 0 || to < 0 || to >= lista.length ? lista : arrayMove(lista, from, to).map((s, i) => ({ ...s, position: i })); });
                      }}
                    />
                  ))}
                </div>
              </SortableContext>
            </DndContext>

            {statuses.length < 2 && <p className="text-sm text-destructive">Servono almeno 2 stati.</p>}

            <div>
              <Button variant="outline" size="sm" onClick={handleAddStatus}>
                <Plus className="mr-2 h-4 w-4" />
                Aggiungi stato
              </Button>
            </div>

            {puoVedereAutomazioni && (
              <p className="text-xs text-muted-foreground">
                Vuoi che al cambio di stato parta un&apos;azione, per esempio un&apos;email o un&apos;attività? Si fa dalle{" "}
                <Link to="/azienda/automazioni" className="font-medium text-primary underline">
                  Automazioni
                </Link>
                .
              </p>
            )}
          </div>
        </SezioneImpostazione>


        {/* I modelli aggiungono le tappe mancanti, senza toccare stati e collegamenti esistenti. */}
        <details className="rounded-lg border bg-card">
          <summary className="cursor-pointer px-4 py-3">
            <h2 className="inline text-base font-semibold leading-tight">Parti da un elenco pronto</h2>
          </summary>
          <div className="space-y-2 border-t px-4 py-3">
            <p className="text-sm text-muted-foreground">
              Aggiunge solo gli stati mancanti per il tipo di lavoro. Non cancella né modifica quelli esistenti, anche se usati da automazioni o rate. Poi scegli il percorso nella singola commessa. Non cambia niente finché non premi «Salva modifiche».
            </p>
            <div className="flex flex-wrap gap-1.5">
              {PIPELINE_PRESETS.map((p) => (
                <button
                  key={p.key}
                  type="button"
                  onClick={() => applyPreset(p.key)}
                  aria-pressed={selectedPreset === p.key}
                  className={cn(
                    "rounded-full border px-3 py-1 text-xs transition-colors",
                    selectedPreset === p.key
                      ? "border-primary bg-primary/10 font-medium text-primary"
                      : "border-border text-muted-foreground hover:bg-accent",
                  )}
                >
                  {p.label}
                </button>
              ))}
            </div>
            {selectedPreset && (
              <p className="text-xs text-muted-foreground">
                {PIPELINE_PRESETS.find((p) => p.key === selectedPreset)?.hint}
              </p>
            )}
          </div>
        </details>
      </fieldset>
      <aside className="min-w-0 space-y-4" aria-label="Anteprima e collegamenti degli stati">
        {/* Quello che riguarda il cliente: anteprima e avviso */}
        <SezioneImpostazione
          id="cliente"
          titolo="Cosa vede il cliente"
          descrizione="Gli stati compaiono nell'area clienti, e il cliente può essere avvisato a ogni cambio."
          ambito={<AmbitoImpostazione>Area clienti</AmbitoImpostazione>}
          azione={<span>L&apos;interruttore si salva subito</span>}
          evidenziata={evidenziata === "cliente"}
        >
          <div className="space-y-2 px-4 py-4">
            <AvvisoAreaClienti />
            <div>
              <p className="text-sm font-medium">Come lo vede il cliente</p>
              <p className="text-xs text-muted-foreground">Scegli uno stato per provare l’anteprima. Non modifica una commessa.</p>
            </div>
            <label className="block text-xs font-medium">Stato da mostrare nell’anteprima
              <select className="mt-1 h-10 w-full min-w-0 rounded-md border bg-background px-2 text-sm" value={previewStatusId ?? ""} onChange={e => setPreviewId(e.target.value)}>
                {statuses.map(s => <option key={s.id} value={s.id}>{s.name || "Stato senza nome"}</option>)}
              </select>
            </label>
            <div className="py-2">
              <OrderProgressTracker statuses={statuses} currentStatusId={previewStatusId || null} layout="vertical" size="sm" />
            </div>
          </div>
          {erroreAvviso && <Alert variant="destructive"><AlertDescription>Non riesco a leggere la scelta delle email al cliente. <Button variant="outline" size="sm" onClick={() => rileggiAvviso()}>Riprova lettura email</Button></AlertDescription></Alert>}
          <RigaInterruttore
            id="avvisa-cliente-cambio-stato"
            titolo="Avvisa il cliente a ogni cambio di stato"
            descrizione="Il cliente con accesso all'area clienti riceve un'email con il nome del nuovo stato. Spegnilo se gli stati sono solo per l'ufficio o se mandi già tu le email dalle Automazioni."
            checked={avvisaCliente === true}
            onCheckedChange={cambiaAvvisoCliente}
            disabled={!puoModificare || avvisoInCorso || isSaving || caricoAvviso || erroreAvviso}
          />
        </SezioneImpostazione>

        <div className="rounded-lg border bg-card p-4 space-y-3">
          <h3 className="text-sm font-semibold">Dallo stato al lavoro in cantiere</h3>
          {[
            { titolo: "Fasi e avanzamento", testo: "I passaggi del lavoro e l’avanzamento si gestiscono nelle fasi della commessa.", to: "/azienda/impostazioni/modelli-fasi", Icona: ListChecks, visibile: true },
            { titolo: "Squadre e calendari lavori", testo: "Collega i calendari alle risorse già presenti nell’azienda.", to: CALENDARI_SQUADRE, Icona: CalendarDays, visibile: true },
            { titolo: "Operai e squadre interne", testo: "Componenti, responsabile e assegnazioni si gestiscono in Manodopera e Mezzi.", to: SQUADRE_OPERAI, Icona: Users, visibile: permissions.isAdmin || permissions.canViewOperai },
          ].filter(c => c.visibile).map(({ titolo, testo, to, Icona }) => <Link key={to} to={to} className="flex items-start gap-2 rounded-md p-2 hover:bg-muted/40 focus-visible:ring-2 focus-visible:ring-ring"><Icona className="mt-0.5 h-4 w-4 shrink-0 text-primary" /><span className="min-w-0 flex-1"><span className="block text-sm font-medium">{titolo}</span><span className="block text-xs text-muted-foreground mt-0.5">{testo}</span></span><ArrowUpRight className="h-3.5 w-3.5 text-muted-foreground" /></Link>)}
        </div>
      </aside>
      </div>
    </div>
  );
}
