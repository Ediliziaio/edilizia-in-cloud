/**
 * Preventivatore Verticalizzato Serramentisti — FASE 4.3
 *
 * Editor multi-step per una famiglia articoli (article_families). 5 step:
 *  1. Dati base (nome, categoria, descrizione, modalità prezzo, UM, IVA)
 *  2. Prezzo base + griglia L×H (solo se modalità=griglia)
 *  3. Assi di variazione (delegato a FamilyAxesEditor)
 *  4. Posa default (tariffa + quantità)
 *  5. Riepilogo + salva
 *
 * Modalità:
 *  - new: crea al click "Salva dati base" nello Step 1 e poi resta in edit
 *  - edit: carica via useFamily(id)
 *
 * Preview prezzo live (FamilyPricePreview) affiancata dallo Step 3 in poi.
 */

import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import {
  ArrowLeft,
  Check,
  Loader2,
  Save,
  CopyPlus,
  FolderTree,
} from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useEffectiveCompanyId } from "@/hooks/useEffectiveCompanyId";
import { useFamily } from "@/hooks/useFamilies";
import { useFamilyMutations } from "@/hooks/useFamilyMutations";
import { useAuth } from "@/contexts/AuthContext";
import { useListinoMacrocategorie } from "@/hooks/useListinoMacrocategorie";
import { useListinoCategorie } from "@/hooks/useListinoCategorie";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { FamilyAxesEditor } from "./FamilyAxesEditor";
import { FamilyGridEditor } from "./FamilyGridEditor";
import { FamilyPricePreview } from "./FamilyPricePreview";
import { MacroCategorieManager } from "./MacroCategorieManager";
import type {
  ModalitaPrezzoBase,
  PrezzoBaseMode,
  MarkupTipo,
} from "@/types/articleFamily";
import { applyMarkup, resolvePrezzoVendita } from "@/lib/priceMarkup";
import { formatCurrency } from "@/lib/formatters";

interface Tariffa {
  id: string;
  nome: string;
  tipo: string;
}

const MODALITA_CARDS: Array<{
  value: ModalitaPrezzoBase;
  label: string;
  descrizione: string;
}> = [
  { value: "griglia", label: "Griglia L×H", descrizione: "Matrice dimensioni → prezzo. Default serramenti." },
  { value: "mq", label: "Al mq", descrizione: "Prezzo moltiplicato per la superficie." },
  { value: "pz", label: "A pezzo", descrizione: "Prezzo fisso per ogni pezzo." },
  { value: "misura_libera", label: "Misura libera", descrizione: "Prezzo manuale al preventivo." },
];

const UM_OPTIONS = ["pz", "mq", "ml", "mc", "kg", "a_corpo"];
// IVA 0% serve per acquisti intracomunitari / esteri con inversione contabile
// (reverse charge). Le altre aliquote sono quelle italiane standard.
const IVA_OPTIONS: Array<{ value: number; label: string; hint?: string }> = [
  { value: 0, label: "0%", hint: "Estero / inversione contabile" },
  { value: 4, label: "4%", hint: "Beni di prima necessità" },
  { value: 5, label: "5%", hint: "Aliquota ridotta" },
  { value: 10, label: "10%", hint: "Aliquota ridotta" },
  { value: 22, label: "22%", hint: "Ordinaria" },
];

const PREZZO_MODE_CARDS: Array<{
  value: PrezzoBaseMode;
  label: string;
  descrizione: string;
}> = [
  {
    value: "vendita",
    label: "Prezzo di vendita",
    descrizione:
      "Carico direttamente il prezzo finale al cliente. Nessun margine calcolato.",
  },
  {
    value: "acquisto_markup",
    label: "Prezzo di acquisto + markup",
    descrizione:
      "Carico il prezzo del fornitore. Il prezzo di vendita viene calcolato automaticamente.",
  },
];

export function FamilyEditor() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { effectiveCompany } = useAuth();
  const companyId = useEffectiveCompanyId();
  const { createFamily, updateFamily, duplicateFamily } = useFamilyMutations();

  const isNew = !id || id === "nuova";
  const { family, isLoading: loadingFamily } = useFamily(isNew ? null : id);

  const [activeStep, setActiveStep] = useState("1");
  const [showCategorieManager, setShowCategorieManager] = useState(false);

  // ── Form state Step 1 ────────────────────────────────────────────────────
  const [nome, setNome] = useState("");
  const [macrocategoriaId, setMacrocategoriaId] = useState<string | "none">("none");
  const [categoriaId, setCategoriaId] = useState<string | "none">("none");
  const [descrizione, setDescrizione] = useState("");
  const [modalita, setModalita] = useState<ModalitaPrezzoBase>("griglia");
  const [unitOfMeasure, setUnitOfMeasure] = useState("pz");
  const [vatRate, setVatRate] = useState("22");
  const [grigliaXLabel, setGrigliaXLabel] = useState("Larghezza (mm)");
  const [grigliaYLabel, setGrigliaYLabel] = useState("Altezza (mm)");

  // Step 2 — prezzi + strategia markup
  const [prezzoBaseMode, setPrezzoBaseMode] =
    useState<PrezzoBaseMode>("vendita");
  const [prezzoVendita, setPrezzoVendita] = useState("0");
  const [prezzoAcquisto, setPrezzoAcquisto] = useState("0");
  const [markupTipo, setMarkupTipo] = useState<MarkupTipo>("none");
  const [markupValore, setMarkupValore] = useState("0");

  // Step 4
  const [posaTariffaId, setPosaTariffaId] = useState<string | "none">("none");
  const [posaQuantita, setPosaQuantita] = useState("1");
  // Sprint A §4.3 / Step 10 — flag posa legata. Se true (default), la riga posa
  // auto-generata dal preventivatore resta legata alla riga prodotto: DELETE
  // cascade + QUANTITY sync. Se false, la posa resta indipendente.
  const [posaLinked, setPosaLinked] = useState<boolean>(true);

  // ── Query: macrocategorie + categorie + tariffe ────────────────────────
  const { macrocategorie } = useListinoMacrocategorie();
  const { categorie } = useListinoCategorie();

  // Bootstrap da family caricata
  useEffect(() => {
    if (family) {
      setNome(family.nome);
      const cat = family.categoria_id
        ? categorie.find((c) => c.id === family.categoria_id)
        : null;
      setCategoriaId(family.categoria_id ?? "none");
      setMacrocategoriaId(cat?.macrocategoria_id ?? "none");
      setDescrizione(family.descrizione ?? "");
      setModalita(family.modalita_prezzo_base);
      setUnitOfMeasure(family.unit_of_measure);
      setVatRate(String(family.vat_rate));
      setGrigliaXLabel(family.griglia_asse_x_label);
      setGrigliaYLabel(family.griglia_asse_y_label);
      setPrezzoVendita(String(family.prezzo_base_vendita));
      setPrezzoAcquisto(String(family.prezzo_base_acquisto));
      // Nuovi campi dalla migration 20260421000002. Fino alla rigenerazione
      // dei types potrebbero non essere presenti sull'oggetto — fallback
      // ai default del DB ('vendita'/'none'/0).
      const fx = family as unknown as {
        prezzo_base_mode?: PrezzoBaseMode | null;
        markup_tipo?: MarkupTipo | null;
        markup_valore?: number | null;
      };
      setPrezzoBaseMode(fx.prezzo_base_mode ?? "vendita");
      setMarkupTipo(fx.markup_tipo ?? "none");
      setMarkupValore(String(fx.markup_valore ?? 0));
      setPosaTariffaId(family.posa_tariffa_default_id ?? "none");
      setPosaQuantita(String(family.posa_quantita_default));
      // `posa_linked` arriva dalla migration Step 3; fino alla rigenerazione
      // dei types potrebbe non essere presente → default true.
      const pl = (family as unknown as { posa_linked?: boolean | null }).posa_linked;
      setPosaLinked(pl ?? true);
    }
  }, [family, categorie]);

  // Categorie filtrate per macrocategoria selezionata
  const categorieFiltered = useMemo(() => {
    if (macrocategoriaId === "none") {
      // Nessuna macro selezionata → mostra solo quelle orfane
      return categorie.filter((c) => c.macrocategoria_id === null);
    }
    return categorie.filter((c) => c.macrocategoria_id === macrocategoriaId);
  }, [categorie, macrocategoriaId]);

  // Se la macrocategoria cambia e la categoria corrente non appartiene a
  // quella macro, resetta la selezione.
  useEffect(() => {
    if (categoriaId === "none") return;
    const cat = categorie.find((c) => c.id === categoriaId);
    if (!cat) return;
    const macroOfCat = cat.macrocategoria_id ?? "none";
    if (macroOfCat !== macrocategoriaId) {
      setCategoriaId("none");
    }
  }, [macrocategoriaId, categoriaId, categorie]);

  const { data: tariffe = [] } = useQuery({
    queryKey: ["tariffe-for-editor", companyId],
    enabled: !!companyId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("tariffe_aziendali")
        .select("id, nome, tipo")
        .eq("company_id", companyId!)
        .order("nome", { ascending: true });
      if (error) throw new Error(error.message);
      return (data ?? []) as Tariffa[];
    },
  });

  // Prezzo vendita effettivo: calcolato da acquisto+markup se mode dice così,
  // oppure input diretto. Serve sia al salvataggio che alla preview inline.
  const prezzoVenditaCalcolato = useMemo(
    () =>
      resolvePrezzoVendita({
        prezzoBaseMode,
        prezzoVenditaInput: parseFloat(prezzoVendita) || 0,
        prezzoAcquistoInput: parseFloat(prezzoAcquisto) || 0,
        markupTipo,
        markupValore: parseFloat(markupValore) || 0,
      }),
    [prezzoBaseMode, prezzoVendita, prezzoAcquisto, markupTipo, markupValore],
  );

  const markupPreview = useMemo(() => {
    if (prezzoBaseMode !== "acquisto_markup") return null;
    return applyMarkup({
      prezzoAcquisto: parseFloat(prezzoAcquisto) || 0,
      markupTipo,
      markupValore: parseFloat(markupValore) || 0,
    });
  }, [prezzoBaseMode, prezzoAcquisto, markupTipo, markupValore]);

  // ── Salvataggio Step 1 (crea/aggiorna dati base) ───────────────────────
  const saveBase = async (): Promise<string | null> => {
    const vertical =
      (effectiveCompany as { vertical?: string } | null)?.vertical ?? "generico";
    // IVA: accetta 0 (estero/reverse charge). Il vecchio fallback a 22 su NaN
    // resta per proteggerci da stringhe vuote, ma 0 è un valore valido.
    const parsedVat = parseFloat(vatRate);
    const vat_rate = Number.isFinite(parsedVat) ? parsedVat : 22;

    const prezzoAcquistoNum = parseFloat(prezzoAcquisto) || 0;
    const prezzoVenditaNum =
      prezzoBaseMode === "acquisto_markup"
        ? prezzoVenditaCalcolato // cache derivata, tenuta allineata al markup
        : parseFloat(prezzoVendita) || 0;

    const payload = {
      nome: nome.trim(),
      categoria_id: categoriaId === "none" ? null : categoriaId,
      descrizione: descrizione.trim() || null,
      modalita_prezzo_base: modalita,
      unit_of_measure: unitOfMeasure,
      vat_rate,
      griglia_asse_x_label: grigliaXLabel,
      griglia_asse_y_label: grigliaYLabel,
      prezzo_base_mode: prezzoBaseMode,
      prezzo_base_vendita: prezzoVenditaNum,
      prezzo_base_acquisto: prezzoAcquistoNum,
      markup_tipo: markupTipo,
      markup_valore: parseFloat(markupValore) || 0,
      posa_tariffa_default_id: posaTariffaId === "none" ? null : posaTariffaId,
      posa_quantita_default: parseFloat(posaQuantita) || 1,
      posa_linked: posaLinked,
    };

    try {
      if (isNew) {
        const created = await createFamily.mutateAsync({
          ...payload,
          vertical,
          immagine_url: null,
          pdf_scheda_url: null,
          griglia_unita: "mm",
          attivo: true,
          sort_order: 0,
          custom_field_values: {},
        });
        toast.success("Articolo creato");
        // Redirect a /:id per continuare editing
        navigate(`/azienda/impostazioni/listino/famiglie/${created.id}`, {
          replace: true,
        });
        return created.id;
      } else if (family) {
        await updateFamily.mutateAsync({ id: family.id, patch: payload });
        toast.success("Articolo aggiornato");
        return family.id;
      }
    } catch (err) {
      toast.error("Errore salvataggio", {
        description: err instanceof Error ? err.message : "Errore sconosciuto",
      });
    }
    return null;
  };

  const canSaveBase = nome.trim().length > 0;
  const saving = createFamily.isPending || updateFamily.isPending;

  // Duplica
  const handleDuplicate = async () => {
    if (!family) return;
    try {
      const newId = await duplicateFamily.mutateAsync({
        sourceId: family.id,
        newName: `${family.nome} (copia)`,
      });
      toast.success("Articolo duplicato");
      navigate(`/azienda/impostazioni/listino/famiglie/${newId}`);
    } catch (err) {
      toast.error("Errore duplicazione", {
        description: err instanceof Error ? err.message : "Errore sconosciuto",
      });
    }
  };

  if (!isNew && loadingFamily) {
    return (
      <div className="flex items-center justify-center py-12 text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin mr-2" aria-hidden="true" />
        Caricamento articolo…
      </div>
    );
  }

  if (!isNew && !family) {
    return (
      <Card>
        <CardContent className="py-12 text-center">
          <p className="font-medium">Articolo non trovato</p>
          <Button
            className="mt-4"
            variant="outline"
            onClick={() => navigate("/azienda/impostazioni/listino/famiglie")}
          >
            Torna al catalogo
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <header className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => navigate("/azienda/impostazioni/listino/famiglie")}
          >
            <ArrowLeft className="h-4 w-4 mr-1" aria-hidden="true" />
            Articoli
          </Button>
          <div className="min-w-0">
            <h1 className="text-xl font-semibold truncate">
              {isNew ? "Nuovo articolo" : family?.nome}
            </h1>
            {!isNew && family ? (
              <p className="text-xs text-muted-foreground">
                Aggiornata{" "}
                {new Date(family.updated_at).toLocaleString("it-IT", {
                  dateStyle: "medium",
                  timeStyle: "short",
                })}
              </p>
            ) : null}
          </div>
        </div>
        {!isNew && family ? (
          <Button
            variant="outline"
            size="sm"
            onClick={handleDuplicate}
            disabled={duplicateFamily.isPending}
          >
            {duplicateFamily.isPending ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" aria-hidden="true" />
            ) : (
              <CopyPlus className="h-4 w-4 mr-2" aria-hidden="true" />
            )}
            Duplica
          </Button>
        ) : null}
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Colonna principale: step */}
        <div className="lg:col-span-2">
          <Tabs value={activeStep} onValueChange={setActiveStep}>
            <TabsList className="grid grid-cols-5 w-full">
              <TabsTrigger value="1">1. Dati base</TabsTrigger>
              <TabsTrigger value="2" disabled={isNew}>2. Prezzo</TabsTrigger>
              <TabsTrigger value="3" disabled={isNew}>3. Assi</TabsTrigger>
              <TabsTrigger value="4" disabled={isNew}>4. Posa</TabsTrigger>
              <TabsTrigger value="5" disabled={isNew}>5. Riepilogo</TabsTrigger>
            </TabsList>

            {/* STEP 1 — Dati base */}
            <TabsContent value="1" className="space-y-4 mt-4">
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Dati base</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div>
                    <Label htmlFor="f-nome">Nome articolo *</Label>
                    <Input
                      id="f-nome"
                      value={nome}
                      onChange={(e) => setNome(e.target.value)}
                      placeholder="es. Finestra PVC 2 ante"
                    />
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <div className="flex items-center justify-between gap-2">
                        <Label htmlFor="f-macrocategoria">Macrocategoria</Label>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="h-auto p-1 text-xs"
                          onClick={() => setShowCategorieManager(true)}
                        >
                          <FolderTree className="h-3.5 w-3.5 mr-1" aria-hidden="true" />
                          Gestisci
                        </Button>
                      </div>
                      <Select
                        value={macrocategoriaId}
                        onValueChange={(v) => setMacrocategoriaId(v)}
                      >
                        <SelectTrigger id="f-macrocategoria">
                          <SelectValue placeholder="Nessuna" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">— Nessuna —</SelectItem>
                          {macrocategorie.map((m) => (
                            <SelectItem key={m.id} value={m.id}>
                              {m.nome}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label htmlFor="f-categoria">Categoria</Label>
                      <Select
                        value={categoriaId}
                        onValueChange={(v) => setCategoriaId(v)}
                      >
                        <SelectTrigger id="f-categoria">
                          <SelectValue
                            placeholder={
                              categorieFiltered.length === 0
                                ? "Crea prima una categoria"
                                : "Nessuna"
                            }
                          />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">— Nessuna —</SelectItem>
                          {categorieFiltered.map((c) => (
                            <SelectItem key={c.id} value={c.id}>
                              {c.nome}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      {macrocategoriaId !== "none" && categorieFiltered.length === 0 && (
                        <p className="text-xs text-muted-foreground mt-1">
                          Nessuna categoria in questa macrocategoria.{" "}
                          <button
                            type="button"
                            className="underline hover:text-foreground"
                            onClick={() => setShowCategorieManager(true)}
                          >
                            Creane una
                          </button>
                        </p>
                      )}
                    </div>
                  </div>

                  <div>
                    <Label htmlFor="f-descrizione">Descrizione</Label>
                    <Textarea
                      id="f-descrizione"
                      value={descrizione}
                      onChange={(e) => setDescrizione(e.target.value)}
                      rows={2}
                    />
                  </div>

                  <div>
                    <Label>Modalità prezzo base</Label>
                    <RadioGroup
                      value={modalita}
                      onValueChange={(v) => setModalita(v as ModalitaPrezzoBase)}
                      className="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-2"
                    >
                      {MODALITA_CARDS.map((m) => (
                        <label
                          key={m.value}
                          htmlFor={`mod-${m.value}`}
                          className={`flex gap-3 p-3 border rounded-md cursor-pointer transition-all ${modalita === m.value ? "border-primary ring-2 ring-primary/20 bg-primary/5" : "hover:border-primary/50"}`}
                        >
                          <RadioGroupItem
                            id={`mod-${m.value}`}
                            value={m.value}
                            className="mt-0.5"
                          />
                          <div className="flex-1 min-w-0">
                            <div className="font-medium text-sm">{m.label}</div>
                            <div className="text-xs text-muted-foreground">
                              {m.descrizione}
                            </div>
                          </div>
                        </label>
                      ))}
                    </RadioGroup>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <Label htmlFor="f-um">Unità di misura</Label>
                      <Select value={unitOfMeasure} onValueChange={setUnitOfMeasure}>
                        <SelectTrigger id="f-um">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {UM_OPTIONS.map((um) => (
                            <SelectItem key={um} value={um}>
                              {um}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label htmlFor="f-iva">IVA %</Label>
                      <Select value={vatRate} onValueChange={setVatRate}>
                        <SelectTrigger id="f-iva">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {IVA_OPTIONS.map((iva) => (
                            <SelectItem
                              key={iva.value}
                              value={String(iva.value)}
                            >
                              <span className="flex items-center gap-2">
                                <span className="font-medium">{iva.label}</span>
                                {iva.hint ? (
                                  <span className="text-xs text-muted-foreground">
                                    — {iva.hint}
                                  </span>
                                ) : null}
                              </span>
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      {parseFloat(vatRate) === 0 ? (
                        <p className="text-xs text-muted-foreground mt-1">
                          IVA 0% tipica di acquisti intracomunitari / esteri con
                          inversione contabile (reverse charge).
                        </p>
                      ) : null}
                    </div>
                  </div>

                  {modalita === "griglia" ? (
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <Label htmlFor="f-griglia-x">Etichetta asse X</Label>
                        <Input
                          id="f-griglia-x"
                          value={grigliaXLabel}
                          onChange={(e) => setGrigliaXLabel(e.target.value)}
                        />
                      </div>
                      <div>
                        <Label htmlFor="f-griglia-y">Etichetta asse Y</Label>
                        <Input
                          id="f-griglia-y"
                          value={grigliaYLabel}
                          onChange={(e) => setGrigliaYLabel(e.target.value)}
                        />
                      </div>
                    </div>
                  ) : null}
                </CardContent>
              </Card>
              <div className="flex justify-end">
                <Button
                  onClick={async () => {
                    const id = await saveBase();
                    if (id && !isNew) setActiveStep("2");
                  }}
                  disabled={!canSaveBase || saving}
                >
                  {saving ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" aria-hidden="true" />
                      Salvataggio…
                    </>
                  ) : (
                    <>
                      <Save className="h-4 w-4 mr-2" aria-hidden="true" />
                      {isNew ? "Crea articolo" : "Salva dati base"}
                    </>
                  )}
                </Button>
              </div>
            </TabsContent>

            {/* STEP 2 — Prezzo */}
            <TabsContent value="2" className="space-y-4 mt-4">
              {modalita === "griglia" && family ? (
                <FamilyGridEditor
                  familyId={family.id}
                  asseXLabel={grigliaXLabel}
                  asseYLabel={grigliaYLabel}
                />
              ) : (
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">Prezzo base</CardTitle>
                    <p className="text-sm text-muted-foreground">
                      Scegli come gestire il prezzo: direttamente quello di
                      vendita o quello di acquisto con un markup.
                    </p>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    {/* Selettore modalità prezzo */}
                    <div>
                      <Label>Modalità gestione prezzo</Label>
                      <RadioGroup
                        value={prezzoBaseMode}
                        onValueChange={(v) =>
                          setPrezzoBaseMode(v as PrezzoBaseMode)
                        }
                        className="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-2"
                      >
                        {PREZZO_MODE_CARDS.map((m) => (
                          <label
                            key={m.value}
                            htmlFor={`price-mode-${m.value}`}
                            className={`flex gap-3 p-3 border rounded-md cursor-pointer transition-all ${prezzoBaseMode === m.value ? "border-primary ring-2 ring-primary/20 bg-primary/5" : "hover:border-primary/50"}`}
                          >
                            <RadioGroupItem
                              id={`price-mode-${m.value}`}
                              value={m.value}
                              className="mt-0.5"
                            />
                            <div className="flex-1 min-w-0">
                              <div className="font-medium text-sm">
                                {m.label}
                              </div>
                              <div className="text-xs text-muted-foreground">
                                {m.descrizione}
                              </div>
                            </div>
                          </label>
                        ))}
                      </RadioGroup>
                    </div>

                    {/* Branch: prezzo vendita diretto */}
                    {prezzoBaseMode === "vendita" ? (
                      <div>
                        <Label htmlFor="f-prezzo-vendita">
                          Prezzo di vendita (€)
                        </Label>
                        <Input
                          id="f-prezzo-vendita"
                          type="number"
                          step="0.01"
                          min="0"
                          value={prezzoVendita}
                          onChange={(e) => setPrezzoVendita(e.target.value)}
                          className="max-w-xs"
                        />
                        <p className="text-xs text-muted-foreground mt-1">
                          Prezzo finale al cliente. Nessun margine calcolato.
                        </p>
                      </div>
                    ) : (
                      /* Branch: acquisto + markup → vendita derivata */
                      <div className="space-y-3">
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                          <div>
                            <Label htmlFor="f-prezzo-acquisto">
                              Prezzo di acquisto (€)
                            </Label>
                            <Input
                              id="f-prezzo-acquisto"
                              type="number"
                              step="0.01"
                              min="0"
                              value={prezzoAcquisto}
                              onChange={(e) =>
                                setPrezzoAcquisto(e.target.value)
                              }
                            />
                            <p className="text-xs text-muted-foreground mt-1">
                              Costo dal fornitore (listino).
                            </p>
                          </div>
                          <div>
                            <Label htmlFor="f-markup-tipo">Tipo markup</Label>
                            <Select
                              value={markupTipo}
                              onValueChange={(v) =>
                                setMarkupTipo(v as MarkupTipo)
                              }
                            >
                              <SelectTrigger id="f-markup-tipo">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="none">
                                  Nessun ricarico
                                </SelectItem>
                                <SelectItem value="percentuale">
                                  Percentuale (%)
                                </SelectItem>
                                <SelectItem value="fisso_pz">
                                  Euro al pezzo (€)
                                </SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
                        </div>

                        {markupTipo !== "none" ? (
                          <div className="max-w-xs">
                            <Label htmlFor="f-markup-valore">
                              {markupTipo === "percentuale"
                                ? "Markup (%)"
                                : "Markup (€/pz)"}
                            </Label>
                            <Input
                              id="f-markup-valore"
                              type="number"
                              step={
                                markupTipo === "percentuale" ? "0.1" : "0.01"
                              }
                              min="0"
                              value={markupValore}
                              onChange={(e) =>
                                setMarkupValore(e.target.value)
                              }
                              placeholder={
                                markupTipo === "percentuale"
                                  ? "es. 45"
                                  : "es. 120"
                              }
                            />
                            <p className="text-xs text-muted-foreground mt-1">
                              {markupTipo === "percentuale"
                                ? "Ricarico in percentuale sul prezzo di acquisto."
                                : "Ricarico fisso in euro per ogni pezzo."}
                            </p>
                          </div>
                        ) : null}

                        {/* Preview calcolo vendita */}
                        <div className="rounded-md border bg-muted/30 p-3">
                          <div className="text-xs text-muted-foreground mb-1">
                            Prezzo di vendita calcolato
                          </div>
                          <div className="flex items-baseline gap-3 flex-wrap">
                            <div className="text-2xl font-semibold">
                              {formatCurrency(prezzoVenditaCalcolato)}
                            </div>
                            {markupPreview && markupPreview.prezzoVendita > 0 ? (
                              <div className="text-xs text-muted-foreground flex gap-3 flex-wrap">
                                <span>
                                  Margine:{" "}
                                  <span className="font-medium text-foreground">
                                    {formatCurrency(markupPreview.margineEuro)}
                                  </span>
                                </span>
                                {markupPreview.marginePercentualeSuVendita !==
                                null ? (
                                  <span>
                                    Su vendita:{" "}
                                    <span className="font-medium text-foreground">
                                      {markupPreview.marginePercentualeSuVendita.toFixed(
                                        1,
                                      )}
                                      %
                                    </span>
                                  </span>
                                ) : null}
                              </div>
                            ) : null}
                          </div>
                        </div>
                      </div>
                    )}

                    <div className="flex justify-end pt-2">
                      <Button
                        onClick={saveBase}
                        disabled={!canSaveBase || saving}
                      >
                        {saving ? (
                          <>
                            <Loader2
                              className="h-4 w-4 mr-2 animate-spin"
                              aria-hidden="true"
                            />
                            Salvataggio…
                          </>
                        ) : (
                          <>
                            <Save className="h-4 w-4 mr-2" aria-hidden="true" />
                            Salva prezzo
                          </>
                        )}
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              )}
            </TabsContent>

            {/* STEP 3 — Assi */}
            <TabsContent value="3" className="mt-4">
              {family ? <FamilyAxesEditor family={family} /> : null}
            </TabsContent>

            {/* STEP 4 — Posa */}
            <TabsContent value="4" className="space-y-4 mt-4">
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Posa default</CardTitle>
                  <p className="text-sm text-muted-foreground">
                    La posa verrà aggiunta automaticamente al preventivo quando si seleziona un articolo di questa famiglia.
                  </p>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div>
                    <Label htmlFor="f-posa-tariffa">Tariffa posa</Label>
                    <Select value={posaTariffaId} onValueChange={setPosaTariffaId}>
                      <SelectTrigger id="f-posa-tariffa">
                        <SelectValue placeholder="Nessuna" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">Nessuna posa automatica</SelectItem>
                        {tariffe.map((t) => (
                          <SelectItem key={t.id} value={t.id}>
                            {t.nome}{" "}
                            <span className="text-muted-foreground ml-2">{t.tipo}</span>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label htmlFor="f-posa-quantita">Quantità default</Label>
                    <Input
                      id="f-posa-quantita"
                      type="number"
                      step="0.01"
                      value={posaQuantita}
                      onChange={(e) => setPosaQuantita(e.target.value)}
                      className="w-32"
                    />
                  </div>
                  {/* Sprint A §4.3 / Step 10 — Posa legata al prodotto */}
                  <div className="flex items-start justify-between gap-3 rounded-md border bg-muted/30 p-3">
                    <div className="space-y-0.5">
                      <Label htmlFor="f-posa-linked" className="cursor-pointer">
                        Posa legata al prodotto
                      </Label>
                      <p className="text-xs text-muted-foreground">
                        Se attivo, cancellare o modificare la riga prodotto
                        aggiorna anche la riga posa. Se disattivo, posa e
                        prodotto vivono in modo indipendente.
                      </p>
                    </div>
                    <Switch
                      id="f-posa-linked"
                      checked={posaLinked}
                      onCheckedChange={setPosaLinked}
                      disabled={posaTariffaId === "none"}
                    />
                  </div>
                  <div className="flex justify-end">
                    <Button onClick={saveBase} disabled={saving}>
                      {saving ? (
                        <>
                          <Loader2 className="h-4 w-4 mr-2 animate-spin" aria-hidden="true" />
                          Salvataggio…
                        </>
                      ) : (
                        <>
                          <Save className="h-4 w-4 mr-2" aria-hidden="true" />
                          Salva posa
                        </>
                      )}
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            {/* STEP 5 — Riepilogo */}
            <TabsContent value="5" className="space-y-4 mt-4">
              {family ? (
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">Riepilogo articolo</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3 text-sm">
                    <Row label="Nome" value={family.nome} />
                    <Row
                      label="Macrocategoria"
                      value={
                        (() => {
                          const cat = family.categoria_id
                            ? categorie.find((c) => c.id === family.categoria_id)
                            : null;
                          const macroId = cat?.macrocategoria_id;
                          return macroId
                            ? macrocategorie.find((m) => m.id === macroId)?.nome ?? "—"
                            : "Nessuna";
                        })()
                      }
                    />
                    <Row
                      label="Categoria"
                      value={
                        categorie.find((c) => c.id === family.categoria_id)?.nome ??
                        "Nessuna"
                      }
                    />
                    <Row label="Modalità prezzo" value={family.modalita_prezzo_base} />
                    <Row label="UM" value={family.unit_of_measure} />
                    <Row
                      label="IVA"
                      value={
                        family.vat_rate === 0
                          ? "0% (estero / reverse charge)"
                          : `${family.vat_rate}%`
                      }
                    />
                    <Row
                      label="Gestione prezzo"
                      value={
                        prezzoBaseMode === "vendita"
                          ? "Vendita diretta"
                          : "Acquisto + markup"
                      }
                    />
                    {prezzoBaseMode === "acquisto_markup" ? (
                      <>
                        <Row
                          label="Prezzo acquisto"
                          value={formatCurrency(
                            parseFloat(prezzoAcquisto) || 0,
                          )}
                        />
                        <Row
                          label="Markup"
                          value={
                            markupTipo === "none"
                              ? "Nessuno"
                              : markupTipo === "percentuale"
                                ? `+${parseFloat(markupValore) || 0}%`
                                : `+${formatCurrency(parseFloat(markupValore) || 0)}/pz`
                          }
                        />
                        <Row
                          label="Prezzo vendita calcolato"
                          value={formatCurrency(prezzoVenditaCalcolato)}
                        />
                      </>
                    ) : (
                      <Row
                        label="Prezzo vendita"
                        value={formatCurrency(parseFloat(prezzoVendita) || 0)}
                      />
                    )}
                    <Row
                      label="Posa"
                      value={
                        family.posa_tariffa_default_id
                          ? `${tariffe.find((t) => t.id === family.posa_tariffa_default_id)?.nome ?? "—"} (${family.posa_quantita_default})`
                          : "Nessuna"
                      }
                    />
                    <div>
                      <div className="font-medium mb-1">Assi ({family.axes.length})</div>
                      {family.axes.length === 0 ? (
                        <p className="text-muted-foreground">Nessun asse configurato.</p>
                      ) : (
                        <ul className="space-y-1">
                          {family.axes.map((ax) => (
                            <li key={ax.id} className="flex gap-2 items-center">
                              <Check className="h-3.5 w-3.5 text-primary" aria-hidden="true" />
                              <span className="font-medium">{ax.nome}</span>
                              <Badge variant="outline" className="text-xs">
                                {ax.values.length}{" "}
                                {ax.values.length === 1 ? "valore" : "valori"}
                              </Badge>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                    <div className="flex gap-2 pt-3 border-t">
                      <Button
                        onClick={() =>
                          navigate("/azienda/impostazioni/listino/famiglie")
                        }
                        variant="outline"
                      >
                        Torna al catalogo
                      </Button>
                      <Button onClick={handleDuplicate} disabled={duplicateFamily.isPending}>
                        {duplicateFamily.isPending ? (
                          <>
                            <Loader2 className="h-4 w-4 mr-2 animate-spin" aria-hidden="true" />
                            Duplicazione…
                          </>
                        ) : (
                          <>
                            <CopyPlus className="h-4 w-4 mr-2" aria-hidden="true" />
                            Salva e crea copia
                          </>
                        )}
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ) : null}
            </TabsContent>
          </Tabs>
        </div>

        {/* Sidebar: preview prezzo */}
        <div className="lg:col-span-1">
          {!isNew && family ? (
            <div className="sticky top-4">
              <FamilyPricePreview family={family} />
            </div>
          ) : (
            <Card>
              <CardContent className="py-8 text-center text-sm text-muted-foreground">
                Salva i dati base per iniziare a configurare assi, griglia prezzi e vedere la preview live.
              </CardContent>
            </Card>
          )}
        </div>
      </div>

      {/* Dialog gestione macrocategorie/categorie (aperto da sezione Step 1) */}
      <Dialog open={showCategorieManager} onOpenChange={setShowCategorieManager}>
        <DialogContent className="sm:max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Gestione categorie</DialogTitle>
            <DialogDescription>
              Crea macrocategorie e categorie. Saranno immediatamente disponibili
              nel menu a tendina.
            </DialogDescription>
          </DialogHeader>
          <MacroCategorieManager />
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between border-b pb-1">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium">{value}</span>
    </div>
  );
}
