import { Link } from "react-router-dom";
import logo from "@/assets/edilizia-in-cloud-logo-small.webp";

/**
 * v8.6.49 — Footer ristrutturato per SEO crawl budget:
 *
 * Prima i 52 link `/funzionalita/*` + 9 `/per/*` + 5 `/confronto/*` erano
 * ESCLUSIVAMENTE nel sitemap. Google li scopriva ma il PageRank interno
 * non vi fluiva → pagine "orfane" con autorità di pagina bassa.
 *
 * Ora il footer espone esplicitamente le funzionalità top + i verticali +
 * il confronto, distribuendo link interni e PageRank.
 *
 * NOTA: le 36 city landing /software-gestionale-edilizia-{città}/ NON sono
 * incluse per scelta esplicita (richiesta utente) — restano scopribili via
 * sitemap + da CityHub /software-gestionale-edilizia/.
 */
export default function LandingFooter() {
  return (
    <footer className="py-16 bg-white border-t border-gray-200">
      <div className="max-w-7xl mx-auto px-6">
        {/* Mega-section: Funzionalità + Verticali + Risorse */}
        <div className="grid gap-10 mb-10 md:grid-cols-2 lg:grid-cols-4">
          {/* Brand + tagline */}
          <div className="lg:col-span-1">
            <img loading="lazy" src={logo} alt="Edilizia in Cloud" width={128} height={32} className="h-8 w-auto mb-4" />
            <p className="text-[#111111]/60 text-sm leading-relaxed mb-4">
              Il primo software gestionale pensato da imprenditori edili, per imprenditori edili.
            </p>
            <ul className="space-y-2 text-sm text-[#111111]/60">
              <li><a href="tel:+390287198520" className="hover:text-[#F97415] transition-colors">+39 02 87198520</a></li>
              <li><a href="mailto:info@ediliziaincloud.com" className="hover:text-[#F97415] transition-colors">info@ediliziaincloud.com</a></li>
            </ul>
          </div>

          {/* Funzionalità — operative (8 top) */}
          <div>
            <h4 className="text-[#111111] font-semibold mb-4 text-sm uppercase tracking-wider">Funzionalità</h4>
            <ul className="space-y-2 text-sm text-[#111111]/60">
              <li><Link to="/funzionalita/gestione-cantieri/" className="hover:text-[#F97415] transition-colors">Gestione cantieri</Link></li>
              <li><Link to="/funzionalita/preventivi-edilizia/" className="hover:text-[#F97415] transition-colors">Preventivi edilizia</Link></li>
              <li><Link to="/funzionalita/fatturazione-elettronica/" className="hover:text-[#F97415] transition-colors">Fatturazione elettronica</Link></li>
              <li><Link to="/funzionalita/margini-cantiere/" className="hover:text-[#F97415] transition-colors">Margini cantiere</Link></li>
              <li><Link to="/funzionalita/magazzino-cantiere/" className="hover:text-[#F97415] transition-colors">Magazzino cantiere</Link></li>
              <li><Link to="/funzionalita/ddt-digitali/" className="hover:text-[#F97415] transition-colors">DDT digitali</Link></li>
              <li><Link to="/funzionalita/giornale-lavori/" className="hover:text-[#F97415] transition-colors">Giornale lavori</Link></li>
              <li><Link to="/funzionalita/contabilita-fiscale/" className="hover:text-[#F97415] transition-colors">Contabilità fiscale</Link></li>
              <li>
                <Link to="/funzionalita/" className="font-medium text-[#F97415] hover:underline transition-colors">
                  Tutte le funzionalità →
                </Link>
              </li>
            </ul>
          </div>

          {/* Funzionalità — vendita & comunicazione (8 top) */}
          <div>
            <h4 className="text-[#111111] font-semibold mb-4 text-sm uppercase tracking-wider">Vendita & AI</h4>
            <ul className="space-y-2 text-sm text-[#111111]/60">
              <li><Link to="/funzionalita/crm-edilizia/" className="hover:text-[#F97415] transition-colors">CRM edilizia</Link></li>
              <li><Link to="/funzionalita/pipeline-vendite/" className="hover:text-[#F97415] transition-colors">Pipeline vendite</Link></li>
              <li><Link to="/funzionalita/whatsapp-marketing/" className="hover:text-[#F97415] transition-colors">WhatsApp marketing</Link></li>
              <li><Link to="/funzionalita/email-marketing/" className="hover:text-[#F97415] transition-colors">Email marketing</Link></li>
              <li><Link to="/funzionalita/automazioni/" className="hover:text-[#F97415] transition-colors">Automazioni</Link></li>
              <li><Link to="/funzionalita/agenti-ai/" className="hover:text-[#F97415] transition-colors">Agenti AI</Link></li>
              <li><Link to="/funzionalita/render-infissi/" className="hover:text-[#F97415] transition-colors">Render AI infissi</Link></li>
              <li><Link to="/funzionalita/firma-elettronica/" className="hover:text-[#F97415] transition-colors">Firma elettronica</Link></li>
            </ul>
          </div>

          {/* Per chi + Confronto + Azienda */}
          <div>
            <h4 className="text-[#111111] font-semibold mb-4 text-sm uppercase tracking-wider">Per chi</h4>
            <ul className="space-y-2 text-sm text-[#111111]/60 mb-6">
              <li><Link to="/per/serramentisti/" className="hover:text-[#F97415] transition-colors">Serramentisti</Link></li>
              <li><Link to="/per/impiantisti/" className="hover:text-[#F97415] transition-colors">Impiantisti</Link></li>
              <li><Link to="/per/ristrutturatori/" className="hover:text-[#F97415] transition-colors">Ristrutturatori</Link></li>
              <li><Link to="/per/imprese-edili/" className="hover:text-[#F97415] transition-colors">Imprese edili</Link></li>
              <li><Link to="/per/fotovoltaico/" className="hover:text-[#F97415] transition-colors">Fotovoltaico</Link></li>
            </ul>
            <h4 className="text-[#111111] font-semibold mb-4 text-sm uppercase tracking-wider">Confronto</h4>
            <ul className="space-y-2 text-sm text-[#111111]/60">
              <li><Link to="/confronto/vs-primus/" className="hover:text-[#F97415] transition-colors">vs PriMus</Link></li>
              <li><Link to="/confronto/vs-teamsystem/" className="hover:text-[#F97415] transition-colors">vs TeamSystem</Link></li>
              <li><Link to="/confronto/vs-edilnet/" className="hover:text-[#F97415] transition-colors">vs Edilnet</Link></li>
              <li><Link to="/confronto/vs-excel/" className="hover:text-[#F97415] transition-colors">vs Excel</Link></li>
              <li><Link to="/confronto/" className="font-medium text-[#F97415] hover:underline transition-colors">Tutti i confronti →</Link></li>
            </ul>
          </div>
        </div>

        {/* Seconda riga: link utili + dati societari */}
        <div className="grid gap-10 mb-10 md:grid-cols-2 lg:grid-cols-4 pt-8 border-t border-gray-200">
          <div>
            <h4 className="text-[#111111] font-semibold mb-4 text-sm uppercase tracking-wider">Risorse</h4>
            <ul className="space-y-2 text-sm text-[#111111]/60">
              <li><Link to="/blog/" className="hover:text-[#F97415] transition-colors">Blog</Link></li>
              {/* I calcolatori vivono nel footer e non solo nel menu: il dropdown
                  della navbar si monta solo all'apertura, quindi nell'HTML statico
                  che leggono i crawler quei link non esistono. Qui invece sì. */}
              <li><Link to="/strumenti/" className="hover:text-[#F97415] transition-colors">Calcolatori gratuiti</Link></li>
              <li><Link to="/strumenti/calcolo-congruita-manodopera/" className="hover:text-[#F97415] transition-colors">Calcolo congruità manodopera</Link></li>
              <li><Link to="/strumenti/calcolo-costo-orario-operaio/" className="hover:text-[#F97415] transition-colors">Calcolo costo orario operaio</Link></li>
              <li><Link to="/novita/" className="hover:text-[#F97415] transition-colors">Novità del prodotto</Link></li>
              <li><Link to="/glossario-edilizia/" className="hover:text-[#F97415] transition-colors">Glossario edilizia</Link></li>
              <li><Link to="/casi-studio/" className="hover:text-[#F97415] transition-colors">Casi studio</Link></li>
              <li><Link to="/formazione/" className="hover:text-[#F97415] transition-colors">Formazione</Link></li>
              <li><Link to="/pianifica-migrazione/" className="hover:text-[#F97415] transition-colors">Pianifica migrazione</Link></li>
              <li><Link to="/integrazioni/" className="hover:text-[#F97415] transition-colors">Integrazioni</Link></li>
            </ul>
          </div>

          <div>
            <h4 className="text-[#111111] font-semibold mb-4 text-sm uppercase tracking-wider">Azienda</h4>
            <ul className="space-y-2 text-sm text-[#111111]/60">
              <li><Link to="/chi-siamo/" className="hover:text-[#F97415] transition-colors">Chi siamo</Link></li>
              <li><Link to="/prezzi/" className="hover:text-[#F97415] transition-colors">Piani</Link></li>
              <li><Link to="/demo/" className="hover:text-[#F97415] transition-colors">Richiedi demo</Link></li>
              <li><Link to="/diventa-partner/" className="hover:text-[#F97415] transition-colors">Diventa partner</Link></li>
              <li><a href="/sitemap.xml" className="hover:text-[#F97415] transition-colors">Sitemap</a></li>
            </ul>
          </div>

          <div>
            <h4 className="text-[#111111] font-semibold mb-4 text-sm uppercase tracking-wider">Contatti</h4>
            <ul className="space-y-2 text-sm text-[#111111]/60">
              <li><a href="tel:+390287198520" className="hover:text-[#F97415] transition-colors">+39 02 87198520</a></li>
              <li><a href="mailto:info@ediliziaincloud.com" className="hover:text-[#F97415] transition-colors break-all">info@ediliziaincloud.com</a></li>
              <li className="break-all text-xs">PEC: domusgroupsrl@legalmail.it</li>
            </ul>
          </div>

          <div>
            <h4 className="text-[#111111] font-semibold mb-4 text-sm uppercase tracking-wider">Dati societari</h4>
            <ul className="space-y-2 text-sm text-[#111111]/60">
              <li className="font-medium text-[#111111]/80">Domus Group S.r.l.</li>
              <li>Via Aurelio Saffi 29 — 20123 Milano</li>
              <li>P.IVA: 13132010961</li>
              <li>Capitale sociale: 20.000,00€</li>
              <li>SDI: USAL8PV</li>
            </ul>
          </div>
        </div>

        {/* Bottom bar */}
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
