import { act } from "react";
import { createRoot } from "react-dom/client";
import { describe, expect, it } from "vitest";
import { Wallet } from "lucide-react";
import { AdminHeroHeader } from "@/components/admin/AdminHeroHeader";

function render(node: React.ReactElement) {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() => {
    root.render(node);
  });
  return {
    container,
    cleanup: () => {
      act(() => root.unmount());
      container.remove();
    },
  };
}

describe("AdminHeroHeader", () => {
  it("renders title in h1 and the subtitle when provided", () => {
    const { container, cleanup } = render(
      <AdminHeroHeader icon={Wallet} title="Fatturato" subtitle="Revenue + piani + fatture" />,
    );
    const h1 = container.querySelector("h1");
    expect(h1?.textContent).toBe("Fatturato");
    expect(container.textContent).toContain("Revenue + piani + fatture");
    cleanup();
  });

  it("omits the subtitle paragraph when no subtitle is passed", () => {
    const { container, cleanup } = render(<AdminHeroHeader icon={Wallet} title="Aziende" />);
    expect(container.querySelector("h1")?.textContent).toBe("Aziende");
    expect(container.querySelector("p")).toBeNull();
    cleanup();
  });

  it("renders actions in a dedicated container aligned right", () => {
    const { container, cleanup } = render(
      <AdminHeroHeader
        icon={Wallet}
        title="Fatturato"
        actions={<button type="button">Esporta</button>}
      />,
    );
    const action = container.querySelector("button");
    expect(action?.textContent).toBe("Esporta");
    cleanup();
  });

  it("renders an inline badge next to the title when provided", () => {
    const { container, cleanup } = render(
      <AdminHeroHeader
        icon={Wallet}
        title="Aziende"
        inlineBadge={<span data-testid="badge">33 aziende</span>}
      />,
    );
    expect(container.querySelector('[data-testid="badge"]')?.textContent).toBe("33 aziende");
    cleanup();
  });
});
