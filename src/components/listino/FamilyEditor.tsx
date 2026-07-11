/**
 * Preventivatore Verticalizzato Serramentisti — FASE 4.3
 *
 * Editor multi-step per una famiglia articoli (article_families). 5 step:
 *  1. Dati base (nome, categoria, descrizione, modalità prezzo, UM, IVA)
 *  2. Prezzo base + griglia L×H (solo se modalità=griglia)
 *  3. Assi di variazione (delegato a FamilyAxesEditor)
 *  4. Manodopera (ex "Posa") — tariffa, importo manuale o nessuna
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
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft,
  Check,
  Loader2,
  Save,
  CopyPlus,
  FolderTree,
  Upload,
  ImageIcon,
  ZoomIn,
  X,
  Wrench,
  Banknote,
  Ban,
  TrendingUp,
  TrendingDown,
  Info,
  Package,
  Link2,
  Link2Off,
  ListChecks,
  AlertTriangle,
  Plus,
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
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { FamilyAxesEditor } from "./FamilyAxesEditor";
import { FamilyGridEditor } from "./FamilyGridEditor";
import { PhotoTemplatePicker } from "./PhotoTemplatePicker";
import { firstGallerySlugFor } from "@/lib/verticalMapping";
import { FamilyPricePreview } from "./FamilyPricePreview";
import { MacroCategorieManager } from "./MacroCategorieManager";
import { ArticlePdfDocumentsSection } from "./ArticlePdfDocumentsSection";
import { DynamicFieldsRenderer, type DynamicFieldValues } from "./DynamicFieldsRenderer";
import type {
  ModalitaPrezzoBase,
  PrezzoBaseMode,
  MarkupTipo,
  ManodoperaModalita,
  ManodoperaUnita,
  FamilyWithAxes,
} from "@/types/articleFamily";
import type { ListinoMacrocategoria } from "@/hooks/useListinoMacrocategorie";
import type { ListinoCategoria } from "@/hooks/useListinoCategorie";
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

const MANODOPERA_MODALITA_CARDS: Array<{
  value: ManodoperaModalita;
  label: string;
  descrizione: string;
  icon: typeof Wrench;
}> = [
  {
    value: "tariffa",
    label: "Tariffa aziendale",
    descrizione:
      "Usa una tariffa dal listino manodopera (uomo/giorno, ponteggio...). Ideale se i costi sono standard per tipo di intervento.",
    icon: Wrench,
  },
  {
    value: "manuale",
    label: "Importo manuale",
    descrizione:
      "Fisso io costo di montaggio (pagato al subappaltatore) e prezzo di vendita. Ideale per tariffa a corpo specifica di questo articolo.",
    icon: Banknote,
  },
  {
    value: "nessuna",
    label: "Nessuna manodopera",
    descrizione:
      "L'articolo non prevede montaggio automatico. Il cliente riceve solo il prodotto.",
    icon: Ban,
  },
];

const MANODOPERA_UNITA_OPTIONS: Array<{
  value: ManodoperaUnita;
  label: string;
  hint: string;
}> = [
  { value: "pz", label: "a pezzo", hint: "1 = un intervento per unità prodotto" },
  { value: "ml", label: "al metro lineare", hint: "€ × ml di serramento" },
  { value: "mq", label: "al mq", hint: "€ × superficie serramento" },
  { value: "h", label: "all'ora", hint: "€ × ore di installazione" },
  { value: "a_corpo", label: "a corpo", hint: "forfait per l'intero articolo" },
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

function parseDecimalField(value: string, fallback = 0): number {
  let s = value.trim();
  if (s === "") return fallback;
  // M-30 (audit): formato italiano completo — quando c'è la virgola, i punti
  // sono separatori delle migliaia ("1.234,56"): senza lo strip il parse
  // falliva e l'utente vedeva "numero non valido" su un importo legittimo.
  if (s.includes(",")) s = s.replace(/\./g, "").replace(",", ".");
  const parsed = Number(s);
  return Number.isFinite(parsed) ? parsed : Number.NaN;
}

function assertFiniteRange(
  value: number,
  label: string,
  options: { min?: number; max?: number; allowZero?: boolean } = {},
) {
  const { min = 0, max, allowZero = true } = options;
  if (!Number.isFinite(value)) {
    throw new Error(`${label} deve essere un numero valido.`);
  }
  if (!allowZero && value === 0) {
    throw new Error(`${label} deve essere maggiore di zero.`);
  }
  if (value < min) {
    throw new Error(`${label} non può essere negativo.`);
  }
  if (max != null && value > max) {
    throw new Error(`${label} non può superare ${max}.`);
  }
}

export function FamilyEditor() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { effectiveCompany } = useAuth();
  const companyId = useEffectiveCompanyId();
  const queryClient = useQueryClient();
  const { createFamily, updateFamily, duplicateFamily } = useFamilyMutations();

  const isNew = !id || id === "nuova";
  const { family, isLoading: loadingFamily } = useFamily(isNew ? null : id);

  const [activeStep, setActiveStep] = useState("1");
  const [showCategorieManager, setShowCategorieManager] = useState(false);

  // ── Form state Step 1 ────────────────────────────────────────────────────
  const [nome, setNome] = useState("");
  // Codice articolo / SKU opzionale (migration 20271010000000). Ricercabile in
  // listino, picker commesse e magazzino. Trim → null in salvataggio.
  const [codice, setCodice] = useState("");
  // Fornitore associato (article_families.supplier_id). "none" = nessuno.
  const [supplierId, setSupplierId] = useState<string | "none">("none");
  const [macrocategoriaId, setMacrocategoriaId] = useState<string | "none">("none");
  const [descrizione, setDescrizione] = useState("");
  /**
   * URL pubblico dell'immagine articolo (bucket `article-images`).
   * NULL = usa placeholder grigio in UI (FamilyCatalog). Persistito in
   * `article_families.immagine_url`. Upload gestito via hook
   * useArticleImageUpload; salvataggio URL integrato nella mutation
   * createFamily/updateFamily insieme agli altri campi di Step 1.
   */
  const [immagineUrl, setImmagineUrl] = useState<string | null>(null);
  const [photoTemplatePickerOpen, setPhotoTemplatePickerOpen] = useState(false);
  // Lightbox: click sulla miniatura → immagine ingrandita.
  const [imageZoomOpen, setImageZoomOpen] = useState(false);
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

  // Step 4 — Manodopera (ex "Posa")
  // Modalità di gestione della manodopera: 'tariffa' usa tariffe_aziendali
  // (legacy), 'manuale' fissa costo+vendita direttamente qui, 'nessuna' non
  // auto-genera riga al preventivo. Migration 20260421000030.
  const [manodoperaModalita, setManodoperaModalita] =
    useState<ManodoperaModalita>("nessuna");
  const [posaTariffaId, setPosaTariffaId] = useState<string | "none">("none");
  const [posaQuantita, setPosaQuantita] = useState("1");
  // Sprint A §4.3 / Step 10 — flag posa legata. Se true (default), la riga posa
  // auto-generata dal preventivatore resta legata alla riga prodotto: DELETE
  // cascade + QUANTITY sync. Se false, la posa resta indipendente.
  const [posaLinked, setPosaLinked] = useState<boolean>(true);
  // Campi modalità manuale (ignorati se modalita != 'manuale'). Input utente
  // come stringhe per coerenza con gli altri campi numerici dell'editor.
  const [manodoperaCostoAcquisto, setManodoperaCostoAcquisto] = useState("0");
  const [manodoperaPrezzoVendita, setManodoperaPrezzoVendita] = useState("0");
  const [manodoperaUnita, setManodoperaUnita] = useState<ManodoperaUnita>("pz");

  // Scheda tecnica: valori dei campi tipizzati definiti su `listino_macrocategoria_fields`.
  // Salvati in JSONB `article_families.custom_field_values`. Le chiavi sono `field_key`.
  const [customFieldValues, setCustomFieldValues] = useState<DynamicFieldValues>({});

  // ── Dirty tracking per beforeunload guard ──────────────────────────────
  // Snapshot dello state al primo bootstrap. Confrontando con i field correnti
  // capiamo se ci sono modifiche non salvate (Step 1). Pulito ad ogni save.
  const initialSnapshotRef = useRef<string | null>(null);
  // M-N (audit): lo snapshot deve coprire TUTTI i campi persistiti da saveBase,
  // altrimenti modifiche a fornitore/markup/sconti/manodopera/griglia non
  // attivano la guardia "modifiche non salvate" e si perdono in silenzio.
  const currentSnapshot = useMemo(
    () => JSON.stringify({
      nome, codice, descrizione, immagineUrl, modalita, unitOfMeasure, vatRate, vatRateAcquisto,
      macrocategoriaId, prezzoVendita, prezzoAcquisto, customFieldValues,
      supplierId, grigliaXLabel, grigliaYLabel, prezzoBaseMode, markupTipo, markupValore,
      scontoFornitore1, scontoFornitore2, manodoperaModalita, posaTariffaId, posaQuantita,
      posaLinked, manodoperaCostoAcquisto, manodoperaPrezzoVendita, manodoperaUnita,
    }),
    [
      nome, codice, descrizione, immagineUrl, modalita, unitOfMeasure, vatRate, vatRateAcquisto,
      macrocategoriaId, prezzoVendita, prezzoAcquisto, customFieldValues,
      supplierId, grigliaXLabel, grigliaYLabel, prezzoBaseMode, markupTipo, markupValore,
      scontoFornitore1, scontoFornitore2, manodoperaModalita, posaTariffaId, posaQuantita,
      posaLinked, manodoperaCostoAcquisto, manodoperaPrezzoVendita, manodoperaUnita,
    ],
  );
  const isDirty =
    initialSnapshotRef.current !== null &&
    initialSnapshotRef.current !== currentSnapshot;

  // ── Query: macrocategorie + categorie + tariffe ────────────────────────
  const { macrocategorie } = useListinoMacrocategorie();
  const { categorie, isLoading: loadingCategorie } = useListinoCategorie();
  // Fornitori dell'azienda per associare il prodotto (article_families.supplier_id).
  const { data: fornitori = [] } = useQuery({
    queryKey: ["suppliers-select", companyId],
    enabled: !!companyId,
    queryFn: async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any)
        .from("suppliers").select("id, name")
        .eq("company_id", companyId).eq("is_active", true).order("name");
      if (error) throw error;
      return (data ?? []) as Array<{ id: string; name: string }>;
    },
  });

  // Bootstrap da family caricata.
  // M-O (audit): solo al primo caricamento di ogni family.id — i refetch della
  // stessa family (invalidation dopo salvataggio assi, upload foto, ecc.)
  // NON devono resettare il form, cancellerebbero le modifiche in corso.
  const bootstrappedFamilyIdRef = useRef<string | null>(null);
  useEffect(() => {
    if (family) {
      // Preferenza al FK diretto (post-refactor 20270513200000). Fallback al
      // vecchio path via categoria.macrocategoria_id per articoli pre-refactor.
      const macroFromCat = family.categoria_id
        ? categorie.find((c) => c.id === family.categoria_id)?.macrocategoria_id ?? null
        : null;
      if (bootstrappedFamilyIdRef.current === family.id) {
        // Family già bootstrappata: unica eccezione la macro derivata degli
        // articoli legacy, che al primo giro può essere rimasta "none" perché
        // `categorie` non era ancora caricata.
        if (!family.macrocategoria_id && macroFromCat) {
          setMacrocategoriaId((prev) => (prev === "none" ? macroFromCat : prev));
        }
        return;
      }
      bootstrappedFamilyIdRef.current = family.id;
      setNome(family.nome);
      setCodice(family.codice ?? "");
      setSupplierId((family as { supplier_id?: string | null }).supplier_id ?? "none");
      setMacrocategoriaId(family.macrocategoria_id ?? macroFromCat ?? "none");
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
      // Scheda tecnica: bootstrap valori da JSONB. Cast defensivo perché i types
      // generati potrebbero non avere `custom_field_values` finché non rigenerati.
      const fxCustom = family as unknown as { custom_field_values?: DynamicFieldValues | null };
      setCustomFieldValues(fxCustom.custom_field_values ?? {});
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
      // Nuovi campi manodopera (migration 20260421000030). Retrocompat:
      // righe pre-migration hanno modalita=null → deriviamo da posa_tariffa_default_id.
      const mp = family as unknown as {
        manodopera_modalita?: ManodoperaModalita | null;
        manodopera_costo_acquisto?: number | null;
        manodopera_prezzo_vendita?: number | null;
        manodopera_unita?: ManodoperaUnita | null;
      };
      setManodoperaModalita(
        mp.manodopera_modalita ??
          (family.posa_tariffa_default_id ? "tariffa" : "nessuna"),
      );
      setManodoperaCostoAcquisto(String(mp.manodopera_costo_acquisto ?? 0));
      setManodoperaPrezzoVendita(String(mp.manodopera_prezzo_vendita ?? 0));
      setManodoperaUnita(mp.manodopera_unita ?? "pz");
    }
  }, [family, categorie]);

  // Salviamo la snapshot iniziale al primo tick utile dopo il bootstrap, così
  // currentSnapshot != initialSnapshot solo dopo modifiche genuine dell'utente.
  // Per le creazioni "nuove" salviamo la snapshot vuota al mount.
  useEffect(() => {
    if (initialSnapshotRef.current !== null) return;
    // Articoli legacy: la macro deriva da `categorie` — aspettiamo che sia
    // caricata, altrimenti la snapshot congela macro="none" e il fixup tardivo
    // farebbe scattare un falso "modifiche non salvate".
    if (family?.categoria_id && !family.macrocategoria_id && loadingCategorie) return;
    if (isNew || family) {
      // Microtask per allinearsi all'avvenuto setState del bootstrap.
      const id = setTimeout(() => {
        initialSnapshotRef.current = currentSnapshot;
      }, 0);
      return () => clearTimeout(id);
    }
  }, [isNew, family, currentSnapshot, loadingCategorie]);

  // beforeunload guard: avvisa l'utente se sta chiudendo/refreshando con
  // modifiche non salvate (Step 1). Non blocca navigazioni dentro l'app
  // (gestite con conferma esplicita sui bottoni "Annulla").
  useEffect(() => {
    if (!isDirty) return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      // Stringa moderna: Chrome ignora il messaggio custom, ma il dialog appare.
      e.returnValue = "";
      return "";
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [isDirty]);

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
      // parseDecimalField, non parseFloat: "10,5" deve valere 10.5, non 10.
      // Questo valore viene PERSISTITO in prezzo_base_vendita al salvataggio.
      resolvePrezzoVendita({
        prezzoBaseMode,
        prezzoVenditaInput: parseDecimalField(prezzoVendita) || 0,
        prezzoAcquistoInput: parseDecimalField(prezzoAcquisto) || 0,
        markupTipo,
        markupValore: parseDecimalField(markupValore) || 0,
        scontoFornitore1: parseDecimalField(scontoFornitore1) || 0,
        scontoFornitore2: parseDecimalField(scontoFornitore2) || 0,
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
    const lordo = parseDecimalField(prezzoAcquisto) || 0;
    const s1 = parseDecimalField(scontoFornitore1) || 0;
    const s2 = parseDecimalField(scontoFornitore2) || 0;
    return s1 > 0 || s2 > 0 ? applyScontiFornitore(lordo, s1, s2) : lordo;
  }, [prezzoBaseMode, prezzoAcquisto, scontoFornitore1, scontoFornitore2]);

  const scontiAttivi =
    (parseDecimalField(scontoFornitore1) || 0) > 0 ||
    (parseDecimalField(scontoFornitore2) || 0) > 0;

  const markupPreview = useMemo(() => {
    if (prezzoBaseMode !== "acquisto_markup") return null;
    // Il markup si applica sull'acquisto NETTO (post sconti), non sul lordo.
    return applyMarkup({
      prezzoAcquisto: acquistoNetto,
      markupTipo,
      markupValore: parseDecimalField(markupValore) || 0,
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

  /**
   * Applica una foto scelta dalla galleria template all'articolo.
   * A differenza dell'upload, NON copia il file ma referenzia l'URL pubblico
   * del bucket condiviso (article-photo-templates). Vantaggi:
   *   - Zero storage costo per la company
   *   - Foto sempre aggiornata se il super_admin la migliora
   *   - L'utente puo' sempre sovrascrivere con un upload proprio.
   * Se la family non e' ancora persistita, prima la salva (stesso pattern
   * del handleImageUpload) e poi applica l'URL.
   */
  const handlePhotoTemplateSelect = async (photo: { image_url: string; nome: string }) => {
    // NB: NON aggiorniamo `immagineUrl` prima del save: se saveBase fallisce,
    // l'utente vedrebbe l'immagine selezionata ma non persistita (UI bugiarda).
    // Update locale SOLO dopo conferma della mutation server-side.
    if (!family?.id) {
      // Articolo nuovo: salviamo per ottenere un id, poi persistiamo l'URL.
      const savedId = await saveBase();
      if (!savedId) {
        toast.error("Salva prima l'articolo (Step 1) per assegnare la foto");
        return;
      }
      try {
        await updateFamily.mutateAsync({
          id: savedId,
          patch: { immagine_url: photo.image_url },
        });
        setImmagineUrl(photo.image_url);
        toast.success(`Foto "${photo.nome}" applicata`);
      } catch (err) {
        toast.error("Errore salvataggio foto", {
          description: err instanceof Error ? err.message : "Errore sconosciuto",
        });
      }
      return;
    }
    try {
      await updateFamily.mutateAsync({
        id: family.id,
        patch: { immagine_url: photo.image_url },
      });
      setImmagineUrl(photo.image_url);
      toast.success(`Foto "${photo.nome}" applicata`);
    } catch (err) {
      toast.error("Errore salvataggio foto", {
        description: err instanceof Error ? err.message : "Errore sconosciuto",
      });
    }
  };

  // ── Salvataggio Step 1 (crea/aggiorna dati base) ───────────────────────
  const saveBase = async (): Promise<string | null> => {
    if (!nome.trim()) {
      toast.error("Serve un nome", {
        description: "Inserisci il nome dell'articolo prima di salvare.",
      });
      return null;
    }

    const vertical =
      (effectiveCompany as { vertical?: string } | null)?.vertical ?? "generico";
    let vat_rate: number;
    let vat_rate_acquisto: number;
    let prezzoAcquistoNum: number;
    let prezzoVenditaNum: number;
    let markupValoreNum: number;
    let scontoFornitore1Num: number;
    let scontoFornitore2Num: number;
    let posaQuantitaNum: number;
    let manodoperaCostoAcquistoNum: number;
    let manodoperaPrezzoVenditaNum: number;

    try {
      // IVA: accetta 0 (estero/reverse charge), ma blocca NaN e valori fuori
      // range. Prima il salvataggio trasformava input non validi in 22/0.
      vat_rate = parseDecimalField(vatRate, 22);
      assertFiniteRange(vat_rate, "IVA vendita", { min: 0, max: 100 });

      const parsedVatAcq = parseDecimalField(vatRateAcquisto, vat_rate);
      vat_rate_acquisto =
        prezzoBaseMode === "acquisto_markup" ? parsedVatAcq : vat_rate;
      assertFiniteRange(vat_rate_acquisto, "IVA acquisto", {
        min: 0,
        max: 100,
      });

      prezzoAcquistoNum = parseDecimalField(prezzoAcquisto, 0);
      assertFiniteRange(prezzoAcquistoNum, "Prezzo di acquisto", { min: 0 });

      const prezzoVenditaInput = parseDecimalField(prezzoVendita, 0);
      assertFiniteRange(prezzoVenditaInput, "Prezzo di vendita", { min: 0 });

      markupValoreNum = parseDecimalField(markupValore, 0);
      assertFiniteRange(markupValoreNum, "Markup", { min: 0 });

      scontoFornitore1Num = parseDecimalField(scontoFornitore1, 0);
      scontoFornitore2Num = parseDecimalField(scontoFornitore2, 0);
      assertFiniteRange(scontoFornitore1Num, "Sconto fornitore 1", {
        min: 0,
        max: 100,
      });
      assertFiniteRange(scontoFornitore2Num, "Sconto fornitore 2", {
        min: 0,
        max: 100,
      });

      // M-29 (audit): la quantità posa conta solo in modalità 'tariffa' con
      // posa collegata — fuori da quel caso un residuo 0/non valido bloccava
      // il salvataggio con un errore su un campo nascosto all'utente.
      // Quando non rilevante viene riportata al default 1 senza bloccare.
      posaQuantitaNum = parseDecimalField(posaQuantita, 1);
      if (manodoperaModalita === "tariffa" && posaLinked) {
        assertFiniteRange(posaQuantitaNum, "Quantità manodopera", {
          min: 0,
          allowZero: false,
        });
      } else if (!Number.isFinite(posaQuantitaNum) || posaQuantitaNum <= 0) {
        posaQuantitaNum = 1;
      }

      manodoperaCostoAcquistoNum = parseDecimalField(
        manodoperaCostoAcquisto,
        0,
      );
      manodoperaPrezzoVenditaNum = parseDecimalField(
        manodoperaPrezzoVendita,
        0,
      );
      assertFiniteRange(
        manodoperaCostoAcquistoNum,
        "Costo manodopera",
        { min: 0 },
      );
      assertFiniteRange(
        manodoperaPrezzoVenditaNum,
        "Prezzo vendita manodopera",
        { min: 0 },
      );

      prezzoVenditaNum =
        prezzoBaseMode === "acquisto_markup"
          ? prezzoVenditaCalcolato // cache derivata, tenuta allineata al markup
          : prezzoVenditaInput;
      assertFiniteRange(prezzoVenditaNum, "Prezzo di vendita calcolato", {
        min: 0,
      });
    } catch (err) {
      toast.error("Dati economici non validi", {
        description:
          err instanceof Error
            ? err.message
            : "Controlla prezzi, IVA, sconti e manodopera.",
      });
      return null;
    }

    // M-V (audit): per gli articoli legacy (solo categoria_id valorizzato) la
    // macro nel form deriva dalla query `categorie`: salvare prima che sia
    // risolta scriverebbe macrocategoria_id null + categoria_id null,
    // cancellando ogni categorizzazione. In quel caso i due campi restano
    // fuori dal payload e l'update non li tocca.
    const categorizzazionePronta = !family?.categoria_id || !loadingCategorie;

    const payload = {
      nome: nome.trim(),
      // Codice articolo / SKU (opzionale, user-managed). Trim → null.
      codice: codice.trim() || null,
      // Fornitore associato (correlazione listino↔fornitori).
      supplier_id: supplierId === "none" ? null : supplierId,
      // Refactor 20270513200000: scriviamo direttamente macrocategoria_id;
      // categoria_id resta esposto sui tipi ma settato a NULL su tutte le
      // nuove creazioni (la colonna DB verrà droppata in migration futura).
      ...(categorizzazionePronta
        ? {
            macrocategoria_id:
              macrocategoriaId === "none" ? null : macrocategoriaId,
            categoria_id: null,
          }
        : {}),
      descrizione: descrizione.trim() || null,
      modalita_prezzo_base: modalita,
      unit_of_measure: unitOfMeasure,
      vat_rate,
      // M-W (audit): in modalità vendita il campo IVA acquisto non è esposto
      // nel form — riscriverlo con vat_rate perdeva il valore configurato in
      // acquisto_markup. In update lo tocchiamo solo quando è visibile; in
      // creazione lo scriviamo comunque (colonna NOT NULL DEFAULT 22).
      ...(prezzoBaseMode === "acquisto_markup" || isNew
        ? { vat_rate_acquisto }
        : {}),
      griglia_asse_x_label: grigliaXLabel,
      griglia_asse_y_label: grigliaYLabel,
      prezzo_base_mode: prezzoBaseMode,
      prezzo_base_vendita: prezzoVenditaNum,
      prezzo_base_acquisto: prezzoAcquistoNum,
      markup_tipo: markupTipo,
      markup_valore: markupValoreNum,
      // Sconti fornitore in cascata (migration 20260421000006). Persistiamo
      // sempre: anche in mode=vendita resta 0/0 (default DB) senza effetto.
      sconto_fornitore_1: scontoFornitore1Num,
      sconto_fornitore_2: scontoFornitore2Num,
      immagine_url: immagineUrl,
      // Manodopera: in modalità 'tariffa' salviamo il legacy link, in 'manuale'
      // gli importi diretti. Gli importi manuali E la tariffa collegata restano
      // in DB anche fuori dalla loro modalità per non perdere la scelta se
      // l'utente fa avanti e indietro (M-X audit): i consumer (pricing.ts,
      // FamilyConfigurator) applicano la posa solo con modalita === 'tariffa',
      // quindi la FK fuori modalità è inerte.
      posa_tariffa_default_id: posaTariffaId !== "none" ? posaTariffaId : null,
      posa_quantita_default: posaQuantitaNum,
      posa_linked: posaLinked,
      manodopera_modalita: manodoperaModalita,
      manodopera_costo_acquisto: manodoperaCostoAcquistoNum,
      manodopera_prezzo_vendita: manodoperaPrezzoVenditaNum,
      manodopera_unita: manodoperaUnita,
      // Scheda tecnica (campi dinamici della macrocategoria). Salvato come JSONB.
      custom_field_values: customFieldValues,
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
        });
        toast.success("Articolo creato");
        // Snapshot post-save: niente beforeunload finché l'utente non modifica di nuovo.
        initialSnapshotRef.current = currentSnapshot;
        // Redirect a /:id per continuare editing
        navigate(`/azienda/impostazioni/listino/famiglie/${created.id}`, {
          replace: true,
        });
        return created.id;
      } else if (family) {
        await updateFamily.mutateAsync({ id: family.id, patch: payload });
        toast.success("Articolo aggiornato");
        initialSnapshotRef.current = currentSnapshot;
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

  // M-31 (audit): il beforeunload copre solo l'unload del browser, non la
  // navigazione SPA — il ritorno al catalogo usciva senza conferma anche con
  // modifiche non salvate.
  const handleBackToCatalog = () => {
    if (
      isDirty &&
      !window.confirm("Hai modifiche non salvate. Uscire senza salvare?")
    ) {
      return;
    }
    navigate("/azienda/impostazioni/listino/famiglie");
  };

  // Duplica
  const handleDuplicate = async () => {
    if (!family) return;
    try {
      // M-Y (audit): il bottone promette "Salva e crea copia" ma duplicava lo
      // stato DB, perdendo le modifiche del form non ancora salvate. Salviamo
      // prima, così la copia parte dai dati che l'utente vede.
      if (isDirty) {
        if (!canSaveBase) {
          toast.error("Inserisci il nome dell'articolo prima di duplicare");
          return;
        }
        const savedId = await saveBase();
        if (!savedId) return; // errore già notificato da saveBase
      }
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
          <Button variant="ghost" size="sm" onClick={handleBackToCatalog}>
            <ArrowLeft className="h-4 w-4 mr-1" aria-hidden="true" />
            Articoli
          </Button>
          <div className="min-w-0">
            <h1 className="text-xl font-semibold truncate flex items-center gap-2">
              {isNew ? "Nuovo articolo" : family?.nome}
              {isDirty && (
                <span
                  className="inline-flex items-center gap-1 text-[11px] font-normal text-amber-700 dark:text-amber-400"
                  title="Hai modifiche non salvate"
                >
                  <span className="h-1.5 w-1.5 rounded-full bg-amber-500 animate-pulse" />
                  Non salvato
                </span>
              )}
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
              <TabsTrigger value="3" disabled={isNew}>3. Variabili</TabsTrigger>
              <TabsTrigger value="4" disabled={isNew}>4. Manodopera</TabsTrigger>
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

                  <div>
                    <Label htmlFor="f-codice">Codice articolo (SKU)</Label>
                    <Input
                      id="f-codice"
                      value={codice}
                      onChange={(e) => setCodice(e.target.value)}
                      placeholder="es. TIGO-TS4-700 (opzionale)"
                    />
                    <p className="text-xs text-muted-foreground mt-1">
                      Codice interno o fornitore. Ricercabile in listino, commesse e
                      magazzino oltre al nome.
                    </p>
                  </div>

                  <div>
                    <Label htmlFor="f-fornitore">Fornitore</Label>
                    <Select value={supplierId} onValueChange={(v) => setSupplierId(v as string | "none")}>
                      <SelectTrigger id="f-fornitore">
                        <SelectValue placeholder="Nessun fornitore" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">Nessun fornitore</SelectItem>
                        {fornitori.map((f) => (
                          <SelectItem key={f.id} value={f.id}>{f.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <p className="text-xs text-muted-foreground mt-1">
                      Da chi acquisti questo prodotto. Lo ritrovi nel fornitore tra i
                      prodotti collegati e nel preventivo/commessa.
                    </p>
                  </div>

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
                          <button
                            type="button"
                            onClick={() => setImageZoomOpen(true)}
                            className="group relative h-full w-full cursor-zoom-in"
                            title="Ingrandisci immagine"
                            aria-label="Ingrandisci immagine articolo"
                          >
                            <img loading="lazy"
                              src={immagineUrl}
                              alt={`Preview ${nome || "articolo"}`}
                              className="h-full w-full object-cover"
                            />
                            <span className="absolute inset-0 flex items-center justify-center bg-black/0 opacity-0 transition group-hover:bg-black/40 group-hover:opacity-100">
                              <ZoomIn className="h-6 w-6 text-white" aria-hidden="true" />
                            </span>
                          </button>
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
                        {/* Galleria template: alternativa rapida all'upload.
                            L'azienda sceglie una foto curata dal team EIC
                            invece di caricare un proprio file. */}
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="h-9 border-orange-300 text-orange-700 hover:bg-orange-50"
                          disabled={isUploading || isRemoving}
                          onClick={() => setPhotoTemplatePickerOpen(true)}
                          aria-label="Scegli foto dalla galleria template"
                        >
                          <ImageIcon className="h-4 w-4 mr-2" aria-hidden="true" />
                          Scegli da galleria
                        </Button>
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

                  {/* Schede tecniche / documenti PDF — la colonna pdf_scheda_url
                      esisteva ma non era esposta; ora multi-documento via tabella
                      dedicata (article_family_documents). */}
                  <ArticlePdfDocumentsSection
                    companyId={companyId}
                    familyId={family?.id ?? null}
                    ensureFamilyId={saveBase}
                  />

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
                        {parseDecimalField(vatRate, 22) === 0
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

              {/* Scheda tecnica — campi dinamici della macrocategoria.
                  Il renderer mostra automaticamente il form se la macro ha uno
                  schema definito (`listino_macrocategoria_fields`), altrimenti
                  un hint che invita a configurare i campi in Impostazioni. */}
              {macrocategoriaId !== "none" && (
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">Scheda tecnica</CardTitle>
                    <p className="text-xs text-muted-foreground">
                      Caratteristiche specifiche del prodotto (vetro, Uw, potenza, materiale…).
                      I campi sono definiti dalla macrocategoria; vengono mostrati al
                      commerciale nel picker e stampati nel PDF preventivo.
                    </p>
                  </CardHeader>
                  <CardContent>
                    <DynamicFieldsRenderer
                      macroId={macrocategoriaId}
                      values={customFieldValues}
                      onChange={setCustomFieldValues}
                      mode="edit"
                    />
                  </CardContent>
                </Card>
              )}


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
                            {(parseDecimalField(scontoFornitore1) || 0) > 0
                              ? `(1 − ${parseDecimalField(scontoFornitore1)}%)`
                              : "1"}{" "}
                            ×{" "}
                            {(parseDecimalField(scontoFornitore2) || 0) > 0
                              ? `(1 − ${parseDecimalField(scontoFornitore2)}%)`
                              : "1"}{" "}
                            ×{" "}
                            {markupTipo === "percentuale"
                              ? `(1 + ${parseDecimalField(markupValore) || 0}%)`
                              : markupTipo === "fisso_pz"
                                ? `(+ ${formatCurrency(parseDecimalField(markupValore) || 0)} fissi/pz)`
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
                    scontoFornitore1={parseDecimalField(scontoFornitore1) || 0}
                    scontoFornitore2={parseDecimalField(scontoFornitore2) || 0}
                    markupTipo={markupTipo}
                    markupValore={parseDecimalField(markupValore) || 0}
                    onEnsureFamilySaved={async () => {
                      // M-10 (audit): allinea i parametri famiglia in DB prima
                      // del salvataggio griglia (le celle sono calcolate con
                      // questi valori di form).
                      if (!isDirty) return true;
                      if (!canSaveBase) {
                        toast.error(
                          "Inserisci il nome dell'articolo prima di salvare la griglia",
                        );
                        return false;
                      }
                      return (await saveBase()) !== null;
                    }}
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
                              {parseDecimalField(vatRateAcquisto, 22) === 0
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
                                ({formatCurrency(parseDecimalField(prezzoAcquisto) || 0)}
                                {(parseDecimalField(scontoFornitore1) || 0) > 0
                                  ? ` × (1 − ${parseDecimalField(scontoFornitore1)}%)`
                                  : ""}
                                {(parseDecimalField(scontoFornitore2) || 0) > 0
                                  ? ` × (1 − ${parseDecimalField(scontoFornitore2)}%)`
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

            {/* STEP 4 — Manodopera (ex "Posa") */}
            <TabsContent value="4" className="space-y-4 mt-4">
              <ManodoperaSection
                modalita={manodoperaModalita}
                onModalitaChange={setManodoperaModalita}
                tariffaId={posaTariffaId}
                onTariffaChange={setPosaTariffaId}
                tariffe={tariffe}
                quantita={posaQuantita}
                onQuantitaChange={setPosaQuantita}
                linked={posaLinked}
                onLinkedChange={setPosaLinked}
                costoAcquisto={manodoperaCostoAcquisto}
                onCostoAcquistoChange={setManodoperaCostoAcquisto}
                prezzoVendita={manodoperaPrezzoVendita}
                onPrezzoVenditaChange={setManodoperaPrezzoVendita}
                unita={manodoperaUnita}
                onUnitaChange={setManodoperaUnita}
                onSave={saveBase}
                saving={saving}
                companyId={companyId}
                onTariffeRefresh={() =>
                  queryClient.invalidateQueries({ queryKey: ["tariffe-for-editor", companyId] })
                }
              />
            </TabsContent>

            {/* STEP 5 — Riepilogo */}
            <TabsContent value="5" className="space-y-4 mt-4">
              {family ? (
                <RiepilogoSection
                  family={family}
                  categorie={categorie}
                  macrocategorie={macrocategorie}
                  tariffe={tariffe}
                  prezzoBaseMode={prezzoBaseMode}
                  prezzoVendita={prezzoVendita}
                  prezzoAcquisto={prezzoAcquisto}
                  acquistoNetto={acquistoNetto}
                  scontoFornitore1={scontoFornitore1}
                  scontoFornitore2={scontoFornitore2}
                  markupTipo={markupTipo}
                  markupValore={markupValore}
                  prezzoVenditaCalcolato={prezzoVenditaCalcolato}
                  vatRateAcquisto={vatRateAcquisto}
                  manodoperaModalita={manodoperaModalita}
                  manodoperaCostoAcquisto={manodoperaCostoAcquisto}
                  manodoperaPrezzoVendita={manodoperaPrezzoVendita}
                  manodoperaUnita={manodoperaUnita}
                  posaLinked={posaLinked}
                  immagineUrl={immagineUrl}
                  onGotoStep={setActiveStep}
                  onBackToCatalog={handleBackToCatalog}
                  onDuplicate={handleDuplicate}
                  duplicating={duplicateFamily.isPending}
                />
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
                Salva i dati base per iniziare a configurare variabili, griglia prezzi e vedere la preview live.
              </CardContent>
            </Card>
          )}
        </div>
      </div>

      {/* Lightbox: immagine articolo ingrandita (click sulla miniatura) */}
      <Dialog open={imageZoomOpen} onOpenChange={setImageZoomOpen}>
        <DialogContent className="max-w-3xl p-2 sm:p-4">
          <DialogHeader className="sr-only">
            <DialogTitle>Immagine articolo</DialogTitle>
            <DialogDescription>{nome || "Anteprima immagine articolo"}</DialogDescription>
          </DialogHeader>
          {immagineUrl && (
            <img
              src={immagineUrl}
              alt={`Immagine ${nome || "articolo"}`}
              className="w-full max-h-[80vh] rounded-md object-contain"
            />
          )}
        </DialogContent>
      </Dialog>

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

      {/* Galleria foto template — alternativa rapida all'upload manuale.
          Pre-filtra il picker sul primo verticale abilitato della macro
          dell'articolo (es. macro Serramenti → galleria solo Serramenti).
          Mappatura centralizzata in @/lib/verticalMapping. */}
      <PhotoTemplatePicker
        open={photoTemplatePickerOpen}
        onOpenChange={setPhotoTemplatePickerOpen}
        initialVertical={firstGallerySlugFor(
          macrocategorie.find((m) => m.id === macrocategoriaId)?.verticali_abilitati,
        )}
        onSelect={(photo) => void handlePhotoTemplateSelect(photo)}
      />
    </div>
  );
}

// ── STEP 4: Manodopera (ex "Posa") ─────────────────────────────────────────
//
// Estratta in componente proprio per leggibilità: la logica ha tre branch
// (tariffa / manuale / nessuna) + preview margine live in modalità manuale.
// La Preview mostra ((vendita - costo) / vendita × 100) e un indicatore
// colorato così l'utente capisce subito se sta vendendo in perdita.
interface ManodoperaSectionProps {
  modalita: ManodoperaModalita;
  onModalitaChange: (v: ManodoperaModalita) => void;
  tariffaId: string | "none";
  onTariffaChange: (v: string | "none") => void;
  tariffe: Tariffa[];
  quantita: string;
  onQuantitaChange: (v: string) => void;
  linked: boolean;
  onLinkedChange: (v: boolean) => void;
  costoAcquisto: string;
  onCostoAcquistoChange: (v: string) => void;
  prezzoVendita: string;
  onPrezzoVenditaChange: (v: string) => void;
  unita: ManodoperaUnita;
  onUnitaChange: (v: ManodoperaUnita) => void;
  onSave: () => Promise<string | null>;
  saving: boolean;
  /** companyId per inline-create tariffa via supabase + invalidate query. */
  companyId: string | null | undefined;
  /** Callback per ricaricare la lista tariffe dopo inline-create. */
  onTariffeRefresh: () => void;
}

function ManodoperaSection(props: ManodoperaSectionProps) {
  const {
    modalita,
    onModalitaChange,
    tariffaId,
    onTariffaChange,
    tariffe,
    quantita,
    onQuantitaChange,
    linked,
    onLinkedChange,
    costoAcquisto,
    onCostoAcquistoChange,
    prezzoVendita,
    onPrezzoVenditaChange,
    unita,
    onUnitaChange,
    onSave,
    saving,
    companyId,
    onTariffeRefresh,
  } = props;
  const [inlineCreateOpen, setInlineCreateOpen] = useState(false);

  // ── Preview margine (modalità manuale) ──────────────────────────────────
  const costoNum = parseDecimalField(costoAcquisto) || 0;
  const venditaNum = parseDecimalField(prezzoVendita) || 0;
  const margineEuro = venditaNum - costoNum;
  // Margine % calcolato sulla vendita (standard CFO italiano), non sul costo.
  const marginePct = venditaNum > 0 ? (margineEuro / venditaNum) * 100 : 0;
  const margineColor =
    margineEuro < 0
      ? "text-red-600"
      : margineEuro === 0
        ? "text-muted-foreground"
        : marginePct < 20
          ? "text-amber-600"
          : "text-emerald-600";
  const MargineIcon =
    margineEuro < 0 ? TrendingDown : margineEuro > 0 ? TrendingUp : Info;
  const unitaLabel =
    MANODOPERA_UNITA_OPTIONS.find((u) => u.value === unita)?.label ?? unita;

  // Preview tariffa selezionata: mostra margine atteso come se fosse manuale
  const tariffaSelezionata = tariffe.find((t) => t.id === tariffaId);

  return (
    <Card>
      <CardHeader>
        <div className="flex items-start gap-2">
          <div className="h-9 w-9 rounded-md bg-primary/10 text-primary flex items-center justify-center flex-shrink-0">
            <Wrench className="h-4 w-4" aria-hidden="true" />
          </div>
          <div className="flex-1 min-w-0">
            <CardTitle className="text-base">Manodopera</CardTitle>
            <p className="text-sm text-muted-foreground mt-0.5">
              Montaggio/posa automatico quando un cliente aggiunge questo
              articolo al preventivo. Puoi scegliere una tariffa aziendale
              standard, impostare costi a corpo specifici per l'articolo, o
              nessuna manodopera.
            </p>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-5">
        {/* 1. Modalità: 3 card cliccabili ─────────────────────────────── */}
        <div>
          <Label className="mb-2 block">Modalità</Label>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
            {MANODOPERA_MODALITA_CARDS.map((m) => {
              const Icon = m.icon;
              const selected = modalita === m.value;
              return (
                <button
                  key={m.value}
                  type="button"
                  onClick={() => onModalitaChange(m.value)}
                  className={`text-left p-3 border rounded-md transition-all ${
                    selected
                      ? "border-primary ring-2 ring-primary/20 bg-primary/5"
                      : "hover:border-primary/50"
                  }`}
                  aria-pressed={selected}
                >
                  <div className="flex items-center gap-2 mb-1">
                    <Icon
                      className={`h-4 w-4 ${
                        selected ? "text-primary" : "text-muted-foreground"
                      }`}
                      aria-hidden="true"
                    />
                    <span className="font-medium text-sm">{m.label}</span>
                  </div>
                  <p className="text-xs text-muted-foreground leading-snug">
                    {m.descrizione}
                  </p>
                </button>
              );
            })}
          </div>
        </div>

        {/* 2. Branch: TARIFFA AZIENDALE ──────────────────────────────── */}
        {modalita === "tariffa" && (
          <div className="space-y-3">
            <div>
              <div className="flex items-center justify-between mb-1">
                <Label htmlFor="f-posa-tariffa">Tariffa manodopera</Label>
                {/* Bottone inline per creare al volo una nuova tariffa
                    aziendale senza uscire dal flusso editor. Apre Dialog,
                    salva su tariffe_aziendali, auto-selezione del nuovo id.
                    Evita doppia navigazione Impostazioni → torna qui. */}
                {companyId && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-7 text-[11px] gap-1 text-orange-600 hover:text-orange-700 hover:bg-orange-50"
                    onClick={() => setInlineCreateOpen(true)}
                  >
                    <Plus className="h-3 w-3" /> Nuova tariffa
                  </Button>
                )}
              </div>
              <Select value={tariffaId} onValueChange={onTariffaChange}>
                <SelectTrigger id="f-posa-tariffa">
                  <SelectValue placeholder="Seleziona tariffa" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">— Seleziona tariffa —</SelectItem>
                  {tariffe.map((t) => (
                    <SelectItem key={t.id} value={t.id}>
                      {t.nome}
                      <span className="text-muted-foreground ml-2">
                        {t.tipo}
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {tariffe.length === 0 ? (
                <p className="text-xs text-amber-600 mt-1 flex items-center gap-1">
                  <AlertTriangle className="h-3 w-3" aria-hidden="true" />
                  Nessuna tariffa configurata. Click su <strong>"Nuova tariffa"</strong> sopra per crearne una, o usa "Importo manuale".
                </p>
              ) : tariffaId === "none" ? (
                <p className="text-xs text-muted-foreground mt-1">
                  Nessuna tariffa selezionata. L'articolo non avrà manodopera
                  automatica.
                </p>
              ) : tariffaSelezionata ? (
                <p className="text-xs text-muted-foreground mt-1">
                  Tariffa "{tariffaSelezionata.nome}" selezionata. I costi sono
                  definiti nella tariffa stessa.
                </p>
              ) : null}
              {/* Dialog inline-create — salva direttamente in tariffe_aziendali
                  e callback con il nuovo id per auto-selezione. */}
              {companyId && (
                <InlineCreateTariffaDialog
                  open={inlineCreateOpen}
                  onOpenChange={setInlineCreateOpen}
                  companyId={companyId}
                  onCreated={(newId) => {
                    onTariffeRefresh();
                    onTariffaChange(newId);
                  }}
                />
              )}
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <Label htmlFor="f-posa-quantita">Quantità default</Label>
                <Input
                  id="f-posa-quantita"
                  type="number"
                  step="0.01"
                  min="0"
                  value={quantita}
                  onChange={(e) => onQuantitaChange(e.target.value)}
                />
                <p className="text-xs text-muted-foreground mt-1">
                  Moltiplicatore per la quantità prodotto al preventivo.
                </p>
              </div>
            </div>
            <LinkedToggle
              linked={linked}
              onChange={onLinkedChange}
              disabled={tariffaId === "none"}
            />
          </div>
        )}

        {/* 3. Branch: IMPORTO MANUALE ───────────────────────────────── */}
        {modalita === "manuale" && (
          <div className="space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <Label htmlFor="f-mo-costo">
                  Costo di montaggio (€){" "}
                  <span className="text-xs text-muted-foreground font-normal">
                    pagato al subappaltatore
                  </span>
                </Label>
                <Input
                  id="f-mo-costo"
                  type="number"
                  step="0.01"
                  min="0"
                  value={costoAcquisto}
                  onChange={(e) => onCostoAcquistoChange(e.target.value)}
                />
                <p className="text-xs text-muted-foreground mt-1">
                  Quanto paghi al montatore/subappaltatore. Solo CFO/admin
                  vedono questo costo, mai il cliente.
                </p>
              </div>
              <div>
                <Label htmlFor="f-mo-vendita">
                  Prezzo di vendita (€){" "}
                  <span className="text-xs text-muted-foreground font-normal">
                    listino cliente
                  </span>
                </Label>
                <Input
                  id="f-mo-vendita"
                  type="number"
                  step="0.01"
                  min="0"
                  value={prezzoVendita}
                  onChange={(e) => onPrezzoVenditaChange(e.target.value)}
                />
                <p className="text-xs text-muted-foreground mt-1">
                  Quanto addebiti in preventivo al cliente.
                </p>
              </div>
            </div>

            {/* Preview margine live */}
            {(costoNum > 0 || venditaNum > 0) && (
              <div
                className={`rounded-md border p-3 ${
                  margineEuro < 0
                    ? "bg-red-50 border-red-200"
                    : marginePct >= 20
                      ? "bg-emerald-50 border-emerald-200"
                      : "bg-muted/30"
                }`}
              >
                <div className="flex items-center gap-2 mb-1">
                  <MargineIcon
                    className={`h-4 w-4 ${margineColor}`}
                    aria-hidden="true"
                  />
                  <span className="text-sm font-medium">
                    Margine previsto
                  </span>
                </div>
                <div className="grid grid-cols-3 gap-3 text-sm">
                  <div>
                    <div className="text-xs text-muted-foreground">Costo</div>
                    <div className="font-medium">
                      {formatCurrency(costoNum)}/{unitaLabel}
                    </div>
                  </div>
                  <div>
                    <div className="text-xs text-muted-foreground">Vendita</div>
                    <div className="font-medium">
                      {formatCurrency(venditaNum)}/{unitaLabel}
                    </div>
                  </div>
                  <div>
                    <div className="text-xs text-muted-foreground">Margine</div>
                    <div className={`font-bold ${margineColor}`}>
                      {formatCurrency(margineEuro)}
                      {venditaNum > 0 ? ` (${marginePct.toFixed(1)}%)` : ""}
                    </div>
                  </div>
                </div>
                {margineEuro < 0 ? (
                  <p className="text-xs text-red-600 mt-2 flex items-center gap-1">
                    <AlertTriangle className="h-3 w-3" aria-hidden="true" />
                    Stai vendendo SOTTO COSTO. Controlla i numeri prima di
                    salvare.
                  </p>
                ) : marginePct < 10 && venditaNum > 0 ? (
                  <p className="text-xs text-amber-600 mt-2 flex items-center gap-1">
                    <AlertTriangle className="h-3 w-3" aria-hidden="true" />
                    Margine molto basso (&lt; 10%). Verifica che copra davvero i
                    costi accessori (trasferte, attrezzi, imprevisti).
                  </p>
                ) : null}
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <Label htmlFor="f-mo-unita">Unità di misura</Label>
                <Select
                  value={unita}
                  onValueChange={(v) => onUnitaChange(v as ManodoperaUnita)}
                >
                  <SelectTrigger id="f-mo-unita">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {MANODOPERA_UNITA_OPTIONS.map((u) => (
                      <SelectItem key={u.value} value={u.value}>
                        {u.label}{" "}
                        <span className="text-muted-foreground ml-1">
                          — {u.hint}
                        </span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label htmlFor="f-mo-quantita">Quantità default</Label>
                <Input
                  id="f-mo-quantita"
                  type="number"
                  step="0.01"
                  min="0"
                  value={quantita}
                  onChange={(e) => onQuantitaChange(e.target.value)}
                />
                <p className="text-xs text-muted-foreground mt-1">
                  Es. 1 = un intervento, oppure n° h, ml, mq per unità prodotto.
                </p>
              </div>
            </div>

            <LinkedToggle linked={linked} onChange={onLinkedChange} />
          </div>
        )}

        {/* 4. Branch: NESSUNA ───────────────────────────────────────── */}
        {modalita === "nessuna" && (
          <div className="rounded-md border bg-muted/30 p-4 flex gap-3 items-start">
            <Ban
              className="h-5 w-5 text-muted-foreground flex-shrink-0 mt-0.5"
              aria-hidden="true"
            />
            <div className="text-sm">
              <p className="font-medium">Nessuna manodopera automatica</p>
              <p className="text-muted-foreground mt-1">
                Quando il cliente aggiunge questo articolo al preventivo,{" "}
                <span className="font-medium">
                  non verrà creata nessuna riga di montaggio
                </span>
                . Puoi sempre aggiungere una voce manodopera manualmente dal
                preventivatore se serve.
              </p>
            </div>
          </div>
        )}

        {/* 5. Salva ─────────────────────────────────────────────────── */}
        <div className="flex justify-end pt-2 border-t">
          <Button onClick={onSave} disabled={saving}>
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
                Salva manodopera
              </>
            )}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

// ── STEP 5: Riepilogo ──────────────────────────────────────────────────────
//
// Riepilogo visivo a card: invece di una lista piatta label/valore, l'utente
// vede 4 card tematiche (Anagrafica, Prezzo, Manodopera, Assi) con azioni
// rapide "Modifica" che riportano allo step corrispondente. Meglio per code
// review visuale + UX prima del salvataggio finale.
interface RiepilogoSectionProps {
  family: FamilyWithAxes;
  categorie: ListinoCategoria[];
  macrocategorie: ListinoMacrocategoria[];
  tariffe: Tariffa[];
  prezzoBaseMode: PrezzoBaseMode;
  prezzoVendita: string;
  prezzoAcquisto: string;
  acquistoNetto: number;
  scontoFornitore1: string;
  scontoFornitore2: string;
  markupTipo: MarkupTipo;
  markupValore: string;
  prezzoVenditaCalcolato: number;
  vatRateAcquisto: string;
  manodoperaModalita: ManodoperaModalita;
  manodoperaCostoAcquisto: string;
  manodoperaPrezzoVendita: string;
  manodoperaUnita: ManodoperaUnita;
  posaLinked: boolean;
  immagineUrl: string | null;
  onGotoStep: (step: string) => void;
  onBackToCatalog: () => void;
  onDuplicate: () => void;
  duplicating: boolean;
}

function RiepilogoSection(props: RiepilogoSectionProps) {
  const {
    family,
    categorie,
    macrocategorie,
    tariffe,
    prezzoBaseMode,
    prezzoVendita,
    prezzoAcquisto,
    acquistoNetto,
    scontoFornitore1,
    scontoFornitore2,
    markupTipo,
    markupValore,
    prezzoVenditaCalcolato,
    vatRateAcquisto,
    manodoperaModalita,
    manodoperaCostoAcquisto,
    manodoperaPrezzoVendita,
    manodoperaUnita,
    posaLinked,
    immagineUrl,
    onGotoStep,
    onBackToCatalog,
    onDuplicate,
    duplicating,
  } = props;

  // Refactor 20270513200000: usa direttamente macrocategoria_id, con fallback
  // backward-compat via categoria_id per articoli pre-refactor.
  const macroId = family.macrocategoria_id
    ?? (family.categoria_id
      ? categorie.find((c) => c.id === family.categoria_id)?.macrocategoria_id ?? null
      : null);
  const macroNome = macroId
    ? macrocategorie.find((m) => m.id === macroId)?.nome ?? "—"
    : "Nessuna";

  const modalitaPrezzoLabel =
    MODALITA_CARDS.find((m) => m.value === family.modalita_prezzo_base)?.label ??
    family.modalita_prezzo_base;

  // Margine prodotto (solo se acquisto_markup)
  const prodottoCosto = acquistoNetto;
  const prodottoVendita =
    prezzoBaseMode === "acquisto_markup"
      ? prezzoVenditaCalcolato
      : parseDecimalField(prezzoVendita) || 0;
  const prodottoMargine = prodottoVendita - prodottoCosto;
  const prodottoMarginePct =
    prodottoVendita > 0 ? (prodottoMargine / prodottoVendita) * 100 : 0;

  // Margine manodopera (solo se manuale)
  const moCosto = parseDecimalField(manodoperaCostoAcquisto) || 0;
  const moVendita = parseDecimalField(manodoperaPrezzoVendita) || 0;
  const moMargine = moVendita - moCosto;
  const moMarginePct = moVendita > 0 ? (moMargine / moVendita) * 100 : 0;

  const tariffaNome = family.posa_tariffa_default_id
    ? tariffe.find((t) => t.id === family.posa_tariffa_default_id)?.nome ?? "—"
    : null;

  const assiObbligatori = family.axes.filter((a) => a.obbligatorio).length;
  const valoriTotali = family.axes.reduce(
    (sum, a) => sum + a.values.filter((v) => v.attivo).length,
    0,
  );

  return (
    <div className="space-y-4">
      {/* Card Anagrafica */}
      <RiepilogoCard
        icon={Package}
        title="Anagrafica"
        onEdit={() => onGotoStep("1")}
      >
        <div className="flex gap-4 items-start">
          {immagineUrl ? (
            <img width={80} height={80} loading="lazy"
              src={immagineUrl}
              alt={family.nome}
              className="h-20 w-20 rounded-md object-cover border flex-shrink-0"
            />
          ) : (
            <div className="h-20 w-20 rounded-md bg-muted border flex items-center justify-center flex-shrink-0">
              <ImageIcon
                className="h-6 w-6 text-muted-foreground"
                aria-hidden="true"
              />
            </div>
          )}
          <div className="flex-1 min-w-0 space-y-1">
            <div className="font-semibold text-base">{family.nome}</div>
            <div className="flex flex-wrap gap-1 text-xs">
              <Badge variant="outline">{macroNome}</Badge>
              <Badge variant="secondary">{family.unit_of_measure}</Badge>
              <Badge variant="secondary">IVA {family.vat_rate}%</Badge>
            </div>
            {family.descrizione ? (
              <p className="text-xs text-muted-foreground line-clamp-2 mt-1">
                {family.descrizione}
              </p>
            ) : null}
          </div>
        </div>
      </RiepilogoCard>

      {/* Card Prezzo */}
      <RiepilogoCard
        icon={Banknote}
        title="Prezzo"
        onEdit={() => onGotoStep("2")}
      >
        <div className="space-y-2">
          <div className="text-xs text-muted-foreground uppercase tracking-wide">
            Modalità: <span className="font-medium">{modalitaPrezzoLabel}</span>
            {" · "}
            <span className="font-medium">
              {prezzoBaseMode === "vendita"
                ? "Vendita diretta"
                : "Acquisto + markup"}
            </span>
          </div>
          {prezzoBaseMode === "acquisto_markup" ? (
            <div className="space-y-1.5 bg-muted/30 rounded-md p-3 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Listino lordo</span>
                <span className="font-medium">
                  {formatCurrency(parseDecimalField(prezzoAcquisto) || 0)}
                </span>
              </div>
              {(parseDecimalField(scontoFornitore1) || 0) > 0 ||
              (parseDecimalField(scontoFornitore2) || 0) > 0 ? (
                <div className="flex justify-between text-emerald-700">
                  <span>
                    Sconti fornitore −{scontoFornitore1}%
                    {(parseDecimalField(scontoFornitore2) || 0) > 0
                      ? ` / −${scontoFornitore2}%`
                      : ""}
                  </span>
                  <span className="font-medium">
                    = {formatCurrency(acquistoNetto)}
                  </span>
                </div>
              ) : null}
              <div className="flex justify-between">
                <span className="text-muted-foreground">
                  Markup{" "}
                  {markupTipo === "percentuale"
                    ? `+${parseDecimalField(markupValore) || 0}%`
                    : markupTipo === "fisso_pz"
                      ? `+${formatCurrency(parseDecimalField(markupValore) || 0)}/pz`
                      : "Nessuno"}
                </span>
                <span className="font-medium text-amber-700">
                  +{formatCurrency(prodottoMargine)}
                </span>
              </div>
              <div className="flex justify-between pt-1 border-t text-base font-semibold text-primary">
                <span>Prezzo vendita</span>
                <span>{formatCurrency(prodottoVendita)}</span>
              </div>
              {prodottoVendita > 0 ? (
                <div className="flex justify-between text-xs">
                  <span className="text-muted-foreground">
                    Margine: {formatCurrency(prodottoMargine)}
                  </span>
                  <span
                    className={
                      prodottoMarginePct < 20
                        ? "text-amber-600 font-medium"
                        : "text-emerald-600 font-medium"
                    }
                  >
                    {prodottoMarginePct.toFixed(1)}% sulla vendita
                  </span>
                </div>
              ) : null}
              <div className="text-xs text-muted-foreground pt-1">
                IVA acquisto {parseDecimalField(vatRateAcquisto) || 0}% · IVA vendita{" "}
                {family.vat_rate}%
              </div>
            </div>
          ) : (
            <div className="flex justify-between items-center bg-muted/30 rounded-md p-3">
              <span className="text-sm text-muted-foreground">
                Prezzo vendita diretto
              </span>
              <span className="text-lg font-bold text-primary">
                {formatCurrency(parseDecimalField(prezzoVendita) || 0)}
              </span>
            </div>
          )}
        </div>
      </RiepilogoCard>

      {/* Card Manodopera */}
      <RiepilogoCard
        icon={Wrench}
        title="Manodopera"
        onEdit={() => onGotoStep("4")}
      >
        {manodoperaModalita === "nessuna" ? (
          <div className="flex gap-2 items-center text-sm text-muted-foreground">
            <Ban className="h-4 w-4" aria-hidden="true" />
            <span>Nessuna manodopera automatica</span>
          </div>
        ) : manodoperaModalita === "tariffa" ? (
          <div className="space-y-1.5 text-sm">
            <div className="flex items-center gap-2">
              <Badge className="bg-blue-100 text-blue-800 hover:bg-blue-100">
                Tariffa aziendale
              </Badge>
              <span className="font-medium">{tariffaNome ?? "—"}</span>
            </div>
            <div className="text-xs text-muted-foreground">
              Quantità default: {family.posa_quantita_default} ·{" "}
              {posaLinked ? (
                <span className="inline-flex gap-1 items-center">
                  <Link2 className="h-3 w-3" aria-hidden="true" />
                  legata al prodotto
                </span>
              ) : (
                <span className="inline-flex gap-1 items-center">
                  <Link2Off className="h-3 w-3" aria-hidden="true" />
                  indipendente
                </span>
              )}
            </div>
          </div>
        ) : (
          <div className="space-y-2 text-sm">
            <div className="flex items-center gap-2">
              <Badge className="bg-emerald-100 text-emerald-800 hover:bg-emerald-100">
                Importo manuale
              </Badge>
              <span className="text-xs text-muted-foreground">
                unità: {manodoperaUnita}
              </span>
            </div>
            <div className="grid grid-cols-3 gap-3 bg-muted/30 rounded-md p-3">
              <div>
                <div className="text-xs text-muted-foreground">
                  Costo subappalto
                </div>
                <div className="font-medium">{formatCurrency(moCosto)}</div>
              </div>
              <div>
                <div className="text-xs text-muted-foreground">
                  Prezzo cliente
                </div>
                <div className="font-medium">{formatCurrency(moVendita)}</div>
              </div>
              <div>
                <div className="text-xs text-muted-foreground">Margine</div>
                <div
                  className={`font-bold ${
                    moMargine < 0
                      ? "text-red-600"
                      : moMarginePct < 20
                        ? "text-amber-600"
                        : "text-emerald-600"
                  }`}
                >
                  {formatCurrency(moMargine)}
                  {moVendita > 0 ? ` (${moMarginePct.toFixed(1)}%)` : ""}
                </div>
              </div>
            </div>
            <div className="text-xs text-muted-foreground">
              Quantità default: {family.posa_quantita_default} ·{" "}
              {posaLinked ? (
                <span className="inline-flex gap-1 items-center">
                  <Link2 className="h-3 w-3" aria-hidden="true" />
                  legata al prodotto
                </span>
              ) : (
                <span className="inline-flex gap-1 items-center">
                  <Link2Off className="h-3 w-3" aria-hidden="true" />
                  indipendente
                </span>
              )}
            </div>
          </div>
        )}
      </RiepilogoCard>

      {/* Card Assi */}
      <RiepilogoCard
        icon={ListChecks}
        title={`Variabili Prodotto (${family.axes.length})`}
        onEdit={() => onGotoStep("3")}
      >
        {family.axes.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Nessuna variabile configurata. L'articolo ha un prezzo fisso.
          </p>
        ) : (
          <div className="space-y-2">
            <div className="text-xs text-muted-foreground">
              {assiObbligatori} obbligatori · {valoriTotali} valori totali
            </div>
            <ul className="space-y-1.5">
              {family.axes.map((ax) => (
                <li
                  key={ax.id}
                  className="flex gap-2 items-center text-sm border rounded-md p-2"
                >
                  <Check
                    className="h-3.5 w-3.5 text-primary flex-shrink-0"
                    aria-hidden="true"
                  />
                  <span className="font-medium">{ax.nome}</span>
                  {ax.obbligatorio ? (
                    <Badge variant="outline" className="text-xs">
                      obbligatorio
                    </Badge>
                  ) : null}
                  <Badge variant="secondary" className="text-xs ml-auto">
                    {ax.values.filter((v) => v.attivo).length}{" "}
                    {ax.values.filter((v) => v.attivo).length === 1
                      ? "valore"
                      : "valori"}
                  </Badge>
                </li>
              ))}
            </ul>
          </div>
        )}
      </RiepilogoCard>

      {/* Azioni finali */}
      <div className="flex flex-wrap gap-2 pt-3 border-t">
        <Button onClick={onBackToCatalog} variant="outline">
          <ArrowLeft className="h-4 w-4 mr-2" aria-hidden="true" />
          Torna al catalogo
        </Button>
        <Button onClick={onDuplicate} disabled={duplicating}>
          {duplicating ? (
            <>
              <Loader2
                className="h-4 w-4 mr-2 animate-spin"
                aria-hidden="true"
              />
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
    </div>
  );
}

function RiepilogoCard({
  icon: Icon,
  title,
  onEdit,
  children,
}: {
  icon: typeof Wrench;
  title: string;
  onEdit: () => void;
  children: React.ReactNode;
}) {
  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <div className="h-7 w-7 rounded-md bg-primary/10 text-primary flex items-center justify-center">
              <Icon className="h-3.5 w-3.5" aria-hidden="true" />
            </div>
            <CardTitle className="text-sm">{title}</CardTitle>
          </div>
          <Button size="sm" variant="ghost" onClick={onEdit}>
            Modifica
          </Button>
        </div>
      </CardHeader>
      <CardContent className="pt-0">{children}</CardContent>
    </Card>
  );
}

function LinkedToggle({
  linked,
  onChange,
  disabled,
}: {
  linked: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <div className="flex items-start justify-between gap-3 rounded-md border bg-muted/30 p-3">
      <div className="space-y-0.5 flex gap-2 items-start">
        {linked ? (
          <Link2
            className="h-4 w-4 text-primary mt-0.5 flex-shrink-0"
            aria-hidden="true"
          />
        ) : (
          <Link2Off
            className="h-4 w-4 text-muted-foreground mt-0.5 flex-shrink-0"
            aria-hidden="true"
          />
        )}
        <div>
          <Label htmlFor="f-mo-linked" className="cursor-pointer">
            Manodopera legata al prodotto
          </Label>
          <p className="text-xs text-muted-foreground">
            Se attivo, cancellare o modificare la riga prodotto aggiorna anche
            la riga manodopera (sincronizzazione quantità + delete cascade). Se
            disattivo, le due righe vivono in modo indipendente.
          </p>
        </div>
      </div>
      <Switch
        id="f-mo-linked"
        checked={linked}
        onCheckedChange={onChange}
        disabled={disabled}
      />
    </div>
  );
}

// ─── Dialog inline-create tariffa aziendale ─────────────────────────────────
//
// Permette al commerciale di creare una nuova tariffa aziendale (es. "Posa
// porta blindata 1 anta") direttamente dallo Step 4 Manodopera del FamilyEditor,
// senza dover navigare a Impostazioni → Tariffe → torna qui.
//
// Salva su `tariffe_aziendali` con i campi minimi richiesti. Sufficiente per
// l'uso "lookup posa": l'utente puo' arricchire la tariffa con descrizione,
// varianti, presets entrando in Impostazioni in un secondo momento.

interface InlineCreateTariffaDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  companyId: string;
  /** Chiamata con l'id della nuova tariffa per auto-selezione nel parent. */
  onCreated: (newId: string) => void;
}

function InlineCreateTariffaDialog({
  open, onOpenChange, companyId, onCreated,
}: InlineCreateTariffaDialogProps) {
  const [nome, setNome] = useState("");
  const [tipo, setTipo] = useState<"posa" | "manodopera">("posa");
  const [unita, setUnita] = useState<"pz" | "mq" | "ml" | "h" | "gg" | "a_corpo">("pz");
  const [costoInterno, setCostoInterno] = useState("");
  const [prezzoVendita, setPrezzoVendita] = useState("");
  const [saving, setSaving] = useState(false);

  // Reset campi quando il dialog si apre per evitare leak di stato precedente
  useEffect(() => {
    if (open) {
      setNome("");
      setTipo("posa");
      setUnita("pz");
      setCostoInterno("");
      setPrezzoVendita("");
    }
  }, [open]);

  const handleSubmit = async () => {
    if (!nome.trim()) {
      toast.error("Inserisci un nome per la tariffa");
      return;
    }
    // parseDecimalField, non parseFloat: "10,50" deve salvare 10.5, non 10
    // (venditaNum/costoNum finiscono nell'INSERT su tariffe_aziendali).
    const venditaNum = parseDecimalField(prezzoVendita);
    if (!Number.isFinite(venditaNum) || venditaNum <= 0) {
      toast.error("Inserisci un prezzo di vendita valido (> 0)");
      return;
    }
    const costoNum = parseDecimalField(costoInterno);
    // M-28 (audit): anche il costo interno va validato — un negativo passava
    // dritto nell'INSERT su tariffe_aziendali falsando i margini.
    if (costoInterno.trim() !== "" && (!Number.isFinite(costoNum) || costoNum < 0)) {
      toast.error("Inserisci un costo interno valido (numero ≥ 0)");
      return;
    }
    setSaving(true);
    try {
      const { data, error } = await supabase
        .from("tariffe_aziendali")
        .insert({
          company_id: companyId,
          nome: nome.trim(),
          tipo,
          // unita legacy = unita di fatturazione per retrocompat (vedi SettingsTariffe)
          unita,
          unita_fatturazione: unita,
          prezzo_vendita: venditaNum,
          costo_interno: Number.isFinite(costoNum) ? costoNum : 0,
          prezzo_costo: Number.isFinite(costoNum) ? costoNum : 0,
          attivo: true,
        } as never)
        .select("id")
        .single();
      if (error) throw error;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const newId = (data as any)?.id as string | undefined;
      if (!newId) throw new Error("ID nuova tariffa mancante");
      toast.success(`Tariffa "${nome.trim()}" creata`);
      onCreated(newId);
      onOpenChange(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Errore creazione tariffa");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!saving) onOpenChange(o); }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Nuova tariffa aziendale</DialogTitle>
          <DialogDescription>
            Crea al volo una tariffa per la manodopera di questo articolo.
            Sarà disponibile in <strong>Impostazioni → Tariffe aziendali</strong>{" "}
            per ulteriori personalizzazioni.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3 py-2">
          <div>
            <Label htmlFor="ict-nome" className="text-xs">Nome tariffa *</Label>
            <Input
              id="ict-nome"
              value={nome}
              onChange={(e) => setNome(e.target.value)}
              placeholder='Es. "Posa porta blindata"'
              className="mt-1"
              autoFocus
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="ict-tipo" className="text-xs">Tipo</Label>
              <Select value={tipo} onValueChange={(v) => setTipo(v as typeof tipo)}>
                <SelectTrigger id="ict-tipo" className="mt-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="posa">Posa</SelectItem>
                  <SelectItem value="manodopera">Manodopera</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="ict-unita" className="text-xs">Unità</Label>
              <Select value={unita} onValueChange={(v) => setUnita(v as typeof unita)}>
                <SelectTrigger id="ict-unita" className="mt-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="pz">Pezzo</SelectItem>
                  <SelectItem value="mq">Metro quadro</SelectItem>
                  <SelectItem value="ml">Metro lineare</SelectItem>
                  <SelectItem value="h">Ora</SelectItem>
                  <SelectItem value="gg">Giornata</SelectItem>
                  <SelectItem value="a_corpo">A corpo</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="ict-costo" className="text-xs">Costo interno (€)</Label>
              <Input
                id="ict-costo"
                type="number"
                step="0.01"
                min="0"
                value={costoInterno}
                onChange={(e) => setCostoInterno(e.target.value)}
                placeholder="0.00"
                className="mt-1"
              />
            </div>
            <div>
              <Label htmlFor="ict-vendita" className="text-xs">Prezzo vendita (€) *</Label>
              <Input
                id="ict-vendita"
                type="number"
                step="0.01"
                min="0"
                value={prezzoVendita}
                onChange={(e) => setPrezzoVendita(e.target.value)}
                placeholder="0.00"
                className="mt-1"
              />
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={saving}
          >
            Annulla
          </Button>
          <Button
            type="button"
            onClick={handleSubmit}
            disabled={saving}
            className="bg-orange-500 hover:bg-orange-600"
          >
            {saving ? "Creazione…" : "Crea tariffa"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
