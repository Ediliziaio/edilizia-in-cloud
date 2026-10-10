/**
 * Preventivatore Verticalizzato Serramentisti — FASE 10.2
 *
 * Gestione bundle/pacchetti chiavi-in-mano con CRUD completo.
 * Ogni bundle = nome + metadati + N voci (famiglia con config | prodotto legacy | tariffa).
 * Per famiglie si può preimpostare vano_label, misure default (L×H), selezioni assi.
 *
 * 10/10/2026: a chi usa la pagina si dice «pacchetto» (non «bundle», «template», «wizard FV»), e le tre
 * voci hanno il nome che hanno nel resto delle impostazioni: «Prodotto del listino» (nel codice family),
 * «Articolo» (product: il vecchio catalogo article_templates), «Manodopera e servizi» (tariff). Il titolo
 * della pagina lo mette il layout (scheda «Kit e pacchetti» del Listino): qui nessun secondo titolo.
 * Nel codice, nelle rotte e nelle tabelle resta «bundle».
 */

import { useId, useMemo, useRef, useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  Plus, Pencil, Trash2, Copy, Package, Box, Wrench, Home, Sparkles, Search, X,
  ArrowDown, ArrowUp, ArrowUpDown,
} from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import {
  Card, CardContent,
} from "@/components/ui/card";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { supabase } from "@/integrations/supabase/client";
import { useEffectiveCompanyId } from "@/hooks/useEffectiveCompanyId";
import { useVertical } from "@/hooks/useVertical";
import { useFamilies } from "@/hooks/useFamilies";
import { useFeatureAccess } from "@/hooks/useFeatureAccess";
import { usePermissions } from "@/hooks/usePermissions";
import {
  useBundlesList,
  useUpsertBundle,
  useDeleteBundle,
  useToggleBundleAttivo,
  type Bundle,
  type BundleVoceInput,
  type BundleTipoLavoro,
} from "@/hooks/useBundles";
import type { AxisSelection } from "@/types/articleFamily";
import { unitaTariffa } from "@/lib/listino/costoTariffa";
import { userErrorMessage } from "@/lib/userErrorMessage";
import { cn } from "@/lib/utils";

type VoceType = "family" | "product" | "tariff";

interface DraftVoce {
  _key: string;
  type: VoceType;
  family_id: string | null;
  prodotto_id: string | null;
  tariffa_id: string | null;
  vano_label: string;
  larghezza_mm: number | null;
  altezza_mm: number | null;
  axis_selections: AxisSelection;
  quantita: number;
  immagine_url: string | null;
}

interface DraftBundle {
  id?: string;
  nome: string;
  descrizione: string;
  sconto_bundle_pct: number;
  attivo: boolean;
  tipo_lavoro: BundleTipoLavoro | null;
  // FV (solo vertical fotovoltaico): taglia kit + prezzo offerta fisso + copertina PDF
  fv_kwp: number | null;
  fv_accumulo_kwh: number | null;
  prezzo_offerta: number | null;
  cover_image_url: string | null;
  voci: DraftVoce[];
}

const TIPO_LAVORO_OPTIONS: { value: BundleTipoLavoro; label: string }[] = [
  { value: "sostituzione", label: "Sostituzione" },
  { value: "nuova", label: "Nuova installazione" },
  { value: "ristrutturazione", label: "Ristrutturazione" },
];

/** «nuova» → «Nuova installazione»: nella tabella si legge il nome italiano, non la chiave del database. */
function etichettaTipoLavoro(tipo: BundleTipoLavoro | null): string {
  return TIPO_LAVORO_OPTIONS.find((o) => o.value === tipo)?.label ?? tipo ?? "";
}

/**
 * I tre tipi di voce hanno il nome che hanno nel resto delle impostazioni, non quello interno del codice:
 * family = un prodotto del Listino, product = un articolo del vecchio catalogo (article_templates),
 * tariff = una voce di «Manodopera e servizi».
 */
const TIPI_VOCE: Record<VoceType, { nome: string; scegli: string }> = {
  family: { nome: "Prodotto del listino", scegli: "Scegli il prodotto del listino" },
  product: { nome: "Articolo", scegli: "Scegli l'articolo" },
  tariff: { nome: "Manodopera e servizi", scegli: "Scegli la voce di manodopera o servizi" },
};

// ── Ordine dell'elenco: un clic sull'intestazione ordina, il secondo inverte, il terzo torna all'ordine per nome.
type ChiaveOrdine = "potenza" | "prezzo";
interface Ordine {
  chiave: ChiaveOrdine;
  verso: "asc" | "desc";
}

/** I pacchetti senza il valore (non sono kit fotovoltaici) restano in fondo, in tutti e due i versi. */
function ordinaPacchetti(lista: Bundle[], ordine: Ordine | null): Bundle[] {
  if (!ordine) return lista;
  const { chiave, verso } = ordine;
  const valore = (b: Bundle): number | null => {
    const v = chiave === "potenza" ? b.fv_kwp : b.prezzo_offerta;
    return v == null ? null : Number(v);
  };
  const segno = verso === "asc" ? 1 : -1;
  return [...lista].sort((a, z) => {
    const va = valore(a);
    const vz = valore(z);
    if (va == null && vz == null) return a.nome.localeCompare(z.nome, "it");
    if (va == null) return 1;
    if (vz == null) return -1;
    return va === vz ? a.nome.localeCompare(z.nome, "it") : (va - vz) * segno;
  });
}

function IntestazioneOrdinabile({
  etichetta, chiave, ordine, onOrdina,
}: {
  etichetta: string;
  chiave: ChiaveOrdine;
  ordine: Ordine | null;
  onOrdina: (chiave: ChiaveOrdine) => void;
}) {
  const verso = ordine?.chiave === chiave ? ordine.verso : null;
  const Icona = verso === "asc" ? ArrowUp : verso === "desc" ? ArrowDown : ArrowUpDown;
  const dalBasso = chiave === "potenza" ? "dalla più piccola" : "dal più basso";
  const dalAlto = chiave === "potenza" ? "dalla più grande" : "dal più alto";
  const suggerimento =
    verso === "asc" ? `Ordinati ${dalBasso}. Tocca per invertire.`
    : verso === "desc" ? `Ordinati ${dalAlto}. Tocca per tornare all'ordine per nome.`
    : `Ordina per ${etichetta.toLowerCase()}`;
  return (
    <TableHead aria-sort={verso === "asc" ? "ascending" : verso === "desc" ? "descending" : "none"}>
      <button
        type="button"
        onClick={() => onOrdina(chiave)}
        title={suggerimento}
        className={cn(
          "inline-flex items-center gap-1 whitespace-nowrap rounded-sm hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
          verso && "font-semibold text-foreground",
        )}
      >
        {etichetta}
        <Icona className={cn("h-3.5 w-3.5", !verso && "opacity-40")} aria-hidden="true" />
      </button>
    </TableHead>
  );
}

/**
 * Le frasi che il client Supabase mette al posto dei messaggi inglesi del database (vedi traduciErrorePostgrest): gli hook
 * dei pacchetti rilanciano `new Error(error.message)`, quindi un permesso negato o un valore non valido arriva qui già in
 * italiano, e `userErrorMessage` (che riconosce l'inglese) non lo riconoscerebbe più e direbbe solo «riprova».
 * Si ricavano dalla libreria, non si riscrivono: così non possono divergere.
 */
const FRASI_DEL_DATABASE = new Set(
  [
    "row-level security", "duplicate key value", "violates foreign key", "null value in column",
    "violates check constraint", "value too long for type", "invalid input syntax", "deadlock detected",
  ].map((messaggio) => userErrorMessage({ message: messaggio }, "")),
);

/**
 * Perché un'azione sui pacchetti non è riuscita, in italiano. Le frasi dell'app (rete, timeout, sessione scaduta, permessi,
 * vincoli) e quelle già tradotte dal client si leggono com'erano; tutto il resto — testi di Postgres o del browser che
 * nessuno ha tradotto — no: si dice `generico`.
 */
function motivoErrore(errore: unknown, generico: string): string {
  const noto = userErrorMessage(errore, "");
  if (noto) return noto;
  const testo = errore instanceof Error ? errore.message : "";
  return FRASI_DEL_DATABASE.has(testo) ? testo : generico;
}

/** «7.900 €»: l'italiano non raggruppa i numeri a quattro cifre da solo, e in tabella servono i punti dei migliaia. */
// `useGrouping: "always"` è dei browser di oggi ma non è ancora nei tipi della libreria di TypeScript usata qui.
const EURO_SENZA_CENTESIMI = new Intl.NumberFormat("it-IT", {
  style: "currency", currency: "EUR", maximumFractionDigits: 0, useGrouping: "always",
} as unknown as Intl.NumberFormatOptions);

function emptyDraft(): DraftBundle {
  return {
    nome: "",
    descrizione: "",
    sconto_bundle_pct: 0,
    attivo: true,
    tipo_lavoro: null,
    fv_kwp: null,
    fv_accumulo_kwh: null,
    prezzo_offerta: null,
    cover_image_url: null,
    voci: [],
  };
}

function newKey(): string {
  return `v-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function bundleToDraft(b: Bundle): DraftBundle {
  return {
    id: b.id,
    nome: b.nome,
    descrizione: b.descrizione ?? "",
    sconto_bundle_pct: Number(b.sconto_bundle_pct ?? 0),
    attivo: b.attivo,
    tipo_lavoro: b.tipo_lavoro,
    fv_kwp: b.fv_kwp != null ? Number(b.fv_kwp) : null,
    fv_accumulo_kwh: b.fv_accumulo_kwh != null ? Number(b.fv_accumulo_kwh) : null,
    prezzo_offerta: b.prezzo_offerta != null ? Number(b.prezzo_offerta) : null,
    cover_image_url: b.cover_image_url ?? null,
    voci: (b.voci ?? [])
      .slice()
      .sort((a, z) => a.sort_order - z.sort_order)
      .map((v): DraftVoce => ({
        _key: v.id,
        type: v.family_id
          ? "family"
          : v.prodotto_id
            ? "product"
            : "tariff",
        family_id: v.family_id,
        prodotto_id: v.prodotto_id,
        tariffa_id: v.tariffa_id,
        vano_label: v.vano_label ?? "",
        larghezza_mm: v.larghezza_mm_default,
        altezza_mm: v.altezza_mm_default,
        axis_selections: (v.axis_selections ?? {}) as AxisSelection,
        quantita: Number(v.quantita ?? 1),
        immagine_url: v.immagine_url ?? null,
      })),
  };
}

export default function SettingsBundle() {
  const companyId = useEffectiveCompanyId();
  const { vertical } = useVertical();
  // Mostra i campi "Kit FV" se l'azienda ha il vertical fotovoltaico OPPURE il modulo
  // FV attivo (aziende "generico" multi-business possono comunque vendere kit FV).
  const { isEnabled: fvModuloAttivo } = useFeatureAccess("modulo_fotovoltaico_attivo");
  const { families } = useFamilies();
  // Il permesso «Kit e pacchetti → modifica» esisteva ma nessuno lo leggeva:
  // chi vedeva la pagina poteva creare, cambiare ed eliminare i kit.
  const permissions = usePermissions();
  const puoModificare = permissions.isAdmin || permissions.canEditSettingsBundle;
  const senzaPermesso = "Serve il permesso di modificare i pacchetti";
  // I 5 pacchetti di esempio sono di infissi (le voci cercano prodotti come «Finestra 1 anta»):
  // il pulsante compare solo per chi ha Serramenti come settore. Prima restava, spento, per tutti gli altri.
  const puoInstallareEsempi = vertical === "serramentista";

  const { bundles, isLoading, isError, refetch } = useBundlesList();
  const upsertMut = useUpsertBundle();
  const deleteMut = useDeleteBundle();
  const toggleMut = useToggleBundleAttivo();

  const installTemplatesMut = useMutation({
    // L'esito lo dice questa pagina: senza `silent` si aggiungeva l'avviso generico di App.tsx.
    meta: { silent: true },
    mutationFn: async () => {
      if (!companyId) throw new Error("Company non identificata");
      const { data, error } = await supabase.functions.invoke(
        "installa-bundle-template",
        { body: { company_id: companyId, vertical } },
      );
      if (error) throw new Error(error.message);
      return data as { bundles_creati: number; voci_create: number; saltati: string[] };
    },
    onSuccess: (res) => {
      const creati = res.bundles_creati;
      const saltati = res.saltati.length;
      toast.success(
        creati === 0
          ? "I pacchetti di esempio c'erano già: non ho aggiunto niente."
          : `Installati ${creati} ${creati === 1 ? "pacchetto" : "pacchetti"} di esempio (${res.voci_create} ${res.voci_create === 1 ? "voce" : "voci"}).` +
            (saltati > 0 ? ` ${saltati} ${saltati === 1 ? "saltato" : "saltati"}: già presenti o senza il prodotto nel listino.` : ""),
      );
      refetch();
    },
    onError: (e) => {
      toast.error("Installazione non riuscita", { description: userErrorMessage(e, "Riprova tra poco.") });
    },
  });

  // Articoli e tariffe per i dropdown delle voci
  const { data: articoli = [] } = useQuery({
    queryKey: ["bundle-editor-articoli", companyId],
    enabled: !!companyId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("article_templates")
        .select("id, name, unit_of_measure, unit_price, prezzo_vendita, immagine_url")
        .eq("company_id", companyId!)
        .order("name")
        .limit(500);
      if (error) throw error;
      return (data ?? []) as Array<{
        id: string;
        name: string;
        unit_of_measure: string | null;
        unit_price: number | null;
        prezzo_vendita: number | null;
        immagine_url: string | null;
      }>;
    },
    staleTime: 5 * 60 * 1000,
  });

  const { data: tariffe = [] } = useQuery({
    queryKey: ["bundle-editor-tariffe", companyId],
    enabled: !!companyId,
    queryFn: async () => {
      const { data, error } = await supabase.from("tariffe_aziendali" as never)
        .select("id, nome, prezzo_vendita, unita, unita_fatturazione")
        .eq("company_id", companyId!)
        .eq("attivo", true)
        .order("nome");
      if (error) throw error;
      // L'unità vera (05/10/2026): la colonna legacy scrive «h» per le
      // giornate e «pz» per i chili. Vedi unitaTariffa.
      return ((data ?? []) as Array<{
        id: string;
        nome: string;
        prezzo_vendita: number | null;
        unita: string | null;
        unita_fatturazione: string | null;
      }>).map((t) => ({ ...t, unita: t.unita || t.unita_fatturazione ? unitaTariffa(t) : null }));
    },
    staleTime: 5 * 60 * 1000,
  });

  // ── UI state
  const [dialogOpen, setDialogOpen] = useState(false);
  const [draft, setDraft] = useState<DraftBundle>(emptyDraft());
  const [deleteTarget, setDeleteTarget] = useState<Bundle | null>(null);
  const [search, setSearch] = useState("");
  const [filterAttivi, setFilterAttivi] = useState<"all" | "active" | "inactive">("all");
  const [ordine, setOrdine] = useState<Ordine | null>(null);
  const [coverUploading, setCoverUploading] = useState(false);
  const [uploadingVoceKey, setUploadingVoceKey] = useState<string | null>(null);
  const coverInputRef = useRef<HTMLInputElement>(null);

  // ── Filtered list
  const filteredBundles = useMemo(() => {
    let list = bundles;
    if (filterAttivi === "active") list = list.filter((b) => b.attivo);
    if (filterAttivi === "inactive") list = list.filter((b) => !b.attivo);
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      list = list.filter((b) =>
        b.nome.toLowerCase().includes(q) ||
        (b.descrizione ?? "").toLowerCase().includes(q) ||
        (b.tipo_lavoro ?? "").toLowerCase().includes(q) ||
        // si cerca anche col nome che si legge in tabella («installazione» trova «Nuova installazione»)
        etichettaTipoLavoro(b.tipo_lavoro).toLowerCase().includes(q),
      );
    }
    return ordinaPacchetti(list, ordine);
  }, [bundles, search, filterAttivi, ordine]);

  const cambiaOrdine = (chiave: ChiaveOrdine) =>
    setOrdine((prec) =>
      !prec || prec.chiave !== chiave ? { chiave, verso: "asc" }
      : prec.verso === "asc" ? { chiave, verso: "desc" }
      : null,
    );

  // ── Contatori dei tre pulsanti Tutti / Attivi / Disattivi
  const stats = useMemo(() => {
    const attivi = bundles.filter((b) => b.attivo).length;
    return { totali: bundles.length, attivi, disattivi: bundles.length - attivi };
  }, [bundles]);

  const openNew = () => {
    setDraft(emptyDraft());
    setDialogOpen(true);
  };

  const openEdit = (b: Bundle) => {
    setDraft(bundleToDraft(b));
    setDialogOpen(true);
  };

  const openDuplicate = (b: Bundle) => {
    const d = bundleToDraft(b);
    setDraft({
      ...d,
      id: undefined,
      nome: `${d.nome} (copia)`,
      voci: d.voci.map((v) => ({ ...v, _key: newKey() })),
    });
    setDialogOpen(true);
  };

  const addVoce = (type: VoceType) => {
    setDraft((prev) => ({
      ...prev,
      voci: [
        ...prev.voci,
        {
          _key: newKey(),
          type,
          family_id: null,
          prodotto_id: null,
          tariffa_id: null,
          vano_label: "",
          larghezza_mm: null,
          altezza_mm: null,
          axis_selections: {},
          quantita: 1,
          immagine_url: null,
        },
      ],
    }));
  };

  const updateVoce = (key: string, patch: Partial<DraftVoce>) => {
    setDraft((prev) => ({
      ...prev,
      voci: prev.voci.map((v) => (v._key === key ? { ...v, ...patch } : v)),
    }));
  };

  const removeVoce = (key: string) => {
    setDraft((prev) => ({
      ...prev,
      voci: prev.voci.filter((v) => v._key !== key),
    }));
  };

  const isFvVertical = vertical === "fotovoltaico" || fvModuloAttivo;
  // Perché «Crea pacchetto» / «Salva modifiche» è spento (null = si può salvare). Le regole sono quelle di sempre;
  // in più si dice quale manca, invece di lasciare un pulsante spento senza una parola.
  const motivoNonSalvabile = useMemo((): string | null => {
    if (!draft.nome.trim()) return "Scrivi il nome del pacchetto.";
    // Un kit FV (ha la taglia in kWp) senza prezzo finiva nel preventivatore a 0 €.
    if (isFvVertical && draft.fv_kwp != null && !(Number(draft.prezzo_offerta) > 0)) {
      return "Scrivi il prezzo d'offerta del kit: senza, nel preventivo andrebbe a 0 €.";
    }
    if (draft.voci.length === 0) {
      // Kit FV: può bastare la taglia (kWp) + prezzo offerta, voci opzionali.
      return isFvVertical && draft.fv_kwp != null && draft.prezzo_offerta != null
        ? null
        : isFvVertical
          ? "Aggiungi almeno una voce, oppure indica potenza e prezzo del kit."
          : "Aggiungi almeno una voce.";
    }
    const completa = draft.voci.every((v) => {
      if (v.type === "family") return !!v.family_id;
      if (v.type === "product") return !!v.prodotto_id;
      if (v.type === "tariff") return !!v.tariffa_id;
      return false;
    });
    return completa ? null : "Scegli cosa va in ogni voce.";
  }, [draft, isFvVertical]);
  const canSave = motivoNonSalvabile === null;

  const handleCoverUpload = async (file: File) => {
    if (!companyId) return;
    setCoverUploading(true);
    try {
      const ext = file.name.split(".").pop() ?? "jpg";
      // Link pubblico, senza scadenza: quello firmato durava un anno e poi la
      // copertina spariva dal PDF. La prima cartella è l'azienda (regola del bucket).
      const path = `${companyId}/bundle-covers/${Date.now()}.${ext}`;
      const { error: upErr } = await supabase.storage
        .from("article-images")
        .upload(path, file, { upsert: true, contentType: file.type });
      if (upErr) throw upErr;
      const { data: pubblico } = supabase.storage.from("article-images").getPublicUrl(path);
      setDraft((d) => ({ ...d, cover_image_url: pubblico.publicUrl }));
      toast.success("Immagine caricata");
    } catch (e) {
      toast.error("Caricamento non riuscito", { description: userErrorMessage(e, "Riprova con un'altra immagine.") });
    } finally {
      setCoverUploading(false);
    }
  };

  // Foto della singola voce del pacchetto: nel PDF del preventivo fotovoltaico compare fra i «Componenti inclusi».
  const handleVoceImageUpload = async (key: string, file: File) => {
    if (!companyId) return;
    if (!file.type.startsWith("image/")) return toast.error("Carica un file immagine");
    setUploadingVoceKey(key);
    try {
      const ext = file.name.split(".").pop() ?? "jpg";
      const path = `${companyId}/bundle-voci/${crypto.randomUUID()}.${ext}`;
      const { error: upErr } = await supabase.storage
        .from("article-images")
        .upload(path, file, { upsert: true, contentType: file.type });
      if (upErr) throw upErr;
      const { data: pubblico } = supabase.storage.from("article-images").getPublicUrl(path);
      updateVoce(key, { immagine_url: pubblico.publicUrl });
      toast.success("Foto prodotto caricata");
    } catch (e) {
      toast.error("Caricamento non riuscito", { description: userErrorMessage(e, "Riprova con un'altra immagine.") });
    } finally {
      setUploadingVoceKey(null);
    }
  };

  const handleSave = async () => {
    if (!puoModificare) {
      toast.error(senzaPermesso);
      return;
    }
    try {
      const voci: BundleVoceInput[] = draft.voci.map((v, idx) => ({
        prodotto_id: v.type === "product" ? v.prodotto_id : null,
        tariffa_id: v.type === "tariff" ? v.tariffa_id : null,
        family_id: v.type === "family" ? v.family_id : null,
        axis_selections: v.axis_selections,
        larghezza_mm_default: v.type === "family" ? v.larghezza_mm : null,
        altezza_mm_default: v.type === "family" ? v.altezza_mm : null,
        vano_label: v.vano_label.trim() || null,
        quantita: v.quantita,
        sort_order: idx,
        immagine_url: v.immagine_url ?? null,
      }));
      await upsertMut.mutateAsync({
        id: draft.id,
        nome: draft.nome.trim(),
        descrizione: draft.descrizione.trim() || null,
        sconto_bundle_pct: draft.sconto_bundle_pct,
        attivo: draft.attivo,
        vertical,
        tipo_lavoro: draft.tipo_lavoro,
        // Si tengono sempre i dati del kit: se l'azienda non vedeva più i campi
        // FV, salvare un kit gli cancellava taglia, prezzo e copertina.
        fv_kwp: draft.fv_kwp,
        fv_accumulo_kwh: draft.fv_accumulo_kwh,
        prezzo_offerta: draft.prezzo_offerta,
        cover_image_url: draft.cover_image_url,
        voci,
      });
      toast.success(draft.id ? "Pacchetto aggiornato" : "Pacchetto creato");
      setDialogOpen(false);
      refetch();
    } catch (e) {
      toast.error("Salvataggio non riuscito", { description: motivoErrore(e, "Controlla i dati e riprova tra poco.") });
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    if (!puoModificare) {
      toast.error(senzaPermesso);
      return;
    }
    try {
      await deleteMut.mutateAsync(deleteTarget.id);
      toast.success("Pacchetto eliminato");
      setDeleteTarget(null);
      refetch();
    } catch (e) {
      toast.error("Eliminazione non riuscita", { description: motivoErrore(e, "Riprova tra poco.") });
    }
  };

  const handleToggle = async (b: Bundle) => {
    if (!puoModificare) {
      toast.error(senzaPermesso);
      return;
    }
    try {
      await toggleMut.mutateAsync({ id: b.id, attivo: !b.attivo });
      refetch();
    } catch (e) {
      toast.error("Cambio di stato non riuscito", { description: motivoErrore(e, "Riprova tra poco.") });
    }
  };

  return (
    <div className="space-y-4">
      {/* Il titolo della pagina lo mette il layout (Listino › scheda «Kit e pacchetti»): qui solo a cosa serve, e i pulsanti. */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <p className="min-w-0 max-w-2xl text-sm text-muted-foreground">
          Gruppi di voci già pronti, da aggiungere a un preventivo con un clic, per partire da una configurazione standard.
          {isFvVertical && " I kit fotovoltaici portano la loro potenza e il loro prezzo: si scelgono nel preventivo fotovoltaico."}
        </p>
        <div className="flex flex-wrap items-center gap-2">
          {puoInstallareEsempi && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => installTemplatesMut.mutate()}
              disabled={installTemplatesMut.isPending || !puoModificare}
              title={!puoModificare ? senzaPermesso : undefined}
            >
              <Sparkles className="h-4 w-4 mr-1.5" aria-hidden="true" />
              {installTemplatesMut.isPending ? "Installazione…" : "Installa 5 pacchetti di esempio"}
            </Button>
          )}
          <Button size="sm" onClick={openNew} disabled={!puoModificare} title={!puoModificare ? senzaPermesso : undefined}>
            <Plus className="h-4 w-4 mr-1.5" aria-hidden="true" />
            Nuovo pacchetto
          </Button>
        </div>
      </div>

      {!puoModificare && (
        <Alert>
          <AlertDescription>
            Stai consultando i pacchetti: li crea e li cambia chi ha in modifica il permesso «Listino · Kit e pacchetti» (o «Listino & Prezzi (tutto)»).
          </AlertDescription>
        </Alert>
      )}

      <Card>
        <CardContent className="pt-5 space-y-4">
          {/* Ricerca + Tutti / Attivi / Disattivi (i numeri stanno nei pulsanti) */}
          {bundles.length > 0 && (
            <div className="flex flex-col sm:flex-row gap-3 items-stretch">
              <div className="relative flex-1">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" aria-hidden="true" />
                <Input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Cerca per nome, descrizione o tipo di lavoro…"
                  aria-label="Cerca un pacchetto"
                  className="pl-8 pr-8 h-9 text-sm"
                />
                {search && (
                  <button
                    type="button"
                    onClick={() => setSearch("")}
                    className="absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded hover:bg-muted"
                    aria-label="Cancella la ricerca"
                  >
                    <X className="h-3 w-3" aria-hidden="true" />
                  </button>
                )}
              </div>
              <div className="flex flex-wrap gap-1.5" role="group" aria-label="Mostra">
                <Button
                  variant={filterAttivi === "all" ? "default" : "outline"}
                  size="sm"
                  aria-pressed={filterAttivi === "all"}
                  onClick={() => setFilterAttivi("all")}
                >
                  Tutti ({stats.totali})
                </Button>
                <Button
                  variant={filterAttivi === "active" ? "default" : "outline"}
                  size="sm"
                  aria-pressed={filterAttivi === "active"}
                  onClick={() => setFilterAttivi("active")}
                >
                  Attivi ({stats.attivi})
                </Button>
                <Button
                  variant={filterAttivi === "inactive" ? "default" : "outline"}
                  size="sm"
                  aria-pressed={filterAttivi === "inactive"}
                  onClick={() => setFilterAttivi("inactive")}
                >
                  Disattivi ({stats.disattivi})
                </Button>
              </div>
            </div>
          )}

          {isLoading ? (
            <div className="text-sm text-muted-foreground py-6 text-center">Caricamento…</div>
          ) : isError && bundles.length === 0 ? (
            <Alert variant="destructive">
              <AlertDescription className="flex flex-wrap items-center gap-3">
                Non riesco a leggere i pacchetti. Riprova tra poco.
                <Button size="sm" variant="outline" onClick={() => refetch()}>Riprova</Button>
              </AlertDescription>
            </Alert>
          ) : bundles.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <Package className="h-12 w-12 mx-auto mb-3 opacity-40" aria-hidden="true" />
              <p className="font-medium">Nessun pacchetto ancora creato.</p>
              <p className="text-xs mt-1 max-w-sm mx-auto">
                {puoInstallareEsempi
                  ? "Crea un pacchetto a mano oppure installa i 5 pacchetti di esempio."
                  : "Crea un pacchetto a mano."}
              </p>
              <Button
                variant="outline"
                className="mt-4"
                onClick={openNew}
                disabled={!puoModificare}
                title={!puoModificare ? senzaPermesso : undefined}
              >
                <Plus className="h-4 w-4 mr-2" aria-hidden="true" /> Crea il primo pacchetto
              </Button>
            </div>
          ) : filteredBundles.length === 0 ? (
            <div className="py-10 text-center text-muted-foreground">
              <p className="text-sm">Nessun pacchetto corrisponde ai filtri attuali.</p>
              <Button variant="ghost" size="sm" className="mt-2" onClick={() => { setSearch(""); setFilterAttivi("all"); }}>
                Azzera filtri
              </Button>
            </div>
          ) : (
            // La tabella scorre di lato dentro il suo contenitore (Table): a 375 px le colonne non si schiacciano.
            <Table aria-label="Elenco dei pacchetti" className={isFvVertical ? "min-w-[760px]" : "min-w-[600px]"}>
              <TableHeader>
                <TableRow>
                  <TableHead>Nome</TableHead>
                  <TableHead>Tipo di lavoro</TableHead>
                  <TableHead>Voci</TableHead>
                  {isFvVertical && (
                    <>
                      <IntestazioneOrdinabile etichetta="Potenza" chiave="potenza" ordine={ordine} onOrdina={cambiaOrdine} />
                      <IntestazioneOrdinabile etichetta="Prezzo offerta" chiave="prezzo" ordine={ordine} onOrdina={cambiaOrdine} />
                    </>
                  )}
                  <TableHead>Sconto</TableHead>
                  <TableHead>Stato</TableHead>
                  <TableHead className="text-right">Azioni</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredBundles.map((b) => (
                  <TableRow key={b.id} className={!b.attivo ? "opacity-60" : ""}>
                    <TableCell className="font-medium">
                      <div>{b.nome}</div>
                      {b.descrizione && (
                        <div className="text-xs text-muted-foreground line-clamp-1">{b.descrizione}</div>
                      )}
                    </TableCell>
                    <TableCell>
                      {b.tipo_lavoro ? (
                        <Badge variant="outline">{etichettaTipoLavoro(b.tipo_lavoro)}</Badge>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell>{b.voci?.length ?? 0}</TableCell>
                    {isFvVertical && (
                      <>
                        <TableCell className="whitespace-nowrap tabular-nums">
                          {b.fv_kwp != null ? `${Number(b.fv_kwp).toLocaleString("it-IT")} kWp` : "—"}
                        </TableCell>
                        <TableCell className="whitespace-nowrap tabular-nums">
                          {b.prezzo_offerta != null ? `${EURO_SENZA_CENTESIMI.format(Number(b.prezzo_offerta))} + IVA` : "—"}
                        </TableCell>
                      </>
                    )}
                    <TableCell>
                      {Number(b.sconto_bundle_pct) > 0 ? `${b.sconto_bundle_pct}%` : "—"}
                    </TableCell>
                    <TableCell>
                      <Switch
                        checked={b.attivo}
                        disabled={!puoModificare}
                        onCheckedChange={() => handleToggle(b)}
                        aria-label={`Attivo: ${b.nome}`}
                        title={!puoModificare ? senzaPermesso : undefined}
                        // Da telefono l'area di tocco supera i 44 px (l'interruttore da solo è alto 24).
                        className="max-md:relative max-md:before:absolute max-md:before:-inset-x-1 max-md:before:-inset-y-3 max-md:before:content-['']"
                      />
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-1">
                        <Button
                          size="icon"
                          variant="ghost"
                          onClick={() => openDuplicate(b)}
                          title={puoModificare ? "Duplica" : senzaPermesso}
                          aria-label={`Duplica il pacchetto ${b.nome}`}
                          disabled={!puoModificare}
                        >
                          <Copy className="h-4 w-4" aria-hidden="true" />
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          onClick={() => openEdit(b)}
                          title={puoModificare ? "Modifica" : "Apri (sola lettura)"}
                          aria-label={puoModificare ? `Modifica il pacchetto ${b.nome}` : `Apri il pacchetto ${b.nome}`}
                        >
                          <Pencil className="h-4 w-4" aria-hidden="true" />
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          disabled={!puoModificare}
                          onClick={() => setDeleteTarget(b)}
                          title={puoModificare ? "Elimina" : senzaPermesso}
                          aria-label={`Elimina il pacchetto ${b.nome}`}
                        >
                          <Trash2 className="h-4 w-4 text-destructive" aria-hidden="true" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* ── Finestra del pacchetto ─────────────────────────────────────────── */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        {/* Altezza massima e scorrimento li dà già DialogContent (90dvh): `90vh` copriva la barra di Safari su telefono. */}
        <DialogContent className="max-w-4xl">
          <DialogHeader>
            <DialogTitle>{!puoModificare ? "Pacchetto" : draft.id ? "Modifica pacchetto" : "Nuovo pacchetto"}</DialogTitle>
            <DialogDescription>
              Un pacchetto è un gruppo di voci già pronte, da aggiungere a un preventivo con un clic.
            </DialogDescription>
          </DialogHeader>

          {!puoModificare && (
            <Alert>
              <AlertDescription>
                Stai consultando questo pacchetto: per cambiarlo serve il permesso di modificare i pacchetti.
              </AlertDescription>
            </Alert>
          )}

          {/* In sola lettura il fieldset spegne ogni campo e ogni pulsante che contiene. */}
          <fieldset disabled={!puoModificare} className="m-0 min-w-0 space-y-4 border-0 p-0">
            {/* Dati del pacchetto */}
            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2">
                <Label htmlFor="pacchetto-nome" className="mb-1 block">Nome <span aria-hidden="true">*</span></Label>
                <Input
                  id="pacchetto-nome"
                  aria-required="true"
                  value={draft.nome}
                  onChange={(e) => setDraft((d) => ({ ...d, nome: e.target.value }))}
                  placeholder="Es. Bilocale standard — sostituzione 3 finestre + 1 portafinestra"
                />
              </div>
              <div className="col-span-2">
                <Label htmlFor="pacchetto-descrizione" className="mb-1 block">Descrizione</Label>
                <Textarea
                  id="pacchetto-descrizione"
                  value={draft.descrizione}
                  onChange={(e) => setDraft((d) => ({ ...d, descrizione: e.target.value }))}
                  rows={2}
                />
              </div>
              <div>
                <Label htmlFor="pacchetto-tipo-lavoro" className="mb-1 block">Tipo di lavoro</Label>
                <Select
                  value={draft.tipo_lavoro ?? ""}
                  onValueChange={(v) =>
                    setDraft((d) => ({ ...d, tipo_lavoro: (v || null) as BundleTipoLavoro | null }))
                  }
                >
                  <SelectTrigger id="pacchetto-tipo-lavoro">
                    <SelectValue placeholder="Scegli (facoltativo)" />
                  </SelectTrigger>
                  <SelectContent>
                    {TIPO_LAVORO_OPTIONS.map((o) => (
                      <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label htmlFor="pacchetto-sconto" className="mb-1 block">Sconto del pacchetto (%)</Label>
                <Input
                  id="pacchetto-sconto"
                  type="number"
                  min={0}
                  max={100}
                  step={0.5}
                  value={draft.sconto_bundle_pct}
                  onChange={(e) =>
                    setDraft((d) => ({ ...d, sconto_bundle_pct: Number(e.target.value) || 0 }))
                  }
                />
              </div>
            </div>

            {/* Kit fotovoltaico: potenza + prezzo d'offerta (li usa il preventivatore fotovoltaico: FotovoltaicoWizard, passo del kit) */}
            {isFvVertical && (
              <div className="border-t pt-4">
                <h3 className="font-semibold mb-1">Kit fotovoltaico</h3>
                <p className="text-xs text-muted-foreground mb-3">
                  Taglia e prezzo d'offerta del kit: il preventivatore fotovoltaico li usa quando scegli questo kit.
                  Le voci qui sotto sono facoltative: se le aggiungi, compaiono fra i «Componenti inclusi» nel PDF.
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div>
                    <Label htmlFor="pacchetto-fv-kwp" className="mb-1 block">Potenza (kWp)</Label>
                    <Input
                      id="pacchetto-fv-kwp"
                      type="number" min={0} step={0.1} inputMode="decimal"
                      value={draft.fv_kwp ?? ""}
                      onChange={(e) =>
                        setDraft((d) => ({ ...d, fv_kwp: e.target.value === "" ? null : Number(e.target.value) }))
                      }
                      placeholder="es. 6"
                    />
                  </div>
                  <div>
                    <Label htmlFor="pacchetto-fv-accumulo" className="mb-1 block">Accumulo (kWh)</Label>
                    <Input
                      id="pacchetto-fv-accumulo"
                      type="number" min={0} step={0.1} inputMode="decimal"
                      value={draft.fv_accumulo_kwh ?? ""}
                      onChange={(e) =>
                        setDraft((d) => ({ ...d, fv_accumulo_kwh: e.target.value === "" ? null : Number(e.target.value) }))
                      }
                      placeholder="0 = senza accumulo"
                    />
                  </div>
                  <div>
                    <Label htmlFor="pacchetto-fv-prezzo" className="mb-1 block">Prezzo offerta (€, IVA esclusa)</Label>
                    <Input
                      id="pacchetto-fv-prezzo"
                      type="number" min={0} step={1} inputMode="decimal"
                      value={draft.prezzo_offerta ?? ""}
                      onChange={(e) =>
                        setDraft((d) => ({ ...d, prezzo_offerta: e.target.value === "" ? null : Number(e.target.value) }))
                      }
                      placeholder="chiavi in mano, + IVA"
                    />
                  </div>
                </div>

                {/* Immagine di copertina del kit (usata nel PDF del preventivo fotovoltaico) */}
                <div className="mt-3" role="group" aria-labelledby="pacchetto-copertina-titolo">
                  <p id="pacchetto-copertina-titolo" className="mb-1 text-sm font-medium leading-none">Immagine di copertina del kit</p>
                  <p className="text-xs text-muted-foreground mb-2">
                    Compare nella pagina del kit, nel PDF del preventivo fotovoltaico.
                  </p>
                  <input
                    ref={coverInputRef}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) handleCoverUpload(f);
                      e.target.value = "";
                    }}
                  />
                  {draft.cover_image_url ? (
                    <div className="flex items-center gap-3">
                      <img
                        src={draft.cover_image_url}
                        alt="Copertina kit"
                        className="h-20 w-32 object-cover rounded border"
                      />
                      <div className="flex flex-col gap-1">
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          onClick={() => coverInputRef.current?.click()}
                          disabled={coverUploading}
                          aria-label={coverUploading ? "Caricamento dell'immagine di copertina…" : "Sostituisci l'immagine di copertina"}
                        >
                          {coverUploading ? "Caricamento…" : "Sostituisci"}
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          className="text-destructive"
                          onClick={() => setDraft((d) => ({ ...d, cover_image_url: null }))}
                          aria-label="Rimuovi l'immagine di copertina"
                        >
                          Rimuovi
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() => coverInputRef.current?.click()}
                      disabled={coverUploading}
                    >
                      {coverUploading ? "Caricamento…" : "Carica immagine"}
                    </Button>
                  )}
                </div>
              </div>
            )}

            {/* Voci */}
            <div className="border-t pt-4">
              <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
                <h3 className="font-semibold">Voci del pacchetto</h3>
                <div className="flex flex-wrap items-center gap-2" role="group" aria-labelledby="pacchetto-aggiungi-voce">
                  <span id="pacchetto-aggiungi-voce" className="text-sm text-muted-foreground">Aggiungi:</span>
                  <Button type="button" size="sm" variant="outline" onClick={() => addVoce("family")}>
                    <Home className="h-4 w-4 mr-1" aria-hidden="true" /> {TIPI_VOCE.family.nome}
                  </Button>
                  <Button type="button" size="sm" variant="outline" onClick={() => addVoce("product")}>
                    <Box className="h-4 w-4 mr-1" aria-hidden="true" /> {TIPI_VOCE.product.nome}
                  </Button>
                  <Button type="button" size="sm" variant="outline" onClick={() => addVoce("tariff")}>
                    <Wrench className="h-4 w-4 mr-1" aria-hidden="true" /> {TIPI_VOCE.tariff.nome}
                  </Button>
                </div>
              </div>

              {draft.voci.length === 0 ? (
                <div className="text-sm text-muted-foreground text-center py-6 border rounded-md">
                  Nessuna voce. Aggiungi un prodotto del listino, un articolo o una voce di manodopera e servizi.
                </div>
              ) : (
                <div className="space-y-2">
                  {draft.voci.map((v, idx) => (
                    <VoceRow
                      key={v._key}
                      index={idx}
                      voce={v}
                      families={families}
                      articoli={articoli}
                      tariffe={tariffe}
                      onUpdate={(patch) => updateVoce(v._key, patch)}
                      onRemove={() => removeVoce(v._key)}
                      uploadingImage={uploadingVoceKey === v._key}
                      onUploadImage={(f) => handleVoceImageUpload(v._key, f)}
                    />
                  ))}
                </div>
              )}
            </div>

            <div className="flex items-center gap-2">
              <Switch
                checked={draft.attivo}
                onCheckedChange={(v) => setDraft((d) => ({ ...d, attivo: v }))}
                id="bundle-attivo"
              />
              <Label htmlFor="bundle-attivo">Attivo: si può scegliere nel preventivo</Label>
            </div>
          </fieldset>

          {/* Il pulsante di salvataggio resta in vista anche con molte voci; se è spento dice perché. */}
          <div className="sticky bottom-0 z-10 space-y-2 border-t bg-background pt-3">
            {puoModificare && motivoNonSalvabile && (
              <p id="pacchetto-motivo" className="text-xs text-muted-foreground">{motivoNonSalvabile}</p>
            )}
            <DialogFooter>
              <Button variant="outline" onClick={() => setDialogOpen(false)}>
                {puoModificare ? "Annulla" : "Torna all'elenco"}
              </Button>
              <Button
                onClick={handleSave}
                disabled={!canSave || upsertMut.isPending || !puoModificare}
                aria-describedby={puoModificare && motivoNonSalvabile ? "pacchetto-motivo" : undefined}
                title={!puoModificare ? senzaPermesso : undefined}
              >
                {upsertMut.isPending ? "Salvataggio…" : draft.id ? "Salva modifiche" : "Crea pacchetto"}
              </Button>
            </DialogFooter>
          </div>
        </DialogContent>
      </Dialog>

      {/* ── Conferma di eliminazione ───────────────────────────────────────── */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(v) => !v && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Elimina pacchetto</AlertDialogTitle>
            <AlertDialogDescription>
              Vuoi eliminare il pacchetto &ldquo;{deleteTarget?.nome}&rdquo;? Non si può annullare.
              Se vuoi solo metterlo da parte, disattivalo.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annulla</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground">
              Elimina
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

// ─── VoceRow ─────────────────────────────────────────────────────────────────

interface VoceRowProps {
  index: number;
  voce: DraftVoce;
  families: ReturnType<typeof useFamilies>["families"];
  articoli: Array<{ id: string; name: string; unit_of_measure: string | null; immagine_url?: string | null }>;
  tariffe: Array<{ id: string; nome: string; unita: string | null }>;
  onUpdate: (patch: Partial<DraftVoce>) => void;
  onRemove: () => void;
  uploadingImage: boolean;
  onUploadImage: (file: File) => void;
}

function VoceRow({ index, voce, families, articoli, tariffe, onUpdate, onRemove, uploadingImage, onUploadImage }: VoceRowProps) {
  const uid = useId();
  const tipo = TIPI_VOCE[voce.type];
  const selectedFamily = families.find((f) => f.id === voce.family_id) ?? null;
  // La foto caricata sulla riga e' un'eccezione: se manca si usa quella del
  // prodotto di listino collegato, cosi' la si carica una volta sola nel
  // listino e la mostrano tutti i kit che contengono quel prodotto.
  const fotoDalListino: string | null =
    voce.type === "family"
      ? (selectedFamily?.immagine_url ?? null)
      : voce.type === "product"
        ? (articoli.find((a) => a.id === voce.prodotto_id)?.immagine_url ?? null)
        : null;
  const fotoMostrata = voce.immagine_url ?? fotoDalListino;
  const imgInputRef = useRef<HTMLInputElement | null>(null);
  const testoPulsanteFoto = uploadingImage
    ? "Caricamento…"
    : voce.immagine_url
      ? "Cambia foto"
      : fotoDalListino
        ? "Usa un'altra foto"
        : "Carica foto prodotto";

  return (
    // Il gruppo dà il numero della voce ai campi: «Quantità» ripetuto per ogni riga si legge «Voce 2: …, Quantità».
    <div role="group" aria-label={`Voce ${index + 1}: ${tipo.nome}`} className="border rounded-md p-3 bg-muted/30 space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Badge variant="secondary">#{index + 1}</Badge>
          <Badge variant="outline">{tipo.nome}</Badge>
        </div>
        <Button
          type="button"
          size="icon"
          variant="ghost"
          onClick={onRemove}
          title="Elimina la voce"
          aria-label={`Elimina la voce ${index + 1}`}
        >
          <Trash2 className="h-4 w-4 text-destructive" aria-hidden="true" />
        </Button>
      </div>

      <div className="grid grid-cols-12 gap-2">
        {/* Selezione item */}
        <div className="col-span-12 md:col-span-6">
          <Label htmlFor={`${uid}-voce`} className="text-xs mb-1 block">{tipo.nome}</Label>
          {voce.type === "family" && (
            <Select
              value={voce.family_id ?? ""}
              onValueChange={(v) => onUpdate({ family_id: v || null, axis_selections: {} })}
            >
              <SelectTrigger id={`${uid}-voce`}>
                <SelectValue placeholder={tipo.scegli} />
              </SelectTrigger>
              <SelectContent>
                {families.map((f) => (
                  <SelectItem key={f.id} value={f.id}>{f.nome}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          {voce.type === "product" && (
            <Select
              value={voce.prodotto_id ?? ""}
              onValueChange={(v) => onUpdate({ prodotto_id: v || null })}
            >
              <SelectTrigger id={`${uid}-voce`}>
                <SelectValue placeholder={tipo.scegli} />
              </SelectTrigger>
              <SelectContent>
                {articoli.map((a) => (
                  <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          {voce.type === "tariff" && (
            <Select
              value={voce.tariffa_id ?? ""}
              onValueChange={(v) => onUpdate({ tariffa_id: v || null })}
            >
              <SelectTrigger id={`${uid}-voce`}>
                <SelectValue placeholder={tipo.scegli} />
              </SelectTrigger>
              <SelectContent>
                {tariffe.map((t) => (
                  <SelectItem key={t.id} value={t.id}>{t.nome}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </div>

        <div className="col-span-6 md:col-span-3">
          <Label htmlFor={`${uid}-quantita`} className="text-xs mb-1 block">Quantità</Label>
          <Input
            id={`${uid}-quantita`}
            type="number"
            min={0.01}
            step={0.5}
            value={voce.quantita}
            onChange={(e) => onUpdate({ quantita: Number(e.target.value) || 1 })}
          />
        </div>

        <div className="col-span-6 md:col-span-3">
          <Label htmlFor={`${uid}-vano`} className="text-xs mb-1 block">Vano (facoltativo)</Label>
          <Input
            id={`${uid}-vano`}
            value={voce.vano_label}
            onChange={(e) => onUpdate({ vano_label: e.target.value })}
            placeholder="Es. Cucina"
          />
        </div>

        {/* Misure di partenza solo per i prodotti del listino */}
        {voce.type === "family" && (
          <>
            <div className="col-span-6 md:col-span-3">
              <Label htmlFor={`${uid}-larghezza`} className="text-xs mb-1 block">Larghezza di partenza (mm)</Label>
              <Input
                id={`${uid}-larghezza`}
                type="number"
                min={0}
                value={voce.larghezza_mm ?? ""}
                onChange={(e) =>
                  onUpdate({
                    larghezza_mm: e.target.value === "" ? null : Number(e.target.value),
                  })
                }
              />
            </div>
            <div className="col-span-6 md:col-span-3">
              <Label htmlFor={`${uid}-altezza`} className="text-xs mb-1 block">Altezza di partenza (mm)</Label>
              <Input
                id={`${uid}-altezza`}
                type="number"
                min={0}
                value={voce.altezza_mm ?? ""}
                onChange={(e) =>
                  onUpdate({
                    altezza_mm: e.target.value === "" ? null : Number(e.target.value),
                  })
                }
              />
            </div>
          </>
        )}

        {/* Scelte (colore, apertura…) solo per il prodotto del listino selezionato */}
        {voce.type === "family" && selectedFamily && selectedFamily.axes.length > 0 && (
          <div className="col-span-12 grid grid-cols-2 md:grid-cols-3 gap-2">
            {selectedFamily.axes.map((axis) => (
              <div key={axis.id}>
                <Label htmlFor={`${uid}-asse-${axis.codice}`} className="text-xs mb-1 block">{axis.nome}</Label>
                <Select
                  value={voce.axis_selections[axis.codice] ?? ""}
                  onValueChange={(val) =>
                    onUpdate({
                      axis_selections: { ...voce.axis_selections, [axis.codice]: val },
                    })
                  }
                >
                  <SelectTrigger id={`${uid}-asse-${axis.codice}`}>
                    <SelectValue placeholder="Facoltativo" />
                  </SelectTrigger>
                  <SelectContent>
                    {axis.values.map((val) => (
                      <SelectItem key={val.id} value={val.valore}>
                        {val.label || val.valore}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            ))}
          </div>
        )}

        {/* Foto della voce (nel PDF del preventivo fotovoltaico, fra i «Componenti inclusi») */}
        <div className="col-span-12 flex flex-wrap items-center gap-3 border-t pt-3">
          {fotoMostrata ? (
            <img
              src={fotoMostrata}
              alt={`Foto della voce ${index + 1}`}
              className="h-12 w-16 rounded object-cover border border-slate-200"
            />
          ) : (
            <div className="h-12 w-16 rounded border border-dashed border-slate-300 bg-muted" aria-hidden="true" />
          )}
          <input
            ref={imgInputRef}
            type="file"
            accept="image/png,image/jpeg,image/webp"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) onUploadImage(f);
              e.target.value = "";
            }}
          />
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={uploadingImage}
            onClick={() => imgInputRef.current?.click()}
            aria-label={`${testoPulsanteFoto} (voce ${index + 1})`}
          >
            {testoPulsanteFoto}
          </Button>
          {voce.immagine_url && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="text-destructive"
              onClick={() => onUpdate({ immagine_url: null })}
              aria-label={`Rimuovi la foto della voce ${index + 1}`}
            >
              Rimuovi
            </Button>
          )}
          <span className="basis-full text-xs text-muted-foreground sm:ml-auto sm:basis-auto">
            {voce.immagine_url
              ? "Foto scelta per questa voce"
              : fotoDalListino
                ? "Foto presa dal listino"
                : "Nessuna foto"}
          </span>
        </div>
      </div>
    </div>
  );
}
