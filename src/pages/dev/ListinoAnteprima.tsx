/**
 * Anteprima di sviluppo del Listino prodotti, con i listini d'esempio.
 *
 * Solo in sviluppo (vedi la rotta /dev/listino in App.tsx): serve a vedere la
 * pagina senza login e con listini costruiti in tutti i modi che le aziende
 * usano davvero. Le azioni non scrivono niente: mostrano un avviso.
 */
import { useMemo, useState } from "react";
import { FileSpreadsheet, HelpCircle, Layers, Package, Sparkles, Wand2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { ListinoBarra, type VistaListino } from "@/components/listino/ListinoBarra";
import { ListinoNavigatore } from "@/components/listino/ListinoNavigatore";
import { ESEMPI_LISTINO } from "@/lib/listino/esempiListino";
import { FILTRI_LISTINO_VUOTI, filtriAttivi, rigaPassa } from "@/lib/listino/filtriListino";
import { costruisciListino, filtraListino, type SelezioneListino } from "@/lib/listino/lineeListino";
import { indiceSchede, trovaSchedaLinea } from "@/lib/listino/schedeLinea";

/** Una scheda di linea d'esempio: senza tipologia, vale ovunque la linea si chiami così. */
const SCHEDE_ESEMPIO = indiceSchede([
  {
    id: "esempio-salamander-76",
    company_id: "esempio",
    macrocategoria_id: null,
    chiave: "pvc_salamander_76",
    nome: "PVC Salamander 76",
    descrizione:
      "Sistema in PVC a 6 camere con 3 guarnizioni e 76 mm di profondità: tiene fuori freddo e rumore, con rinforzi in acciaio e ferramenta di sicurezza di serie.",
    immagine_url: null,
    profondita_mm: 76,
    camere: 6,
    guarnizioni: 3,
    uw: 0.9,
    scheda_tecnica_url: null,
    scheda_tecnica_nome: null,
  },
]);

export default function ListinoAnteprima() {
  const esempi = useMemo(() => ESEMPI_LISTINO.map((crea) => crea()), []);
  const [indice, setIndice] = useState(0);
  const [cerca, setCerca] = useState("");
  const [filtri, setFiltri] = useState(FILTRI_LISTINO_VUOTI);
  const [vista, setVista] = useState<VistaListino>("cards");
  const [selezione, setSelezione] = useState<SelezioneListino>({});
  const [admin, setAdmin] = useState(true);

  const esempio = esempi[indice];
  const aree = useMemo(
    () => costruisciListino(esempio.famiglie, esempio.macrocategorie, esempio.categorie),
    [esempio],
  );
  const cercando = cerca.trim() !== "" || filtriAttivi(filtri) > 0;
  const visibili = useMemo(
    () => (cercando ? filtraListino(aree, (r) => rigaPassa(r, cerca, filtri)) : aree),
    [aree, cercando, cerca, filtri],
  );

  const avvisa = (testo: string) => toast.info(testo, { description: "Anteprima: non viene salvato niente." });

  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto max-w-[1500px] space-y-3 p-4 sm:p-6">
        <div className="flex flex-wrap items-center gap-2 rounded-md border border-dashed px-3 py-2 text-xs text-muted-foreground">
          <span className="font-semibold text-foreground">Anteprima di sviluppo</span>
          <label className="inline-flex items-center gap-1.5">
            Listino d'esempio
            <select
              className="rounded border bg-background px-1.5 py-0.5 text-foreground"
              value={indice}
              onChange={(e) => {
                setIndice(Number(e.target.value));
                setSelezione({});
              }}
            >
              {esempi.map((e, i) => (
                <option key={e.chiave} value={i}>
                  {e.nome}
                </option>
              ))}
            </select>
          </label>
          <span className="hidden md:inline">{esempio.descrizione}</span>
          <label className="ml-auto inline-flex items-center gap-1.5">
            <input type="checkbox" checked={admin} onChange={(e) => setAdmin(e.target.checked)} />
            Amministratore
          </label>
        </div>

        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-orange-500 to-amber-400 shadow-sm">
            <Package className="h-5 w-5 text-white" aria-hidden="true" />
          </div>
          <div className="min-w-0">
            <h1 className="text-xl font-bold leading-tight">Listino prodotti</h1>
            <p className="hidden text-sm text-muted-foreground sm:block">
              Area, tipologia, linea: i prodotti con il prezzo di ogni linea.
            </p>
          </div>
          <Button variant="ghost" size="sm" className="ml-auto gap-1.5 text-muted-foreground" onClick={() => avvisa("Come funziona")}>
            <HelpCircle className="h-4 w-4" aria-hidden="true" />
            Come funziona
          </Button>
        </div>

        <ListinoBarra
          cerca={cerca}
          onCerca={setCerca}
          filtri={filtri}
          onFiltri={setFiltri}
          vista={vista}
          onVista={setVista}
          isAdmin={admin}
          cestino={2}
          onCestino={() => avvisa("Cestino")}
          onTipologie={() => avvisa("Tipologie e linee")}
          onNuovoProdotto={() => avvisa("Nuovo prodotto")}
          azioniImporta={[
            { etichetta: "Excel o CSV", descrizione: "Da un foglio di calcolo", icona: FileSpreadsheet, onClick: () => avvisa("Import Excel") },
            { etichetta: "Listino fornitore in PDF", descrizione: "Letto dall'intelligenza artificiale", icona: Sparkles, onClick: () => avvisa("Import PDF") },
            { etichetta: "Modelli pronti", descrizione: "Tipologie con disegno e variabili", icona: Package, onClick: () => avvisa("Modelli pronti") },
            { etichetta: "Serie di profilo", descrizione: "Marca e serie diventano una linea", icona: Layers, onClick: () => avvisa("Serie di profilo") },
            { etichetta: "Prezzi delle linee infissi", descrizione: "Prezzo al metro quadro e linee", icona: Wand2, onClick: () => avvisa("Prezzi delle linee") },
          ]}
        />

        <ListinoNavigatore
          aree={visibili}
          selezione={selezione}
          onSelezione={setSelezione}
          vista={vista}
          cercando={cercando}
          isAdmin={admin}
          onAzzera={() => {
            setCerca("");
            setFiltri(FILTRI_LISTINO_VUOTI);
          }}
          azioni={{
            onApri: (f) => avvisa(`Apri «${f.nome}»`),
            onDuplica: (f) => avvisa(`Duplica «${f.nome}»`),
            onSposta: (f) => avvisa(`Sposta «${f.nome}»`),
            onElimina: (f) => avvisa(`Elimina «${f.nome}»`),
            onAttivo: (f) => avvisa(f.attivo ? `Disattiva «${f.nome}»` : `Riattiva «${f.nome}»`),
            onPreventivo: (f) => avvisa(`Preventivi: «${f.nome}»`),
          }}
          onCreaTipologia={(area, standard) => avvisa(`Crea «${standard.nome}» nell'area ${area.nome}`)}
          onCreaTutteStandard={(area) => avvisa(`Crea ${area.mancanti.length} tipologie standard in ${area.nome}`)}
          onNuovaLinea={(_area, tipologia) => avvisa(`Nuova linea in ${tipologia.nome}`)}
          onNuovoProdotto={(_area, tipologia, linea) =>
            avvisa(`Nuovo prodotto${tipologia ? ` in ${tipologia.nome}` : ""}${linea ? ` › ${linea.nome}` : ""}`)
          }
          onPrezziLinee={() => avvisa("Prezzi delle linee")}
          onCollega={(area, tipologia) => avvisa(`Collega «${tipologia.nome}» al ${area.standard?.preventivatore ?? "preventivatore"}`)}
          onAccessorio={(_area, tipologia) => avvisa(`«${tipologia.nome}» fra gli accessori della finestra`)}
          schedaDi={(tipologia, linea) => trovaSchedaLinea(SCHEDE_ESEMPIO, tipologia.macrocategoriaId, linea.nome)}
          onSchedaLinea={(_area, _tipologia, linea) => avvisa(`Scheda di ${linea.nome}`)}
        />
      </div>
    </div>
  );
}
