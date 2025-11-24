import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import Layout from "./components/Layout";
import Auth from "./pages/Auth";
import Dashboard from "./pages/Dashboard";
import Volunteer from "./pages/Volunteer";
import Streets from "./pages/Streets";
import Campaigns from "./pages/Campaigns";
import Assignments from "./pages/Assignments";
import Teams from "./pages/Teams";
import MapView from "./pages/MapView";
import ImportStreets from "./pages/ImportStreets";
import Users from "./pages/Users";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <Routes>
          <Route path="/auth" element={<Auth />} />
          <Route path="/" element={<Layout><Dashboard /></Layout>} />
          <Route path="/volunteer" element={<Layout><Volunteer /></Layout>} />
          <Route path="/streets" element={<Layout><Streets /></Layout>} />
          <Route path="/campaigns" element={<Layout><Campaigns /></Layout>} />
          <Route path="/assignments" element={<Layout><Assignments /></Layout>} />
          <Route path="/teams" element={<Layout><Teams /></Layout>} />
          <Route path="/map" element={<Layout><MapView /></Layout>} />
          <Route path="/import-streets" element={<Layout><ImportStreets /></Layout>} />
          <Route path="/users" element={<Layout><Users /></Layout>} />
          <Route path="*" element={<NotFound />} />
        </Routes>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;