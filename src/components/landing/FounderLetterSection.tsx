import { useState } from "react";
import { useScrollAnimation } from "@/hooks/useScrollAnimation";
import { ChevronDown, ChevronUp } from "lucide-react";

export default function FounderLetterSection() {
  const [expanded, setExpanded] = useState(false);
  const { ref, isVisible } = useScrollAnimation({ threshold: 0.1 });

  return (
    <section ref={ref} className="py-20 bg-white">
      <div className="max-w-3xl mx-auto px-6">
        <div className={`text-center mb-10 transition-all duration-700 ${isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-10"}`}>
          <span className="inline-block mb-4 px-4 py-1.5 rounded-full border border-[#0fa68c]/30 bg-[#0fa68c]/10 text-[#0fa68c] text-xs font-semibold uppercase tracking-widest">
            La nostra storia
          </span>
          <h2 className="text-3xl md:text-4xl font-extrabold text-[#1a2744]">Lettera dal Fondatore</h2>
        </div>

        <div className={`relative transition-all duration-700 delay-200 ${isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-10"}`}>
          <div
            className="relative overflow-hidden transition-all duration-700 ease-in-out"
            style={{ maxHeight: expanded ? "5000px" : "220px" }}
          >
            <div className="prose prose-lg max-w-none text-[#1a2744]/80 space-y-5 leading-relaxed">
              <p>Caro Imprenditore Edile,</p>
              <p>Mi chiamo <strong>Florin</strong> e ti scrivo questa lettera perché so esattamente dove sei adesso.</p>
              <p>Lo so perché ci sono stato.</p>
              <p>Gestisco un'azienda di serramenti qui in Lombardia. Non un'agenzia di consulenza. Non una software house. Un'azienda <strong>VERA</strong>, con operai veri, cantieri veri, fornitori che chiamano per essere pagati e clienti che vogliono tutto per ieri.</p>
              <p>E per anni ho fatto quello che probabilmente stai facendo tu adesso:</p>
              <p className="text-xl font-bold text-[#1a2744] text-center">Fatturare. Fatturare. Fatturare.</p>
              <p>Convinto che il fatturato fosse la risposta a tutto. Convinto che più lavoro prendevo, più stavo bene. Convinto che i soldi, in qualche modo, sarebbero arrivati.</p>
              <p><strong>Sai com'è andata?</strong></p>
              <p>Ho chiuso un anno con un fatturato record. Ero euforico. Pensavo: "Finalmente quest'anno porto a casa qualcosa di serio."</p>
              <p>Poi ho guardato i numeri <strong>VERI</strong>.</p>
              <p>E ho scoperto che avevo lavorato un anno intero — sabati e domeniche compresi, notti a rispondere ai clienti, litigi con i fornitori, stress che mi stava distruggendo la salute — per portare a casa <strong>meno del mio capo cantiere</strong>.</p>
              <p>Quel giorno mi sono seduto alla scrivania e mi sono fatto una promessa:</p>
              <p className="text-2xl font-extrabold text-[#1a2744] text-center">"MAI PIÙ."</p>

              <p>Ho iniziato a cercare uno strumento per controllare i numeri della mia azienda. Qualcosa di semplice. Qualcosa che un imprenditore come me — non un ragioniere, non un informatico — potesse usare.</p>
              <p>Sai cosa ho trovato?</p>
              <p className="text-xl font-bold text-[#1a2744] text-center">NIENTE.</p>
              <p>Gestionali complicatissimi creati da ingegneri che non hanno mai visto un cantiere. Software generici che pretendono di andare bene per la pizzeria E per l'impresa edile. Fogli Excel infiniti che dopo due settimane smetti di compilare.</p>
              <p>Nessuno — e dico <strong>NESSUNO</strong> — aveva creato qualcosa di specifico per un imprenditore edile che volesse semplicemente sapere:</p>
              <ul className="space-y-2 list-none pl-0">
                <li className="flex items-start gap-2"><span className="text-[#0fa68c] font-bold">→</span> Quanto sto <strong>REALMENTE</strong> guadagnando su ogni cantiere?</li>
                <li className="flex items-start gap-2"><span className="text-[#0fa68c] font-bold">→</span> Ce la faccio a pagare tutti questo mese?</li>
                <li className="flex items-start gap-2"><span className="text-[#0fa68c] font-bold">→</span> Dove sto perdendo soldi senza accorgermene?</li>
              </ul>
              <p>Allora ho fatto l'unica cosa che un imprenditore vero sa fare quando non trova la soluzione:</p>
              <p className="text-xl font-bold text-[#0fa68c] text-center">Me la sono costruita da solo.</p>

              <div className="border-t border-[#1a2744]/10 my-8" />

              <p>Ho preso tutto quello che avevo imparato in anni di errori, conti sbagliati e notti insonni. E li ho messi insieme in una piattaforma semplice.</p>
              <p>Non un software con 500 funzioni di cui ne usi 3. Non un gestionale che richiede un corso di laurea per essere configurato.</p>
              <p>Uno strumento che in poche ore al mese ti dà il <strong>controllo TOTALE</strong> sui numeri che contano: ordini, margini, cassa, costi, magazzino, calendario lavori.</p>
              <p>Prima l'ho usato io. Sulla <strong>MIA</strong> azienda. Con i <strong>MIEI</strong> soldi in gioco.</p>
              <p><strong>E sai cosa è successo?</strong></p>
              <p>Nel <strong>primo mese</strong> ho scoperto che 2 cantieri su 5 avevano margini <strong>NEGATIVI</strong>. Stavo letteralmente pagando per lavorare.</p>
              <p>Nel <strong>secondo mese</strong> ho evitato uno scoperto bancario di 12.000€ perché il previsionale di cassa mi ha mostrato in anticipo che le entrate non coprivano le uscite.</p>
              <p>Nel <strong>terzo mese</strong> ho iniziato a rifiutare i lavori sbagliati. Per la prima volta nella mia carriera, ho detto NO a un cliente che voleva farmi lavorare sottocosto.</p>
              <p>A fine anno? Stesso fatturato dell'anno prima. Ma il mio compenso personale era cresciuto del <strong>40%</strong>. Non perché avevo lavorato di più. Perché avevo smesso di regalare soldi.</p>

              <div className="border-t border-[#1a2744]/10 my-8" />

              <p>Ora, lascia che ti faccia una <strong>promessa personale</strong>.</p>
              <p>Ti prometto una cosa sola, ma te la prometto con la faccia e il nome:</p>
              <p className="bg-[#0fa68c]/5 border-l-4 border-[#0fa68c] pl-4 py-3 rounded-r-lg font-semibold text-[#1a2744]">
                Se usi Edilizia in Cloud per 30 giorni, scoprirai ESATTAMENTE dove stai perdendo soldi. E avrai gli strumenti per smettere di perderli.
              </p>
              <p>Se non succede? Ti restituisco tutto. Senza farti domande.</p>

              <div className="border-t border-[#1a2744]/10 my-8" />

              <p>Adesso hai <strong>due strade</strong> davanti a te.</p>
              <p>La prima: chiudi questa pagina e torni a fare quello che hai sempre fatto.</p>
              <p>La seconda: prendi 15 minuti del tuo tempo per una demo gratuita. Vedi con i tuoi occhi come funziona. E decidi tu — con calma, senza pressioni — se questo strumento può fare per te quello che ha fatto per me.</p>
              <p className="font-semibold text-[#1a2744]">Perché quando vedi i numeri VERI della tua azienda per la prima volta… non torni più indietro.</p>

              <div className="text-center my-8">
                <a
                  href="#cta-finale"
                  onClick={(e) => { e.preventDefault(); document.querySelector("#cta-finale")?.scrollIntoView({ behavior: "smooth" }); }}
                  className="inline-block px-8 py-4 rounded-full bg-[#0fa68c] text-white font-bold text-lg hover:bg-[#0d9079] transition-all shadow-lg shadow-[#0fa68c]/30"
                >
                  👉 RICHIEDI LA TUA DEMO GRATUITA ORA
                </a>
                <p className="text-sm text-[#1a2744]/50 mt-3">15 minuti. Zero costi. Zero impegni. Solo chiarezza.</p>
              </div>

              <div className="border-t border-[#1a2744]/10 my-8" />

              <p>Un saluto da imprenditore a imprenditore,</p>
              <div className="mt-4 flex items-center gap-4">
                <div className="w-14 h-14 rounded-full bg-[#0fa68c] flex items-center justify-center shrink-0 shadow-lg shadow-[#0fa68c]/20">
                  <span className="text-white text-xl font-bold">F</span>
                </div>
                <div>
                  <p className="text-xl font-bold text-[#1a2744]">Florin</p>
                  <p className="text-[#0fa68c] font-semibold">Fondatore di Edilizia in Cloud</p>
                  <p className="text-sm text-[#1a2744]/60">Imprenditore nel settore serramenti — Lombardia</p>
                </div>
              </div>

              <div className="mt-10 space-y-6 bg-[#f8f9fb] rounded-xl p-6">
                <p className="text-sm leading-relaxed"><strong>P.S.</strong> So cosa stai pensando: "Sì, bello, ma io non ho tempo adesso." Lo so perché me lo dicevo anch'io. Ogni mese. Per anni. Mentre continuavo a perdere migliaia di euro senza saperlo. La demo dura 15 minuti. Quanto tempo hai perso <strong>OGGI</strong> a cercare un DDT, a rifare un calcolo, a chiederti se quel cantiere ti sta facendo guadagnare o perdere? Ecco. Quei 15 minuti li hai già persi.</p>
                <p className="text-sm leading-relaxed"><strong>P.P.S.</strong> Non ti scrivo come un venditore. Ti scrivo come un collega che ha capito una cosa nel modo più doloroso possibile: <em>il fatturato è vanità, il margine è sanità, la cassa è realtà</em>. Se questa frase ti ha fatto male allo stomaco, hai bisogno di Edilizia in Cloud più di quanto pensi.</p>
                <p className="text-sm leading-relaxed"><strong>P.P.P.S.</strong> Se stai leggendo fin qui, non sei il tipo che rimanda. Sei il tipo che agisce. Allora fallo adesso, finché questa urgenza la senti.</p>
              </div>

              <div className="text-center mt-8">
                <a
                  href="#cta-finale"
                  onClick={(e) => { e.preventDefault(); document.querySelector("#cta-finale")?.scrollIntoView({ behavior: "smooth" }); }}
                  className="inline-block px-8 py-4 rounded-full bg-[#0fa68c] text-white font-bold text-lg hover:bg-[#0d9079] transition-all shadow-lg shadow-[#0fa68c]/30"
                >
                  👉 SÌ, VOGLIO LA MIA DEMO GRATUITA
                </a>
              </div>
            </div>

            {/* Fade overlay when collapsed */}
            {!expanded && (
              <div className="absolute bottom-0 left-0 right-0 h-32 bg-gradient-to-t from-white to-transparent pointer-events-none" />
            )}
          </div>

          <div className="text-center mt-6">
            <button
              onClick={() => setExpanded(!expanded)}
              className="inline-flex items-center gap-2 px-6 py-3 rounded-full border border-[#1a2744]/20 text-[#1a2744] font-semibold hover:bg-[#1a2744]/5 transition-all"
            >
              {expanded ? (
                <>Chiudi la lettera <ChevronUp className="w-4 h-4" /></>
              ) : (
                <>Leggi la lettera completa <ChevronDown className="w-4 h-4" /></>
              )}
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}
