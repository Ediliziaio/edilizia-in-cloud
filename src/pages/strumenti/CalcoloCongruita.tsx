import { useMemo, useState } from "react";
import { CalculatorShell, CampoNumero, RigaRisultato } from "@/components/strumenti/CalculatorShell";
import { eur, pct } from "@/lib/calcoli/formato";
import {
  CATEGORIE_CONGRUITA,
  SOGLIA_PRIVATI_EUR,
  calcolaCongruita,
} from "@/lib/calcoli/congruita";
import { AlertTriangle, CheckCircle2, Info } from "lucide-react";

export default function CalcoloCongruita() {
  const [valoreOpera, setValoreOpera] = useState(400_000);
  const [manodopera, setManodopera] = useState(74_000);
  const [categoriaId, setCategoriaId] = useState("ristrutturazione-civile");
  const [pubblico, setPubblico] = useState(false);

  const r = useMemo(
    () =>
      calcolaCongruita({
        valoreOpera,
        manodoperaDenunciata: manodopera,
        categoriaId,
        pubblico,
      }),
    [valoreOpera, manodopera, categoriaId, pubblico],
  );

  return (
    <CalculatorShell
      slug="calcolo-congruita-manodopera"
      title="Calcolo congruità della manodopera"
      seoTitle="Calcolo Congruità Manodopera DM 143/2021 — Gratis"
      seoDescription="Calcolo gratuito della congruità della manodopera (DM 143/2021): inserisci valore dell'opera, categoria e manodopera denunciata e vedi se sei in soglia."
      sottotitolo="Verifica in dieci secondi se la manodopera denunciata in Cassa Edile raggiunge la soglia del DM 143/2021 per la categoria del tuo cantiere — e di quanto manca, se non la raggiunge."
      guida={{
        titolo: "DURC di congruità: soglie manodopera e come rispettarle",
        href: "/blog/durc-congruita-manodopera-soglie/",
      }}
      fonte={
        <p>
          Le percentuali sono gli indici di congruità dell'Accordo collettivo del 10 settembre 2020,
          allegati al DM 143/2021 e verificati sulla tabella pubblicata dal Ministero del Lavoro.
          Accordi successivi delle parti sociali (2022 e 2024) e il DM 60/2024 hanno integrato
          l'elenco con le categorie specialistiche OS: se il tuo cantiere ricade in una di quelle,
          consulta la Tabella A consolidata della tua Cassa Edile, che è la fonte su cui
          CNCE_EdilConnect fa materialmente il conteggio.
        </p>
      }
      spiegazione={
        <>
          <p>
            La verifica di congruità confronta il costo della manodopera denunciata alle Casse Edili
            con il valore complessivo dell'opera. La formula è una divisione:{" "}
            <strong>manodopera denunciata ÷ valore dell'opera × 100</strong>. Il risultato si
            confronta con la percentuale minima della categoria prevalente: se la raggiunge, il
            cantiere è congruo.
          </p>
          <p>
            Gli errori non stanno nell'aritmetica, stanno nei due termini della divisione. Al
            numeratore va la manodopera denunciata su quel cantiere <em>da tutti</em>: la tua e
            quella dei subappaltatori edili. È un totale che non controlli da solo, ed è il motivo
            per cui la congruità è un problema di filiera. Al denominatore va il valore dell'opera{" "}
            <em>aggiornato alle varianti</em>, non l'importo del contratto iniziale: se sono
            arrivate varianti in aumento e non le hai comunicate alla piattaforma, il sistema
            calcola su un numero vecchio.
          </p>
          <p>
            La verifica si applica a tutti i lavori pubblici, di qualunque importo, e ai lavori
            privati con valore dell'opera pari o superiore a{" "}
            {new Intl.NumberFormat("it-IT").format(SOGLIA_PRIVATI_EUR)} €. Attenzione: la soglia
            guarda il valore dell'<em>opera</em>, non del singolo contratto, e le varianti in
            aumento possono farla superare in corso d'opera a un cantiere partito sotto.
          </p>
          <p>
            Un risultato sotto soglia non significa automaticamente lavoro nero: esistono
            scostamenti legittimi — alta meccanizzazione, forniture con posa, lavorazioni affidate a
            imprese non edili che denunciano ad altri enti. Vanno però documentati{" "}
            <em>durante</em> il cantiere, non il giorno della contestazione.
          </p>
        </>
      }
      faqs={[
        {
          q: "Questo calcolo sostituisce la verifica ufficiale?",
          a: "No. È una stima che ti dice cosa risulta applicando l'indice della categoria che hai scelto, e serve a monitorare la situazione mese per mese. L'attestazione di congruità la rilascia la Cassa Edile territorialmente competente sulla base dei dati presenti su CNCE_EdilConnect, che possono differire dai tuoi se qualche denuncia manca o è in ritardo.",
        },
        {
          q: "Quale categoria devo scegliere se il cantiere ha lavorazioni diverse?",
          a: "Quella prevalente: la soglia dell'intera opera si determina sulla categoria prevalente, non si fa una media fra le lavorazioni. Se hai un dubbio su quale sia, è una domanda da fare alla Cassa Edile prima di iniziare, perché determina il numero rispetto a cui verrai misurato per tutta la durata del cantiere.",
        },
        {
          q: "Cosa metto nella manodopera denunciata?",
          a: "Il costo della manodopera denunciata alle Casse Edili su quel cantiere, sommando la tua e quella dei subappaltatori edili. Non le ore: il costo. E non la manodopera di imprese non edili, che denunciano ad altri enti e non entra nel conteggio della congruità — se una quota importante del lavoro è stata eseguita da loro, è proprio uno degli scostamenti che vanno documentati.",
        },
        {
          q: "Il risultato dice «non congruo»: cosa faccio adesso?",
          a: "Prima di tutto verifica che tutte le denunce siano effettivamente arrivate, tue e dei subappaltatori: nella maggior parte dei casi il buco è documentale e non reale. Poi controlla che il valore dell'opera sulla piattaforma sia aggiornato alle varianti. Se lo scostamento resta, hai due strade — documentarlo se è legittimo, oppure regolarizzare con la Cassa Edile. In entrambi i casi conviene muoversi mentre il cantiere è aperto: a fine lavori la manodopera mancante non si può più denunciare.",
        },
        {
          q: "Il calcolatore salva i miei dati?",
          a: "No. Il calcolo avviene interamente nel tuo browser: nessun dato inserito viene inviato o memorizzato da nessuna parte, e chiudendo la pagina non resta niente.",
        },
      ]}
    >
      <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm sm:p-6">
        <div className="grid gap-5 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <label htmlFor="categoria" className="block text-sm font-medium text-gray-800">
              Categoria prevalente dell'opera
            </label>
            <select
              id="categoria"
              value={categoriaId}
              onChange={(e) => setCategoriaId(e.target.value)}
              className="mt-1.5 w-full rounded-lg border border-gray-300 bg-white px-3 py-2.5 text-base text-gray-900 outline-none transition-colors focus:border-[#F97415] focus:ring-2 focus:ring-[#F97415]/20"
            >
              {CATEGORIE_CONGRUITA.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.label} — {c.incidenza.toString().replace(".", ",")}%
                </option>
              ))}
            </select>
          </div>

          <CampoNumero
            id="valore-opera"
            label="Valore complessivo dell'opera"
            value={valoreOpera}
            onChange={setValoreOpera}
            suffisso="€"
            step={1000}
            aiuto="Aggiornato alle varianti, non l'importo del contratto iniziale."
          />

          <CampoNumero
            id="manodopera"
            label="Manodopera denunciata in Cassa Edile"
            value={manodopera}
            onChange={setManodopera}
            suffisso="€"
            step={1000}
            aiuto="La tua più quella dei subappaltatori edili sullo stesso cantiere."
          />

          <fieldset className="sm:col-span-2">
            <legend className="text-sm font-medium text-gray-800">Tipo di lavori</legend>
            <div className="mt-2 flex gap-2">
              {[
                { v: false, l: "Privati" },
                { v: true, l: "Pubblici" },
              ].map((o) => (
                <button
                  key={o.l}
                  type="button"
                  onClick={() => setPubblico(o.v)}
                  aria-pressed={pubblico === o.v}
                  className={`flex-1 rounded-lg border px-4 py-2.5 text-sm font-medium transition-colors ${
                    pubblico === o.v
                      ? "border-[#F97415] bg-[#F97415]/10 text-[#F97415]"
                      : "border-gray-300 bg-white text-gray-700 hover:border-gray-400"
                  }`}
                >
                  {o.l}
                </button>
              ))}
            </div>
          </fieldset>
        </div>

        {/* ── Esito ── */}
        <div className="mt-6 border-t border-gray-200 pt-5">
          {!r.soggettoAVerifica ? (
            <div className="flex gap-3 rounded-xl bg-blue-50 p-4">
              <Info className="h-5 w-5 shrink-0 text-blue-600" aria-hidden="true" />
              <p className="text-sm leading-relaxed text-blue-900">
                Con questo valore, un cantiere <strong>privato</strong> non rientra nella verifica
                di congruità: la soglia è {new Intl.NumberFormat("it-IT").format(SOGLIA_PRIVATI_EUR)}{" "}
                € di valore dell'opera. Restano validi tutti gli altri obblighi contributivi e
                documentali. Attenzione però alle varianti in aumento: possono far superare la
                soglia in corso d'opera.
              </p>
            </div>
          ) : (
            <div
              className={`flex gap-3 rounded-xl p-4 ${
                r.congruo ? "bg-emerald-50" : "bg-amber-50"
              }`}
            >
              {r.congruo ? (
                <CheckCircle2 className="h-5 w-5 shrink-0 text-emerald-600" aria-hidden="true" />
              ) : (
                <AlertTriangle className="h-5 w-5 shrink-0 text-amber-600" aria-hidden="true" />
              )}
              <div className={`text-sm leading-relaxed ${r.congruo ? "text-emerald-900" : "text-amber-900"}`}>
                <p className="font-semibold">
                  {r.congruo
                    ? "L'incidenza raggiunge la soglia della categoria"
                    : `Mancano ${eur(r.scostamento)} di manodopera`}
                </p>
                <p className="mt-1">
                  {r.congruo
                    ? "Sulla base dei dati inseriti il cantiere risulta sopra soglia. Resta una stima: l'attestazione la rilascia la Cassa Edile sui dati presenti in CNCE_EdilConnect."
                    : "Verifica prima che tutte le denunce siano arrivate — tue e dei subappaltatori — e che il valore dell'opera sia aggiornato alle varianti. Nella maggior parte dei casi il buco è documentale."}
                </p>
              </div>
            </div>
          )}

          <div className="mt-4 divide-y divide-gray-100">
            <RigaRisultato
              label="Incidenza calcolata"
              valore={pct(r.incidenzaCalcolata)}
              forte
              tono={r.congruo ? "positivo" : "negativo"}
            />
            <RigaRisultato label="Soglia minima della categoria" valore={pct(r.incidenzaRichiesta)} />
            <RigaRisultato label="Manodopera attesa" valore={eur(r.manodoperaAttesa)} />
            <RigaRisultato
              label={r.scostamento > 0 ? "Manodopera mancante" : "Manodopera in eccedenza"}
              valore={eur(Math.abs(r.scostamento))}
              tono={r.scostamento > 0 ? "negativo" : "positivo"}
            />
          </div>
        </div>
      </div>
    </CalculatorShell>
  );
}
