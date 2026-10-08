import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/NotFound";
import { Route, Switch } from "wouter";
import ErrorBoundary from "./components/ErrorBoundary";
import { ThemeProvider } from "./contexts/ThemeContext";
import Home from "./pages/Home";
import ErpHome from "./pages/ErpHome";
import BookingPage from "./pages/BookingPage";
import { StaffGate } from "./components/StaffGate";

function GuardedHome() {
  return (
    <StaffGate>
      <Home />
    </StaffGate>
  );
}

function GuardedErp() {
  return (
    <StaffGate>
      <ErpHome />
    </StaffGate>
  );
}

function Router() {
  return (
    <Switch>
      <Route path="/" component={GuardedHome} />
      <Route path="/agendar" component={BookingPage} />
      <Route path="/erp" component={GuardedErp} />
      <Route path="/erp/tablero" component={GuardedErp} />
      <Route path="/erp/caja" component={GuardedErp} />
      <Route path="/erp/facturacion" component={GuardedErp} />
      <Route path="/erp/personal" component={GuardedErp} />
      <Route path="/erp/inventario" component={GuardedErp} />
      <Route path="/erp/proveedores" component={GuardedErp} />
      <Route path="/erp/deudores" component={GuardedErp} />
      <Route path="/erp/recontacto" component={GuardedErp} />
      <Route path="/erp/clientes" component={GuardedErp} />
      <Route path="/404" component={NotFound} />
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <ErrorBoundary>
      <ThemeProvider
        defaultTheme="light"
        // switchable
      >
        <TooltipProvider>
          <Toaster />
          <Router />
        </TooltipProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}

export default App;
