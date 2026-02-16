import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { Menu, X } from "lucide-react";
import logo from "@/assets/edilizia-in-cloud-logo.png";

const navLinks = [
  { label: "Funzionalità", href: "#moduli" },
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
        scrolled ? "bg-white/95 backdrop-blur-md shadow-sm" : "bg-transparent"
      }`}
    >
      <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
        <a href="#" onClick={(e) => { e.preventDefault(); window.scrollTo({ top: 0, behavior: "smooth" }); }}>
          <img src={logo} alt="Edilizia in Cloud" className={`h-9 transition-all duration-300 ${scrolled ? "" : "brightness-0 invert"}`} />
        </a>

        {/* Desktop */}
        <div className="hidden md:flex items-center gap-8">
          {navLinks.map((l) => (
            <a
              key={l.href}
              href={l.href}
              onClick={(e) => handleAnchor(e, l.href)}
              className={`text-sm font-medium transition-colors ${scrolled ? "text-[#1a2744]/70 hover:text-[#1a2744]" : "text-white/80 hover:text-white"}`}
            >
              {l.label}
            </a>
          ))}
          <Link to="/login" className={`text-sm font-medium transition-colors ${scrolled ? "text-[#1a2744]/60 hover:text-[#1a2744]" : "text-white/60 hover:text-white"}`}>
            Accedi
          </Link>
          <a
            href="#cta-finale"
            onClick={(e) => handleAnchor(e, "#cta-finale")}
            className="px-5 py-2.5 rounded-full bg-[#0fa68c] text-white text-sm font-bold hover:bg-[#0d9079] hover:scale-105 transition-all duration-200 shadow-lg shadow-[#0fa68c]/20"
          >
            Richiedi Demo
          </a>
        </div>

        {/* Mobile toggle */}
        <button className={`md:hidden ${scrolled ? "text-[#1a2744]" : "text-white"}`} onClick={() => setMobileOpen(!mobileOpen)}>
          {mobileOpen ? <X size={24} /> : <Menu size={24} />}
        </button>
      </div>

      {/* Mobile menu */}
      {mobileOpen && (
        <div className="md:hidden bg-white border-t border-gray-100 px-6 pb-6 pt-2 space-y-4 shadow-lg">
          {navLinks.map((l) => (
            <a
              key={l.href}
              href={l.href}
              onClick={(e) => handleAnchor(e, l.href)}
              className="block text-[#1a2744] hover:text-[#0fa68c] py-2 font-medium"
            >
              {l.label}
            </a>
          ))}
          <Link to="/login" className="block text-[#1a2744]/60 hover:text-[#1a2744] py-2" onClick={() => setMobileOpen(false)}>
            Accedi
          </Link>
          <a
            href="#cta-finale"
            onClick={(e) => handleAnchor(e, "#cta-finale")}
            className="block text-center px-5 py-3 rounded-full bg-[#0fa68c] text-white font-bold"
          >
            Richiedi Demo
          </a>
        </div>
      )}
    </nav>
  );
}
