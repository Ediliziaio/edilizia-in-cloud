/**
 * ServiziSection — sezione "Servizi aggiuntivi" del preventivo Serramenti.
 *
 * Servizi tipici: trasporto, tiro al piano, pratica ENEA, smaltimento,
 * sopralluogo extra, ponteggio, occupazione suolo pubblico, ecc.
 *
 * NOTA importante: la MANODOPERA / POSA è inclusa nel prezzo del singolo
 * prodotto (vedi FamilyEditor.posa_tariffa_default_id) — NON entra qui.
 * Qui ci sono solo servizi che vengono fatturati a parte rispetto ai
 * serramenti veri e propri.
 *
 * DB: riusa sr_servizi_progetto (rinominata da sr_manodopera_progetto).
 */
import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Truck, Plus, Trash2, Loader2, Search, Settings, Lock, Sparkles, MoreVertical, Unlink2,
} from "lucide-react";
import {
  useTariffeManodopera, useAddManodopera, useUpdateManodopera, useDeleteManodopera,
} from "@/lib/serramenti/queries";
import type { SrServizioRow, SrProgettoDetail } from "@/types/serramenti";
import type { TariffaMinimal } from "@/lib/serramenti/api";
import { SrCard } from "@/lib/serramenti/wizardUI";
import { formatEuro } from "@/lib/serramenti/format";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { toast } from "sonner";

interface Props {
  progettoId: string;
  detail: SrProgettoDetail;
}

/**
 * Servizi tipici suggeriti come quick-add. Ogni chip mappa a un `tariffaTipo`
 * che è l'enum DB di `tariffe_aziendali.tipo` — al click cerchiamo la tariffa
 * configurata dall'azienda con quel tipo e creiamo la riga con prezzo + unità
 * ereditati. Se nessuna tariffa trovata, fallback a voce free-form + toast
 * guida che indirizza in Impostazioni → Tariffe aziendali.
 *
 * tariffaTipo deve coincidere con l'enum CHECK di tariffe_aziendali:
 *   posa, trasporto, smaltimento, nolo, tiro_piano, pratica, manodopera,
 *   sopralluogo, progettazione, ponteggio, lattoneria, sigillatura,
 *   contorno, falso_telaio, altro
 *
 * NB: per i servizi non mappabili univocamente all'enum DB (es. Davanzale
 * extra, Allargamento foro → entrambi 'altro' = catch-all troppo generico),
 * usiamo `tariffaTipo: null` → smart lookup disabilitato, sempre voce
 * manuale. Evita di linkare auto-magicamente a una tariffa "altro" generica
 * che potrebbe non corrispondere al servizio richiesto.
 */
const SERVIZI_RAPIDI: Array<{
  tipo: string;
  tariffaTipo: string | null;
  label: string;
  unita: string;
  emoji: string;
}> = [
  { tipo: "trasporto",        tariffaTipo: "trasporto",   label: "Trasporto",              unita: "a_corpo", emoji: "🚚" },
  { tipo: "tiro_al_piano",    tariffaTipo: "tiro_piano",  label: "Tiro al piano",          unita: "pz",      emoji: "🏗️" },
  { tipo: "pratica_enea",     tariffaTipo: "pratica",     label: "Pratica ENEA",           unita: "a_corpo", emoji: "📋" },
  { tipo: "smaltimento",      tariffaTipo: "smaltimento", label: "Smaltimento materiali",  unita: "a_corpo", emoji: "♻️" },
  { tipo: "sopralluogo_extra",tariffaTipo: "sopralluogo", label: "Sopralluogo extra",      unita: "pz",      emoji: "📏" },
  { tipo: "ponteggio",        tariffaTipo: "ponteggio",   label: "Ponteggio / piattaforma",unita: "giorno",  emoji: "🚧" },
  // Servizi specifici senza enum dedicato → tariffaTipo null = sempre manuale.
  { tipo: "davanzale_extra",  tariffaTipo: null,          label: "Davanzale extra",        unita: "ml",      emoji: "🪟" },
  { tipo: "allargamento_foro",tariffaTipo: null,          label: "Allargamento foro",      unita: "pz",      emoji: "🔨" },
];

export function ServiziSection({ progettoId, detail }: Props) {
  const addMut = useAddManodopera(progettoId);
  const updateMut = useUpdateManodopera(progettoId);
  const deleteMut = useDeleteManodopera(progettoId);
  const [tariffaPickerOpen, setTariffaPickerOpen] = useState(false);
  // Pre-filtro per il picker quando aperto da chip con 2+ tariffe disponibili.
  const [pickerInitialFilter, setPickerInitialFilter] = useState<string>("");
  const [toDelete, setToDelete] = useState<SrServizioRow | null>(null);

  // Pre-fetch tariffe aziendali (cache 5min via React Query) → ci servono
  // per il lookup chip-tipo → tariffa configurata e per la mappa
  // "tipo: ho tariffa configurata o no" usata sui chip.
  const { data: allTariffe = [] } = useTariffeManodopera();

  const righe = detail.servizi ?? detail.manodopera ?? [];

  const subtotaleVendita = righe.reduce(
    (acc, r) => acc + Number(r.prezzo_totale_vendita ?? 0), 0,
  );

  /**
   * Smart-add per i chip "Servizi tipici":
   *  - Lookup tariffa via servizio.tariffaTipo (enum DB)
   *  - 1 tariffa trovata → crea riga LINKED con prezzo + unità dal listino
   *  - 0 tariffe → crea voce free-form (legacy) + toast guida a Impostazioni
   *  - 2+ tariffe → apre TariffaPickerDialog pre-filtrato sul nome del servizio
   *    (utente sceglie quale variante usare)
   */
  const handleAddQuick = (servizio: typeof SERVIZI_RAPIDI[number]) => {
    // Servizi senza tariffaTipo (es. Davanzale, Allargamento foro): skippiamo
    // il lookup ed andiamo diretti al fallback manuale. L'enum 'altro' è
    // catch-all e l'auto-link sarebbe ambiguo / fuorviante.
    const matches = servizio.tariffaTipo
      ? allTariffe.filter((t) => t.tipo === servizio.tariffaTipo)
      : [];

    if (matches.length === 1) {
      const t = matches[0];
      addMut.mutate({
        tariffa_id: t.id,
        descrizione: t.nome,
        unita: t.unita ?? servizio.unita,
        quantita: 1,
        prezzo_unitario_costo: t.prezzo_costo != null ? Number(t.prezzo_costo) : null,
        prezzo_unitario_vendita: t.prezzo_vendita != null ? Number(t.prezzo_vendita) : null,
        position: righe.length,
      });
      toast.success(`${servizio.label} aggiunto`, {
        description: `Prezzo €${Number(t.prezzo_vendita ?? 0).toLocaleString("it-IT", { minimumFractionDigits: 2 })} dal listino tariffe.`,
      });
      return;
    }

    if (matches.length >= 2) {
      // 2+ varianti (es. Trasporto base / Trasporto urgente) → utente sceglie.
      setPickerInitialFilter(servizio.label);
      setTariffaPickerOpen(true);
      return;
    }

    // 0 tariffe per questo tipo → fallback free-form + guidance.
    addMut.mutate({
      descrizione: servizio.label,
      unita: servizio.unita,
      quantita: 1,
      position: righe.length,
    });
    toast.info(`${servizio.label} aggiunto (manuale)`, {
      description: "Configura una tariffa in Impostazioni → Tariffe aziendali per pre-popolare il prezzo al prossimo click.",
    });
  };

  /** Indicizza tariffe per tipo: usato dalla UI dei chip per mostrare il
   *  pallino "configurato" (verde) o "manca tariffa" (grigio). */
  const tariffeByTipo = useMemo(() => {
    const map = new Map<string, number>();
    allTariffe.forEach((t) => {
      if (t.tipo) map.set(t.tipo, (map.get(t.tipo) ?? 0) + 1);
    });
    return map;
  }, [allTariffe]);

  const handlePickTariffa = (t: TariffaMinimal) => {
    addMut.mutate({
      tariffa_id: t.id,
      descrizione: t.nome,
      unita: t.unita ?? "pz",
      quantita: 1,
      prezzo_unitario_costo: t.prezzo_costo != null ? Number(t.prezzo_costo) : null,
      prezzo_unitario_vendita: t.prezzo_vendita != null ? Number(t.prezzo_vendita) : null,
      position: righe.length,
    });
    setTariffaPickerOpen(false);
    // Feedback coerente con handleAddQuick: l'utente vede subito che il
    // prezzo è stato impostato e da dove proviene.
    toast.success(`${t.nome} aggiunto`, {
      description: t.prezzo_vendita != null
        ? `Prezzo €${Number(t.prezzo_vendita).toLocaleString("it-IT", { minimumFractionDigits: 2 })} dal listino tariffe.`
        : "Voce creata. Inserisci il prezzo nella riga.",
    });
  };

  const onPatch = (id: string, patch: Partial<SrServizioRow>) => {
    updateMut.mutate({ id, patch });
  };

  return (
    <SrCard
      title="Servizi aggiuntivi"
      description="Trasporto, tiro al piano, pratica ENEA, smaltimento, ponteggio… La posa è già inclusa nel prezzo dei serramenti."
      icon={<Truck className="h-4 w-4" />}
    >
      {/* Quick-add chip per i servizi tipici: ogni chip cerca la tariffa
          configurata in azienda con quel tipo. Pallino verde = tariffa pronta
          (1 sola o più → si apre picker). Pallino grigio = nessuna tariffa
          (verrà creata voce manuale + toast guida). */}
      <div className="mb-3">
        <p className="text-[11px] text-muted-foreground mb-1.5">
          Servizi tipici (click per aggiungere):{" "}
          <span className="text-[10px]">
            <span className="inline-flex items-center gap-0.5 ml-1">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
              <span>tariffa pronta</span>
            </span>
            <span className="mx-1.5">·</span>
            <span className="inline-flex items-center gap-0.5">
              <span className="h-1.5 w-1.5 rounded-full bg-slate-300" />
              <span>manuale</span>
            </span>
          </span>
        </p>
        <div className="flex flex-wrap gap-1.5">
          {SERVIZI_RAPIDI.map((s) => {
            // Lookup attivo solo se tariffaTipo dichiarato; servizi
            // "catch-all" (tariffaTipo=null) sono SEMPRE manuali → niente
            // pallino verde fuorviante.
            const count = s.tariffaTipo ? tariffeByTipo.get(s.tariffaTipo) ?? 0 : 0;
            const hasTariffa = count > 0;
            return (
              <button
                key={s.tipo}
                onClick={() => handleAddQuick(s)}
                disabled={addMut.isPending}
                className={`text-xs px-2.5 py-1.5 rounded-full border bg-white transition disabled:opacity-50 inline-flex items-center gap-1.5 ${
                  hasTariffa
                    ? "border-emerald-200 hover:bg-emerald-50 hover:border-emerald-300"
                    : "border-slate-200 hover:bg-slate-50 hover:border-slate-300"
                }`}
                title={
                  hasTariffa
                    ? count === 1
                      ? `Tariffa configurata — prezzo pescato automaticamente dal listino`
                      : `${count} varianti in listino — al click ti chiederò quale usare`
                    : s.tariffaTipo === null
                      ? `Servizio personalizzato — voce manuale. Aggiungi prezzo dopo aver creato la riga.`
                      : `Nessuna tariffa "${s.label}" in Impostazioni → Tariffe aziendali: verrà creata voce manuale`
                }
              >
                <span
                  className={`h-1.5 w-1.5 rounded-full shrink-0 ${
                    hasTariffa ? "bg-emerald-500" : "bg-slate-300"
                  }`}
                  aria-hidden="true"
                />
                {s.emoji} {s.label}
              </button>
            );
          })}
        </div>
      </div>

      <div className="flex flex-col sm:flex-row gap-2 mb-3">
        <Button
          onClick={() => setTariffaPickerOpen(true)}
          variant="outline"
          className="flex-1 gap-1 border-orange-300 text-orange-600 hover:bg-orange-50"
          disabled={addMut.isPending}
        >
          <Settings className="h-4 w-4" /> Da listino tariffe
        </Button>
        <Button
          onClick={() => addMut.mutate({ descrizione: "Servizio personalizzato", unita: "a_corpo", quantita: 1, position: righe.length })}
          variant="outline"
          className="flex-1 gap-1"
          disabled={addMut.isPending}
        >
          <Plus className="h-4 w-4" /> Voce custom
        </Button>
      </div>

      {righe.length === 0 ? (
        <div className="border-2 border-dashed border-slate-200 rounded-md p-4 text-center bg-slate-50/30">
          <Truck className="h-7 w-7 mx-auto text-slate-300 mb-1.5" />
          <p className="text-xs text-muted-foreground">
            Nessun servizio aggiuntivo. Sono <strong>opzionali</strong>: aggiungi solo quelli effettivamente concordati col cliente.
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-xs">Descrizione</TableHead>
                  <TableHead className="text-xs w-20">Unità</TableHead>
                  <TableHead className="text-xs w-20">Q.tà</TableHead>
                  <TableHead className="text-xs w-28">€ vendita</TableHead>
                  <TableHead className="text-xs w-28">Totale</TableHead>
                  <TableHead className="text-xs w-10"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {righe.map((r) => {
                  // Le righe pescate dal listino tariffe (tariffa_id valorizzato)
                  // hanno prezzo + unita LOCK: il prezzo è gestito dal listino
                  // aziendale e modificarlo qui rompe la coerenza tra preventivi
                  // diversi. Per override esplicito → menu "Sgancia dal listino".
                  const isLinked = !!r.tariffa_id;
                  return (
                    <TableRow key={r.id} className={isLinked ? "bg-orange-50/30" : undefined}>
                      <TableCell>
                        <div className="space-y-1">
                          <Input
                            defaultValue={r.descrizione}
                            onBlur={(e) => onPatch(r.id, { descrizione: e.target.value || "Voce" })}
                            className="h-8 text-xs"
                          />
                          {isLinked && (
                            <Badge
                              variant="outline"
                              className="text-[9px] h-4 px-1 border-orange-300 text-orange-700 bg-white"
                              title="Voce collegata al listino tariffe aziendali. Prezzo e unità sono gestiti dal listino — usa il menu per sganciare."
                            >
                              <Sparkles className="h-2.5 w-2.5 mr-0.5" />
                              da listino
                            </Badge>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="relative">
                          <Input
                            defaultValue={r.unita ?? ""}
                            onBlur={(e) => onPatch(r.id, { unita: e.target.value || null })}
                            placeholder="pz"
                            className={`h-8 text-xs w-16 ${isLinked ? "pr-5 bg-slate-50 cursor-not-allowed" : ""}`}
                            readOnly={isLinked}
                            title={isLinked ? "Unità gestita dal listino tariffe. Sgancia per modificare." : undefined}
                          />
                          {isLinked && (
                            <Lock className="absolute right-1 top-1/2 -translate-y-1/2 h-3 w-3 text-orange-500 pointer-events-none" />
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        <Input
                          type="number" min={0} step={0.5}
                          defaultValue={r.quantita}
                          onBlur={(e) => onPatch(r.id, { quantita: Math.max(0, Number(e.target.value) || 0) })}
                          className="h-8 text-xs w-16"
                        />
                      </TableCell>
                      <TableCell>
                        <div className="relative">
                          <Input
                            type="number" step={0.01}
                            defaultValue={r.prezzo_unitario_vendita ?? ""}
                            onBlur={(e) => onPatch(r.id, { prezzo_unitario_vendita: e.target.value ? Number(e.target.value) : null })}
                            className={`h-8 text-xs w-24 ${isLinked ? "pr-6 bg-slate-50 cursor-not-allowed" : ""}`}
                            readOnly={isLinked}
                            title={isLinked ? "Prezzo gestito dal listino tariffe. Sgancia per modificare." : undefined}
                          />
                          {isLinked && (
                            <Lock className="absolute right-2 top-1/2 -translate-y-1/2 h-3 w-3 text-orange-500 pointer-events-none" />
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="text-xs font-semibold text-orange-600">
                        {formatEuro(r.prezzo_totale_vendita)}
                      </TableCell>
                      <TableCell>
                        {isLinked ? (
                          /* Menu compatto: sgancia + elimina su righe da-listino. */
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button size="icon" variant="ghost" className="h-8 w-8 sm:h-7 sm:w-7">
                                <MoreVertical className="h-3.5 w-3.5" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" className="w-48">
                              <DropdownMenuItem
                                onClick={() => {
                                  onPatch(r.id, { tariffa_id: null });
                                  toast.info("Voce sganciata dal listino", {
                                    description: "Ora puoi modificare prezzo e unità manualmente.",
                                  });
                                }}
                              >
                                <Unlink2 className="h-3.5 w-3.5 mr-2" />
                                Sgancia dal listino
                              </DropdownMenuItem>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem
                                onClick={() => setToDelete(r)}
                                className="text-rose-600 focus:text-rose-700"
                              >
                                <Trash2 className="h-3.5 w-3.5 mr-2" />
                                Elimina riga
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        ) : (
                          <Button
                            size="icon" variant="ghost" className="h-8 w-8 sm:h-7 sm:w-7"
                            onClick={() => setToDelete(r)}
                            title="Elimina"
                          >
                            <Trash2 className="h-3.5 w-3.5 text-rose-600" />
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>

          <Card className="bg-slate-50 border-slate-200 p-3 flex items-center justify-between flex-wrap gap-2">
            <span className="text-xs font-semibold text-slate-700">Subtotale servizi</span>
            <span className="text-lg font-bold text-slate-800 tabular-nums">
              {formatEuro(subtotaleVendita)}
            </span>
          </Card>
        </div>
      )}

      <TariffaPickerDialog
        open={tariffaPickerOpen}
        onOpenChange={(o) => {
          setTariffaPickerOpen(o);
          if (!o) setPickerInitialFilter("");
        }}
        onSelect={handlePickTariffa}
        initialFilter={pickerInitialFilter}
      />

      <AlertDialog open={!!toDelete} onOpenChange={(o) => !o && setToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Eliminare il servizio?</AlertDialogTitle>
            <AlertDialogDescription>
              "{toDelete?.descrizione}" verrà rimosso dal preventivo.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annulla</AlertDialogCancel>
            <AlertDialogAction
              className="bg-rose-600 hover:bg-rose-700"
              onClick={() => {
                if (toDelete) deleteMut.mutate(toDelete.id);
                setToDelete(null);
              }}
            >
              Elimina
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </SrCard>
  );
}

// ─── TariffaPickerDialog inline ─────────────────────────────────────────────

function TariffaPickerDialog({
  open, onOpenChange, onSelect, initialFilter,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSelect: (t: TariffaMinimal) => void;
  /** Pre-filtro testuale all'apertura. Usato dal quick-add chip quando ci sono
   *  2+ tariffe dello stesso tipo (es. "Trasporto base" + "Trasporto urgente"):
   *  il picker si apre già con "Trasporto" nel search box → utente vede solo
   *  le varianti rilevanti. */
  initialFilter?: string;
}) {
  const [search, setSearch] = useState(initialFilter ?? "");
  const [debounced, setDebounced] = useState(initialFilter ?? "");

  useEffect(() => {
    const t = setTimeout(() => setDebounced(search), 300);
    return () => clearTimeout(t);
  }, [search]);
  useEffect(() => {
    if (open) {
      // Sincronizza il filtro al cambio di initialFilter (può cambiare tra
      // aperture consecutive del picker da chip diversi).
      setSearch(initialFilter ?? "");
      setDebounced(initialFilter ?? "");
    } else {
      setSearch(""); setDebounced("");
    }
  }, [open, initialFilter]);

  const { data: tariffe = [], isLoading } = useTariffeManodopera(debounced);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Seleziona dal listino tariffe</DialogTitle>
          <DialogDescription>
            Tariffe configurate in Impostazioni → Tariffe aziendali. Filtra per cercare servizi (trasporto, ENEA, ecc.).
          </DialogDescription>
        </DialogHeader>

        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Cerca (trasporto, ENEA, smaltimento, sopralluogo…)"
            className="pl-9 h-10"
            autoFocus
          />
        </div>

        <div className="max-h-[55vh] overflow-y-auto -mx-2 px-2 space-y-1">
          {isLoading ? (
            <div className="py-8 text-center text-sm text-muted-foreground">
              <Loader2 className="h-5 w-5 animate-spin mx-auto mb-2" />
              Caricamento…
            </div>
          ) : tariffe.length === 0 ? (
            <div className="py-8 text-center">
              <Truck className="h-10 w-10 mx-auto text-muted-foreground/30 mb-2" />
              <p className="text-sm text-muted-foreground">
                Nessuna tariffa trovata. Configurale in Impostazioni → Tariffe aziendali.
              </p>
            </div>
          ) : (
            <ul className="divide-y">
              {tariffe.map((t) => (
                <li key={t.id}>
                  <button
                    onClick={() => onSelect(t)}
                    className="w-full text-left p-3 rounded-md hover:bg-orange-50/60 focus:bg-orange-50 focus:outline-none transition"
                  >
                    <div className="flex justify-between items-start gap-3">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-slate-900">{t.nome}</p>
                        {t.descrizione && (
                          <p className="text-[11px] text-muted-foreground mt-0.5 line-clamp-2">{t.descrizione}</p>
                        )}
                        <div className="flex gap-2 mt-1 flex-wrap text-[10px]">
                          {t.categoria_prodotto && (
                            <span className="px-1.5 py-0.5 rounded bg-slate-100 text-slate-600">{t.categoria_prodotto}</span>
                          )}
                          {t.unita && (
                            <span className="px-1.5 py-0.5 rounded bg-amber-100 text-amber-700">per {t.unita}</span>
                          )}
                        </div>
                      </div>
                      <div className="text-right shrink-0">
                        {t.prezzo_vendita != null && (
                          <p className="text-sm font-bold text-orange-600 tabular-nums">
                            € {Number(t.prezzo_vendita).toLocaleString("it-IT", { minimumFractionDigits: 2 })}
                          </p>
                        )}
                      </div>
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="flex justify-end pt-2 border-t">
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Annulla</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
