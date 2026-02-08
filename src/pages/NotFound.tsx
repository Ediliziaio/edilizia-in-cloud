import { useLocation } from "react-router-dom";
import { useEffect } from "react";

const NotFound = () => {
  const location = useLocation();

  useEffect(() => {
    console.error("404 Error: User attempted to access non-existent route:", location.pathname);
  }, [location.pathname]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-muted">
      <div className="text-center">
        <h1 className="mb-4 text-6xl font-bold text-muted-foreground">404</h1>
        <p className="mb-6 text-xl text-muted-foreground">
          Oops! La pagina che cerchi non esiste.
        </p>
        <a 
          href="/" 
          className="inline-flex items-center gap-2 text-primary hover:underline"
        >
          Torna alla Home
        </a>
      </div>
    </div>
  );
};

export default NotFound;
