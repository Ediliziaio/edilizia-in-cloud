import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { Menu, X } from "lucide-react";
import logo from "@/assets/edilizia-in-cloud-logo.png";

const navLinks = [
  { label: "Funzionalità", href: "#moduli" },
  { label: "Vantaggi", href: "#vantaggi" },
  { label: "Confronto", href: "#confronto" },
  { label: "Prezzi", href: "#prezzi" },
];

export default function LandingNavbar() {
  const [scrolled, setScrolled] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 40);
    window.addEventListener("scroll", onScroll);
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const handleAnchor = (e: React.MouseEvent<HTMLAnchorElement>, href: string) => {
    e.preventDefault();
    setMobileOpen(false);
    const el = document.querySelector(href);
    el?.scrollIntoView({ behavior: "smooth" });
  };

  return (
    <nav
      className={`fixed top-0 left-0 right-0 z-50 transition-all duration-300 ${
        scrolled ? "bg-[#0a0a0a]/95 backdrop-blur-md shadow-lg" : "bg-transparent"
      }`}
    >
      <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
        <a href="#" onClick={(e) => { e.preventDefault(); window.scrollTo({ top: 0, behavior: "smooth" }); }}>
          <img src={logo} alt="Edilizia in Cloud" className="h-9" />
        </a>

        {/* Desktop */}
        <div className="hidden md:flex items-center gap-8">
          {navLinks.map((l) => (
            <a
              key={l.href}
              href={l.href}
              onClick={(e) => handleAnchor(e, l.href)}
              className="text-sm text-gray-300 hover:text-white transition-colors"
            >
              {l.label}
            </a>
          ))}
          <Link to="/login" className="text-sm text-gray-400 hover:text-white transition-colors">
            Accedi
          </Link>
          <a
            href="#cta-finale"
            onClick={(e) => handleAnchor(e, "#cta-finale")}
            className="px-5 py-2.5 rounded-lg bg-[#c8ee44] text-[#0a0a0a] text-sm font-bold hover:bg-[#d4f55a] hover:scale-105 transition-all duration-200 shadow-[0_0_20px_rgba(200,238,68,0.3)]"
          >
            Richiedi Demo
          </a>
        </div>

        {/* Mobile toggle */}
        <button className="md:hidden text-white" onClick={() => setMobileOpen(!mobileOpen)}>
          {mobileOpen ? <X size={24} /> : <Menu size={24} />}
        </button>
      </div>

      {/* Mobile menu */}
      {mobileOpen && (
        <div className="md:hidden bg-[#0a0a0a]/98 backdrop-blur-md border-t border-white/10 px-6 pb-6 pt-2 space-y-4">
          {navLinks.map((l) => (
            <a
              key={l.href}
              href={l.href}
              onClick={(e) => handleAnchor(e, l.href)}
              className="block text-gray-300 hover:text-white py-2"
            >
              {l.label}
            </a>
          ))}
          <Link to="/login" className="block text-gray-400 hover:text-white py-2" onClick={() => setMobileOpen(false)}>
            Accedi
          </Link>
          <a
            href="#cta-finale"
            onClick={(e) => handleAnchor(e, "#cta-finale")}
            className="block text-center px-5 py-3 rounded-lg bg-[#c8ee44] text-[#0a0a0a] font-bold"
          >
            Richiedi Demo
          </a>
        </div>
      )}
    </nav>
  );
}
