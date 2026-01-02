
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
import ProfilePage from './pages/ProfilePage';
import AdminPage from './pages/AdminPage';
import Header from './components/Header';

const App = () => {
  // --- ESTADO GLOBAL ---
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [appData, setAppData] = useState<AppData>({
    provincias: [], 
    ciudades: [], 
    rubros: [], 
    subRubros: [],
    plans: [],
    comercios: [],
    banners: []
  }); 

  // --- ESTADO UI ---
  const [loading, setLoading] = useState(true);
  const [verifyingPayment, setVerifyingPayment] = useState(false); 
  const [page, setPage] = useState<PageValue>(Page.Home);
  const [notification, setNotification] = useState<{ text: string, type: 'success' | 'error' } | null>(null);

  // --- ESTADO DE NAVEGACIÓN ---
  const [selectedComercioId, setSelectedComercioId] = useState<string | null>(null);
  const [selectedConversation, setSelectedConversation] = useState<Conversation | null>(null);
  
  // --- REFS (Anti-Loop) ---
  const paymentProcessedRef = useRef(false);

  // ==================================================================================
  // 1. LOGOUT OPTIMISTA
  // ==================================================================================
  const handleLogout = useCallback(async (isAutoLogout: boolean = false) => {
    setSession(null);
    setProfile(null);
    setPage(Page.Home);
    localStorage.removeItem('sb-sqmjnynklpwjceyuyemz-auth-token');
    
    if (isAutoLogout) {
      setNotification({ text: "Tu sesión ha expirado. Ingresá nuevamente.", type: 'error' });
    }

    try {
      await supabase.auth.signOut();
    } catch (error) {
      console.warn("Error secundario al cerrar sesión:", error);
    }
  }, []);

  // ==================================================================================
  // 2. LOAD PROFILE
  // ==================================================================================
  const loadProfile = useCallback(async (userId: string) => {
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', userId)
        .maybeSingle();
      
      if (error) throw error;
      if (data) {
          setProfile(data as Profile);
          return data;
      }
      return null;
    } catch (e) { 
      console.error("Error loading profile:", e); 
      return null;
    }
  }, []);

  // ==================================================================================
  // 3. DETECCIÓN Y PROCESAMIENTO DE PAGOS (SOLUCIÓN ANTI-LOOP)
  // ==================================================================================
  useEffect(() => {
    const processPaymentReturn = async () => {
      if (paymentProcessedRef.current) return;

      const params = new URLSearchParams(window.location.search);
      const paymentId = params.get('payment_id');
      const status = params.get('status') || params.get('collection_status');
      
      if (!paymentId && !status) return;

      paymentProcessedRef.current = true;
      console.log("💳 Pago detectado. ID:", paymentId, "Status:", status);
      
      window.history.replaceState(null, '', window.location.pathname);

      if (status !== 'approved' && status !== 'success') {
        if (status === 'pending' || status === 'in_process') {
           setNotification({ text: 'El pago está procesándose. Te avisaremos cuando finalice.', type: 'success' });
           setPage(Page.Pricing); 
        } else {
           setNotification({ text: 'El proceso de pago no se completó o fue rechazado.', type: 'error' });
           setPage(Page.Pricing);
        }
        return;
      }

      if (!paymentId) {
          setNotification({ text: 'Error: Pago aprobado pero sin ID de transacción.', type: 'error' });
          return;
      }

      setVerifyingPayment(true);
      try {
        const { data: responseData, error: funcError } = await supabase.functions.invoke('verify-payment-v1', {
            body: { payment_id: paymentId }
        });

        if (funcError) throw new Error(funcError.message || 'Error de conexión con validador');
        if (!responseData?.success) throw new Error(responseData?.error || 'Verificación fallida en servidor');

        setNotification({ text: '¡Excelente! Tu plan ha sido activado exitosamente.', type: 'success' });
        
        const { data: { session: currentSession } } = await supabase.auth.getSession();
        if (currentSession) {
            await loadProfile(currentSession.user.id);
            setPage(Page.Dashboard);
        } else {
            setPage(Page.Auth);
        }

      } catch (err: any) {
        console.error("Error crítico verificando pago:", err);
        setNotification({ 
            text: `Hubo un problema activando el plan: ${err.message}. Contactá a soporte con ID: ${paymentId}`, 
            type: 'error' 
        });
        setPage(Page.Pricing);
      } finally {
        setVerifyingPayment(false);
      }
    };

    processPaymentReturn();
  }, [loadProfile]);

  // ==================================================================================
  // 4. INICIALIZACIÓN DE APP (CON TIMEOUT SAFEGUARD)
  // ==================================================================================
  useEffect(() => {
    let mounted = true;
    let safetyTimeout: any = null;

    const initApp = async () => {
      setLoading(true);

      // --- SAFETY NET ---
      // Si por alguna razón (red, firewall, bug) la carga tarda más de 7 segundos,
      // desbloqueamos la app forzosamente para que el usuario pueda interactuar.
      safetyTimeout = setTimeout(() => {
        if (mounted && loading) {
             console.warn("⚠️ initApp excedió el tiempo límite. Forzando apertura.");
             setLoading(false);
             setNotification({ text: 'La conexión es lenta. Cargando en modo limitado.', type: 'error' });
        }
      }, 7000);

      try {
        // A. Cargar Datos Globales
        const dbData = await fetchAppData();
        if (mounted && dbData) setAppData(dbData);

        // B. Verificar Sesión Actual
        const { data: { session: curSession }, error: sessionError } = await supabase.auth.getSession();
        
        if (sessionError) throw sessionError;

        if (mounted && curSession) {
            const { data: userProfile, error: profileError } = await supabase
                .from('profiles')
                .select('*')
                .eq('id', curSession.user.id)
                .maybeSingle();

            if (!userProfile) {
                // Si hay sesión pero no perfil, limpiamos silenciosamente
                console.warn("Sesión huérfana detectada.");
                await handleLogout(false); 
            } else {
                setSession(curSession);
                setProfile(userProfile as Profile);
            }
        }

      } catch (err) {
        console.error("Error inicio app:", err);
      } finally {
        clearTimeout(safetyTimeout);
        if (mounted) setLoading(false);
      }
    };

    initApp();

    const { data: authListener } = supabase.auth.onAuthStateChange(async (event: string, newSession: Session | null) => {
      if (!mounted) return;
      if (event === 'SIGNED_OUT') {
        setSession(null);
        setProfile(null);
        setPage(Page.Home);
      } else if (event === 'SIGNED_IN' && newSession) {
        setSession(newSession);
        await loadProfile(newSession.user.id);
      }
    });

    return () => { 
        mounted = false;
        if (safetyTimeout) clearTimeout(safetyTimeout);
        authListener.subscription.unsubscribe();
    };
  }, [handleLogout, loadProfile]);

  // ==================================================================================
  // 5. HELPER DE NAVEGACIÓN
  // ==================================================================================
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

  const refreshData = async () => {
    const dbData = await fetchAppData();
    if (dbData) setAppData(dbData);
  };

  // ==================================================================================
  // 6. RENDERIZADO
  // ==================================================================================
  
  useEffect(() => {
    if (notification) {
      const timer = setTimeout(() => setNotification(null), 10000); 
      return () => clearTimeout(timer);
    }
  }, [notification]);

  if (verifyingPayment) return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-slate-50 px-4">
      <div className="animate-spin rounded-full h-16 w-16 border-t-4 border-b-4 border-indigo-600 mb-6"></div>
      <h2 className="text-xl font-black text-slate-800 uppercase tracking-tighter mb-2">Procesando Pago</h2>
      <p className="text-slate-500 font-medium text-center animate-pulse">
        Estamos confirmando la transacción con Mercado Pago.<br/>Por favor, no cierres esta ventana.
      </p>
    </div>
  );

  if (loading) return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-slate-50">
      <div className="animate-spin rounded-full h-12 w-12 border-t-4 border-indigo-600 mb-4"></div>
      <p className="text-slate-400 font-black uppercase text-[10px] tracking-widest">Cargando...</p>
    </div>
  );

  const currentComercio = appData.comercios.find(c => c.id === selectedComercioId) || null;

  return (
    <div className="bg-slate-50 min-h-screen font-sans relative">
      {notification && (
        <div className={`fixed top-24 left-1/2 -translate-x-1/2 z-[9999] w-[90%] max-w-md px-6 py-4 rounded-3xl shadow-2xl animate-in slide-in-from-top-10 flex items-start gap-4 ${notification.type === 'success' ? 'bg-green-600 text-white' : 'bg-red-500 text-white'}`}>
            <span className="text-2xl mt-0.5">{notification.type === 'success' ? '✓' : '✕'}</span>
            <div>
                <p className="font-black uppercase text-xs tracking-widest mb-1">{notification.type === 'success' ? 'Éxito' : 'Atención'}</p>
                <p className="text-sm font-medium leading-tight">{notification.text}</p>
            </div>
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
        
        {page === Page.Profile && session && profile && (
          <ProfilePage 
            session={session}
            profile={profile}
            plans={appData.plans}
            onProfileUpdate={() => loadProfile(session.user.id)}
          />
        )}
        
        {page === Page.Admin && session && profile?.is_admin && (
           <AdminPage 
             session={session} 
             plans={appData.plans}
           />
        )}
      </main>
    </div>
  );
};

export default App;
