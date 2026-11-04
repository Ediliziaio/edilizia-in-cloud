import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { CertificatoSal } from "@/components/orders/CertificatoSal";
import type { SalCertificato } from "@/lib/orders/salCertificato";

vi.mock("@/integrations/supabase/client", () => ({ supabase: { from: vi.fn() } }));

const base = { salId: "s", orderId: "o", companyId: "c", numero: 2, cumulativo: 1100, precedente: null as SalCertificato | null, giaMaturato: 0 };
const avvolgi = (figlio: ReactNode) => <QueryClientProvider client={new QueryClient()}>{figlio}</QueryClientProvider>;

describe("Certificato sulla scheda SAL", () => {
  it("mostra trattenute e netto, senza voci vuote", () => {
    render(avvolgi(<CertificatoSal {...base} puoModificare={false} certificato={{ lavori_contrattuali: 1000, varianti: 100, ritenuta_pct: 10, ritenuta: 110, recupero_anticipazione: 100, altre_detrazioni: 0, acconti_precedenti: 500, netto: 390 }} />));
    expect(screen.getByText("Netto certificato")).toBeInTheDocument();
    expect(screen.getByText("Recupero anticipazione")).toBeInTheDocument();
    expect(screen.queryByText("Altre detrazioni")).toBeNull();
    expect(screen.queryByText("Modifica certificato")).toBeNull();
  });

  it("senza certificato propone di aggiungerlo solo a chi può", () => {
    const { rerender } = render(avvolgi(<CertificatoSal {...base} puoModificare certificato={null} />));
    expect(screen.getByText("Aggiungi certificato di pagamento")).toBeInTheDocument();
    rerender(avvolgi(<CertificatoSal {...base} puoModificare={false} certificato={null} />));
    expect(screen.queryByText("Aggiungi certificato di pagamento")).toBeNull();
  });
});
