import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, Eye, EyeOff } from "lucide-react";
import { Progress } from "@/components/ui/progress";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (newPassword: string) => void;
  isPending: boolean;
  userName: string;
}

function getStrength(pw: string): { score: number; label: string; color: string } {
  let score = 0;
  if (pw.length >= 8) score++;
  if (pw.length >= 12) score++;
  if (/[A-Z]/.test(pw)) score++;
  if (/[0-9]/.test(pw)) score++;
  if (/[^A-Za-z0-9]/.test(pw)) score++;
  if (score <= 1) return { score: 20, label: "Debole", color: "bg-destructive" };
  if (score <= 2) return { score: 40, label: "Scarsa", color: "bg-orange-500" };
  if (score <= 3) return { score: 60, label: "Media", color: "bg-yellow-500" };
  if (score <= 4) return { score: 80, label: "Buona", color: "bg-primary" };
  return { score: 100, label: "Forte", color: "bg-green-500" };
}

export default function ResetPasswordDialog({ open, onOpenChange, onSubmit, isPending, userName }: Props) {
  const [password, setPassword] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [error, setError] = useState("");

  const strength = getStrength(password);

  const handleSubmit = () => {
    if (!password.trim()) { setError("Obbligatorio"); return; }
    if (password.length < 8) { setError("Minimo 8 caratteri"); return; }
    onSubmit(password);
  };

  const handleClose = (v: boolean) => {
    if (!v) { setPassword(""); setError(""); setShowPw(false); }
    onOpenChange(v);
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Reset Password</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground">
          Inserisci la nuova password per <strong>{userName}</strong>.
        </p>
        <div className="space-y-3 py-2">
          <div className="space-y-2">
            <Label>Nuova Password</Label>
            <div className="relative">
              <Input
                type={showPw ? "text" : "password"}
                value={password}
                onChange={(e) => { setPassword(e.target.value); setError(""); }}
                placeholder="Minimo 8 caratteri"
                className={`pr-10 ${error ? "border-destructive" : ""}`}
              />
              <Button type="button" variant="ghost" size="icon" className="absolute right-0 top-0 h-full px-3 hover:bg-transparent" onClick={() => setShowPw(!showPw)}>
                {showPw ? <EyeOff className="h-4 w-4 text-muted-foreground" /> : <Eye className="h-4 w-4 text-muted-foreground" />}
              </Button>
            </div>
            {error && <p className="text-sm text-destructive">{error}</p>}
          </div>
          {password.length > 0 && (
            <div className="space-y-1">
              <div className="flex justify-between text-xs">
                <span className="text-muted-foreground">Sicurezza</span>
                <span>{strength.label}</span>
              </div>
              <Progress value={strength.score} className="h-2" />
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => handleClose(false)} disabled={isPending}>Annulla</Button>
          <Button onClick={handleSubmit} disabled={isPending}>
            {isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Reimposta Password
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
