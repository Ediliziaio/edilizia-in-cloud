import { act } from "react";
import { createRoot } from "react-dom/client";
import { describe, expect, it, vi } from "vitest";
import { SidebarSubcategory } from "@/components/layouts/SidebarSubcategory";

function renderSubcategory(isOpen: boolean, onToggle = vi.fn()) {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);

  act(() => {
    root.render(
      <SidebarSubcategory label="Comunicazione" isOpen={isOpen} onToggle={onToggle}>
        <a href="/azienda/marketing/email">Email Marketing</a>
      </SidebarSubcategory>,
    );
  });

  return {
    container,
    onToggle,
    cleanup: () => {
      act(() => root.unmount());
      container.remove();
    },
  };
}

describe("SidebarSubcategory", () => {
  it("renders children only when open to avoid blank invisible menu rows", () => {
    const closed = renderSubcategory(false);
    expect(closed.container.querySelector("a")).toBeNull();
    expect(closed.container.querySelector("button")).toHaveAttribute("aria-expanded", "false");
    closed.cleanup();

    const open = renderSubcategory(true);
    expect(open.container.querySelector("a")).toHaveTextContent("Email Marketing");
    expect(open.container.querySelector("button")).toHaveAttribute("aria-expanded", "true");
    open.cleanup();
  });

  it("keeps the toggle action explicit", () => {
    const { container, onToggle, cleanup } = renderSubcategory(true);
    const button = container.querySelector("button");
    expect(button).not.toBeNull();

    act(() => {
      button!.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    expect(onToggle).toHaveBeenCalledTimes(1);
    cleanup();
  });
});
