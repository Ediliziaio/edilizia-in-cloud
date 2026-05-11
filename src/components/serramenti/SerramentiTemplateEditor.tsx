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
import { useState, useEffect, useRef } from "react";
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
  Save, Plus, Trash2, Loader2, MessageCircle,
  Sparkles, ListChecks, Clock, Quote, Upload, Image as ImageIcon,
  Building2, Wand2,
} from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useTemplatePdf, useUpsertTemplatePdf } from "@/lib/serramenti/queries";
import { SrCard, SrCallout } from "@/lib/serramenti/wizardUI";
import { MacroPagineDedicateManager } from "@/components/listino/MacroPagineDedicateManager";
import { FileText } from "lucide-react";
import type { SrTemplatePdfRow, SrEsigenza, SrSoluzioneItem, SrTestimonianza } from "@/types/serramenti";
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

  const update = <K extends keyof SrTemplatePdfRow>(key: K, value: SrTemplatePdfRow[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }));
    setDirty(true);
  };

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
          <Button size="sm" variant="outline" className="gap-1 border-emerald-300 text-emerald-700 hover:bg-emerald-50">
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
            <span className="h-7 w-7 mt-1 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center text-xs font-bold shrink-0">
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
          <div key={idx} className="border-l-4 border-emerald-200 pl-3 py-1">
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
      {/* Top save bar */}
      <div className="flex items-center justify-between gap-3 sticky top-0 z-10 bg-background/95 backdrop-blur py-2 -my-2">
        <div>
          {dirty && (
            <span className="text-xs text-amber-700">● Modifiche non salvate</span>
          )}
        </div>
        <Button
          onClick={handleSave}
          disabled={!dirty || upsertMut.isPending}
          className="bg-emerald-700 hover:bg-emerald-800 gap-1"
        >
          {upsertMut.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          Salva
        </Button>
      </div>

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
              className="aspect-square rounded-md border-2 border-dashed border-slate-200 bg-muted/20 hover:border-emerald-300 hover:bg-emerald-50/30 cursor-pointer flex items-center justify-center overflow-hidden relative"
              onClick={() => !uploadingLogo && logoInputRef.current?.click()}
            >
              {form.logo_url ? (
                // eslint-disable-next-line jsx-a11y/img-redundant-alt
                <img src={form.logo_url} alt="Logo azienda" className="w-full h-full object-contain p-2" />
              ) : (
                <div className="text-center p-3">
                  <ImageIcon className="h-8 w-8 mx-auto text-muted-foreground/40 mb-1" />
                  <p className="text-[10px] text-muted-foreground">Clicca per caricare</p>
                </div>
              )}
              {uploadingLogo && (
                <div className="absolute inset-0 bg-white/80 flex items-center justify-center">
                  <Loader2 className="h-5 w-5 animate-spin text-emerald-700" />
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
              <Button size="sm" variant="outline" className="gap-1 border-emerald-300 text-emerald-700 hover:bg-emerald-50">
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
            <Card key={idx} className="bg-emerald-50/30 border-emerald-200">
              <CardHeader className="p-3 pb-2 flex flex-row items-center justify-between">
                <CardTitle className="text-xs uppercase tracking-wide text-emerald-700">
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
            className="w-full border-dashed border-2 border-emerald-300 hover:bg-emerald-50 gap-1"
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

      {/* Pagine dedicate macrocategoria — sincronizzate con il listino */}
      <SrCard
        title="Pagine dedicate macrocategoria"
        description="Quando un articolo di una macro attivata è nel preventivo, il PDF aggiunge una pagina dedicata (foto + descrizione estesa). Le modifiche qui sono sincronizzate con il listino."
        icon={<FileText className="h-4 w-4" />}
      >
        <MacroPagineDedicateManager vertical="serramentista" />
      </SrCard>

      {/* Crono + Economia */}
      <SrCard title="Default cronoprogramma + economia" icon={<Clock className="h-4 w-4" />}>
        <div className="grid grid-cols-12 gap-3">
          <div className="col-span-6 md:col-span-3">
            <Label className="text-xs">Giorni produzione</Label>
            <Input
              type="number"
              value={form.crono_giorni_produzione_default ?? 30}
              onChange={(e) => update("crono_giorni_produzione_default", Number(e.target.value) || 30)}
              className="h-9 text-xs"
            />
          </div>
          <div className="col-span-6 md:col-span-3">
            <Label className="text-xs">Giorni posa / pezzo</Label>
            <Input
              type="number" step={0.1}
              value={form.crono_giorni_posa_per_pezzo_default ?? 0.8}
              onChange={(e) => update("crono_giorni_posa_per_pezzo_default", Number(e.target.value) || 0.8)}
              className="h-9 text-xs"
            />
          </div>
          <div className="col-span-6 md:col-span-3">
            <Label className="text-xs">Giorni collaudo</Label>
            <Input
              type="number"
              value={form.crono_giorni_collaudo_default ?? 1}
              onChange={(e) => update("crono_giorni_collaudo_default", Number(e.target.value) || 1)}
              className="h-9 text-xs"
            />
          </div>
          <div className="col-span-6 md:col-span-3">
            <Label className="text-xs">Validità (giorni)</Label>
            <Input
              type="number"
              value={form.valido_giorni_default ?? 15}
              onChange={(e) => update("valido_giorni_default", Number(e.target.value) || 15)}
              className="h-9 text-xs"
            />
          </div>
          <div className="col-span-6 md:col-span-3">
            <Label className="text-xs">Anticipo % default</Label>
            <Input
              type="number" min={0} max={100} step={5}
              value={form.anticipo_pct_default ?? 40}
              onChange={(e) => update("anticipo_pct_default", Number(e.target.value) || 40)}
              className="h-9 text-xs"
            />
          </div>
          <div className="col-span-6 md:col-span-3">
            <Label className="text-xs">IVA % default</Label>
            <Input
              type="number"
              value={form.iva_percentuale_default ?? 22}
              onChange={(e) => update("iva_percentuale_default", Number(e.target.value) || 22)}
              className="h-9 text-xs"
            />
          </div>
        </div>
      </SrCard>

      {/* Save sticky bottom */}
      {!embedded && (
        <div className="sticky bottom-4 flex justify-end">
          <Button
            onClick={handleSave}
            disabled={!dirty || upsertMut.isPending}
            className="bg-emerald-700 hover:bg-emerald-800 gap-1 shadow-lg"
            size="lg"
          >
            {upsertMut.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            Salva impostazioni
          </Button>
        </div>
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
