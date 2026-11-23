import { cambiaTipoCliente, datiClienteMancanti, ePrivato, nomeCliente } from "@/lib/fatturazione/clienteSnapshot";
import { useState, useMemo } from "react";
import { Search, X, ChevronDown, Plus, MapPin, Building2, Pencil, AlertTriangle } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { CampoIndirizzo } from "@/components/shared/CampoIndirizzo";
import { campiDaTrovato } from "@/lib/indirizzi/ricercaIndirizzi";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useEffectiveCompanyId } from "@/hooks/useEffectiveCompanyId";
import { useAnagraficheNative } from "@/hooks/useAnagraficheNative";
import { validaPartitaIva, validaCodiceFiscale } from "@/lib/fatturazione/validazioniAnagrafiche";
import {
  payloadAnagrafica, problemiNuovoCliente, pulisciNuovoCliente, snapshotDaForm,
  type NuovoClienteForm,
} from "@/lib/fatturazione/clienteAnagrafica";
import type { ClienteSnapshot } from "@/types/fatturazione";
import { riferimentiDelCliente, type EditorState } from "./useEditorState";
import { useT } from "@/lib/campo/lingua/LinguaCampo";

interface Props {
  state: EditorState;
  dispatch: React.Dispatch<any>;
  disabled?: boolean;
}

function getInitials(name: string): string {
  return name.split(/\s+/).slice(0, 2).map((w) => w[0]?.toUpperCase() ?? "").join("");
}

const AVATAR_COLORS = [
  "bg-primary/20 text-primary",
  "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400",
  "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400",
  "bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-400",
];

function avatarColor(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
}

const TIPO_BADGE: Record<string, { label: string; className: string }> = {
  B2B: { label: "Azienda", className: "bg-primary/10 text-primary" },
  B2C: { label: "Privato", className: "bg-slate-200 text-slate-700 dark:bg-slate-800 dark:text-slate-300" },
  PA: { label: "PA", className: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400" },
  Estero: { label: "Estero", className: "bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-400" },
};

type NewClientForm = NuovoClienteForm;

/** Il tipo da mostrare: chi ha la nazione fuori dall'Italia è «Estero» anche se scritto come azienda. */
function tipoMostrato(s: ClienteSnapshot): keyof typeof TIPO_BADGE {
  if (s.tipo_cliente === "PA") return "PA";
  if (s.tipo_cliente === "Estero" || (s.indirizzo_nazione && s.indirizzo_nazione.toUpperCase() !== "IT")) return "Estero";
  return s.tipo_cliente === "B2C" ? "B2C" : "B2B";
}

const CAMPI_INDIRIZZO_CLIENTE = {
  via: "indirizzo_via", cap: "indirizzo_cap", citta: "indirizzo_comune", provincia: "indirizzo_provincia",
} as const;

export function EditorClienteSection({ state, dispatch, disabled }: Props) {
  const tr = useT();
  const [search, setSearch] = useState("");
  const [occasionaleOpen, setOccasionaleOpen] = useState(false);
  const [nomeOccasionale, setNomeOccasionale] = useState("");
  const [isOpen, setIsOpen] = useState(false);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [editingSnapshot, setEditingSnapshot] = useState(false);
  const [showNewForm, setShowNewForm] = useState(false);
  const [newClientTab, setNewClientTab] = useState<"B2C" | "B2B" | "PA">("B2B");
  const [newForm, setNewForm] = useState<NewClientForm>({ tipo: "B2B" });
  const [salvataggio, setSalvataggio] = useState(false);
  const companyId = useEffectiveCompanyId();
  const queryClient = useQueryClient();

  // Get all clients (empty search returns up to 100)
  const { data: anagrafiche } = useAnagraficheNative(search);

  const snapshot = state.cliente_snapshot;
  // Un cliente scelto dall'anagrafica ma senza nome (succede: i privati importati hanno
  // solo codice fiscale e indirizzo) resta davanti agli occhi, da completare: prima
  // spariva e sembrava di non aver scelto niente.
  // Mentre lo si modifica resta aperto anche col nome vuoto: chi cancella il nome per
  // scriverne un altro non deve ritrovarsi davanti la ricerca, senza i dati.
  const hasCliente = !!nomeCliente(snapshot) || !!state.anagrafica_id || (editingSnapshot && !!snapshot);
  const mancanti = snapshot ? datiClienteMancanti(snapshot) : [];

  const filtered = useMemo(() => {
    if (!anagrafiche) return [];
    return (anagrafiche as Record<string, unknown>[]).slice(0, 100);
  }, [anagrafiche]);

  function selectCliente(a: Record<string, unknown>) {
    const tipoCliente = (a.tipo_cliente as ClienteSnapshot["tipo_cliente"]) ?? "B2B";
    const nome = a.nome as string | undefined;
    const cognome = a.cognome as string | undefined;
    // «||» e non «??»: una ragione sociale vuota ("") non vale come nome.
    const ragioneSociale = (a.ragione_sociale as string) || `${nome ?? ""} ${cognome ?? ""}`.trim();
    const snap: ClienteSnapshot = {
      ragione_sociale: ragioneSociale,
      // For B2C (persone fisiche), copy nome/cognome separately for FatturaPA XML
      ...(tipoCliente === "B2C" && nome ? { nome } : {}),
      ...(tipoCliente === "B2C" && cognome ? { cognome } : {}),
      partita_iva: a.partita_iva as string | undefined,
      codice_fiscale: a.codice_fiscale as string | undefined,
      codice_sdi: a.codice_sdi as string | undefined,
      pec: a.pec as string | undefined,
      indirizzo_via: a.indirizzo_via as string | undefined,
      indirizzo_cap: a.indirizzo_cap as string | undefined,
      indirizzo_comune: a.indirizzo_comune as string | undefined,
      indirizzo_provincia: a.indirizzo_provincia as string | undefined,
      indirizzo_nazione: (a.indirizzo_nazione as string) ?? "IT",
      tipo_cliente: tipoCliente,
      // Ente che non applica lo split (anagrafica, lotto 1): decide il valore di partenza.
      ...(typeof a.split_payment === "boolean" ? { split_payment: a.split_payment } : {}),
      // CIG/CUP scritti sul cliente: la fattura li propone come riferimento «dall'anagrafica».
      ...(a.cig ? { cig: String(a.cig) } : {}),
      ...(a.cup ? { cup: String(a.cup) } : {}),
    };
    dispatch({ type: "SET_CLIENTE", anagrafica_id: a.id as string, snapshot: snap });
    setSearch("");
    setIsOpen(false);
    setShowNewForm(false);
    setDetailsOpen(true); // Auto-open details when selecting a client
    // Anagrafica senza nome (o con dati mancanti): si apre già in modifica.
    if (datiClienteMancanti(snap).length > 0) setEditingSnapshot(true);
  }

  // Update a field on the existing snapshot
  function updateSnapshotField(field: keyof ClienteSnapshot, value: string | undefined) {
    if (!snapshot) return;
    const updated = { ...snapshot, [field]: value };
    dispatch({ type: "SET_CLIENTE", anagrafica_id: state.anagrafica_id ?? "", snapshot: updated });
  }

  // L'indirizzo scelto dalla ricerca scrive via, CAP, comune e provincia in un colpo solo:
  // quattro updateSnapshotField di fila partirebbero tutti dallo stesso snapshot e l'ultimo coprirebbe gli altri.
  function updateSnapshotFields(patch: Partial<ClienteSnapshot>) {
    if (!snapshot) return;
    dispatch({ type: "SET_CLIENTE", anagrafica_id: state.anagrafica_id ?? "", snapshot: { ...snapshot, ...patch } });
  }

  // Dalla lista a mano: i dati restano sul documento da modificare, l'anagrafica si
  // sgancia. Così «Fine modifica» non riscrive il cliente scelto prima, e righe, date,
  // pagamento e note non si toccano.
  function passaAManuale() {
    if (!snapshot) return;
    dispatch({ type: "SET_CLIENTE", anagrafica_id: "", snapshot });
    setDetailsOpen(true);
    setEditingSnapshot(true);
  }

  // Create quick B2C client (occasionale)
  function createQuickB2C(name: string) {
    if (!name.trim()) return;
    const parti = name.trim().split(/\s+/);
    const snap: ClienteSnapshot = {
      ragione_sociale: name.trim(),
      ...(parti.length > 1 ? { nome: parti[0], cognome: parti.slice(1).join(" ") } : {}),
      tipo_cliente: "B2C",
      indirizzo_nazione: "IT",
    };
    dispatch({ type: "SET_CLIENTE", anagrafica_id: "", snapshot: snap });
    setSearch("");
    setIsOpen(false);
    setShowNewForm(false);
    setDetailsOpen(true);
    setEditingSnapshot(true); // codice fiscale e indirizzo da inserire
  }

  // Il cliente nuovo entra in anagrafica (così alla prossima fattura lo si ritrova) e poi
  // viene scelto sul documento. Se la partita IVA o il codice fiscale ci sono già, si usa
  // il cliente che c'è, senza doppioni.
  async function createNewClient() {
    const problemi = problemiNuovoCliente(newForm);
    if (problemi.length > 0) {
      toast.error(tr("Per creare il cliente manca: {problemi}", { problemi: problemi.join(", ") }));
      return;
    }
    if (!companyId) {
      toast.error(tr("Azienda non ancora caricata: riprova tra un attimo."));
      return;
    }
    const form = pulisciNuovoCliente(newForm);
    const snap = snapshotDaForm(form);
    setSalvataggio(true);
    try {
      let esistente: Record<string, unknown> | null = null;
      const chiavi: [string, string | undefined][] = [["partita_iva", form.partitaIva], ["codice_fiscale", form.codiceFiscale]];
      for (const [colonna, valore] of chiavi) {
        if (!valore || esistente) continue;
        const { data } = await supabase.from("anagrafiche_native" as never).select("*")
          .eq("company_id", companyId).eq(colonna, valore).eq("attivo", true).limit(1);
        esistente = ((data as unknown as Record<string, unknown>[] | null) ?? [])[0] ?? null;
      }
      if (esistente) {
        toast.info(tr("Questo cliente è già in anagrafica: l'ho scelto."));
        selectCliente(esistente);
        setNewForm({ tipo: "B2B" });
        return;
      }
      const { data, error } = await supabase.from("anagrafiche_native" as never)
        .insert({ ...payloadAnagrafica(snap), company_id: companyId } as never)
        .select("id").single();
      if (error) throw error;
      queryClient.invalidateQueries({ queryKey: ["anagrafiche-native"] });
      dispatch({ type: "SET_CLIENTE", anagrafica_id: (data as unknown as { id: string }).id, snapshot: snap });
      toast.success(tr("Cliente creato e salvato in anagrafica"));
      setNewForm({ tipo: "B2B" });
      setShowNewForm(false);
      setSearch("");
      setIsOpen(false);
      setDetailsOpen(true);
    } catch (e) {
      toast.error(tr("Cliente non creato"), { description: (e as { message?: string })?.message ?? tr("Errore sconosciuto") });
    } finally {
      setSalvataggio(false);
    }
  }

  // «Fine modifica»: i dati corretti sul documento tornano anche nell'anagrafica del
  // cliente (nome e cognome di un privato importato, indirizzo, codice fiscale…).
  async function fineModifica() {
    setEditingSnapshot(false);
    if (!snapshot || !state.anagrafica_id || !companyId) return;
    const pulita = pulisciNuovoCliente({
      tipo: ePrivato(snapshot) ? "B2C" : snapshot.tipo_cliente === "PA" ? "PA" : "B2B",
      nome: snapshot.nome, cognome: snapshot.cognome, ragioneSociale: snapshot.ragione_sociale,
      partitaIva: snapshot.partita_iva, codiceFiscale: snapshot.codice_fiscale, codiceSdi: snapshot.codice_sdi,
      pec: snapshot.pec, indirizzo_via: snapshot.indirizzo_via, indirizzo_cap: snapshot.indirizzo_cap,
      indirizzo_comune: snapshot.indirizzo_comune, indirizzo_provincia: snapshot.indirizzo_provincia,
      indirizzo_nazione: snapshot.indirizzo_nazione,
    });
    const aggiornata = { ...snapshotDaForm(pulita), tipo_cliente: snapshot.tipo_cliente };
    dispatch({ type: "SET_CLIENTE", anagrafica_id: state.anagrafica_id, snapshot: aggiornata });
    const { tipo, attivo, ...campi } = payloadAnagrafica(aggiornata);
    void tipo; void attivo;
    const { error } = await supabase.from("anagrafiche_native" as never)
      .update(campi as never).eq("id", state.anagrafica_id).eq("company_id", companyId);
    if (error) toast.error(tr("Dati non salvati in anagrafica"), { description: error.message });
    else queryClient.invalidateQueries({ queryKey: ["anagrafiche-native"] });
  }

  // Validation
  const pivaError = newForm.partitaIva && newForm.partitaIva.length > 0 && !validaPartitaIva(newForm.partitaIva).valida
    ? validaPartitaIva(newForm.partitaIva).errore
    : undefined;
  const cfError = newForm.codiceFiscale && newForm.codiceFiscale.length > 0 && !validaCodiceFiscale(newForm.codiceFiscale).valida
    ? validaCodiceFiscale(newForm.codiceFiscale).errore
    : undefined;

  const problemiNuovo = showNewForm ? problemiNuovoCliente(newForm) : [];

  return (
    <div className="rounded-lg border bg-card p-3 space-y-2 border-l-[3px] border-l-primary/60 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1">
        <Label className="whitespace-nowrap text-[11px] font-bold uppercase tracking-wider text-primary/80">
          {state.tipo === "reverse_charge_interno"
            ? tr("Fornitore")
            : ["integrazione_servizi_estero", "integrazione_beni_ue", "integrazione_beni_extra_ue"].includes(state.tipo)
            ? tr("Fornitore Estero")
            : tr("Cliente / Committente")}
        </Label>
        {hasCliente && !disabled && (
          <div className="ml-auto flex items-center gap-1">
            {state.anagrafica_id && snapshot && (
              <Button variant="ghost" size="sm" className="h-6 text-[11px] px-1.5 text-muted-foreground" onClick={passaAManuale}>
                {tr("Inserisci a mano")}
              </Button>
            )}
            <Button
              variant="outline"
              size="sm"
              className="h-6 text-[11px] px-2"
              onClick={() => { setDetailsOpen(true); setEditingSnapshot(true); }}
            >
              <Pencil className="h-3 w-3 mr-1" />
              {tr("Modifica")}
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="h-6 text-[11px] px-2"
              onClick={() => {
                const tolti = riferimentiDelCliente(state);
                if (tolti.length > 0) {
                  toast.info(tr("Tolti dalla fattura i dati del cliente precedente: {tolti}", { tolti: tolti.join(", ") }), {
                    description: tr("Appartengono all'appalto di quel cliente. Se servono anche per il nuovo, riscrivili nella sezione Commessa e riferimenti PA."),
                  });
                }
                dispatch({ type: "CLEAR_CLIENTE" });
                setDetailsOpen(false);
                setEditingSnapshot(false);
              }}
            >
              <X className="h-3 w-3 mr-1" />
              {tr("Cambia")}
            </Button>
          </div>
        )}
      </div>

      {hasCliente ? (
        <div>
          {/* ─── Scheda compatta: il tipo in evidenza e i dati che servono per fatturare ─── */}
          <div className="flex items-start gap-2.5">
            {(() => {
              const t = tipoMostrato(snapshot!);
              return (
                <Badge variant="secondary" className={`mt-0.5 h-5 shrink-0 px-2 text-[10px] font-semibold ${TIPO_BADGE[t].className}`} data-testid="tipo-cliente">
                  {tr(TIPO_BADGE[t].label)}
                </Badge>
              );
            })()}
            <div className="min-w-0 flex-1">
              <div className="font-semibold text-sm leading-tight truncate">
                {nomeCliente(snapshot) || <span className="text-amber-600">{tr("Cliente senza nome")}</span>}
              </div>
              <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11px] text-muted-foreground">
                {snapshot!.partita_iva ? (
                  <span><span className="text-muted-foreground/70">P.IVA</span> <span className="font-mono text-foreground">{snapshot!.partita_iva}</span></span>
                ) : snapshot!.codice_fiscale ? (
                  <span><span className="text-muted-foreground/70">CF</span> <span className="font-mono uppercase text-foreground">{snapshot!.codice_fiscale}</span></span>
                ) : (
                  <span className="text-amber-600">{tr("P.IVA o CF mancante")}</span>
                )}
                {snapshot!.tipo_cliente === "PA" ? (
                  snapshot!.ufficio_pa ? (
                    <span title={snapshot!.ufficio_pa.descrizione ?? undefined}><span className="text-muted-foreground/70">{tr("Ufficio")}</span> <span className="font-mono text-foreground">{snapshot!.ufficio_pa.codice}</span>{snapshot!.ufficio_pa.descrizione ? ` · ${snapshot!.ufficio_pa.descrizione}` : ""}</span>
                  ) : snapshot!.codice_sdi ? (
                    <span><span className="text-muted-foreground/70">{tr("Ufficio")}</span> <span className="font-mono text-foreground">{snapshot!.codice_sdi}</span></span>
                  ) : (
                    <span className="text-amber-600">{tr("Codice ufficio mancante")}</span>
                  )
                ) : snapshot!.codice_sdi ? (
                  <span><span className="text-muted-foreground/70">{tr("Cod. destinatario")}</span> <span className="font-mono text-foreground">{snapshot!.codice_sdi}</span></span>
                ) : null}
                {snapshot!.pec && <span className="min-w-0 truncate"><span className="text-muted-foreground/70">PEC</span> <span className="text-foreground">{snapshot!.pec}</span></span>}
                {state.esigibilita_iva === "S" && <span className="rounded bg-blue-50 px-1 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300">{tr("Split payment")}</span>}
              </div>
            </div>
          </div>

          {/* Cosa manca per poter fatturare a questo cliente. */}
          {mancanti.length > 0 && ePrivato(snapshot) && (
            <div className="mt-2 flex items-start gap-1.5 rounded border border-amber-200 bg-amber-50 p-2 text-[11px] text-amber-800" role="alert">
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              <span>
                {tr("Per fatturare a un privato servono nome, cognome, codice fiscale e indirizzo. Manca:")} {mancanti.join(", ")}.
                {!disabled && !editingSnapshot && (
                  <button className="ml-1 font-semibold underline" onClick={() => { setDetailsOpen(true); setEditingSnapshot(true); }}>{tr("Completa i dati")}</button>
                )}
              </span>
            </div>
          )}

          {/* ─── Expandable Full Detail Panel ─── */}
          <Collapsible open={detailsOpen} onOpenChange={setDetailsOpen}>
            <CollapsibleTrigger asChild>
              <button className="mt-1 flex items-center gap-1 rounded px-1 py-0.5 text-[10px] text-muted-foreground transition-colors hover:bg-muted/50 hover:text-foreground">
                <ChevronDown className={`h-2.5 w-2.5 transition-transform ${detailsOpen ? "rotate-180" : ""}`} />
                {detailsOpen ? tr("Chiudi dettagli") : tr("Indirizzo e dettagli")}
              </button>
            </CollapsibleTrigger>
            <CollapsibleContent className="pt-2 space-y-3 animate-in fade-in-50">
              {/* Fiscal data section */}
              <div className="space-y-2">
                <div className="flex items-center gap-1.5 text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
                  <Building2 className="h-3 w-3" />
                  {tr("Dati Fiscali")}
                </div>
                {editingSnapshot && !disabled ? (
                  <div className="grid grid-cols-2 gap-2">
                    {/* Scritto a mano si può cambiare natura; quello in anagrafica la tiene. */}
                    {!state.anagrafica_id && (
                      <div className="col-span-2 flex gap-1">
                        {([["B2B", "Azienda"], ["B2C", "Privato"], ["PA", "Ente PA"]] as const).map(([tipo, etichetta]) => (
                          <Button
                            key={tipo}
                            type="button"
                            variant={(snapshot!.tipo_cliente ?? "B2B") === tipo ? "default" : "outline"}
                            size="sm"
                            className="h-6 flex-1 text-[10px]"
                            onClick={() => dispatch({ type: "SET_CLIENTE", anagrafica_id: "", snapshot: cambiaTipoCliente(snapshot!, tipo) })}
                          >
                            {tr(etichetta)}
                          </Button>
                        ))}
                      </div>
                    )}
                    {snapshot!.tipo_cliente === "B2C" ? (
                      <>
                        <div>
                          <Label htmlFor="cliente-nome" className="text-[9px] text-muted-foreground">{tr("Nome *")}</Label>
                          <Input id="cliente-nome" value={snapshot!.nome ?? ""} onChange={(e) => updateSnapshotField("nome", e.target.value)} className="h-6 text-[11px]" />
                        </div>
                        <div>
                          <Label htmlFor="cliente-cognome" className="text-[9px] text-muted-foreground">{tr("Cognome *")}</Label>
                          <Input id="cliente-cognome" value={snapshot!.cognome ?? ""} onChange={(e) => updateSnapshotField("cognome", e.target.value)} className="h-6 text-[11px]" />
                        </div>
                      </>
                    ) : (
                      <div>
                        <Label htmlFor="cliente-ragione-sociale" className="text-[9px] text-muted-foreground">{tr("Ragione Sociale")}</Label>
                        <Input id="cliente-ragione-sociale" value={snapshot!.ragione_sociale ?? ""} onChange={(e) => updateSnapshotField("ragione_sociale", e.target.value)} className="h-6 text-[11px]" />
                      </div>
                    )}
                    <div>
                      <Label className="text-[9px] text-muted-foreground">P.IVA</Label>
                      <Input value={snapshot!.partita_iva ?? ""} onChange={(e) => updateSnapshotField("partita_iva", e.target.value)} className="h-6 text-[11px] font-mono" />
                    </div>
                    <div>
                      <Label className="text-[9px] text-muted-foreground">{tr("Codice Fiscale")}</Label>
                      <Input value={snapshot!.codice_fiscale ?? ""} onChange={(e) => updateSnapshotField("codice_fiscale", e.target.value)} className="h-6 text-[11px] font-mono uppercase" />
                    </div>
                    <div>
                      <Label className="text-[9px] text-muted-foreground">{snapshot!.tipo_cliente === "PA" ? tr("Codice Univoco Ufficio") : tr("Codice SDI")}</Label>
                      {/* PA: Codice Univoco Ufficio, esattamente 6 caratteri; privati: 7. Solo A-Z/0-9 (SDI rifiuta altri caratteri). */}
                      <Input
                        value={snapshot!.codice_sdi ?? ""}
                        onChange={(e) => updateSnapshotField("codice_sdi", e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, snapshot!.tipo_cliente === "PA" ? 6 : 7))}
                        className="h-6 text-[11px] font-mono"
                        maxLength={snapshot!.tipo_cliente === "PA" ? 6 : 7}
                      />
                    </div>
                    <div className="col-span-2">
                      <Label className="text-[9px] text-muted-foreground">PEC</Label>
                      <Input value={snapshot!.pec ?? ""} onChange={(e) => updateSnapshotField("pec", e.target.value)} className="h-6 text-[11px]" />
                    </div>
                  </div>
                ) : (
                  <div className="space-y-1.5">
                    <div className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-[11px]">
                      <span className="text-muted-foreground">P.IVA</span>
                      {snapshot!.partita_iva ? (
                        <span className="font-mono">{snapshot!.partita_iva}</span>
                      ) : (
                        <span className="text-amber-600 italic text-[10px]">{tr("Non inserita")}</span>
                      )}

                      <span className="text-muted-foreground">CF</span>
                      {snapshot!.codice_fiscale ? (
                        <span className="font-mono uppercase">{snapshot!.codice_fiscale}</span>
                      ) : (
                        <span className="text-amber-600 italic text-[10px]">{tr("Non inserito")}</span>
                      )}

                      <span className="text-muted-foreground">SDI</span>
                      {snapshot!.codice_sdi ? (
                        <span className="font-mono">{snapshot!.codice_sdi}</span>
                      ) : (
                        <span className="text-amber-600 italic text-[10px]">{tr("Non inserito")}</span>
                      )}

                      <span className="text-muted-foreground">PEC</span>
                      {snapshot!.pec ? (
                        <span className="truncate">{snapshot!.pec}</span>
                      ) : (
                        <span className="text-muted-foreground/50 italic text-[10px]">—</span>
                      )}
                    </div>

                    {/* Warning for missing required fiscal data */}
                    {!snapshot!.partita_iva && !snapshot!.codice_fiscale && (
                      <div className="flex items-start gap-1.5 p-2 rounded bg-amber-50 border border-amber-200 text-[10px] text-amber-700">
                        <AlertTriangle className="h-3 w-3 shrink-0 mt-0.5" />
                        <span>{tr("Per la fatturazione elettronica serve almeno P.IVA o Codice Fiscale. Clicca \"Modifica dati cliente\" per inserirli.")}</span>
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Address section */}
              <div className="space-y-2">
                <div className="flex items-center gap-1.5 text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
                  <MapPin className="h-3 w-3" />
                  {tr("Indirizzo")}
                </div>
                {editingSnapshot && !disabled ? (
                  <div className="grid grid-cols-2 gap-2">
                    <div className="col-span-2">
                      <Label htmlFor="cliente-indirizzo-via" className="text-[9px] text-muted-foreground">{tr("Via/Indirizzo")}</Label>
                      <CampoIndirizzo
                        id="cliente-indirizzo-via"
                        value={snapshot!.indirizzo_via ?? ""}
                        onChange={(v) => updateSnapshotField("indirizzo_via", v)}
                        onScegli={(a) => updateSnapshotFields(campiDaTrovato(a, CAMPI_INDIRIZZO_CLIENTE))}
                        className="h-6 text-[11px]"
                        placeholder={tr("Via Roma 1")}
                      />
                    </div>
                    <div>
                      <Label className="text-[9px] text-muted-foreground">CAP</Label>
                      <Input value={snapshot!.indirizzo_cap ?? ""} onChange={(e) => updateSnapshotField("indirizzo_cap", e.target.value)} className="h-6 text-[11px]" maxLength={5} placeholder="00100" />
                    </div>
                    <div>
                      <Label className="text-[9px] text-muted-foreground">{tr("Comune")}</Label>
                      <Input value={snapshot!.indirizzo_comune ?? ""} onChange={(e) => updateSnapshotField("indirizzo_comune", e.target.value)} className="h-6 text-[11px]" placeholder={tr("Roma")} />
                    </div>
                    <div>
                      <Label className="text-[9px] text-muted-foreground">{tr("Provincia")}</Label>
                      <Input value={snapshot!.indirizzo_provincia ?? ""} onChange={(e) => updateSnapshotField("indirizzo_provincia", e.target.value)} className="h-6 text-[11px] uppercase" maxLength={2} placeholder="RM" />
                    </div>
                    <div>
                      <Label className="text-[9px] text-muted-foreground">{tr("Nazione")}</Label>
                      <Input value={snapshot!.indirizzo_nazione ?? "IT"} onChange={(e) => updateSnapshotField("indirizzo_nazione", e.target.value)} className="h-6 text-[11px] uppercase" maxLength={2} placeholder="IT" />
                    </div>
                  </div>
                ) : (
                  <div className="text-[11px]">
                    {snapshot!.indirizzo_via ? (
                      <div className="space-y-0.5">
                        <p>{snapshot!.indirizzo_via}</p>
                        <p className="text-muted-foreground">
                          {[snapshot!.indirizzo_cap, snapshot!.indirizzo_comune, snapshot!.indirizzo_provincia ? `(${snapshot!.indirizzo_provincia})` : null].filter(Boolean).join(" ")}
                          {snapshot!.indirizzo_nazione && snapshot!.indirizzo_nazione !== "IT" ? ` — ${snapshot!.indirizzo_nazione}` : ""}
                        </p>
                      </div>
                    ) : (
                      <p className="text-muted-foreground italic">{tr("Nessun indirizzo inserito")}</p>
                    )}
                  </div>
                )}
              </div>

              {/* Edit toggle button */}
              {!disabled && (
                <Button
                  variant={editingSnapshot ? "default" : "outline"}
                  size="sm"
                  className="w-full h-6 text-[10px] gap-1"
                  onClick={() => (editingSnapshot ? void fineModifica() : setEditingSnapshot(true))}
                >
                  <Pencil className="h-2.5 w-2.5" />
                  {editingSnapshot ? tr("Fine modifica") : tr("Modifica dati cliente")}
                </Button>
              )}
            </CollapsibleContent>
          </Collapsible>

        </div>
      ) : (
        !disabled && (
          <div className="relative space-y-2">
            {/* Una riga: cerca, oppure crea un cliente nuovo o occasionale. */}
            <div className="flex flex-col gap-1.5 sm:flex-row">
              <div className="relative min-w-0 flex-1">
                <Search className="absolute left-2 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
                <Input
                  placeholder={tr("Cerca cliente per nome, P.IVA o CF...")}
                  value={search}
                  onChange={(e) => { setSearch(e.target.value); setIsOpen(true); }}
                  onFocus={() => setIsOpen(true)}
                  className="pl-7 h-9 text-sm"
                />
              </div>
              {!showNewForm && (
                <div className="flex gap-1.5">
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-9 flex-1 px-3 text-xs sm:flex-none"
                    onClick={() => { setShowNewForm(true); setIsOpen(false); }}
                  >
                    <Plus className="h-3.5 w-3.5 mr-1" />
                    {tr("Nuovo cliente")}
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-9 flex-1 px-3 text-xs sm:flex-none"
                    onClick={() => {
                      setNomeOccasionale("");
                      setOccasionaleOpen(true);
                      setIsOpen(false);
                    }}
                  >
                    {tr("Occasionale")}
                  </Button>
                </div>
              )}
            </div>

            {/* Dropdown list */}
            {isOpen && (
              <div className="absolute z-50 w-full mt-1 border rounded-md bg-popover shadow-lg max-h-56 overflow-auto">
                {filtered.length > 0 ? (
                  filtered.map((a) => {
                    const nomeAnagrafica = (a.ragione_sociale as string) || `${a.nome ?? ""} ${a.cognome ?? ""}`.trim();
                    // Privato importato senza nome: si riconosce dal codice fiscale e dal comune.
                    const name = nomeAnagrafica || tr("Privato senza nome");
                    const tipoCliente = a.tipo_cliente as string | undefined;
                    const addr = [a.indirizzo_comune as string, a.indirizzo_provincia as string].filter(Boolean).join(" ");
                    return (
                      <button
                        key={a.id as string}
                        className="w-full text-left px-2.5 py-2 hover:bg-accent text-xs flex items-center gap-2 border-b last:border-b-0 transition-colors"
                        onClick={() => selectCliente(a)}
                      >
                        <div className={`h-7 w-7 rounded-full flex items-center justify-center text-[9px] font-bold shrink-0 ${avatarColor(name)}`}>
                          {getInitials(name)}
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="font-medium truncate">{name}</div>
                          <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
                            {a.partita_iva && <span className="font-mono">{a.partita_iva as string}</span>}
                            {!a.partita_iva && a.codice_fiscale && <span className="font-mono">CF {a.codice_fiscale as string}</span>}
                            {addr && <span>{addr}</span>}
                          </div>
                        </div>
                        {tipoCliente && TIPO_BADGE[tipoCliente] && (
                          <Badge variant="secondary" className={`text-[8px] px-1 h-3.5 shrink-0 ${TIPO_BADGE[tipoCliente]?.className ?? ""}`}>
                            {tr(TIPO_BADGE[tipoCliente]?.label ?? "")}
                          </Badge>
                        )}
                      </button>
                    );
                  })
                ) : (
                  <div className="px-3 py-2 text-[11px] text-muted-foreground">{tr("Nessun cliente trovato")}</div>
                )}
              </div>
            )}

            {/* Nuovo cliente */}
            {showNewForm ? (
              <div className="border rounded-md p-3 space-y-3 bg-muted/30 animate-in fade-in-50 slide-in-from-top-2">
                <Tabs value={newClientTab} onValueChange={(v) => {
                  const tipo = v as "B2C" | "B2B" | "PA";
                  setNewClientTab(tipo);
                  setNewForm({ tipo });
                }}>
                  <TabsList className="grid w-full grid-cols-3 h-7">
                    <TabsTrigger value="B2B" className="text-[10px]">{tr("Azienda")}</TabsTrigger>
                    <TabsTrigger value="B2C" className="text-[10px]">{tr("Privato")}</TabsTrigger>
                    <TabsTrigger value="PA" className="text-[10px]">{tr("Ente PA")}</TabsTrigger>
                  </TabsList>

                  {/* B2B form */}
                  <TabsContent value="B2B" className="space-y-2 mt-2">
                    <div>
                      <Label className="text-[10px]">{tr("Ragione Sociale *")}</Label>
                      <Input placeholder={tr("Nome azienda")} value={newForm.ragioneSociale ?? ""} onChange={(e) => setNewForm({ ...newForm, ragioneSociale: e.target.value })} className="h-7 text-xs" />
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <Label className="text-[10px]">P.IVA</Label>
                        <Input placeholder={tr("11 cifre")} value={newForm.partitaIva ?? ""} onChange={(e) => setNewForm({ ...newForm, partitaIva: e.target.value.replace(/\s+/g, "") })} className="h-7 text-xs font-mono" />
                        {pivaError && <p className="text-[9px] text-destructive mt-0.5">{pivaError}</p>}
                      </div>
                      <div>
                        <Label className="text-[10px]">{tr("Codice Fiscale")}</Label>
                        <Input placeholder="CF" value={newForm.codiceFiscale ?? ""} onChange={(e) => setNewForm({ ...newForm, codiceFiscale: e.target.value.toUpperCase() })} className="h-7 text-xs font-mono uppercase" />
                        {cfError && <p className="text-[9px] text-destructive mt-0.5">{cfError}</p>}
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <Label className="text-[10px]">{tr("Codice SDI")}</Label>
                        <Input placeholder="0000000" value={newForm.codiceSdi ?? ""} onChange={(e) => setNewForm({ ...newForm, codiceSdi: e.target.value.toUpperCase() })} className="h-7 text-xs font-mono" maxLength={7} />
                      </div>
                      <div>
                        <Label className="text-[10px]">PEC</Label>
                        <Input placeholder="email@pec.it" value={newForm.pec ?? ""} onChange={(e) => setNewForm({ ...newForm, pec: e.target.value })} className="h-7 text-xs" />
                      </div>
                    </div>
                  </TabsContent>

                  {/* B2C form */}
                  <TabsContent value="B2C" className="space-y-2 mt-2">
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <Label className="text-[10px]">{tr("Nome *")}</Label>
                        <Input placeholder={tr("Nome")} value={newForm.nome ?? ""} onChange={(e) => setNewForm({ ...newForm, nome: e.target.value })} className="h-7 text-xs" />
                      </div>
                      <div>
                        <Label className="text-[10px]">{tr("Cognome *")}</Label>
                        <Input placeholder={tr("Cognome")} value={newForm.cognome ?? ""} onChange={(e) => setNewForm({ ...newForm, cognome: e.target.value })} className="h-7 text-xs" />
                      </div>
                    </div>
                    <div>
                      <Label className="text-[10px]">{tr("Codice Fiscale *")}</Label>
                      <Input placeholder={tr("16 caratteri")} value={newForm.codiceFiscale ?? ""} onChange={(e) => setNewForm({ ...newForm, codiceFiscale: e.target.value.toUpperCase() })} className="h-7 text-xs font-mono uppercase" />
                      {cfError && <p className="text-[9px] text-destructive mt-0.5">{cfError}</p>}
                    </div>
                  </TabsContent>

                  {/* PA form */}
                  <TabsContent value="PA" className="space-y-2 mt-2">
                    <div>
                      <Label className="text-[10px]">{tr("Denominazione Ente *")}</Label>
                      <Input placeholder={tr("Nome ente pubblico")} value={newForm.ragioneSociale ?? ""} onChange={(e) => setNewForm({ ...newForm, ragioneSociale: e.target.value })} className="h-7 text-xs" />
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <Label className="text-[10px]">{tr("Codice Fiscale Ente")}</Label>
                        <Input placeholder="CF" value={newForm.codiceFiscale ?? ""} onChange={(e) => setNewForm({ ...newForm, codiceFiscale: e.target.value })} className="h-7 text-xs font-mono" />
                      </div>
                      <div>
                        <Label className="text-[10px]">{tr("Codice Univoco Ufficio *")}</Label>
                        <Input placeholder={tr("6 caratteri")} value={newForm.codiceSdi ?? ""} onChange={(e) => setNewForm({ ...newForm, codiceSdi: e.target.value.toUpperCase() })} className="h-7 text-xs font-mono" maxLength={6} />
                        <p className="text-[8px] text-muted-foreground mt-0.5">{tr("6 caratteri, dall'Indice PA: uno per ufficio")}</p>
                      </div>
                    </div>
                    <div>
                      <Label className="text-[10px]">PEC</Label>
                      <Input placeholder="email@pec.it" value={newForm.pec ?? ""} onChange={(e) => setNewForm({ ...newForm, pec: e.target.value })} className="h-7 text-xs" />
                    </div>
                  </TabsContent>
                </Tabs>

                {/* Address section (shared for all types) */}
                <div className="border-t pt-2 space-y-2">
                  <div className="flex items-center gap-1 text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
                    <MapPin className="h-2.5 w-2.5" />
                    {tr("Indirizzo * (via, CAP, comune)")}
                  </div>
                  <div>
                    <CampoIndirizzo
                      aria-label={tr("Via / Indirizzo")}
                      placeholder={tr("Via / Indirizzo")}
                      value={newForm.indirizzo_via ?? ""}
                      onChange={(v) => setNewForm({ ...newForm, indirizzo_via: v })}
                      onScegli={(a) => setNewForm((p) => ({ ...p, ...campiDaTrovato(a, CAMPI_INDIRIZZO_CLIENTE) }))}
                      className="h-7 text-xs"
                    />
                  </div>
                  <div className="grid grid-cols-4 gap-1.5">
                    <Input placeholder="CAP" value={newForm.indirizzo_cap ?? ""} onChange={(e) => setNewForm({ ...newForm, indirizzo_cap: e.target.value })} className="h-7 text-xs" maxLength={5} />
                    <Input placeholder={tr("Comune")} value={newForm.indirizzo_comune ?? ""} onChange={(e) => setNewForm({ ...newForm, indirizzo_comune: e.target.value })} className="h-7 text-xs col-span-2" />
                    <Input placeholder={tr("Prov")} value={newForm.indirizzo_provincia ?? ""} onChange={(e) => setNewForm({ ...newForm, indirizzo_provincia: e.target.value.toUpperCase() })} className="h-7 text-xs uppercase" maxLength={2} />
                  </div>
                </div>

                {problemiNuovo.length > 0 && (
                  <p className="text-[10px] text-amber-700">{tr("Manca: {problemiNuovo}.", { problemiNuovo: problemiNuovo.join(", ") })}</p>
                )}
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    className="h-6 text-xs flex-1"
                    onClick={() => void createNewClient()}
                    disabled={salvataggio || problemiNuovo.length > 0}
                  >
                    {salvataggio ? tr("Salvo…") : tr("Crea e seleziona")}
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-6 text-xs flex-1"
                    onClick={() => {
                      setShowNewForm(false);
                      setNewForm({ tipo: "B2B" });
                    }}
                  >
                    {tr("Annulla")}
                  </Button>
                </div>
              </div>
            ) : null}
          </div>
        )
      )}
      <Dialog open={occasionaleOpen} onOpenChange={setOccasionaleOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{tr("Cliente occasionale")}</DialogTitle>
            <DialogDescription>{tr("Inserisci il nome, poi completa i dati del cliente nel documento.")}</DialogDescription>
          </DialogHeader>
          <Label htmlFor="nome-cliente-occasionale">{tr("Nome cliente occasionale")}</Label>
          <Input id="nome-cliente-occasionale" value={nomeOccasionale} onChange={(e) => setNomeOccasionale(e.target.value)} />
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOccasionaleOpen(false)}>{tr("Annulla")}</Button>
            <Button type="button" disabled={!nomeOccasionale.trim()} onClick={() => {
              createQuickB2C(nomeOccasionale.trim());
              setOccasionaleOpen(false);
            }}>{tr("Usa cliente")}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
