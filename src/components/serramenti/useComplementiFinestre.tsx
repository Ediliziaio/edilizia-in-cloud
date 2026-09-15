/**
 * I complementi delle finestre di un preventivo serramenti, dalla parte che
 * decide: i bottoni per tipologia, il modello ripreso, il listino aperto per
 * sceglierne o cambiarne uno, i complementi che seguono misure e posa della
 * finestra, la copia con la finestra duplicata.
 *
 * Lo usa StepBom coi salvataggi veri e l'anteprima di sviluppo
 * /dev/preventivo-serramenti con uno stato in memoria: la logica è la stessa.
 * Le regole stanno in lib/serramenti/complementiFinestra.
 */
import { useMemo, useState, type ComponentProps } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import type { SupplierProductLine } from "@/features/serramenti-listini/types";
import type { TipologiaListino } from "@/lib/listino/lineeListino";
import {
  accettaComplementi, chiedeProfondita, complementoDaScelta, complementoPerFinestra, conTotale, copiaComplemento,
  eComplemento, haGiaComplemento, misureCheSeguono, modelloDaRiprendere, nomeBottone, nomeBreve, prezzoComplemento,
  prodottiDellaTipologia, riepilogoComplementi, tipologiaDelComplemento, tipologiaDelProdotto, tipologieComplemento,
  type ModelloRipreso,
} from "@/lib/serramenti/complementiFinestra";
import { areaDelPreventivatore, indirizzoNelListino, preferenzeDaRiga, tipologieDaCompletare } from "@/lib/serramenti/pickerListino";
import { opzioniGriglia } from "@/lib/serramenti/queries";
import type { FamilyWithAxes } from "@/types/articleFamily";
import type { SrAccessorioRow, SrSerramentoRow } from "@/types/serramenti";
import type { ComplementiFinestra } from "./ComplementiFinestra";
import type { ListinoPickerDialog, ListinoPickResult, PartenzaPicker } from "./ListinoPickerDialog";

/** Dove finiscono i complementi: il database nel preventivo, la memoria nell'anteprima. */
export interface SalvataggiComplementi {
  /** Aggiunge i complementi, tutti o nessuno. */
  aggiungi: (righe: Partial<SrAccessorioRow>[]) => Promise<unknown>;
  aggiorna: (id: string, patch: Partial<SrAccessorioRow>) => void;
  elimina: (id: string) => void;
  /** Un'aggiunta è in corso: i bottoni aspettano. */
  inCorso: boolean;
}

interface Opzioni {
  serramenti: SrSerramentoRow[];
  accessori: SrAccessorioRow[];
  famiglie: FamilyWithAxes[];
  macrocategorie: Parameters<typeof areaDelPreventivatore>[1];
  categorie: Parameters<typeof areaDelPreventivatore>[2];
  tariffePrezzi: Map<string, number>;
  supplierLineMap: Map<string, SupplierProductLine>;
  salvataggi: SalvataggiComplementi;
}

interface ListinoAperto {
  finestre: SrSerramentoRow[];
  sostituisce: SrAccessorioRow | null;
  partenza: PartenzaPicker;
  preferenze: ReturnType<typeof preferenzeDaRiga>;
}

const misureTesto = (L: number | null, H: number | null) => (L && H ? `${L} × ${H} mm` : "senza misure");
const nessunErrore = (): void => undefined;

export function useComplementiFinestre({
  serramenti, accessori, famiglie, macrocategorie, categorie, tariffePrezzi, supplierLineMap, salvataggi,
}: Opzioni) {
  const queryClient = useQueryClient();
  const areaListino = useMemo(
    () => areaDelPreventivatore(famiglie, macrocategorie, categorie, "accessorio"),
    [famiglie, macrocategorie, categorie],
  );
  const tipologieArea = areaListino?.tipologie;
  const tipologie = useMemo(() => tipologieComplemento(areaListino), [areaListino]);
  // Tapparelle, zanzariere, cassonetti che il listino ha ma non propone nei preventivi (Renova, 15/09):
  // senza, il box mostrava solo «a mano» e non si capiva perché.
  const daCompletare = useMemo(
    () => tipologieDaCompletare(famiglie, macrocategorie, categorie, areaListino)
      .filter((d) => eComplemento(d.tipologia))
      .map((d) => ({ chiave: d.tipologia.chiave, nome: d.tipologia.nome, indirizzo: indirizzoNelListino(d.tipologia) })),
    [famiglie, macrocategorie, categorie, areaListino],
  );
  const perFinestra = useMemo(() => {
    const m = new Map<string, SrAccessorioRow[]>();
    const inOrdine = [...accessori].sort((a, b) => (a.position ?? 0) - (b.position ?? 0));
    for (const a of inOrdine) {
      if (a.serramento_id) m.set(a.serramento_id, [...(m.get(a.serramento_id) ?? []), a]);
    }
    return m;
  }, [accessori]);
  const prossimaPosizione = accessori.reduce((max, a) => Math.max(max, (a.position ?? 0) + 1), 0);
  // Le posizioni col box dei complementi: le finestre sì, porte e persiane vendute da sole no.
  const idConBox = useMemo(
    () => new Set(serramenti.filter((s) => accettaComplementi(s, tipologieArea ?? [])).map((s) => s.id)),
    [serramenti, tipologieArea],
  );
  // Le finestre a cui agganciare un complemento rimasto senza, numerate come nella lista.
  const finestrePerAggancio = useMemo(
    () => serramenti.flatMap((s, i) => (idConBox.has(s.id)
      ? [{ id: s.id, etichetta: `${i + 1} · ${s.tipologia_label || "Finestra"}${s.larghezza_mm && s.altezza_mm ? ` · ${s.larghezza_mm}×${s.altezza_mm} mm` : ""}` }]
      : [])),
    [serramenti, idConBox],
  );
  const numeroFinestra = (id: string) => serramenti.findIndex((s) => s.id === id) + 1;
  const grigliaDi = (familyId: string) => queryClient.fetchQuery(opzioniGriglia(familyId));

  /** Dove si sta aggiungendo un complemento (una finestra o «tutte») e di che tipologia. */
  const [inCorso, setInCorso] = useState<{ dove: string; tipologia: string } | null>(null);
  const [daEliminare, setDaEliminare] = useState<SrAccessorioRow | null>(null);
  /** Il listino aperto per un complemento: per quali finestre, o per cambiare il modello di uno. */
  const [listino, setListino] = useState<ListinoAperto | null>(null);
  const occupati = !!inCorso || salvataggi.inCorso;

  /**
   * Apre il listino per un complemento: sulla sua tipologia, con le misure della
   * finestra (il cassonetto con la larghezza della finestra e l'altezza
   * dell'ultimo cassonetto) e, se c'è, sul modello da cui ripartire.
   */
  const apriListino = (opts: {
    tipologia: TipologiaListino | null;
    finestre: SrSerramentoRow[];
    sostituisce?: SrAccessorioRow | null;
    modello?: ModelloRipreso | null;
  }) => {
    const sostituisce = opts.sostituisce ?? null;
    const [prima] = opts.finestre;
    const nome = opts.tipologia ? nomeBottone(opts.tipologia) : "Complemento";
    const cassonetto = !!opts.tipologia && chiedeProfondita(opts.tipologia);
    const ultimoDellaTipologia = opts.tipologia
      ? [...accessori]
        .sort((a, b) => (b.position ?? 0) - (a.position ?? 0))
        .find((a) => haGiaComplemento([a], opts.tipologia as TipologiaListino))
      : undefined;
    const contesto = sostituisce
      ? `Cambia il modello: ${sostituisce.descrizione || nome} · ${misureTesto(sostituisce.larghezza_mm, sostituisce.altezza_mm)}`
      : opts.finestre.length > 1
        ? `${nome} su ${opts.finestre.length} finestre: ognuna con le sue misure e il suo prezzo`
        : `${nome} per la finestra ${numeroFinestra(prima?.id ?? "")} · ${misureTesto(prima?.larghezza_mm ?? null, prima?.altezza_mm ?? null)}`;
    setListino({
      finestre: opts.finestre,
      sostituisce,
      preferenze: preferenzeDaRiga(sostituisce ?? ultimoDellaTipologia, famiglie),
      partenza: {
        tipologia: opts.tipologia?.chiave ?? null,
        familyId: opts.modello?.riga.famiglia.id ?? null,
        valori: opts.modello?.valori,
        voci: opts.modello?.voci,
        larghezza_mm: sostituisce ? sostituisce.larghezza_mm : (prima?.larghezza_mm ?? null),
        altezza_mm: sostituisce
          ? sostituisce.altezza_mm
          : cassonetto ? (opts.modello?.misure.altezza_mm ?? null) : (prima?.altezza_mm ?? null),
        quantita: sostituisce ? sostituisce.quantita : (prima?.quantita ?? 1),
        contesto,
      },
    });
  };

  /**
   * «+ Tapparella»: col modello già usato nel preventivo si aggiunge subito, con
   * misure e prezzo di ogni finestra; al primo, fra più modelli, si sceglie dal
   * listino. Una finestra che il listino non sa prezzare riapre il listino, dove
   * si vede perché.
   */
  const aggiungi = async (tipologia: TipologiaListino, finestre: SrSerramentoRow[]) => {
    if (finestre.length === 0 || occupati) return;
    const nome = nomeBottone(tipologia);
    const modello = modelloDaRiprendere(tipologia, accessori);
    if (!modello) {
      apriListino({ tipologia, finestre });
      return;
    }
    const perUna = finestre.length === 1;
    setInCorso({ dove: perUna ? finestre[0].id : "tutte", tipologia: tipologia.chiave });
    try {
      let griglia: Awaited<ReturnType<typeof grigliaDi>> = [];
      if (modello.riga.famiglia.modalita_prezzo_base === "griglia") {
        try {
          griglia = await grigliaDi(modello.riga.famiglia.id);
        } catch (e) {
          toast.error(`${nome}: griglia prezzi non letta`, { description: e instanceof Error ? e.message : String(e) });
          return;
        }
      }
      const righe: Partial<SrAccessorioRow>[] = [];
      const daFinire: string[] = [];
      const scartate: { finestra: SrSerramentoRow; errore: string; motivo: string }[] = [];
      let position = prossimaPosizione;
      for (const finestra of finestre) {
        const esito = complementoPerFinestra({
          modello, tipologia, finestra, griglia, tariffePrezzi, supplierLines: supplierLineMap, position,
        });
        if ("errore" in esito) {
          scartate.push({ finestra, errore: esito.errore, motivo: esito.motivo });
          continue;
        }
        righe.push(esito.riga);
        if (esito.daCompletare) daFinire.push(esito.daCompletare);
        position += 1;
      }
      if (righe.length > 0) {
        try {
          await salvataggi.aggiungi(righe);
        } catch {
          return; // L'errore del salvataggio lo mostra già chi salva.
        }
      }
      const nomeModello = modello.riga.famiglia.nome;
      if (perUna) {
        const [scartata] = scartate;
        if (!scartata) {
          toast.success(`Alla finestra ${numeroFinestra(finestre[0].id)}: ${nomeModello}`, {
            description: daFinire[0] ?? "Il modello già usato nel preventivo: lo cambi dalla riga.",
          });
        } else if (scartata.motivo === "misure") {
          toast.error(`Scrivi prima larghezza e altezza della finestra ${numeroFinestra(finestre[0].id)}`, {
            description: `${nome}: le misure le prende da lì.`,
          });
        } else {
          toast.warning(scartata.errore);
          apriListino({ tipologia, finestre, modello });
        }
        return;
      }
      if (righe.length > 0) {
        toast.success(`${nomeModello} su ${righe.length} ${righe.length === 1 ? "finestra" : "finestre"}`, {
          description: daFinire.length > 0 ? `Da completare sulla riga: ${daFinire[0]}` : undefined,
        });
      }
      if (scartate.length > 0) {
        toast.warning(`${nome}: saltate le finestre ${scartate.map((x) => numeroFinestra(x.finestra.id)).join(", ")}`, {
          description: scartate[0].errore,
        });
      }
    } finally {
      setInCorso(null);
    }
  };

  /** Su tutte le finestre: solo dove manca quella tipologia. */
  const aggiungiATutte = (tipologia: TipologiaListino) => {
    const senza = serramenti.filter((f) => idConBox.has(f.id) && !haGiaComplemento(perFinestra.get(f.id) ?? [], tipologia));
    if (senza.length === 0) {
      toast.info(`${nomeBottone(tipologia)}: ce l'hanno già tutte le finestre`);
      return;
    }
    void aggiungi(tipologia, senza);
  };

  /** Un complemento fuori listino: misure e pezzi della finestra, il resto sulla riga. */
  const aggiungiAMano = (finestra: SrSerramentoRow) => {
    void salvataggi.aggiungi([{
      tipo: "tapparella",
      quantita: finestra.quantita ?? 1,
      larghezza_mm: finestra.larghezza_mm,
      altezza_mm: finestra.altezza_mm,
      posa_esclusa: finestra.posa_esclusa ?? false,
      serramento_id: finestra.id,
      position: prossimaPosizione,
    }]).catch(nessunErrore);
  };

  /** Il prodotto scelto nel listino: un complemento nuovo, su una o più finestre, o il modello nuovo di uno. */
  const confermaListino = async (scelta: ListinoPickResult) => {
    const richiesta = listino;
    if (!richiesta) return;
    const tipologia = tipologiaDelProdotto(tipologieArea ?? [], scelta.family_id);
    if (richiesta.sostituisce) {
      // Cambia il modello, il posto resta: finestra, profondità, posa.
      const { sostituisce } = richiesta;
      salvataggi.aggiorna(sostituisce.id, complementoDaScelta(scelta, tipologia, sostituisce.posa_esclusa));
      toast.success(`Modello cambiato: ${scelta.family_nome}`);
      return;
    }
    const [prima, ...altre] = richiesta.finestre;
    if (!prima) return;
    let position = prossimaPosizione;
    const righe: Partial<SrAccessorioRow>[] = [{
      ...complementoDaScelta(scelta, tipologia, prima.posa_esclusa ?? false),
      serramento_id: prima.id,
      position,
    }];
    position += 1;
    const saltate: number[] = [];
    // Su tutte le finestre: il modello scelto una volta, misure e prezzo di ognuna.
    const riga = tipologia ? prodottiDellaTipologia(tipologia).find((r) => r.famiglia.id === scelta.family_id) : undefined;
    if (altre.length > 0 && riga) {
      const modello: ModelloRipreso = {
        riga,
        valori: scelta.valori_assi,
        voci: scelta.scelte_assi ?? {},
        misure: { altezza_mm: chiedeProfondita(tipologia, scelta.family_nome) ? scelta.altezza_mm : null, profondita_mm: null },
      };
      let griglia: Awaited<ReturnType<typeof grigliaDi>> = [];
      try {
        if (riga.famiglia.modalita_prezzo_base === "griglia") griglia = await grigliaDi(riga.famiglia.id);
      } catch {
        // Senza griglia le altre finestre risultano saltate, e lo si dice.
      }
      for (const finestra of altre) {
        const esito = complementoPerFinestra({
          modello, tipologia, finestra, griglia, tariffePrezzi, supplierLines: supplierLineMap, position,
        });
        if ("errore" in esito) {
          saltate.push(numeroFinestra(finestra.id));
          continue;
        }
        righe.push(esito.riga);
        position += 1;
      }
    } else if (altre.length > 0) {
      saltate.push(...altre.map((f) => numeroFinestra(f.id)));
    }
    try {
      await salvataggi.aggiungi(righe);
    } catch {
      return; // L'errore del salvataggio lo mostra già chi salva.
    }
    toast.success(
      righe.length > 1 ? `${scelta.family_nome} su ${righe.length} finestre` : `Alla finestra ${numeroFinestra(prima.id)}: ${scelta.family_nome}`,
      saltate.length > 0
        ? { description: `Saltate le finestre ${saltate.join(", ")}: misure fuori dal listino o senza prezzo` }
        : undefined,
    );
  };

  const cambiaModello = (a: SrAccessorioRow) =>
    apriListino({ tipologia: tipologiaDelComplemento(tipologie, a), finestre: [], sostituisce: a });

  const aggiornaComplemento = (a: SrAccessorioRow, patch: Partial<SrAccessorioRow>) =>
    salvataggi.aggiorna(a.id, conTotale(a, patch));

  /**
   * La finestra cambia misure, pezzi o posa: i suoi complementi la seguono. Una
   * misura ritoccata a mano sul complemento resta; il prezzo del listino si rifà.
   */
  const seguiLaFinestra = async (prima: SrSerramentoRow, dopo: SrSerramentoRow) => {
    const cambiaPosa = (dopo.posa_esclusa ?? false) !== (prima.posa_esclusa ?? false);
    for (const c of perFinestra.get(prima.id) ?? []) {
      const misure = misureCheSeguono(c, prima, dopo);
      if (!misure && !cambiaPosa) continue;
      const patch: Partial<SrAccessorioRow> = {
        ...(misure ?? {}),
        ...(cambiaPosa ? { posa_esclusa: dopo.posa_esclusa ?? false } : {}),
      };
      const prossimo = { ...c, ...patch };
      const famiglia = c.family_id ? famiglie.find((f) => f.id === c.family_id) : undefined;
      if (famiglia && famiglia.modalita_prezzo_base !== "misura_libera") {
        try {
          const griglia = famiglia.modalita_prezzo_base === "griglia" ? await grigliaDi(famiglia.id) : [];
          const esito = prezzoComplemento({
            famiglia,
            valori: prossimo.valori_assi ?? {},
            larghezza: prossimo.larghezza_mm,
            altezza: prossimo.altezza_mm,
            quantita: prossimo.quantita || 1,
            posaEsclusa: prossimo.posa_esclusa,
            griglia,
            tariffePrezzi,
            supplierLines: supplierLineMap,
            lineaFornitore: c.supplier_product_line_id,
          });
          if ("errore" in esito) {
            toast.warning(`${c.descrizione || nomeBreve(c.tipo)}: prezzo da controllare`, { description: esito.errore });
          } else {
            patch.prezzo_unitario = esito.unitario;
            if (esito.voce) patch.listino_voce_id = esito.voce;
          }
        } catch {
          // Griglia non letta: le misure seguono la finestra, il prezzo resta quello di prima.
        }
      }
      salvataggi.aggiorna(c.id, conTotale(c, patch));
    }
  };

  /** Duplicando una finestra, la copia nasce coi suoi complementi: la sua tapparella, la sua zanzariera. */
  const duplicaComplementi = (origineId: string, nuovaId: string) => {
    const suoi = perFinestra.get(origineId) ?? [];
    if (suoi.length === 0) return;
    void salvataggi.aggiungi(suoi.map((c, i) => copiaComplemento(c, nuovaId, prossimaPosizione + i))).catch(nessunErrore);
  };

  /** Le props del blocco in fondo al box di una finestra; null se la posizione non ne ha uno. */
  const blocco = (finestra: SrSerramentoRow, indice: number): ComponentProps<typeof ComplementiFinestra> | null => {
    const suoi = perFinestra.get(finestra.id) ?? [];
    const conBox = idConBox.has(finestra.id);
    if (!conBox && suoi.length === 0) return null;
    return {
      finestra,
      complementi: suoi,
      tipologie: conBox ? tipologie : [],
      tariffePrezzi,
      supplierLineMap,
      onAggiungi: (t) => { void aggiungi(t, [finestra]); },
      onAMano: conBox ? () => aggiungiAMano(finestra) : undefined,
      onCambiaModello: cambiaModello,
      onPatch: aggiornaComplemento,
      onElimina: setDaEliminare,
      inCorso: inCorso?.dove === finestra.id ? inCorso.tipologia : null,
      occupata: occupati,
      destinazione: `Alla finestra ${indice + 1}`,
      daCompletare: conBox ? daCompletare : [],
    };
  };

  /** La barra «Complementi su tutte le finestre», da due finestre in su. */
  const barraTutte = idConBox.size >= 2 && tipologie.length > 0
    ? {
        tipologie,
        onAggiungi: aggiungiATutte,
        inCorso: inCorso?.dove === "tutte" ? inCorso.tipologia : null,
        occupata: occupati,
      }
    : null;

  const picker: ComponentProps<typeof ListinoPickerDialog> = {
    open: !!listino,
    onOpenChange: (aperto) => { if (!aperto) setListino(null); },
    onSelect: (scelta) => { void confermaListino(scelta); },
    tipo: "accessorio",
    partenza: listino?.partenza ?? null,
    preferenzeAssi: listino?.preferenze,
    testoConferma: listino?.sostituisce
      ? "Cambia modello"
      : (listino?.finestre.length ?? 0) > 1
        ? `Aggiungi a ${listino?.finestre.length} finestre`
        : "Aggiungi alla finestra",
  };

  const eliminazione = {
    complemento: daEliminare,
    onAnnulla: () => setDaEliminare(null),
    onConferma: () => {
      if (daEliminare) salvataggi.elimina(daEliminare.id);
      setDaEliminare(null);
    },
  };

  return {
    perFinestra,
    finestrePerAggancio,
    riepilogo: (finestraId: string) => riepilogoComplementi(perFinestra.get(finestraId) ?? []),
    blocco,
    barraTutte,
    picker,
    eliminazione,
    seguiLaFinestra,
    duplicaComplementi,
  };
}
