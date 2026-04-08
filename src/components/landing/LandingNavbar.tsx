import { useState, useEffect, useRef } from "react";
import { Link, useLocation } from "react-router-dom";
import { Menu, X, ChevronDown } from "lucide-react";
import logo from "@/assets/edilizia-in-cloud-logo.webp";

const dedicatoItems = [
  { label: "Imprese Costruzione", to: "/per/imprese-costruzione" },
  { label: "Impiantisti", to: "/per/impiantisti" },
  { label: "Ristrutturatori", to: "/per/ristrutturatori" },
  { label: "Fotovoltaico", to: "/per/fotovoltaico" },
  { label: "Serramentisti", to: "/per/serramentisti" },
  { label: "Piccole Imprese", to: "/per/piccole-imprese" },
];

interface NavItem {
  label: string;
  type: "link" | "anchor";
  to?: string;
  href?: string;
}

const navItems: NavItem[] = [
  { label: "Funzionalita", type: "link", to: "/funzionalita" },
  { label: "Chi Siamo", type: "link", to: "/chi-siamo" },
  { label: "Confronto", type: "link", to: "/confronto" },
  { label: "Prezzi", type: "link", to: "/prezzi" },
];

export default function LandingNavbar() {
  const [scrolled, setScrolled] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [dedicatoOpen, setDedicatoOpen] = useState(false);
  const [mobileDedicatoOpen, setMobileDedicatoOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const location = useLocation();
  const isHome = location.pathname === "/home" || location.pathname === "/";

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 40);
    window.addEventListener("scroll", onScroll);
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setDedicatoOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // On non-home pages always show white bg
  const isWhiteBg = scrolled || !isHome;

  const handleAnchor = (e: React.MouseEvent<HTMLAnchorElement>, href: string) => {
    e.preventDefault();
    setMobileOpen(false);
    if (!isHome) {
      window.location.href = `/${href}`;
      return;
    }
    const el = document.querySelector(href);
    el?.scrollIntoView({ behavior: "smooth" });
  };

  const desktopLinkClass = `text-sm font-medium transition-colors ${
    isWhiteBg ? "text-[#111111]/70 hover:text-[#111111]" : "text-white/80 hover:text-white"
  }`;

  return (
    <>
    <nav
      className={`fixed top-0 left-0 right-0 z-50 transition-all duration-300 ${
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
              width={144}
              height={36}
              className={`h-9 w-auto transition-all duration-300 ${isWhiteBg ? "" : "brightness-0 invert"}`}
            />
          </a>
        ) : (
          <Link to="/">
            <img src={logo} alt="Edilizia in Cloud" width={144} height={36} className="h-9 w-auto" />
          </Link>
        )}

        {/* Desktop nav */}
        <div className="hidden md:flex items-center gap-8">
          {/* Dedicato a dropdown */}
          <div ref={dropdownRef} className="relative">
            <button
              onClick={() => setDedicatoOpen(!dedicatoOpen)}
              className={`flex items-center gap-1 text-sm font-medium transition-colors ${
                isWhiteBg ? "text-[#111111]/70 hover:text-[#111111]" : "text-white/80 hover:text-white"
              }`}
            >
              Dedicato a
              <ChevronDown
                className={`w-3.5 h-3.5 transition-transform duration-200 ${dedicatoOpen ? "rotate-180" : ""}`}
              />
            </button>
            {dedicatoOpen && (
              <div className="absolute top-full left-1/2 -translate-x-1/2 mt-3 w-52 bg-white rounded-2xl shadow-xl border border-gray-100 py-2 z-50">
                <div className="px-3 pb-1 pt-0.5">
                  <p className="text-[10px] font-bold uppercase tracking-widest text-[#F97415]/70">Tipo di impresa</p>
                </div>
                {dedicatoItems.map((item) => (
                  <Link
                    key={item.to}
                    to={item.to}
                    onClick={() => setDedicatoOpen(false)}
                    className="block px-4 py-2 text-sm text-[#111111]/80 hover:text-[#F97415] hover:bg-[#F97415]/5 transition-colors"
                  >
                    {item.label}
                  </Link>
                ))}
              </div>
            )}
          </div>

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
            to="/formazione"
            className={desktopLinkClass}
            style={location.pathname === "/formazione" ? { color: "#F97415", opacity: 1 } : undefined}
          >
            Formazione
          </Link>
          <Link
            to="/blog"
            className={desktopLinkClass}
            style={location.pathname === "/blog" ? { color: "#F97415", opacity: 1 } : undefined}
          >
            Blog
          </Link>

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
        <div className="md:hidden bg-white border-t border-gray-100 px-6 pb-6 pt-2 space-y-1 shadow-lg">
          {/* Dedicato a mobile accordion */}
          <button
            onClick={() => setMobileDedicatoOpen(!mobileDedicatoOpen)}
            className="w-full flex items-center justify-between py-2 font-medium text-[#111111]"
          >
            <span>Dedicato a</span>
            <ChevronDown
              className={`w-4 h-4 transition-transform duration-200 ${mobileDedicatoOpen ? "rotate-180" : ""}`}
            />
          </button>
          {mobileDedicatoOpen && (
            <div className="pl-4 space-y-1 pb-1">
              {dedicatoItems.map((item) => (
                <Link
                  key={item.to}
                  to={item.to}
                  onClick={() => setMobileOpen(false)}
                  className="block py-1.5 text-sm text-[#111111]/70 hover:text-[#F97415]"
                >
                  {item.label}
                </Link>
              ))}
            </div>
          )}

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
            to="/formazione"
            onClick={() => setMobileOpen(false)}
            className="block py-2 font-medium"
            style={location.pathname === "/formazione" ? { color: "#F97415" } : { color: "#111111" }}
          >
            Formazione
          </Link>
          <Link
            to="/blog"
            onClick={() => setMobileOpen(false)}
            className="block py-2 font-medium"
            style={location.pathname === "/blog" ? { color: "#F97415" } : { color: "#111111" }}
          >
            Blog
          </Link>
          <Link
            to="/casi-studio"
            onClick={() => setMobileOpen(false)}
            className="block py-2 font-medium"
            style={location.pathname === "/casi-studio" ? { color: "#F97415" } : { color: "#111111" }}
          >
            Casi Studio
          </Link>

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
            className="block text-center px-5 py-3 rounded-full bg-[#F97415] text-white font-bold mt-2"
          >
            Richiedi Demo
          </Link>
        </div>
      )}
    </nav>
    </>
  );
}

