/**
 * Brand logos for the Integrations catalog.
 *
 * Estratti da `src/pages/azienda/settings/SettingsIntegrations.tsx` durante il
 * refactor stile GHL (2026-05-27). Tutti gli SVG sono inline per evitare
 * dipendenze esterne e per supportare className override.
 */
import type React from "react";
import { cn } from "@/lib/utils";

export function BrandIconShell({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "h-10 w-10 rounded-lg border bg-white shadow-sm flex items-center justify-center shrink-0",
        className,
      )}
    >
      {children}
    </div>
  );
}

export function GoogleLogo({ className = "h-5 w-5" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" aria-hidden="true">
      <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4" />
      <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
      <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
      <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
    </svg>
  );
}

export function GoogleAdsLogo({ className = "h-5 w-5" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" aria-hidden="true">
      <path d="M14.6 4.7 22 17.5a3 3 0 0 1-5.2 3L9.4 7.7a3 3 0 1 1 5.2-3z" fill="#4285F4" />
      <path d="M9.4 4.7 2 17.5a3 3 0 0 0 5.2 3l7.4-12.8a3 3 0 1 0-5.2-3z" fill="#FBBC04" />
      <circle cx="4.6" cy="18.7" r="3.3" fill="#34A853" />
    </svg>
  );
}

export function GoogleCalendarLogo({ className = "h-5 w-5" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" aria-hidden="true">
      <path d="M4 5.5A1.5 1.5 0 0 1 5.5 4h13A1.5 1.5 0 0 1 20 5.5V9H4V5.5z" fill="#4285F4" />
      <path d="M4 9h16v9.5a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 4 18.5V9z" fill="#fff" />
      <path d="M4 9h4v11H5.5A1.5 1.5 0 0 1 4 18.5V9z" fill="#34A853" />
      <path d="M16 9h4v9.5a1.5 1.5 0 0 1-1.5 1.5H16V9z" fill="#FBBC04" />
      <path d="M4 5.5A1.5 1.5 0 0 1 5.5 4H8v5H4V5.5z" fill="#EA4335" />
      <text x="12" y="16.3" textAnchor="middle" fontSize="6.5" fontWeight="700" fill="#3c4043" fontFamily="Arial, sans-serif">31</text>
    </svg>
  );
}

export function GoogleBusinessProfileLogo({ className = "h-5 w-5" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" aria-hidden="true">
      <path d="M4 9h16l-1.2-4.2A1.2 1.2 0 0 0 17.65 4H6.35a1.2 1.2 0 0 0-1.15.8L4 9z" fill="#4285F4" />
      <path d="M5 9h4v2.2A2.2 2.2 0 0 1 6.8 13 2.2 2.2 0 0 1 5 10.8V9z" fill="#EA4335" />
      <path d="M9 9h4v2.2A2.2 2.2 0 0 1 10.8 13 2.2 2.2 0 0 1 9 10.8V9z" fill="#FBBC04" />
      <path d="M13 9h4v2.2A2.2 2.2 0 0 1 14.8 13 2.2 2.2 0 0 1 13 10.8V9z" fill="#34A853" />
      <path d="M17 9h2v9.5A1.5 1.5 0 0 1 17.5 20h-11A1.5 1.5 0 0 1 5 18.5V13c.48.38 1.1.62 1.8.62.92 0 1.73-.43 2.2-1.1.47.67 1.28 1.1 2.2 1.1s1.73-.43 2.2-1.1c.47.67 1.28 1.1 2.2 1.1S17.33 13.19 17.8 12.52c.3.42.72.74 1.2.93V9h-2z" fill="#fff" />
      <rect x="8" y="15" width="8" height="5" rx="1" fill="#4285F4" />
    </svg>
  );
}

export function FacebookLogo({ className = "h-5 w-5" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" aria-hidden="true">
      <circle cx="12" cy="12" r="11" fill="#1877F2" />
      <path d="M15.55 15.18 16.04 12h-3.05V9.94c0-.87.43-1.72 1.8-1.72h1.38V5.5s-1.26-.21-2.46-.21c-2.51 0-4.15 1.52-4.15 4.27V12H6.77v3.18h2.79v7.69a11.2 11.2 0 0 0 3.43 0v-7.69h2.56z" fill="#fff" />
    </svg>
  );
}

export function InstagramLogo({ className = "h-5 w-5" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" aria-hidden="true">
      <defs>
        <linearGradient id="instagram-brand-gradient" x1="4" y1="22" x2="22" y2="4" gradientUnits="userSpaceOnUse">
          <stop stopColor="#FEDA75" />
          <stop offset=".32" stopColor="#FA7E1E" />
          <stop offset=".55" stopColor="#D62976" />
          <stop offset=".78" stopColor="#962FBF" />
          <stop offset="1" stopColor="#4F5BD5" />
        </linearGradient>
      </defs>
      <rect x="2.5" y="2.5" width="19" height="19" rx="5.5" fill="url(#instagram-brand-gradient)" />
      <rect x="7" y="7" width="10" height="10" rx="3.2" stroke="#fff" strokeWidth="1.7" />
      <circle cx="12" cy="12" r="2.5" stroke="#fff" strokeWidth="1.7" />
      <circle cx="17" cy="7.4" r="1" fill="#fff" />
    </svg>
  );
}

export function MetaAssetLogo({ className }: { className?: string }) {
  return (
    <div className={cn("relative h-6 w-9", className)}>
      <FacebookLogo className="absolute left-0 top-0 h-6 w-6" />
      <InstagramLogo className="absolute right-0 top-0 h-6 w-6" />
    </div>
  );
}

export function WhatsAppLogo({ className = "h-5 w-5" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" aria-hidden="true">
      <circle cx="12" cy="12" r="11" fill="#25D366" />
      <path d="M7.1 17.2 7.8 15A6.2 6.2 0 0 1 6.9 12a5.2 5.2 0 1 1 2.2 4.25l-2 .95z" fill="#fff" />
      <path d="M9.2 8.95c.12-.27.25-.28.44-.28h.38c.12 0 .28.04.43.33.16.33.55 1.13.6 1.22.05.1.08.2.02.32-.06.12-.1.2-.2.31l-.3.35c-.1.1-.2.22-.08.43.12.2.55.9 1.17 1.46.8.72 1.47.95 1.68 1.06.2.1.33.09.45-.05.14-.16.52-.6.66-.8.14-.2.28-.16.48-.1.2.07 1.25.59 1.47.7.22.1.36.15.41.24.05.09.05.52-.12 1.02-.17.5-1 1-1.38 1.03-.35.03-.8.15-2.58-.58-2.18-.9-3.56-3.1-3.67-3.24-.1-.15-.88-1.17-.88-2.23 0-1.06.56-1.58.76-1.8.2-.22.43-.27.58-.27z" fill="#25D366" />
    </svg>
  );
}

export function YouTubeLogo({ className = "h-5 w-5" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" aria-hidden="true">
      <rect x="2" y="5.5" width="20" height="13" rx="4" fill="#FF0000" />
      <path d="m10 9 5.5 3L10 15V9z" fill="#fff" />
    </svg>
  );
}

export function EmailLogo({ className = "h-5 w-5" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" aria-hidden="true">
      <rect x="2.5" y="5" width="19" height="14" rx="2.5" fill="#fff" stroke="#0F62FE" strokeWidth="1.5" />
      <path d="m3.5 7 8.5 6 8.5-6" stroke="#0F62FE" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
