import { CalendarDays, Cloud, FileText, Mail, MessageCircle } from "lucide-react";
import InkOrbitFeatures from "@/components/ui/ink-orbit-features";
import logo from "@/assets/edilizia-in-cloud-logo-small.webp";

/**
 * Ufficio e cantiere nello stesso posto, in tre schemi vivi: la squadra che
 * lavora dal telefono e i rapportini che escono da soli, i collegamenti che ci
 * sono davvero (fatturazione elettronica, calendario, WhatsApp, posta) e
 * l'andamento del margine con la previsione. Cifre d'esempio, niente prezzi.
 */
export default function FunzioniViveSection() {
  return (
    <section className="bg-white px-4 py-12 sm:py-20">
      <div className="mx-auto max-w-6xl">
        <InkOrbitFeatures
          theme="light"
          chip="Edilizia in Cloud"
          logo={logo}
          mark={Cloud}
          tag="Tutto collegato"
          title={"Ufficio e cantiere,\n*nello stesso posto*"}
          team={[
            { name: "Marco · rapportino di oggi" },
            { name: "Giulia · fattura al cliente" },
            { name: "Luca · foto del cantiere" },
            { name: "Sara · preventivo Bianchi" },
            { name: "Andrea · fuori turno", idle: true },
          ]}
          collaboration={{
            title: "La squadra e l'ufficio, in tempo reale",
            description: "Ore, foto e rapportini arrivano dal telefono di chi è in cantiere e l'ufficio li vede subito, senza telefonate.",
          }}
          reports={{
            title: "Rapportini e SAL già impaginati",
            description: "Dai dati inseriti in cantiere escono rapportini, SAL e riepiloghi in PDF, pronti da firmare e mandare.",
          }}
          labels={{ report: "RAPPORTINO N.", forecast: "PREVISIONE", syncing: "sincronizzo", connected: "collegamenti attivi", pred: "prev.", period: "mese", formatValue: (v) => `margine ${v}%` }}
          reportStart={128}
          integrations={{
            title: "Collegato a quello che usi già",
            description: "Fatturazione elettronica, calendario, WhatsApp e posta: i dati passano da soli, senza ricopiarli a mano.",
            tools: [
              { name: "Fatture elettroniche", icon: FileText },
              { name: "Calendario", icon: CalendarDays },
              { name: "WhatsApp", icon: MessageCircle },
              { name: "Posta", icon: Mail },
            ],
          }}
          insights={{
            title: "Dove sta andando il margine",
            description: "Silvio, l'assistente AI, legge l'andamento delle commesse e ti mostra dove stai andando, prima che sia tardi. Cifre d'esempio: passa il dito sul grafico.",
            values: [12, 13, 12, 14, 13, 15, 15, 16, 15, 17, 18, 18],
            forecastFrom: 8,
          }}
          palette={{
            "--ib-page": "#f8fafc",
            "--ib-hatch": "rgba(15,23,42,.045)",
            "--ib-paper": "#ffffff",
            "--ib-card": "#f8fafc",
            "--ib-raise": "#ffffff",
            "--ib-ink": "#0f172a",
            "--ib-accent": "#F97415",
            "--ib-soft": "#334155",
            "--ib-muted": "#64748b",
            "--ib-faint": "#94a3b8",
            "--ib-line": "#e5e7eb",
            "--ib-line-strong": "#d1d5db",
            "--ib-bracket": "#fdba74",
            "--ib-inv": "#0f172a",
            "--ib-inv-ink": "#ffffff",
            "--ib-radius": "1.5rem",
            "--ib-card-radius": "1rem",
          }}
          style={{ padding: 0, background: "transparent" }}
        />
      </div>
    </section>
  );
}
