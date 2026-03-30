import { useState, useMemo } from "react";
import { Search, X, ChevronDown, Plus, MapPin, Phone, Mail, Building2, User, Pencil } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { useAnagraficheNative } from "@/hooks/useAnagraficheNative";
import { validaPartitaIva, validaCodiceFiscale } from "@/lib/fatturazione/validazioniAnagrafiche";
import type { ClienteSnapshot } from "@/types/fatturazione";
import type { EditorState } from "./useEditorState";

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
  B2B: { label: "B2B", className: "bg-primary/10 text-primary" },
  B2C: { label: "B2C", className: "bg-muted text-muted-foreground" },
  PA: { label: "PA", className: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400" },
  Estero: { label: "Estero", className: "bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-400" },
};

// New client form state
interface NewClientForm {
  tipo: "B2C" | "B2B" | "PA";
  nome?: string;
  cognome?: string;
  ragioneSociale?: string;
  partitaIva?: string;
  codiceFiscale?: string;
  codiceSdi?: string;
  pec?: string;
  email?: string;
  telefono?: string;
  indirizzo_via?: string;
  indirizzo_cap?: string;
  indirizzo_comune?: string;
  indirizzo_provincia?: string;
  indirizzo_nazione?: string;
  note?: string;
}

export function EditorClienteSection({ state, dispatch, disabled }: Props) {
  const [search, setSearch] = useState("");
  const [isOpen, setIsOpen] = useState(false);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [editingSnapshot, setEditingSnapshot] = useState(false);
  const [showNewForm, setShowNewForm] = useState(false);
  const [newClientTab, setNewClientTab] = useState<"B2C" | "B2B" | "PA">("B2B");
  const [newForm, setNewForm] = useState<NewClientForm>({ tipo: "B2B" });

  // Get all clients (empty search returns up to 100)
  const { data: anagrafiche } = useAnagraficheNative(search);

  const snapshot = state.cliente_snapshot;
  const hasCliente = !!snapshot?.ragione_sociale;

  const filtered = useMemo(() => {
    if (!anagrafiche) return [];
    return (anagrafiche as Record<string, unknown>[]).slice(0, 100);
  }, [anagrafiche]);

  function selectCliente(a: Record<string, unknown>) {
    const snap: ClienteSnapshot = {
      ragione_sociale: (a.ragione_sociale as string) ?? `${a.nome ?? ""} ${a.cognome ?? ""}`.trim(),
      partita_iva: a.partita_iva as string | undefined,
      codice_fiscale: a.codice_fiscale as string | undefined,
      codice_sdi: a.codice_sdi as string | undefined,
      pec: a.pec as string | undefined,
      indirizzo_via: a.indirizzo_via as string | undefined,
      indirizzo_cap: a.indirizzo_cap as string | undefined,
      indirizzo_comune: a.indirizzo_comune as string | undefined,
      indirizzo_provincia: a.indirizzo_provincia as string | undefined,
      indirizzo_nazione: (a.indirizzo_nazione as string) ?? "IT",
      tipo_cliente: (a.tipo_cliente as ClienteSnapshot["tipo_cliente"]) ?? "B2B",
    };
    dispatch({ type: "SET_CLIENTE", anagrafica_id: a.id as string, snapshot: snap });
    setSearch("");
    setIsOpen(false);
    setShowNewForm(false);
    setDetailsOpen(true); // Auto-open details when selecting a client
  }

  // Update a field on the existing snapshot
  function updateSnapshotField(field: keyof ClienteSnapshot, value: string | undefined) {
    if (!snapshot) return;
    const updated = { ...snapshot, [field]: value };
    dispatch({ type: "SET_CLIENTE", anagrafica_id: state.anagrafica_id ?? "", snapshot: updated });
  }

  // Create quick B2C client (occasionale)
  function createQuickB2C(name: string) {
    if (!name.trim()) return;
    const snap: ClienteSnapshot = {
      ragione_sociale: name.trim(),
      tipo_cliente: "B2C",
      indirizzo_nazione: "IT",
    };
    dispatch({ type: "SET_CLIENTE", anagrafica_id: "", snapshot: snap });
    setSearch("");
    setIsOpen(false);
    setShowNewForm(false);
  }

  // Create new client from form
  function createNewClient() {
    const ragioneSociale = newForm.tipo === "B2B" || newForm.tipo === "PA"
      ? newForm.ragioneSociale?.trim()
      : `${newForm.nome?.trim() ?? ""} ${newForm.cognome?.trim() ?? ""}`.trim();

    if (!ragioneSociale) return;

    const snap: ClienteSnapshot = {
      ragione_sociale: ragioneSociale,
      partita_iva: newForm.partitaIva,
      codice_fiscale: newForm.codiceFiscale,
      codice_sdi: newForm.codiceSdi,
      pec: newForm.pec,
      indirizzo_via: newForm.indirizzo_via,
      indirizzo_cap: newForm.indirizzo_cap,
      indirizzo_comune: newForm.indirizzo_comune,
      indirizzo_provincia: newForm.indirizzo_provincia,
      indirizzo_nazione: newForm.indirizzo_nazione ?? "IT",
      tipo_cliente: newForm.tipo,
    };

    dispatch({ type: "SET_CLIENTE", anagrafica_id: "", snapshot: snap });
    setNewForm({ tipo: "B2B" });
    setShowNewForm(false);
    setSearch("");
    setIsOpen(false);
    setDetailsOpen(true);
  }

  // Validation
  const pivaError = newForm.partitaIva && newForm.partitaIva.length > 0 && !validaPartitaIva(newForm.partitaIva).valida
    ? validaPartitaIva(newForm.partitaIva).errore
    : undefined;
  const cfError = newForm.codiceFiscale && newForm.codiceFiscale.length > 0 && !validaCodiceFiscale(newForm.codiceFiscale).valida
    ? validaCodiceFiscale(newForm.codiceFiscale).errore
    : undefined;

  return (
    <div className="rounded-lg border bg-card p-4 space-y-3 border-l-[3px] border-l-primary/60 shadow-sm">
      <div className="flex items-center justify-between">
        <Label className="text-[11px] font-bold uppercase tracking-wider text-primary/80">
          {["integrazione_servizi_estero", "integrazione_beni_ue", "integrazione_beni_extra_ue"].includes(state.tipo)
            ? "Fornitore Estero"
            : "Cliente / Committente"}
        </Label>
        {hasCliente && !disabled && (
          <Button
            variant="ghost"
            size="sm"
            className="h-5 text-[10px] px-1.5"
            onClick={() => {
              dispatch({ type: "CLEAR_CLIENTE" });
              setDetailsOpen(false);
              setEditingSnapshot(false);
            }}
          >
            <X className="h-2.5 w-2.5 mr-0.5" />
            Cambia
          </Button>
        )}
      </div>

      {hasCliente ? (
        <div>
          {/* ─── Compact Client Card ─── */}
          <div className="flex items-center gap-2.5">
            <div className={`h-9 w-9 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${avatarColor(snapshot!.ragione_sociale)}`}>
              {getInitials(snapshot!.ragione_sociale)}
            </div>
            <div className="min-w-0 flex-1">
              <div className="font-semibold text-sm leading-tight truncate">{snapshot!.ragione_sociale}</div>
              <div className="flex items-center gap-1.5 mt-0.5">
                {snapshot!.partita_iva && (
                  <span className="text-[10px] font-mono text-muted-foreground">P.IVA {snapshot!.partita_iva}</span>
                )}
                {snapshot!.codice_fiscale && !snapshot!.partita_iva && (
                  <span className="text-[10px] font-mono text-muted-foreground">CF {snapshot!.codice_fiscale}</span>
                )}
              </div>
            </div>
            {snapshot!.tipo_cliente && (
              <Badge variant="secondary" className={`text-[9px] px-1.5 h-4 shrink-0 ${TIPO_BADGE[snapshot!.tipo_cliente]?.className ?? ""}`}>
                {TIPO_BADGE[snapshot!.tipo_cliente]?.label ?? snapshot!.tipo_cliente}
              </Badge>
            )}
          </div>

          {/* ─── Expandable Full Detail Panel ─── */}
          <Collapsible open={detailsOpen} onOpenChange={setDetailsOpen}>
            <CollapsibleTrigger asChild>
              <button className="flex items-center gap-1 text-[10px] text-muted-foreground hover:text-foreground mt-2 w-full justify-center transition-colors py-1 rounded hover:bg-muted/50">
                <ChevronDown className={`h-2.5 w-2.5 transition-transform ${detailsOpen ? "rotate-180" : ""}`} />
                {detailsOpen ? "Chiudi dettagli" : "Mostra dettagli cliente"}
              </button>
            </CollapsibleTrigger>
            <CollapsibleContent className="pt-2 space-y-3 animate-in fade-in-50">
              {/* Fiscal data section */}
              <div className="space-y-2">
                <div className="flex items-center gap-1.5 text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
                  <Building2 className="h-3 w-3" />
                  Dati Fiscali
                </div>
                {editingSnapshot && !disabled ? (
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <Label className="text-[9px] text-muted-foreground">Ragione Sociale</Label>
                      <Input value={snapshot!.ragione_sociale ?? ""} onChange={(e) => updateSnapshotField("ragione_sociale", e.target.value)} className="h-6 text-[11px]" />
                    </div>
                    <div>
                      <Label className="text-[9px] text-muted-foreground">P.IVA</Label>
                      <Input value={snapshot!.partita_iva ?? ""} onChange={(e) => updateSnapshotField("partita_iva", e.target.value)} className="h-6 text-[11px] font-mono" />
                    </div>
                    <div>
                      <Label className="text-[9px] text-muted-foreground">Codice Fiscale</Label>
                      <Input value={snapshot!.codice_fiscale ?? ""} onChange={(e) => updateSnapshotField("codice_fiscale", e.target.value)} className="h-6 text-[11px] font-mono uppercase" />
                    </div>
                    <div>
                      <Label className="text-[9px] text-muted-foreground">Codice SDI</Label>
                      <Input value={snapshot!.codice_sdi ?? ""} onChange={(e) => updateSnapshotField("codice_sdi", e.target.value)} className="h-6 text-[11px] font-mono" maxLength={7} />
                    </div>
                    <div className="col-span-2">
                      <Label className="text-[9px] text-muted-foreground">PEC</Label>
                      <Input value={snapshot!.pec ?? ""} onChange={(e) => updateSnapshotField("pec", e.target.value)} className="h-6 text-[11px]" />
                    </div>
                  </div>
                ) : (
                  <div className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-[11px]">
                    {snapshot!.partita_iva && (
                      <>
                        <span className="text-muted-foreground">P.IVA</span>
                        <span className="font-mono">{snapshot!.partita_iva}</span>
                      </>
                    )}
                    {snapshot!.codice_fiscale && (
                      <>
                        <span className="text-muted-foreground">CF</span>
                        <span className="font-mono">{snapshot!.codice_fiscale}</span>
                      </>
                    )}
                    {snapshot!.codice_sdi && (
                      <>
                        <span className="text-muted-foreground">SDI</span>
                        <span className="font-mono">{snapshot!.codice_sdi}</span>
                      </>
                    )}
                    {snapshot!.pec && (
                      <>
                        <span className="text-muted-foreground">PEC</span>
                        <span className="truncate">{snapshot!.pec}</span>
                      </>
                    )}
                    {!snapshot!.partita_iva && !snapshot!.codice_fiscale && !snapshot!.codice_sdi && !snapshot!.pec && (
                      <span className="col-span-2 text-muted-foreground italic">Nessun dato fiscale inserito</span>
                    )}
                  </div>
                )}
              </div>

              {/* Address section */}
              <div className="space-y-2">
                <div className="flex items-center gap-1.5 text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
                  <MapPin className="h-3 w-3" />
                  Indirizzo
                </div>
                {editingSnapshot && !disabled ? (
                  <div className="grid grid-cols-2 gap-2">
                    <div className="col-span-2">
                      <Label className="text-[9px] text-muted-foreground">Via/Indirizzo</Label>
                      <Input value={snapshot!.indirizzo_via ?? ""} onChange={(e) => updateSnapshotField("indirizzo_via", e.target.value)} className="h-6 text-[11px]" placeholder="Via Roma 1" />
                    </div>
                    <div>
                      <Label className="text-[9px] text-muted-foreground">CAP</Label>
                      <Input value={snapshot!.indirizzo_cap ?? ""} onChange={(e) => updateSnapshotField("indirizzo_cap", e.target.value)} className="h-6 text-[11px]" maxLength={5} placeholder="00100" />
                    </div>
                    <div>
                      <Label className="text-[9px] text-muted-foreground">Comune</Label>
                      <Input value={snapshot!.indirizzo_comune ?? ""} onChange={(e) => updateSnapshotField("indirizzo_comune", e.target.value)} className="h-6 text-[11px]" placeholder="Roma" />
                    </div>
                    <div>
                      <Label className="text-[9px] text-muted-foreground">Provincia</Label>
                      <Input value={snapshot!.indirizzo_provincia ?? ""} onChange={(e) => updateSnapshotField("indirizzo_provincia", e.target.value)} className="h-6 text-[11px] uppercase" maxLength={2} placeholder="RM" />
                    </div>
                    <div>
                      <Label className="text-[9px] text-muted-foreground">Nazione</Label>
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
                      <p className="text-muted-foreground italic">Nessun indirizzo inserito</p>
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
                  onClick={() => setEditingSnapshot(!editingSnapshot)}
                >
                  <Pencil className="h-2.5 w-2.5" />
                  {editingSnapshot ? "Fine modifica" : "Modifica dati cliente"}
                </Button>
              )}
            </CollapsibleContent>
          </Collapsible>

          {/* CIG/CUP for PA */}
          {snapshot?.tipo_cliente === "PA" && (
            <div className="grid grid-cols-2 gap-2 mt-2">
              <div>
                <Label className="text-[10px] text-muted-foreground">CIG</Label>
                <Input
                  value={state.cig ?? ""}
                  onChange={(e) => dispatch({ type: "SET_FIELD", field: "cig", value: e.target.value })}
                  className="h-7 text-xs font-mono"
                  disabled={disabled}
                />
              </div>
              <div>
                <Label className="text-[10px] text-muted-foreground">CUP</Label>
                <Input
                  value={state.cup ?? ""}
                  onChange={(e) => dispatch({ type: "SET_FIELD", field: "cup", value: e.target.value })}
                  className="h-7 text-xs font-mono"
                  disabled={disabled}
                />
              </div>
            </div>
          )}
        </div>
      ) : (
        !disabled && (
          <div className="relative space-y-2">
            {/* Search input */}
            <div className="relative">
              <Search className="absolute left-2 top-2 h-3.5 w-3.5 text-muted-foreground" />
              <Input
                placeholder="Cerca cliente per nome, P.IVA o CF..."
                value={search}
                onChange={(e) => { setSearch(e.target.value); setIsOpen(true); }}
                onFocus={() => setIsOpen(true)}
                className="pl-7 h-8 text-xs"
              />
            </div>

            {/* Dropdown list */}
            {isOpen && (
              <div className="absolute z-50 w-full mt-1 border rounded-md bg-popover shadow-lg max-h-56 overflow-auto">
                {filtered.length > 0 ? (
                  filtered.map((a) => {
                    const name = (a.ragione_sociale as string) || `${a.nome ?? ""} ${a.cognome ?? ""}`.trim();
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
                            {addr && <span>{addr}</span>}
                          </div>
                        </div>
                        {tipoCliente && TIPO_BADGE[tipoCliente] && (
                          <Badge variant="secondary" className={`text-[8px] px-1 h-3.5 shrink-0 ${TIPO_BADGE[tipoCliente]?.className ?? ""}`}>
                            {TIPO_BADGE[tipoCliente]?.label}
                          </Badge>
                        )}
                      </button>
                    );
                  })
                ) : (
                  <div className="px-3 py-2 text-[11px] text-muted-foreground">Nessun cliente trovato</div>
                )}
              </div>
            )}

            {/* New client form or quick buttons */}
            {showNewForm ? (
              <div className="border rounded-md p-3 space-y-3 bg-muted/30 animate-in fade-in-50 slide-in-from-top-2">
                <Tabs value={newClientTab} onValueChange={(v) => {
                  const tipo = v as "B2C" | "B2B" | "PA";
                  setNewClientTab(tipo);
                  setNewForm({ tipo });
                }}>
                  <TabsList className="grid w-full grid-cols-3 h-7">
                    <TabsTrigger value="B2B" className="text-[10px]">Azienda</TabsTrigger>
                    <TabsTrigger value="B2C" className="text-[10px]">Privato</TabsTrigger>
                    <TabsTrigger value="PA" className="text-[10px]">Ente PA</TabsTrigger>
                  </TabsList>

                  {/* B2B form */}
                  <TabsContent value="B2B" className="space-y-2 mt-2">
                    <div>
                      <Label className="text-[10px]">Ragione Sociale *</Label>
                      <Input placeholder="Nome azienda" value={newForm.ragioneSociale ?? ""} onChange={(e) => setNewForm({ ...newForm, ragioneSociale: e.target.value })} className="h-7 text-xs" />
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <Label className="text-[10px]">P.IVA</Label>
                        <Input placeholder="11 cifre" value={newForm.partitaIva ?? ""} onChange={(e) => setNewForm({ ...newForm, partitaIva: e.target.value })} className="h-7 text-xs font-mono" />
                        {pivaError && <p className="text-[9px] text-destructive mt-0.5">{pivaError}</p>}
                      </div>
                      <div>
                        <Label className="text-[10px]">Codice Fiscale</Label>
                        <Input placeholder="CF" value={newForm.codiceFiscale ?? ""} onChange={(e) => setNewForm({ ...newForm, codiceFiscale: e.target.value.toUpperCase() })} className="h-7 text-xs font-mono uppercase" />
                        {cfError && <p className="text-[9px] text-destructive mt-0.5">{cfError}</p>}
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <Label className="text-[10px]">Codice SDI</Label>
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
                        <Label className="text-[10px]">Nome *</Label>
                        <Input placeholder="Nome" value={newForm.nome ?? ""} onChange={(e) => setNewForm({ ...newForm, nome: e.target.value })} className="h-7 text-xs" />
                      </div>
                      <div>
                        <Label className="text-[10px]">Cognome *</Label>
                        <Input placeholder="Cognome" value={newForm.cognome ?? ""} onChange={(e) => setNewForm({ ...newForm, cognome: e.target.value })} className="h-7 text-xs" />
                      </div>
                    </div>
                    <div>
                      <Label className="text-[10px]">Codice Fiscale</Label>
                      <Input placeholder="16 caratteri" value={newForm.codiceFiscale ?? ""} onChange={(e) => setNewForm({ ...newForm, codiceFiscale: e.target.value.toUpperCase() })} className="h-7 text-xs font-mono uppercase" />
                      {cfError && <p className="text-[9px] text-destructive mt-0.5">{cfError}</p>}
                    </div>
                  </TabsContent>

                  {/* PA form */}
                  <TabsContent value="PA" className="space-y-2 mt-2">
                    <div>
                      <Label className="text-[10px]">Denominazione Ente *</Label>
                      <Input placeholder="Nome ente pubblico" value={newForm.ragioneSociale ?? ""} onChange={(e) => setNewForm({ ...newForm, ragioneSociale: e.target.value })} className="h-7 text-xs" />
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <Label className="text-[10px]">Codice Fiscale Ente</Label>
                        <Input placeholder="CF" value={newForm.codiceFiscale ?? ""} onChange={(e) => setNewForm({ ...newForm, codiceFiscale: e.target.value })} className="h-7 text-xs font-mono" />
                      </div>
                      <div>
                        <Label className="text-[10px]">Codice IPA (SDI) *</Label>
                        <Input placeholder="6 caratteri" value={newForm.codiceSdi ?? ""} onChange={(e) => setNewForm({ ...newForm, codiceSdi: e.target.value.toUpperCase() })} className="h-7 text-xs font-mono" maxLength={6} />
                        <p className="text-[8px] text-muted-foreground mt-0.5">Codice Univoco Ufficio (6 caratteri per PA)</p>
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
                    Indirizzo (opzionale)
                  </div>
                  <div>
                    <Input placeholder="Via / Indirizzo" value={newForm.indirizzo_via ?? ""} onChange={(e) => setNewForm({ ...newForm, indirizzo_via: e.target.value })} className="h-7 text-xs" />
                  </div>
                  <div className="grid grid-cols-4 gap-1.5">
                    <Input placeholder="CAP" value={newForm.indirizzo_cap ?? ""} onChange={(e) => setNewForm({ ...newForm, indirizzo_cap: e.target.value })} className="h-7 text-xs" maxLength={5} />
                    <Input placeholder="Comune" value={newForm.indirizzo_comune ?? ""} onChange={(e) => setNewForm({ ...newForm, indirizzo_comune: e.target.value })} className="h-7 text-xs col-span-2" />
                    <Input placeholder="Prov" value={newForm.indirizzo_provincia ?? ""} onChange={(e) => setNewForm({ ...newForm, indirizzo_provincia: e.target.value.toUpperCase() })} className="h-7 text-xs uppercase" maxLength={2} />
                  </div>
                </div>

                <div className="flex gap-2">
                  <Button
                    size="sm"
                    className="h-6 text-xs flex-1"
                    onClick={createNewClient}
                    disabled={
                      (newClientTab === "B2B" || newClientTab === "PA" ? !newForm.ragioneSociale : !(newForm.nome || newForm.cognome)) ||
                      !!pivaError || !!cfError
                    }
                  >
                    Crea e seleziona
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
                    Annulla
                  </Button>
                </div>
              </div>
            ) : (
              <div className="flex gap-1.5">
                <Button
                  variant="outline"
                  size="sm"
                  className="text-[10px] h-6 px-2 flex-1"
                  onClick={() => setShowNewForm(true)}
                >
                  <Plus className="h-3 w-3 mr-1" />
                  Nuovo cliente
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-[10px] h-6 px-2 flex-1"
                  onClick={() => {
                    const name = prompt("Nome cliente occasionale:");
                    if (name) createQuickB2C(name);
                  }}
                >
                  Occasionale
                </Button>
              </div>
            )}
          </div>
        )
      )}
    </div>
  );
}
