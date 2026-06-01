import { Facebook, Instagram, Linkedin, Youtube } from "lucide-react";
import { Link } from "react-router-dom";
import logo from "@/assets/edilizia-in-cloud-logo-small.webp";
import { footer } from "../content";

function FooterList({ title, items }: { title: string; items: string[] }) {
  return (
    <div>
      <h3 className="text-sm font-black uppercase tracking-[0.24em] text-white">{title}</h3>
      <ul className="mt-5 space-y-3 text-sm text-white/62">
        {items.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
    </div>
  );
}

export function LandingFooter() {
  return (
    <footer className="bg-eic-navy-90 px-5 py-16 text-white/80 md:px-8">
      <div className="mx-auto grid max-w-6xl gap-10 md:grid-cols-4">
        <div>
          <Link to="/" className="inline-flex focus:outline-none focus:ring-2 focus:ring-eic-orange focus:ring-offset-2 focus:ring-offset-eic-navy-90">
            <img loading="lazy"
              src={logo}
              alt="Edilizia in Cloud"
              width={144}
              height={36}
              className="h-9 w-auto brightness-0 invert"
            />
          </Link>
          <div className="mt-5 space-y-3 text-sm leading-6 text-white/62">
            {footer.brand.map((line) => (
              <p key={line}>{line}</p>
            ))}
          </div>
        </div>
        <FooterList title="Prodotto" items={footer.product} />
        <FooterList title="Risorse" items={footer.resources} />
        <FooterList title="Contatti" items={footer.contacts} />
      </div>
      <div className="mx-auto mt-12 flex max-w-6xl flex-col gap-5 border-t border-white/10 pt-8 text-sm text-white/52 md:flex-row md:items-center md:justify-between">
        <p>{footer.bottom}</p>
        <div className="flex items-center gap-4" aria-label={footer.social}>
          <Instagram className="h-4 w-4" strokeWidth={1.5} />
          <Facebook className="h-4 w-4" strokeWidth={1.5} />
          <Linkedin className="h-4 w-4" strokeWidth={1.5} />
          <Youtube className="h-4 w-4" strokeWidth={1.5} />
        </div>
      </div>
    </footer>
  );
}
