import { Building2, FileText, TrendingUp, Smartphone, Users, BarChart3 } from "lucide-react";
import PerTipoPageTemplate, { PerTipoConfig } from "@/components/landing/PerTipoPageTemplate";

const config: PerTipoConfig = {
  seoTitle: "Gestionale per Piccole Imprese Edili e Artigiani — Software Semplice | Edilizia in Cloud",
  seoDescription: "Il gestionale per piccole imprese edili e artigiani: fatture, preventivi, cantieri e cassa — tutto da smartphone. Semplice come WhatsApp. Prova gratis 30 giorni senza impegno.",
  seoKeywords: "software gestionale piccola impresa edile, gestionale artigiano edile, software muratore, software piccola impresa costruzioni, gestionale artigiani edili, software fatturazione piccola impresa edile, gestionale impresa edile mono dipendente, software edile semplice",
  seoCanonical: "/per/piccole-imprese",
  badge: "Piccole Imprese & Artigiani Edili",
  heroTitle: (
    <>
      <span className="text-white">Sei tu l'azienda.</span>{" "}
      <span className="text-[#F97415]">Il gestionale lavora per te.</span>
    </>
  ),
  heroSubtitle: "Se fai tutto da solo — preventivi, cantiere, fatture, clienti — allora hai bisogno di uno strumento che fa lo stesso. Semplice come WhatsApp, potente come un ufficio completo.",
  problemsTitle: "I problemi di chi lavora da solo o con pochi operai",
  problems: [
    { n: "01", title: "La burocrazia ti ruba ore che potresti passare in cantiere", desc: "Fatture, DDT, preventivi, F24: ogni documento richiede tempo che non hai. La sera finisci in cantiere e devi ancora fare l'amministrazione." },
    { n: "02", title: "Non sai quanto hai guadagnato davvero questo mese", desc: "Sai quanto hai incassato, ma i costi del materiale, il carburante, i subappalti? Il guadagno netto rimane un'incognita fino a quando arriva il commercialista." },
    { n: "03", title: "I preventivi fatti a mano ti fanno perdere lavori", desc: "Il cliente ti chiede un preventivo. Tu ci metti tre giorni a farlo su Word. Nel frattempo l'ha dato a un altro. I preventivi veloci e professionali fanno la differenza." },
    { n: "04", title: "I clienti pagano quando vogliono e la cassa è sempre corta", desc: "Paghi i materiali prima di incassare. Poi aspetti 60-90 giorni per il saldo. Nel mezzo ci sono le spese fisse. La cassa è sempre in bilico." },
  ],
  stats: [
    { value: "15min", label: "Per fare un preventivo", sublabel: "da 2 ore su Word" },
    { value: "€79", label: "Al mese", sublabel: "meno di un operaio per mezz'ora" },
    { value: "4.9★", label: "Soddisfazione", sublabel: "da 142 imprenditori attivi" },
  ],
  modulesTitle: "Tutto quello che ti serve, niente di superfluo",
  modules: [
    { icon: FileText, name: "Preventivi Professionali in 15 min", desc: "Template pronti per ogni tipo di lavoro. Prezziario integrato, margine automatico, invia via email o WhatsApp direttamente.", saving: "10x più veloci" },
    { icon: TrendingUp, name: "Fatturazione Elettronica SDI", desc: "Emetti fatture elettroniche conformi SDI direttamente dal telefono. Zero errori, zero problemi con il commercialista.", saving: "Fattura in 2 click" },
    { icon: BarChart3, name: "Controllo Cassa e Spese", desc: "Vedi in tempo reale quanto hai in cassa, cosa devi pagare e cosa devi incassare. Il tuo bilancio sempre chiaro.", saving: "Zero sorprese" },
    { icon: Smartphone, name: "Tutto da Smartphone", desc: "Preventivi, fatture, note spese, foto cantiere: tutto dall'app mobile. Funziona anche offline in cantiere.", saving: "Ufficio in tasca" },
    { icon: Building2, name: "Gestione Cantieri Semplice", desc: "Apri un cantiere, aggiungi i costi man mano, vedi il margine finale. Semplicissimo.", saving: "Controllo senza Excel" },
    { icon: Users, name: "Gestione Clienti e Storico", desc: "Scheda per ogni cliente con storico lavori, contatti e documenti. Trova tutto in 5 secondi.", saving: "Mai più dati persi" },
  ],
  caseStudy: {
    company: "Murature e Rivestimenti di Conti Paolo",
    city: "Bergamo",
    sector: "Piccola impresa — murature, intonaci, rivestimenti",
    revenue: "180K €",
    person: "Paolo Conti",
    role: "Artigiano — lavora da solo con 2 operai",
    initials: "PC",
    quote: "Ero scettico. Pensavo fosse roba da grandi aziende. Invece in due giorni ho imparato tutto e ora faccio i preventivi in 15 minuti dal telefono mentre sono ancora in cantiere. Il cliente li riceve subito e risponde subito. Ho già preso tre lavori che prima avrei perso.",
    beforeLabel: "Preventivi inviati a settimana",
    beforeValue: "2 (fatti la sera su Word)",
    afterLabel: "Con app mobile",
    afterValue: "6-7 preventivi — da cantiere",
  },
  faq: [
    { q: "È troppo complicato per chi non è esperto di informatica?", a: "No. Se sai usare WhatsApp, sai usare Edilizia in Cloud. L'interfaccia è pensata per chi lavora in cantiere, non per gli informatici. Setup guidato in 48h con il nostro team." },
    { q: "Costa troppo per una piccola impresa?", a: "Il piano Starter parte da €79/mese. Se ti fa risparmiare anche solo 3 ore al mese di burocrazia, si ripaga da solo. E se non ti fa guadagnare di più, è gratis per sempre." },
    { q: "Posso usarlo solo per la fatturazione elettronica?", a: "Sì. Puoi iniziare solo con fatturazione e preventivi, poi aggiungere i moduli che ti servono man mano. Non devi usare tutto subito." },
    { q: "Funziona anche offline in cantiere?", a: "Sì. L'app mobile funziona offline. Quando torni in zona con connessione, tutto si sincronizza automaticamente." },
  ],
  ctaTitle: <><span className="text-white">Il tuo ufficio.</span> <span className="text-[#F97415]">In tasca.</span></>,
  ctaSubtitle: "Demo gratuita di 30 minuti. Ti mostriamo tutto — senza termini tecnici, senza complicazioni.",
  schemaFaq: [
    { q: "Qual è il miglior software gestionale per piccole imprese edili?", a: "Edilizia in Cloud è il gestionale per piccole imprese edili e artigiani più semplice in Italia: preventivi in 15 minuti, fatturazione elettronica da smartphone, controllo cassa e cantieri. Piano Starter da €79/mese." },
    { q: "Un artigiano edile ha bisogno di un gestionale?", a: "Sì. Un gestionale semplice come Edilizia in Cloud permette a un artigiano di fare preventivi professionali veloci, emettere fatture elettroniche SDI e tenere sotto controllo cassa e margini — tutto dallo smartphone." },
  ],
};

export default function PiccoleImprese() {
  return <PerTipoPageTemplate config={config} />;
}
