import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/NotFound";
import { Route, Switch } from "wouter";
import ErrorBoundary from "./components/ErrorBoundary";
import { ThemeProvider } from "./contexts/ThemeContext";
import Home from "./pages/Home";
import ErpHome from "./pages/ErpHome";
import BookingPage from "./pages/BookingPage";

function Router() {
  return (
    <Switch>
      <Route path="/" component={Home} />
      <Route path="/agendar" component={BookingPage} />
      <Route path="/erp" component={ErpHome} />
      <Route path="/erp/tablero" component={ErpHome} />
      <Route path="/erp/caja" component={ErpHome} />
      <Route path="/erp/personal" component={ErpHome} />
      <Route path="/erp/inventario" component={ErpHome} />
      <Route path="/erp/proveedores" component={ErpHome} />
      <Route path="/erp/deudores" component={ErpHome} />
      <Route path="/erp/recontacto" component={ErpHome} />
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
