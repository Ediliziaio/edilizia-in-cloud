/**
 * FotovoltaicoTemplateEditor — editor del template PDF del modulo Fotovoltaico.
 *
 * Usato dentro la tab "Template Moduli Vendita" della pagina
 * Impostazioni → Libreria Template Preventivi.
 *
 * Configura `fv_template_pdf` per la company corrente:
 *  - Branding (logo, colori, font)
 *  - Presentazione impresa (HTML/testo libero)
 *  - Recensioni clienti + cantieri galleria + certificazioni
 *  - Contatti (telefono, whatsapp, email, sito)
 *  - Economia default (validità, recesso, acconto %)
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
  Save, Plus, Trash2, Loader2, Sparkles, Quote, BadgeCheck, Building2,
  Phone, Upload, Image as ImageIcon,
} from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import {
  useTemplatePdf as useFvTemplatePdf,
  useUpsertTemplatePdf as useFvUpsertTemplatePdf,
} from "@/lib/fotovoltaico/queries";

// ─── Types locali (no dipendenza forte da fv types globali) ─────────────────

interface FvRecensione {
  quote: string;
  autore: string;
  citta?: string;
  intervento?: string;
}
interface FvCertificazione {
  nome: string;
  ente?: string;
}
interface FvCantiereGalleria {
  citta?: string;
  descrizione: string;
  foto_url?: string;
}

interface FvTemplate {
  logo_url?: string | null;
  colore_primario?: string | null;
  colore_accento?: string | null;
  font_titoli?: string | null;
  font_corpo?: string | null;
  presentazione_impresa_html?: string | null;
  foto_team_url?: string | null;
  recensioni?: FvRecensione[] | null;
  cantieri_galleria?: FvCantiereGalleria[] | null;
  certificazioni?: FvCertificazione[] | null;
  testimonial_video_url?: string | null;
  contatto_telefono?: string | null;
  contatto_whatsapp?: string | null;
  contatto_email?: string | null;
  url_sito?: string | null;
  scadenza_validita_preventivo_giorni?: number | null;
  recesso_giorni?: number | null;
  acconto_pct?: number | null;
}

interface Props {
  embedded?: boolean;
}

// ─── Card wrapper (stile coerente con SrCard) ───────────────────────────────

function FvSettingsCard({
  title, description, icon, children, className,
}: { title: string; description?: string; icon?: React.ReactNode; children: React.ReactNode; className?: string }) {
  return (
    <Card className={className}>
      {(title || icon) && (
        <CardHeader className="p-4 pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            {icon && <span className="text-sky-700">{icon}</span>}
            {title}
          </CardTitle>
          {description && (
            <p className="text-[11px] text-muted-foreground mt-1">{description}</p>
          )}
        </CardHeader>
      )}
      <CardContent className="p-4 pt-2">
        {children}
      </CardContent>
    </Card>
  );
}

export function FotovoltaicoTemplateEditor({ embedded = false }: Props) {
  const { data: template, isLoading } = useFvTemplatePdf();
  const upsertMut = useFvUpsertTemplatePdf();

  const [form, setForm] = useState<FvTemplate>({});
  const [dirty, setDirty] = useState(false);
  const [delRecIdx, setDelRecIdx] = useState<number | null>(null);
  const [delCertIdx, setDelCertIdx] = useState<number | null>(null);
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const logoInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (template) {
      setForm(template as FvTemplate);
      setDirty(false);
    } else if (!isLoading) {
      setForm({
        colore_primario: "#1E3A5F",  // Navy brand AEDIX
        colore_accento: "#F97316",   // Arancione
        recensioni: [],
        cantieri_galleria: [],
        certificazioni: [],
        scadenza_validita_preventivo_giorni: 30,
        recesso_giorni: 14,
        acconto_pct: 30,
      });
    }
  }, [template, isLoading]);

  const update = <K extends keyof FvTemplate>(key: K, value: FvTemplate[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }));
    setDirty(true);
  };

  const handleSave = () => {
    // Cast a Record perché upsert FV accetta Record<string, unknown>
    upsertMut.mutate(form as unknown as Record<string, unknown>, {
      onSuccess: () => {
        setDirty(false);
        toast.success("Template Fotovoltaico salvato");
      },
      onError: (e) => toast.error("Salvataggio fallito", { description: String(e) }),
    });
  };

  // ─── Logo upload ──────────────────────────────────────────────────────────
  const handleLogoUpload = async (file: File) => {
    if (!file.type.startsWith("image/")) {
      toast.error("Carica un file immagine");
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
        .from("fv-progetti")
        .upload(storagePath, file, { contentType: file.type, upsert: false });
      if (uploadErr) throw new Error(`Upload fallito: ${uploadErr.message}`);

      const { data: signed } = await supabase.storage
        .from("fv-progetti")
        .createSignedUrl(storagePath, 60 * 60 * 24 * 365);
      const logoUrl = signed?.signedUrl ?? "";

      update("logo_url", logoUrl);
      toast.success("Logo caricato. Salva per applicare.");
    } catch (e) {
      console.error("[fv-template] logo upload", e);
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

  const recensioni = form.recensioni ?? [];
  const certificazioni = form.certificazioni ?? [];

  // ─── Recensioni ──────────────────────────────────────────────────────────
  const addRecensione = () => {
    update("recensioni", [...recensioni, { quote: "", autore: "", citta: "", intervento: "" }]);
  };
  const updateRecensione = (idx: number, field: keyof FvRecensione, value: string) => {
    const next = [...recensioni];
    next[idx] = { ...next[idx], [field]: value };
    update("recensioni", next);
  };
  const removeRecensione = (idx: number) => {
    update("recensioni", recensioni.filter((_, i) => i !== idx));
    setDelRecIdx(null);
  };

  // ─── Certificazioni ──────────────────────────────────────────────────────
  const addCertificazione = () => {
    update("certificazioni", [...certificazioni, { nome: "", ente: "" }]);
  };
  const updateCertificazione = (idx: number, field: keyof FvCertificazione, value: string) => {
    const next = [...certificazioni];
    next[idx] = { ...next[idx], [field]: value };
    update("certificazioni", next);
  };
  const removeCertificazione = (idx: number) => {
    update("certificazioni", certificazioni.filter((_, i) => i !== idx));
    setDelCertIdx(null);
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
          className="bg-sky-700 hover:bg-sky-800 gap-1"
        >
          {upsertMut.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          Salva
        </Button>
      </div>

      {/* Branding */}
      <FvSettingsCard
        title="Anagrafica e branding azienda"
        description="Logo, colori e contatti che compaiono nel PDF Fotovoltaico (16 pagine)."
        icon={<Building2 className="h-4 w-4" />}
      >
        <div className="grid grid-cols-12 gap-3">
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
              className="aspect-square rounded-md border-2 border-dashed border-slate-200 bg-muted/20 hover:border-sky-300 hover:bg-sky-50/30 cursor-pointer flex items-center justify-center overflow-hidden relative"
              onClick={() => !uploadingLogo && logoInputRef.current?.click()}
            >
              {form.logo_url ? (
                <img src={form.logo_url} alt="Logo azienda" className="w-full h-full object-contain p-2" />
              ) : (
                <div className="text-center p-3">
                  <ImageIcon className="h-8 w-8 mx-auto text-muted-foreground/40 mb-1" />
                  <p className="text-[10px] text-muted-foreground">Clicca per caricare</p>
                </div>
              )}
              {uploadingLogo && (
                <div className="absolute inset-0 bg-white/80 flex items-center justify-center">
                  <Loader2 className="h-5 w-5 animate-spin text-sky-700" />
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
            <div className="col-span-12 md:col-span-6">
              <Label className="text-xs">Colore primario</Label>
              <div className="flex gap-2">
                <Input
                  type="color"
                  value={form.colore_primario ?? "#1E3A5F"}
                  onChange={(e) => update("colore_primario", e.target.value)}
                  className="h-9 w-14 p-1 cursor-pointer"
                />
                <Input
                  value={form.colore_primario ?? "#1E3A5F"}
                  onChange={(e) => update("colore_primario", e.target.value)}
                  className="h-9 flex-1 font-mono"
                />
              </div>
            </div>
            <div className="col-span-12 md:col-span-6">
              <Label className="text-xs">Colore accento</Label>
              <div className="flex gap-2">
                <Input
                  type="color"
                  value={form.colore_accento ?? "#F97316"}
                  onChange={(e) => update("colore_accento", e.target.value)}
                  className="h-9 w-14 p-1 cursor-pointer"
                />
                <Input
                  value={form.colore_accento ?? "#F97316"}
                  onChange={(e) => update("colore_accento", e.target.value)}
                  className="h-9 flex-1 font-mono"
                />
              </div>
            </div>
            <div className="col-span-12 md:col-span-6">
              <Label className="text-xs">Telefono</Label>
              <Input
                value={form.contatto_telefono ?? ""}
                onChange={(e) => update("contatto_telefono", e.target.value)}
                placeholder="+39 02 1234 5678"
                className="h-9"
              />
            </div>
            <div className="col-span-12 md:col-span-6">
              <Label className="text-xs">WhatsApp</Label>
              <Input
                value={form.contatto_whatsapp ?? ""}
                onChange={(e) => update("contatto_whatsapp", e.target.value)}
                placeholder="+39 333 1234567"
                className="h-9"
              />
            </div>
            <div className="col-span-12 md:col-span-6">
              <Label className="text-xs">Email</Label>
              <Input
                type="email"
                value={form.contatto_email ?? ""}
                onChange={(e) => update("contatto_email", e.target.value)}
                placeholder="info@azienda.it"
                className="h-9"
              />
            </div>
            <div className="col-span-12 md:col-span-6">
              <Label className="text-xs">Sito web</Label>
              <Input
                value={form.url_sito ?? ""}
                onChange={(e) => update("url_sito", e.target.value)}
                placeholder="https://azienda.it"
                className="h-9"
              />
            </div>
          </div>
        </div>
      </FvSettingsCard>

      {/* Presentazione impresa */}
      <FvSettingsCard
        title="Presentazione dell'impresa"
        description="Testo che compare nella sezione 'Chi siamo' del PDF. Puoi usare HTML semplice."
        icon={<Sparkles className="h-4 w-4" />}
      >
        <Textarea
          value={form.presentazione_impresa_html ?? ""}
          onChange={(e) => update("presentazione_impresa_html", e.target.value)}
          placeholder="<p>Siamo un'azienda specializzata in impianti fotovoltaici chiavi in mano dal 2015...</p>"
          rows={6}
        />
        <p className="text-[10px] text-muted-foreground mt-1">
          Tag supportati: <code>&lt;p&gt;</code>, <code>&lt;br&gt;</code>, <code>&lt;strong&gt;</code>, <code>&lt;em&gt;</code>, <code>&lt;ul&gt;</code>, <code>&lt;li&gt;</code>
        </p>
      </FvSettingsCard>

      {/* Recensioni */}
      <FvSettingsCard
        title="Recensioni e testimonianze clienti"
        description="Compaiono nella sezione 'Cosa dicono i nostri clienti' del PDF Fotovoltaico."
        icon={<Quote className="h-4 w-4" />}
      >
        <div className="space-y-3">
          {recensioni.length === 0 && (
            <div className="rounded-md border border-sky-200 bg-sky-50 p-3 text-xs text-sky-900">
              Nessuna recensione caricata. Aggiungile per mostrare prova sociale ai nuovi clienti.
            </div>
          )}
          {recensioni.map((r, idx) => (
            <Card key={idx} className="bg-sky-50/30 border-sky-200">
              <CardHeader className="p-3 pb-2 flex flex-row items-center justify-between">
                <CardTitle className="text-xs uppercase tracking-wide text-sky-700">
                  Recensione {idx + 1}
                </CardTitle>
                <Button size="sm" variant="ghost" onClick={() => setDelRecIdx(idx)} className="h-7 px-2 text-xs text-rose-600">
                  <Trash2 className="h-3.5 w-3.5 mr-1" /> Rimuovi
                </Button>
              </CardHeader>
              <CardContent className="p-3 pt-0 grid grid-cols-12 gap-2">
                <div className="col-span-12">
                  <Label className="text-xs">Citazione</Label>
                  <Textarea
                    value={r.quote}
                    onChange={(e) => updateRecensione(idx, "quote", e.target.value)}
                    placeholder='"Il nostro impianto produce esattamente come avevano stimato..."'
                    rows={3}
                  />
                </div>
                <div className="col-span-12 md:col-span-4">
                  <Label className="text-xs">Autore</Label>
                  <Input
                    value={r.autore}
                    onChange={(e) => updateRecensione(idx, "autore", e.target.value)}
                    placeholder="Mario R."
                    className="h-9 text-xs"
                  />
                </div>
                <div className="col-span-6 md:col-span-3">
                  <Label className="text-xs">Città</Label>
                  <Input
                    value={r.citta ?? ""}
                    onChange={(e) => updateRecensione(idx, "citta", e.target.value)}
                    placeholder="Milano"
                    className="h-9 text-xs"
                  />
                </div>
                <div className="col-span-6 md:col-span-5">
                  <Label className="text-xs">Tipo impianto</Label>
                  <Input
                    value={r.intervento ?? ""}
                    onChange={(e) => updateRecensione(idx, "intervento", e.target.value)}
                    placeholder="6 kWp + accumulo 10 kWh"
                    className="h-9 text-xs"
                  />
                </div>
              </CardContent>
            </Card>
          ))}
          <Button
            onClick={addRecensione}
            variant="outline"
            className="w-full border-dashed border-2 border-sky-300 hover:bg-sky-50 gap-1"
          >
            <Plus className="h-4 w-4" /> Aggiungi recensione
          </Button>
        </div>
      </FvSettingsCard>

      {/* Certificazioni */}
      <FvSettingsCard
        title="Certificazioni e qualifiche"
        description="Compaiono nella sezione 'Affidabilità' del PDF. Es. Certificazione installatore PV, UNI EN ISO 9001, ecc."
        icon={<BadgeCheck className="h-4 w-4" />}
      >
        <div className="space-y-2">
          {certificazioni.map((c, idx) => (
            <div key={idx} className="grid grid-cols-12 gap-2 items-end border-l-4 border-sky-200 pl-3 py-1">
              <div className="col-span-12 md:col-span-6">
                <Label className="text-xs">Nome certificazione</Label>
                <Input
                  value={c.nome}
                  onChange={(e) => updateCertificazione(idx, "nome", e.target.value)}
                  placeholder="Es. Installatore PV qualificato"
                  className="h-9 text-xs"
                />
              </div>
              <div className="col-span-10 md:col-span-5">
                <Label className="text-xs">Ente certificatore</Label>
                <Input
                  value={c.ente ?? ""}
                  onChange={(e) => updateCertificazione(idx, "ente", e.target.value)}
                  placeholder="GSE / ENEA / Bureau Veritas"
                  className="h-9 text-xs"
                />
              </div>
              <div className="col-span-2 md:col-span-1">
                <Button size="icon" variant="ghost" onClick={() => setDelCertIdx(idx)} className="h-9 w-9">
                  <Trash2 className="h-3.5 w-3.5 text-rose-600" />
                </Button>
              </div>
            </div>
          ))}
          <Button
            onClick={addCertificazione}
            variant="outline"
            className="w-full border-dashed border-2 border-sky-300 hover:bg-sky-50 gap-1"
          >
            <Plus className="h-4 w-4" /> Aggiungi certificazione
          </Button>
        </div>
      </FvSettingsCard>

      {/* Economia */}
      <FvSettingsCard
        title="Default economia preventivo"
        icon={<Phone className="h-4 w-4" />}
      >
        <div className="grid grid-cols-12 gap-3">
          <div className="col-span-6 md:col-span-4">
            <Label className="text-xs">Validità preventivo (giorni)</Label>
            <Input
              type="number"
              value={form.scadenza_validita_preventivo_giorni ?? 30}
              onChange={(e) => update("scadenza_validita_preventivo_giorni", Number(e.target.value) || 30)}
              className="h-9 text-xs"
            />
          </div>
          <div className="col-span-6 md:col-span-4">
            <Label className="text-xs">Recesso (giorni)</Label>
            <Input
              type="number"
              value={form.recesso_giorni ?? 14}
              onChange={(e) => update("recesso_giorni", Number(e.target.value) || 14)}
              className="h-9 text-xs"
            />
          </div>
          <div className="col-span-6 md:col-span-4">
            <Label className="text-xs">Acconto %</Label>
            <Input
              type="number"
              min={0} max={100} step={5}
              value={form.acconto_pct ?? 30}
              onChange={(e) => update("acconto_pct", Number(e.target.value) || 30)}
              className="h-9 text-xs"
            />
          </div>
        </div>
      </FvSettingsCard>

      {/* Save sticky bottom */}
      {!embedded && (
        <div className="sticky bottom-4 flex justify-end">
          <Button
            onClick={handleSave}
            disabled={!dirty || upsertMut.isPending}
            className="bg-sky-700 hover:bg-sky-800 gap-1 shadow-lg"
            size="lg"
          >
            {upsertMut.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            Salva impostazioni
          </Button>
        </div>
      )}

      {/* Dialog conferma rimozione recensione */}
      <AlertDialog open={delRecIdx !== null} onOpenChange={(o) => !o && setDelRecIdx(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Rimuovere la recensione?</AlertDialogTitle>
            <AlertDialogDescription>
              Non comparirà più nei nuovi preventivi. I PDF già generati non verranno modificati.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annulla</AlertDialogCancel>
            <AlertDialogAction
              className="bg-rose-600 hover:bg-rose-700"
              onClick={() => delRecIdx !== null && removeRecensione(delRecIdx)}
            >
              Rimuovi
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Dialog conferma rimozione certificazione */}
      <AlertDialog open={delCertIdx !== null} onOpenChange={(o) => !o && setDelCertIdx(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Rimuovere la certificazione?</AlertDialogTitle>
            <AlertDialogDescription>Non comparirà più nei nuovi preventivi.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annulla</AlertDialogCancel>
            <AlertDialogAction
              className="bg-rose-600 hover:bg-rose-700"
              onClick={() => delCertIdx !== null && removeCertificazione(delCertIdx)}
            >
              Rimuovi
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
