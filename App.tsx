
import { useState, useEffect, useCallback } from 'react';
import { supabase } from './supabaseClient';
import { AuthSession } from '@supabase/supabase-js';
import { Profile, Page, Comercio, PageValue, AppData, Conversation } from './types';
import { fetchAppData } from './services/dataService';

import HomePage from './pages/HomePage';
import AuthPage from './pages/AuthPage';
import DashboardPage from './pages/DashboardPage';
import CreateComercioPage from './pages/CreateComercioPage';
import ComercioDetailPage from './pages/ComercioDetailPage';
import MessagesPage from './pages/MessagesPage';
import PricingPage from './pages/PricingPage';
import Header from './components/Header';

const App = () => {
  const [session, setSession] = useState<AuthSession | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState<PageValue>(Page.Home);
  const [selectedComercioId, setSelectedComercioId] = useState<string | null>(null);
  const [selectedConversation, setSelectedConversation] = useState<Conversation | null>(null);
  
  const [appData, setAppData] = useState<AppData>({
    provincias: [], 
    ciudades: [], 
    rubros: [], 
    subRubros: [],
    plans: [],
    comercios: [],
    banners: []
  }); 

  const handleLogout = useCallback(async (isAutoLogout: boolean = false) => {
    try {
      const { error } = await supabase.auth.signOut();
      if (error) throw error;
    } catch (error) {
      console.error("Error during sign out:", error);
    } finally {
      // CRÍTICO: Limpiar el estado local siempre, sin importar el resultado de signOut.
      // Esto previene que la app quede en un estado inconsistente y se cuelgue.
      setSession(null);
      setProfile(null);
      setPage(Page.Home);
      if (isAutoLogout) {
        alert("Por seguridad, tu sesión se ha cerrado automáticamente por inactividad.");
      }
    }
  }, []);

  useEffect(() => {
    if (!session) return; // No activar el timer si no hay sesión.

    let inactivityTimer: number;

    const resetInactivityTimer = () => {
      clearTimeout(inactivityTimer);
      inactivityTimer = window.setTimeout(() => {
        handleLogout(true); // Llamar a logout con flag de auto-cierre.
      }, 2 * 60 * 1000); // 2 minutos en milisegundos.
    };

    // Eventos que cuentan como actividad del usuario.
    const userActivityEvents = ['mousemove', 'mousedown', 'keydown', 'touchstart', 'scroll'];
    userActivityEvents.forEach(event => {
      window.addEventListener(event, resetInactivityTimer);
    });

    resetInactivityTimer(); // Iniciar el timer la primera vez.

    // Función de limpieza para cuando el componente se desmonte o la sesión cambie.
    return () => {
      clearTimeout(inactivityTimer);
      userActivityEvents.forEach(event => {
        window.removeEventListener(event, resetInactivityTimer);
      });
    };
  }, [session, handleLogout]);


  const refreshData = async () => {
    try {
      const dbData = await fetchAppData();
      if (dbData) {
        setAppData(dbData);
      }
    } catch (e) {
      console.error("Refresh data failed:", e);
    }
  };

  const loadProfile = useCallback(async (userId: string) => {
    try {
      const { data, error } = await supabase.from('profiles').select('*').eq('id', userId).maybeSingle();
      if (error) throw error;
      if (data) setProfile(data as Profile);
    } catch (e) { 
      console.error("Error loading profile:", e); 
    }
  }, []);

  useEffect(() => {
    const initApp = async () => {
      try {
        const { data: { session: cur }, error: sessionError } = await supabase.auth.getSession();
        if (sessionError) throw sessionError;
        setSession(cur);
        if (cur) await loadProfile(cur.user.id);
        await refreshData();
      } catch (err) {
        console.error("Initial load failed:", err);
        // Si la carga inicial falla, forzamos un estado de "no logueado".
        await handleLogout();
      } finally {
        setLoading(false);
      }
    };

    initApp();

    const { data: authListener } = supabase.auth.onAuthStateChange(async (event, newSession) => {
      setSession(newSession);
      if (newSession) {
        await loadProfile(newSession.user.id);
        if (event === 'SIGNED_IN') setPage(Page.Dashboard);
      } else if (event === 'SIGNED_OUT') {
        // Asegurarse de que el estado se limpia en SIGNED_OUT
        setProfile(null);
        setPage(Page.Home);
      }
    });

    return () => authListener.subscription.unsubscribe();
  }, [loadProfile, handleLogout]);

  const handleNavigate = (newPage: PageValue, entity?: Comercio | Conversation) => {
    if (newPage === Page.ComercioDetail && entity && 'nombre' in entity) {
      setSelectedComercioId(entity.id);
    } else if (newPage === Page.EditComercio && entity && 'nombre' in entity) {
      setSelectedComercioId(entity.id);
    } else if (newPage === Page.Messages && entity && 'cliente_id' in entity) {
      setSelectedConversation(entity);
    } else {
        setSelectedComercioId(null);
    }
    setPage(newPage);
    window.scrollTo(0, 0);
  };

  if (loading) return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-slate-50">
      <div className="animate-spin rounded-full h-12 w-12 border-t-4 border-indigo-600 mb-4"></div>
      <p className="text-slate-400 font-black uppercase text-[10px] tracking-widest text-center">
        Arquitectando...
      </p>
    </div>
  );

  const currentComercio = appData.comercios.find(c => c.id === selectedComercioId) || null;

  return (
    <div className="bg-slate-50 min-h-screen font-sans">
      <Header session={session} profile={profile} onNavigate={handleNavigate} onLogout={() => handleLogout(false)} />
      <main className="container mx-auto max-w-7xl px-4 py-8">
        {page === Page.Home && <HomePage onNavigate={handleNavigate} data={appData} />}
        {page === Page.Auth && <AuthPage onNavigate={handleNavigate} />}
        {page === Page.Dashboard && (session ? (
          <DashboardPage 
            session={session} 
            profile={profile} 
            onNavigate={handleNavigate} 
            data={appData} 
            refreshData={refreshData}
          />
        ) : <AuthPage onNavigate={handleNavigate} />)}
        {(page === Page.CreateComercio || page === Page.EditComercio) && (session ? 
          <CreateComercioPage 
            session={session} 
            profile={profile}
            onNavigate={handleNavigate} 
            data={appData} 
            onComercioCreated={refreshData} 
            editingComercio={page === Page.EditComercio ? currentComercio : null} 
          /> : <AuthPage onNavigate={handleNavigate} />
        )}
        {page === Page.ComercioDetail && selectedComercioId && (
          <ComercioDetailPage 
            comercioId={selectedComercioId} 
            appData={appData}
            onNavigate={handleNavigate} 
            session={session} 
            profile={profile} 
            onReviewSubmitted={refreshData}
          />
        )}
         {page === Page.Messages && (session && profile ? (
          <MessagesPage 
            session={session} 
            profile={profile} 
            appData={appData}
            onNavigate={handleNavigate}
            initialConversation={selectedConversation}
          />
        ) : <AuthPage onNavigate={handleNavigate} />)}
        {page === Page.Pricing && (session && profile ? (
          <PricingPage 
            profile={profile}
            plans={appData.plans}
            session={session}
            onNavigate={handleNavigate}
            refreshProfile={() => loadProfile(session.user.id)}
          />
        ) : <AuthPage onNavigate={handleNavigate} />)}
      </main>
    </div>
  );
};

export default App;
