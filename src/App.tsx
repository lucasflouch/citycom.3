
import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from './supabaseClient';
import { Profile, Page, Comercio, PageValue, AppData, Conversation, Session } from './types';
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
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState<PageValue>(Page.Home);
  const [selectedComercioId, setSelectedComercioId] = useState<string | null>(null);
  const [selectedConversation, setSelectedConversation] = useState<Conversation | null>(null);
  
  // Estado para el "Botón de Pánico" si la carga se congela
  const [showSafetyReset, setShowSafetyReset] = useState(false);

  // Ref para bloquear redirecciones automáticas del AuthListener si estamos procesando pagos
  const isProcessingPayment = useRef(false);

  // Nuevo estado para notificaciones globales (Pagos, Auth, etc.)
  const [notification, setNotification] = useState<{ text: string, type: 'success' | 'error' } | null>(null);
  
  const [appData, setAppData] = useState<AppData>({
    provincias: [], 
    ciudades: [], 
    rubros: [], 
    subRubros: [],
    plans: [],
    comercios: [],
    banners: []
  }); 

  // Watchdog: Si la carga tarda más de 8 segundos, mostramos el botón de reset
  useEffect(() => {
    let safetyTimer: number;
    if (loading) {
      safetyTimer = window.setTimeout(() => {
        setShowSafetyReset(true);
      }, 8000); // 8 segundos de tolerancia
    }
    return () => clearTimeout(safetyTimer);
  }, [loading]);

  const handleHardReset = async () => {
    try {
      // 1. Desregistrar todos los Service Workers (Mata al Zombie)
      if ('serviceWorker' in navigator) {
        const registrations = await navigator.serviceWorker.getRegistrations();
        for (const registration of registrations) {
          await registration.unregister();
        }
      }
      // 2. Limpiar caché de almacenamiento si es necesario
      if ('caches' in window) {
         const keys = await caches.keys();
         await Promise.all(keys.map(key => caches.delete(key)));
      }
    } catch (e) {
      console.error("Error limpiando caché:", e);
    } finally {
      // 3. REDIRECCIÓN NUCLEAR:
      // No usamos reload() porque mantiene la URL sucia que confunde al SW corrupto.
      // Forzamos ir a la raíz '/' con un timestamp para obligar al servidor a dar un HTML nuevo.
      window.location.href = '/?reset_cache=' + Date.now();
    }
  };

  // Auto-ocultar notificación después de 5 segundos
  useEffect(() => {
    if (notification) {
      const timer = setTimeout(() => setNotification(null), 5000);
      return () => clearTimeout(timer);
    }
  }, [notification]);

  const handleLogout = useCallback(async (isAutoLogout: boolean = false) => {
    try {
      const { error } = await supabase.auth.signOut();
      if (error) throw error;
    } catch (error) {
      console.error("Error during sign out:", error);
    } finally {
      setSession(null);
      setProfile(null);
      setPage(Page.Home);
      if (isAutoLogout) {
        alert("Por seguridad, tu sesión se ha cerrado automáticamente por inactividad.");
      }
    }
  }, []);

  useEffect(() => {
    if (!session) return;

    let inactivityTimer: number;

    const resetInactivityTimer = () => {
      clearTimeout(inactivityTimer);
      inactivityTimer = window.setTimeout(() => {
        handleLogout(true);
      }, 2 * 60 * 1000); // 2 minutos
    };

    const userActivityEvents = ['mousemove', 'mousedown', 'keydown', 'touchstart', 'scroll'];
    userActivityEvents.forEach(event => {
      window.addEventListener(event, resetInactivityTimer);
    });

    resetInactivityTimer();

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
        
        // --- LOGICA DE PROCESAMIENTO DE PAGO MERCADO PAGO ---
        const params = new URLSearchParams(window.location.search);
        const paymentStatus = params.get('status');
        
        // Si hay status, activamos el flag para que el AuthListener no interfiera
        if (paymentStatus) {
           isProcessingPayment.current = true;
        }

        if (cur) await loadProfile(cur.user.id);
        await refreshData();

        // Redirección basada en el estado del pago
        if (paymentStatus) {
            if (paymentStatus === 'approved') {
                setNotification({ text: '¡Pago exitoso! Tu suscripción está activa.', type: 'success' });
                setPage(Page.Dashboard);
                // Forzamos recarga de perfil para intentar obtener el plan actualizado
                if (cur) await loadProfile(cur.user.id);
            } else if (paymentStatus === 'pending') {
                setNotification({ text: 'Tu pago se está procesando.', type: 'success' });
                setPage(Page.Dashboard);
            } else if (['failure', 'rejected', 'null'].includes(paymentStatus)) {
                setNotification({ text: 'El pago fue rechazado o cancelado.', type: 'error' });
                setPage(Page.Pricing); // Forzamos ir a Pricing para reintentar
            }

            // Limpiamos la URL AL FINAL y volvemos a la raíz '/' para evitar errores de rutas virtuales
            window.history.replaceState({}, '', '/');
            
            // Liberamos el flag después de un momento para permitir navegación normal futura
            setTimeout(() => {
                isProcessingPayment.current = false;
            }, 2000);
        }
        // ----------------------------------------------------

      } catch (err) {
        console.error("Initial load failed:", err);
        await handleLogout();
      } finally {
        setLoading(false);
      }
    };

    initApp();

    const { data: authListener } = supabase.auth.onAuthStateChange(async (event: string, newSession: Session | null) => {
      setSession(newSession);
      if (newSession) {
        await loadProfile(newSession.user.id);
        if (event === 'SIGNED_IN') {
             // CRITICO: Solo redirigir al Dashboard si NO estamos procesando un retorno de pago
             if (!isProcessingPayment.current) {
                 setPage(Page.Dashboard);
             }
        }
      } else if (event === 'SIGNED_OUT') {
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
    <div className="flex flex-col items-center justify-center min-h-screen bg-slate-50 px-4">
      {!showSafetyReset ? (
        <>
          <div className="animate-spin rounded-full h-12 w-12 border-t-4 border-indigo-600 mb-4"></div>
          <p className="text-slate-400 font-black uppercase text-[10px] tracking-widest text-center">
            Arquitectando...
          </p>
        </>
      ) : (
        <div className="text-center animate-in fade-in duration-500 max-w-sm mx-auto bg-white p-8 rounded-[2.5rem] shadow-xl border border-red-50">
          <div className="text-5xl mb-4">🚑</div>
          <h3 className="text-xl font-black text-slate-800 mb-2 uppercase">¿Tarda demasiado?</h3>
          <p className="text-slate-400 text-sm mb-6 font-medium">
            Detectamos que la carga está demorando. Puede que tu navegador tenga una versión antigua guardada.
          </p>
          <button 
            onClick={handleHardReset}
            className="w-full bg-indigo-600 text-white py-4 rounded-2xl font-black uppercase tracking-widest text-xs shadow-indigo hover:bg-indigo-700 active:scale-95 transition-all"
          >
            Reparar y Recargar
          </button>
        </div>
      )}
    </div>
  );

  const currentComercio = appData.comercios.find(c => c.id === selectedComercioId) || null;

  return (
    <div className="bg-slate-50 min-h-screen font-sans relative">
      {/* Notificación Global (Toast) */}
      {notification && (
        <div className={`fixed top-24 left-1/2 -translate-x-1/2 z-[9999] px-8 py-4 rounded-3xl shadow-2xl animate-fade-up font-black uppercase text-xs tracking-widest text-white flex items-center gap-3 ${notification.type === 'success' ? 'bg-green-500' : 'bg-red-500'}`}>
            <span>{notification.type === 'success' ? '✓' : '✕'}</span>
            {notification.text}
        </div>
      )}

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
