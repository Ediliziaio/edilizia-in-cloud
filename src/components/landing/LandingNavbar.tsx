import { useState, useEffect } from "react";
import { Link, useLocation } from "react-router-dom";
import { Menu, X } from "lucide-react";
import logo from "@/assets/edilizia-in-cloud-logo.png";

interface NavItem {
  label: string;
  type: "link" | "anchor";
  to?: string;
  href?: string;
}

const navItems: NavItem[] = [
  { label: "Funzionalita", type: "link", to: "/funzionalita" },
  { label: "Chi Siamo", type: "link", to: "/chi-siamo" },
  { label: "Blog", type: "link", to: "/blog" },
  { label: "Confronto", type: "link", to: "/confronto" },
  { label: "Prezzi", type: "link", to: "/prezzi" },
];

export default function LandingNavbar() {
  const [scrolled, setScrolled] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const location = useLocation();
  const isHome = location.pathname === "/home" || location.pathname === "/";

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 40);
    window.addEventListener("scroll", onScroll);
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  // On non-home pages always show white bg
  const isWhiteBg = scrolled || !isHome;

  const handleAnchor = (e: React.MouseEvent<HTMLAnchorElement>, href: string) => {
    e.preventDefault();
    setMobileOpen(false);
    if (!isHome) {
      // Navigate to home with hash if not already there
      window.location.href = `/home${href}`;
      return;
    }
    const el = document.querySelector(href);
    el?.scrollIntoView({ behavior: "smooth" });
  };

  const desktopLinkClass = `text-sm font-medium transition-colors ${
    isWhiteBg ? "text-[#111111]/70 hover:text-[#111111]" : "text-white/80 hover:text-white"
  }`;

  return (
    <nav
      className={`fixed top-9 left-0 right-0 z-50 transition-all duration-300 ${
        isWhiteBg ? "bg-white/95 backdrop-blur-md shadow-sm" : "bg-transparent"
      }`}
    >
      <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
        {/* Logo */}
        {isHome ? (
          <a
            href="#"
            onClick={(e) => {
              e.preventDefault();
              window.scrollTo({ top: 0, behavior: "smooth" });
            }}
          >
            <img
              src={logo}
              alt="Edilizia in Cloud"
              className={`h-9 transition-all duration-300 ${isWhiteBg ? "" : "brightness-0 invert"}`}
            />
          </a>
        ) : (
          <Link to="/home">
            <img src={logo} alt="Edilizia in Cloud" className="h-9" />
          </Link>
        )}

        {/* Desktop nav */}
        <div className="hidden md:flex items-center gap-8">
          {navItems.map((item) => {
            if (item.type === "link" && item.to) {
              return (
                <Link
                  key={item.label}
                  to={item.to}
                  className={desktopLinkClass}
                  style={
                    location.pathname === item.to
                      ? { color: "#F97415", opacity: 1 }
                      : undefined
                  }
                >
                  {item.label}
                </Link>
              );
            }
            return (
              <a
                key={item.label}
                href={item.href}
                onClick={(e) => handleAnchor(e, item.href!)}
                className={desktopLinkClass}
              >
                {item.label}
              </a>
            );
          })}

          <Link
            to="/login"
            className={`text-sm font-medium transition-colors ${
              isWhiteBg
                ? "text-[#111111]/60 hover:text-[#111111]"
                : "text-white/60 hover:text-white"
            }`}
          >
            Accedi
          </Link>

          <Link
            to="/demo"
            className="px-5 py-2.5 rounded-full bg-[#F97415] text-white text-sm font-bold hover:bg-[#e8650e] hover:scale-105 transition-all duration-200 shadow-lg shadow-[#F97415]/20"
          >
            Richiedi Demo
          </Link>
        </div>

        {/* Mobile toggle */}
        <button
          className={`md:hidden ${isWhiteBg ? "text-[#111111]" : "text-white"}`}
          onClick={() => setMobileOpen(!mobileOpen)}
        >
          {mobileOpen ? <X size={24} /> : <Menu size={24} />}
        </button>
      </div>

      {/* Mobile menu */}
      {mobileOpen && (
        <div className="md:hidden bg-white border-t border-gray-100 px-6 pb-6 pt-2 space-y-4 shadow-lg">
          {navItems.map((item) => {
            if (item.type === "link" && item.to) {
              return (
                <Link
                  key={item.label}
                  to={item.to}
                  onClick={() => setMobileOpen(false)}
                  className="block py-2 font-medium"
                  style={
                    location.pathname === item.to
                      ? { color: "#F97415" }
                      : { color: "#111111" }
                  }
                >
                  {item.label}
                </Link>
              );
            }
            return (
              <a
                key={item.label}
                href={item.href}
                onClick={(e) => handleAnchor(e, item.href!)}
                className="block text-[#111111] hover:text-[#F97415] py-2 font-medium"
              >
                {item.label}
              </a>
            );
          })}
          <Link
            to="/login"
            className="block text-[#111111]/60 hover:text-[#111111] py-2"
            onClick={() => setMobileOpen(false)}
          >
            Accedi
          </Link>
          <Link
            to="/demo"
            onClick={() => setMobileOpen(false)}
            className="block text-center px-5 py-3 rounded-full bg-[#F97415] text-white font-bold"
          >
            Richiedi Demo
          </Link>
        </div>
      )}
    </nav>
  );
}
