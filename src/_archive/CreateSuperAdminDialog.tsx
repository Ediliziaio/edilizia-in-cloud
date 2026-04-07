import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, Eye, EyeOff } from "lucide-react";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (data: { email: string; password: string; firstName: string; lastName: string }) => void;
  isPending: boolean;
}

export default function CreateSuperAdminDialog({ open, onOpenChange, onSubmit, isPending }: Props) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const handleSubmit = () => {
    const errs: Record<string, string> = {};
    if (!firstName.trim()) errs.firstName = "Obbligatorio";
    if (!lastName.trim()) errs.lastName = "Obbligatorio";
    if (!email.trim()) errs.email = "Obbligatorio";
    if (!password.trim()) errs.password = "Obbligatorio";
    else if (password.length < 8) errs.password = "Minimo 8 caratteri";
    setErrors(errs);
    if (Object.keys(errs).length > 0) return;
    onSubmit({ email: email.trim(), password, firstName: firstName.trim(), lastName: lastName.trim() });
  };

  const handleClose = (v: boolean) => {
    if (!v) { setEmail(""); setPassword(""); setFirstName(""); setLastName(""); setErrors({}); }
    onOpenChange(v);
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Nuovo Super Admin</DialogTitle>
        </DialogHeader>
        <div className="grid gap-4 py-2">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>Nome</Label>
              <Input value={firstName} onChange={(e) => { setFirstName(e.target.value); setErrors(p => ({ ...p, firstName: "" })); }} className={errors.firstName ? "border-destructive" : ""} />
              {errors.firstName && <p className="text-sm text-destructive">{errors.firstName}</p>}
            </div>
            <div className="space-y-2">
              <Label>Cognome</Label>
              <Input value={lastName} onChange={(e) => { setLastName(e.target.value); setErrors(p => ({ ...p, lastName: "" })); }} className={errors.lastName ? "border-destructive" : ""} />
              {errors.lastName && <p className="text-sm text-destructive">{errors.lastName}</p>}
            </div>
          </div>
          <div className="space-y-2">
            <Label>Email</Label>
            <Input type="email" value={email} onChange={(e) => { setEmail(e.target.value); setErrors(p => ({ ...p, email: "" })); }} className={errors.email ? "border-destructive" : ""} />
            {errors.email && <p className="text-sm text-destructive">{errors.email}</p>}
          </div>
          <div className="space-y-2">
            <Label>Password</Label>
            <div className="relative">
              <Input type={showPw ? "text" : "password"} value={password} onChange={(e) => { setPassword(e.target.value); setErrors(p => ({ ...p, password: "" })); }} placeholder="Minimo 8 caratteri" className={`pr-10 ${errors.password ? "border-destructive" : ""}`} />
              <Button type="button" variant="ghost" size="icon" className="absolute right-0 top-0 h-full px-3 hover:bg-transparent" onClick={() => setShowPw(!showPw)}>
                {showPw ? <EyeOff className="h-4 w-4 text-muted-foreground" /> : <Eye className="h-4 w-4 text-muted-foreground" />}
              </Button>
            </div>
            {errors.password && <p className="text-sm text-destructive">{errors.password}</p>}
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => handleClose(false)} disabled={isPending}>Annulla</Button>
          <Button onClick={handleSubmit} disabled={isPending}>
            {isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Crea Super Admin
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
