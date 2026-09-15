/**
 * Anteprima di sviluppo della composizione del preventivo serramenti, coi
 * complementi nel box di ogni finestra.
 *
 * Solo in sviluppo (rotta /dev/preventivo-serramenti in App.tsx): la sequenza si
 * vede senza login, su un listino d'esempio con prezzi inventati. Righe,
 * complementi e listino sono quelli veri (SerramentoRow, ComplementiFinestra,
 * ListinoPickerDialog, useComplementiFinestre); i salvataggi restano in memoria
 * e niente arriva al database.
 */
import { useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Package, RectangleVertical, RotateCcw } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  ComplementiFinestra, ComplementiSuTutteLeFinestre, EliminaComplementoDialog,
} from "@/components/serramenti/ComplementiFinestra";
import { ListinoPickerDialog, type ListinoPickResult } from "@/components/serramenti/ListinoPickerDialog";
import { SerramentoRow } from "@/components/serramenti/StepBom";
import { useComplementiFinestre, type SalvataggiComplementi } from "@/components/serramenti/useComplementiFinestre";
import type { SupplierProductLine } from "@/features/serramenti-listini/types";
import { articoloEsempio, asseEsempio, valoreEsempio } from "@/lib/listino/esempiListino";
import type { MacroListino } from "@/lib/listino/lineeListino";
import { queryKeys } from "@/lib/queryKeys";
import type { ListinoGrigliaItem } from "@/lib/serramenti/api";
import { calcolaM2 } from "@/lib/serramenti/calcoli";
import { comeListinoFamily } from "@/lib/serramenti/pickerListino";
import { opzioniGriglia } from "@/lib/serramenti/queries";
import { SrCard } from "@/lib/serramenti/wizardUI";
import type { FamilyWithAxes } from "@/types/articleFamily";
import type { SrAccessorioRow, SrSerramentoRow } from "@/types/serramenti";

const colore = (id: string) =>
  asseEsempio(`${id}-colore`, "Colore", [
    valoreEsempio(`${id}-bianco`, "Bianco", { is_default: true, sort_order: 0 }),
    valoreEsempio(`${id}-noce`, "Noce", { maggiorazione_tipo: "percentuale", maggiorazione_valore: 10, sort_order: 1 }),
  ]);

const FAMIGLIE: FamilyWithAxes[] = [
  articoloEsempio("es-f2a", "Finestra 2 Ante", { macrocategoria_id: "es-serramenti", modalita_prezzo_base: "mq", prezzo_base_vendita: 600, axes: [colore("es-f2a")] }),
  articoloEsempio("es-pf2", "Porta Finestra 2 Ante", { macrocategoria_id: "es-serramenti", modalita_prezzo_base: "mq", prezzo_base_vendita: 620, axes: [colore("es-pf2")] }),
  articoloEsempio("es-tap-pvc", "Tapparella PVC", { macrocategoria_id: "es-tapparelle", modalita_prezzo_base: "mq", prezzo_base_vendita: 90, axes: [colore("es-tap-pvc")] }),
  articoloEsempio("es-tap-all", "Tapparella Alluminio Coibentata", { macrocategoria_id: "es-tapparelle", modalita_prezzo_base: "mq", prezzo_base_vendita: 140 }),
  articoloEsempio("es-tap-bli", "Tapparella blindata", { macrocategoria_id: "es-tapparelle", modalita_prezzo_base: "mq", prezzo_base_vendita: 230 }),
  articoloEsempio("es-zanz", "Zanzariera a molla", { macrocategoria_id: "es-zanzariere", modalita_prezzo_base: "mq", prezzo_base_vendita: 70 }),
  articoloEsempio("es-cass", "Cassonetto termoisolato", { macrocategoria_id: "es-cassonetti", modalita_prezzo_base: "griglia" }),
  articoloEsempio("es-pers", "Persiana 2 ante", { macrocategoria_id: "es-persiane", modalita_prezzo_base: "mq", prezzo_base_vendita: 250 }),
  articoloEsempio("es-bli", "Porta blindata classe 3", { macrocategoria_id: "es-blindate", prezzo_base_vendita: 1500 }),
];

const macro = (id: string, nome: string, categoria_tipo: "principale" | "accessorio", sort_order: number) =>
  ({ id, nome, verticali_abilitati: ["serramentista"], categoria_tipo, attivo: true, sort_order }) as MacroListino;

const MACROCATEGORIE: MacroListino[] = [
  macro("es-serramenti", "Serramenti", "principale", 0),
  macro("es-tapparelle", "Tapparelle", "accessorio", 1),
  macro("es-zanzariere", "Zanzariere", "accessorio", 2),
  macro("es-cassonetti", "Cassonetti", "accessorio", 3),
  macro("es-persiane", "Persiane e scuri", "principale", 4),
  macro("es-blindate", "Porte blindate", "principale", 5),
];

const cella = (x: number, y: number, prezzo: number): ListinoGrigliaItem => ({
  id: `es-cass-${x}-${y}`,
  family_id: "es-cass",
  valore_x: x,
  valore_y: y,
  prezzo_vendita: prezzo,
  prezzo_acquisto: null,
  supplier_catalog_id: null,
  supplier_product_line_id: null,
  note: null,
});

/** Il cassonetto a griglia: larghezza per altezza del cassonetto. */
const GRIGLIA_CASSONETTO = [
  cella(1000, 250, 180), cella(1400, 250, 220), cella(1800, 250, 260),
  cella(1000, 300, 200), cella(1400, 300, 245), cella(1800, 300, 290),
];

const posizione = (
  id: string, position: number, nome: string, familyId: string, L: number, H: number, quantita: number, ambiente: string,
): SrSerramentoRow => {
  const famiglia = FAMIGLIE.find((f) => f.id === familyId);
  const metri = calcolaM2(L, H, quantita);
  const base = Number(famiglia?.prezzo_base_vendita ?? 0);
  const unitario = famiglia?.modalita_prezzo_base === "mq" ? Number(((base * metri) / quantita).toFixed(2)) : base;
  const conColore = famiglia?.axes.some((a) => a.codice === "colore");
  return {
    id,
    progetto_id: "anteprima",
    company_id: "esempio",
    position,
    tipologia: "finestra_2ante",
    tipologia_label: nome,
    ambiente,
    materiale: null,
    serie: null,
    vetro: null,
    vetro_specs: null,
    apertura: null,
    colore_interno: null,
    colore_esterno: null,
    larghezza_mm: L,
    altezza_mm: H,
    quantita,
    metri_quadri: metri,
    family_id: familyId,
    macrocategoria_override_id: null,
    listino_voce_id: null,
    supplier_catalog_id: null,
    supplier_product_line_id: null,
    prezzo_unitario: unitario,
    prezzo_totale: Number((unitario * quantita).toFixed(2)),
    valori_assi: conColore ? { colore: `${familyId}-bianco` } : {},
    scelte_assi: {},
    foto_storage_path: null,
    foto_render_path: null,
    note: null,
    posa_esclusa: false,
    created_at: "",
    updated_at: "",
  };
};

const POSIZIONI_INIZIALI = (): SrSerramentoRow[] => [
  posizione("es-w1", 0, "Finestra 2 Ante", "es-f2a", 1200, 1400, 1, "Soggiorno"),
  posizione("es-w2", 1, "Porta Finestra 2 Ante", "es-pf2", 1400, 2200, 1, "Cucina"),
  posizione("es-w3", 2, "Finestra 2 Ante", "es-f2a", 1000, 1300, 2, "Camere"),
  posizione("es-w4", 3, "Porta blindata classe 3", "es-bli", 900, 2100, 1, "Ingresso"),
  posizione("es-w5", 4, "Persiana 2 ante", "es-pers", 1200, 1400, 1, "Bagno"),
];

const nuovoComplemento = (riga: Partial<SrAccessorioRow>): SrAccessorioRow => ({
  id: crypto.randomUUID(),
  progetto_id: "anteprima",
  company_id: "esempio",
  position: 0,
  tipo: "tapparella",
  descrizione: null,
  quantita: 1,
  larghezza_mm: null,
  altezza_mm: null,
  profondita_mm: null,
  prezzo_unitario: null,
  prezzo_totale: null,
  listino_voce_id: null,
  serramento_id: null,
  note: null,
  posa_esclusa: false,
  family_id: null,
  valori_assi: null,
  scelte_assi: {},
  modalita_prezzo: null,
  supplier_catalog_id: null,
  supplier_product_line_id: null,
  created_at: "",
  updated_at: "",
  ...riga,
});

/** Il listino d'esempio messo in cache prima dei figli: righe e listino lo leggono da lì, senza login e senza rete. */
function useListinoDiEsempio() {
  const queryClient = useQueryClient();
  useState(() => {
    queryClient.setQueryData(queryKeys.articleFamilies.list(undefined), FAMIGLIE);
    queryClient.setQueryData(["listino-macrocategorie", null], MACROCATEGORIE);
    queryClient.setQueryData(["listino-categorie", null], []);
    queryClient.setQueryData(["listino-schede-linea", null], []);
    for (const f of FAMIGLIE) {
      queryClient.setQueryData(queryKeys.articleFamilies.detail(f.id), f);
      queryClient.setQueryData(opzioniGriglia(f.id).queryKey, f.id === "es-cass" ? GRIGLIA_CASSONETTO : []);
    }
    return true;
  });
}

export default function PreventivoSerramentiAnteprima() {
  useListinoDiEsempio();
  const [serramenti, setSerramenti] = useState<SrSerramentoRow[]>(POSIZIONI_INIZIALI);
  const [accessori, setAccessori] = useState<SrAccessorioRow[]>([]);
  const [aperta, setAperta] = useState<string | null>("es-w1");
  const [listinoAperto, setListinoAperto] = useState(false);

  const nomiMacro = useMemo(() => new Map(MACROCATEGORIE.map((m) => [m.id, m.nome])), []);
  const famigliePerId = useMemo(() => new Map(FAMIGLIE.map((f) => [f.id, f])), []);
  const nessunaTariffa = useMemo(() => new Map<string, number>(), []);
  const nessunaLinea = useMemo(() => new Map<string, SupplierProductLine>(), []);

  const salvataggi: SalvataggiComplementi = {
    aggiungi: async (righe) => {
      await new Promise((fatto) => setTimeout(fatto, 250));
      setAccessori((prima) => [...prima, ...righe.map(nuovoComplemento)]);
    },
    aggiorna: (id, patch) => setAccessori((prima) => prima.map((a) => (a.id === id ? { ...a, ...patch } : a))),
    elimina: (id) => setAccessori((prima) => prima.filter((a) => a.id !== id)),
    inCorso: false,
  };
  const complementi = useComplementiFinestre({
    serramenti,
    accessori,
    famiglie: FAMIGLIE,
    macrocategorie: MACROCATEGORIE,
    categorie: [],
    tariffePrezzi: nessunaTariffa,
    supplierLineMap: nessunaLinea,
    salvataggi,
  });

  const aggiornaPosizione = (id: string, patch: Partial<SrSerramentoRow>) => {
    const prima = serramenti.find((s) => s.id === id);
    if (!prima) return;
    const dopo: SrSerramentoRow = { ...prima, ...patch };
    if (patch.larghezza_mm !== undefined || patch.altezza_mm !== undefined || patch.quantita !== undefined) {
      dopo.metri_quadri = calcolaM2(dopo.larghezza_mm ?? 0, dopo.altezza_mm ?? 0, dopo.quantita ?? 1);
    }
    if (patch.prezzo_unitario !== undefined || patch.quantita !== undefined) {
      dopo.prezzo_totale = (dopo.prezzo_unitario ?? 0) * (dopo.quantita ?? 1);
    }
    setSerramenti((lista) => lista.map((s) => (s.id === id ? dopo : s)));
    void complementi.seguiLaFinestra(prima, dopo);
  };

  const duplica = (s: SrSerramentoRow) => {
    const copia = { ...s, id: crypto.randomUUID(), position: serramenti.length };
    setSerramenti((lista) => [...lista, copia]);
    complementi.duplicaComplementi(s.id, copia.id);
  };

  const elimina = (s: SrSerramentoRow) => {
    setSerramenti((lista) => lista.filter((x) => x.id !== s.id));
    setAccessori((prima) => prima.filter((a) => a.serramento_id !== s.id));
    toast.success(`Tolta: ${s.tipologia_label}`, { description: "Anteprima: non viene salvato niente." });
  };

  const aggiungiDalListino = (scelta: ListinoPickResult) => {
    const id = crypto.randomUUID();
    const nuova = posizione(
      id, serramenti.length, scelta.family_nome, scelta.family_id,
      scelta.larghezza_mm ?? 0, scelta.altezza_mm ?? 0, scelta.quantita || 1, "",
    );
    setSerramenti((lista) => [...lista, {
      ...nuova,
      prezzo_unitario: scelta.prezzo_unitario,
      prezzo_totale: (scelta.prezzo_unitario ?? 0) * (scelta.quantita || 1),
      valori_assi: scelta.valori_assi,
      scelte_assi: scelta.scelte_assi ?? {},
      listino_voce_id: scelta.griglia_id ?? null,
    }]);
    setAperta(id);
  };

  const ricomincia = () => {
    setSerramenti(POSIZIONI_INIZIALI());
    setAccessori([]);
    setAperta("es-w1");
  };

  return (
    <div className="min-h-screen bg-muted/30 px-3 py-4 md:px-6">
      <div className="mx-auto max-w-4xl space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
          <span>
            <strong>Anteprima di sviluppo</strong> · listino d'esempio con prezzi inventati: niente viene salvato.
          </span>
          <Button size="sm" variant="outline" className="h-7 gap-1 text-xs" onClick={ricomincia}>
            <RotateCcw className="h-3.5 w-3.5" /> Ricomincia
          </Button>
        </div>

        <SrCard
          title="Composizione offerta"
          description="Finestre, porte e persiane dal listino, voci fuori listino o importi a corpo. Tapparelle, zanzariere e cassonetti si aggiungono nel box della loro finestra, con le sue misure."
          icon={<RectangleVertical className="h-4 w-4" />}
        >
          {complementi.barraTutte && <ComplementiSuTutteLeFinestre {...complementi.barraTutte} />}
          <div className="mb-3 space-y-2">
            {serramenti.map((s, idx) => {
              const famiglia = s.family_id ? famigliePerId.get(s.family_id) : undefined;
              const blocco = complementi.blocco(s, idx);
              return (
                <SerramentoRow
                  key={s.id}
                  serramento={s}
                  index={idx}
                  expanded={aperta === s.id}
                  onToggle={() => setAperta((prima) => (prima === s.id ? null : s.id))}
                  onPatch={(patch) => aggiornaPosizione(s.id, patch)}
                  onDuplicate={() => duplica(s)}
                  onDelete={() => elimina(s)}
                  family={famiglia ? comeListinoFamily(famiglia) : undefined}
                  macroId={famiglia?.macrocategoria_id ?? undefined}
                  macroNome={famiglia?.macrocategoria_id ? nomiMacro.get(famiglia.macrocategoria_id) : undefined}
                  tariffePrezzi={nessunaTariffa}
                  supplierLineMap={nessunaLinea}
                  richiestaBulk={null}
                  richiestaBulkPosa={null}
                  testoComplementi={complementi.riepilogo(s.id)}
                  complementi={blocco ? <ComplementiFinestra {...blocco} /> : null}
                />
              );
            })}
          </div>
          <Button
            onClick={() => setListinoAperto(true)}
            variant="outline"
            className="w-full gap-1 border-2 border-dashed border-orange-300 hover:bg-orange-50"
          >
            <Package className="h-4 w-4" /> Aggiungi dal listino
          </Button>
        </SrCard>
      </div>

      <ListinoPickerDialog open={listinoAperto} onOpenChange={setListinoAperto} onSelect={aggiungiDalListino} />
      <ListinoPickerDialog {...complementi.picker} />
      <EliminaComplementoDialog {...complementi.eliminazione} />
    </div>
  );
}
