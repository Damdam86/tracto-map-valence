import { ReactNode, useEffect, useState } from "react";
import { useNavigate, Link, useLocation } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { 
  MapPin, 
  LayoutDashboard, 
  Map, 
  Users, 
  ClipboardList, 
  LogOut,
  Menu,
  X,
  UserPlus,
  Download
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

interface LayoutProps {
  children: ReactNode;
}

const Layout = ({ children }: LayoutProps) => {
  const { user, loading, signOut } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [userRole, setUserRole] = useState<string>("volunteer");

  useEffect(() => {
    if (!loading && !user) {
      navigate("/auth");
    }
  }, [user, loading, navigate]);

  useEffect(() => {
    const fetchUserRole = async () => {
      if (!user) return;
      
      const { data, error } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", user.id)
        .single();
      
      if (data && !error) {
        setUserRole(data.role);
      }
    };

    fetchUserRole();
  }, [user]);

  const handleSignOut = async () => {
    await signOut();
    navigate("/auth");
  };

  const isAdmin = userRole === "admin" || userRole === "coordinator";

  const navigation = [
    { name: "Tableau de bord", href: "/", icon: LayoutDashboard },
    { name: "Ma campagne", href: "/volunteer", icon: ClipboardList },
    { name: "Carte", href: "/map", icon: Map },
    ...(isAdmin ? [
      { name: "Import rues", href: "/import-streets", icon: Download },
      { name: "Rues & Segments", href: "/streets", icon: MapPin },
      { name: "Campagnes", href: "/campaigns", icon: ClipboardList },
      { name: "Assignations", href: "/assignments", icon: UserPlus },
      { name: "Équipes", href: "/teams", icon: Users },
      { name: "Utilisateurs", href: "/users", icon: Users },
    ] : []),
  ];

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
      </div>
    );
  }

  if (!user) {
    return null;
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="sticky top-0 z-50 w-full border-b bg-card/95 backdrop-blur supports-[backdrop-filter]:bg-card/60">
        <div className="container flex h-16 items-center justify-between px-4">
          <div className="flex items-center gap-2">
            <div className="p-2 bg-primary rounded-lg">
              <MapPin className="w-5 h-5 text-primary-foreground" />
            </div>
            <div className="hidden sm:block">
              <h1 className="text-lg font-bold">Tractage PLV</h1>
              <p className="text-xs text-muted-foreground">Portes-lès-Valence</p>
            </div>
          </div>

          {/* Desktop Navigation */}
          <nav className="hidden md:flex items-center gap-1">
            {navigation.map((item) => {
              const Icon = item.icon;
              const isActive = location.pathname === item.href;
              return (
                <Link key={item.name} to={item.href}>
                  <Button
                    variant={isActive ? "default" : "ghost"}
                    size="sm"
                    className="gap-2"
                  >
                    <Icon className="w-4 h-4" />
                    {item.name}
                  </Button>
                </Link>
              );
            })}
          </nav>

          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="icon"
              onClick={handleSignOut}
              className="hidden md:flex"
            >
              <LogOut className="w-4 h-4" />
            </Button>
            
            <Button
              variant="ghost"
              size="icon"
              className="md:hidden"
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            >
              {mobileMenuOpen ? (
                <X className="w-5 h-5" />
              ) : (
                <Menu className="w-5 h-5" />
              )}
            </Button>
          </div>
        </div>

        {/* Mobile Navigation */}
        {mobileMenuOpen && (
          <div className="md:hidden border-t bg-card">
            <nav className="container py-4 px-4 space-y-2">
              {navigation.map((item) => {
                const Icon = item.icon;
                const isActive = location.pathname === item.href;
                return (
                  <Link
                    key={item.name}
                    to={item.href}
                    onClick={() => setMobileMenuOpen(false)}
                  >
                    <Button
                      variant={isActive ? "default" : "ghost"}
                      className="w-full justify-start gap-2"
                    >
                      <Icon className="w-4 h-4" />
                      {item.name}
                    </Button>
                  </Link>
                );
              })}
              <Button
                variant="ghost"
                className="w-full justify-start gap-2"
                onClick={handleSignOut}
              >
                <LogOut className="w-4 h-4" />
                Déconnexion
              </Button>
            </nav>
          </div>
        )}
      </header>

      {/* Main Content */}
      <main className="container py-6 px-4">
        {children}
      </main>
    </div>
  );
};

export default Layout;