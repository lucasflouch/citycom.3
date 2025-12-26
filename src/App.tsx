
import { useState, useEffect } from 'react';
import { supabase } from './supabaseClient';
import { AuthSession } from '@supabase/supabase-js';
import { Profile, Page, Comercio, PageValue, AppData } from './types';
import { fetchAppData } from './services/dataService';

import HomePage from './pages/HomePage';
import AuthPage from './pages/AuthPage';
import DashboardPage from './pages/DashboardPage';
import CreateComercioPage from './pages/CreateComercioPage';
import ComercioDetailPage from './pages/ComercioDetailPage';
import Header from './components/Header';

const App = () => {
  const [session, setSession] = useState<AuthSession | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState<PageValue>(Page.Home);
  const [selectedComercioId, setSelectedComercioId] = useState<string | null>(null);
  
  const [appData, setAppData] = useState<AppData>({
    provincias: [], ciudades: [], rubros: [], comercios: [],
    banners: [], usuarios: [], pagos: []
  }); 

  const refreshData = async () => {
    try {
      console.log("Refreshing data from Supabase...");
      const dbData = await fetchAppData();
      if (dbData) {
        setAppData(dbData);
      } else {
        console.warn("Fetch returned null data. Network issue or Supabase unavailable.");
      }
    } catch (e) {
      console.error("Refresh data failed:", e);
    }
  };

  const loadProfile = async (userId: string) => {
    try {
      const { data, error } = await supabase.from('profiles').select('*').eq('id', userId).maybeSingle();
      if (error) throw error;
      if (data) setProfile(data as Profile);
    } catch (e) { 
      console.error("Error loading profile:", e); 
    }
  };

  useEffect(() => {
    const initApp = async () => {
      try {
        const { data: { session: cur }, error: sessionError } = await supabase.auth.getSession();
        if (sessionError) throw sessionError;
        setSession(cur);
        if (cur) loadProfile(cur.user.id);
        await refreshData();
      } catch (err) {
        console.error("Initial app load failed:", err);
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
      } else {
        setProfile(null);
        if (event === 'SIGNED_OUT') setPage(Page.Home);
      }
    });

    return () => authListener.subscription.unsubscribe();
  }, []);

  const handleNavigate = (newPage: PageValue, comercio?: Comercio) => {
    if (comercio) {
      setSelectedComercioId(comercio.id);
    } else if (newPage !== Page.EditComercio && newPage !== Page.ComercioDetail) {
      setSelectedComercioId(null);
    }
    setPage(newPage);
    window.scrollTo(0, 0);
  };

  if (loading) return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-slate-50">
      <div className="animate-spin rounded-full h-12 w-12 border-t-4 border-indigo-600 mb-4"></div>
      <p className="text-slate-400 font-black uppercase text-[10px] tracking-widest text-center">
        Conectando...
      </p>
    </div>
  );

  const currentComercio = appData.comercios.find(c => c.id === selectedComercioId) || null;

  return (
    <div className="bg-slate-50 min-h-screen font-sans">
      <Header session={session} profile={profile} onNavigate={handleNavigate} />
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
      </main>
    </div>
  );
};

export default App;
