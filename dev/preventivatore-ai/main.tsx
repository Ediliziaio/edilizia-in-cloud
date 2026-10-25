import React from "react";
import { createRoot } from "react-dom/client";
import { Toaster } from "sonner";
import Simulazione from "@/components/quotes/dev/QuoteAiSimulation";
import "@/index.css";
createRoot(document.getElementById("root")!).render(<><Simulazione /><Toaster /></>);
