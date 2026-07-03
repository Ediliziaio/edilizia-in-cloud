/**
 * Catalogo Componenti FV — gestione dei componenti che alimentano la Fase 5
 * del wizard Fotovoltaico (tabella articoli_native con categoria_fv).
 *
 * Il listino è l'unica fonte di verità: da qui si "collega dal listino"
 * assegnando alle macrocategorie (listino_macrocategorie) la tipologia
 * 'fotovoltaico' + fv_categoria — un trigger DB proietta automaticamente i
 * prodotti in articoli_native (listino_family_id valorizzato, badge
 * "Dal listino"). I componenti si possono anche creare a mano da zero o
 * "precompilando dal listino" per il singolo articolo.
 */
import { useMemo, useState, useRef } from "react";
import { Link } from "react-router-dom";
import {
  ArrowLeft,
  Battery,
  Gauge,
  Link2,
  Package,
  Pencil,
  Plus,
  PlugZap,
  RefreshCw,
  Search,
  Sun,
  Wrench,
  Zap,
} from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  useArticoliFvCatalogo,
  useListinoPerFv,
  useToggleArticoloFv,
  useUpsertArticoloFv,
  type ArticoloFv,
} from "@/lib/fotovoltaico/queries";
import {
  CATEGORIE_FV_LISTINO,
  TIPOLOGIE_LISTINO,
  proponiMappingMacroFv,
  useCollegaMacroFv,
  useMacroListinoFv,
  useSyncListinoFv,
  type CategoriaFvListino,
} from "@/lib/fotovoltaico/collegaListino";

const eur = (n: number | null | undefined) =>
  new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR" }).format(n ?? 0);

type TipoFv =
  | "pannello"
  | "inverter"
  | "accumulo"
  | "wallbox"
  | "ottimizzatore"
  | "struttura"
  | "altro";

type SpecField = "potenza_w" | "potenza_kw" | "capacita_kwh" | null;

const TIPI: Array<{
  value: TipoFv;
  label: string;
  plural: string;
  icon: typeof Sun;
  specLabel: string;
  unit: string;
  specField: SpecField;
}> = [
  { value: "pannello", label: "Pannello / Modulo", plural: "Pannelli", icon: Sun, specLabel: "Potenza unitaria (W)", unit: "W", specField: "potenza_w" },
  { value: "inverter", label: "Inverter", plural: "Inverter", icon: Zap, specLabel: "Potenza (kW)", unit: "kW", specField: "potenza_kw" },
  { value: "accumulo", label: "Batteria / Accumulo", plural: "Accumuli", icon: Battery, specLabel: "Capacità (kWh)", unit: "kWh", specField: "capacita_kwh" },
  { value: "wallbox", label: "Colonnina / Wallbox", plural: "Colonnine / Wallbox", icon: PlugZap, specLabel: "Potenza (kW)", unit: "kW", specField: "potenza_kw" },
  { value: "ottimizzatore", label: "Ottimizzatore", plural: "Ottimizzatori", icon: Gauge, specLabel: "Potenza (W)", unit: "W", specField: "potenza_w" },
  { value: "struttura", label: "Struttura / Zavorra", plural: "Strutture e zavorre", icon: Wrench, specLabel: "", unit: "", specField: null },
  { value: "altro", label: "Altro / Extra", plural: "Altro / Extra", icon: Package, specLabel: "", unit: "", specField: null },
];

const tipoMeta = (cat: string | null) => TIPI.find((t) => t.value === cat);

const specValueOf = (a: ArticoloFv, field: SpecField): number | null => {
  if (field === "potenza_w") return a.potenza_w;
  if (field === "potenza_kw") return a.potenza_kw;
  if (field === "capacita_kwh") return a.capacita_kwh;
  return null;
};

const specDi = (a: ArticoloFv): string => {
  const m = tipoMeta(a.categoria_fv);
  if (!m || !m.specField) return "";
  const v = specValueOf(a, m.specField);
  return v != null ? `${v} ${m.unit}` : "—";
};

interface FormState {
  id?: string;
  categoria_fv: TipoFv;
  descrizione: string;
  marca_fv: string;
  modello_fv: string;
  codice: string;
  prezzo_vendita: string;
  spec: string;
  immagine_url: string;
}

const EMPTY_FORM: FormState = {
  categoria_fv: "pannello",
  descrizione: "",
  marca_fv: "",
  modello_fv: "",
  codice: "",
  prezzo_vendita: "",
  spec: "",
  immagine_url: "",
};

export default function ComponentiFv() {
  const { data: componenti = [], isLoading } = useArticoliFvCatalogo();
  const upsert = useUpsertArticoloFv();
  const toggle = useToggleArticoloFv();
  const syncListino = useSyncListinoFv();

  const [open, setOpen] = useState(false);
  const [collegaOpen, setCollegaOpen] = useState(false);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [listinoSearch, setListinoSearch] = useState("");
  const { data: listino = [] } = useListinoPerFv(listinoSearch);
  const [uploadingImg, setUploadingImg] = useState(false);
  const imgInputRef = useRef<HTMLInputElement | null>(null);

  // "Sincronizza ora": riallinea articoli_native con il listino taggato
  // (il trigger DB copre i cambi futuri, la RPC serve per il backfill).
  const handleSyncNow = async () => {
    try {
      const n = await syncListino.mutateAsync();
      toast.success(`Sincronizzazione completata: ${n} componenti allineati dal listino`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Sincronizzazione non riuscita");
    }
  };

  // Upload foto componente → bucket fv-progetti, signed URL 1 anno (come i template).
  const handleImgUpload = async (file: File) => {
    if (!file.type.startsWith("image/")) return toast.error("Carica un file immagine");
    if (file.size > 8 * 1024 * 1024) return toast.error("File troppo grande (max 8 MB)");
    setUploadingImg(true);
    try {
      const userId = (await supabase.auth.getUser()).data.user?.id;
      if (!userId) throw new Error("Non autenticato");
      const { data: profile } = await supabase
        .from("profiles" as never)
        .select("company_id")
        .eq("id", userId)
        .maybeSingle();
      const companyId = (profile as { company_id?: string } | null)?.company_id;
      if (!companyId) throw new Error("Profilo senza azienda");
      const ext = file.name.includes(".") ? file.name.split(".").pop()!.toLowerCase() : "jpg";
      const path = `${companyId}/componenti-fv/${crypto.randomUUID()}.${ext}`;
      const { error: upErr } = await supabase.storage
        .from("fv-progetti")
        .upload(path, file, { contentType: file.type, upsert: false });
      if (upErr) throw new Error(`Upload fallito: ${upErr.message}`);
      const { data: signed } = await supabase.storage
        .from("fv-progetti")
        .createSignedUrl(path, 60 * 60 * 24 * 365);
      setForm((f) => ({ ...f, immagine_url: signed?.signedUrl ?? "" }));
      toast.success("Foto caricata.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Errore upload");
    } finally {
      setUploadingImg(false);
      if (imgInputRef.current) imgInputRef.current.value = "";
    }
  };

  const grouped = useMemo(() => {
    return TIPI.map((t) => ({
      tipo: t,
      items: componenti.filter((c) => c.categoria_fv === t.value),
    }));
  }, [componenti]);

  const openNew = () => {
    setForm(EMPTY_FORM);
    setListinoSearch("");
    setOpen(true);
  };

  const openEdit = (a: ArticoloFv) => {
    const m = tipoMeta(a.categoria_fv);
    const specVal = m ? specValueOf(a, m.specField) : null;
    setForm({
      id: a.id,
      categoria_fv: (m?.value ?? "pannello") as TipoFv,
      descrizione: a.descrizione ?? "",
      marca_fv: a.marca_fv ?? "",
      modello_fv: a.modello_fv ?? "",
      codice: a.codice ?? "",
      prezzo_vendita: a.prezzo_vendita != null ? String(a.prezzo_vendita) : "",
      spec: specVal != null ? String(specVal) : "",
      immagine_url: a.immagine_url ?? "",
    });
    setListinoSearch("");
    setOpen(true);
  };

  const prefillDaListino = (l: { nome: string | null; descrizione: string | null; prezzo: number | null }) => {
    setForm((f) => ({
      ...f,
      descrizione: l.descrizione || l.nome || f.descrizione,
      codice: l.nome || f.codice,
      prezzo_vendita: l.prezzo != null ? String(l.prezzo) : f.prezzo_vendita,
    }));
    setListinoSearch("");
  };

  const salva = async () => {
    if (!form.descrizione.trim()) {
      toast.error("Inserisci una descrizione per il componente");
      return;
    }
    const prezzo = form.prezzo_vendita ? Number(form.prezzo_vendita.replace(",", ".")) : 0;
    const specNum = form.spec ? Number(form.spec.replace(",", ".")) : null;
    const specField = tipoMeta(form.categoria_fv)?.specField ?? null;
    try {
      await upsert.mutateAsync({
        id: form.id,
        descrizione: form.descrizione.trim(),
        categoria_fv: form.categoria_fv,
        codice: form.codice.trim() || null,
        marca_fv: form.marca_fv.trim() || null,
        modello_fv: form.modello_fv.trim() || null,
        prezzo_vendita: Number.isFinite(prezzo) ? prezzo : 0,
        potenza_w: specField === "potenza_w" ? specNum : null,
        potenza_kw: specField === "potenza_kw" ? specNum : null,
        capacita_kwh: specField === "capacita_kwh" ? specNum : null,
        immagine_url: form.immagine_url || null,
      });
      toast.success(form.id ? "Componente aggiornato" : "Componente aggiunto al catalogo FV");
      setOpen(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Salvataggio non riuscito");
    }
  };

  const onToggle = async (a: ArticoloFv) => {
    try {
      await toggle.mutateAsync({ id: a.id, attivo: !a.attivo });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Operazione non riuscita");
    }
  };

  const specMeta = tipoMeta(form.categoria_fv)!;

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="relative overflow-hidden text-white" style={{ background: "linear-gradient(135deg, #1E3A5F 0%, #2C5184 100%)" }}>
        <div className="relative max-w-[1200px] mx-auto px-4 sm:px-8 py-5 sm:py-7">
          <Link to="/azienda/marketing/fotovoltaico" className="inline-flex items-center gap-1 text-xs font-medium text-blue-100/90 hover:text-white mb-2">
            <ArrowLeft className="h-3.5 w-3.5" /> Torna al Fotovoltaico
          </Link>
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight">Componenti FV</h1>
          <p className="text-sm text-blue-100 mt-1 max-w-2xl">
            Pannelli, inverter, accumuli e gli altri componenti che il wizard usa nella Fase 5 (Configurazione).
            Collega le macrocategorie del tuo listino al preventivatore: i prodotti si sincronizzano da soli.
          </p>
        </div>
      </div>

      <div className="max-w-[1200px] mx-auto px-4 sm:px-8 py-6 space-y-6">
        <div className="flex flex-wrap justify-end gap-2">
          <Button
            variant="outline"
            onClick={handleSyncNow}
            disabled={syncListino.isPending}
            className="gap-2"
          >
            <RefreshCw className={`h-4 w-4 ${syncListino.isPending ? "animate-spin" : ""}`} />
            {syncListino.isPending ? "Sincronizzazione…" : "Sincronizza ora"}
          </Button>
          <Button variant="outline" onClick={() => setCollegaOpen(true)} className="gap-2">
            <Link2 className="h-4 w-4" /> Collega dal listino
          </Button>
          <Button onClick={openNew} className="gap-2">
            <Plus className="h-4 w-4" /> Aggiungi componente
          </Button>
        </div>

        {isLoading ? (
          <p className="text-sm text-slate-500">Caricamento…</p>
        ) : (
          grouped.map(({ tipo, items }) => {
            const Icon = tipo.icon;
            return (
              <div key={tipo.value}>
                <div className="flex items-center gap-2 mb-2">
                  <Icon className="h-4 w-4 text-orange-500" />
                  <h2 className="text-sm font-semibold text-slate-700">{tipo.plural}</h2>
                  <span className="text-xs text-slate-400">({items.length})</span>
                </div>
                {items.length === 0 ? (
                  <Card className="p-4 text-sm text-slate-500 border-dashed">
                    Nessun {tipo.label.toLowerCase()} nel catalogo. Aggiungine uno per renderlo selezionabile nel wizard.
                  </Card>
                ) : (
                  <div className="space-y-2">
                    {items.map((a) => (
                      <Card key={a.id} className={`p-3 flex items-center gap-3 ${a.attivo ? "" : "opacity-60"}`}>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-medium text-slate-800 truncate">{a.descrizione}</span>
                            {(a.marca_fv || a.modello_fv) && (
                              <span className="text-xs text-slate-500">{[a.marca_fv, a.modello_fv].filter(Boolean).join(" · ")}</span>
                            )}
                            {a.listino_family_id && (
                              <Badge variant="outline" className="text-[10px] border-blue-300 text-blue-700 gap-1">
                                <Link2 className="h-2.5 w-2.5" /> Dal listino
                              </Badge>
                            )}
                            {!a.attivo && <Badge variant="secondary" className="text-[10px]">Disattivato</Badge>}
                          </div>
                          <div className="text-xs text-slate-500 mt-0.5 flex gap-3 flex-wrap">
                            <span className="font-medium text-slate-600">{specDi(a)}</span>
                            <span>{eur(a.prezzo_vendita)}</span>
                            {a.codice && <span className="text-slate-400">cod. {a.codice}</span>}
                          </div>
                        </div>
                        <Switch checked={a.attivo} onCheckedChange={() => onToggle(a)} aria-label="Attivo" />
                        <Button variant="ghost" size="icon" onClick={() => openEdit(a)} aria-label="Modifica">
                          <Pencil className="h-4 w-4" />
                        </Button>
                      </Card>
                    ))}
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{form.id ? "Modifica componente" : "Nuovo componente FV"}</DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            <div>
              <Label className="mb-1.5 block">Tipo</Label>
              <Select value={form.categoria_fv} onValueChange={(v) => setForm((f) => ({ ...f, categoria_fv: v as TipoFv }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {TIPI.map((t) => (
                    <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Precompila dal listino */}
            {!form.id && (
              <div className="rounded-lg border border-slate-200 bg-slate-50/60 p-3">
                <div className="flex items-center gap-2 text-xs font-medium text-slate-600 mb-2">
                  <Package className="h-3.5 w-3.5" /> Precompila dal listino (opzionale)
                </div>
                <div className="relative">
                  <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-slate-400" />
                  <Input
                    value={listinoSearch}
                    onChange={(e) => setListinoSearch(e.target.value)}
                    placeholder="Cerca un prodotto del listino…"
                    className="pl-8"
                  />
                </div>
                {listinoSearch.trim() && (
                  <div className="mt-2 max-h-40 overflow-y-auto space-y-1">
                    {listino.length === 0 ? (
                      <p className="text-xs text-slate-400 px-1 py-2">Nessun prodotto trovato.</p>
                    ) : (
                      listino.map((l) => (
                        <button
                          key={l.id}
                          type="button"
                          onClick={() => prefillDaListino(l)}
                          className="w-full text-left text-xs px-2 py-1.5 rounded hover:bg-white border border-transparent hover:border-slate-200"
                        >
                          <span className="font-medium text-slate-700">{l.descrizione || l.nome}</span>
                          {l.prezzo != null && <span className="text-slate-400 ml-2">{eur(l.prezzo)}</span>}
                        </button>
                      ))
                    )}
                  </div>
                )}
              </div>
            )}

            <div>
              <Label className="mb-1.5 block">Descrizione *</Label>
              <Input value={form.descrizione} onChange={(e) => setForm((f) => ({ ...f, descrizione: e.target.value }))} placeholder="es. Modulo 540W monocristallino" />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="mb-1.5 block">Marca</Label>
                <Input value={form.marca_fv} onChange={(e) => setForm((f) => ({ ...f, marca_fv: e.target.value }))} />
              </div>
              <div>
                <Label className="mb-1.5 block">Modello</Label>
                <Input value={form.modello_fv} onChange={(e) => setForm((f) => ({ ...f, modello_fv: e.target.value }))} />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              {specMeta.specField && (
                <div>
                  <Label className="mb-1.5 block">{specMeta.specLabel}</Label>
                  <Input inputMode="decimal" value={form.spec} onChange={(e) => setForm((f) => ({ ...f, spec: e.target.value }))} placeholder={specMeta.unit} />
                </div>
              )}
              <div>
                <Label className="mb-1.5 block">Prezzo di vendita (€)</Label>
                <Input inputMode="decimal" value={form.prezzo_vendita} onChange={(e) => setForm((f) => ({ ...f, prezzo_vendita: e.target.value }))} placeholder="0,00" />
              </div>
            </div>

            <div>
              <Label className="mb-1.5 block">Codice (opzionale)</Label>
              <Input value={form.codice} onChange={(e) => setForm((f) => ({ ...f, codice: e.target.value }))} />
            </div>

            <div>
              <Label className="mb-1.5 block">Foto prodotto (opzionale)</Label>
              <div className="flex items-center gap-3">
                {form.immagine_url ? (
                  <img
                    src={form.immagine_url}
                    alt="Foto componente"
                    className="h-14 w-20 rounded object-cover border border-slate-200"
                  />
                ) : (
                  <div className="h-14 w-20 rounded border border-dashed border-slate-300 bg-slate-50" />
                )}
                <input
                  ref={imgInputRef}
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) handleImgUpload(f);
                  }}
                />
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={uploadingImg}
                  onClick={() => imgInputRef.current?.click()}
                >
                  {uploadingImg ? "Caricamento…" : form.immagine_url ? "Cambia" : "Carica foto"}
                </Button>
                {form.immagine_url && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="text-red-500 hover:text-red-600"
                    onClick={() => setForm((f) => ({ ...f, immagine_url: "" }))}
                  >
                    Rimuovi
                  </Button>
                )}
              </div>
              <p className="mt-1 text-[11px] text-slate-400">
                Comparirà accanto al componente nella pagina "Componenti" del preventivo PDF.
              </p>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Annulla</Button>
            <Button onClick={salva} disabled={upsert.isPending}>
              {upsert.isPending ? "Salvataggio…" : form.id ? "Salva modifiche" : "Aggiungi"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <CollegaListinoDialog open={collegaOpen} onOpenChange={setCollegaOpen} />
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────────────
 * Collega dal listino — classificazione delle macrocategorie.
 *
 * Il listino è l'unica fonte di verità: qui si assegna a ogni macro la
 * tipologia (fotovoltaico, serramenti, …) e — per il fotovoltaico — la
 * categoria componente. Il salvataggio aggiorna listino_macrocategorie e
 * chiama la RPC fv_sync_listino_macro che proietta i prodotti in
 * articoli_native (il trigger DB mantiene poi tutto in sync da solo).
 * ───────────────────────────────────────────────────────────────────────── */
const SELECT_NONE = "__none__";

interface CollegaRowState {
  tipologia: string | null;
  fv_categoria: CategoriaFvListino | null;
  /** True se il valore mostrato è una proposta automatica (non ancora in DB). */
  proposta: boolean;
}

function CollegaListinoDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { data: macros = [], isLoading } = useMacroListinoFv(open);
  const collega = useCollegaMacroFv();
  // `rows` contiene SOLO gli override utente; il valore mostrato per ogni
  // macro è derivato: override → valori DB → proposta automatica (ILIKE).
  // Niente effect di inizializzazione: stato derivato in render.
  const [rows, setRows] = useState<Record<string, CollegaRowState>>({});

  const rigaDefault = (m: MacroListinoFv): CollegaRowState => {
    if (m.tipologia || m.fv_categoria) {
      return { tipologia: m.tipologia, fv_categoria: m.fv_categoria, proposta: false };
    }
    const p = proponiMappingMacroFv(m.nome);
    return { tipologia: p.tipologia, fv_categoria: p.fv_categoria, proposta: p.tipologia != null };
  };
  const rigaDi = (m: MacroListinoFv): CollegaRowState => rows[m.id] ?? rigaDefault(m);

  const setRow = (m: MacroListinoFv, patch: Partial<CollegaRowState>) =>
    setRows((r) => ({ ...r, [m.id]: { ...rigaDi(m), ...patch, proposta: false } }));

  const daCollegare = useMemo(
    () =>
      macros.filter((m) => {
        const r = rows[m.id] ?? rigaDefault(m);
        return (
          (r.tipologia ?? null) !== (m.tipologia ?? null) ||
          (r.fv_categoria ?? null) !== (m.fv_categoria ?? null) ||
          r.proposta
        );
      }),
    // rigaDefault è pura (dipende solo da m) → non serve nelle deps
     
    [macros, rows],
  );

  const fvCollegate = macros.filter((m) => {
    const r = rigaDi(m);
    return r.tipologia === "fotovoltaico" && r.fv_categoria;
  });

  const handleSalva = async () => {
    try {
      const payload = macros.map((m) => {
        const r = rigaDi(m);
        return { id: m.id, tipologia: r.tipologia, fv_categoria: r.fv_categoria };
      });
      const sincronizzati = await collega.mutateAsync(payload);
      toast.success(
        `Listino collegato: ${fvCollegate.length} macrocategorie FV — ${sincronizzati} componenti sincronizzati`,
      );
      onOpenChange(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Collegamento non riuscito");
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !collega.isPending && onOpenChange(o)}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Link2 className="h-4 w-4 text-orange-500" /> Collega dal listino
          </DialogTitle>
          <DialogDescription>
            Classifica le macrocategorie del listino una volta sola: quelle con tipologia
            "Fotovoltaico" + componente vengono sincronizzate automaticamente nel
            preventivatore FV (anche per i prodotti aggiunti in futuro).
          </DialogDescription>
        </DialogHeader>

        {isLoading ? (
          <p className="text-sm text-slate-500 py-6 text-center">Caricamento listino…</p>
        ) : macros.length === 0 ? (
          <p className="text-sm text-slate-500 py-6 text-center">
            Nessuna macrocategoria nel listino. Crea prima il listino in Impostazioni → Catalogo.
          </p>
        ) : (
          <div className="space-y-2">
            {macros.map((m) => {
              const r = rows[m.id] ?? { tipologia: null, fv_categoria: null, proposta: false };
              const isFv = r.tipologia === "fotovoltaico";
              return (
                <div
                  key={m.id}
                  className={`rounded-lg border p-3 flex flex-col sm:flex-row sm:items-center gap-2 ${
                    isFv && r.fv_categoria ? "border-emerald-200 bg-emerald-50/40" : "border-slate-200"
                  }`}
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium text-sm text-slate-800 truncate">{m.nome}</span>
                      {!m.attivo && <Badge variant="secondary" className="text-[10px]">Macro disattivata</Badge>}
                      {r.proposta && (
                        <Badge variant="outline" className="text-[10px] border-amber-300 text-amber-700">
                          Proposta automatica
                        </Badge>
                      )}
                    </div>
                    <p className="text-xs text-slate-500 mt-0.5">
                      {m.prodottiAttivi} prodotti attivi nel listino
                    </p>
                  </div>
                  <div className="flex gap-2 shrink-0">
                    <Select
                      value={r.tipologia ?? SELECT_NONE}
                      onValueChange={(v) =>
                        setRow(m.id, {
                          tipologia: v === SELECT_NONE ? null : v,
                          fv_categoria: v === "fotovoltaico" ? r.fv_categoria : null,
                        })
                      }
                    >
                      <SelectTrigger className="w-[160px] h-9 text-xs">
                        <SelectValue placeholder="Tipologia" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value={SELECT_NONE}>— Nessuna tipologia —</SelectItem>
                        {TIPOLOGIE_LISTINO.map((t) => (
                          <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {isFv && (
                      <Select
                        value={r.fv_categoria ?? SELECT_NONE}
                        onValueChange={(v) =>
                          setRow(m.id, { fv_categoria: v === SELECT_NONE ? null : (v as CategoriaFvListino) })
                        }
                      >
                        <SelectTrigger className="w-[180px] h-9 text-xs">
                          <SelectValue placeholder="Componente FV" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value={SELECT_NONE}>— Scegli componente —</SelectItem>
                          {CATEGORIE_FV_LISTINO.map((c) => (
                            <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {macros.length > 0 && (
          <p className="text-xs text-slate-500">
            {fvCollegate.length > 0
              ? `${fvCollegate.length} macrocategorie collegate al preventivatore FV (${fvCollegate.reduce((s, m) => s + m.prodottiAttivi, 0)} prodotti totali).`
              : "Nessuna macrocategoria collegata al fotovoltaico: assegna tipologia e componente."}
            {daCollegare.length > 0 ? ` ${daCollegare.length} modifiche da salvare.` : ""}
          </p>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={collega.isPending}>
            Annulla
          </Button>
          <Button onClick={handleSalva} disabled={collega.isPending || macros.length === 0}>
            {collega.isPending ? "Sincronizzazione…" : "Salva e sincronizza"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
