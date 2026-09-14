/**
 * Listino prodotti — il contenitore della pagina.
 *
 * Carica prodotti, tipologie (macrocategorie) e linee (categorie), li
 * ricompone in area → tipologia → linea → prodotti (lib/listino/lineeListino)
 * e li passa al navigatore. Qui stanno lo stato che deve sopravvivere (la
 * selezione nell'indirizzo, la vista, i filtri) e tutte le azioni che
 * scrivono: attiva/disattiva, duplica, sposta, elimina, cestino, crea le
 * tipologie standard e le linee, collega una tipologia al preventivatore
 * della sua area.
 */
import { useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import {
  AlertTriangle,
  FileSpreadsheet,
  ImageOff,
  Info,
  Layers,
  Loader2,
  Package,
  Sparkles,
  Trash,
  Trash2,
  Undo2,
  Wand2,
} from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";
import { usePermissions } from "@/hooks/usePermissions";
import { useOrganizzaListino } from "@/hooks/useOrganizzaListino";
import { FamilyTemplatePicker } from "./FamilyTemplatePicker";
import { ImpostaStandardSerramentiDialog } from "./ImpostaStandardSerramentiDialog";
import { ImportaSerieDialog } from "./ImportaSerieDialog";
import { ListinoBarra, type AzioneImporta, type VistaListino } from "./ListinoBarra";
import { ListinoNavigatore } from "./ListinoNavigatore";
import { NuovaAreaDialog } from "./NuovaAreaDialog";
import { NuovaLineaDialog, type DatiLineaAsse } from "./NuovaLineaDialog";
import { NuovaTipologiaDialog, type DatiCopiaTipologia, type ModoNuovaTipologia } from "./NuovaTipologiaDialog";
import { PrezziLineeDialog, type DatiPrezziLinee } from "./PrezziLineeDialog";
import { VariantiTipologiaDialog } from "./VariantiTipologiaDialog";
import { SchedaLineaDialog } from "./SchedaLineaDialog";
import { toGallerySlug } from "@/lib/verticalMapping";
import { useFamilies, useFamiliesCestino } from "@/hooks/useFamilies";
import { useFamilyMutations } from "@/hooks/useFamilyMutations";
import {
  useListinoMacrocategorie,
  useMacrocategorieMutations,
  type MacrocategoriaPayload,
} from "@/hooks/useListinoMacrocategorie";
import { useCategorieMutations, useListinoCategorie } from "@/hooks/useListinoCategorie";
import { useSchedeLinea } from "@/hooks/useSchedeLinea";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { ArticleFamily, FamilyWithAxes } from "@/types/articleFamily";
import { areaDiVerticale, chiaveTesto, type AreaStandard, type TipologiaStandard } from "@/lib/listino/areeStandard";
import { FILTRI_LISTINO_VUOTI, filtriAttivi, rigaPassa, type FiltriListino } from "@/lib/listino/filtriListino";
import {
  costruisciListino,
  filtraListino,
  risolviSelezione,
  type AreaListino,
  type LineaListino,
  type SelezioneListino,
  type TipologiaListino,
} from "@/lib/listino/lineeListino";
import { trovaSchedaLinea } from "@/lib/listino/schedeLinea";
import {
  lineeDaAsse,
  nomeTipologiaLibero,
  percentualeVariante,
  prezzoMqPrevalente,
  riepilogoVarianti,
  tipologiaDaRiusare,
  tipologiaDiArea,
  type AsseVariantiDati,
} from "@/lib/listino/organizzaListino";
import { CODICE_ASSE, VALORE_COLORE, VALORE_VETRO } from "@/lib/listino/standardSerramenti";
import { translateListinoError } from "@/lib/listinoErrors";

/** Valore dei select per «nessuna tipologia» e «nessuna linea». */
const NESSUNA = "__nessuna__";
const LS_VISTA = "listino:view";

function messaggioErrore(err: unknown): string {
  return err instanceof Error ? err.message : "Errore sconosciuto";
}

interface FamilyCatalogProps {
  /** Apre la gestione delle tipologie, che vive nella pagina che ospita il listino. */
  onGestisciTipologie?: () => void;
}

export function FamilyCatalog({ onGestisciTipologie }: FamilyCatalogProps = {}) {
  const navigate = useNavigate();
  const [parametri, setParametri] = useSearchParams();
  const { role, effectiveCompany } = useAuth();
  const permessi = usePermissions();
  // Aree e tipologie le crea l'amministratore (è la regola del database sulle
  // tipologie); prodotti, linee e prezzi anche chi ha il permesso di modificare
  // il listino, come la pagina che lo ospita.
  const gestore = role === "company_admin" || role === "super_admin";
  const isAdmin = gestore || permessi.canEditSettingsPricing;
  const companyId = effectiveCompany?.id ?? null;

  // includeInactive: la pagina di gestione mostra anche i disattivati, per
  // poterli riattivare. Il preventivatore usa useFamilies() → solo attivi.
  const {
    families,
    isLoading,
    isError: errorFamilies,
    refetch: refetchFamilies,
  } = useFamilies({ includeInactive: true });
  const {
    cestino,
    isLoading: loadingCestino,
    isError: errorCestino,
    refetch: refetchCestino,
  } = useFamiliesCestino();
  const { macrocategorie } = useListinoMacrocategorie();
  const { categorie } = useListinoCategorie();
  const { deleteFamily, restoreFamily, hardDeleteFamily, duplicateFamily, updateFamily } = useFamilyMutations();
  const { createMacrocategoria, updateMacrocategoria } = useMacrocategorieMutations();
  const { createCategoria } = useCategorieMutations();
  const { aggiungiLinea, allineaLinee, prezziLinee, copiaTipologia, variantiTipologia } = useOrganizzaListino();
  const { indice: schedeLinea } = useSchedeLinea();

  const [vista, setVistaStato] = useState<VistaListino>(() => {
    try {
      return localStorage.getItem(LS_VISTA) === "table" ? "table" : "cards";
    } catch {
      return "cards";
    }
  });
  const setVista = (valore: VistaListino) => {
    setVistaStato(valore);
    try {
      localStorage.setItem(LS_VISTA, valore);
    } catch {
      // localStorage non disponibile: la vista vale fino al prossimo caricamento
    }
  };
  const [cerca, setCerca] = useState("");
  const [filtri, setFiltri] = useState<FiltriListino>(FILTRI_LISTINO_VUOTI);

  const aree = useMemo(
    () => costruisciListino(families, macrocategorie, categorie),
    [families, macrocategorie, categorie],
  );
  const cercando = cerca.trim() !== "" || filtriAttivi(filtri) > 0;
  const visibili = useMemo(
    () => (cercando ? filtraListino(aree, (r) => rigaPassa(r, cerca, filtri)) : aree),
    [aree, cercando, cerca, filtri],
  );

  // La selezione sta nell'indirizzo: il tasto indietro e un link mandato a un
  // collega riportano alla stessa linea.
  const selezione: SelezioneListino = {
    area: parametri.get("area"),
    tipologia: parametri.get("tipologia"),
    linea: parametri.get("linea"),
  };
  const scelta = risolviSelezione(visibili, selezione);
  const cambiaSelezione = (nuova: SelezioneListino) => {
    setParametri(
      (prima) => {
        const dopo = new URLSearchParams(prima);
        for (const chiave of ["area", "tipologia", "linea"] as const) {
          const valore = nuova[chiave];
          if (valore) dopo.set(chiave, valore);
          else dopo.delete(chiave);
        }
        return dopo;
      },
      { replace: true },
    );
  };

  const haSerramenti = useMemo(
    () => families.some((f) => areaDiVerticale(f.vertical) === "serramenti"),
    [families],
  );

  const [templatePickerOpen, setTemplatePickerOpen] = useState(false);
  const [standardSerramentiOpen, setStandardSerramentiOpen] = useState(false);
  const [serieOpen, setSerieOpen] = useState(false);
  const [toDelete, setToDelete] = useState<FamilyWithAxes | null>(null);
  const [toDuplicate, setToDuplicate] = useState<FamilyWithAxes | null>(null);
  const [dupName, setDupName] = useState("");
  // Destinazione della copia. "same" = resta dov'è: il caso vero è la stessa
  // Finestra 2 Ante in un altro materiale, copiata con il suo prezzo.
  const [dupMacroId, setDupMacroId] = useState<string>("same");
  const [dupPrezzo, setDupPrezzo] = useState("");
  const [toMove, setToMove] = useState<FamilyWithAxes | null>(null);
  const [moveMacroId, setMoveMacroId] = useState<string>(NESSUNA);
  const [moveLineaId, setMoveLineaId] = useState<string>(NESSUNA);
  const [cestinoOpen, setCestinoOpen] = useState(false);
  // L'ora si legge quando si apre il cestino, non a ogni disegno della pagina:
  // i giorni residui sono quelli del momento in cui lo si guarda.
  const [aperturaCestino, setAperturaCestino] = useState(0);
  const [toHardDelete, setToHardDelete] = useState<ArticleFamily | null>(null);
  const [nuovaLinea, setNuovaLinea] = useState<{ area: AreaListino; tipologia: TipologiaListino } | null>(null);
  const [nuovaArea, setNuovaArea] = useState(false);
  const [nuovaTipologia, setNuovaTipologia] = useState<{
    area: AreaListino;
    modo: ModoNuovaTipologia;
    origine: TipologiaListino | null;
  } | null>(null);
  const [prezziAperti, setPrezziAperti] = useState<TipologiaListino | null>(null);
  const [variantiAperte, setVariantiAperte] = useState<TipologiaListino | null>(null);
  const [daAllineare, setDaAllineare] = useState<TipologiaListino | null>(null);
  const [creazioneInCorso, setCreazioneInCorso] = useState(false);
  const [schedaAperta, setSchedaAperta] = useState<{ tipologia: TipologiaListino; linea: LineaListino } | null>(null);
  // Ogni riga resta bloccata finché la SUA modifica non è conclusa: con
  // l'isPending della mutation un secondo clic veloce annullava il primo.
  const [togglePendingIds, setTogglePendingIds] = useState<Set<string>>(() => new Set());

  const macroScelta = scelta.tipologia?.macrocategoriaId ?? null;

  // La tipologia «Serramenti» dell'area serramenti: le sue linee e il suo prezzo
  // sono il punto di partenza di «Prezzi delle linee infissi», e lì finiscono i
  // modelli installati con una serie di profilo.
  const tipologiaSerramenti = useMemo(
    () =>
      aree
        .find((a) => a.chiave === "serramenti")
        ?.tipologie.find((t) => t.standard?.nome === "Serramenti" && !!t.macrocategoriaId) ?? null,
    [aree],
  );
  const lineeSerramenti = useMemo(() => {
    if (!tipologiaSerramenti) return undefined;
    const linee = lineeDaAsse(tipologiaSerramenti).filter((l) => l.scostamentoPct != null);
    return [...linee.filter((l) => l.base), ...linee.filter((l) => !l.base)].map((l) => ({
      nome: l.nome,
      materiale: "",
      differenzaPct: l.scostamentoPct ?? 0,
    }));
  }, [tipologiaSerramenti]);
  const prezzoSerramenti = useMemo(
    () => (tipologiaSerramenti ? prezzoMqPrevalente(tipologiaSerramenti) : null),
    [tipologiaSerramenti],
  );
  // Colore e vetro di oggi: «Imposta il listino infissi» parte da questi e non da zero.
  const opzioniSerramenti = useMemo(() => {
    if (!tipologiaSerramenti) return null;
    const varianti = riepilogoVarianti(tipologiaSerramenti);
    return {
      coloreStandard: percentualeVariante(varianti, CODICE_ASSE.colore, VALORE_COLORE.standard),
      coloreFuori: percentualeVariante(varianti, CODICE_ASSE.colore, VALORE_COLORE.fuoriStandard),
      antisonoro: percentualeVariante(varianti, CODICE_ASSE.vetro, VALORE_VETRO.antisonoro),
      antisfondamento: percentualeVariante(varianti, CODICE_ASSE.vetro, VALORE_VETRO.antisfondamento),
    };
  }, [tipologiaSerramenti]);

  /** Le tipologie per i select, divise per area; quelle vuote e senza area in fondo. */
  const opzioniTipologie = useMemo(() => {
    const viste = new Set<string>();
    const gruppi = aree
      .map((a) => ({
        etichetta: `Area ${a.nome}`,
        tipologie: a.tipologie.flatMap((t) => {
          if (!t.macrocategoriaId) return [];
          viste.add(t.macrocategoriaId);
          return [{ id: t.macrocategoriaId, nome: t.nome }];
        }),
      }))
      .filter((g) => g.tipologie.length > 0);
    const altre = macrocategorie.filter((m) => !viste.has(m.id)).map((m) => ({ id: m.id, nome: m.nome }));
    return altre.length > 0 ? [...gruppi, { etichetta: "Altre tipologie", tipologie: altre }] : gruppi;
  }, [aree, macrocategorie]);

  /** Le linee in cui si può spostare un prodotto: le categorie vere della tipologia. */
  const lineeDi = (macroId: string): Array<{ id: string; nome: string }> => {
    const tipologia = aree.flatMap((a) => a.tipologie).find((t) => t.macrocategoriaId === macroId);
    if (tipologia) {
      return tipologia.linee.flatMap((l) => (l.categoriaId ? [{ id: l.categoriaId, nome: l.nome }] : []));
    }
    return categorie.filter((c) => c.macrocategoria_id === macroId).map((c) => ({ id: c.id, nome: c.nome }));
  };

  const markTogglePending = (id: string, pending: boolean) => {
    setTogglePendingIds((prev) => {
      const next = new Set(prev);
      if (pending) next.add(id);
      else next.delete(id);
      return next;
    });
  };

  const toggleAttivo = async (f: FamilyWithAxes) => {
    if (togglePendingIds.has(f.id)) return;
    markTogglePending(f.id, true);
    try {
      await updateFamily.mutateAsync({ id: f.id, patch: { attivo: !f.attivo } });
      toast.success(f.attivo ? "Prodotto disattivato" : "Prodotto riattivato");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Errore nell'aggiornamento");
    } finally {
      markTogglePending(f.id, false);
    }
  };

  const togglePreventivo = async (f: FamilyWithAxes) => {
    if (togglePendingIds.has(f.id)) return;
    const eraVisibile = f.mostra_preventivo !== false;
    markTogglePending(f.id, true);
    try {
      await updateFamily.mutateAsync({ id: f.id, patch: { mostra_preventivo: !eraVisibile } });
      toast.success(eraVisibile ? "Nascosto dai preventivi" : "Proposto nei preventivi");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Errore nell'aggiornamento");
    } finally {
      markTogglePending(f.id, false);
    }
  };

  const chiudiDuplica = () => {
    setToDuplicate(null);
    setDupName("");
    setDupMacroId("same");
    setDupPrezzo("");
  };

  const handleDuplicate = async () => {
    if (!toDuplicate || !dupName.trim()) return;
    // Virgola decimale all'italiana: "450,50" → 450.5.
    const prezzoParsed = dupPrezzo.trim() === ""
      ? undefined
      : Number(dupPrezzo.trim().replace(/\./g, "").replace(",", "."));
    if (prezzoParsed != null && (!Number.isFinite(prezzoParsed) || prezzoParsed < 0)) {
      toast.error("Prezzo non valido", { description: "Scrivi un numero, per esempio 800 o 550,50" });
      return;
    }
    try {
      const newId = await duplicateFamily.mutateAsync({
        sourceId: toDuplicate.id,
        newName: dupName.trim(),
        targetMacrocategoriaId: dupMacroId !== "same" ? dupMacroId : undefined,
        newPrezzoVendita: prezzoParsed,
      });
      toast.success("Prodotto duplicato");
      chiudiDuplica();
      navigate(`/azienda/impostazioni/listino/famiglie/${newId}`);
    } catch (err) {
      toast.error("Duplicazione non riuscita", { description: messaggioErrore(err) });
    }
  };

  const handleDelete = async () => {
    if (!toDelete) return;
    try {
      await deleteFamily.mutateAsync(toDelete.id);
      toast.success("Prodotto eliminato", {
        description: "Spostato nel cestino. Verrà rimosso definitivamente fra 15 giorni.",
      });
      setToDelete(null);
    } catch (err) {
      toast.error("Eliminazione non riuscita", { description: messaggioErrore(err) });
    }
  };

  const openMove = (f: FamilyWithAxes) => {
    const categoria = f.categoria_id ? categorie.find((c) => c.id === f.categoria_id) : undefined;
    const macroId = f.macrocategoria_id ?? categoria?.macrocategoria_id ?? null;
    setMoveMacroId(macroId ?? NESSUNA);
    setMoveLineaId(macroId && categoria && lineeDi(macroId).some((l) => l.id === categoria.id) ? categoria.id : NESSUNA);
    setToMove(f);
  };

  const handleMove = async (familyId: string) => {
    try {
      const macro = moveMacroId === NESSUNA ? null : moveMacroId;
      const linea = macro && moveLineaId !== NESSUNA ? moveLineaId : null;
      await updateFamily.mutateAsync({
        id: familyId,
        patch: { macrocategoria_id: macro, categoria_id: linea } as never,
      });
      toast.success("Prodotto spostato");
      setToMove(null);
    } catch (err) {
      toast.error("Spostamento non riuscito", { description: messaggioErrore(err) });
    }
  };

  const handleRestore = async (id: string) => {
    try {
      await restoreFamily.mutateAsync(id);
      toast.success("Prodotto ripristinato");
    } catch (err) {
      const testo = messaggioErrore(err);
      toast.error("Ripristino non riuscito", {
        description: /duplicate key|23505/i.test(testo)
          ? "C'è già un prodotto attivo con lo stesso nome: rinominalo o disattivalo, poi ripristina questo."
          : testo,
      });
    }
  };

  const handleHardDelete = async () => {
    if (!toHardDelete) return;
    try {
      await hardDeleteFamily.mutateAsync(toHardDelete.id);
      toast.success("Prodotto eliminato definitivamente");
      setToHardDelete(null);
    } catch (err) {
      toast.error("Eliminazione definitiva non riuscita", { description: messaggioErrore(err) });
    }
  };

  /** Il conto alla rovescia dei 15 giorni del cestino. */
  const formatTempoResiduo = (deletedAt: string): string => {
    const delta = aperturaCestino - new Date(deletedAt).getTime();
    const giorniPassati = Math.floor(delta / (1000 * 60 * 60 * 24));
    const giorniResidui = Math.max(0, 15 - giorniPassati);
    if (giorniResidui <= 0) return "eliminazione imminente";
    if (giorniResidui === 1) return "1 giorno residuo";
    return `${giorniResidui} giorni residui`;
  };

  const prossimoOrdine = () => Math.max(0, ...macrocategorie.map((m) => Number(m.sort_order) || 0)) + 10;

  /**
   * Una tipologia standard nasce già collegata al preventivatore della sua area
   * (verticali_abilitati) e, nel fotovoltaico, allo slot del configuratore.
   * Il nome è unico nell'azienda: «Accessori» in una seconda area diventa
   * «Accessori Fotovoltaico», invece di finire in un errore del database. Una
   * vecchia tipologia vuota con lo stesso nome, che il listino non mostra, si
   * riusa.
   */
  const creaStandard = async (
    areaStd: AreaStandard,
    standard: TipologiaStandard,
    ordine: number,
    nomiGiaUsati: Array<{ nome: string }>,
  ): Promise<string> => {
    const collegamento = {
      verticali_abilitati: [areaStd.verticale],
      tipologia: tipologiaDiArea(areaStd.chiave),
      fv_categoria: standard.fvCategoria,
      categoria_tipo: standard.accessorio ? ("accessorio" as const) : ("principale" as const),
    };
    const daRiusare = tipologiaDaRiusare(standard.nome, macrocategorie, aree);
    if (daRiusare) {
      const riusata = await updateMacrocategoria.mutateAsync({
        id: daRiusare.id,
        patch: { ...collegamento, attivo: true, sort_order: ordine },
      });
      return riusata.id;
    }
    const nome = nomeTipologiaLibero(standard.nome, nomiGiaUsati, areaStd.nome);
    nomiGiaUsati.push({ nome });
    const payload: MacrocategoriaPayload = { nome, ...collegamento, sort_order: ordine };
    const creata = await createMacrocategoria.mutateAsync(payload);
    return creata.id;
  };

  const creaTipologia = async (area: AreaListino, standard: TipologiaStandard) => {
    if (creazioneInCorso || !area.standard) return;
    setCreazioneInCorso(true);
    try {
      const id = await creaStandard(area.standard, standard, prossimoOrdine(), [...macrocategorie]);
      toast.success(`Tipologia «${standard.nome}» aggiunta all'area ${area.nome}`);
      setNuovaTipologia(null);
      cambiaSelezione({ area: area.chiave, tipologia: `macro:${id}` });
    } catch (err) {
      toast.error("Tipologia non creata", { description: translateListinoError(err).message });
    } finally {
      setCreazioneInCorso(false);
    }
  };

  const creaTutteStandard = async (area: AreaListino) => {
    if (creazioneInCorso || !area.standard) return;
    setCreazioneInCorso(true);
    const base = prossimoOrdine();
    const nomi = [...macrocategorie];
    let create = 0;
    try {
      for (const [i, standard] of area.mancanti.entries()) {
        await creaStandard(area.standard, standard, base + i * 10, nomi);
        create += 1;
      }
      toast.success(`${create} tipologie standard aggiunte all'area ${area.nome}`);
      setNuovaTipologia(null);
    } catch (err) {
      toast.error(create > 0 ? `Aggiunte ${create} tipologie su ${area.mancanti.length}` : "Tipologie non create", {
        description: translateListinoError(err).message,
      });
    } finally {
      setCreazioneInCorso(false);
    }
  };

  /** «+ Area»: le tipologie standard scelte, e l'area c'è. */
  const creaArea = async (areaStd: AreaStandard, tipologie: TipologiaStandard[]) => {
    if (creazioneInCorso || tipologie.length === 0) return;
    setCreazioneInCorso(true);
    const base = prossimoOrdine();
    const nomi = [...macrocategorie];
    let create = 0;
    let prima: string | null = null;
    try {
      for (const [i, standard] of tipologie.entries()) {
        const id = await creaStandard(areaStd, standard, base + i * 10, nomi);
        prima = prima ?? id;
        create += 1;
      }
      toast.success(`Area ${areaStd.nome} aggiunta con ${create} ${create === 1 ? "tipologia" : "tipologie"}`);
      setNuovaArea(false);
      cambiaSelezione({ area: areaStd.chiave, tipologia: prima ? `macro:${prima}` : null });
    } catch (err) {
      toast.error(create > 0 ? `Create ${create} tipologie su ${tipologie.length}` : "Area non aggiunta", {
        description: translateListinoError(err).message,
      });
    } finally {
      setCreazioneInCorso(false);
    }
  };

  /** Una tipologia su misura nell'area che si sta guardando. */
  const creaTipologiaSuMisura = async (area: AreaListino, dati: { nome: string; accessorio: boolean }) => {
    if (creazioneInCorso) return;
    setCreazioneInCorso(true);
    try {
      // L'etichetta dell'area fa vedere la tipologia anche vuota. «Generale» non ne ha una.
      const etichetta = area.standard?.verticale ?? (area.chiave !== "generale" ? area.chiave : null);
      const payload: MacrocategoriaPayload = {
        nome: dati.nome,
        verticali_abilitati: etichetta ? [etichetta] : [],
        tipologia: etichetta ? tipologiaDiArea(area.chiave) : null,
        categoria_tipo: dati.accessorio ? "accessorio" : "principale",
        sort_order: prossimoOrdine(),
      };
      const creata = await createMacrocategoria.mutateAsync(payload);
      toast.success(
        `Tipologia «${creata.nome}» creata nell'area ${area.nome}`,
        etichetta ? undefined : { description: "Compare nel listino quando ci metti il primo prodotto." },
      );
      setNuovaTipologia(null);
      cambiaSelezione({ area: area.chiave, tipologia: `macro:${creata.id}` });
    } catch (err) {
      toast.error("Tipologia non creata", { description: translateListinoError(err).message });
    } finally {
      setCreazioneInCorso(false);
    }
  };

  const copia = async (area: AreaListino, dati: DatiCopiaTipologia) => {
    const origineId = dati.origine.macrocategoriaId;
    if (!origineId || copiaTipologia.isPending) return;
    try {
      const esito = await copiaTipologia.mutateAsync({
        macrocategoriaId: origineId,
        nome: dati.nome,
        suffissoProdotti: dati.suffisso || null,
        variazionePct: dati.variazionePct,
        conProdotti: dati.conProdotti,
      });
      toast.success(`Tipologia «${esito.nome}» creata da ${dati.origine.nome}`, {
        description: dati.conProdotti
          ? `${esito.prodotti} ${esito.prodotti === 1 ? "prodotto copiato" : "prodotti copiati"}${esito.linee > 0 ? `, ${esito.linee} linee` : ""}.`
          : "Senza prodotti: la trovi vuota, con le sue linee.",
      });
      setNuovaTipologia(null);
      cambiaSelezione({ area: area.chiave, tipologia: `macro:${esito.id}` });
    } catch (err) {
      toast.error("Tipologia non copiata", { description: messaggioErrore(err) });
    }
  };

  /** Fuori dai preventivi o di nuovo dentro: la tipologia resta nel listino con i suoi prodotti. */
  const attivaTipologia = async (tipologia: TipologiaListino) => {
    if (!tipologia.macrocategoriaId) return;
    try {
      await updateMacrocategoria.mutateAsync({ id: tipologia.macrocategoriaId, patch: { attivo: !tipologia.attiva } });
      toast.success(
        tipologia.attiva ? `«${tipologia.nome}» tolta dai preventivi` : `«${tipologia.nome}» di nuovo nei preventivi`,
        tipologia.attiva
          ? { description: "Resta nel listino con i suoi prodotti; i preventivi già fatti non cambiano." }
          : undefined,
      );
    } catch (err) {
      toast.error("Modifica non riuscita", { description: messaggioErrore(err) });
    }
  };

  const collega = async (area: AreaListino, tipologia: TipologiaListino) => {
    if (!area.standard || !tipologia.macrocategoriaId) return;
    try {
      await updateMacrocategoria.mutateAsync({
        id: tipologia.macrocategoriaId,
        patch: { verticali_abilitati: [area.standard.verticale] },
      });
      toast.success(`«${tipologia.nome}» ora compare nel ${(area.standard.preventivatore ?? "preventivatore").toLowerCase()}`);
    } catch (err) {
      toast.error("Collegamento non riuscito", { description: messaggioErrore(err) });
    }
  };

  /** Tapparelle, zanzariere, cassonetti: nel preventivatore si aggiungono alla finestra. */
  const mettiFraGliAccessori = async (tipologia: TipologiaListino) => {
    if (!tipologia.macrocategoriaId) return;
    try {
      await updateMacrocategoria.mutateAsync({
        id: tipologia.macrocategoriaId,
        patch: { categoria_tipo: "accessorio" },
      });
      toast.success(`«${tipologia.nome}» ora si aggiunge alla finestra, fra gli accessori del preventivatore`);
    } catch (err) {
      toast.error("Modifica non riuscita", { description: messaggioErrore(err) });
    }
  };

  const chiudiNuovaLinea = () => setNuovaLinea(null);

  /** Linea-cartella: prodotti diversi dentro la tipologia (tapparelle in PVC e in alluminio). */
  const salvaLineaCartella = async (nome: string) => {
    const macroId = nuovaLinea?.tipologia.macrocategoriaId;
    if (!nuovaLinea || !macroId) return;
    // In fondo alle linee che ci sono: prima l'ordine era il numero di linee e
    // poteva coincidere con quello di una linea esistente.
    const ordine =
      Math.max(-1, ...categorie.filter((c) => c.macrocategoria_id === macroId).map((c) => Number(c.sort_order) || 0)) + 1;
    try {
      const creata = await createCategoria.mutateAsync({ nome, macrocategoria_id: macroId, sort_order: ordine });
      toast.success(`Linea «${creata.nome}» creata in ${nuovaLinea.tipologia.nome}`, {
        description: "Sposta i prodotti nella linea dal menu di ogni prodotto.",
      });
      cambiaSelezione({ area: nuovaLinea.area.chiave, tipologia: nuovaLinea.tipologia.chiave, linea: `cat:${creata.id}` });
      chiudiNuovaLinea();
    } catch (err) {
      toast.error("Linea non creata", { description: translateListinoError(err).message });
    }
  };

  /** Linea sugli stessi modelli: un valore dell'asse «Linea» di ogni prodotto, con lo scostamento. */
  const salvaLineaAsse = async (dati: DatiLineaAsse) => {
    const macroId = nuovaLinea?.tipologia.macrocategoriaId;
    if (!nuovaLinea || !macroId) return;
    try {
      const esito = await aggiungiLinea.mutateAsync({ macrocategoriaId: macroId, ...dati });
      const parti = [
        esito.aggiunte > 0 ? `aggiunta a ${esito.aggiunte} ${esito.aggiunte === 1 ? "prodotto" : "prodotti"}` : null,
        esito.riattivate > 0 ? `riaccesa su ${esito.riattivate}` : null,
        esito.gia_presenti > 0 ? `c'era già su ${esito.gia_presenti}` : null,
        esito.saltati > 0 ? `${esito.saltati} senza linee non l'hanno ricevuta` : null,
      ].filter(Boolean);
      const testo = parti.join(", ");
      toast.success(`Linea «${esito.linea}» in ${nuovaLinea.tipologia.nome}`, {
        description: testo ? `${testo.charAt(0).toUpperCase()}${testo.slice(1)}.` : undefined,
      });
      cambiaSelezione({
        area: nuovaLinea.area.chiave,
        tipologia: nuovaLinea.tipologia.chiave,
        linea: `linea:${chiaveTesto(dati.nome)}`,
      });
      chiudiNuovaLinea();
    } catch (err) {
      toast.error("Linea non creata", { description: messaggioErrore(err) });
    }
  };

  const salvaPrezzi = async (dati: DatiPrezziLinee) => {
    const tipologia = prezziAperti;
    if (!tipologia?.macrocategoriaId) return;
    try {
      const esito = await prezziLinee.mutateAsync({ macrocategoriaId: tipologia.macrocategoriaId, ...dati });
      toast.success(`Prezzi delle linee di ${tipologia.nome} salvati`, {
        description:
          esito.prodotti_prezzo > 0 ? `Nuovo prezzo al m² su ${esito.prodotti_prezzo} prodotti.` : undefined,
      });
      setPrezziAperti(null);
    } catch (err) {
      toast.error("Prezzi non salvati", { description: messaggioErrore(err) });
    }
  };

  const salvaVarianti = async (assi: AsseVariantiDati[]) => {
    const tipologia = variantiAperte;
    if (!tipologia?.macrocategoriaId) return;
    try {
      const esito = await variantiTipologia.mutateAsync({ macrocategoriaId: tipologia.macrocategoriaId, assi });
      const dettagli = [
        esito.valori > 0 ? `${esito.valori} valori aggiornati` : null,
        esito.elenchi > 0 ? `${esito.elenchi} ${esito.elenchi === 1 ? "elenco aggiornato" : "elenchi aggiornati"}` : null,
        esito.aggiunti > 0 ? `${esito.aggiunti} aggiunti dove mancavano` : null,
        esito.assi > 0 ? `variante messa in ${esito.assi} ${esito.assi === 1 ? "prodotto" : "prodotti"}` : null,
      ].filter(Boolean);
      toast.success(`Colori e varianti di ${tipologia.nome} salvati`, {
        description: dettagli.length > 0 ? `${dettagli.join(", ")}.` : undefined,
      });
      setVariantiAperte(null);
    } catch (err) {
      toast.error("Varianti non salvate", { description: messaggioErrore(err) });
    }
  };

  const allinea = async () => {
    const tipologia = daAllineare;
    if (!tipologia?.macrocategoriaId) return;
    try {
      const esito = await allineaLinee.mutateAsync(tipologia.macrocategoriaId);
      toast.success(
        `${esito.prodotti} ${esito.prodotti === 1 ? "prodotto ha" : "prodotti hanno"} ora le ${esito.linee} linee di ${tipologia.nome}`,
      );
      setDaAllineare(null);
    } catch (err) {
      toast.error("Linee non assegnate", { description: messaggioErrore(err) });
    }
  };

  const nuovoProdotto = (_area: AreaListino | null, tipologia: TipologiaListino | null, linea: LineaListino | null) => {
    const q = new URLSearchParams();
    if (tipologia?.macrocategoriaId) q.set("tipologia", tipologia.macrocategoriaId);
    if (linea?.categoriaId) q.set("linea", linea.categoriaId);
    // Nei listini senza tipologie la «tipologia» è una categoria: il prodotto nuovo
    // ci va dentro, invece di finire in «Senza tipologia».
    else if (tipologia?.fonte === "categoria" && tipologia.categoriaId) q.set("linea", tipologia.categoriaId);
    const suffisso = q.toString();
    navigate(`/azienda/impostazioni/listino/famiglie/nuova${suffisso ? `?${suffisso}` : ""}`);
  };

  const azioniImporta: AzioneImporta[] = [
    { etichetta: "Excel o CSV", descrizione: "Da un foglio di calcolo", icona: FileSpreadsheet, href: "/azienda/impostazioni/listino/import" },
    { etichetta: "Listino fornitore in PDF", descrizione: "Letto dall'intelligenza artificiale", icona: Sparkles, href: "/azienda/impostazioni/listino/import?tab=ai" },
    ...(companyId
      ? [
          { etichetta: "Modelli pronti", descrizione: "Tipologie con disegno e variabili", icona: Package, onClick: () => setTemplatePickerOpen(true) },
          { etichetta: "Serie di profilo", descrizione: "Marca e serie diventano una linea", icona: Layers, onClick: () => setSerieOpen(true) },
          ...(haSerramenti
            ? [{ etichetta: "Prezzi delle linee infissi", descrizione: "Prezzo al metro quadro e scostamenti", icona: Wand2, onClick: () => setStandardSerramentiOpen(true) }]
            : []),
        ]
      : []),
  ];

  const lineaContenitore = scelta.linea?.fonte === "categoria" ? scelta.linea : null;

  return (
    <div className="space-y-3">
      <ListinoBarra
        cerca={cerca}
        onCerca={setCerca}
        filtri={filtri}
        onFiltri={setFiltri}
        vista={vista}
        onVista={setVista}
        isAdmin={isAdmin}
        cestino={cestino.length}
        onCestino={() => {
          setAperturaCestino(Date.now());
          setCestinoOpen(true);
          void refetchCestino();
        }}
        onTipologie={onGestisciTipologie}
        azioniImporta={azioniImporta}
        onNuovoProdotto={() => nuovoProdotto(scelta.area, scelta.tipologia, lineaContenitore)}
      />

      {!isAdmin && (
        <p className="flex items-center gap-2 rounded-md border bg-muted/30 px-3 py-2 text-sm text-muted-foreground" role="note">
          <Info className="h-4 w-4 shrink-0" aria-hidden="true" />
          Sola lettura: il listino lo modifica l&apos;amministratore dell&apos;azienda.
        </p>
      )}

      {isLoading ? (
        <div className="flex items-center justify-center py-12 text-muted-foreground">
          <Loader2 className="mr-2 h-5 w-5 animate-spin" aria-hidden="true" />
          Caricamento del listino…
        </div>
      ) : errorFamilies ? (
        // Un errore di caricamento non è un listino vuoto: si dice e si riprova.
        <Card>
          <CardContent className="px-4 py-10 text-center sm:py-14">
            <AlertTriangle className="mx-auto mb-3 h-12 w-12 text-destructive/70" aria-hidden="true" />
            <p className="font-medium">Il listino non si è caricato</p>
            <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">
              Controlla la connessione e riprova. Se il problema resta, ricarica la pagina.
            </p>
            <Button variant="outline" className="mt-4 h-10 w-full sm:w-auto" onClick={() => void refetchFamilies()}>
              Riprova
            </Button>
          </CardContent>
        </Card>
      ) : (
        <ListinoNavigatore
          aree={visibili}
          selezione={selezione}
          onSelezione={cambiaSelezione}
          vista={vista}
          cercando={cercando}
          isAdmin={isAdmin}
          inAttesa={togglePendingIds}
          onAzzera={() => {
            setCerca("");
            setFiltri(FILTRI_LISTINO_VUOTI);
          }}
          azioni={{
            onApri: (f) => navigate(`/azienda/impostazioni/listino/famiglie/${f.id}`),
            onDuplica: (f) => {
              setToDuplicate(f);
              setDupName(`${f.nome} (copia)`);
            },
            onSposta: openMove,
            onElimina: setToDelete,
            onAttivo: (f) => void toggleAttivo(f),
            onPreventivo: (f) => void togglePreventivo(f),
          }}
          onCreaTipologia={gestore ? (area, standard) => void creaTipologia(area, standard) : undefined}
          onCreaTutteStandard={gestore ? (area) => void creaTutteStandard(area) : undefined}
          onNuovaArea={gestore ? () => setNuovaArea(true) : undefined}
          onNuovaTipologia={
            gestore
              ? (area) => setNuovaTipologia({ area, modo: area.mancanti.length > 0 ? "standard" : "nuova", origine: null })
              : undefined
          }
          onCopiaTipologia={gestore ? (area, tipologia) => setNuovaTipologia({ area, modo: "copia", origine: tipologia }) : undefined}
          onAttivaTipologia={gestore ? (_area, tipologia) => void attivaTipologia(tipologia) : undefined}
          onNuovaLinea={isAdmin ? (area, tipologia) => setNuovaLinea({ area, tipologia }) : undefined}
          onNuovoProdotto={isAdmin ? nuovoProdotto : undefined}
          onPrezziLinee={isAdmin ? (tipologia) => setPrezziAperti(tipologia) : undefined}
          onVariantiTipologia={isAdmin ? (tipologia) => setVariantiAperte(tipologia) : undefined}
          onAllineaLinee={isAdmin ? (_area, tipologia) => setDaAllineare(tipologia) : undefined}
          onCollega={gestore ? (area, tipologia) => void collega(area, tipologia) : undefined}
          onAccessorio={gestore ? (_area, tipologia) => void mettiFraGliAccessori(tipologia) : undefined}
          schedaDi={(tipologia, linea) => trovaSchedaLinea(schedeLinea, tipologia.macrocategoriaId, linea.nome)}
          onSchedaLinea={
            isAdmin && companyId ? (_area, tipologia, linea) => setSchedaAperta({ tipologia, linea }) : undefined
          }
        />
      )}

      {/* Duplica: la copia può andare in un'altra tipologia con un altro prezzo. */}
      <Dialog
        open={!!toDuplicate}
        onOpenChange={(open) => {
          if (duplicateFamily.isPending) return;
          if (!open) chiudiDuplica();
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Duplica prodotto</DialogTitle>
            <DialogDescription>
              Crea una copia di &quot;{toDuplicate?.nome}&quot; con variabili, valori e griglia prezzi. Potrai
              modificarla separatamente.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="dup-name">Nome della copia</Label>
              <Input
                id="dup-name"
                value={dupName}
                onChange={(e) => setDupName(e.target.value)}
                autoFocus
                className="h-10"
                onKeyDown={(e) => {
                  if (e.key === "Enter" && dupName.trim() && !duplicateFamily.isPending) {
                    e.preventDefault();
                    void handleDuplicate();
                  }
                }}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="dup-macro">Tipologia di destinazione</Label>
              <Select value={dupMacroId} onValueChange={setDupMacroId}>
                <SelectTrigger id="dup-macro" className="h-10">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="same">Stessa tipologia</SelectItem>
                  {opzioniTipologie.map((gruppo) => (
                    <SelectGroup key={gruppo.etichetta}>
                      <SelectLabel>{gruppo.etichetta}</SelectLabel>
                      {gruppo.tipologie.map((m) => (
                        <SelectItem key={m.id} value={m.id}>
                          {m.nome}
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="dup-prezzo">
                Prezzo base della copia <span className="font-normal text-muted-foreground">(facoltativo)</span>
              </Label>
              <Input
                id="dup-prezzo"
                inputMode="decimal"
                value={dupPrezzo}
                onChange={(e) => setDupPrezzo(e.target.value)}
                placeholder={
                  toDuplicate && Number(toDuplicate.prezzo_base_vendita) > 0
                    ? `Vuoto = ${Number(toDuplicate.prezzo_base_vendita).toLocaleString("it-IT")} € (come l'originale)`
                    : "Vuoto = come l'originale"
                }
                className="h-10"
              />
            </div>
          </div>
          <DialogFooter className="flex-col-reverse gap-2 sm:flex-row sm:gap-2">
            <Button variant="ghost" onClick={chiudiDuplica} disabled={duplicateFamily.isPending} className="h-10 w-full sm:w-auto">
              Annulla
            </Button>
            <Button
              onClick={() => void handleDuplicate()}
              disabled={!dupName.trim() || duplicateFamily.isPending}
              className="h-10 w-full sm:w-auto"
            >
              {duplicateFamily.isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />
                  Duplicazione…
                </>
              ) : (
                "Duplica"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Sposta: tipologia (decide il preventivatore) e linea dentro la tipologia. */}
      <Dialog
        open={!!toMove}
        onOpenChange={(open) => {
          if (updateFamily.isPending) return;
          if (!open) setToMove(null);
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Sposta prodotto</DialogTitle>
            <DialogDescription>
              Dove va &quot;{toMove?.nome}&quot;: la tipologia decide in quale preventivatore compare.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="move-tipologia">Tipologia</Label>
              <Select
                value={moveMacroId}
                onValueChange={(valore) => {
                  setMoveMacroId(valore);
                  setMoveLineaId(NESSUNA);
                }}
              >
                <SelectTrigger id="move-tipologia" className="h-10">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NESSUNA}>Senza tipologia</SelectItem>
                  {opzioniTipologie.map((gruppo) => (
                    <SelectGroup key={gruppo.etichetta}>
                      <SelectLabel>{gruppo.etichetta}</SelectLabel>
                      {gruppo.tipologie.map((m) => (
                        <SelectItem key={m.id} value={m.id}>
                          {m.nome}
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {moveMacroId !== NESSUNA && (
              <div className="space-y-1.5">
                <Label htmlFor="move-linea">Linea</Label>
                <Select value={moveLineaId} onValueChange={setMoveLineaId}>
                  <SelectTrigger id="move-linea" className="h-10">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NESSUNA}>Nessuna linea</SelectItem>
                    {lineeDi(moveMacroId).map((l) => (
                      <SelectItem key={l.id} value={l.id}>
                        {l.nome}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  Le serie di profilo come Salamander e Aluplast non si scelgono qui: stanno nelle variabili del prodotto.
                </p>
              </div>
            )}
          </div>
          <DialogFooter className="flex-col-reverse gap-2 sm:flex-row sm:gap-2">
            <Button variant="ghost" onClick={() => setToMove(null)} disabled={updateFamily.isPending} className="h-10 w-full sm:w-auto">
              Annulla
            </Button>
            <Button
              onClick={() => toMove && void handleMove(toMove.id)}
              disabled={updateFamily.isPending}
              className="h-10 w-full sm:w-auto"
            >
              {updateFamily.isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />
                  Spostamento…
                </>
              ) : (
                "Sposta"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* AlertDialog elimina (soft delete) */}
      <AlertDialog
        open={!!toDelete}
        onOpenChange={(open) => {
          if (deleteFamily.isPending) return;
          if (!open) setToDelete(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Eliminare &quot;{toDelete?.nome}&quot;?
            </AlertDialogTitle>
            <AlertDialogDescription>
              L&apos;articolo verrà spostato nel <strong>cestino per 15 giorni</strong>,
              poi eliminato definitivamente dal database. Potrai ripristinarlo
              in qualunque momento prima della scadenza. I preventivi storici
              che lo usano restano invariati.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="flex-col-reverse gap-2 sm:flex-row sm:gap-2">
            <AlertDialogCancel
              disabled={deleteFamily.isPending}
              className="h-10 mt-0 w-full sm:w-auto"
            >
              Annulla
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              disabled={deleteFamily.isPending}
              className="h-10 w-full sm:w-auto bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleteFamily.isPending ? (
                <>
                  <Loader2
                    className="h-4 w-4 mr-2 animate-spin"
                    aria-hidden="true"
                  />
                  Eliminazione…
                </>
              ) : (
                "Elimina"
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Dialog Cestino: lista articoli soft-deleted + restore + hard-delete */}
      <Dialog
        open={cestinoOpen}
        onOpenChange={(open) => {
          if (restoreFamily.isPending || hardDeleteFamily.isPending) return;
          setCestinoOpen(open);
        }}
      >
        <DialogContent className="sm:max-w-2xl max-h-[85vh] flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Trash className="h-5 w-5" aria-hidden="true" />
              Cestino articoli
            </DialogTitle>
            <DialogDescription>
              Gli articoli eliminati vengono conservati per{" "}
              <strong>15 giorni</strong>, poi rimossi definitivamente dal
              database. Ripristinali in un click o eliminali subito senza
              aspettare.
            </DialogDescription>
          </DialogHeader>
          <div className="flex-1 overflow-y-auto -mx-6 px-6 py-2">
            {loadingCestino ? (
              <div className="flex items-center justify-center py-10 text-muted-foreground text-sm">
                <Loader2 className="h-4 w-4 animate-spin mr-2" aria-hidden="true" />
                Caricamento cestino…
              </div>
            ) : errorCestino ? (
              // M-D (audit): l'errore query mostrava "Il cestino è vuoto" —
              // l'utente poteva credere che gli articoli eliminati fossero
              // già stati purgati. Stato errore esplicito con riprova.
              <div className="flex flex-col items-center justify-center py-10 text-center text-muted-foreground">
                <AlertTriangle className="h-10 w-10 mb-3 text-destructive/70" aria-hidden="true" />
                <p className="text-sm font-medium">Errore nel caricamento del cestino</p>
                <Button
                  variant="outline"
                  size="sm"
                  className="mt-3 h-9"
                  onClick={() => void refetchCestino()}
                >
                  Riprova
                </Button>
              </div>
            ) : cestino.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-10 text-center text-muted-foreground">
                <ImageOff className="h-10 w-10 mb-3 opacity-40" aria-hidden="true" />
                <p className="text-sm font-medium">Il cestino è vuoto</p>
                <p className="text-xs mt-1">
                  Gli articoli eliminati appariranno qui per 15 giorni.
                </p>
              </div>
            ) : (
              <ul className="divide-y" aria-label="Articoli nel cestino">
                {cestino.map((f) => (
                  <li
                    key={f.id}
                    className="py-3 flex items-start gap-3"
                  >
                    {/* Thumbnail mini */}
                    <div className="w-12 h-12 rounded bg-muted shrink-0 overflow-hidden flex items-center justify-center">
                      {f.immagine_url ? (
                        <img
                          src={f.immagine_url}
                          alt=""
                          className="w-full h-full object-cover"
                          loading="lazy"
                        />
                      ) : (
                        <Package
                          className="h-5 w-5 text-muted-foreground/40"
                          aria-hidden="true"
                        />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-sm truncate">{f.nome}</p>
                      <p className="text-xs text-muted-foreground">
                        Eliminato il{" "}
                        {f.deleted_at
                          ? new Date(f.deleted_at).toLocaleDateString("it-IT", {
                              day: "2-digit",
                              month: "short",
                              year: "numeric",
                              hour: "2-digit",
                              minute: "2-digit",
                            })
                          : "—"}
                        {" · "}
                        <span className="text-amber-700 dark:text-amber-400 font-medium">
                          {f.deleted_at
                            ? formatTempoResiduo(f.deleted_at)
                            : ""}
                        </span>
                      </p>
                    </div>
                    <div className="flex gap-1 shrink-0">
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-8"
                        onClick={() => void handleRestore(f.id)}
                        disabled={
                          restoreFamily.isPending || hardDeleteFamily.isPending
                        }
                        aria-label={`Ripristina ${f.nome}`}
                      >
                        <Undo2 className="h-4 w-4 sm:mr-1" aria-hidden="true" />
                        <span className="hidden sm:inline">Ripristina</span>
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-8 text-destructive hover:text-destructive hover:bg-destructive/10"
                        onClick={() => setToHardDelete(f)}
                        disabled={
                          restoreFamily.isPending || hardDeleteFamily.isPending
                        }
                        aria-label={`Elimina definitivamente ${f.nome}`}
                      >
                        <Trash2
                          className="h-4 w-4 sm:mr-1"
                          aria-hidden="true"
                        />
                        <span className="hidden sm:inline">Elimina</span>
                      </Button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setCestinoOpen(false)}
              className="h-10"
              disabled={restoreFamily.isPending || hardDeleteFamily.isPending}
            >
              Chiudi
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* AlertDialog conferma hard-delete dal cestino */}
      <AlertDialog
        open={!!toHardDelete}
        onOpenChange={(open) => {
          if (hardDeleteFamily.isPending) return;
          if (!open) setToHardDelete(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Eliminare definitivamente &quot;{toHardDelete?.nome}&quot;?
            </AlertDialogTitle>
            <AlertDialogDescription>
              Questa azione è <strong>irreversibile</strong>. L&apos;articolo e
              tutte le sue variabili/valori verranno rimossi subito dal database
              invece di attendere la scadenza dei 15 giorni. I preventivi
              storici che lo usano restano invariati (i dati sono già stati
              snapshottati).
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="flex-col-reverse gap-2 sm:flex-row sm:gap-2">
            <AlertDialogCancel
              disabled={hardDeleteFamily.isPending}
              className="h-10 mt-0 w-full sm:w-auto"
            >
              Annulla
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleHardDelete}
              disabled={hardDeleteFamily.isPending}
              className="h-10 w-full sm:w-auto bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {hardDeleteFamily.isPending ? (
                <>
                  <Loader2
                    className="h-4 w-4 mr-2 animate-spin"
                    aria-hidden="true"
                  />
                  Eliminazione…
                </>
              ) : (
                "Elimina definitivamente"
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Scheda della linea: si monta a ogni apertura, così il modulo parte dalla scheda salvata. */}
      {isAdmin && companyId && schedaAperta && (
        <SchedaLineaDialog
          tipologia={schedaAperta.tipologia}
          linea={schedaAperta.linea}
          scheda={trovaSchedaLinea(schedeLinea, schedaAperta.tipologia.macrocategoriaId, schedaAperta.linea.nome)}
          onChiudi={() => setSchedaAperta(null)}
        />
      )}

      {/* Si monta a ogni apertura: parte dalle linee e dal prezzo di oggi dei serramenti. */}
      {isAdmin && companyId && standardSerramentiOpen && (
        <ImpostaStandardSerramentiDialog
          open
          onOpenChange={setStandardSerramentiOpen}
          companyId={companyId}
          famiglie={families.map((f) => ({ id: f.id, nome: f.nome, vertical: f.vertical }))}
          lineeIniziali={lineeSerramenti}
          prezzoIniziale={prezzoSerramenti}
          opzioniIniziali={opzioniSerramenti}
        />
      )}

      {/* Anche questo si monta a ogni apertura, così la spunta parte giusta. I
          modelli nuovi vanno nella tipologia Serramenti, non in quella aperta:
          con Tapparelle aperta finivano fra le tapparelle. */}
      {isAdmin && companyId && serieOpen && (
        <ImportaSerieDialog
          open
          onOpenChange={setSerieOpen}
          companyId={companyId}
          macrocategoriaId={
            tipologiaSerramenti?.macrocategoriaId ?? (scelta.area?.chiave === "serramenti" ? macroScelta : null)
          }
          installaMancantiIniziale={!tipologiaSerramenti || tipologiaSerramenti.articoli === 0}
        />
      )}

      {nuovaLinea && (
        <NuovaLineaDialog
          area={nuovaLinea.area}
          tipologia={nuovaLinea.tipologia}
          inCorso={createCategoria.isPending || aggiungiLinea.isPending}
          onChiudi={chiudiNuovaLinea}
          onCreaCategoria={(nome) => void salvaLineaCartella(nome)}
          onCreaAsse={(dati) => void salvaLineaAsse(dati)}
        />
      )}

      {nuovaArea && (
        <NuovaAreaDialog
          aree={aree}
          macrocategorie={macrocategorie}
          inCorso={creazioneInCorso}
          onChiudi={() => setNuovaArea(false)}
          onCrea={(areaStd, tipologie) => void creaArea(areaStd, tipologie)}
        />
      )}

      {nuovaTipologia && (
        <NuovaTipologiaDialog
          area={nuovaTipologia.area}
          macrocategorie={macrocategorie}
          modoIniziale={nuovaTipologia.modo}
          origineIniziale={nuovaTipologia.origine}
          inCorso={creazioneInCorso || copiaTipologia.isPending}
          onChiudi={() => setNuovaTipologia(null)}
          onCreaStandard={
            nuovaTipologia.area.standard ? (standard) => void creaTipologia(nuovaTipologia.area, standard) : undefined
          }
          onCreaTutteStandard={() => void creaTutteStandard(nuovaTipologia.area)}
          onCreaNuova={(dati) => void creaTipologiaSuMisura(nuovaTipologia.area, dati)}
          onCopia={(dati) => void copia(nuovaTipologia.area, dati)}
        />
      )}

      {prezziAperti && (
        <PrezziLineeDialog
          tipologia={prezziAperti}
          inCorso={prezziLinee.isPending}
          onChiudi={() => setPrezziAperti(null)}
          onSalva={(dati) => void salvaPrezzi(dati)}
        />
      )}

      {variantiAperte && (
        <VariantiTipologiaDialog
          tipologia={variantiAperte}
          area={aree.find((a) => a.tipologie.some((t) => t.chiave === variantiAperte.chiave))?.chiave ?? null}
          inCorso={variantiTipologia.isPending}
          onChiudi={() => setVariantiAperte(null)}
          onSalva={(assi) => void salvaVarianti(assi)}
        />
      )}

      <AlertDialog
        open={!!daAllineare}
        onOpenChange={(open) => {
          if (!open && !allineaLinee.isPending) setDaAllineare(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Dare le linee di {daAllineare?.nome} ai prodotti che non le hanno?</AlertDialogTitle>
            <AlertDialogDescription>
              Ognuno riceve le stesse linee e gli stessi scostamenti del prodotto che ne ha di più. La «Linea base» dei
              modelli pronti si spegne. I preventivi già fatti non cambiano.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="flex-col-reverse gap-2 sm:flex-row sm:gap-2">
            <AlertDialogCancel disabled={allineaLinee.isPending} className="mt-0 h-10 w-full sm:w-auto">
              Annulla
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                void allinea();
              }}
              disabled={allineaLinee.isPending}
              className="h-10 w-full sm:w-auto"
            >
              {allineaLinee.isPending ? "Assegno le linee…" : "Dai le linee"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Modelli pronti dalla libreria di piattaforma: si aprono sull'area e
          sulla tipologia che si stanno guardando. */}
      {isAdmin && companyId && (
        <FamilyTemplatePicker
          open={templatePickerOpen}
          onOpenChange={setTemplatePickerOpen}
          companyId={companyId}
          initialVertical={toGallerySlug(scelta.area?.standard?.verticale ?? null)}
          targetMacrocategoriaId={macroScelta}
          onImported={(familyId) => {
            navigate(`/azienda/impostazioni/listino/famiglie/${familyId}`);
          }}
        />
      )}
    </div>
  );
}
