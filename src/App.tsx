
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
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [verifyingPayment, setVerifyingPayment] = useState(false); 
  const [page, setPage] = useState<PageValue>(Page.Home);
  const [selectedComercioId, setSelectedComercioId] = useState<string | null>(null);
  const [selectedConversation, setSelectedConversation] = useState<Conversation | null>(null);
  
  // Usamos useRef para mantener estado durante renderizados iniciales críticos
  const isProcessingPayment = useRef(false);

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

  // === PROTOCOLO DE AUTOCURACIÓN (SELF-HEALING) ===
  useEffect(() => {
    const watchdogTimer = setTimeout(() => {
      const params = new URLSearchParams(window.location.search);
      const isPaymentReturn = params.has('collection_status') || params.has('payment_id');

      if (loading && !isPaymentReturn && !verifyingPayment) {
        console.warn("🚨 Watchdog: Tiempo límite excedido. Forzando reinicio seguro.");
        sessionStorage.clear();
        window.location.reload();
      }
    }, 8000); 

    return () => clearTimeout(watchdogTimer);
  }, [loading, verifyingPayment]);
  // ================================================

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
      }, 2 * 60 * 1000); 
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
        
        // --- LÓGICA DE PROCESAMIENTO DE PAGO (V2 - RPC Strategy) ---
        const params = new URLSearchParams(window.location.search);
        const mpStatus = params.get('collection_status') || params.get('status'); 
        const paymentId = params.get('payment_id');
        const externalRef = params.get('external_reference');

        if (mpStatus || paymentId) {
           isProcessingPayment.current = true;
           console.log("Detectado retorno de pago:", { mpStatus, paymentId });
        }

        if (cur) await loadProfile(cur.user.id);
        await refreshData();

        // 1. PAGO APROBADO
        if ((mpStatus === 'approved' || mpStatus === 'success') && paymentId && externalRef) {
            setVerifyingPayment(true);
            try {
                // Parseamos la data que incrustamos al crear el pago (userId y planId)
                const metadata = JSON.parse(externalRef);
                
                if (!metadata.planId || !metadata.userId) {
                    throw new Error("Metadata de pago incompleta");
                }

                // Llamada a FUNCION DE BASE DE DATOS (RPC)
                // Esto reemplaza a la Edge Function para evitar uso de terminal
                const { error: rpcError } = await supabase.rpc('handle_payment_success', {
                    p_user_id: metadata.userId,
                    p_plan_id: metadata.planId,
                    p_payment_id: paymentId
                });

                if (rpcError) throw rpcError;

                setNotification({ text: '¡Pago exitoso! Tu plan ha sido actualizado.', type: 'success' });
                if (cur) await loadProfile(cur.user.id); 
                setPage(Page.Dashboard);

            } catch (err: any) {
                console.error("Payment verification failed:", err);
                setNotification({ 
                    text: 'Pago recibido. Si tu plan no se actualiza en breve, contactanos.', 
                    type: 'error' 
                });
                setPage(Page.Profile);
            } finally {
                setVerifyingPayment(false);
            }

            window.history.replaceState({}, '', '/');
            setTimeout(() => { isProcessingPayment.current = false; }, 1000);

        // 2. PAGO PENDIENTE
        } else if (mpStatus === 'pending' || mpStatus === 'in_process') {
            setNotification({ text: 'Tu pago se está procesando...', type: 'success' });
            setPage(Page.Dashboard);
            window.history.replaceState({}, '', '/');
            setTimeout(() => { isProcessingPayment.current = false; }, 1000);

        // 3. PAGO FALLIDO
        } else if (mpStatus && ['failure', 'rejected', 'null'].includes(mpStatus)) {
            setNotification({ text: 'El pago no se completó.', type: 'error' });
            setPage(Page.Pricing);
            window.history.replaceState({}, '', '/');
            setTimeout(() => { isProcessingPayment.current = false; }, 1000);
        
        // 4. FALLBACK
        } else if (mpStatus || paymentId) {
            console.warn("Estado ambiguo, volviendo a seguro.");
            setPage(Page.Dashboard);
            window.history.replaceState({}, '', '/');
            setTimeout(() => { isProcessingPayment.current = false; }, 1000);
        }

      } catch (err) {
        console.error("Initial load failed:", err);
        setPage(Page.Home);
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

  if (loading || verifyingPayment) return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-slate-50 px-4">
      <div className="animate-spin rounded-full h-12 w-12 border-t-4 border-indigo-600 mb-4"></div>
      <p className="text-slate-400 font-black uppercase text-[10px] tracking-widest text-center">
        {verifyingPayment ? 'Activando tu Plan...' : 'Iniciando App...'}
      </p>
      {verifyingPayment && (
          <p className="text-slate-300 font-medium text-[9px] mt-2">No cierres esta ventana.</p>
      )}
    </div>
  );

  const currentComercio = appData.comercios.find(c => c.id === selectedComercioId) || null;

  return (
    <div className="bg-slate-50 min-h-screen font-sans relative">
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
