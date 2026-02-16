import logo from "@/assets/edilizia-in-cloud-logo.png";

export default function LandingFooter() {
  return (
    <footer className="py-12 bg-[#050505] border-t border-white/[0.06]">
      <div className="max-w-6xl mx-auto px-6">
        <div className="flex flex-col md:flex-row items-center justify-between gap-6">
          <img src={logo} alt="Edilizia in Cloud" className="h-8 opacity-70" />
          <p className="text-gray-600 text-sm">
            © {new Date().getFullYear()} Edilizia in Cloud. Tutti i diritti riservati.
          </p>
          <div className="flex gap-6 text-sm text-gray-500">
            <a href="#" className="hover:text-gray-300 transition-colors">Privacy</a>
            <a href="#" className="hover:text-gray-300 transition-colors">Termini</a>
            <a href="#" className="hover:text-gray-300 transition-colors">Contatti</a>
          </div>
        </div>
      </div>
    </footer>
  );
}
