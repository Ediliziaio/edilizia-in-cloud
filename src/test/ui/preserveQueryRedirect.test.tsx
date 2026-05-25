import { act } from "react";
import { createRoot } from "react-dom/client";
import { describe, expect, it } from "vitest";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { PreserveQueryRedirect } from "@/components/routing/PreserveQueryRedirect";

function LocationProbe() {
  const location = useLocation();
  return (
    <div data-testid="probe" data-pathname={location.pathname} data-search={location.search} />
  );
}

function render(initialEntry: string, ui: React.ReactElement) {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() => {
    root.render(
      <MemoryRouter initialEntries={[initialEntry]}>
        <Routes>
          <Route path="/old" element={ui} />
          <Route path="/new" element={<LocationProbe />} />
          <Route path="/new/area" element={<LocationProbe />} />
        </Routes>
      </MemoryRouter>,
    );
  });
  return {
    container,
    cleanup: () => {
      act(() => root.unmount());
      container.remove();
    },
  };
}

describe("PreserveQueryRedirect", () => {
  it("preserves the existing query string when redirecting", () => {
    const { container, cleanup } = render(
      "/old?tab=approvals&utm=foo",
      <PreserveQueryRedirect to="/new" />,
    );
    const probe = container.querySelector('[data-testid="probe"]');
    expect(probe?.getAttribute("data-pathname")).toBe("/new");
    // Query string preserved verbatim (order may vary so check substring)
    const search = probe?.getAttribute("data-search") ?? "";
    expect(search).toContain("tab=approvals");
    expect(search).toContain("utm=foo");
    cleanup();
  });

  it("merges addParams into the existing query string", () => {
    const { container, cleanup } = render(
      "/old?tab=usage",
      <PreserveQueryRedirect to="/new" addParams="section=monitor" />,
    );
    const probe = container.querySelector('[data-testid="probe"]');
    expect(probe?.getAttribute("data-pathname")).toBe("/new");
    const search = probe?.getAttribute("data-search") ?? "";
    expect(search).toContain("section=monitor");
    expect(search).toContain("tab=usage");
    cleanup();
  });

  it("addParams override existing params when keys collide", () => {
    const { container, cleanup } = render(
      "/old?section=old&keep=yes",
      <PreserveQueryRedirect to="/new" addParams="section=new" />,
    );
    const probe = container.querySelector('[data-testid="probe"]');
    const search = probe?.getAttribute("data-search") ?? "";
    expect(search).toContain("section=new");
    expect(search).not.toContain("section=old");
    expect(search).toContain("keep=yes");
    cleanup();
  });

  it("redirects without query string when source has none and no addParams", () => {
    const { container, cleanup } = render("/old", <PreserveQueryRedirect to="/new" />);
    const probe = container.querySelector('[data-testid="probe"]');
    expect(probe?.getAttribute("data-pathname")).toBe("/new");
    expect(probe?.getAttribute("data-search")).toBe("");
    cleanup();
  });

  it("supports nested target paths", () => {
    const { container, cleanup } = render(
      "/old?tab=approvals",
      <PreserveQueryRedirect to="/new/area" addParams="section=foo" />,
    );
    const probe = container.querySelector('[data-testid="probe"]');
    expect(probe?.getAttribute("data-pathname")).toBe("/new/area");
    cleanup();
  });
});
