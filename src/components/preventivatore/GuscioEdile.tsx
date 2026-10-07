/**
 * Il guscio dei preventivatori a computo (gli otto moduli edili): testata, barra
 * delle fasi in alto, il lavoro a sinistra, l'anteprima live a destra e il piede
 * fisso. Il modulo tiene il suo stato e i suoi passi (`children`); qui sta solo
 * ciò che è uguale per tutti, come nel Fotovoltaico e in Serramenti.
 *
 * - L'anteprima è `AnteprimaVeloce` sui dati di `anteprimaComputo`. La vista
 *   «Impresa» (costi e margine) c'è solo per chi ha il permesso di vederli.
 * - Sotto i 1280 px non c'è la colonna: il totale sta nel piede e apre l'anteprima
 *   dal basso. Sopra, la colonna si può nascondere (la scelta resta).
 * - Perché la barra e il piede restino fermi la rotta deve avere l'altezza
 *   bloccata: vedi `isGuscioPreventivatore` in CompanyLayout.
 */
import { useEffect, useRef, useState, type ComponentType, type ReactNode } from "react";
import { ArrowLeft, ArrowRight, Eye, Loader2, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { usePermissions } from "@/hooks/usePermissions";
import { type AnteprimaPreventivo, type VistaAnteprima, formattaEuro } from "@/lib/preventivatore/anteprima";
import { AnteprimaMobile } from "./AnteprimaMobile";
import { AnteprimaVeloce } from "./AnteprimaVeloce";
import { BarraFasi, type PassoPreventivatore } from "./BarraFasi";
import { BottoneTotale } from "./BottoneTotale";
import { CorpoPreventivatore } from "./CorpoPreventivatore";
import { PannelloAnteprima } from "./PannelloAnteprima";
import { PiedePreventivatore, StatoDelSalvataggio, type StatoSalvataggio } from "./PiedePreventivatore";
import { RISERVA_BARRA_INVIO_TELEFONO, STICKY_ALTO } from "./posizione";
import { useAnteprimaNascosta } from "./useAnteprimaNascosta";

export interface TestataGuscioEdile {
  icona: ComponentType<{ className?: string }>;
  /** Il codice del preventivo, o il nome dell'intervento se è nuovo. */
  titolo: string;
  cliente?: string | null;
  stato?: { label: string; className: string } | null;
  onEsci: () => void;
}

export interface PiedeGuscioEdile {
  onIndietro: () => void;
  indietroDisabilitato: boolean;
  onAvanti: () => void;
  /** «Crea e continua», «Salva e continua», «Salva». */
  etichettaAvanti: string;
  avantiDisabilitato: boolean;
  /** Si sta salvando o creando: l'icona gira. */
  inCorso: boolean;
  /** L'ultimo passo: l'icona è il dischetto, non la freccia. */
  ultimoPasso: boolean;
  /** Al passo PDF, da telefono, la barra la disegna il passo stesso. */
  nascostoSuTelefono?: boolean;
}

interface Props {
  testata: TestataGuscioEdile;
  passi: PassoPreventivatore[];
  corrente: string;
  completati: ReadonlySet<string>;
  conAvviso?: ReadonlySet<string>;
  bloccati?: ReadonlySet<string>;
  onSelect: (key: string) => void;
  anteprima: AnteprimaPreventivo;
  statoSalvataggio: StatoSalvataggio;
  /** «Salvato 12s fa»: lo compone il modulo, che conosce l'ora. */
  testoSalvataggio?: string | null;
  piede: PiedeGuscioEdile;
  /** Sopra la barra delle fasi: l'avviso del modello, per esempio. */
  sopra?: ReactNode;
  ariaLabelFasi?: string;
  /** Il passo corrente (e i suoi eventuali ErrorBoundary). */
  children: ReactNode;
}

export function GuscioEdile({
  testata, passi, corrente, completati, conAvviso, bloccati, onSelect, anteprima,
  statoSalvataggio, testoSalvataggio, piede, sopra, ariaLabelFasi, children,
}: Props) {
  const permessi = usePermissions();
  const puoVedereImpresa = permessi.canViewMargins || permessi.canViewCosts;
  const [vista, setVista] = useState<VistaAnteprima>("cliente");
  const [nascosta, impostaNascosta] = useAnteprimaNascosta();
  const [mobileAperta, setMobileAperta] = useState(false);

  const vistaImpresa = puoVedereImpresa && vista === "impresa";
  const vistaEffettiva: VistaAnteprima = vistaImpresa ? "impresa" : "cliente";
  const totaleTesto = anteprima.totaleDocumento != null ? formattaEuro(anteprima.totaleDocumento) : null;
  const nota = "Bozza visiva: voci, totali e cliente sono quelli del preventivo. Il documento definitivo è al passo PDF.";
  const Icona = testata.icona;

  // Cambiando fase si riparte dall'alto: il contenitore che scorre è <main>, non la finestra.
  const primaFaseRef = useRef(true);
  useEffect(() => {
    if (primaFaseRef.current) { primaFaseRef.current = false; return; }
    document.getElementById("main-content")?.scrollTo?.({ top: 0 });
  }, [corrente]);

  return (
    // Al passo PDF da telefono la barra di invio è fissa: sotto il contenuto serve lo spazio per non coprirne la fine.
    <div className={cn("-m-3 min-h-full bg-slate-50 md:-m-6", piede.nascostoSuTelefono && RISERVA_BARRA_INVIO_TELEFONO)}>
      {sopra}

      {/* Testata: codice, stato, cliente, salvataggio. Non è fissa: la barra delle fasi sotto sì. */}
      <div className="border-b bg-white">
        <div className="flex items-center gap-2 px-3 py-2.5 sm:gap-3 sm:px-6 sm:py-3">
          <Button variant="ghost" size="icon" onClick={testata.onEsci} className="h-10 w-10 shrink-0" aria-label="Esci dal preventivo">
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2 max-md:gap-y-0.5">
              <Icona className="h-4 w-4 text-orange-600 max-md:hidden" />
              <span className="text-sm font-semibold max-md:order-1 max-md:text-[15px]">{testata.titolo}</span>
              {testata.cliente && (
                <Badge variant="outline" className="text-[10px] max-md:order-4 max-md:border-0 max-md:p-0 max-md:text-xs max-md:font-normal max-md:text-muted-foreground">
                  {testata.cliente}
                </Badge>
              )}
              {testata.stato && (
                <Badge variant="outline" className={cn("text-[10px] max-md:order-2 max-md:text-[11px]", testata.stato.className)}>
                  {testata.stato.label}
                </Badge>
              )}
              {/* Telefono: codice e stato sulla prima riga, cliente e salvataggio sotto. */}
              <span aria-hidden className="hidden h-0 basis-full max-md:order-3 max-md:block" />
              {/* Da computer il salvataggio lo dice il piede: qui resta solo da telefono. */}
              {statoSalvataggio === "salvando" ? (
                <span className="flex items-center gap-1 text-[10px] text-muted-foreground max-md:order-5 max-md:text-xs md:hidden">
                  <Loader2 className="h-3 w-3 animate-spin" /> Salvataggio…
                </span>
              ) : statoSalvataggio === "modifiche" ? (
                <span className="text-[10px] text-amber-600 max-md:order-5 max-md:text-xs md:hidden" title="Le modifiche verranno salvate automaticamente entro 2 secondi">
                  ● Modifiche non salvate
                </span>
              ) : statoSalvataggio === "errore" ? (
                // Da telefono il piede non ha lo stato: l'errore del salvataggio si deve vedere comunque.
                <span className="text-[10px] font-medium text-red-600 max-md:order-5 max-md:text-xs md:hidden" title="Il salvataggio automatico non è riuscito: le modifiche restano qui e si riprova da soli">
                  ● Salvataggio non riuscito: riprovo da solo
                </span>
              ) : null}
            </div>
          </div>
        </div>
      </div>

      {/* Fissa in alto, col totale sempre in vista. Da telefono: pillole col nome corto. */}
      <BarraFasi
        className={cn("sticky z-30", STICKY_ALTO)}
        passi={passi}
        corrente={corrente}
        completati={completati}
        conAvviso={conAvviso}
        bloccati={bloccati}
        onSelect={onSelect}
        ariaLabel={ariaLabelFasi}
        totale={totaleTesto ? { valore: totaleTesto } : null}
        destra={
          <>
            {/* Sotto i 1280 px non c'è la colonna: l'anteprima si apre da qui. */}
            <Button variant="outline" size="sm" className="h-8 gap-1.5 xl:hidden" onClick={() => setMobileAperta(true)} aria-label="Apri l'anteprima" title="Apri l'anteprima">
              <Eye className="h-4 w-4" /> <span className="hidden md:max-lg:inline">Anteprima</span>
            </Button>
            {/* Computer: se l'hai nascosta, da qui torna. */}
            {nascosta && (
              <Button variant="outline" size="sm" className="hidden h-8 gap-1.5 xl:inline-flex" onClick={() => impostaNascosta(false)}>
                <Eye className="h-4 w-4" /> Mostra anteprima
              </Button>
            )}
          </>
        }
      />

      <CorpoPreventivatore
        anteprimaNascosta={nascosta}
        anteprima={
          <PannelloAnteprima
            vista={vista}
            onVista={setVista}
            puoVedereImpresa={puoVedereImpresa}
            onNascondi={() => impostaNascosta(true)}
            nota={nota}
          >
            <AnteprimaVeloce dati={anteprima} vista={vistaEffettiva} />
          </PannelloAnteprima>
        }
      >
        {children}
      </CorpoPreventivatore>

      {/* Piede fisso. Su telefono sopra la barra in basso dell'app. */}
      <PiedePreventivatore
        className={cn(piede.nascostoSuTelefono && "max-md:hidden")}
        stato={<StatoDelSalvataggio stato={statoSalvataggio} testo={statoSalvataggio === "salvato" ? testoSalvataggio : null} />}
        telefono={<BottoneTotale valore={totaleTesto ?? "—"} onClick={() => setMobileAperta(true)} />}
      >
        <Button
          variant="outline"
          onClick={piede.onIndietro}
          disabled={piede.indietroDisabilitato}
          className="min-h-11 md:min-h-0 max-md:w-11 max-md:shrink-0 max-md:px-0"
        >
          {/* Telefono: solo la freccia, il pulsante principale prende la riga. */}
          <ArrowLeft className="mr-1 h-4 w-4 max-md:mr-0" /> <span className="max-md:sr-only">Indietro</span>
        </Button>
        <Button
          onClick={piede.onAvanti}
          disabled={piede.avantiDisabilitato}
          className="min-h-11 flex-1 gap-1 bg-orange-500 hover:bg-orange-600 sm:flex-none md:min-h-0"
        >
          {piede.inCorso ? <Loader2 className="h-4 w-4 animate-spin" /> : piede.ultimoPasso ? <Save className="h-4 w-4" /> : <ArrowRight className="h-4 w-4" />}
          {piede.etichettaAvanti}
        </Button>
      </PiedePreventivatore>

      {/* Sotto i 1280 px non c'è la colonna: l'anteprima sale dal basso. */}
      <AnteprimaMobile aperta={mobileAperta} onApertaChange={setMobileAperta}>
        <PannelloAnteprima vista={vista} onVista={setVista} puoVedereImpresa={puoVedereImpresa} nota={nota}>
          <AnteprimaVeloce dati={anteprima} vista={vistaEffettiva} />
        </PannelloAnteprima>
      </AnteprimaMobile>
    </div>
  );
}
