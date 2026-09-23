import { useMemo, useState } from "react";
import { CalculatorShell, CampoNumero, RigaRisultato } from "@/components/strumenti/CalculatorShell";
import { eur, num } from "@/lib/calcoli/formato";
import { calcolaCostoOrario } from "@/lib/calcoli/costoOrario";
import { AlertTriangle, TrendingUp } from "lucide-react";

export default function CalcoloCostoOrario() {
  const [lorda, setLorda] = useState(30_000);
  const [contributi, setContributi] = useState(30);
  const [cassaEdile, setCassaEdile] = useState(10);
  const [tfr, setTfr] = useState(7);
  const [altri, setAltri] = useState(1_200);
  const [oreContrattuali, setOreContrattuali] = useState(2_080);
  const [oreNonProduttive, setOreNonProduttive] = useState(320);

  const r = useMemo(
    () =>
      calcolaCostoOrario({
        retribuzioneLordaAnnua: lorda,
        percentualeContributi: contributi,
        percentualeCassaEdile: cassaEdile,
        percentualeTFR: tfr,
        altriCostiAnnui: altri,
        oreContrattualiAnnue: oreContrattuali,
        oreNonProduttiveAnnue: oreNonProduttive,
      }),
    [lorda, contributi, cassaEdile, tfr, altri, oreContrattuali, oreNonProduttive],
  );

  return (
    <CalculatorShell
      slug="calcolo-costo-orario-operaio"
      title="Calcolo costo orario reale di un operaio edile"
      seoTitle="Calcolo Costo Orario Operaio Edile — Calcolatore Gratuito"
      seoDescription="Calcola il costo orario reale di un operaio edile: retribuzione, contributi, Cassa Edile, TFR e ore produttive. Il numero da usare nei preventivi."
      sottotitolo="Il costo vero di un'ora di lavoro non è la paga in busta: è il costo annuo pieno diviso le ore realmente produttive. Preventivare sul numero sbagliato è il modo più comune per firmare lavori in perdita."
      guida={{
        titolo: "Contabilità di cantiere: la guida completa",
        href: "/blog/contabilita-di-cantiere-guida/",
      }}
      spiegazione={
        <>
          <p>
            Il calcolo ha due termini, e quasi tutti li sbagliano entrambi nella stessa direzione —
            quella che fa sembrare il lavoro più redditizio di quanto sia.
          </p>
          <p>
            <strong>Al numeratore</strong> va il costo annuo pieno per l'azienda: retribuzione lorda
            più contributi, Cassa Edile, TFR e i costi diretti che quella persona genera comunque —
            DPI, visite mediche, formazione obbligatoria. Non la cifra in busta paga, che è solo una
            parte.
          </p>
          <p>
            <strong>Al denominatore</strong> vanno le ore <em>produttive</em>, non quelle
            contrattuali. Ferie, permessi, festività, malattia, formazione e giornate di maltempo
            sono ore pagate in cui non si produce, e vanno tolte. È il passaggio che manca quasi
            sempre, ed è quello che pesa di più: dividere per le ore contrattuali invece che per
            quelle produttive sottostima il costo in modo sistematico.
          </p>
          <p>
            Il calcolatore non impone percentuali contributive perché variano per inquadramento,
            territorio e CCNL applicato: le trovi nel prospetto paghe o le chiedi al consulente del
            lavoro. Dare qui un valore «medio» significherebbe farti preventivare su un dato falso,
            che è esattamente il problema da risolvere.
          </p>
        </>
      }
      faqs={[
        {
          q: "Quante ore non produttive devo considerare?",
          a: "Somma le ore annue di ferie, permessi retribuiti, festività, malattia media, formazione obbligatoria e le giornate perse per maltempo, che in edilizia non sono trascurabili. Il valore preimpostato è un punto di partenza: sostituiscilo con quello che risulta dai tuoi cartellini dell'anno scorso, perché è un dato che hai già e che vale molto più di qualsiasi media.",
        },
        {
          q: "Che percentuali contributive metto?",
          a: "Quelle che risultano dal tuo prospetto paghe. Variano per inquadramento, territorio e CCNL applicato: in edilizia convivono contratti diversi — Industria, Artigianato, Cooperative — e sopra il nazionale si innestano gli accordi integrativi territoriali. Se non le hai sottomano, il consulente del lavoro te le dà in due minuti.",
        },
        {
          q: "Devo includere i costi di struttura come l'ufficio o il capocantiere?",
          a: "No, non in questo calcolo. Qui esce il costo orario diretto della manodopera, che è quello da usare per valorizzare le ore su una commessa. I costi di struttura — ufficio, amministrazione, mezzi non dedicati — si attribuiscono separatamente come quota di spese generali, altrimenti li conteresti due volte.",
        },
        {
          q: "Perché il costo reale è così più alto della paga oraria?",
          a: "Perché gli oneri sommati (contributi, Cassa Edile, TFR) valgono una quota rilevante della retribuzione, e perché le ore su cui dividere sono meno di quelle contrattuali. I due effetti si moltiplicano fra loro: è per questo che la differenza fra il numero che tutti usano e quello vero è molto più grande di quanto si immagini.",
        },
        {
          q: "Come uso questo numero nei preventivi?",
          a: "Come costo di partenza delle ore, a cui aggiungere la quota di spese generali e il margine che vuoi ottenere. Il prezzo di vendita di un'ora non è il costo orario: è il costo orario più tutto il resto. Chi vende al costo orario pieno pensando di guadagnarci sta lavorando in pareggio nella migliore delle ipotesi.",
        },
      ]}
    >
      <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm sm:p-6">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-500">
          Costo annuo dell'operaio
        </h2>
        <div className="mt-4 grid gap-5 sm:grid-cols-2">
          <CampoNumero
            id="lorda"
            label="Retribuzione lorda annua"
            value={lorda}
            onChange={setLorda}
            suffisso="€"
            step={500}
            aiuto="Senza i contributi a carico azienda."
          />
          <CampoNumero
            id="altri"
            label="Altri costi annui diretti"
            value={altri}
            onChange={setAltri}
            suffisso="€"
            step={100}
            aiuto="DPI, visite mediche, formazione obbligatoria."
          />
          <CampoNumero
            id="contributi"
            label="Contributi INPS/INAIL"
            value={contributi}
            onChange={setContributi}
            suffisso="%"
            step={0.5}
            max={100}
          />
          <CampoNumero
            id="cassa-edile"
            label="Cassa Edile a carico azienda"
            value={cassaEdile}
            onChange={setCassaEdile}
            suffisso="%"
            step={0.5}
            max={100}
            aiuto="Varia per provincia: prendila dal prospetto."
          />
          <CampoNumero
            id="tfr"
            label="Accantonamento TFR"
            value={tfr}
            onChange={setTfr}
            suffisso="%"
            step={0.5}
            max={100}
          />
        </div>

        <h2 className="mt-7 text-sm font-semibold uppercase tracking-wide text-gray-500">
          Ore realmente disponibili
        </h2>
        <div className="mt-4 grid gap-5 sm:grid-cols-2">
          <CampoNumero
            id="ore-contrattuali"
            label="Ore contrattuali annue"
            value={oreContrattuali}
            onChange={setOreContrattuali}
            suffisso="h"
            step={40}
            aiuto="Circa 2.080 su 40 h × 52 settimane."
          />
          <CampoNumero
            id="ore-non-produttive"
            label="Ore annue pagate ma non produttive"
            value={oreNonProduttive}
            onChange={setOreNonProduttive}
            suffisso="h"
            step={8}
            aiuto="Ferie, permessi, festività, malattia, formazione, maltempo."
          />
        </div>

        <div className="mt-6 border-t border-gray-200 pt-5">
          {r.invalido ? (
            <div className="flex gap-3 rounded-xl bg-amber-50 p-4">
              <AlertTriangle className="h-5 w-5 shrink-0 text-amber-600" aria-hidden="true" />
              <p className="text-sm leading-relaxed text-amber-900">
                Con questi valori il calcolo non è possibile: servono una retribuzione maggiore di
                zero e delle ore produttive residue (le ore non produttive non possono eguagliare o
                superare quelle contrattuali).
              </p>
            </div>
          ) : (
            <>
              <div className="rounded-xl bg-gray-900 p-5 text-center">
                <p className="text-xs font-medium uppercase tracking-wide text-gray-400">
                  Costo orario aziendale reale
                </p>
                <p className="mt-1 text-4xl font-bold tabular-nums text-white">
                  {eur(r.costoOrarioReale)}
                </p>
                <p className="mt-2 text-sm text-gray-400">all&apos;ora, su {num(r.oreProduttive)} ore produttive</p>
              </div>

              <div className="mt-4 flex gap-3 rounded-xl bg-amber-50 p-4">
                <TrendingUp className="h-5 w-5 shrink-0 text-amber-600" aria-hidden="true" />
                <p className="text-sm leading-relaxed text-amber-900">
                  Il numero che si usa di solito — retribuzione lorda diviso ore contrattuali — è{" "}
                  <strong>{eur(r.costoOrarioApparente)}</strong> all&apos;ora. Preventivando su
                  quello sottostimi il costo del lavoro del{" "}
                  <strong>{num(r.scostamentoPercentuale, 1)}%</strong>: su una commessa da mille ore
                  sono{" "}
                  <strong>{eur((r.costoOrarioReale - r.costoOrarioApparente) * 1000)}</strong> di
                  margine che credevi di avere e non hai.
                </p>
              </div>

              <div className="mt-4 divide-y divide-gray-100">
                <RigaRisultato label="Retribuzione lorda annua" valore={eur(lorda)} />
                <RigaRisultato label="Oneri e altri costi" valore={eur(r.oneriTotali)} />
                <RigaRisultato label="Costo annuo pieno" valore={eur(r.costoAnnuoTotale)} forte />
                <RigaRisultato label="Ore produttive annue" valore={`${num(r.oreProduttive)} h`} />
              </div>
            </>
          )}
        </div>
      </div>
    </CalculatorShell>
  );
}
