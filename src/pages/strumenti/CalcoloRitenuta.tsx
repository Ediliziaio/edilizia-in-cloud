import { useMemo, useState } from "react";
import { CalculatorShell, CampoNumero, RigaRisultato } from "@/components/strumenti/CalculatorShell";
import { eur, num } from "@/lib/calcoli/formato";
import { calcolaRitenuta } from "@/lib/calcoli/ritenuta";
import { Info } from "lucide-react";

export default function CalcoloRitenuta() {
  const [importo, setImporto] = useState(500_000);
  const [percentuale, setPercentuale] = useState(0.5);
  const [numeroSal, setNumeroSal] = useState(5);
  const [mesi, setMesi] = useState(12);
  const [tasso, setTasso] = useState(6);

  const r = useMemo(
    () =>
      calcolaRitenuta(
        {
          importoLavori: importo,
          percentualeRitenuta: percentuale,
          numeroSal,
          mesiSvincolo: mesi,
        },
        tasso,
      ),
    [importo, percentuale, numeroSal, mesi, tasso],
  );

  return (
    <CalculatorShell
      slug="calcolo-ritenuta-garanzia"
      title="Calcolo ritenuta di garanzia"
      seoTitle="Calcolo Ritenuta di Garanzia sui SAL — Gratis"
      seoDescription="Calcola la ritenuta di garanzia trattenuta su ogni SAL, il totale immobilizzato a fine lavori e quanto ti costa quel credito fermo in attesa dello svincolo."
      sottotitolo="Quanto ti viene trattenuto su ogni SAL, quanto resta fermo a fine lavori — e quanto ti costa davvero quel credito che non puoi usare per mesi."
      guida={{
        titolo: "Ritenuta di garanzia negli appalti: come funziona",
        href: "/blog/ritenuta-di-garanzia-appalti-come-funziona/",
      }}
      spiegazione={
        <>
          <p>
            La ritenuta di garanzia è una quota che il committente trattiene su ogni stato di
            avanzamento e restituisce dopo il collaudo. Serve a garantirlo su vizi e difetti: sono
            soldi tuoi, già guadagnati, che restano fermi.
          </p>
          <p>
            Nei <strong>lavori pubblici</strong> la misura è fissata dal Codice dei contratti allo{" "}
            <strong>0,50% su ogni SAL</strong>, e si svincola in sede di conto finale dopo
            l&apos;approvazione del collaudo. Nei <strong>lavori privati</strong> non c&apos;è una
            percentuale di legge: la ritenuta esiste solo se il contratto la prevede, e allora vale
            quello che avete scritto — motivo per cui la percentuale, le condizioni e soprattutto{" "}
            <em>i tempi</em> di svincolo vanno negoziati prima di firmare, non discussi dopo.
          </p>
          <p>
            La voce che quasi nessuno calcola è l&apos;ultima riga: il costo finanziario. Un credito
            fermo per un anno non è un credito neutro — è liquidità che non hai per pagare fornitori
            e stipendi, e che quindi ti costa in interessi sull&apos;affidamento o in occasioni
            mancate. Inserisci il tuo tasso e vedi la cifra: è il numero da tenere presente quando
            decidi se accettare una ritenuta più alta in cambio di un prezzo migliore.
          </p>
          <p>
            Una nota sul metodo: il costo dell&apos;immobilizzo qui è calcolato sulla trattenuta
            totale per i mesi che separano il collaudo dallo svincolo. È una stima prudente per
            difetto, perché nella realtà le prime trattenute restano ferme molto più a lungo delle
            ultime.
          </p>
        </>
      }
      faqs={[
        {
          q: "Qual è la percentuale di ritenuta di garanzia?",
          a: "Nei lavori pubblici è lo 0,50% su ogni stato di avanzamento, previsto dal Codice dei contratti. Nei lavori privati non esiste una percentuale di legge: si applica solo se il contratto la prevede, e nella misura che le parti hanno concordato. È il motivo per cui in un contratto privato la clausola sulla ritenuta va letta con attenzione — sia nella percentuale sia nei tempi di svincolo.",
        },
        {
          q: "Quando viene restituita la ritenuta?",
          a: "Nei lavori pubblici in sede di conto finale, dopo l'approvazione del collaudo — e fra la fine dei lavori e quel momento possono passare mesi. Nei privati vale quello che dice il contratto: è proprio la voce su cui conviene negoziare, perché un termine indefinito come «a lavori ultimati e verificati» può allungarsi molto più di quanto immagini quando firmi.",
        },
        {
          q: "La ritenuta si applica anche all'IVA?",
          a: "No: si calcola sull'imponibile dei lavori, non sull'importo comprensivo di IVA. La fattura riporta l'importo pieno e la trattenuta è indicata separatamente — il che significa che l'IVA la versi comunque per intero, anche sulla parte che non hai ancora incassato.",
        },
        {
          q: "Posso sostituire la ritenuta con una fideiussione?",
          a: "In molti casi sì, se il committente lo accetta o se il contratto lo prevede: si presta una garanzia equivalente e si incassa il 100% di ogni SAL. Ha un costo — il premio della polizza — ma va confrontato con il costo di tenere quella somma immobilizzata per mesi, che è esattamente il numero che questo calcolatore ti mostra.",
        },
        {
          q: "Cosa metto nel tasso annuo?",
          a: "Il costo del tuo denaro: il tasso del tuo affidamento bancario, oppure il rendimento che otterresti impiegando quella liquidità in azienda. Il valore preimpostato è un ordine di grandezza prudente per una PMI, non una quotazione di mercato: sostituiscilo con il tuo per avere un numero che significhi qualcosa.",
        },
      ]}
    >
      <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm sm:p-6">
        <div className="grid gap-5 sm:grid-cols-2">
          <CampoNumero
            id="importo"
            label="Importo complessivo dei lavori"
            value={importo}
            onChange={setImporto}
            suffisso="€"
            step={5000}
            aiuto="Imponibile, IVA esclusa."
          />
          <CampoNumero
            id="percentuale"
            label="Percentuale di ritenuta"
            value={percentuale}
            onChange={setPercentuale}
            suffisso="%"
            step={0.1}
            max={100}
            aiuto="0,50% nei lavori pubblici. Nei privati: quella del contratto."
          />
          <CampoNumero
            id="numero-sal"
            label="Numero di SAL previsti"
            value={numeroSal}
            onChange={setNumeroSal}
            step={1}
            min={1}
          />
          <CampoNumero
            id="mesi"
            label="Mesi fra fine lavori e svincolo"
            value={mesi}
            onChange={setMesi}
            suffisso="mesi"
            step={1}
            aiuto="Include i tempi di collaudo e approvazione."
          />
          <div className="sm:col-span-2">
            <CampoNumero
              id="tasso"
              label="Costo del tuo denaro (tasso annuo)"
              value={tasso}
              onChange={setTasso}
              suffisso="%"
              step={0.5}
              aiuto="Il tasso del tuo affidamento, o il rendimento a cui rinunci."
            />
          </div>
        </div>

        <div className="mt-6 border-t border-gray-200 pt-5">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="rounded-xl bg-gray-900 p-5 text-center">
              <p className="text-xs font-medium uppercase tracking-wide text-gray-400">
                Trattenuto a fine lavori
              </p>
              <p className="mt-1 text-3xl font-bold tabular-nums text-white">
                {eur(r.trattenutaTotale)}
              </p>
            </div>
            <div className="rounded-xl bg-amber-50 p-5 text-center">
              <p className="text-xs font-medium uppercase tracking-wide text-amber-700">
                Ti costa, in {num(mesi)} mesi
              </p>
              <p className="mt-1 text-3xl font-bold tabular-nums text-amber-900">
                {eur(r.costoImmobilizzo)}
              </p>
            </div>
          </div>

          <div className="mt-4 flex gap-3 rounded-xl bg-blue-50 p-4">
            <Info className="h-5 w-5 shrink-0 text-blue-600" aria-hidden="true" />
            <p className="text-sm leading-relaxed text-blue-900">
              Su ogni SAL da <strong>{eur(r.importoPerSal)}</strong> incassi{" "}
              <strong>{eur(r.nettoPerSal)}</strong> e ne restano fermi{" "}
              <strong>{eur(r.trattenutaPerSal)}</strong>. Sono soldi già guadagnati: vanno
              considerati nel piano di cassa come credito differito, non come incasso mancato.
            </p>
          </div>

          <div className="mt-4 divide-y divide-gray-100">
            <RigaRisultato label="Importo medio per SAL" valore={eur(r.importoPerSal)} />
            <RigaRisultato label="Trattenuta su ogni SAL" valore={eur(r.trattenutaPerSal)} />
            <RigaRisultato label="Netto incassato per SAL" valore={eur(r.nettoPerSal)} />
            <RigaRisultato
              label="Totale incassato prima dello svincolo"
              valore={eur(r.nettoTotale)}
              forte
            />
          </div>
        </div>
      </div>
    </CalculatorShell>
  );
}
