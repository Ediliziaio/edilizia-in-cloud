import { useState } from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { TooltipProvider } from "@/components/ui/tooltip";
import {
  Step3Consumi,
  Step4Tetto,
  Step5Configurazione,
} from "@/pages/azienda/fotovoltaico/FotovoltaicoWizard";
import { INITIAL } from "@/pages/azienda/fotovoltaico/FotovoltaicoWizard/constants";
import type { WizardData } from "@/pages/azienda/fotovoltaico/FotovoltaicoWizard/types";
import { validatePersistedDraft } from "@/pages/azienda/fotovoltaico/FotovoltaicoWizard/helpers";
import { leggiDisegnoCommerciale } from "../../supabase/functions/_shared/fvDisegnoCommerciale";
import { datiDalDisegno } from "@/lib/fotovoltaico/disegnoPreventivo";
import { spostaPinTettoFv } from "@/lib/fotovoltaico/spostaPinTetto";
import { analisiConsumiIniziale } from "../../supabase/functions/_shared/fvBollette";
import { anteprimaFotovoltaico } from "@/lib/fotovoltaico/anteprima";
import { AnteprimaVeloce } from "@/components/preventivatore/AnteprimaVeloce";
import "@/index.css";
const listino = {
  pannelli: [{
    id: "p450",
    nome: "Modulo dimostrativo 450 Wp",marca:"Demo Solar",modello:"PV450",
    potenza_w: 450,
    prezzo_vendita: 180,
    prezzo_netto: 100,
    larghezza_mm: 1100,
    lunghezza_mm: 1800,
  }],
  inverter: [{
    id: "inv",
    nome: "Inverter dimostrativo",marca:"Demo Solar",modello:"INV10",
    potenza_kw: 10,
    prezzo_vendita: 1500,
    prezzo_netto: 900,
  }],
  accumuli: [{
    id: "acc",
    nome: "Accumulo dimostrativo 5 kWh",marca:"Demo Solar",modello:"BAT5",
    capacita_kwh: 5,
    prezzo_vendita: 3000,
    prezzo_netto: 2000,
  }],
};
const key = "fv-qa-bolletta-v1",
  base: WizardData = {
    ...INITIAL,
    cliente_nome: "Cliente",
    cliente_cognome: "Dimostrativo",
    indirizzo: "Via Esempio 1",
    comune: "Roma",
    provincia: "RM",
    latitudine: 41.9,
    longitudine: 12.5,
    pannello_id: "p450",
    inverter_id: "inv",
    ore_sole_annue: 1700,
    consumo_annuo_kwh: 6000,
    costo_kwh_attuale: null,
    analisi_consumi: analisiConsumiIniziale(),
  };
function Qa() {
  const [data, setData] = useState<WizardData>(() => {
      try {
        return validatePersistedDraft(
          JSON.parse(localStorage.getItem(key) ?? "null"),
        )?.data ?? base;
      } catch {
        return base;
      }
    }),
    [fase, setFase] = useState(3),
    [stato, setStato] = useState("");
  const update = <K extends keyof WizardData>(k: K, v: WizardData[K]) =>
    setData((d) => {
      if (k === "layout_overlay") {
        const p = leggiDisegnoCommerciale(v);
        if (p) return { ...d, ...datiDalDisegno(p, 450, d.prodotti_extra) };
      }
      if (k === "riferimento_tetto") {
        return spostaPinTettoFv(d,v as WizardData["riferimento_tetto"]);
      }
      return { ...d, [k]: v };
    });
  const anteprima = anteprimaFotovoltaico(data, {
    listino,
    regoleSconto: [],
    impiantoConfigurato: true,
  });
  return (
    <main className="mx-auto max-w-[1600px] p-3 sm:p-6">
      <p className="rounded bg-amber-50 p-3 text-sm text-amber-900">
        Collaudo locale · schermate reali del wizard · listino e documenti
        sintetici · backend simulato · nessun dato di produzione
      </p>
      <h1 className="my-4 text-2xl font-semibold">
        Dalla bolletta al preventivo fotovoltaico
      </h1>
      <nav className="mb-5 flex flex-wrap gap-2">
        {[[3, "Consumi"], [4, "Tetto"], [5, "Impianto"], [8, "Preventivo"]].map(
          ([n, t]) => (
            <button
              key={n}
              className="min-h-11 rounded border bg-white px-4"
              onClick={() => setFase(Number(n))}
            >
              {t}
            </button>
          ),
        )}
        <button
          className="min-h-11 rounded border bg-white px-4"
          onClick={() => {
            localStorage.setItem(
              key,
              JSON.stringify({
                step: fase,
                data,
                completedSteps: [1, 2],
                savedAt: Date.now(),
              }),
            );
            setStato("Bozza salvata in questo browser");
          }}
        >
          Salva bozza
        </button>
        <button
          className="min-h-11 rounded border bg-white px-4"
          onClick={() => {
            setData(base);
            localStorage.removeItem(key);
            setStato("Esempio ripristinato");
          }}
        >
          Riparti
        </button>
      </nav>
      <p role="status">{stato}</p>
      {fase === 3 && (
        <Step3Consumi
          data={data}
          update={update}
          profili={[]}
          progettoId="20000000-0000-4000-a000-000000000001"
          readOnlyMode={false}
        />
      )}
      {fase === 4 && (
        <Step4Tetto
          data={data}
          update={update}
          readOnlyMode={false}
          analizzando={false}
          onAnalizza={() => update("ore_sole_annue", 1700)}
        />
      )}
      {fase === 5 && (
        <Step5Configurazione
          data={data}
          update={update}
          readOnlyMode={false}
          {...listino}
          tariffeFv={[]}
          kitFv={[]}
          serviziCatalogoCount={0}
          serviziCatalogo={[]}
          catalogoFvVuoto={false}
          scenario={null}
          calcolando={false}
          onRicalcola={() => {}}
        />
      )}
      {fase === 8 && <AnteprimaVeloce dati={anteprima} vista="cliente" />}
      <output className="mt-5 block rounded border bg-white p-4 text-sm">
        Layout confermato: {data.numero_pannelli_scelti} pannelli ·{" "}
        {data.potenza_kwp.toLocaleString("it-IT")} kWp ·{" "}
        {data.con_accumulo ? data.capacita_accumulo_kwh : 0} kWh accumulo
      </output>
    </main>
  );
}
createRoot(document.getElementById("root")!).render(
  <QueryClientProvider client={new QueryClient()}>
    <TooltipProvider>
      <Qa />
    </TooltipProvider>
  </QueryClientProvider>,
);
