/**
 * SerramentiTemplateEditor — editor del template PDF Stima Serramenti.
 *
 * Usato dentro la tab "Template Moduli Vendita" della pagina
 * Impostazioni → Libreria Template Preventivi.
 *
 * Configura:
 *  - Branding (logo, anagrafica azienda, colore)
 *  - Esigenze tipiche / Soluzione (testi pre-compilati)
 *  - USP + Cosa è incluso + Prossimi passi
 *  - Recensioni clienti (compaiono nel PDF pagina 2)
 *  - Default cronoprogramma + anticipo + IVA + validità
 */
import { useState, useEffect, useRef, useCallback, lazy, Suspense } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Save, Plus, Trash2, Loader2, MessageCircle, Eye,
  Sparkles, ListChecks, Clock, Quote, Upload, Image as ImageIcon,
  Building2, Wand2,
} from "lucide-react";
// Lazy load dei 3 sub-editor pesanti.
// PERF: caricati on-demand quando la tab è attiva o il dialog si apre.
// Risparmio: ~50 KB nel chunk principale dell'editor.
const SerramentiTemplatePreviewDialog = lazy(() =>
  import("@/components/serramenti/SerramentiTemplatePreviewDialog")
    .then((m) => ({ default: m.SerramentiTemplatePreviewDialog })),
);
const SerramentiPagesOrderEditor = lazy(() =>
  import("@/components/serramenti/SerramentiPagesOrderEditor")
    .then((m) => ({ default: m.SerramentiPagesOrderEditor })),
);
const SerramentiConversionEditor = lazy(() =>
  import("@/components/serramenti/SerramentiConversionEditor")
    .then((m) => ({ default: m.SerramentiConversionEditor })),
);
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useTemplatePdf, useUpsertTemplatePdf } from "@/lib/serramenti/queries";
import { SrCard, SrCallout } from "@/lib/serramenti/wizardUI";
import { MacroPagineDedicateManager } from "@/components/listino/MacroPagineDedicateManager";
import { FileText } from "lucide-react";
import type { SrTemplatePdfRow, SrEsigenza, SrSoluzioneItem, SrTestimonianza, SrPercorsoCliente, SrPercorsoFase } from "@/types/serramenti";
import { SR_PERCORSO_DEFAULT } from "@/types/serramenti";
import {
  PRESET_ESIGENZE, PRESET_ESIGENZE_ALT, PRESET_ESIGENZE_FAMIGLIA,
  PRESET_SOLUZIONE, PRESET_SOLUZIONE_PREMIUM,
  PRESET_PERCHE_NOI, PRESET_PERCHE_NOI_ALT, PRESET_PERCHE_NOI_TRUST,
  PRESET_INCLUSO, PRESET_INCLUSO_PLUS,
  PRESET_PROSSIMI_PASSI, PRESET_PROSSIMI_PASSI_PREMIUM,
  PRESET_RECENSIONI, PRESET_RECENSIONI_EXTRA, PRESET_RECENSIONI_ANZIANI,
} from "@/lib/serramenti/presets";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

interface SerramentiTemplateEditorProps {
  /** Se true, nasconde lo sticky bottom save (usato dentro Tabs con bottone proprio) */
  embedded?: boolean;
}

export function SerramentiTemplateEditor({ embedded = false }: SerramentiTemplateEditorProps) {
  const { data: template, isLoading } = useTemplatePdf();
  const upsertMut = useUpsertTemplatePdf();

  const [form, setForm] = useState<Partial<SrTemplatePdfRow>>({});
  const [dirty, setDirty] = useState(false);
  const [delTestIdx, setDelTestIdx] = useState<number | null>(null);
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const logoInputRef = useRef<HTMLInputElement | null>(null);
  const [uploadingChiSiamo, setUploadingChiSiamo] = useState(false);
  const chiSiamoInputRef = useRef<HTMLInputElement | null>(null);
  const [uploadingCover, setUploadingCover] = useState(false);
  const coverInputRef = useRef<HTMLInputElement | null>(null);
  // Anteprima PDF live: il bottone "Anteprima PDF" apre un dialog con il
  // template renderizzato + dati cliente demo. Aggiornamento auto su edit
  // (debounced 300ms) — vedi SerramentiTemplatePreviewDialog.
  const [previewOpen, setPreviewOpen] = useState(false);

  useEffect(() => {
    if (template) {
      setForm(template);
      setDirty(false);
    } else if (!isLoading) {
      setForm({
        colore_primario: "#2D7D5C",
        esigenze_default: [],
        soluzione_default: [],
        perche_noi_default: [],
        incluso_default: [],
        prossimi_passi_default: [],
        testimonianze_default: [],
        iva_percentuale_default: 22,
        anticipo_pct_default: 40,
        valido_giorni_default: 15,
        crono_giorni_produzione_default: 30,
        crono_giorni_posa_per_pezzo_default: 0.8,
        crono_giorni_collaudo_default: 1,
      });
    }
  }, [template, isLoading]);

  // PERF: useCallback stabilizza l'identity di `update` tra i re-render.
  // Senza, ogni keystroke creava una nuova function reference → i sub-editor
  // memoizzati (ConversionEditor, PagesOrderEditor) si re-renderizzavano
  // comunque perché la prop cambiava. Con useCallback (deps vuote, setState
  // funzionale + setDirty sono entrambi stabili) la reference è permanente.
  const update = useCallback(<K extends keyof SrTemplatePdfRow>(key: K, value: SrTemplatePdfRow[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }));
    setDirty(true);
  }, []);

  const handleSave = () => {
    upsertMut.mutate(form, {
      onSuccess: () => setDirty(false),
    });
  };

  // ─── Logo upload ──────────────────────────────────────────────────────────
  const handleLogoUpload = async (file: File) => {
    if (!file.type.startsWith("image/")) {
      toast.error("Carica un file immagine (PNG, JPG, WebP)");
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      toast.error("File troppo grande (max 5 MB)");
      return;
    }
    setUploadingLogo(true);
    try {
      const userId = (await supabase.auth.getUser()).data.user?.id;
      if (!userId) throw new Error("Non autenticato");
      const { data: profile } = await supabase
        .from("profiles" as never)
        .select("company_id")
        .eq("id", userId)
        .maybeSingle();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const companyId = (profile as any)?.company_id;
      if (!companyId) throw new Error("Profilo senza azienda");

      const ext = file.name.includes(".") ? file.name.split(".").pop()!.toLowerCase() : "png";
      const storagePath = `${companyId}/template-logos/${crypto.randomUUID()}.${ext}`;

      const { error: uploadErr } = await supabase.storage
        .from("sr-progetti")
        .upload(storagePath, file, { contentType: file.type, upsert: false });
      if (uploadErr) throw new Error(`Upload fallito: ${uploadErr.message}`);

      const { data: signed } = await supabase.storage
        .from("sr-progetti")
        .createSignedUrl(storagePath, 60 * 60 * 24 * 365);
      const logoUrl = signed?.signedUrl ?? "";

      update("logo_url", logoUrl);
      toast.success("Logo caricato. Salva per applicare.");
    } catch (e) {
      console.error("[serramenti-template-editor] logo upload", e);
      toast.error("Errore upload logo", { description: String(e) });
    } finally {
      setUploadingLogo(false);
      if (logoInputRef.current) logoInputRef.current.value = "";
    }
  };

  /**
   * Upload diretto foto "Chi siamo" — riusa lo stesso pattern del logo
   * (bucket sr-progetti, signed URL 1 anno). Salva in chi_siamo_foto_url.
   */
  const handleChiSiamoUpload = async (file: File) => {
    if (!file.type.startsWith("image/")) {
      toast.error("Carica un file immagine (PNG, JPG, WebP)");
      return;
    }
    if (file.size > 8 * 1024 * 1024) {
      toast.error("File troppo grande (max 8 MB)");
      return;
    }
    setUploadingChiSiamo(true);
    try {
      const userId = (await supabase.auth.getUser()).data.user?.id;
      if (!userId) throw new Error("Non autenticato");
      const { data: profile } = await supabase
        .from("profiles" as never)
        .select("company_id")
        .eq("id", userId)
        .maybeSingle();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const companyId = (profile as any)?.company_id;
      if (!companyId) throw new Error("Profilo senza azienda");

      const ext = file.name.includes(".") ? file.name.split(".").pop()!.toLowerCase() : "jpg";
      const storagePath = `${companyId}/template-chi-siamo/${crypto.randomUUID()}.${ext}`;

      const { error: uploadErr } = await supabase.storage
        .from("sr-progetti")
        .upload(storagePath, file, { contentType: file.type, upsert: false });
      if (uploadErr) throw new Error(`Upload fallito: ${uploadErr.message}`);

      const { data: signed } = await supabase.storage
        .from("sr-progetti")
        .createSignedUrl(storagePath, 60 * 60 * 24 * 365);
      const url = signed?.signedUrl ?? "";

      update("chi_siamo_foto_url", url);
      toast.success("Foto azienda caricata. Salva per applicare.");
    } catch (e) {
      console.error("[serramenti-template-editor] chi-siamo upload", e);
      toast.error("Errore upload foto", { description: String(e) });
    } finally {
      setUploadingChiSiamo(false);
      if (chiSiamoInputRef.current) chiSiamoInputRef.current.value = "";
    }
  };

  /**
   * Upload immagine di sfondo cover (pagina 1 del PDF).
   * Stesso pattern logo/chi-siamo: bucket sr-progetti + signed URL 1 anno.
   */
  const handleCoverUpload = async (file: File) => {
    if (!file.type.startsWith("image/")) {
      toast.error("Carica un file immagine (PNG, JPG, WebP)");
      return;
    }
    if (file.size > 8 * 1024 * 1024) {
      toast.error("File troppo grande (max 8 MB)");
      return;
    }
    setUploadingCover(true);
    try {
      const userId = (await supabase.auth.getUser()).data.user?.id;
      if (!userId) throw new Error("Non autenticato");
      const { data: profile } = await supabase
        .from("profiles" as never)
        .select("company_id")
        .eq("id", userId)
        .maybeSingle();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const companyId = (profile as any)?.company_id;
      if (!companyId) throw new Error("Profilo senza azienda");

      const ext = file.name.includes(".") ? file.name.split(".").pop()!.toLowerCase() : "jpg";
      const storagePath = `${companyId}/template-cover/${crypto.randomUUID()}.${ext}`;

      const { error: uploadErr } = await supabase.storage
        .from("sr-progetti")
        .upload(storagePath, file, { contentType: file.type, upsert: false });
      if (uploadErr) throw new Error(`Upload fallito: ${uploadErr.message}`);

      const { data: signed } = await supabase.storage
        .from("sr-progetti")
        .createSignedUrl(storagePath, 60 * 60 * 24 * 365);
      const url = signed?.signedUrl ?? "";

      update("pdf_cover_image_url", url);
      toast.success("Immagine cover caricata. Salva per applicare.");
    } catch (e) {
      console.error("[serramenti-template-editor] cover upload", e);
      toast.error("Errore upload cover", { description: String(e) });
    } finally {
      setUploadingCover(false);
      if (coverInputRef.current) coverInputRef.current.value = "";
    }
  };

  if (isLoading) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-16" />
        <Skeleton className="h-64" />
        <Skeleton className="h-96" />
      </div>
    );
  }

  // ─── Preset Dropdown helper ──────────────────────────────────────────────
  // Mostra un menu "Applica template" con N varianti. Avverte se sovrascrive.
  const PresetMenu = <T,>({
    label,
    presets,
    currentValue,
    onApply,
  }: {
    label: string;
    presets: { label: string; value: T }[];
    currentValue: T;
    onApply: (v: T) => void;
  }) => {
    const hasContent = Array.isArray(currentValue) && (currentValue as unknown as unknown[]).length > 0;
    return (
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button size="sm" variant="outline" className="gap-1 border-orange-300 text-orange-600 hover:bg-orange-50">
            <Wand2 className="h-3.5 w-3.5" />
            {label}
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-64">
          <DropdownMenuLabel className="text-xs">Scegli un template</DropdownMenuLabel>
          <DropdownMenuSeparator />
          {presets.map((p, i) => (
            <DropdownMenuItem
              key={i}
              className="cursor-pointer text-xs"
              onClick={() => {
                if (hasContent && !confirm(`Sovrascrivere il contenuto attuale con il template "${p.label}"?`)) return;
                onApply(p.value);
                toast.success(`Template "${p.label}" applicato`);
              }}
            >
              {p.label}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
    );
  };

  // ─── Testimonianze ────────────────────────────────────────────────────────

  const testimonianze = (form.testimonianze_default ?? []) as SrTestimonianza[];

  const addTestimonianza = () => {
    update("testimonianze_default", [
      ...testimonianze,
      { quote: "", autore: "", citta: "", intervento: "" } as SrTestimonianza,
    ]);
  };

  const updateTestimonianza = (idx: number, field: keyof SrTestimonianza, value: string) => {
    const next = [...testimonianze];
    next[idx] = { ...next[idx], [field]: value };
    update("testimonianze_default", next);
  };

  const removeTestimonianza = (idx: number) => {
    const next = testimonianze.filter((_, i) => i !== idx);
    update("testimonianze_default", next);
    setDelTestIdx(null);
  };

  // ─── Helpers liste e oggetti ──────────────────────────────────────────────

  const renderListEditor = (
    label: string,
    key: "perche_noi_default" | "incluso_default" | "prossimi_passi_default",
    placeholder: string,
  ) => {
    const items = ((form[key] as string[]) ?? []);
    const updateItem = (idx: number, value: string) => {
      const next = [...items];
      while (next.length <= idx) next.push("");
      next[idx] = value;
      update(key, next);
    };
    const removeItem = (idx: number) => {
      update(key, items.filter((_, i) => i !== idx));
    };
    const addItem = () => {
      update(key, [...items, ""]);
    };
    return (
      <div className="space-y-2">
        {items.map((item, idx) => (
          <div key={idx} className="flex items-start gap-2">
            <span className="h-7 w-7 mt-1 rounded-full bg-orange-100 text-orange-600 flex items-center justify-center text-xs font-bold shrink-0">
              {idx + 1}
            </span>
            <Input
              value={item}
              onChange={(e) => updateItem(idx, e.target.value)}
              placeholder={placeholder}
              className="h-9 text-xs flex-1"
            />
            <Button size="icon" variant="ghost" onClick={() => removeItem(idx)} className="h-9 w-9 shrink-0">
              <Trash2 className="h-3.5 w-3.5 text-rose-600" />
            </Button>
          </div>
        ))}
        <Button onClick={addItem} variant="outline" size="sm" className="w-full border-dashed gap-1">
          <Plus className="h-3.5 w-3.5" /> Aggiungi {label.toLowerCase()}
        </Button>
      </div>
    );
  };

  const renderBulletObjectEditor = (
    label: string,
    key: "esigenze_default" | "soluzione_default",
  ) => {
    const items = ((form[key] as Array<SrEsigenza | SrSoluzioneItem>) ?? []);
    const updateItem = (idx: number, field: "titolo" | "descrizione", value: string) => {
      const next = [...items];
      while (next.length <= idx) next.push({ titolo: "", descrizione: "" });
      next[idx] = { ...next[idx], [field]: value };
      update(key, next);
    };
    const removeItem = (idx: number) => {
      update(key, items.filter((_, i) => i !== idx));
    };
    const addItem = () => {
      update(key, [...items, { titolo: "", descrizione: "" }]);
    };
    return (
      <div className="space-y-3">
        {items.map((item, idx) => (
          <div key={idx} className="border-l-4 border-orange-200 pl-3 py-1">
            <div className="flex items-center justify-between gap-2">
              <Label className="text-xs">Titolo</Label>
              <Button size="sm" variant="ghost" onClick={() => removeItem(idx)} className="h-7 px-2 text-xs text-rose-600">
                <Trash2 className="h-3.5 w-3.5 mr-1" /> Rimuovi
              </Button>
            </div>
            <Input
              value={item.titolo ?? ""}
              onChange={(e) => updateItem(idx, "titolo", e.target.value)}
              placeholder={`Titolo ${label.toLowerCase()} ${idx + 1}`}
              className="h-9 mb-2"
            />
            <Label className="text-xs">Descrizione</Label>
            <Textarea
              value={item.descrizione ?? ""}
              onChange={(e) => updateItem(idx, "descrizione", e.target.value)}
              placeholder="Cosa risolve / vantaggio"
              rows={2}
            />
          </div>
        ))}
        <Button onClick={addItem} variant="outline" size="sm" className="w-full border-dashed gap-1">
          <Plus className="h-3.5 w-3.5" /> Aggiungi {label.toLowerCase()}
        </Button>
      </div>
    );
  };

  return (
    <div className="space-y-4">
      {/* TOOLBAR STICKY in alto: sempre visibile durante lo scroll.
          Include: stato modifiche · ANTEPRIMA PDF (prominent) · Salva.
          Prima il bottone Anteprima esisteva solo nel footer sticky in basso
          → fuori dalla viewport quando l'utente è in cima. Ora è in cima E
          in basso. */}
      <div className="sticky top-0 z-20 -mx-1 px-1 py-2.5 bg-background/95 backdrop-blur border-b border-slate-100 flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2 min-w-0">
          <div className="text-xs text-muted-foreground hidden sm:block">
            Template PDF Serramenti
          </div>
          {dirty ? (
            <span className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-full px-2 py-0.5 font-medium">
              ● Modifiche non salvate
            </span>
          ) : (
            <span className="text-xs text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-full px-2 py-0.5 font-medium hidden sm:inline-block">
              ✓ Salvato
            </span>
          )}
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <Button
            onClick={() => setPreviewOpen(true)}
            variant="outline"
            size="sm"
            className="gap-1.5 border-orange-300 text-orange-600 hover:bg-orange-50"
          >
            <Eye className="h-4 w-4" />
            <span className="hidden sm:inline">Anteprima PDF</span>
            <span className="sm:hidden">Anteprima</span>
          </Button>
          <Button
            onClick={handleSave}
            disabled={!dirty || upsertMut.isPending}
            className="bg-orange-600 hover:bg-orange-500 gap-1"
            size="sm"
          >
            {upsertMut.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            Salva
          </Button>
        </div>
      </div>

      {/* SEZIONE: Brand & Azienda */}
      <SectionHeader
        title="1. Brand & azienda"
        description="Logo, dati anagrafici, colori e linee prodotto che compaiono in ogni PDF."
        number={1}
      />

      {/* Anagrafica + branding */}
      <SrCard
        title="Anagrafica e branding azienda"
        description="Logo, dati e colore primario che compaiono nell'header e footer di ogni preventivo PDF."
        icon={<Building2 className="h-4 w-4" />}
      >
        <div className="grid grid-cols-12 gap-3">
          {/* Logo */}
          <div className="col-span-12 md:col-span-3">
            <Label className="text-xs mb-1 block">Logo PDF</Label>
            <input
              ref={logoInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => e.target.files?.[0] && handleLogoUpload(e.target.files[0])}
            />
            <div
              className="aspect-square rounded-md border-2 border-dashed border-slate-200 bg-muted/20 hover:border-orange-300 hover:bg-orange-50/30 cursor-pointer flex items-center justify-center overflow-hidden relative"
              onClick={() => !uploadingLogo && logoInputRef.current?.click()}
            >
              {form.logo_url ? (
                <img src={form.logo_url} alt="" className="w-full h-full object-contain p-2" />
              ) : (
                <div className="text-center p-3">
                  <ImageIcon className="h-8 w-8 mx-auto text-muted-foreground/40 mb-1" />
                  <p className="text-[10px] text-muted-foreground">Clicca per caricare</p>
                </div>
              )}
              {uploadingLogo && (
                <div className="absolute inset-0 bg-white/80 flex items-center justify-center">
                  <Loader2 className="h-5 w-5 animate-spin text-orange-600" />
                </div>
              )}
            </div>
            <div className="flex gap-1 mt-1">
              <Button
                size="sm" variant="outline"
                onClick={() => logoInputRef.current?.click()}
                disabled={uploadingLogo}
                className="flex-1 h-7 text-[11px]"
              >
                <Upload className="h-3 w-3 mr-1" />
                {form.logo_url ? "Cambia" : "Carica"}
              </Button>
              {form.logo_url && (
                <Button
                  size="sm" variant="outline"
                  onClick={() => update("logo_url", null)}
                  className="h-7 text-[11px] text-rose-600"
                >
                  <Trash2 className="h-3 w-3" />
                </Button>
              )}
            </div>
            <p className="text-[10px] text-muted-foreground mt-1">PNG/JPG, max 5 MB. Sfondo trasparente consigliato.</p>
          </div>

          <div className="col-span-12 md:col-span-9 grid grid-cols-12 gap-3">
            <div className="col-span-12">
              <Label className="text-xs">Ragione sociale</Label>
              <Input
                value={form.ragione_sociale ?? ""}
                onChange={(e) => update("ragione_sociale", e.target.value)}
                placeholder="Es. Showroom Demo Srl"
                className="h-9"
              />
            </div>
            <div className="col-span-12">
              <Label className="text-xs">Indirizzo completo</Label>
              <Input
                value={form.indirizzo_completo ?? ""}
                onChange={(e) => update("indirizzo_completo", e.target.value)}
                placeholder="Es. Via Roma 42 · 20121 Milano (MI)"
                className="h-9"
              />
            </div>
            <div className="col-span-12 md:col-span-4">
              <Label className="text-xs">Telefono</Label>
              <Input
                value={form.telefono ?? ""}
                onChange={(e) => update("telefono", e.target.value)}
                placeholder="+39 02 1234 5678"
                className="h-9"
              />
            </div>
            <div className="col-span-12 md:col-span-4">
              <Label className="text-xs">Email</Label>
              <Input
                value={form.email ?? ""}
                onChange={(e) => update("email", e.target.value)}
                placeholder="info@azienda.it"
                className="h-9"
                type="email"
              />
            </div>
            <div className="col-span-12 md:col-span-4">
              <Label className="text-xs">P.IVA</Label>
              <Input
                value={form.partita_iva ?? ""}
                onChange={(e) => update("partita_iva", e.target.value)}
                placeholder="IT12345670156"
                className="h-9"
              />
            </div>
            <div className="col-span-12 md:col-span-6">
              <Label className="text-xs">Colore primario (verde elegante consigliato)</Label>
              <div className="flex gap-2">
                <Input
                  type="color"
                  value={form.colore_primario ?? "#2D7D5C"}
                  onChange={(e) => update("colore_primario", e.target.value)}
                  className="h-9 w-14 p-1 cursor-pointer"
                />
                <Input
                  value={form.colore_primario ?? "#2D7D5C"}
                  onChange={(e) => update("colore_primario", e.target.value)}
                  className="h-9 flex-1 font-mono"
                />
              </div>
            </div>
          </div>
        </div>
      </SrCard>

      {/* SEZIONE: Contenuti commerciali */}
      <SectionHeader
        title="2. Contenuti commerciali"
        description="Le librerie da cui pesca il consulente: esigenze, soluzioni, USP, incluso, recensioni, prossimi passi."
        number={2}
      />

      {/* Esigenze */}
      <SrCard
        title="Libreria esigenze tipiche del cliente"
        description="Aggiungi qui tutte le esigenze più comuni dei tuoi clienti. Nel preventivo sceglierai quali includere per ogni cliente specifico."
        icon={<MessageCircle className="h-4 w-4" />}
      >
        <div className="flex justify-end mb-3">
          <PresetMenu<SrEsigenza[]>
            label="Applica template standard"
            currentValue={(form.esigenze_default ?? []) as SrEsigenza[]}
            presets={[
              { label: "🏠 Comfort termico — Spifferi · Condensa · Estetica", value: PRESET_ESIGENZE },
              { label: "💰 Risparmio + Sicurezza — Bollette · Rumore · Antieffrazione", value: PRESET_ESIGENZE_ALT },
              { label: "👶 Famiglia — Sicurezza bimbi · Caldo estate · Manutenzione zero", value: PRESET_ESIGENZE_FAMIGLIA },
            ]}
            onApply={(v) => update("esigenze_default", v)}
          />
        </div>
        {renderBulletObjectEditor("esigenza", "esigenze_default")}
      </SrCard>

      {/* Soluzione */}
      <SrCard
        title="Libreria soluzioni / argomenti di vendita"
        description="Tutte le soluzioni che proponi (su misura, posa qualificata, vetri premium...). Le sceglierai una per una per ogni preventivo."
        icon={<Sparkles className="h-4 w-4" />}
      >
        <div className="flex justify-end mb-3">
          <PresetMenu<SrSoluzioneItem[]>
            label="Applica template standard"
            currentValue={(form.soluzione_default ?? []) as SrSoluzioneItem[]}
            presets={[
              { label: "💎 Standard (Su misura + Posa UNI 11673)", value: PRESET_SOLUZIONE },
              { label: "🏆 Premium (Uw 0.8 + Taglio termico + 42 dB acustico)", value: PRESET_SOLUZIONE_PREMIUM },
            ]}
            onApply={(v) => update("soluzione_default", v)}
          />
        </div>
        {renderBulletObjectEditor("soluzione", "soluzione_default")}
      </SrCard>

      {/* Perché noi */}
      <SrCard
        title="Libreria USP — Perché scegliere noi"
        description="Tutti i punti forti della tua azienda. Nel preventivo selezionerai quelli più rilevanti per ogni cliente."
        icon={<ListChecks className="h-4 w-4" />}
      >
        <div className="flex justify-end mb-3">
          <PresetMenu<string[]>
            label="Applica template standard"
            currentValue={(form.perche_noi_default ?? []) as string[]}
            presets={[
              { label: "✅ Servizio chiavi in mano (1 contatto · Garanzia 10 anni)", value: PRESET_PERCHE_NOI },
              { label: "🏆 Numeri reali (1.200 cantieri · Showroom · Penale ritardi)", value: PRESET_PERCHE_NOI_ALT },
              { label: "🛡️ Trust & sicurezza (Iscrizione CCIAA · Polizza · Recensioni Google)", value: PRESET_PERCHE_NOI_TRUST },
            ]}
            onApply={(v) => update("perche_noi_default", v)}
          />
        </div>
        {renderListEditor("USP", "perche_noi_default", "Es. Posa eseguita a regola d'arte con sigillature certificate")}
      </SrCard>

      {/* Incluso */}
      <SrCard
        title="Libreria 'Cosa è incluso nell'investimento'"
        description="Tutte le voci che possono essere incluse nelle tue offerte. Nel preventivo scegli quali sono attive per quel cliente."
        icon={<ListChecks className="h-4 w-4" />}
      >
        <div className="flex justify-end mb-3">
          <PresetMenu<string[]>
            label="Applica template standard"
            currentValue={(form.incluso_default ?? []) as string[]}
            presets={[
              { label: "📦 Standard (5 voci — rilievo, posa, sigillature, collaudo)", value: PRESET_INCLUSO },
              { label: "⭐ Plus (8 voci — ENEA + foto cantiere + pulizia + garanzie scritte)", value: PRESET_INCLUSO_PLUS },
            ]}
            onApply={(v) => update("incluso_default", v)}
          />
        </div>
        {renderListEditor("voce", "incluso_default", "Es. Rilievo dimensionale a casa tua senza costi aggiuntivi")}
      </SrCard>

      {/* Testimonianze */}
      <SrCard
        title="Recensioni e testimonianze"
        description="Pagina 2 del PDF — sezione 'Cosa dicono i nostri clienti'."
        icon={<Quote className="h-4 w-4" />}
        variant="highlight"
      >
        <div className="flex justify-end mb-3">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button size="sm" variant="outline" className="gap-1 border-orange-300 text-orange-600 hover:bg-orange-50">
                <Wand2 className="h-3.5 w-3.5" />
                Carica recensioni di esempio
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-80">
              <DropdownMenuLabel className="text-xs">Aggiungi recensioni di esempio</DropdownMenuLabel>
              <p className="px-2 pb-1 text-[10px] text-muted-foreground italic">
                Placeholder credibili da personalizzare con nomi e cantieri reali della tua azienda
              </p>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                className="cursor-pointer text-xs"
                onClick={() => {
                  update("testimonianze_default", [...testimonianze, ...PRESET_RECENSIONI]);
                  toast.success("3 recensioni aggiunte. Personalizzale con dati reali.");
                }}
              >
                ⭐ Set classico — 3 recensioni con prova sociale
                <span className="block text-[10px] text-muted-foreground">Bifamiliare · Villa · Appartamento</span>
              </DropdownMenuItem>
              <DropdownMenuItem
                className="cursor-pointer text-xs"
                onClick={() => {
                  update("testimonianze_default", [...testimonianze, ...PRESET_RECENSIONI_EXTRA]);
                  toast.success("3 recensioni aggiunte. Personalizzale con dati reali.");
                }}
              >
                💰 Set risultati misurabili — 3 recensioni con numeri concreti
                <span className="block text-[10px] text-muted-foreground">Bolletta -35% · Cantiere con bimbi · Payback verificato</span>
              </DropdownMenuItem>
              <DropdownMenuItem
                className="cursor-pointer text-xs"
                onClick={() => {
                  update("testimonianze_default", [...testimonianze, ...PRESET_RECENSIONI_ANZIANI]);
                  toast.success("1 recensione aggiunta — target anziani / cura cantiere.");
                }}
              >
                🤝 Aggiungi 1 recensione 'cura del cliente anziano'
                <span className="block text-[10px] text-muted-foreground">Empatia, pazienza, casa lasciata pulita</span>
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                className="cursor-pointer text-xs"
                onClick={() => {
                  if (testimonianze.length > 0 && !confirm("Sostituire tutte le recensioni attuali con il set completo (7 recensioni)?")) return;
                  update("testimonianze_default", [...PRESET_RECENSIONI, ...PRESET_RECENSIONI_EXTRA, ...PRESET_RECENSIONI_ANZIANI]);
                  toast.success("7 recensioni esempio applicate.");
                }}
              >
                ⚠ Sostituisci con set completo (7 recensioni)
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
        <div className="space-y-3">
          {testimonianze.length === 0 && (
            <SrCallout variant="info">
              Nessuna recensione caricata. Aggiungile per mostrare prova sociale ai nuovi clienti, o clicca <strong>"Carica recensioni di esempio"</strong> qui sopra per partire da template realistici.
            </SrCallout>
          )}
          {testimonianze.map((t, idx) => (
            <Card key={idx} className="bg-orange-50/30 border-orange-200">
              <CardHeader className="p-3 pb-2 flex flex-row items-center justify-between">
                <CardTitle className="text-xs uppercase tracking-wide text-orange-600">
                  Recensione {idx + 1}
                </CardTitle>
                <Button size="sm" variant="ghost" onClick={() => setDelTestIdx(idx)} className="h-7 px-2 text-xs text-rose-600">
                  <Trash2 className="h-3.5 w-3.5 mr-1" /> Rimuovi
                </Button>
              </CardHeader>
              <CardContent className="p-3 pt-0 grid grid-cols-12 gap-2">
                <div className="col-span-12">
                  <Label className="text-xs">Citazione</Label>
                  <Textarea
                    value={t.quote ?? ""}
                    onChange={(e) => updateTestimonianza(idx, "quote", e.target.value)}
                    placeholder={'"Avevamo chiesto un preventivo a quattro aziende: loro ce l\'hanno fatto interamente in casa..."'}
                    rows={3}
                  />
                </div>
                <div className="col-span-12 md:col-span-4">
                  <Label className="text-xs">Autore</Label>
                  <Input
                    value={t.autore ?? ""}
                    onChange={(e) => updateTestimonianza(idx, "autore", e.target.value)}
                    placeholder="Andrea e Silvia M."
                    className="h-9 text-xs"
                  />
                </div>
                <div className="col-span-6 md:col-span-3">
                  <Label className="text-xs">Città</Label>
                  <Input
                    value={t.citta ?? ""}
                    onChange={(e) => updateTestimonianza(idx, "citta", e.target.value)}
                    placeholder="Gorgonzola"
                    className="h-9 text-xs"
                  />
                </div>
                <div className="col-span-6 md:col-span-5">
                  <Label className="text-xs">Tipo intervento</Label>
                  <Input
                    value={t.intervento ?? ""}
                    onChange={(e) => updateTestimonianza(idx, "intervento", e.target.value)}
                    placeholder="22 serramenti alluminio-legno"
                    className="h-9 text-xs"
                  />
                </div>
              </CardContent>
            </Card>
          ))}
          <Button
            onClick={addTestimonianza}
            variant="outline"
            className="w-full border-dashed border-2 border-orange-300 hover:bg-orange-50 gap-1"
          >
            <Plus className="h-4 w-4" /> Aggiungi recensione
          </Button>
        </div>
      </SrCard>

      {/* Prossimi passi */}
      <SrCard
        title="Libreria 'Prossimi passi' (chiusura PDF)"
        description="Tutti i possibili step del tuo processo di vendita. Nel preventivo scegli quali mostrare al cliente specifico."
        icon={<ListChecks className="h-4 w-4" />}
      >
        <div className="flex justify-end mb-3">
          <PresetMenu<string[]>
            label="Applica template standard"
            currentValue={(form.prossimi_passi_default ?? []) as string[]}
            presets={[
              { label: "👋 Standard (4 step — Chiamata → Sopralluogo → Piano → Firma)", value: PRESET_PROSSIMI_PASSI },
              { label: "🏆 Premium (5 step con showroom e prezzo bloccato)", value: PRESET_PROSSIMI_PASSI_PREMIUM },
            ]}
            onApply={(v) => update("prossimi_passi_default", v)}
          />
        </div>
        {renderListEditor("step", "prossimi_passi_default", "Es. Ci vediamo a casa tua per la consulenza tecnica")}
      </SrCard>

      {/* SEZIONE: Linee prodotto */}
      <SectionHeader
        title="3. Linee prodotto (macrocategorie)"
        description="Le pagine dedicate macrocategoria che vengono inserite nel PDF dopo la composizione tecnica."
        number={3}
      />

      {/* Pagine dedicate macrocategoria — sincronizzate con il listino */}
      <SrCard
        title="Pagine dedicate macrocategoria"
        description="Quando un articolo di una macro attivata è nel preventivo, il PDF aggiunge una pagina dedicata (foto + descrizione estesa). Le modifiche qui sono sincronizzate con il listino."
        icon={<FileText className="h-4 w-4" />}
      >
        <MacroPagineDedicateManager vertical="serramentista" />
      </SrCard>

      {/* SEZIONE: PDF preventivo */}
      <SectionHeader
        title="4. Pagine PDF preventivo"
        description="Personalizza ogni pagina del PDF cliente: cover, chi siamo, percorso, render, CTA, ordine pagine."
        number={4}
      />

      {/* Personalizzazione PDF: cover, chi siamo, consulente, render, CTA, percorso — tabbed */}
      <SrCard
        title="Personalizzazione PDF preventivo"
        description="Editor centralizzato per tutte le pagine del PDF: cover, chi siamo, consulente, percorso, recensioni, render e CTA finale."
        icon={<FileText className="h-4 w-4" />}
      >
        <Tabs defaultValue="cover" className="w-full">
          <TabsList className="w-full flex flex-wrap h-auto justify-start gap-1 bg-muted/30 p-1">
            <TabsTrigger value="cover" className="text-xs data-[state=active]:bg-orange-500 data-[state=active]:text-white">Cover</TabsTrigger>
            <TabsTrigger value="chi-siamo" className="text-xs data-[state=active]:bg-orange-500 data-[state=active]:text-white">Chi siamo</TabsTrigger>
            <TabsTrigger value="percorso" className="text-xs data-[state=active]:bg-orange-500 data-[state=active]:text-white">Il tuo percorso</TabsTrigger>
            <TabsTrigger value="consulente" className="text-xs data-[state=active]:bg-orange-500 data-[state=active]:text-white">Consulente</TabsTrigger>
            <TabsTrigger value="recensioni" className="text-xs data-[state=active]:bg-orange-500 data-[state=active]:text-white">Recensioni</TabsTrigger>
            <TabsTrigger value="render" className="text-xs data-[state=active]:bg-orange-500 data-[state=active]:text-white">Render AI</TabsTrigger>
            <TabsTrigger value="cta" className="text-xs data-[state=active]:bg-orange-500 data-[state=active]:text-white">CTA finale</TabsTrigger>
            <TabsTrigger value="conversione" className="text-xs data-[state=active]:bg-orange-500 data-[state=active]:text-white">⚡ Conversione</TabsTrigger>
            <TabsTrigger value="ordine-pagine" className="text-xs data-[state=active]:bg-orange-500 data-[state=active]:text-white">Ordine pagine</TabsTrigger>
          </TabsList>

          {/* ═══ COVER ═══════════════════════════════════════════════════════ */}
          <TabsContent value="cover" className="mt-4 space-y-3">
            <div className="flex items-center justify-between">
              <div className="text-xs text-muted-foreground">
                Editor visuale · anteprima in tempo reale · tutti i parametri sotto
              </div>
            </div>

            <div className="grid grid-cols-12 gap-4">
              {/* PREVIEW LIVE — formato A4 portrait scalato */}
              <div className="col-span-12 md:col-span-5">
                <Label className="text-xs mb-1.5 block">Anteprima cover</Label>
                <div
                  className="relative w-full overflow-hidden rounded-lg border-2 border-slate-200 shadow-sm"
                  style={{
                    aspectRatio: "210/297",
                    backgroundColor: form.pdf_cover_bg_color || "#0F2A2E",
                  }}
                >
                  {/* Immagine di sfondo */}
                  {form.pdf_cover_image_url && (
                    <img
                      src={form.pdf_cover_image_url}
                      alt="cover bg"
                      className="absolute inset-0 w-full h-full object-cover"
                    />
                  )}
                  {/* Overlay scuro su immagine */}
                  {form.pdf_cover_image_url && (
                    <div
                      className="absolute inset-0 bg-black pointer-events-none"
                      style={{
                        opacity:
                          (form.pdf_cover_overlay_opacity ?? 65) / 100,
                      }}
                    />
                  )}
                  {/* Decoro accent in alto a destra (toggle) */}
                  {form.pdf_cover_show_decoration !== false && (
                    <div
                      className="absolute top-3 right-3 w-12 h-12 rounded-md opacity-70"
                      style={{
                        backgroundColor: form.colore_primario || "#2D7D5C",
                      }}
                    />
                  )}
                  {/* Contenuto testuale */}
                  <div
                    className="absolute inset-0 p-4 flex flex-col"
                    style={{
                      color: form.pdf_cover_text_color || "#FFFFFF",
                      textAlign: form.pdf_cover_text_align === "center" ? "center" : "left",
                      alignItems: form.pdf_cover_text_align === "center" ? "center" : "flex-start",
                    }}
                  >
                    {/* Logo + company name */}
                    <div className="flex items-center gap-2 mb-auto">
                      {form.logo_url ? (
                        <img
                          src={form.logo_url}
                          alt="logo"
                          className="h-7 w-7 object-contain rounded bg-white/10 p-0.5"
                        />
                      ) : (
                        <div className="h-7 w-7 rounded-full bg-white/20 flex items-center justify-center text-[10px] font-bold">
                          A
                        </div>
                      )}
                      <span className="text-[10px] font-semibold uppercase tracking-wide">
                        {form.indirizzo_completo ? "Azienda" : "Il tuo brand"}
                      </span>
                    </div>

                    {/* Eyebrow + Title + Subtitle */}
                    <div className="mb-4 w-full">
                      <div
                        className="font-semibold uppercase tracking-wider mb-2"
                        style={{
                          color: form.colore_primario || "#2D7D5C",
                          fontSize: `${(form.pdf_cover_eyebrow_size ?? 11) * 0.6}px`,
                        }}
                      >
                        {form.pdf_cover_eyebrow ||
                          "★ La tua proposta personalizzata"}
                      </div>
                      <div
                        className="font-bold leading-tight whitespace-pre-wrap mb-1.5"
                        style={{
                          fontSize: `${(form.pdf_cover_title_size ?? 40) * 0.5}px`,
                        }}
                      >
                        {form.pdf_cover_hero ||
                          "La tua casa,\nfinalmente al caldo."}
                      </div>
                      <div
                        className="opacity-80 line-clamp-2"
                        style={{
                          fontSize: `${(form.pdf_cover_subtitle_size ?? 13) * 0.6}px`,
                        }}
                      >
                        {form.pdf_cover_subhero ||
                          "Sintesi auto-generata del preventivo"}
                      </div>
                      {form.pdf_cover_show_client_card !== false && (
                        <div className="mt-3 bg-white/10 rounded-md p-2 backdrop-blur-sm text-left">
                          <div className="text-[8px] uppercase opacity-70">
                            Preparato per
                          </div>
                          <div className="text-xs font-semibold">
                            Mario Rossi
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
                <p className="text-[10px] text-muted-foreground mt-1.5">
                  Anteprima approssimativa · il PDF finale può differire
                  leggermente per tipografia
                </p>
              </div>

              {/* CONTROLLI EDITOR */}
              <div className="col-span-12 md:col-span-7 space-y-3">
                {/* Immagine di sfondo */}
                <div>
                  <Label className="text-xs mb-1 block">
                    Immagine di sfondo cover (opzionale)
                  </Label>
                  <input
                    ref={coverInputRef}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(e) =>
                      e.target.files?.[0] && handleCoverUpload(e.target.files[0])
                    }
                  />
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => coverInputRef.current?.click()}
                      disabled={uploadingCover}
                      className="flex-1 h-8 text-xs"
                    >
                      {uploadingCover ? (
                        <Loader2 className="h-3 w-3 mr-1.5 animate-spin" />
                      ) : (
                        <Upload className="h-3 w-3 mr-1.5" />
                      )}
                      {form.pdf_cover_image_url
                        ? "Cambia immagine"
                        : "Carica immagine"}
                    </Button>
                    {form.pdf_cover_image_url && (
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => update("pdf_cover_image_url", null)}
                        className="h-8 text-xs text-rose-600"
                      >
                        Rimuovi
                      </Button>
                    )}
                  </div>
                  <p className="text-[10px] text-muted-foreground mt-1">
                    Senza immagine viene usato il colore di sfondo solido.
                    PNG/JPG max 8 MB.
                  </p>
                </div>

                {/* Overlay opacity — visibile solo se c'è un'immagine */}
                {form.pdf_cover_image_url && (
                  <div>
                    <Label className="text-xs flex items-center justify-between mb-1">
                      <span>Opacità overlay scuro</span>
                      <span className="font-mono text-muted-foreground">
                        {form.pdf_cover_overlay_opacity ?? 65}%
                      </span>
                    </Label>
                    <input
                      type="range"
                      min={0}
                      max={100}
                      step={5}
                      value={form.pdf_cover_overlay_opacity ?? 65}
                      onChange={(e) =>
                        update(
                          "pdf_cover_overlay_opacity",
                          Number(e.target.value),
                        )
                      }
                      className="w-full accent-orange-500"
                    />
                  </div>
                )}

                {/* Colore di sfondo (solo quando non c'è immagine) */}
                {!form.pdf_cover_image_url && (
                  <div>
                    <Label className="text-xs mb-1 block">
                      Colore di sfondo cover
                    </Label>
                    <div className="flex items-center gap-2">
                      <input
                        type="color"
                        value={form.pdf_cover_bg_color || "#0F2A2E"}
                        onChange={(e) =>
                          update("pdf_cover_bg_color", e.target.value)
                        }
                        className="h-8 w-12 rounded border cursor-pointer"
                      />
                      <Input
                        value={form.pdf_cover_bg_color ?? ""}
                        onChange={(e) =>
                          update(
                            "pdf_cover_bg_color",
                            e.target.value || null,
                          )
                        }
                        placeholder="#0F2A2E"
                        className="h-8 text-xs font-mono flex-1"
                      />
                      {form.pdf_cover_bg_color && (
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => update("pdf_cover_bg_color", null)}
                          className="h-8 text-[11px]"
                        >
                          Reset
                        </Button>
                      )}
                    </div>
                  </div>
                )}

                {/* Eyebrow */}
                <div>
                  <Label className="text-xs mb-1 block">
                    Eyebrow (testo piccolo sopra il titolo)
                  </Label>
                  <Input
                    value={form.pdf_cover_eyebrow ?? ""}
                    onChange={(e) =>
                      update("pdf_cover_eyebrow", e.target.value || null)
                    }
                    placeholder="★ La tua proposta personalizzata"
                    className="h-8 text-xs"
                  />
                </div>

                {/* Titolo */}
                <div>
                  <Label className="text-xs mb-1 block">
                    Titolo hero (a capo per due righe)
                  </Label>
                  <Textarea
                    value={form.pdf_cover_hero ?? ""}
                    onChange={(e) =>
                      update("pdf_cover_hero", e.target.value || null)
                    }
                    placeholder="La tua casa, finalmente al caldo."
                    rows={2}
                    className="text-sm"
                  />
                </div>

                {/* Sottotitolo */}
                <div>
                  <Label className="text-xs mb-1 block">
                    Sottotitolo (opzionale)
                  </Label>
                  <Textarea
                    value={form.pdf_cover_subhero ?? ""}
                    onChange={(e) =>
                      update("pdf_cover_subhero", e.target.value || null)
                    }
                    placeholder="Lascia vuoto per usare la sintesi auto-generata del preventivo"
                    rows={2}
                    className="text-sm"
                  />
                </div>
              </div>
            </div>

            {/* ─── Tipografia & layout cover ────────────────────────────── */}
            <div className="mt-2 rounded-lg border bg-muted/20 p-3 space-y-3">
              <div className="text-[11px] font-semibold uppercase tracking-wide text-orange-600">
                Tipografia &amp; layout
              </div>
              <div className="grid grid-cols-12 gap-3">
                {/* Font size — Eyebrow */}
                <div className="col-span-12 md:col-span-4">
                  <Label className="text-[11px] flex items-center justify-between mb-1">
                    <span>Eyebrow</span>
                    <span className="font-mono text-muted-foreground">
                      {form.pdf_cover_eyebrow_size ?? 11}pt
                    </span>
                  </Label>
                  <input
                    type="range"
                    min={8}
                    max={20}
                    step={1}
                    value={form.pdf_cover_eyebrow_size ?? 11}
                    onChange={(e) => update("pdf_cover_eyebrow_size", Number(e.target.value))}
                    className="w-full accent-orange-500"
                  />
                </div>
                {/* Font size — Titolo */}
                <div className="col-span-12 md:col-span-4">
                  <Label className="text-[11px] flex items-center justify-between mb-1">
                    <span>Titolo hero</span>
                    <span className="font-mono text-muted-foreground">
                      {form.pdf_cover_title_size ?? 40}pt
                    </span>
                  </Label>
                  <input
                    type="range"
                    min={22}
                    max={64}
                    step={1}
                    value={form.pdf_cover_title_size ?? 40}
                    onChange={(e) => update("pdf_cover_title_size", Number(e.target.value))}
                    className="w-full accent-orange-500"
                  />
                </div>
                {/* Font size — Sottotitolo */}
                <div className="col-span-12 md:col-span-4">
                  <Label className="text-[11px] flex items-center justify-between mb-1">
                    <span>Sottotitolo</span>
                    <span className="font-mono text-muted-foreground">
                      {form.pdf_cover_subtitle_size ?? 13}pt
                    </span>
                  </Label>
                  <input
                    type="range"
                    min={9}
                    max={22}
                    step={1}
                    value={form.pdf_cover_subtitle_size ?? 13}
                    onChange={(e) => update("pdf_cover_subtitle_size", Number(e.target.value))}
                    className="w-full accent-orange-500"
                  />
                </div>

                {/* Allineamento testo */}
                <div className="col-span-12 md:col-span-4">
                  <Label className="text-[11px] mb-1 block">Allineamento</Label>
                  <div className="grid grid-cols-2 gap-1.5">
                    <Button
                      size="sm"
                      variant={(form.pdf_cover_text_align ?? "left") === "left" ? "default" : "outline"}
                      onClick={() => update("pdf_cover_text_align", "left")}
                      className={`h-7 text-[11px] ${(form.pdf_cover_text_align ?? "left") === "left" ? "bg-orange-500 hover:bg-orange-600" : ""}`}
                    >
                      Sinistra
                    </Button>
                    <Button
                      size="sm"
                      variant={form.pdf_cover_text_align === "center" ? "default" : "outline"}
                      onClick={() => update("pdf_cover_text_align", "center")}
                      className={`h-7 text-[11px] ${form.pdf_cover_text_align === "center" ? "bg-orange-500 hover:bg-orange-600" : ""}`}
                    >
                      Centro
                    </Button>
                  </div>
                </div>

                {/* Colore testo override */}
                <div className="col-span-12 md:col-span-4">
                  <Label className="text-[11px] mb-1 block">Colore testo</Label>
                  <div className="flex items-center gap-1.5">
                    <input
                      type="color"
                      value={form.pdf_cover_text_color || "#FFFFFF"}
                      onChange={(e) => update("pdf_cover_text_color", e.target.value)}
                      className="h-7 w-9 rounded border cursor-pointer"
                    />
                    <Input
                      value={form.pdf_cover_text_color ?? ""}
                      onChange={(e) => update("pdf_cover_text_color", e.target.value || null)}
                      placeholder="#FFFFFF"
                      className="h-7 text-[11px] font-mono flex-1"
                    />
                  </div>
                </div>

                {/* Toggle decorazione + card cliente */}
                <div className="col-span-12 md:col-span-4 space-y-1.5">
                  <Label className="text-[11px] mb-1 block">Elementi visibili</Label>
                  <label className="flex items-center gap-2 cursor-pointer text-[11px]">
                    <input
                      type="checkbox"
                      checked={form.pdf_cover_show_decoration !== false}
                      onChange={(e) => update("pdf_cover_show_decoration", e.target.checked)}
                      className="h-3.5 w-3.5 accent-orange-500"
                    />
                    Decorazione SVG (alto destra)
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer text-[11px]">
                    <input
                      type="checkbox"
                      checked={form.pdf_cover_show_client_card !== false}
                      onChange={(e) => update("pdf_cover_show_client_card", e.target.checked)}
                      className="h-3.5 w-3.5 accent-orange-500"
                    />
                    Card "Preparato per" (cliente)
                  </label>
                </div>

                {/* Reset tipografia */}
                <div className="col-span-12 flex justify-end">
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => {
                      update("pdf_cover_eyebrow_size", null);
                      update("pdf_cover_title_size", null);
                      update("pdf_cover_subtitle_size", null);
                      update("pdf_cover_text_color", null);
                      update("pdf_cover_text_align", null);
                      update("pdf_cover_show_decoration", null);
                      update("pdf_cover_show_client_card", null);
                    }}
                    className="h-7 text-[11px] text-muted-foreground"
                  >
                    Ripristina default tipografia
                  </Button>
                </div>
              </div>
            </div>
          </TabsContent>

          {/* ═══ CHI SIAMO ═══════════════════════════════════════════════════ */}
          <TabsContent value="chi-siamo" className="mt-4 space-y-2">
            <div className="flex items-center justify-between">
              <div className="text-xs font-semibold uppercase tracking-wide text-orange-600">
                Pagina "Chi siamo" (opzionale, dopo cover)
              </div>
              <label className="flex items-center gap-1.5 cursor-pointer text-xs">
                <input
                  type="checkbox"
                  checked={!!form.chi_siamo_attivo}
                  onChange={(e) => update("chi_siamo_attivo", e.target.checked)}
                  className="h-3.5 w-3.5"
                />
                Attiva
              </label>
            </div>
            {form.chi_siamo_attivo && (
              <div className="grid grid-cols-12 gap-3">
                {/* Foto azienda — upload diretto (no più URL incollato) */}
                <div className="col-span-12 md:col-span-4">
                  <Label className="text-xs mb-1 block">Foto azienda</Label>
                  <input
                    ref={chiSiamoInputRef}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(e) => e.target.files?.[0] && handleChiSiamoUpload(e.target.files[0])}
                  />
                  <div
                    className="min-h-[160px] max-h-[280px] rounded-md border-2 border-dashed border-slate-200 bg-muted/20 hover:border-orange-300 hover:bg-orange-50/30 cursor-pointer flex items-center justify-center overflow-hidden relative"
                    onClick={() => !uploadingChiSiamo && chiSiamoInputRef.current?.click()}
                  >
                    {form.chi_siamo_foto_url ? (
                      <img
                        src={form.chi_siamo_foto_url}
                        alt="Foto azienda"
                        className="w-full h-auto max-h-[280px] object-contain"
                      />
                    ) : (
                      <div className="text-center p-3">
                        <ImageIcon className="h-8 w-8 mx-auto text-muted-foreground/40 mb-1" />
                        <p className="text-[10px] text-muted-foreground">Clicca per caricare</p>
                        <p className="text-[9px] text-muted-foreground/70 mt-0.5">orizzontale, verticale o panoramica</p>
                      </div>
                    )}
                    {uploadingChiSiamo && (
                      <div className="absolute inset-0 bg-white/80 flex items-center justify-center">
                        <Loader2 className="h-5 w-5 animate-spin text-orange-600" />
                      </div>
                    )}
                  </div>
                  <div className="flex gap-1 mt-1">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => chiSiamoInputRef.current?.click()}
                      disabled={uploadingChiSiamo}
                      className="flex-1 h-7 text-[11px]"
                    >
                      <Upload className="h-3 w-3 mr-1" />
                      {form.chi_siamo_foto_url ? "Cambia" : "Carica"}
                    </Button>
                    {form.chi_siamo_foto_url && (
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => update("chi_siamo_foto_url", null)}
                        className="h-7 text-[11px] text-rose-600"
                      >
                        Rimuovi
                      </Button>
                    )}
                  </div>
                  <p className="text-[10px] text-muted-foreground mt-1">
                    PNG/JPG/WebP fino a 8 MB · qualsiasi proporzione (l'immagine viene
                    mostrata intera nel PDF, senza ritagli).
                  </p>
                </div>

                {/* Titolo + testo a destra */}
                <div className="col-span-12 md:col-span-8 space-y-2">
                  <div>
                    <Label className="text-xs">Titolo pagina</Label>
                    <Input
                      value={form.chi_siamo_titolo ?? ""}
                      onChange={(e) => update("chi_siamo_titolo", e.target.value || null)}
                      placeholder="Es. 15 anni di artigianato a Milano"
                      className="h-9 text-xs"
                    />
                  </div>
                  <div>
                    <Label className="text-xs">Testo descrizione azienda</Label>
                    <Textarea
                      value={form.chi_siamo_testo ?? ""}
                      onChange={(e) => update("chi_siamo_testo", e.target.value || null)}
                      rows={6}
                      placeholder={
                        "Es.\n\nDal 2010 produciamo serramenti su misura per il residenziale.\n\nLavoriamo solo con materiali italiani:\n- Profili PVC a 7 camere\n- Vetri triplo basso-emissivi\n- Pose certificate UNI 11673"
                      }
                      className="text-xs font-normal"
                    />
                    <p className="text-[10px] text-muted-foreground mt-0.5">
                      A capo doppio per paragrafi. Righe che iniziano con
                      "<code className="font-mono">- </code>" diventano bullet nel PDF.
                    </p>
                  </div>
                </div>
              </div>
            )}
          </TabsContent>

          {/* ═══ CONSULENTE ══════════════════════════════════════════════════ */}
          <TabsContent value="consulente" className="mt-4 space-y-2">
            <div className="text-xs font-semibold uppercase tracking-wide text-orange-600">
              Sezione "La tua consulenza"
            </div>
            <Label className="text-xs">Descrizione del consulente (mostrata sotto nome + ruolo)</Label>
            <Textarea
              value={form.consulente_descrizione_default ?? ""}
              onChange={(e) => update("consulente_descrizione_default", e.target.value || null)}
              rows={3}
              placeholder="Es. Ti accompagnerò personalmente dal primo sopralluogo fino al collaudo finale. Per qualunque domanda o necessità, sono il tuo punto di riferimento."
              className="text-xs"
            />
            <p className="text-[10px] text-muted-foreground">
              Frase generica per dare un tono personale. Nome e foto del consulente
              vengono presi automaticamente dal profilo dell'utente che fa il preventivo
              (Impostazioni → Mio profilo → Foto).
            </p>
          </TabsContent>

          {/* ═══ RECENSIONI ══════════════════════════════════════════════════ */}
          <TabsContent value="recensioni" className="mt-4 space-y-1">
            <div className="flex items-center justify-between">
              <div className="text-xs font-semibold uppercase tracking-wide text-orange-600">
                Recensioni nel PDF
              </div>
              <label className="flex items-center gap-1.5 cursor-pointer text-xs">
                <input
                  type="checkbox"
                  checked={form.recensioni_attivo !== false}
                  onChange={(e) => update("recensioni_attivo", e.target.checked)}
                  className="h-3.5 w-3.5"
                />
                Mostra recensioni
              </label>
            </div>
            <p className="text-[10px] text-muted-foreground">
              Le testimonianze definite sopra ("Recensioni clienti") vengono incluse
              nella pagina finale del PDF solo se questa opzione è attiva.
            </p>
          </TabsContent>

          {/* ═══ RENDER AI ═══════════════════════════════════════════════════ */}
          <TabsContent value="render" className="mt-4 space-y-2">
            <div className="text-xs font-semibold uppercase tracking-wide text-orange-600">
              Disclaimer Render AI
            </div>
            <Label className="text-xs">Testo legale sotto i render AI (lascia vuoto per il default)</Label>
            <Textarea
              value={form.render_disclaimer ?? ""}
              onChange={(e) => update("render_disclaimer", e.target.value || null)}
              rows={4}
              placeholder="Render generato con intelligenza artificiale a scopo esclusivamente dimostrativo e illustrativo..."
              className="text-xs font-normal"
            />
          </TabsContent>

          {/* ═══ CTA FINALE ══════════════════════════════════════════════════ */}
          <TabsContent value="cta" className="mt-4 space-y-2">
            <div className="text-xs font-semibold uppercase tracking-wide text-orange-600">
              Box CTA finale "Cosa fare adesso"
            </div>
            <div className="grid grid-cols-12 gap-3">
              <div className="col-span-12">
                <Label className="text-xs">Titolo del box</Label>
                <Input
                  value={form.pdf_cta_finale_titolo ?? ""}
                  onChange={(e) => update("pdf_cta_finale_titolo", e.target.value || null)}
                  placeholder="Cosa fare adesso (default)"
                  className="h-9 text-xs"
                />
              </div>
              <div className="col-span-12">
                <Label className="text-xs">Passi (uno per riga)</Label>
                <Textarea
                  value={(form.pdf_cta_finale_passi ?? []).join("\n")}
                  onChange={(e) => {
                    const lines = e.target.value.split("\n").map((l) => l.trim()).filter(Boolean);
                    update("pdf_cta_finale_passi", lines.length > 0 ? lines : null);
                  }}
                  rows={5}
                  placeholder={
                    "Conferma l'appuntamento di consulenza tecnica\nFirma digitale del preventivo via link sicuro\nVersa l'acconto secondo lo schema concordato\nDiamo il via alla produzione e cantiere"
                  }
                  className="text-xs"
                />
                <p className="text-[10px] text-muted-foreground mt-0.5">
                  Ogni riga è uno step numerato. Lascia vuoto per usare i 4 step default.
                </p>
              </div>
            </div>
          </TabsContent>

          {/* ═══ PERCORSO CLIENTE ═══════════════════════════════════════════ */}
          {(() => {
            const percorso = (form.percorso_cliente as SrPercorsoCliente | null) ?? SR_PERCORSO_DEFAULT;
            const updatePercorso = (next: SrPercorsoCliente) => update("percorso_cliente", next);
            const ICONE: Array<{ value: SrPercorsoFase["icona"]; label: string }> = [
              { value: "chiamata", label: "📞 Consulenza" },
              { value: "proposta", label: "📄 Proposta" },
              { value: "produzione", label: "🏭 Produzione" },
              { value: "montaggio", label: "🔧 Montaggio" },
              { value: "custom", label: "✦ Generica" },
            ];
            const totalStep = percorso.fasi.reduce((acc, f) => acc + f.step.length, 0);
            return (
              <TabsContent value="percorso" className="mt-4 space-y-4">
              {/* Toggle attivo + titolo + sottotitolo + counter */}
              <div className="flex items-center justify-between gap-2 pb-3 border-b">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={!!percorso.attivo}
                    onChange={(e) => updatePercorso({ ...percorso, attivo: e.target.checked })}
                    className="h-4 w-4"
                  />
                  <span className="text-sm font-medium">Mostra pagina nel PDF</span>
                </label>
                <span className="text-xs text-muted-foreground">
                  {percorso.fasi.length} {percorso.fasi.length === 1 ? "fase" : "fasi"} ·{" "}
                  {totalStep} {totalStep === 1 ? "passaggio" : "passaggi"}
                </span>
              </div>

              {percorso.attivo && (
                <>
                  <div className="grid grid-cols-12 gap-3">
                    <div className="col-span-12 md:col-span-5">
                      <Label className="text-xs">Titolo pagina</Label>
                      <Input
                        value={percorso.titolo}
                        onChange={(e) => updatePercorso({ ...percorso, titolo: e.target.value })}
                        className="h-9 text-sm"
                      />
                    </div>
                    <div className="col-span-12 md:col-span-7">
                      <Label className="text-xs">Sottotitolo</Label>
                      <Input
                        value={percorso.sottotitolo}
                        onChange={(e) => updatePercorso({ ...percorso, sottotitolo: e.target.value })}
                        className="h-9 text-xs"
                        placeholder="Frase breve sotto al titolo"
                      />
                    </div>
                  </div>

                  {/* Lista fasi */}
                  <div className="space-y-3">
                    {percorso.fasi.map((fase, fi) => (
                      <div key={fi} className="rounded-lg border bg-card p-3 space-y-2">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="h-7 w-7 rounded-full bg-orange-500 text-white flex items-center justify-center text-xs font-bold">
                            {fi + 1}
                          </span>
                          <Input
                            value={fase.nome}
                            onChange={(e) => {
                              const next = [...percorso.fasi];
                              next[fi] = { ...next[fi], nome: e.target.value };
                              updatePercorso({ ...percorso, fasi: next });
                            }}
                            className="h-8 text-sm font-semibold flex-1 min-w-[180px]"
                            placeholder="Nome fase"
                          />
                          <select
                            value={fase.icona}
                            onChange={(e) => {
                              const next = [...percorso.fasi];
                              next[fi] = { ...next[fi], icona: e.target.value as SrPercorsoFase["icona"] };
                              updatePercorso({ ...percorso, fasi: next });
                            }}
                            className="h-8 text-xs rounded-md border border-input bg-background px-2"
                          >
                            {ICONE.map((ic) => (
                              <option key={ic.value} value={ic.value}>{ic.label}</option>
                            ))}
                          </select>
                          <Button
                            size="icon"
                            variant="ghost"
                            onClick={() => {
                              const next = percorso.fasi.filter((_, i) => i !== fi);
                              updatePercorso({ ...percorso, fasi: next });
                            }}
                            disabled={percorso.fasi.length <= 1}
                            className="h-8 w-8 text-rose-600"
                            title="Elimina fase"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                        {/* Step della fase */}
                        <div className="space-y-1 pl-9">
                          {fase.step.map((step, si) => (
                            <div key={si} className="flex items-center gap-2">
                              <span className="text-[10px] font-mono text-muted-foreground w-6">
                                {String(si + 1).padStart(2, "0")}
                              </span>
                              <Input
                                value={step}
                                onChange={(e) => {
                                  const nextFasi = [...percorso.fasi];
                                  const nextStep = [...nextFasi[fi].step];
                                  nextStep[si] = e.target.value;
                                  nextFasi[fi] = { ...nextFasi[fi], step: nextStep };
                                  updatePercorso({ ...percorso, fasi: nextFasi });
                                }}
                                className="h-7 text-xs"
                                placeholder="Es. Chiamata conoscitiva"
                              />
                              <Button
                                size="icon"
                                variant="ghost"
                                onClick={() => {
                                  const nextFasi = [...percorso.fasi];
                                  nextFasi[fi] = {
                                    ...nextFasi[fi],
                                    step: nextFasi[fi].step.filter((_, i) => i !== si),
                                  };
                                  updatePercorso({ ...percorso, fasi: nextFasi });
                                }}
                                disabled={fase.step.length <= 1}
                                className="h-7 w-7 text-rose-600"
                                title="Elimina step"
                              >
                                <Trash2 className="h-3 w-3" />
                              </Button>
                            </div>
                          ))}
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => {
                              const nextFasi = [...percorso.fasi];
                              nextFasi[fi] = { ...nextFasi[fi], step: [...nextFasi[fi].step, ""] };
                              updatePercorso({ ...percorso, fasi: nextFasi });
                            }}
                            className="h-7 text-[11px] text-muted-foreground hover:text-foreground"
                          >
                            <Plus className="h-3 w-3 mr-1" /> Aggiungi step
                          </Button>
                        </div>
                      </div>
                    ))}

                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        updatePercorso({
                          ...percorso,
                          fasi: [
                            ...percorso.fasi,
                            { nome: "Nuova fase", icona: "custom", step: [""] },
                          ],
                        });
                      }}
                      className="w-full gap-1 border-dashed border-2"
                    >
                      <Plus className="h-4 w-4" /> Aggiungi fase
                    </Button>

                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => updatePercorso(SR_PERCORSO_DEFAULT)}
                      className="text-xs text-muted-foreground"
                    >
                      Ripristina template di default
                    </Button>
                  </div>
                </>
              )}
              </TabsContent>
            );
          })()}

          {/* ═══ CONVERSIONE (CRO playbook) ═════════════════════════════════ */}
          <TabsContent value="conversione" className="mt-4">
            <Suspense fallback={<div className="h-20 flex items-center justify-center text-xs text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin mr-2" />Caricamento…</div>}>
              <SerramentiConversionEditor form={form} update={update} />
            </Suspense>
          </TabsContent>

          {/* ═══ ORDINE PAGINE ═══════════════════════════════════════════════ */}
          <TabsContent value="ordine-pagine" className="mt-4">
            <div className="space-y-2">
              <div className="text-xs font-semibold uppercase tracking-wide text-orange-600">
                Ordine e visibilità delle pagine
              </div>
              <p className="text-[11px] text-muted-foreground">
                Definisci la sequenza delle pagine del PDF preventivo cliente
                e quali mostrare/nascondere. Modifiche visibili in Anteprima PDF.
              </p>
            </div>
            <div className="mt-3">
              <Suspense fallback={<div className="h-20 flex items-center justify-center text-xs text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin mr-2" />Caricamento…</div>}>
                <SerramentiPagesOrderEditor
                  value={form.pdf_pages_order ?? null}
                  onChange={(next) => update("pdf_pages_order", next)}
                />
              </Suspense>
            </div>
          </TabsContent>
        </Tabs>
      </SrCard>

      {/* SEZIONE: Default tecnici */}
      <SectionHeader
        title="5. Default tecnici"
        description="Valori di partenza usati su ogni nuovo preventivo: validità offerta, anticipo, IVA."
        number={5}
      />

      <SrCard title="Default economia" icon={<Clock className="h-4 w-4" />}>
        <div className="grid grid-cols-12 gap-3">
          <div className="col-span-12 md:col-span-4">
            <Label className="text-xs">Validità offerta (giorni)</Label>
            <Input
              type="number"
              value={form.valido_giorni_default ?? 15}
              onChange={(e) => update("valido_giorni_default", Number(e.target.value) || 15)}
              className="h-9 text-xs"
            />
            <p className="text-[10px] text-muted-foreground mt-0.5">
              Numero giorni di validità del preventivo dopo l'invio al cliente.
            </p>
          </div>
          <div className="col-span-12 md:col-span-4">
            <Label className="text-xs">Anticipo % default</Label>
            <Input
              type="number" min={0} max={100} step={5}
              value={form.anticipo_pct_default ?? 40}
              onChange={(e) => update("anticipo_pct_default", Number(e.target.value) || 40)}
              className="h-9 text-xs"
            />
            <p className="text-[10px] text-muted-foreground mt-0.5">
              Percentuale di acconto pre-impostata in ogni nuovo preventivo.
            </p>
          </div>
          <div className="col-span-12 md:col-span-4">
            <Label className="text-xs">IVA % default</Label>
            <Input
              type="number"
              value={form.iva_percentuale_default ?? 22}
              onChange={(e) => update("iva_percentuale_default", Number(e.target.value) || 22)}
              className="h-9 text-xs"
            />
            <p className="text-[10px] text-muted-foreground mt-0.5">
              Aliquota IVA standard (22% in Italia). Personalizzabile per ristrutturazioni 10%.
            </p>
          </div>
          {/* Campi giorni produzione/posa/collaudo rimossi: dopo aver tolto
              il cronoprogramma dal PDF e dal wizard (Fase 1), questi default
              non hanno più destinazione user-facing. Restano nel DB ma il
              consulente non li vede né li modifica. */}
        </div>
      </SrCard>

      {/* Sticky bottom: Anteprima PDF + Salva. Due bottoni a sinistra/destra
          così l'utente può sempre vedere come verrà il PDF prima di salvare. */}
      {/* Sticky footer: SEMPRE visibile (anche in modalità embedded usata
          dal SettingsQuoteTemplates). Prima era nascosto da `!embedded` →
          l'utente che arrivava da /azienda/impostazioni non vedeva mai
          il bottone "Anteprima PDF". */}
      <div className="sticky bottom-4 flex justify-between gap-3 z-10">
        <Button
          onClick={() => setPreviewOpen(true)}
          variant="outline"
          className="bg-white shadow-lg gap-1.5 border-orange-300 hover:bg-orange-50"
          size="lg"
        >
          <Eye className="h-4 w-4" />
          Anteprima PDF
        </Button>
        <Button
          onClick={handleSave}
          disabled={!dirty || upsertMut.isPending}
          className="bg-orange-600 hover:bg-orange-500 gap-1 shadow-lg"
          size="lg"
        >
          {upsertMut.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          Salva impostazioni
        </Button>
      </div>

      {/* Dialog anteprima PDF — generato on-the-fly con dati demo + template corrente.
          PERF: render condizionale `{previewOpen && ...}` per non montare mai il
          dialog quando l'utente non lo sta usando. Senza questa guard, il dialog
          era sempre montato e i suoi useEffect (con JSON.stringify(template))
          si re-eseguivano ad ogni keystroke nel form padre. */}
      {previewOpen && (
        <Suspense fallback={null}>
          <SerramentiTemplatePreviewDialog
            open={previewOpen}
            onOpenChange={setPreviewOpen}
            template={form}
            companyName={form.ragione_sociale}
            companyLogoUrl={form.logo_url}
            companyIndirizzo={form.indirizzo_completo}
          />
        </Suspense>
      )}

      <AlertDialog open={delTestIdx !== null} onOpenChange={(o) => !o && setDelTestIdx(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Rimuovere la recensione?</AlertDialogTitle>
            <AlertDialogDescription>
              Non comparirà più nei nuovi preventivi. Le stime già generate non saranno modificate.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annulla</AlertDialogCancel>
            <AlertDialogAction
              className="bg-rose-600 hover:bg-rose-700"
              onClick={() => delTestIdx !== null && removeTestimonianza(delTestIdx)}
            >
              Rimuovi
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

// ─── SectionHeader ───────────────────────────────────────────────────────────
// Helper visivo che divide l'editor in macro-sezioni numerate. Aiuta l'utente
// a orientarsi su una pagina che altrimenti sembrerebbe un muro di SrCard.

function SectionHeader({
  title, description, number,
}: {
  title: string;
  description: string;
  number: number;
}) {
  return (
    <div className="flex items-start gap-3 pt-3 pb-1 border-t-2 border-orange-100 first:border-t-0 first:pt-0">
      <div className="h-9 w-9 rounded-full bg-gradient-to-br from-orange-500 to-amber-400 text-white flex items-center justify-center font-bold text-sm shrink-0 shadow-sm">
        {number}
      </div>
      <div className="min-w-0 flex-1">
        <h2 className="text-base font-bold text-slate-900 leading-tight">{title}</h2>
        <p className="text-xs text-muted-foreground mt-0.5">{description}</p>
      </div>
    </div>
  );
}
