import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import LocalLeadTrialPage from "../../src/pages/azienda/LocalLeadTrialPage";
import "../../src/index.css";

createRoot(document.getElementById("root")!).render(
  <BrowserRouter>
    <LocalLeadTrialPage />
  </BrowserRouter>,
);
