import { Link } from "react-router-dom";
import logo from "@/assets/edilizia-in-cloud-logo.png";

export default function LandingFooter() {
  return (
    <footer className="py-16 bg-white border-t border-gray-200">
      <div className="max-w-6xl mx-auto px-6">
        <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-10 mb-12">
          {/* Brand */}
          <div>
            <img src={logo} alt="Edilizia in Cloud" className="h-8 mb-4" />
            <p className="text-[#111111]/60 text-sm leading-relaxed">
              Il primo software gestionale pensato da imprenditori edili, per imprenditori edili.
            </p>
          </div>

          {/* Link Utili */}
          <div>
            <h4 className="text-[#111111] font-semibold mb-4 text-sm uppercase tracking-wider">Link Utili</h4>
            <ul className="space-y-2 text-sm text-[#111111]/60">
              <li><a href="#moduli" onClick={(e) => { e.preventDefault(); document.querySelector("#moduli")?.scrollIntoView({ behavior: "smooth" }); }} className="hover:text-[#F97415] transition-colors">Funzionalità</a></li>
              <li><a href="#prezzi" onClick={(e) => { e.preventDefault(); document.querySelector("#prezzi")?.scrollIntoView({ behavior: "smooth" }); }} className="hover:text-[#F97415] transition-colors">Prezzi</a></li>
              <li><a href="#confronto" onClick={(e) => { e.preventDefault(); document.querySelector("#confronto")?.scrollIntoView({ behavior: "smooth" }); }} className="hover:text-[#F97415] transition-colors">Confronto</a></li>
              <li><Link to="/blog" className="hover:text-[#F97415] transition-colors">Blog</Link></li>
              <li><a href="#cta-finale" onClick={(e) => { e.preventDefault(); document.querySelector("#cta-finale")?.scrollIntoView({ behavior: "smooth" }); }} className="hover:text-[#F97415] transition-colors">Richiedi Demo</a></li>
              <li><a href="/sitemap.xml" className="hover:text-[#F97415] transition-colors">Sitemap</a></li>
            </ul>
          </div>

          {/* Contatti */}
          <div>
            <h4 className="text-[#111111] font-semibold mb-4 text-sm uppercase tracking-wider">Contatti</h4>
            <ul className="space-y-2 text-sm text-[#111111]/60">
              <li>info@ediliziaincloud.com</li>
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
            © 2025 Domus Group S.r.l. — Tutti i diritti riservati.
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
