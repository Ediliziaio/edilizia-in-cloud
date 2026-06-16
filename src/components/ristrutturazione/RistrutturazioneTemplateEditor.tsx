/**
 * RistrutturazioneTemplateEditor — editor del template PDF del verticale
 * Ristrutturazione (Task 20).
 *
 * Modellato su `SerramentiTemplateEditor` ma alla scala di `rst_template_pdf`
 * (un record/azienda, upsert via `useUpsertRstTemplatePdf`). Configura:
 *  - Branding: logo (upload) + 4 colori (primario/secondario/accent/testo)
 *  - Copertina: titolo, sottotitolo, immagine hero (upload)
 *  - Chi siamo: testo + foto (upload) + toggle visibilità
 *  - Liste editabili: esigenze / soluzione / USP ({titolo, descrizione})
 *  - Testimonianze ({autore, ruolo, testo})
 *  - Cronoprogramma fasi ({fase, durata, descrizione}) + toggle visibilità
 *  - Condizioni: pagamenti, validità, footer
 *  - Toggle "mostra margini nel PDF"
 *
 * Stato locale del form seedato UNA volta dal server tramite `key` montaggio
 * (il parent monta con key sul template id quando disponibile) + un effetto di
 * idratazione controllato con un ref "hydrated" per non sovrascrivere edit utente
 * a ogni refetch. Nessun `Date.now()`/`Math.random()` in render: gli id riga
 * delle liste usano un contatore stabile via `useRef`.
 *
 * Upload immagini: bucket PUBLIC `company-photo-library` (pattern StepMedia),
 * path `{company_id}/ristrutturazione/template/{uuid}.{ext}` → URL pubblico
 * stabile salvato nel template (ideale per il PDF, niente signed URL scaduti).
 */
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import {
  Save, Loader2, Upload, Image as ImageIcon, Plus, Trash2, GripVertical,
  Palette, FileText, Sparkles, ListChecks, Quote, Clock, Building2,
  Eye, EyeOff, BadgeEuro,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import {
  useRstTemplatePdf,
  useUpsertRstTemplatePdf,
  useEffectiveCompanyId,
  type RstTemplatePatch,
} from "@/hooks/useRistrutturazioneProgetto";
import type {
  RstTemplatePdf, RstListItem, RstTestimonianza, RstCronoFase,
} from "@/types/ristrutturazione";

const BUCKET = "company-photo-library";
const MAX_FILE_BYTES = 8 * 1024 * 1024; // 8 MB
const ALLOWED_MIMES = new Set(["image/png", "image/jpeg", "image/webp"]);

// Forma del form locale: stesso shape del patch persistito.
type FormState = Required<Pick<RstTemplatePdf,
  | "logo_url" | "color_primary" | "color_secondary" | "color_accent" | "color_text"
  | "chi_siamo" | "chi_siamo_foto_url" | "esigenze" | "soluzione" | "usp"
  | "testimonianze" | "cronoprogramma" | "cover_title" | "cover_subtitle"
  | "cover_image_url" | "payment_terms_text" | "validity_text" | "footer_text"
  | "show_chi_siamo" | "show_cronoprogramma" | "show_margine"
>>;

function templateToForm(t: RstTemplatePdf): FormState {
  return {
    logo_url: t.logo_url ?? null,
    color_primary: t.color_primary ?? "#1E3A5F",
    color_secondary: t.color_secondary ?? "#F97316",
    color_accent: t.color_accent ?? "#16A34A",
    color_text: t.color_text ?? "#212529",
    chi_siamo: t.chi_siamo ?? "",
    chi_siamo_foto_url: t.chi_siamo_foto_url ?? null,
    esigenze: t.esigenze ?? [],
    soluzione: t.soluzione ?? [],
    usp: t.usp ?? [],
    testimonianze: t.testimonianze ?? [],
    cronoprogramma: t.cronoprogramma ?? [],
    cover_title: t.cover_title ?? "",
    cover_subtitle: t.cover_subtitle ?? "",
    cover_image_url: t.cover_image_url ?? null,
    payment_terms_text: t.payment_terms_text ?? "",
    validity_text: t.validity_text ?? "",
    footer_text: t.footer_text ?? "",
    show_chi_siamo: t.show_chi_siamo ?? true,
    show_cronoprogramma: t.show_cronoprogramma ?? true,
    show_margine: t.show_margine ?? false,
  };
}

interface Props {
  /** Render dentro la tab Impostazioni (no padding/header extra di pagina). */
  embedded?: boolean;
}

export function RistrutturazioneTemplateEditor({ embedded = false }: Props) {
  const companyId = useEffectiveCompanyId();
  const { data: template, isLoading } = useRstTemplatePdf();
  const upsert = useUpsertRstTemplatePdf();

  const [form, setForm] = useState<FormState | null>(null);
  const [dirty, setDirty] = useState(false);
  // Idratazione una-tantum: appena arriva il template lo riversiamo nel form,
  // ma NON sovrascriviamo se l'utente ha già iniziato a editare (dirty).
  const hydratedRef = useRef(false);
  useEffect(() => {
    if (!template) return;
    if (hydratedRef.current) return;
    setForm(templateToForm(template));
    hydratedRef.current = true;
  }, [template]);

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) => {
    setForm((prev) => (prev ? { ...prev, [key]: value } : prev));
    setDirty(true);
  };

  const handleSave = async () => {
    if (!form) return;
    const patch: RstTemplatePatch = { ...form };
    try {
      await upsert.mutateAsync(patch);
      setDirty(false);
      toast.success("Template salvato", {
        description: "Verrà applicato ai nuovi preventivi ristrutturazione.",
      });
    } catch (e) {
      toast.error("Salvataggio non riuscito", {
        description: e instanceof Error ? e.message : "Errore sconosciuto",
      });
    }
  };

  if (isLoading || !form) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-48 w-full" />
        <Skeleton className="h-48 w-full" />
      </div>
    );
  }

  return (
    <div className={cn("space-y-4", embedded ? "" : "mx-auto max-w-4xl p-4")}>
      {/* Branding */}
      <SectionCard icon={Palette} title="Branding" description="Logo e colori usati nel PDF.">
        <div className="grid gap-4 sm:grid-cols-2">
          <ImageUploadField
            label="Logo azienda"
            hint="PNG con sfondo trasparente consigliato."
            value={form.logo_url}
            companyId={companyId}
            onChange={(url) => set("logo_url", url)}
            aspect="aspect-[3/1]"
          />
          <div className="grid grid-cols-2 gap-3">
            <ColorField label="Primario" value={form.color_primary} onChange={(v) => set("color_primary", v)} />
            <ColorField label="Secondario" value={form.color_secondary} onChange={(v) => set("color_secondary", v)} />
            <ColorField label="Accent" value={form.color_accent} onChange={(v) => set("color_accent", v)} />
            <ColorField label="Testo" value={form.color_text} onChange={(v) => set("color_text", v)} />
          </div>
        </div>
      </SectionCard>

      {/* Copertina */}
      <SectionCard icon={FileText} title="Copertina" description="Titolo, sottotitolo e immagine della prima pagina.">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label className="text-xs">Titolo</Label>
              <Input
                value={form.cover_title ?? ""}
                onChange={(e) => set("cover_title", e.target.value)}
                placeholder="Preventivo di ristrutturazione"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Sottotitolo</Label>
              <Input
                value={form.cover_subtitle ?? ""}
                onChange={(e) => set("cover_subtitle", e.target.value)}
                placeholder="La tua casa, rinnovata chiavi in mano"
              />
            </div>
          </div>
          <ImageUploadField
            label="Immagine copertina"
            hint="Foto orizzontale di un cantiere/render."
            value={form.cover_image_url}
            companyId={companyId}
            onChange={(url) => set("cover_image_url", url)}
            aspect="aspect-[16/9]"
          />
        </div>
      </SectionCard>

      {/* Chi siamo */}
      <SectionCard
        icon={Building2}
        title="Chi siamo"
        description="Presentazione dell'impresa nel PDF."
        toggle={{ value: form.show_chi_siamo, onChange: (v) => set("show_chi_siamo", v), label: "Mostra nel PDF" }}
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label className="text-xs">Testo presentazione</Label>
            <Textarea
              value={form.chi_siamo ?? ""}
              onChange={(e) => set("chi_siamo", e.target.value)}
              placeholder="Da oltre 20 anni realizziamo ristrutturazioni complete..."
              rows={6}
            />
          </div>
          <ImageUploadField
            label="Foto azienda / team"
            value={form.chi_siamo_foto_url}
            companyId={companyId}
            onChange={(url) => set("chi_siamo_foto_url", url)}
            aspect="aspect-[4/3]"
          />
        </div>
      </SectionCard>

      {/* Esigenze / Soluzione / USP */}
      <SectionCard icon={ListChecks} title="Esigenze tipiche" description="I problemi del cliente che il vostro intervento risolve.">
        <ListItemsEditor
          items={form.esigenze}
          onChange={(items) => set("esigenze", items)}
          addLabel="Aggiungi esigenza"
          titlePlaceholder="Es. Impianti vecchi e non a norma"
          descPlaceholder="Dettaglio (opzionale)"
        />
      </SectionCard>

      <SectionCard icon={Sparkles} title="La nostra soluzione" description="Come affrontate il lavoro.">
        <ListItemsEditor
          items={form.soluzione}
          onChange={(items) => set("soluzione", items)}
          addLabel="Aggiungi voce soluzione"
          titlePlaceholder="Es. Rifacimento impianti certificato"
          descPlaceholder="Dettaglio (opzionale)"
        />
      </SectionCard>

      <SectionCard icon={ListChecks} title="Perché sceglierci (USP)" description="I punti di forza dell'impresa.">
        <ListItemsEditor
          items={form.usp}
          onChange={(items) => set("usp", items)}
          addLabel="Aggiungi punto di forza"
          titlePlaceholder="Es. Cantiere pulito e puntuale"
          descPlaceholder="Dettaglio (opzionale)"
        />
      </SectionCard>

      {/* Testimonianze */}
      <SectionCard icon={Quote} title="Testimonianze" description="Recensioni dei clienti mostrate nel PDF.">
        <TestimonianzeEditor
          items={form.testimonianze}
          onChange={(items) => set("testimonianze", items)}
        />
      </SectionCard>

      {/* Cronoprogramma */}
      <SectionCard
        icon={Clock}
        title="Cronoprogramma"
        description="Le fasi tipiche del cantiere con durata indicativa."
        toggle={{ value: form.show_cronoprogramma, onChange: (v) => set("show_cronoprogramma", v), label: "Mostra nel PDF" }}
      >
        <CronoEditor
          items={form.cronoprogramma}
          onChange={(items) => set("cronoprogramma", items)}
        />
      </SectionCard>

      {/* Condizioni */}
      <SectionCard icon={FileText} title="Condizioni e validità" description="Testi legali e di pagamento in coda al PDF.">
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label className="text-xs">Modalità di pagamento</Label>
            <Textarea
              value={form.payment_terms_text ?? ""}
              onChange={(e) => set("payment_terms_text", e.target.value)}
              placeholder="30% all'accettazione, 40% a metà lavori, 30% a fine lavori..."
              rows={3}
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Validità dell'offerta</Label>
            <Input
              value={form.validity_text ?? ""}
              onChange={(e) => set("validity_text", e.target.value)}
              placeholder="Preventivo valido 30 giorni dalla data di emissione."
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Nota a piè di pagina</Label>
            <Input
              value={form.footer_text ?? ""}
              onChange={(e) => set("footer_text", e.target.value)}
              placeholder="Testo aggiuntivo nel footer (opzionale)"
            />
          </div>
        </div>
      </SectionCard>

      {/* Opzioni PDF */}
      <SectionCard icon={BadgeEuro} title="Opzioni PDF" description="Impostazioni di visibilità del documento.">
        <label className="flex items-center justify-between gap-3 rounded-lg border p-3">
          <div>
            <p className="text-sm font-medium">Mostra i margini nel PDF</p>
            <p className="text-[11px] text-muted-foreground">
              Visibile solo a te: stampa la marginalità per voce e capitolo. Tienilo
              SPENTO per i PDF da consegnare al cliente.
            </p>
          </div>
          <Switch checked={form.show_margine} onCheckedChange={(v) => set("show_margine", v)} />
        </label>
      </SectionCard>

      {/* Barra salvataggio sticky */}
      <div className="sticky bottom-0 z-10 -mx-1 flex items-center justify-between gap-3 rounded-xl border bg-background/95 px-3 py-2.5 shadow-sm backdrop-blur">
        <span className={cn("text-[11px]", dirty ? "text-amber-600" : "text-muted-foreground")}>
          {dirty ? "Modifiche non salvate" : "Tutto salvato"}
        </span>
        <Button
          onClick={() => void handleSave()}
          disabled={!dirty || upsert.isPending}
          className="gap-1.5 bg-orange-500 hover:bg-orange-600"
        >
          {upsert.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          Salva template
        </Button>
      </div>
    </div>
  );
}

// ─── Section card ─────────────────────────────────────────────────────────────
interface SectionCardProps {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  description?: string;
  toggle?: { value: boolean; onChange: (v: boolean) => void; label: string };
  children: React.ReactNode;
}

function SectionCard({ icon: Icon, title, description, toggle, children }: SectionCardProps) {
  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-2.5">
            <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-orange-50 text-orange-600">
              <Icon className="h-4 w-4" />
            </div>
            <div>
              <CardTitle className="text-sm">{title}</CardTitle>
              {description && <p className="mt-0.5 text-[11px] text-muted-foreground">{description}</p>}
            </div>
          </div>
          {toggle && (
            <label className="flex shrink-0 items-center gap-1.5 text-[11px] text-muted-foreground">
              {toggle.value ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />}
              <span className="hidden sm:inline">{toggle.label}</span>
              <Switch checked={toggle.value} onCheckedChange={toggle.onChange} />
            </label>
          )}
        </div>
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}

// ─── Color field ──────────────────────────────────────────────────────────────
function ColorField({ label, value, onChange }: { label: string; value: string | null; onChange: (v: string) => void }) {
  const safe = value && /^#[0-9a-fA-F]{6}$/.test(value) ? value : "#000000";
  return (
    <div className="space-y-1.5">
      <Label className="text-xs">{label}</Label>
      <div className="flex items-center gap-2">
        <input
          type="color"
          value={safe}
          onChange={(e) => onChange(e.target.value.toUpperCase())}
          className="h-9 w-10 shrink-0 cursor-pointer rounded border bg-background p-0.5"
          aria-label={`Colore ${label}`}
        />
        <Input
          value={value ?? ""}
          onChange={(e) => onChange(e.target.value)}
          placeholder="#1E3A5F"
          className="h-9 font-mono text-xs uppercase"
        />
      </div>
    </div>
  );
}

// ─── Image upload field ───────────────────────────────────────────────────────
interface ImageUploadFieldProps {
  label: string;
  hint?: string;
  value: string | null;
  companyId: string | null;
  onChange: (url: string | null) => void;
  aspect?: string;
}

function ImageUploadField({ label, hint, value, companyId, onChange, aspect = "aspect-[4/3]" }: ImageUploadFieldProps) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [uploading, setUploading] = useState(false);

  const handleFile = async (file: File | null) => {
    if (!file) return;
    if (!companyId) {
      toast.error("Azienda non disponibile");
      return;
    }
    if (!ALLOWED_MIMES.has(file.type)) {
      toast.error(`"${file.name}" non supportato`, { description: "Usa PNG, JPG o WEBP." });
      return;
    }
    if (file.size > MAX_FILE_BYTES) {
      toast.error(`"${file.name}" troppo grande`, { description: "Massimo 8 MB." });
      return;
    }
    setUploading(true);
    try {
      const ext = file.name.includes(".") ? file.name.split(".").pop()!.toLowerCase() : "bin";
      // folder[1] DEVE essere company_id (policy storage company-scoped).
      const path = `${companyId}/ristrutturazione/template/${crypto.randomUUID()}.${ext}`;
      const { error: upErr } = await supabase.storage
        .from(BUCKET)
        .upload(path, file, { contentType: file.type, upsert: false });
      if (upErr) {
        toast.error("Upload fallito", { description: upErr.message });
        return;
      }
      const { data: pub } = supabase.storage.from(BUCKET).getPublicUrl(path);
      onChange(pub.publicUrl);
      toast.success("Immagine caricata");
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  return (
    <div className="space-y-1.5">
      <Label className="text-xs">{label}</Label>
      <div className={cn("relative overflow-hidden rounded-lg border bg-muted/40", aspect)}>
        {value ? (
          <img src={value} alt={label} className="h-full w-full object-contain" />
        ) : (
          <div className="flex h-full w-full flex-col items-center justify-center gap-1 text-muted-foreground">
            <ImageIcon className="h-7 w-7" />
            <span className="text-[11px]">Nessuna immagine</span>
          </div>
        )}
        {uploading && (
          <div className="absolute inset-0 flex items-center justify-center bg-background/60">
            <Loader2 className="h-5 w-5 animate-spin text-orange-600" />
          </div>
        )}
      </div>
      <input
        ref={inputRef}
        type="file"
        accept="image/png,image/jpeg,image/webp"
        className="hidden"
        onChange={(e) => void handleFile(e.target.files?.[0] ?? null)}
      />
      <div className="flex items-center gap-2">
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="h-8 gap-1.5"
          disabled={uploading || !companyId}
          onClick={() => inputRef.current?.click()}
        >
          {uploading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />}
          {value ? "Sostituisci" : "Carica"}
        </Button>
        {value && (
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="h-8 gap-1.5 text-rose-500 hover:bg-rose-50 hover:text-rose-600"
            onClick={() => onChange(null)}
          >
            <Trash2 className="h-3.5 w-3.5" /> Rimuovi
          </Button>
        )}
      </div>
      {hint && <p className="text-[10px] text-muted-foreground">{hint}</p>}
    </div>
  );
}

// ─── List items editor ({titolo, descrizione}) ───────────────────────────────
interface ListItemsEditorProps {
  items: RstListItem[];
  onChange: (items: RstListItem[]) => void;
  addLabel: string;
  titlePlaceholder: string;
  descPlaceholder: string;
}

function ListItemsEditor({ items, onChange, addLabel, titlePlaceholder, descPlaceholder }: ListItemsEditorProps) {
  const update = (idx: number, patch: Partial<RstListItem>) => {
    onChange(items.map((it, i) => (i === idx ? { ...it, ...patch } : it)));
  };
  const remove = (idx: number) => onChange(items.filter((_, i) => i !== idx));
  const move = (idx: number, dir: -1 | 1) => {
    const j = idx + dir;
    if (j < 0 || j >= items.length) return;
    const next = [...items];
    [next[idx], next[j]] = [next[j], next[idx]];
    onChange(next);
  };
  return (
    <div className="space-y-2">
      {items.length === 0 && (
        <p className="rounded-lg border border-dashed py-4 text-center text-[11px] text-muted-foreground">
          Nessuna voce. Aggiungine almeno una per arricchire il PDF.
        </p>
      )}
      {items.map((it, idx) => (
        <div key={idx} className="flex items-start gap-2 rounded-lg border p-2">
          <div className="mt-1 flex flex-col">
            <button type="button" onClick={() => move(idx, -1)} disabled={idx === 0} className="text-muted-foreground hover:text-foreground disabled:opacity-30">
              <GripVertical className="h-3.5 w-3.5" />
            </button>
          </div>
          <div className="flex-1 space-y-1.5">
            <Input
              value={it.titolo}
              onChange={(e) => update(idx, { titolo: e.target.value })}
              placeholder={titlePlaceholder}
              className="h-8 text-sm font-medium"
            />
            <Input
              value={it.descrizione ?? ""}
              onChange={(e) => update(idx, { descrizione: e.target.value })}
              placeholder={descPlaceholder}
              className="h-8 text-xs"
            />
          </div>
          <Button type="button" size="icon" variant="ghost" className="h-7 w-7 text-rose-500 hover:bg-rose-50 hover:text-rose-600" onClick={() => remove(idx)}>
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </div>
      ))}
      <Button type="button" size="sm" variant="outline" className="gap-1.5" onClick={() => onChange([...items, { titolo: "", descrizione: "" }])}>
        <Plus className="h-3.5 w-3.5" /> {addLabel}
      </Button>
    </div>
  );
}

// ─── Testimonianze editor ─────────────────────────────────────────────────────
function TestimonianzeEditor({ items, onChange }: { items: RstTestimonianza[]; onChange: (items: RstTestimonianza[]) => void }) {
  const update = (idx: number, patch: Partial<RstTestimonianza>) => {
    onChange(items.map((it, i) => (i === idx ? { ...it, ...patch } : it)));
  };
  const remove = (idx: number) => onChange(items.filter((_, i) => i !== idx));
  return (
    <div className="space-y-2">
      {items.length === 0 && (
        <p className="rounded-lg border border-dashed py-4 text-center text-[11px] text-muted-foreground">
          Nessuna testimonianza.
        </p>
      )}
      {items.map((t, idx) => (
        <div key={idx} className="space-y-2 rounded-lg border p-2.5">
          <Textarea
            value={t.testo}
            onChange={(e) => update(idx, { testo: e.target.value })}
            placeholder="«Lavoro impeccabile, tempi rispettati...»"
            rows={2}
            className="text-sm"
          />
          <div className="flex items-center gap-2">
            <Input
              value={t.autore}
              onChange={(e) => update(idx, { autore: e.target.value })}
              placeholder="Nome cliente"
              className="h-8 text-xs"
            />
            <Input
              value={t.ruolo ?? ""}
              onChange={(e) => update(idx, { ruolo: e.target.value })}
              placeholder="Città / tipo lavoro"
              className="h-8 text-xs"
            />
            <Button type="button" size="icon" variant="ghost" className="h-7 w-7 shrink-0 text-rose-500 hover:bg-rose-50 hover:text-rose-600" onClick={() => remove(idx)}>
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
      ))}
      <Button type="button" size="sm" variant="outline" className="gap-1.5" onClick={() => onChange([...items, { autore: "", ruolo: "", testo: "" }])}>
        <Plus className="h-3.5 w-3.5" /> Aggiungi testimonianza
      </Button>
    </div>
  );
}

// ─── Cronoprogramma editor ────────────────────────────────────────────────────
function CronoEditor({ items, onChange }: { items: RstCronoFase[]; onChange: (items: RstCronoFase[]) => void }) {
  const update = (idx: number, patch: Partial<RstCronoFase>) => {
    onChange(items.map((it, i) => (i === idx ? { ...it, ...patch } : it)));
  };
  const remove = (idx: number) => onChange(items.filter((_, i) => i !== idx));
  const move = (idx: number, dir: -1 | 1) => {
    const j = idx + dir;
    if (j < 0 || j >= items.length) return;
    const next = [...items];
    [next[idx], next[j]] = [next[j], next[idx]];
    onChange(next);
  };
  return (
    <div className="space-y-2">
      {items.length === 0 && (
        <p className="rounded-lg border border-dashed py-4 text-center text-[11px] text-muted-foreground">
          Nessuna fase. Aggiungi le tappe del cantiere (es. Demolizioni → Impianti → Finiture).
        </p>
      )}
      {items.map((f, idx) => (
        <div key={idx} className="flex items-start gap-2 rounded-lg border p-2">
          <div className="mt-1 flex flex-col">
            <button type="button" onClick={() => move(idx, -1)} disabled={idx === 0} className="text-muted-foreground hover:text-foreground disabled:opacity-30">
              <GripVertical className="h-3.5 w-3.5" />
            </button>
          </div>
          <div className="flex-1 space-y-1.5">
            <div className="flex gap-2">
              <Input
                value={f.fase}
                onChange={(e) => update(idx, { fase: e.target.value })}
                placeholder="Fase (es. Demolizioni)"
                className="h-8 flex-1 text-sm font-medium"
              />
              <Input
                value={f.durata ?? ""}
                onChange={(e) => update(idx, { durata: e.target.value })}
                placeholder="Durata (es. 1 settimana)"
                className="h-8 w-40 text-xs"
              />
            </div>
            <Input
              value={f.descrizione ?? ""}
              onChange={(e) => update(idx, { descrizione: e.target.value })}
              placeholder="Dettaglio (opzionale)"
              className="h-8 text-xs"
            />
          </div>
          <Button type="button" size="icon" variant="ghost" className="h-7 w-7 text-rose-500 hover:bg-rose-50 hover:text-rose-600" onClick={() => remove(idx)}>
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </div>
      ))}
      <Button type="button" size="sm" variant="outline" className="gap-1.5" onClick={() => onChange([...items, { fase: "", durata: "", descrizione: "" }])}>
        <Plus className="h-3.5 w-3.5" /> Aggiungi fase
      </Button>
    </div>
  );
}

export default RistrutturazioneTemplateEditor;
