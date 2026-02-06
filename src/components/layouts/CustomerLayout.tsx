import { Link, Outlet } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { 
  ClipboardList, 
  HeadphonesIcon,
  User,
  LogOut,
  Menu
} from "lucide-react";
import ediliziaLogo from "@/assets/edilizia-in-cloud-logo.png";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { NavLink } from "@/components/NavLink";
import { cn } from "@/lib/utils";

const navItems = [
  { title: "I Miei Ordini", url: "/cliente", icon: ClipboardList },
  { title: "Assistenza", url: "/cliente/assistenza", icon: HeadphonesIcon },
  { title: "Profilo", url: "/cliente/profilo", icon: User },
];

export function CustomerLayout() {
  const { signOut, company, profile } = useAuth();
  
  return (
    <div className="min-h-screen flex flex-col bg-muted/30">
      {/* Header */}
      <header className="h-14 border-b bg-background sticky top-0 z-50">
        <div className="h-full max-w-4xl mx-auto px-4 flex items-center justify-between">
          <Link to="/cliente" className="flex items-center gap-2">
            {company?.logo_url ? (
              <Avatar className="h-8 w-8">
                <AvatarImage src={company.logo_url} alt={company.name} />
                <AvatarFallback className="bg-primary text-primary-foreground text-xs">
                  {company?.name?.slice(0, 2).toUpperCase() || "EC"}
                </AvatarFallback>
              </Avatar>
            ) : (
              <img src={ediliziaLogo} alt="EdiliziaInCloud" className="h-8" />
            )}
            <span className="font-semibold text-foreground hidden sm:block">
              {company?.name || "EdiliziaInCloud"}
            </span>
          </Link>
          
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon">
                <Menu className="h-5 w-5" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-48">
              <div className="px-2 py-1.5">
                <p className="text-sm font-medium">
                  {profile?.first_name} {profile?.last_name}
                </p>
                <p className="text-xs text-muted-foreground">
                  {profile?.email}
                </p>
              </div>
              <DropdownMenuSeparator />
              {navItems.map((item) => (
                <DropdownMenuItem key={item.url} asChild>
                  <Link to={item.url} className="flex items-center gap-2">
                    <item.icon className="h-4 w-4" />
                    {item.title}
                  </Link>
                </DropdownMenuItem>
              ))}
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => signOut()} className="text-destructive">
                <LogOut className="h-4 w-4 mr-2" />
                Esci
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </header>

      {/* Navigation Tabs - Mobile Friendly */}
      <nav className="border-b bg-background">
        <div className="max-w-4xl mx-auto px-4">
          <div className="flex gap-1 overflow-x-auto">
            {navItems.map((item) => (
              <NavLink
                key={item.url}
                to={item.url}
                end={item.url === "/cliente"}
                className="flex items-center gap-2 px-4 py-3 text-sm text-muted-foreground border-b-2 border-transparent whitespace-nowrap transition-colors hover:text-foreground"
                activeClassName="text-foreground border-primary font-medium"
              >
                <item.icon className="h-4 w-4" />
                <span className="hidden sm:inline">{item.title}</span>
              </NavLink>
            ))}
          </div>
        </div>
      </nav>

      {/* Main Content */}
      <main className="flex-1">
        <div className="max-w-4xl mx-auto px-4 py-6">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
