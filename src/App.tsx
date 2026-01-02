
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
  
  // ESTADO CRÍTICO: Si esto es true, la app NO debe renderizar nada más que el loader de pago.
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
  // 3. DETECCIÓN Y PROCESAMIENTO DE PAGOS (BLOQUEANTE)
  // ==================================================================================
  useEffect(() => {
    // Esta función se ejecuta ANTES de cualquier lógica de sesión si hay params.
    const checkUrlForPayment = async () => {
      if (paymentProcessedRef.current) return;

      const params = new URLSearchParams(window.location.search);
      const paymentId = params.get('payment_id');
      const status = params.get('status') || params.get('collection_status');
      
      // Si NO hay payment_id, salimos y dejamos que la app cargue normal
      if (!paymentId && !status) return;

      // SI HAY payment_id, activamos MODO BLOQUEANTE inmediatamente
      setVerifyingPayment(true);
      paymentProcessedRef.current = true;
      
      console.log("💳 PAGO DETECTADO. Iniciando verificación blindada.", { paymentId, status });

      // Limpiamos la URL visualmente para que no se re-procese al F5
      window.history.replaceState(null, '', window.location.pathname);

      // Filtro de estados inválidos
      if (status && status !== 'approved' && status !== 'success') {
         setVerifyingPayment(false); // Liberamos la UI
         if (status === 'pending' || status === 'in_process') {
            setNotification({ text: 'El pago está procesándose. Te avisaremos al finalizar.', type: 'success' });
            setPage(Page.Pricing); 
         } else {
            setNotification({ text: 'El pago no se completó o fue rechazado.', type: 'error' });
            setPage(Page.Pricing);
         }
         return;
      }

      if (!paymentId) {
          setVerifyingPayment(false);
          setNotification({ text: 'Error: Retorno de pago sin ID de transacción.', type: 'error' });
          return;
      }

      try {
        // Invocamos la Edge Function. IMPORTANTE: Esta función debe ser pública o manejar el token internamente.
        // Si el usuario perdió la sesión en el redirect, esta llamada podría ser "Anónima".
        // Asegúrate de que la Edge Function no tenga "Enforce JWT" o maneje usuarios anónimos.
        const { data: responseData, error: funcError } = await supabase.functions.invoke('verify-payment-v1', {
            body: { payment_id: paymentId }
        });

        if (funcError) {
            console.error("Error de invocación (Edge Function):", funcError);
            throw new Error(`Error de conexión con validador (${funcError.message})`);
        }

        if (!responseData?.success) {
             console.error("Error lógico en validación:", responseData);
             throw new Error(responseData?.error || 'Validación fallida en servidor');
        }

        console.log("✅ PAGO VERIFICADO Y DB ACTUALIZADA");
        setNotification({ text: '¡Excelente! Tu plan ha sido activado exitosamente.', type: 'success' });
        
        // RE-SINCRONIZACIÓN DE SESIÓN
        // Ahora que el pago está verificado en el backend, intentamos recuperar la sesión
        const { data: { session: currentSession } } = await supabase.auth.getSession();
        
        if (currentSession) {
            // Si hay sesión, recargamos el perfil para ver el nuevo plan
            await loadProfile(currentSession.user.id);
            setPage(Page.Dashboard);
        } else {
            // Si NO hay sesión (se perdió en el redirect), mandamos al login
            // Pero como la DB ya se actualizó (gracias al userId en metadata),
            // cuando se loguee verá el plan nuevo.
            setNotification({ text: 'Plan activado. Por favor iniciá sesión para ver los cambios.', type: 'success' });
            setPage(Page.Auth);
        }

      } catch (err: any) {
        console.error("CRITICAL PAYMENT ERROR:", err);
        setNotification({ 
            text: `ATENCIÓN: Hubo un error verificando el pago (${err.message}). Si se debitó, contactanos con ID: ${paymentId}`, 
            type: 'error' 
        });
        setPage(Page.Pricing);
      } finally {
        // IMPORTANTE: Liberamos la UI solo al final de todo el proceso
        setVerifyingPayment(false);
      }
    };

    checkUrlForPayment();
  }, [loadProfile]);

  // ==================================================================================
  // 4. INICIALIZACIÓN DE APP (CON TIMEOUT SAFEGUARD)
  // ==================================================================================
  useEffect(() => {
    let mounted = true;
    let safetyTimeout: any = null;

    const initApp = async () => {
      // Si estamos verificando pago, no interferimos con el loading global aún
      if (!paymentProcessedRef.current) {
          setLoading(true);
      }

      safetyTimeout = setTimeout(() => {
        if (mounted && loading && !verifyingPayment) {
             console.warn("⚠️ initApp excedió el tiempo límite.");
             setLoading(false);
        }
      }, 7000);

      try {
        const dbData = await fetchAppData();
        if (mounted && dbData) setAppData(dbData);

        const { data: { session: curSession }, error: sessionError } = await supabase.auth.getSession();
        if (sessionError) throw sessionError;

        if (mounted && curSession) {
            const { data: userProfile } = await supabase
                .from('profiles')
                .select('*')
                .eq('id', curSession.user.id)
                .maybeSingle();

            if (userProfile) {
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

    // Solo iniciamos la app si no estamos en medio de una redirección de pago crítica
    initApp();

    const { data: authListener } = supabase.auth.onAuthStateChange(async (event: string, newSession: Session | null) => {
      if (!mounted) return;
      if (event === 'SIGNED_OUT') {
        setSession(null);
        setProfile(null);
        setPage(Page.Home);
      } else if (event === 'SIGNED_IN' && newSession) {
        setSession(newSession);
        // Solo cargamos perfil si no estamos en medio de la verificación de pago, 
        // porque la verificación ya se encarga de recargarlo actualizado.
        if (!verifyingPayment) {
            await loadProfile(newSession.user.id);
        }
      }
    });

    return () => { 
        mounted = false;
        if (safetyTimeout) clearTimeout(safetyTimeout);
        authListener.subscription.unsubscribe();
    };
  }, [handleLogout, loadProfile]); // Removemos verifyingPayment de dependencias para evitar loops

  // ==================================================================================
  // 5. HELPER DE NAVEGACIÓN Y RENDER
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

  useEffect(() => {
    if (notification) {
      const timer = setTimeout(() => setNotification(null), 10000); 
      return () => clearTimeout(timer);
    }
  }, [notification]);

  // --- RENDERIZADO BLOQUEANTE CRÍTICO ---
  // Si verifyingPayment es true, NO RENDERIZAMOS NADA MÁS. Esto evita el parpadeo del AuthPage.
  if (verifyingPayment) return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-slate-50 px-4 fixed inset-0 z-[99999]">
      <div className="animate-spin rounded-full h-20 w-20 border-t-4 border-b-4 border-indigo-600 mb-8"></div>
      <h2 className="text-3xl font-black text-slate-900 uppercase tracking-tighter mb-4">Confirmando Pago</h2>
      <div className="bg-white p-6 rounded-3xl shadow-xl max-w-sm w-full text-center border border-indigo-50">
        <p className="text-slate-500 font-medium mb-4">
          Estamos conectando con Mercado Pago para activar tu plan. 
        </p>
        <p className="text-xs text-slate-400 font-bold uppercase tracking-widest animate-pulse">
          No cierres esta pantalla...
        </p>
      </div>
    </div>
  );

  if (loading) return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-slate-50">
      <div className="animate-spin rounded-full h-12 w-12 border-t-4 border-indigo-600 mb-4"></div>
      <p className="text-slate-400 font-black uppercase text-[10px] tracking-widest">Iniciando App...</p>
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
