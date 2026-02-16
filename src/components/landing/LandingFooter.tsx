import logo from "@/assets/edilizia-in-cloud-logo.png";

export default function LandingFooter() {
  return (
    <footer className="py-16 bg-[#0f1d35] border-t border-white/[0.06]">
      <div className="max-w-6xl mx-auto px-6">
        <div className="grid md:grid-cols-3 gap-10 mb-12">
          <div>
            <img src={logo} alt="Edilizia in Cloud" className="h-8 mb-4 opacity-80" />
            <p className="text-white/40 text-sm leading-relaxed">
              Il primo software gestionale pensato da imprenditori edili, per imprenditori edili.
            </p>
          </div>
          <div>
            <h4 className="text-white font-semibold mb-4 text-sm uppercase tracking-wider">Link Utili</h4>
            <ul className="space-y-2 text-sm text-white/40">
              <li><a href="#moduli" onClick={(e) => { e.preventDefault(); document.querySelector("#moduli")?.scrollIntoView({ behavior: "smooth" }); }} className="hover:text-[#0fa68c] transition-colors">Funzionalità</a></li>
              <li><a href="#prezzi" onClick={(e) => { e.preventDefault(); document.querySelector("#prezzi")?.scrollIntoView({ behavior: "smooth" }); }} className="hover:text-[#0fa68c] transition-colors">Prezzi</a></li>
              <li><a href="#confronto" onClick={(e) => { e.preventDefault(); document.querySelector("#confronto")?.scrollIntoView({ behavior: "smooth" }); }} className="hover:text-[#0fa68c] transition-colors">Confronto</a></li>
              <li><a href="#cta-finale" onClick={(e) => { e.preventDefault(); document.querySelector("#cta-finale")?.scrollIntoView({ behavior: "smooth" }); }} className="hover:text-[#0fa68c] transition-colors">Richiedi Demo</a></li>
            </ul>
          </div>
          <div>
            <h4 className="text-white font-semibold mb-4 text-sm uppercase tracking-wider">Contatti</h4>
            <ul className="space-y-2 text-sm text-white/40">
              <li>info@ediliziaincloud.com</li>
              <li>+39 02 1234567</li>
            </ul>
            <div className="flex gap-4 mt-4">
              <a href="#" className="w-9 h-9 rounded-full bg-white/[0.06] flex items-center justify-center text-white/40 hover:bg-[#0fa68c]/20 hover:text-[#0fa68c] transition-all">
                <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24"><path d="M24 4.557c-.883.392-1.832.656-2.828.775 1.017-.609 1.798-1.574 2.165-2.724-.951.564-2.005.974-3.127 1.195-.897-.957-2.178-1.555-3.594-1.555-3.179 0-5.515 2.966-4.797 6.045-4.091-.205-7.719-2.165-10.148-5.144-1.29 2.213-.669 5.108 1.523 6.574-.806-.026-1.566-.247-2.229-.616-.054 2.281 1.581 4.415 3.949 4.89-.693.188-1.452.232-2.224.084.626 1.956 2.444 3.379 4.6 3.419-2.07 1.623-4.678 2.348-7.29 2.04 2.179 1.397 4.768 2.212 7.548 2.212 9.142 0 14.307-7.721 13.995-14.646.962-.695 1.797-1.562 2.457-2.549z"/></svg>
              </a>
              <a href="#" className="w-9 h-9 rounded-full bg-white/[0.06] flex items-center justify-center text-white/40 hover:bg-[#0fa68c]/20 hover:text-[#0fa68c] transition-all">
                <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24"><path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433c-1.144 0-2.063-.926-2.063-2.065 0-1.138.92-2.063 2.063-2.063 1.14 0 2.064.925 2.064 2.063 0 1.139-.925 2.065-2.064 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"/></svg>
              </a>
              <a href="#" className="w-9 h-9 rounded-full bg-white/[0.06] flex items-center justify-center text-white/40 hover:bg-[#0fa68c]/20 hover:text-[#0fa68c] transition-all">
                <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24"><path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zM12 0C8.741 0 8.333.014 7.053.072 2.695.272.273 2.69.073 7.052.014 8.333 0 8.741 0 12c0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98C8.333 23.986 8.741 24 12 24c3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98C15.668.014 15.259 0 12 0zm0 5.838a6.162 6.162 0 100 12.324 6.162 6.162 0 000-12.324zM12 16a4 4 0 110-8 4 4 0 010 8zm6.406-11.845a1.44 1.44 0 100 2.881 1.44 1.44 0 000-2.881z"/></svg>
              </a>
            </div>
          </div>
        </div>
        <div className="border-t border-white/[0.06] pt-8 flex flex-col md:flex-row items-center justify-between gap-4">
          <p className="text-white/30 text-sm">
            © {new Date().getFullYear()} Edilizia in Cloud. Tutti i diritti riservati.
          </p>
          <div className="flex gap-6 text-sm text-white/30">
            <a href="#" className="hover:text-[#0fa68c] transition-colors">Privacy Policy</a>
            <a href="#" className="hover:text-[#0fa68c] transition-colors">Termini di Servizio</a>
            <a href="#" className="hover:text-[#0fa68c] transition-colors">Cookie Policy</a>
          </div>
        </div>
      </div>
    </footer>
  );
}
