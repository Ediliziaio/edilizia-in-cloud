import { Link } from "react-router-dom";
import logo from "@/assets/edilizia-in-cloud-logo.webp";

export default function LandingFooter() {
  return (
    <footer className="py-16 bg-white border-t border-gray-200">
      <div className="max-w-6xl mx-auto px-6">
        <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-10 mb-12">
          {/* Brand */}
          <div>
            <img src={logo} alt="Edilizia in Cloud" width={128} height={32} className="h-8 w-auto mb-4" />
            <p className="text-[#111111]/60 text-sm leading-relaxed">
              Il primo software gestionale pensato da imprenditori edili, per imprenditori edili.
            </p>
          </div>

          {/* Link Utili */}
          <div>
            <h4 className="text-[#111111] font-semibold mb-4 text-sm uppercase tracking-wider">Link Utili</h4>
            <ul className="space-y-2 text-sm text-[#111111]/60">
              <li><Link to="/funzionalita" className="hover:text-[#F97415] transition-colors">Funzionalità</Link></li>
              <li><Link to="/prezzi" className="hover:text-[#F97415] transition-colors">Prezzi</Link></li>
              <li><Link to="/confronto" className="hover:text-[#F97415] transition-colors">Confronto</Link></li>
              <li><Link to="/blog" className="hover:text-[#F97415] transition-colors">Blog</Link></li>
              <li><Link to="/integrazioni" className="hover:text-[#F97415] transition-colors">Integrazioni</Link></li>
              <li><Link to="/glossario-edilizia" className="hover:text-[#F97415] transition-colors">Glossario Edilizia</Link></li>
              <li><Link to="/casi-studio" className="hover:text-[#F97415] transition-colors">Casi Studio</Link></li>
              <li><Link to="/chi-siamo" className="hover:text-[#F97415] transition-colors">Chi Siamo</Link></li>
              <li><Link to="/formazione" className="hover:text-[#F97415] transition-colors">Formazione</Link></li>
              <li><Link to="/diventa-partner" className="hover:text-[#F97415] transition-colors">Diventa Partner</Link></li>
              <li><Link to="/demo" className="hover:text-[#F97415] transition-colors">Richiedi Demo</Link></li>
              <li><a href="/sitemap.xml" className="hover:text-[#F97415] transition-colors">Sitemap</a></li>
            </ul>
          </div>

          {/* Città */}
          <div>
            <h4 className="text-[#111111] font-semibold mb-4 text-sm uppercase tracking-wider">Per Città</h4>
            <ul className="space-y-2 text-sm text-[#111111]/60">
              <li><Link to="/software-gestionale-edilizia" className="hover:text-[#F97415] transition-colors font-semibold text-[#111111]/80">Tutte le Città →</Link></li>
              <li><Link to="/software-gestionale-edilizia-milano" className="hover:text-[#F97415] transition-colors">Milano</Link></li>
              <li><Link to="/software-gestionale-edilizia-roma" className="hover:text-[#F97415] transition-colors">Roma</Link></li>
              <li><Link to="/software-gestionale-edilizia-torino" className="hover:text-[#F97415] transition-colors">Torino</Link></li>
              <li><Link to="/software-gestionale-edilizia-napoli" className="hover:text-[#F97415] transition-colors">Napoli</Link></li>
              <li><Link to="/software-gestionale-edilizia-bologna" className="hover:text-[#F97415] transition-colors">Bologna</Link></li>
              <li><Link to="/software-gestionale-edilizia-firenze" className="hover:text-[#F97415] transition-colors">Firenze</Link></li>
              <li><Link to="/software-gestionale-edilizia-genova" className="hover:text-[#F97415] transition-colors">Genova</Link></li>
              <li><Link to="/software-gestionale-edilizia-palermo" className="hover:text-[#F97415] transition-colors">Palermo</Link></li>
              <li><Link to="/software-gestionale-edilizia-bari" className="hover:text-[#F97415] transition-colors">Bari</Link></li>
              <li><Link to="/software-gestionale-edilizia-verona" className="hover:text-[#F97415] transition-colors">Verona</Link></li>
              <li><Link to="/software-gestionale-edilizia-brescia" className="hover:text-[#F97415] transition-colors">Brescia</Link></li>
              <li><Link to="/software-gestionale-edilizia-catania" className="hover:text-[#F97415] transition-colors">Catania</Link></li>
              <li><Link to="/software-gestionale-edilizia-venezia" className="hover:text-[#F97415] transition-colors">Venezia</Link></li>
              <li><Link to="/software-gestionale-edilizia-padova" className="hover:text-[#F97415] transition-colors">Padova</Link></li>
              <li><Link to="/software-gestionale-edilizia-bergamo" className="hover:text-[#F97415] transition-colors">Bergamo</Link></li>
              <li><Link to="/software-gestionale-edilizia-modena" className="hover:text-[#F97415] transition-colors">Modena</Link></li>
              <li><Link to="/software-gestionale-edilizia-parma" className="hover:text-[#F97415] transition-colors">Parma</Link></li>
              <li><Link to="/software-gestionale-edilizia-salerno" className="hover:text-[#F97415] transition-colors">Salerno</Link></li>
              <li><Link to="/software-gestionale-edilizia-trieste" className="hover:text-[#F97415] transition-colors">Trieste</Link></li>
              <li><Link to="/software-gestionale-edilizia-cagliari" className="hover:text-[#F97415] transition-colors">Cagliari</Link></li>
              <li><Link to="/software-gestionale-edilizia-perugia" className="hover:text-[#F97415] transition-colors">Perugia</Link></li>
              <li><Link to="/software-gestionale-edilizia-ancona" className="hover:text-[#F97415] transition-colors">Ancona</Link></li>
              <li><Link to="/software-gestionale-edilizia-reggio-emilia" className="hover:text-[#F97415] transition-colors">Reggio Emilia</Link></li>
              <li><Link to="/software-gestionale-edilizia-udine" className="hover:text-[#F97415] transition-colors">Udine</Link></li>
              <li><Link to="/software-gestionale-edilizia-messina" className="hover:text-[#F97415] transition-colors">Messina</Link></li>
              <li><Link to="/software-gestionale-edilizia-livorno" className="hover:text-[#F97415] transition-colors">Livorno</Link></li>
              <li><Link to="/software-gestionale-edilizia-prato" className="hover:text-[#F97415] transition-colors">Prato</Link></li>
              <li><Link to="/software-gestionale-edilizia-vicenza" className="hover:text-[#F97415] transition-colors">Vicenza</Link></li>
              <li><Link to="/software-gestionale-edilizia-reggio-calabria" className="hover:text-[#F97415] transition-colors">Reggio Calabria</Link></li>
              <li><Link to="/software-gestionale-edilizia-foggia" className="hover:text-[#F97415] transition-colors">Foggia</Link></li>
              <li><Link to="/software-gestionale-edilizia-pescara" className="hover:text-[#F97415] transition-colors">Pescara</Link></li>
              <li><Link to="/software-gestionale-edilizia-taranto" className="hover:text-[#F97415] transition-colors">Taranto</Link></li>
              <li><Link to="/software-gestionale-edilizia-cosenza" className="hover:text-[#F97415] transition-colors">Cosenza</Link></li>
              <li><Link to="/software-gestionale-edilizia-trento" className="hover:text-[#F97415] transition-colors">Trento</Link></li>
              <li><Link to="/software-gestionale-edilizia-bolzano" className="hover:text-[#F97415] transition-colors">Bolzano</Link></li>
              <li><Link to="/software-gestionale-edilizia-ferrara" className="hover:text-[#F97415] transition-colors">Ferrara</Link></li>
            </ul>
          </div>

          {/* Contatti */}
          <div>
            <h4 className="text-[#111111] font-semibold mb-4 text-sm uppercase tracking-wider">Contatti</h4>
            <ul className="space-y-2 text-sm text-[#111111]/60">
              <li><a href="tel:+390287198520" className="hover:text-[#F97415] transition-colors">+39 02 87198520</a></li>
              <li><a href="mailto:info@ediliziaincloud.com" className="hover:text-[#F97415] transition-colors">info@ediliziaincloud.com</a></li>
              <li className="break-all">PEC: domusgroupsrl@legalmail.it</li>
            </ul>
          </div>

          {/* Dati Societari */}
          <div>
            <h4 className="text-[#111111] font-semibold mb-4 text-sm uppercase tracking-wider">Dati Societari</h4>
            <ul className="space-y-2 text-sm text-[#111111]/60">
              <li className="font-medium text-[#111111]/80">Domus Group S.r.l.</li>
              <li>Sede Legale: Via Aurelio Saffi 29, CAP 20123</li>
              <li>P.IVA: 13132010961</li>
              <li>Capitale Sociale: 20.000,00€</li>
              <li>SDI: USAL8PV</li>
            </ul>
          </div>
        </div>

        <div className="border-t border-gray-200 pt-8 flex flex-col md:flex-row items-center justify-between gap-4">
          <p className="text-[#111111]/40 text-sm">
            © 2026 Domus Group S.r.l. — Tutti i diritti riservati.
          </p>
          <div className="flex gap-6 text-sm text-[#111111]/40">
            <Link to="/privacy" className="hover:text-[#F97415] transition-colors">Privacy Policy</Link>
            <Link to="/termini" className="hover:text-[#F97415] transition-colors">Termini di Servizio</Link>
            <Link to="/cookie" className="hover:text-[#F97415] transition-colors">Cookie Policy</Link>
          </div>
        </div>
      </div>
    </footer>
  );
}
