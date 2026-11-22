import { createRoot } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import LocalAssistanceLabPage from "../../src/pages/azienda/LocalAssistanceLabPage";
import "../../src/index.css";
createRoot(document.getElementById("root")!).render(
  <MemoryRouter>
    <LocalAssistanceLabPage />
  </MemoryRouter>,
);
