import { useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Loader2, Mail, Lock, Eye, EyeOff, UserCircle, Building2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import ediliziaLogo from "@/assets/edilizia-in-cloud-logo.png";

type LoginType = "cliente" | "azienda" | null;

export function LoginForm() {
  const [selectedType, setSelectedType] = useState<LoginType>(null);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const { signIn } = useAuth();
  const { toast } = useToast();

  const openLoginDialog = (type: LoginType) => {
    setSelectedType(type);
    setIsDialogOpen(true);
    setEmail("");
    setPassword("");
  };

  const closeDialog = () => {
    setIsDialogOpen(false);
    setSelectedType(null);
    setEmail("");
    setPassword("");
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);

    try {
      const { error } = await signIn(email, password);
      
      if (error) {
        toast({
          variant: "destructive",
          title: "Errore di accesso",
          description: "Email o password non validi. Riprova.",
        });
      } else {
        toast({
          title: "Accesso effettuato",
          description: "Benvenuto in EdiliziaInCloud!",
        });
        closeDialog();
      }
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Errore",
        description: "Si è verificato un errore. Riprova più tardi.",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const getDialogTitle = () => {
    return selectedType === "cliente" 
      ? "Accesso Area Clienti" 
      : "Accesso Area Azienda";
  };

  const getDialogDescription = () => {
    return selectedType === "cliente"
      ? "Inserisci le tue credenziali per visualizzare i tuoi ordini"
      : "Inserisci le tue credenziali per gestire la piattaforma";
  };

  const getHelpText = () => {
    return selectedType === "cliente"
      ? "Problemi di accesso? Contatta la tua azienda di riferimento"
      : "Problemi di accesso? Contatta l'amministratore";
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-muted/30 via-background to-muted/50 flex flex-col">
      {/* Header con Logo */}
      <div className="py-10 text-center">
        <img 
          src={ediliziaLogo} 
          alt="EdiliziaInCloud" 
          className="h-12 md:h-14 mx-auto" 
        />
      </div>

      {/* Contenuto principale */}
      <div className="flex-1 flex items-center justify-center px-6 pb-12">
        <div className="w-full max-w-5xl">
          {/* Titolo principale */}
          <div className="text-center mb-12">
            <h1 className="text-3xl md:text-4xl font-bold text-foreground mb-3">
              Benvenuto in EdiliziaInCloud
            </h1>
            <p className="text-lg text-muted-foreground">
              Seleziona il tipo di accesso per continuare
            </p>
          </div>

          {/* Griglia Selezione */}
          <div className="grid md:grid-cols-2 gap-8 md:gap-10">
            {/* Card Clienti */}
            <Card 
              className="p-10 md:p-12 cursor-pointer transition-all duration-300 bg-gradient-to-br from-background to-muted/30 border-2 border-border hover:border-primary hover:shadow-xl group"
              onClick={() => openLoginDialog("cliente")}
            >
              <div className="flex flex-col items-center text-center">
                <div className="w-20 h-20 rounded-full bg-primary/10 flex items-center justify-center mb-8 group-hover:bg-primary/20 transition-colors">
                  <UserCircle className="h-10 w-10 text-primary" />
                </div>
                <h2 className="text-2xl md:text-3xl font-bold text-foreground mb-4">
                  Sei un Cliente?
                </h2>
                <p className="text-muted-foreground mb-10 text-base md:text-lg leading-relaxed max-w-sm">
                  Accedi al portale per visualizzare lo stato dei tuoi ordini e richiedere assistenza
                </p>
                <Button 
                  className="w-full max-w-xs" 
                  size="lg"
                  onClick={(e) => {
                    e.stopPropagation();
                    openLoginDialog("cliente");
                  }}
                >
                  Accedi come Cliente
                </Button>
              </div>
            </Card>

            {/* Card Azienda */}
            <Card 
              className="p-10 md:p-12 cursor-pointer transition-all duration-300 bg-gradient-to-br from-primary to-primary/80 border-0 hover:shadow-xl hover:from-primary/95 hover:to-primary/75 group"
              onClick={() => openLoginDialog("azienda")}
            >
              <div className="flex flex-col items-center text-center">
                <div className="w-20 h-20 rounded-full bg-primary-foreground/20 flex items-center justify-center mb-8 group-hover:bg-primary-foreground/30 transition-colors">
                  <Building2 className="h-10 w-10 text-primary-foreground" />
                </div>
                <h2 className="text-2xl md:text-3xl font-bold text-primary-foreground mb-4">
                  Sei un'Azienda?
                </h2>
                <p className="text-primary-foreground/80 mb-10 text-base md:text-lg leading-relaxed max-w-sm">
                  Gestisci ordini, clienti e richieste di assistenza dalla tua dashboard
                </p>
                <Button 
                  variant="secondary"
                  className="w-full max-w-xs" 
                  size="lg"
                  onClick={(e) => {
                    e.stopPropagation();
                    openLoginDialog("azienda");
                  }}
                >
                  Accedi come Azienda
                </Button>
              </div>
            </Card>
          </div>
        </div>
      </div>

      {/* Dialog Login */}
      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader className="text-center pb-2">
            <div className="flex justify-center mb-4">
              <img 
                src={ediliziaLogo} 
                alt="EdiliziaInCloud" 
                className="h-10" 
              />
            </div>
            <DialogTitle className="text-xl">{getDialogTitle()}</DialogTitle>
            <DialogDescription>{getDialogDescription()}</DialogDescription>
          </DialogHeader>

          <form onSubmit={handleSubmit} className="space-y-5 pt-4">
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
                <Input
                  id="email"
                  type="email"
                  placeholder="inserisci la tua email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  disabled={isLoading}
                  autoComplete="email"
                  className="pl-10 h-11"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
                <Input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  disabled={isLoading}
                  autoComplete="current-password"
                  className="pl-10 pr-10 h-11"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                  tabIndex={-1}
                >
                  {showPassword ? (
                    <EyeOff className="h-5 w-5" />
                  ) : (
                    <Eye className="h-5 w-5" />
                  )}
                </button>
              </div>
            </div>

            <Button 
              type="submit" 
              className="w-full h-11 text-base font-medium" 
              disabled={isLoading}
            >
              {isLoading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Accesso in corso...
                </>
              ) : (
                "Accedi"
              )}
            </Button>
          </form>

          <div className="mt-4 pt-4 border-t border-border">
            <p className="text-center text-sm text-muted-foreground">
              {getHelpText()}
            </p>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
