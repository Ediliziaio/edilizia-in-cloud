/**
 * SettingsSerramenti — Configurazione default del modulo Stima Serramenti.
 *
 * Pagina dove l'azienda imposta:
 *  - Branding PDF (colore primario, logo già su company)
 *  - Esigenze tipiche default (3 pain bullets pre-compilati)
 *  - Soluzione default
 *  - "Perché noi" (USP bullets)
 *  - Cosa è incluso (bullets)
 *  - Prossimi passi (4 step)
 *  - **Testimonianze clienti** (recensioni mostrate nel PDF pagina 2)
 *  - Cronoprogramma default (giorni produzione/posa/collaudo)
 *  - Economia default (anticipo %, IVA, validità giorni)
 */
import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
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
  RectangleVertical, Save, Plus, Trash2, Loader2, MessageCircle,
  Sparkles, ListChecks, Clock, ArrowLeft, Quote,
} from "lucide-react";
import { toast } from "sonner";
import { useTemplatePdf, useUpsertTemplatePdf } from "@/lib/serramenti/queries";
import { SrCard, SrCallout } from "@/lib/serramenti/wizardUI";
import type { SrTemplatePdfRow, SrEsigenza, SrSoluzioneItem, SrTestimonianza } from "@/types/serramenti";

export default function SettingsSerramenti() {
  const navigate = useNavigate();
  const { data: template, isLoading } = useTemplatePdf();
  const upsertMut = useUpsertTemplatePdf();

  const [form, setForm] = useState<Partial<SrTemplatePdfRow>>({});
  const [dirty, setDirty] = useState(false);
  const [delTestIdx, setDelTestIdx] = useState<number | null>(null);

  useEffect(() => {
    if (template) {
      setForm(template);
      setDirty(false);
    } else if (!isLoading) {
      // Nessun template — pre-popola con defaults vuoti
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

  if (isLoading) {
    return (
      <div className="container mx-auto p-4 max-w-4xl space-y-3">
        <Skeleton className="h-16" />
        <Skeleton className="h-64" />
        <Skeleton className="h-96" />
      </div>
    );
  }

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

  // ─── Liste testuali (array di string) ─────────────────────────────────────

  const renderListEditor = (
    label: string,
    key: "perche_noi_default" | "incluso_default" | "prossimi_passi_default",
    placeholder: string,
    maxItems: number = 6,
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
            <Button
              size="icon" variant="ghost"
              onClick={() => removeItem(idx)}
              className="h-9 w-9 shrink-0"
            >
              <Trash2 className="h-3.5 w-3.5 text-rose-600" />
            </Button>
          </div>
        ))}
        {items.length < maxItems && (
          <Button
            onClick={addItem}
            variant="outline"
            size="sm"
            className="w-full border-dashed gap-1"
          >
            <Plus className="h-3.5 w-3.5" /> Aggiungi {label.toLowerCase()}
          </Button>
        )}
      </div>
    );
  };

  // ─── Esigenze / Soluzione (oggetti con titolo + descrizione) ──────────────

  const renderBulletObjectEditor = (
    label: string,
    key: "esigenze_default" | "soluzione_default",
    maxItems: number = 3,
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
              <Button
                size="sm" variant="ghost"
                onClick={() => removeItem(idx)}
                className="h-7 px-2 text-xs text-rose-600"
              >
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
        {items.length < maxItems && (
          <Button onClick={addItem} variant="outline" size="sm" className="w-full border-dashed gap-1">
            <Plus className="h-3.5 w-3.5" /> Aggiungi {label.toLowerCase()}
          </Button>
        )}
      </div>
    );
  };

  return (
    <div className="container mx-auto p-3 md:p-6 max-w-4xl space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => navigate("/azienda/serramenti")}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <h1 className="text-xl font-bold flex items-center gap-2">
              <RectangleVertical className="h-5 w-5 text-emerald-700" />
              Impostazioni Stima Serramenti
            </h1>
            <p className="text-xs text-muted-foreground">
              Default che compaiono in tutti i preventivi. Modificabili per singola stima.
            </p>
          </div>
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

      {/* Branding */}
      <SrCard title="Branding PDF" icon={<Sparkles className="h-4 w-4" />}>
        <div className="grid grid-cols-12 gap-3">
          <div className="col-span-6 md:col-span-3">
            <Label className="text-xs">Colore primario</Label>
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
          <div className="col-span-12 md:col-span-9">
            <Label className="text-xs">Ragione sociale (override anagrafica azienda)</Label>
            <Input
              value={form.ragione_sociale ?? ""}
              onChange={(e) => update("ragione_sociale", e.target.value)}
              placeholder="Default: nome azienda registrato"
              className="h-9"
            />
          </div>
        </div>
      </SrCard>

      {/* Esigenze */}
      <SrCard
        title="Esigenze tipiche del cliente"
        description="Compaiono nella pagina 1 del PDF come 'Le tue esigenze'. Il commerciale può modificarle per singola stima."
        icon={<MessageCircle className="h-4 w-4" />}
      >
        {renderBulletObjectEditor("esigenza", "esigenze_default", 3)}
      </SrCard>

      {/* Soluzione */}
      <SrCard
        title="Soluzione tipica"
        description="Cosa proponi per risolvere le esigenze. Pagina 1 del PDF, sezione 'La soluzione per te'."
        icon={<Sparkles className="h-4 w-4" />}
      >
        {renderBulletObjectEditor("soluzione", "soluzione_default", 3)}
      </SrCard>

      {/* Perché noi */}
      <SrCard
        title="Perché scegliere noi (USP)"
        description="5-6 bullet di vendita che compaiono in fondo a pagina 1."
        icon={<ListChecks className="h-4 w-4" />}
      >
        {renderListEditor("USP", "perche_noi_default", "Es. Posa eseguita a regola d'arte con sigillature certificate")}
      </SrCard>

      {/* Cosa è incluso */}
      <SrCard
        title="Cosa è incluso nell'investimento"
        description="Bullet che compaiono in pagina 2 del PDF, sotto la forbice prezzo."
        icon={<ListChecks className="h-4 w-4" />}
      >
        {renderListEditor("voce", "incluso_default", "Es. Rilievo dimensionale a casa tua senza costi aggiuntivi")}
      </SrCard>

      {/* Testimonianze */}
      <SrCard
        title="Recensioni e testimonianze"
        description="Compaiono nella pagina 2 del PDF, sezione 'Cosa dicono i nostri clienti'. Pesa le recensioni positive che vuoi mostrare ai nuovi clienti."
        icon={<Quote className="h-4 w-4" />}
        variant="highlight"
      >
        <div className="space-y-3">
          {testimonianze.length === 0 && (
            <SrCallout variant="info">
              Nessuna recensione caricata. Aggiungi le testimonianze dei tuoi clienti per metterle nei preventivi.
            </SrCallout>
          )}
          {testimonianze.map((t, idx) => (
            <Card key={idx} className="bg-emerald-50/30 border-emerald-200">
              <CardHeader className="p-3 pb-2 flex flex-row items-center justify-between">
                <CardTitle className="text-xs uppercase tracking-wide text-emerald-700">
                  Recensione {idx + 1}
                </CardTitle>
                <Button
                  size="sm" variant="ghost"
                  onClick={() => setDelTestIdx(idx)}
                  className="h-7 px-2 text-xs text-rose-600"
                >
                  <Trash2 className="h-3.5 w-3.5 mr-1" /> Rimuovi
                </Button>
              </CardHeader>
              <CardContent className="p-3 pt-0 grid grid-cols-12 gap-2">
                <div className="col-span-12">
                  <Label className="text-xs">Citazione</Label>
                  <Textarea
                    value={t.quote ?? ""}
                    onChange={(e) => updateTestimonianza(idx, "quote", e.target.value)}
                    placeholder='"Avevamo chiesto un preventivo a quattro aziende: loro ce l\'hanno fatto interamente in casa…"'
                    rows={3}
                  />
                </div>
                <div className="col-span-12 md:col-span-4">
                  <Label className="text-xs">Autore (nome + cognome iniziale)</Label>
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
                    placeholder="Bifamiliare nuova costruzione, 22 serramenti alluminio-legno"
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
        title="Prossimi passi (chiusura PDF)"
        description="I 4 step che il cliente vedrà in fondo a pagina 3. Personalizzabili per ogni stima."
        icon={<ListChecks className="h-4 w-4" />}
      >
        {renderListEditor("step", "prossimi_passi_default", "Es. Ci vediamo a casa tua per la consulenza tecnica", 5)}
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
