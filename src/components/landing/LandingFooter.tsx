import { Link } from "react-router-dom";
import logo from "@/assets/edilizia-in-cloud-logo.webp";

export default function LandingFooter() {
  return (
    <footer className="py-16 bg-white border-t border-gray-200">
      <div className="max-w-6xl mx-auto px-6">
        <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-10 mb-12" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))" }}>
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
              <li><Link to="/funzionalita/" className="hover:text-[#F97415] transition-colors">Funzionalità</Link></li>
              <li><Link to="/prezzi/" className="hover:text-[#F97415] transition-colors">Prezzi</Link></li>
              <li><Link to="/confronto/" className="hover:text-[#F97415] transition-colors">Confronto</Link></li>
              <li><Link to="/blog/" className="hover:text-[#F97415] transition-colors">Blog</Link></li>
              <li><Link to="/integrazioni/" className="hover:text-[#F97415] transition-colors">Integrazioni</Link></li>
              <li><Link to="/glossario-edilizia/" className="hover:text-[#F97415] transition-colors">Glossario Edilizia</Link></li>
              <li><Link to="/casi-studio/" className="hover:text-[#F97415] transition-colors">Casi Studio</Link></li>
              <li><Link to="/chi-siamo/" className="hover:text-[#F97415] transition-colors">Chi Siamo</Link></li>
              <li><Link to="/formazione/" className="hover:text-[#F97415] transition-colors">Formazione</Link></li>
              <li><Link to="/diventa-partner/" className="hover:text-[#F97415] transition-colors">Diventa Partner</Link></li>
              <li><Link to="/demo/" className="hover:text-[#F97415] transition-colors">Richiedi Demo</Link></li>
              <li><a href="/sitemap.xml" className="hover:text-[#F97415] transition-colors">Sitemap</a></li>
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
          <p className="text-[#111111]/65 text-sm">
            © 2026 Domus Group S.r.l. — Tutti i diritti riservati.
          </p>
          <div className="flex flex-wrap gap-x-5 gap-y-2 text-sm text-[#111111]/65 justify-center md:justify-end">
            <Link to="/privacy-policy/" className="hover:text-[#F97415] transition-colors">Privacy Policy</Link>
            <Link to="/termini-e-condizioni/" className="hover:text-[#F97415] transition-colors">Termini e Condizioni</Link>
            <Link to="/avviso-legale/" className="hover:text-[#F97415] transition-colors">Avviso Legale</Link>
            <Link to="/condizioni-utilizzo/" className="hover:text-[#F97415] transition-colors">Condizioni di Utilizzo</Link>
            <Link to="/cookie-policy/" className="hover:text-[#F97415] transition-colors">Cookie Policy</Link>
            <Link to="/dpa/" className="hover:text-[#F97415] transition-colors">DPA</Link>
          </div>
        </div>
      </div>
    </footer>
  );
}
