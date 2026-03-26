import { Building2, BarChart3, Users, FileText, TrendingUp, Smartphone } from "lucide-react";
import PerTipoPageTemplate, { PerTipoConfig } from "@/components/landing/PerTipoPageTemplate";

const config: PerTipoConfig = {
  seoTitle: "Gestionale per Imprese di Costruzione — Software Cantieri con AI | Edilizia in Cloud",
  seoDescription: "Il gestionale per imprese di costruzione con AI: controlla i margini reali di ogni commessa, gestisci subappaltatori, preventivi e fatturazione. Prova gratis 30 giorni.",
  seoKeywords: "gestionale impresa costruzione, software impresa edile, software general contractor, gestione appalti edili, software commesse costruzione, gestionale cantieri multipli, software margini costruzione, ERP impresa costruzione italiana",
  seoCanonical: "/per/imprese-costruzione",
  badge: "Imprese di Costruzione",
  heroTitle: (
    <>
      <span className="text-white">Sai davvero quanto</span>{" "}
      <span className="text-[#F97415]">guadagni su ogni commessa?</span>
    </>
  ),
  heroSubtitle: "La maggior parte delle imprese di costruzione scopre a lavori finiti che quel cantiere era in perdita. Con Edilizia in Cloud vedi i margini reali in tempo reale — prima che sia troppo tardi.",
  problemsTitle: "I problemi che conosce ogni imprenditore edile",
  problems: [
    { n: "01", title: "Scopri le perdite a cantiere chiuso", desc: "Il preventivo sembrava giusto, ma a fine lavori i costi reali erano il 30% in più. Materiali fuori controllo, ore extra non imputate, subappaltatori che sforano." },
    { n: "02", title: "Gestisci 5 cantieri con 5 fogli Excel diversi", desc: "Ogni capocantiere ha il suo file, il suo sistema, il suo modo di lavorare. Tu non hai mai la foto completa in tempo reale." },
    { n: "03", title: "I clienti pagano tardi e la cassa è sempre tesa", desc: "SAL non emessi in tempo, fatture sospese, subappaltatori da pagare prima di incassare. Il flusso di cassa è un rebus quotidiano." },
    { n: "04", title: "Preventivi fatti 'a sensazione'", desc: "Computi metrici su Excel, prezziario aggiornato a mano, margine stimato a occhio. Poi durante i lavori tutto cambia." },
  ],
  stats: [
    { value: "€2.8M", label: "Commesse gestite", sublabel: "in media per impresa attiva" },
    { value: "-18%", label: "Costi non imputati", sublabel: "scoperti nel primo mese" },
    { value: "12h", label: "Risparmiate/settimana", sublabel: "su reportistica e controllo" },
  ],
  modulesTitle: "I moduli più usati dalle imprese di costruzione",
  modules: [
    { icon: BarChart3, name: "Controllo Margini Commessa", desc: "Vedi il margine reale di ogni cantiere aggiornato al minuto: costi materiali, manodopera, subappalti e overhead.", saving: "Evita perdite medie del 8%" },
    { icon: FileText, name: "Preventivi e Computi Metrici", desc: "Crea preventivi professionali partendo dal prezziario DEI/regionale. Converti in commessa in un click.", saving: "Risparmio 3h per preventivo" },
    { icon: Users, name: "Gestione Subappaltatori", desc: "Traccia ordini, SAL, fatture ricevute e ritenute di garanzia per ogni subappaltatore.", saving: "Zero sorprese a fine lavori" },
    { icon: TrendingUp, name: "Forecast Cassa 90gg", desc: "Proiezione automatica di cassa basata su SAL emessi, scadenze fornitori e costi fissi.", saving: "Sempre liquidità positiva" },
    { icon: Building2, name: "Avanzamento Lavori", desc: "Il capocantiere aggiorna lo stato da app mobile. Tu vedi in tempo reale senza telefonate.", saving: "Controllo senza microgestione" },
    { icon: Smartphone, name: "App Mobile Cantiere", desc: "Foto, DL, bolle di consegna e timbrature direttamente dal cantiere. Tutto sincronizzato.", saving: "-80% carte in giro" },
  ],
  caseStudy: {
    company: "Costruzioni Ferretti S.r.l.",
    city: "Bologna",
    sector: "Costruzioni residenziali e commerciali",
    revenue: "2.4M €",
    person: "Gianluca Ferretti",
    role: "Titolare",
    initials: "GF",
    quote: "In 6 mesi ho scoperto che 2 cantieri su 7 erano in perdita. Uno lo sapevo, l'altro mi ha sorpreso. Ora ogni lunedì mattina apro il gestionale e in 10 minuti so come stanno andando tutti i cantieri. Prima ci voleva mezza giornata.",
    beforeLabel: "Utile medio per commessa",
    beforeValue: "4.2% (stimato a occhio)",
    afterLabel: "Controllo reale in tempo reale",
    afterValue: "11.8% (verificato)",
  },
  faq: [
    { q: "Funziona anche con cantieri in SAL (Stati di Avanzamento Lavori)?", a: "Sì. Gestisci SAL emessi, SAL incassati, ritenute di garanzia e fine lavori. Il sistema calcola automaticamente cosa hai diritto a fatturare e cosa è ancora aperto." },
    { q: "Posso gestire subappaltatori e fornitori separatamente?", a: "Assolutamente. Hai un registro separato per ogni subappaltatore con ordini, DDT, fatture ricevute, ritenute di garanzia e stato pagamenti." },
    { q: "Come importo i preventivi che faccio già con altri programmi?", a: "Importiamo file Excel/CSV o prezziari in formato standard. Il nostro team ti affianca nell'import durante il setup in 48h." },
    { q: "Il capocantiere deve essere esperto di informatica?", a: "No. L'app mobile è pensata per chi usa il telefono solo per WhatsApp. Foto, timbrature e bolle si fanno in 3 click." },
  ],
  ctaTitle: <><span className="text-white">Smetti di scoprire le perdite</span> <span className="text-[#F97415]">a cantiere chiuso.</span></>,
  ctaSubtitle: "30 minuti di demo gratuita per vedere i tuoi margini reali in tempo reale.",
  schemaFaq: [
    { q: "Qual è il miglior gestionale per imprese di costruzione?", a: "Edilizia in Cloud è il gestionale per imprese di costruzione con AI più usato in Italia: controlla margini reali per commessa, gestisce SAL, subappaltatori e previsione cassa in tempo reale." },
    { q: "Come si gestiscono i SAL con un software?", a: "Il software genera automaticamente i SAL sulla base dell'avanzamento lavori registrato in cantiere. Calcola importi, ritenute di garanzia e residui da fatturare." },
  ],
};

export default function ImpreseCostuzione() {
  return <PerTipoPageTemplate config={config} />;
}
