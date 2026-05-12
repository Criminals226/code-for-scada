import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider } from "@/contexts/AuthContext";
import { useAuth } from "@/hooks/useAuth";
import { isAdminRole } from "@/lib/roles";
import { AttackProvider } from "@/contexts/AttackContext";
import { SocketProvider } from "@/contexts/SocketContext";
import { ScadaProvider } from "@/contexts/ScadaContext";

// Pages
import Login from "@/pages/Login";
import Dashboard from "@/pages/Dashboard";
import AttackLab from "@/pages/AttackLab";
import Security from "@/pages/Security";
import Historical from "@/pages/Historical";
import Logs from "@/pages/Logs";
import NotFound from "@/pages/NotFound";

// Layouts
import MainLayout from "@/layouts/MainLayout";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});

// Protected route wrapper
function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <div className="w-8 h-8 border-2 border-scada-normal border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-sm font-mono text-muted-foreground">Initializing SCADA System...</p>
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  return <>{children}</>;
}

/** Attack Lab, Security, and Logs require administrator. */
function AdminRoute({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, isLoading, user } = useAuth();

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <div className="w-8 h-8 border-2 border-scada-normal border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-sm font-mono text-muted-foreground">Initializing SCADA System...</p>
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  if (!isAdminRole(user?.role)) {
    return <Navigate to="/" replace />;
  }

  return <>{children}</>;
}

// Public route wrapper (redirects to dashboard if already logged in)
function PublicRoute({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <div className="w-8 h-8 border-2 border-scada-normal border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-sm font-mono text-muted-foreground">Loading...</p>
        </div>
      </div>
    );
  }

  if (isAuthenticated) {
    return <Navigate to="/" replace />;
  }

  return <>{children}</>;
}

function AppRoutes() {
  return (
    <Routes>
      {/* Public routes */}
      <Route
        path="/login"
        element={
          <PublicRoute>
            <Login />
          </PublicRoute>
        }
      />

      {/* Protected routes */}
      <Route
        path="/"
        element={
          <ProtectedRoute>
            <MainLayout />
          </ProtectedRoute>
        }
      >
        <Route index element={<Dashboard />} />
        <Route
          path="attack-lab"
          element={
            <AdminRoute>
              <AttackLab />
            </AdminRoute>
          }
        />
        <Route
          path="security"
          element={
            <AdminRoute>
              <Security />
            </AdminRoute>
          }
        />
        <Route path="historical" element={<Historical />} />
        <Route
          path="logs"
          element={
            <AdminRoute>
              <Logs />
            </AdminRoute>
          }
        />
      </Route>

      {/* 404 */}
      <Route path="*" element={<NotFound />} />
    </Routes>
  );
}

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <AuthProvider>
          <AttackProvider>
            <SocketProvider>
              <ScadaProvider>
                <AppRoutes />
              </ScadaProvider>
            </SocketProvider>
          </AttackProvider>
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
