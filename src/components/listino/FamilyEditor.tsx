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

import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import {
  ArrowLeft,
  Check,
  Loader2,
  Save,
  CopyPlus,
  FolderTree,
  Upload,
  ImageIcon,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useEffectiveCompanyId } from "@/hooks/useEffectiveCompanyId";
import { useFamily } from "@/hooks/useFamilies";
import { useFamilyMutations } from "@/hooks/useFamilyMutations";
import { useArticleImageUpload } from "@/hooks/useArticleImageUpload";
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
import {
  applyMarkup,
  applyScontiFornitore,
  resolvePrezzoVendita,
} from "@/lib/priceMarkup";
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
  /**
   * URL pubblico dell'immagine articolo (bucket `article-images`).
   * NULL = usa placeholder grigio in UI (FamilyCatalog). Persistito in
   * `article_families.immagine_url`. Upload gestito via hook
   * useArticleImageUpload; salvataggio URL integrato nella mutation
   * createFamily/updateFamily insieme agli altri campi di Step 1.
   */
  const [immagineUrl, setImmagineUrl] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { upload: uploadImage, remove: removeImage, isUploading, isRemoving } =
    useArticleImageUpload();
  const [modalita, setModalita] = useState<ModalitaPrezzoBase>("griglia");
  const [unitOfMeasure, setUnitOfMeasure] = useState("pz");
  const [vatRate, setVatRate] = useState("22");
  // IVA di acquisto: pagata al fornitore. Separata da vatRate (IVA vendita)
  // perché in scenari intra-UE/estero l'acquisto è al 0% (reverse charge)
  // ma la vendita al cliente italiano resta al 22%. Migration 20260421000003.
  const [vatRateAcquisto, setVatRateAcquisto] = useState("22");
  const [grigliaXLabel, setGrigliaXLabel] = useState("Larghezza (mm)");
  const [grigliaYLabel, setGrigliaYLabel] = useState("Altezza (mm)");

  // Step 2 — prezzi + strategia markup
  const [prezzoBaseMode, setPrezzoBaseMode] =
    useState<PrezzoBaseMode>("vendita");
  const [prezzoVendita, setPrezzoVendita] = useState("0");
  const [prezzoAcquisto, setPrezzoAcquisto] = useState("0");
  const [markupTipo, setMarkupTipo] = useState<MarkupTipo>("none");
  const [markupValore, setMarkupValore] = useState("0");
  // Sconti fornitore in cascata: tipici listini IT serramentisti (es. 55% + 3%).
  // Il prezzoAcquisto diventa "lordo di listino" quando almeno uno è > 0.
  // Migration 20260421000006. Retrocompat: 0/0 = nessuno sconto, input = netto.
  const [scontoFornitore1, setScontoFornitore1] = useState("0");
  const [scontoFornitore2, setScontoFornitore2] = useState("0");

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
      setImmagineUrl(family.immagine_url ?? null);
      setModalita(family.modalita_prezzo_base);
      setUnitOfMeasure(family.unit_of_measure);
      setVatRate(String(family.vat_rate));
      // vat_rate_acquisto può mancare su righe pre-migration → fallback a
      // vat_rate (assunzione: IVA acquisto = IVA vendita fino alla separazione).
      const fxAcq = family as unknown as { vat_rate_acquisto?: number | null };
      setVatRateAcquisto(
        String(fxAcq.vat_rate_acquisto ?? family.vat_rate ?? 22),
      );
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
        sconto_fornitore_1?: number | null;
        sconto_fornitore_2?: number | null;
      };
      setPrezzoBaseMode(fx.prezzo_base_mode ?? "vendita");
      setMarkupTipo(fx.markup_tipo ?? "none");
      setMarkupValore(String(fx.markup_valore ?? 0));
      setScontoFornitore1(String(fx.sconto_fornitore_1 ?? 0));
      setScontoFornitore2(String(fx.sconto_fornitore_2 ?? 0));
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

  // Prezzo vendita effettivo: calcolato da (lordo → sconti → netto → markup)
  // se mode=acquisto_markup, oppure input diretto se mode=vendita. Serve sia
  // al salvataggio che alla preview inline.
  const prezzoVenditaCalcolato = useMemo(
    () =>
      resolvePrezzoVendita({
        prezzoBaseMode,
        prezzoVenditaInput: parseFloat(prezzoVendita) || 0,
        prezzoAcquistoInput: parseFloat(prezzoAcquisto) || 0,
        markupTipo,
        markupValore: parseFloat(markupValore) || 0,
        scontoFornitore1: parseFloat(scontoFornitore1) || 0,
        scontoFornitore2: parseFloat(scontoFornitore2) || 0,
      }),
    [
      prezzoBaseMode,
      prezzoVendita,
      prezzoAcquisto,
      markupTipo,
      markupValore,
      scontoFornitore1,
      scontoFornitore2,
    ],
  );

  // Acquisto netto = lordo × (1-s1/100) × (1-s2/100). Quando entrambi sono 0
  // torna il lordo invariato (retrocompat: input era già netto).
  const acquistoNetto = useMemo(() => {
    if (prezzoBaseMode !== "acquisto_markup") return 0;
    const lordo = parseFloat(prezzoAcquisto) || 0;
    const s1 = parseFloat(scontoFornitore1) || 0;
    const s2 = parseFloat(scontoFornitore2) || 0;
    return s1 > 0 || s2 > 0 ? applyScontiFornitore(lordo, s1, s2) : lordo;
  }, [prezzoBaseMode, prezzoAcquisto, scontoFornitore1, scontoFornitore2]);

  const scontiAttivi =
    (parseFloat(scontoFornitore1) || 0) > 0 ||
    (parseFloat(scontoFornitore2) || 0) > 0;

  const markupPreview = useMemo(() => {
    if (prezzoBaseMode !== "acquisto_markup") return null;
    // Il markup si applica sull'acquisto NETTO (post sconti), non sul lordo.
    return applyMarkup({
      prezzoAcquisto: acquistoNetto,
      markupTipo,
      markupValore: parseFloat(markupValore) || 0,
    });
  }, [prezzoBaseMode, acquistoNetto, markupTipo, markupValore]);

  // ── Upload immagine articolo ─────────────────────────────────────────────
  //
  // Flusso in due fasi:
  //  1) Se l'articolo è NUOVO (non ancora salvato) → salva prima la base
  //     (saveBase) per ottenere un ID, poi carica l'immagine con quell'ID.
  //     Salva di nuovo per persistire `immagine_url`.
  //  2) Se è già esistente → upload diretto + persistenza URL in DB.
  //
  // L'upload usa il bucket `article-images` con path {company_id}/{family_id}
  // (vedi migration 20260421000005).
  const handleImageSelect = async (
    e: React.ChangeEvent<HTMLInputElement>,
  ) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Se articolo nuovo → prima salvataggio base per ottenere un ID
    let familyId = family?.id ?? null;
    if (!familyId) {
      if (!nome.trim()) {
        toast.error("Serve un nome", {
          description: "Inserisci il nome dell'articolo prima di caricare un'immagine.",
        });
        if (fileInputRef.current) fileInputRef.current.value = "";
        return;
      }
      const savedId = await saveBase();
      if (!savedId) {
        // saveBase ha già mostrato un toast di errore
        if (fileInputRef.current) fileInputRef.current.value = "";
        return;
      }
      familyId = savedId;
    }

    const result = await uploadImage(familyId, file);
    if (!result.ok) {
      toast.error("Errore upload immagine", { description: result.error });
      if (fileInputRef.current) fileInputRef.current.value = "";
      return;
    }

    setImmagineUrl(result.url);

    // Persisti subito immagine_url sulla riga famiglia così il refresh e il
    // catalogo lo vedono senza dover aspettare un save manuale.
    try {
      await updateFamily.mutateAsync({
        id: familyId,
        patch: { immagine_url: result.url },
      });
      toast.success("Immagine caricata");
    } catch (err) {
      toast.error("Errore salvataggio URL immagine", {
        description: err instanceof Error ? err.message : "Errore sconosciuto",
      });
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const handleImageRemove = async () => {
    if (!family?.id) {
      // Articolo non ancora salvato → basta resettare lo state locale
      setImmagineUrl(null);
      return;
    }
    const result = await removeImage(family.id);
    if (!result.ok) {
      toast.error("Errore rimozione immagine", { description: result.error });
      return;
    }
    setImmagineUrl(null);
    try {
      await updateFamily.mutateAsync({
        id: family.id,
        patch: { immagine_url: null },
      });
      toast.success("Immagine rimossa");
    } catch (err) {
      toast.error("Errore aggiornamento", {
        description: err instanceof Error ? err.message : "Errore sconosciuto",
      });
    }
  };

  // ── Salvataggio Step 1 (crea/aggiorna dati base) ───────────────────────
  const saveBase = async (): Promise<string | null> => {
    const vertical =
      (effectiveCompany as { vertical?: string } | null)?.vertical ?? "generico";
    // IVA: accetta 0 (estero/reverse charge). Il vecchio fallback a 22 su NaN
    // resta per proteggerci da stringhe vuote, ma 0 è un valore valido.
    const parsedVat = parseFloat(vatRate);
    const vat_rate = Number.isFinite(parsedVat) ? parsedVat : 22;
    // IVA acquisto: persistita solo quando mode=acquisto_markup ha senso
    // differenziarla. In mode=vendita la rimandiamo uguale a IVA vendita per
    // coerenza (niente dati sporchi nel DB).
    const parsedVatAcq = parseFloat(vatRateAcquisto);
    const vat_rate_acquisto =
      prezzoBaseMode === "acquisto_markup" && Number.isFinite(parsedVatAcq)
        ? parsedVatAcq
        : vat_rate;

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
      vat_rate_acquisto,
      griglia_asse_x_label: grigliaXLabel,
      griglia_asse_y_label: grigliaYLabel,
      prezzo_base_mode: prezzoBaseMode,
      prezzo_base_vendita: prezzoVenditaNum,
      prezzo_base_acquisto: prezzoAcquistoNum,
      markup_tipo: markupTipo,
      markup_valore: parseFloat(markupValore) || 0,
      // Sconti fornitore in cascata (migration 20260421000006). Persistiamo
      // sempre: anche in mode=vendita resta 0/0 (default DB) senza effetto.
      sconto_fornitore_1: parseFloat(scontoFornitore1) || 0,
      sconto_fornitore_2: parseFloat(scontoFornitore2) || 0,
      immagine_url: immagineUrl,
      posa_tariffa_default_id: posaTariffaId === "none" ? null : posaTariffaId,
      posa_quantita_default: parseFloat(posaQuantita) || 1,
      posa_linked: posaLinked,
    };

    try {
      if (isNew) {
        const created = await createFamily.mutateAsync({
          ...payload,
          vertical,
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

                  {/* Upload immagine articolo — opzionale ma utile per il
                      riconoscimento visivo nell'elenco e in preventivo. */}
                  <div>
                    <Label>Immagine articolo (opzionale)</Label>
                    <p className="text-xs text-muted-foreground mt-1 mb-2">
                      Carica una foto rappresentativa — es. cassonetto, finestra
                      2 ante, controtelaio, ecc. Apparirà nell&apos;elenco articoli
                      e nel preventivo. Max 3 MB, formati PNG/JPG/WEBP.
                    </p>
                    <div className="flex items-start gap-4">
                      {/* Preview */}
                      <div className="h-28 w-28 rounded-lg border-2 border-dashed border-muted-foreground/25 flex items-center justify-center overflow-hidden bg-muted/50 shrink-0">
                        {immagineUrl ? (
                          <img
                            src={immagineUrl}
                            alt={`Preview ${nome || "articolo"}`}
                            className="h-full w-full object-cover"
                          />
                        ) : (
                          <div className="flex flex-col items-center gap-1 text-muted-foreground">
                            <ImageIcon className="h-7 w-7" aria-hidden="true" />
                            <span className="text-[10px]">Nessuna foto</span>
                          </div>
                        )}
                      </div>
                      {/* Azioni */}
                      <div className="flex-1 flex flex-wrap gap-2">
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="h-9"
                          disabled={isUploading || isRemoving}
                          onClick={() => fileInputRef.current?.click()}
                          aria-label={
                            immagineUrl
                              ? "Cambia immagine articolo"
                              : "Carica immagine articolo"
                          }
                        >
                          {isUploading ? (
                            <>
                              <Loader2
                                className="h-4 w-4 mr-2 animate-spin"
                                aria-hidden="true"
                              />
                              Caricamento…
                            </>
                          ) : (
                            <>
                              <Upload
                                className="h-4 w-4 mr-2"
                                aria-hidden="true"
                              />
                              {immagineUrl ? "Cambia foto" : "Carica foto"}
                            </>
                          )}
                        </Button>
                        {immagineUrl && (
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            className="h-9 text-destructive hover:text-destructive"
                            disabled={isUploading || isRemoving}
                            onClick={() => void handleImageRemove()}
                            aria-label="Rimuovi immagine articolo"
                          >
                            {isRemoving ? (
                              <>
                                <Loader2
                                  className="h-4 w-4 mr-2 animate-spin"
                                  aria-hidden="true"
                                />
                                Rimozione…
                              </>
                            ) : (
                              <>
                                <X
                                  className="h-4 w-4 mr-2"
                                  aria-hidden="true"
                                />
                                Rimuovi
                              </>
                            )}
                          </Button>
                        )}
                      </div>
                    </div>
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="image/png,image/jpeg,image/webp"
                      onChange={(e) => void handleImageSelect(e)}
                      className="hidden"
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
                      <Label htmlFor="f-iva">IVA vendita %</Label>
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
                              {iva.hint
                                ? `${iva.label} — ${iva.hint}`
                                : iva.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <p className="text-xs text-muted-foreground mt-1">
                        {parseFloat(vatRate) === 0
                          ? "IVA 0% tipica di vendite estero / reverse charge."
                          : "Aliquota fatturata al cliente. I prezzi sono sempre al netto IVA."}
                      </p>
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
                    const savedId = await saveBase();
                    // Dopo il salvataggio (sia creazione che update) avanziamo
                    // sempre allo Step 2. Per la creazione `isNew` nel closure
                    // è ancora `true` ma il re-render lo porterà a `false` in
                    // batch con questo setActiveStep (i tabs 2-5 si abilitano).
                    if (savedId) setActiveStep("2");
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
                <>
                  {/* Parametri prezzo famiglia: sconti fornitore + markup.
                      In modalità griglia il prezzo di vendita di ogni cella
                      viene derivato dal prezzo di acquisto × cascata sconti ×
                      markup. Questo blocco permette di configurarli senza
                      dover uscire dalla tab. */}
                  <Card className="border-primary/30 bg-primary/5">
                    <CardHeader className="pb-3">
                      <CardTitle className="text-base">
                        Parametri prezzo famiglia
                      </CardTitle>
                      <p className="text-sm text-muted-foreground">
                        Sconti fornitore e markup applicati su <strong>tutte</strong>{" "}
                        le celle della matrice. Modificali e clicca{" "}
                        <em>Salva parametri</em> per ricalcolare la vendita.
                      </p>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      {/* Modalità prezzo */}
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
                              htmlFor={`grid-price-mode-${m.value}`}
                              className={`flex gap-3 p-3 border rounded-md cursor-pointer transition-all ${prezzoBaseMode === m.value ? "border-primary ring-2 ring-primary/20 bg-background" : "hover:border-primary/50 bg-background"}`}
                            >
                              <RadioGroupItem
                                id={`grid-price-mode-${m.value}`}
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

                      {/* Sconti + markup visibili solo in acquisto_markup */}
                      {prezzoBaseMode === "acquisto_markup" ? (
                        <>
                          <div className="rounded-md border bg-background p-3 space-y-2">
                            <Label className="text-sm font-medium">
                              Sconti fornitore in cascata
                            </Label>
                            <p className="text-xs text-muted-foreground">
                              Se i prezzi nelle celle della griglia sono il{" "}
                              <strong>lordo listino fornitore</strong>, inserisci
                              qui la scontistica. Es. "55% + 3%". Lascia 0/0 se
                              hai già inserito l'acquisto netto.
                            </p>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                              <div>
                                <Label
                                  htmlFor="grid-sconto-fornitore-1"
                                  className="text-xs"
                                >
                                  Sconto 1 (%)
                                </Label>
                                <Input
                                  id="grid-sconto-fornitore-1"
                                  type="number"
                                  step="0.1"
                                  min="0"
                                  max="100"
                                  value={scontoFornitore1}
                                  onChange={(e) =>
                                    setScontoFornitore1(e.target.value)
                                  }
                                  placeholder="es. 55"
                                />
                              </div>
                              <div>
                                <Label
                                  htmlFor="grid-sconto-fornitore-2"
                                  className="text-xs"
                                >
                                  Sconto 2 cascata (%)
                                </Label>
                                <Input
                                  id="grid-sconto-fornitore-2"
                                  type="number"
                                  step="0.1"
                                  min="0"
                                  max="100"
                                  value={scontoFornitore2}
                                  onChange={(e) =>
                                    setScontoFornitore2(e.target.value)
                                  }
                                  placeholder="es. 3"
                                />
                              </div>
                            </div>
                          </div>

                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                            <div>
                              <Label htmlFor="grid-markup-tipo">Tipo markup</Label>
                              <Select
                                value={markupTipo}
                                onValueChange={(v) =>
                                  setMarkupTipo(v as MarkupTipo)
                                }
                              >
                                <SelectTrigger id="grid-markup-tipo">
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
                            {markupTipo !== "none" ? (
                              <div>
                                <Label htmlFor="grid-markup-valore">
                                  {markupTipo === "percentuale"
                                    ? "Markup (%)"
                                    : "Markup (€/pz)"}
                                </Label>
                                <Input
                                  id="grid-markup-valore"
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
                                      ? "es. 100"
                                      : "es. 120"
                                  }
                                />
                              </div>
                            ) : null}
                          </div>

                          {/* Formula live */}
                          <div className="rounded-md border bg-background px-3 py-2 text-xs text-muted-foreground">
                            <span className="font-medium text-foreground">
                              Formula:
                            </span>{" "}
                            lordo ×{" "}
                            {(parseFloat(scontoFornitore1) || 0) > 0
                              ? `(1 − ${parseFloat(scontoFornitore1)}%)`
                              : "1"}{" "}
                            ×{" "}
                            {(parseFloat(scontoFornitore2) || 0) > 0
                              ? `(1 − ${parseFloat(scontoFornitore2)}%)`
                              : "1"}{" "}
                            ×{" "}
                            {markupTipo === "percentuale"
                              ? `(1 + ${parseFloat(markupValore) || 0}%)`
                              : markupTipo === "fisso_pz"
                                ? `(+ ${formatCurrency(parseFloat(markupValore) || 0)} fissi/pz)`
                                : "1 (no markup)"}{" "}
                            = vendita
                          </div>
                        </>
                      ) : (
                        <div className="rounded-md border bg-background px-3 py-2 text-xs text-muted-foreground">
                          In modalità <strong>vendita diretta</strong> il prezzo
                          di ogni cella è quello finale al cliente: nessuno
                          sconto o markup applicato dal sistema.
                        </div>
                      )}

                      <div className="flex justify-end pt-2">
                        <Button
                          onClick={saveBase}
                          disabled={!canSaveBase || saving}
                          size="sm"
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
                              Salva parametri
                            </>
                          )}
                        </Button>
                      </div>
                    </CardContent>
                  </Card>

                  <FamilyGridEditor
                    familyId={family.id}
                    asseXLabel={grigliaXLabel}
                    asseYLabel={grigliaYLabel}
                    prezzoBaseMode={prezzoBaseMode}
                    scontoFornitore1={parseFloat(scontoFornitore1) || 0}
                    scontoFornitore2={parseFloat(scontoFornitore2) || 0}
                    markupTipo={markupTipo}
                    markupValore={parseFloat(markupValore) || 0}
                  />
                </>
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
                              {scontiAttivi
                                ? "Prezzo LORDO di listino fornitore (€)"
                                : "Prezzo di acquisto (€, netto)"}
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
                              {scontiAttivi
                                ? `Listino fornitore NON scontato. Netto calcolato: ${formatCurrency(acquistoNetto)}.`
                                : "Costo dal fornitore al netto di IVA."}
                            </p>
                          </div>
                          <div>
                            <Label htmlFor="f-iva-acquisto">
                              IVA acquisto %
                            </Label>
                            <Select
                              value={vatRateAcquisto}
                              onValueChange={setVatRateAcquisto}
                            >
                              <SelectTrigger id="f-iva-acquisto">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                {IVA_OPTIONS.map((iva) => (
                                  <SelectItem
                                    key={iva.value}
                                    value={String(iva.value)}
                                  >
                                    {iva.hint
                                      ? `${iva.label} — ${iva.hint}`
                                      : iva.label}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                            <p className="text-xs text-muted-foreground mt-1">
                              {parseFloat(vatRateAcquisto) === 0
                                ? "Acquisto intra-UE / estero: reverse charge."
                                : "Aliquota pagata al fornitore (fattura acquisto)."}
                            </p>
                          </div>
                        </div>

                        {/* Sconti fornitore in cascata — opzionali, 0/0 = disattivi */}
                        <div className="rounded-md border bg-muted/10 p-3 space-y-2">
                          <div className="flex items-baseline justify-between gap-2">
                            <div>
                              <Label className="text-sm font-medium">
                                Sconti fornitore in cascata
                              </Label>
                              <p className="text-xs text-muted-foreground mt-0.5">
                                Se il prezzo sopra è il{" "}
                                <strong>lordo di listino</strong> (es. Finestra a
                                Wasistas), inserisci qui la scontistica
                                commerciale del fornitore. Es. &quot;55% + 3%&quot;.
                                Lascia 0/0 se hai già inserito l'acquisto netto.
                              </p>
                            </div>
                          </div>
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                            <div>
                              <Label htmlFor="f-sconto-fornitore-1" className="text-xs">
                                Sconto 1 (%)
                              </Label>
                              <Input
                                id="f-sconto-fornitore-1"
                                type="number"
                                step="0.1"
                                min="0"
                                max="100"
                                value={scontoFornitore1}
                                onChange={(e) =>
                                  setScontoFornitore1(e.target.value)
                                }
                                placeholder="es. 55"
                              />
                            </div>
                            <div>
                              <Label htmlFor="f-sconto-fornitore-2" className="text-xs">
                                Sconto 2 in cascata (%)
                              </Label>
                              <Input
                                id="f-sconto-fornitore-2"
                                type="number"
                                step="0.1"
                                min="0"
                                max="100"
                                value={scontoFornitore2}
                                onChange={(e) =>
                                  setScontoFornitore2(e.target.value)
                                }
                                placeholder="es. 3"
                              />
                            </div>
                          </div>
                          {scontiAttivi ? (
                            <div className="text-xs text-muted-foreground pt-1 border-t">
                              <span className="font-medium">Acquisto netto calcolato:</span>{" "}
                              <span className="font-semibold text-foreground">
                                {formatCurrency(acquistoNetto)}
                              </span>{" "}
                              <span className="text-muted-foreground/80">
                                ({formatCurrency(parseFloat(prezzoAcquisto) || 0)}
                                {(parseFloat(scontoFornitore1) || 0) > 0
                                  ? ` × (1 − ${parseFloat(scontoFornitore1)}%)`
                                  : ""}
                                {(parseFloat(scontoFornitore2) || 0) > 0
                                  ? ` × (1 − ${parseFloat(scontoFornitore2)}%)`
                                  : ""}
                                )
                              </span>
                            </div>
                          ) : null}
                        </div>

                        <div>
                          <Label htmlFor="f-markup-tipo">Tipo markup</Label>
                          <Select
                            value={markupTipo}
                            onValueChange={(v) =>
                              setMarkupTipo(v as MarkupTipo)
                            }
                          >
                            <SelectTrigger
                              id="f-markup-tipo"
                              className="max-w-xs"
                            >
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
                      label="IVA vendita"
                      value={
                        family.vat_rate === 0
                          ? "0% (estero / reverse charge)"
                          : `${family.vat_rate}%`
                      }
                    />
                    {prezzoBaseMode === "acquisto_markup" ? (
                      <Row
                        label="IVA acquisto"
                        value={
                          parseFloat(vatRateAcquisto) === 0
                            ? "0% (reverse charge)"
                            : `${parseFloat(vatRateAcquisto)}%`
                        }
                      />
                    ) : null}
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
