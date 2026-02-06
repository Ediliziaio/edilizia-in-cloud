import { Navigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { LoginForm } from "@/components/auth/LoginForm";
import { Loader2 } from "lucide-react";

export default function Login() {
  const { user, role, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <p className="text-muted-foreground">Caricamento...</p>
        </div>
      </div>
    );
  }

  // If already logged in, redirect to appropriate dashboard
  if (user && role) {
    switch (role) {
      case "super_admin":
        return <Navigate to="/admin" replace />;
      case "company_admin":
        return <Navigate to="/azienda" replace />;
      case "customer":
        return <Navigate to="/cliente" replace />;
    }
  }

  return <LoginForm />;
}
