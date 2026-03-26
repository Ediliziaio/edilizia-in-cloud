import { Home, FileText, Package, Users, BarChart3, Smartphone } from "lucide-react";
import PerTipoPageTemplate, { PerTipoConfig } from "@/components/landing/PerTipoPageTemplate";

const config: PerTipoConfig = {
  seoTitle: "Software Gestionale per Serramentisti — Infissi, Finestre, Porte | Edilizia in Cloud",
  seoDescription: "Il gestionale per serramentisti con AI: gestisci preventivi personalizzati per infissi, ordini a fornitore, installazioni e garanzie. Software specifico per aziende serramenti in Italia.",
  seoKeywords: "software gestionale serramentisti, gestionale infissi serramenti, software preventivi infissi, gestionale produzione serramenti, software installazione infissi, CRM serramentisti, software azienda serramenti, gestionale finestre porte",
  seoCanonical: "/per/serramentisti",
  badge: "Serramentisti — Infissi & Porte",
  heroTitle: (
    <>
      <span className="text-white">Ogni finestra è su misura.</span>{" "}
      <span className="text-[#F97415]">Anche il tuo gestionale.</span>
    </>
  ),
  heroSubtitle: "Preventivi per infissi personalizzati, ordini a fornitori, pianificazione installazioni e gestione garanzie — tutto integrato. Costruito per chi vende e installa serramenti.",
  problemsTitle: "Le difficoltà quotidiane di ogni serramentista",
  problems: [
    { n: "01", title: "Preventivi infiniti per misure e configurazioni diverse", desc: "Ogni cliente ha la sua casa, le sue misure, i suoi colori. Fare un preventivo richiede ore tra listini, configuratori e calcoli. E quando cambia qualcosa, si ricomincia da capo." },
    { n: "02", title: "Gli ordini ai fornitori sono sempre caotici", desc: "Ogni commessa ha i suoi infissi da ordinare. Misure sbagliate, ordini duplicati, spedizioni in ritardo: ogni errore ferma l'installazione e fa arrabbiare il cliente." },
    { n: "03", title: "Le installazioni si accumulano senza una pianificazione", desc: "Troppe commesse in contemporanea, squadre non organizzate, clienti che chiamano per sapere quando arrivate. La pianificazione installazioni è sempre all'ultimo momento." },
    { n: "04", title: "Garanzie e assistenza post-vendita non tracciate", desc: "A distanza di mesi il cliente chiama per un problema. Non sai quale prodotto ha, quale fornitore, quale data di installazione. Le garanzie si perdono nel caos." },
  ],
  stats: [
    { value: "-65%", label: "Tempo per preventivo", sublabel: "con configuratore integrato" },
    { value: "0", label: "Ordini sbagliati", sublabel: "grazie al doppio controllo automatico" },
    { value: "+28%", label: "Margine medio", sublabel: "su commesse serramenti" },
  ],
  modulesTitle: "Strumenti costruiti per serramentisti",
  modules: [
    { icon: FileText, name: "Preventivi Infissi Configurabili", desc: "Template di preventivo con misure, tipologie, colori, vetri e accessori. Calcola automaticamente il prezzo da listino e il margine.", saving: "-65% tempo preventivo" },
    { icon: Package, name: "Ordini ai Fornitori", desc: "Genera automaticamente gli ordini ai tuoi fornitori di infissi partendo dalla commessa. Traccia conferme, tempi di consegna e DDT.", saving: "Zero errori di misura" },
    { icon: Home, name: "Pianificazione Installazioni", desc: "Calendario visivo delle installazioni con assegnazione squadra, indirizzo, materiali da portare e tempo previsto.", saving: "Squadre sempre ottimizzate" },
    { icon: Users, name: "Storico Cliente e Garanzie", desc: "Per ogni cliente: prodotti installati, date, garanzie scadenza e storico interventi di assistenza. Sempre a portata di mano.", saving: "Assistenza in 30 secondi" },
    { icon: Smartphone, name: "CRM Clienti e Referral", desc: "Segui i tuoi clienti nel tempo: scadenza infissi, manutenzioni consigliate, sostituzione vetri. Genera nuove opportunità dall'esistente.", saving: "+35% riacquisti" },
    { icon: BarChart3, name: "Analisi Margini per Linea", desc: "Quale tipologia di infisso ti rende di più? Quale fornitore ha i margini migliori? Decidi con i dati.", saving: "Catalogo sempre profittevole" },
  ],
  caseStudy: {
    company: "Infissi & Serramenti Bianchi",
    city: "Padova",
    sector: "Vendita e installazione serramenti e infissi",
    revenue: "620K €",
    person: "Luca Bianchi",
    role: "Titolare",
    initials: "LB",
    quote: "Prima fare un preventivo mi prendeva 2-3 ore tra misure, listini, configurazioni e calcoli. Ora in 20 minuti ho un preventivo completo con margine calcolato, pronto da inviare al cliente. Ho triplicato il numero di preventivi inviati ogni settimana.",
    beforeLabel: "Tempo medio per preventivo",
    beforeValue: "2-3 ore su Excel",
    afterLabel: "Con configuratore integrato",
    afterValue: "20 minuti — 3x più preventivi",
  },
  faq: [
    { q: "Posso configurare i preventivi con le misure specifiche degli infissi?", a: "Sì. Il configuratore ti permette di inserire misure, tipologia, colore, vetro e accessori. Il prezzo viene calcolato automaticamente dal tuo listino personalizzato." },
    { q: "Gestisce gli ordini ai fornitori di infissi?", a: "Sì. Dal preventivo confermato genera automaticamente l'ordine al fornitore con tutte le specifiche tecniche. Traccia conferma d'ordine, data prevista consegna e DDT di ricevimento." },
    { q: "Come gestisco la garanzia degli infissi installati?", a: "Ogni installazione ha la sua scheda prodotto con data, fornitore, numero di serie e scadenza garanzia. Quando il cliente chiama per assistenza, hai tutto in 10 secondi." },
    { q: "Funziona anche per chi fa solo sostituzione vetri o riparazioni?", a: "Sì. Puoi gestire interventi rapidi di sostituzione, riparazioni e manutenzione con ticket aperti, chiusi e fatturati automaticamente." },
  ],
  ctaTitle: <><span className="text-white">Preventivo in 20 minuti.</span> <span className="text-[#F97415]">Commessa sotto controllo.</span></>,
  ctaSubtitle: "Demo gratuita di 30 minuti: vedi il configuratore preventivi per serramentisti in azione.",
  schemaFaq: [
    { q: "Qual è il miglior software gestionale per serramentisti?", a: "Edilizia in Cloud è il gestionale per serramentisti con AI: configura preventivi infissi in 20 minuti, gestisce ordini fornitori, pianifica installazioni e traccia garanzie." },
    { q: "Come fare preventivi veloci per infissi e serramenti?", a: "Il configuratore integrato permette di selezionare misure, tipologia, colori e accessori con calcolo automatico del prezzo da listino personalizzato. Da 3 ore a 20 minuti per preventivo." },
  ],
};

export default function Serramentisti() {
  return <PerTipoPageTemplate config={config} />;
}
