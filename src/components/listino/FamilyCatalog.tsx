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
import { FamilyTemplatePicker } from "./FamilyTemplatePicker";
import { ImpostaStandardSerramentiDialog } from "./ImpostaStandardSerramentiDialog";
import { ImportaSerieDialog } from "./ImportaSerieDialog";
import { ListinoBarra, type AzioneImporta, type VistaListino } from "./ListinoBarra";
import { ListinoNavigatore } from "./ListinoNavigatore";
import { toGallerySlug } from "@/lib/verticalMapping";
import { useFamilies, useFamiliesCestino } from "@/hooks/useFamilies";
import { useFamilyMutations } from "@/hooks/useFamilyMutations";
import {
  useListinoMacrocategorie,
  useMacrocategorieMutations,
  type MacrocategoriaPayload,
} from "@/hooks/useListinoMacrocategorie";
import { useCategorieMutations, useListinoCategorie } from "@/hooks/useListinoCategorie";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { ArticleFamily, FamilyWithAxes } from "@/types/articleFamily";
import { areaDiVerticale, type TipologiaStandard } from "@/lib/listino/areeStandard";
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
  const isAdmin = role === "company_admin" || role === "super_admin";
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
  const [nomeLinea, setNomeLinea] = useState("");
  const [creazioneInCorso, setCreazioneInCorso] = useState(false);
  // Ogni riga resta bloccata finché la SUA modifica non è conclusa: con
  // l'isPending della mutation un secondo clic veloce annullava il primo.
  const [togglePendingIds, setTogglePendingIds] = useState<Set<string>>(() => new Set());

  const macroScelta = scelta.tipologia?.macrocategoriaId ?? null;

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
      toast.error("Ripristino non riuscito", { description: messaggioErrore(err) });
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
   * Una tipologia standard nasce già collegata al preventivatore della sua
   * area (verticali_abilitati) e, nel fotovoltaico, allo slot del configuratore.
   */
  const payloadStandard = (area: AreaListino, standard: TipologiaStandard, ordine: number): MacrocategoriaPayload => ({
    nome: standard.nome,
    verticali_abilitati: area.standard ? [area.standard.verticale] : [],
    tipologia: area.standard ? area.chiave : null,
    fv_categoria: standard.fvCategoria,
    categoria_tipo: standard.accessorio ? "accessorio" : "principale",
    sort_order: ordine,
  });

  const creaTipologia = async (area: AreaListino, standard: TipologiaStandard) => {
    if (creazioneInCorso) return;
    setCreazioneInCorso(true);
    try {
      const creata = await createMacrocategoria.mutateAsync(payloadStandard(area, standard, prossimoOrdine()));
      toast.success(`Tipologia «${standard.nome}» aggiunta all'area ${area.nome}`);
      cambiaSelezione({ area: area.chiave, tipologia: `macro:${creata.id}` });
    } catch (err) {
      toast.error("Tipologia non creata", { description: messaggioErrore(err) });
    } finally {
      setCreazioneInCorso(false);
    }
  };

  const creaTutteStandard = async (area: AreaListino) => {
    if (creazioneInCorso) return;
    setCreazioneInCorso(true);
    const base = prossimoOrdine();
    let create = 0;
    try {
      for (const [i, standard] of area.mancanti.entries()) {
        await createMacrocategoria.mutateAsync(payloadStandard(area, standard, base + i * 10));
        create += 1;
      }
      toast.success(`${create} tipologie standard aggiunte all'area ${area.nome}`);
    } catch (err) {
      toast.error(create > 0 ? `Aggiunte ${create} tipologie su ${area.mancanti.length}` : "Tipologie non create", {
        description: messaggioErrore(err),
      });
    } finally {
      setCreazioneInCorso(false);
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

  const chiudiNuovaLinea = () => {
    setNuovaLinea(null);
    setNomeLinea("");
  };

  const salvaLinea = async () => {
    const macroId = nuovaLinea?.tipologia.macrocategoriaId;
    if (!nuovaLinea || !macroId || !nomeLinea.trim()) return;
    try {
      const creata = await createCategoria.mutateAsync({
        nome: nomeLinea.trim(),
        macrocategoria_id: macroId,
        sort_order: nuovaLinea.tipologia.linee.length,
      });
      toast.success(`Linea «${creata.nome}» creata in ${nuovaLinea.tipologia.nome}`);
      cambiaSelezione({ area: nuovaLinea.area.chiave, tipologia: nuovaLinea.tipologia.chiave, linea: `cat:${creata.id}` });
      chiudiNuovaLinea();
    } catch (err) {
      toast.error("Linea non creata", { description: messaggioErrore(err) });
    }
  };

  const nuovoProdotto = (_area: AreaListino | null, tipologia: TipologiaListino | null, linea: LineaListino | null) => {
    const q = new URLSearchParams();
    if (tipologia?.macrocategoriaId) q.set("tipologia", tipologia.macrocategoriaId);
    if (linea?.categoriaId) q.set("linea", linea.categoriaId);
    const suffisso = q.toString();
    navigate(`/azienda/impostazioni/listino/famiglie/nuova${suffisso ? `?${suffisso}` : ""}`);
  };

  const azioniImporta: AzioneImporta[] = [
    { etichetta: "Excel o CSV", descrizione: "Da un foglio di calcolo", icona: FileSpreadsheet, href: "/azienda/impostazioni/listino/import" },
    { etichetta: "Listino fornitore in PDF", descrizione: "Letto dall'intelligenza artificiale", icona: Sparkles, href: "/azienda/impostazioni/listino/import" },
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
          onCreaTipologia={isAdmin ? (area, standard) => void creaTipologia(area, standard) : undefined}
          onCreaTutteStandard={isAdmin ? (area) => void creaTutteStandard(area) : undefined}
          onNuovaLinea={
            isAdmin
              ? (area, tipologia) => {
                  setNuovaLinea({ area, tipologia });
                  setNomeLinea("");
                }
              : undefined
          }
          onNuovoProdotto={isAdmin ? nuovoProdotto : undefined}
          onPrezziLinee={isAdmin && companyId ? () => setStandardSerramentiOpen(true) : undefined}
          onCollega={isAdmin ? (area, tipologia) => void collega(area, tipologia) : undefined}
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

      {/* Nuova linea: una categoria dentro la tipologia. */}
      <Dialog
        open={!!nuovaLinea}
        onOpenChange={(open) => {
          if (createCategoria.isPending) return;
          if (!open) chiudiNuovaLinea();
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Nuova linea in {nuovaLinea?.tipologia.nome}</DialogTitle>
            <DialogDescription>
              Una linea raccoglie prodotti diversi della stessa tipologia: le tapparelle in PVC e quelle in
              alluminio, la linea vasca tipo 1 e la tipo 2.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-1.5">
            <Label htmlFor="nome-linea">Nome della linea</Label>
            <Input
              id="nome-linea"
              value={nomeLinea}
              onChange={(e) => setNomeLinea(e.target.value)}
              placeholder="Es. PVC, Alluminio coibentato, Linea vasca tipo 1"
              autoFocus
              className="h-10"
              onKeyDown={(e) => {
                if (e.key === "Enter" && nomeLinea.trim() && !createCategoria.isPending) {
                  e.preventDefault();
                  void salvaLinea();
                }
              }}
            />
            {nuovaLinea?.area.chiave === "serramenti" && (
              <p className="text-xs text-muted-foreground">
                Una serie di profilo con gli stessi modelli e un altro prezzo (Aluplast, Rehau) si aggiunge da{" "}
                <button
                  type="button"
                  className="font-medium text-primary hover:underline"
                  onClick={() => {
                    chiudiNuovaLinea();
                    setSerieOpen(true);
                  }}
                >
                  Serie di profilo
                </button>
                .
              </p>
            )}
          </div>
          <DialogFooter className="flex-col-reverse gap-2 sm:flex-row sm:gap-2">
            <Button variant="ghost" onClick={chiudiNuovaLinea} disabled={createCategoria.isPending} className="h-10 w-full sm:w-auto">
              Annulla
            </Button>
            <Button
              onClick={() => void salvaLinea()}
              disabled={!nomeLinea.trim() || createCategoria.isPending}
              className="h-10 w-full sm:w-auto"
            >
              {createCategoria.isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />
                  Creazione…
                </>
              ) : (
                "Crea linea"
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

      {isAdmin && companyId && (
        <ImpostaStandardSerramentiDialog
          open={standardSerramentiOpen}
          onOpenChange={setStandardSerramentiOpen}
          companyId={companyId}
          famiglie={families.map((f) => ({ id: f.id, nome: f.nome, vertical: f.vertical }))}
        />
      )}

      {isAdmin && companyId && (
        <ImportaSerieDialog
          open={serieOpen}
          onOpenChange={setSerieOpen}
          companyId={companyId}
          macrocategoriaId={scelta.area?.chiave === "serramenti" ? macroScelta : null}
        />
      )}

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
