
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
  
  // --- REFS ---
  const paymentProcessedRef = useRef(false);

  // ==================================================================================
  // 1. LOGOUT OPTIMISTA (A prueba de balas)
  // Limpia el estado visual INMEDIATAMENTE, luego intenta cerrar sesión en el servidor.
  // ==================================================================================
  const handleLogout = useCallback(async (isAutoLogout: boolean = false) => {
    // 1. Limpieza Visual Inmediata
    setSession(null);
    setProfile(null);
    setPage(Page.Home);
    
    // 2. Limpieza de Storage (Anti-Zombis)
    localStorage.removeItem('sb-sqmjnynklpwjceyuyemz-auth-token'); // Limpia token específico de Supabase
    localStorage.clear(); // Limpia todo por si acaso

    // 3. Notificación opcional
    if (isAutoLogout) {
      alert("Tu sesión ha expirado o los datos son inválidos. Por favor ingresá nuevamente.");
    }

    // 4. Petición al Backend (Fire and Forget)
    try {
      await supabase.auth.signOut();
    } catch (error) {
      console.warn("Error secundario al cerrar sesión en servidor:", error);
    }
  }, []);

  // ==================================================================================
  // 2. CARGA DE PERFIL (Helper)
  // Se usa para refrescar datos después de editar perfil o cambiar plan
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
  // 3. PROCESAMIENTO DE PAGOS (No Bloqueante)
  // ==================================================================================
  const handlePaymentCallback = async (currentUserId: string) => {
    // Si ya procesamos un pago en este montaje, salimos.
    if (paymentProcessedRef.current) return;

    const params = new URLSearchParams(window.location.search);
    const mpStatus = params.get('collection_status') || params.get('status'); 
    const paymentId = params.get('payment_id');
    const externalRef = params.get('external_reference');

    // Si no hay parámetros de pago, no hacemos nada
    if (!mpStatus && !paymentId) return;

    console.log("💳 Detectado retorno de Mercado Pago:", mpStatus);
    paymentProcessedRef.current = true; // Bloqueamos re-entrada

    // Limpiamos la URL visualmente para que el usuario no vea los parámetros feos
    // Pero NO recargamos la página todavía
    window.history.replaceState({}, '', '/');

    // A. PAGO EXITOSO
    if ((mpStatus === 'approved' || mpStatus === 'success') && paymentId && externalRef) {
        setVerifyingPayment(true);
        try {
            let metadata;
            try {
                metadata = JSON.parse(externalRef);
            } catch (e) {
                throw new Error("Referencia de pago corrupta.");
            }

            // Validar que el pago corresponde al usuario actual (Seguridad)
            if (metadata.userId !== currentUserId) {
                console.warn("El pago pertenece a otro usuario.");
                return; 
            }

            // Llamada RPC para actualizar base de datos
            const { error: rpcError } = await supabase.rpc('handle_payment_success', {
                p_user_id: metadata.userId,
                p_plan_id: metadata.planId, 
                p_payment_id: paymentId
            });

            if (rpcError) throw rpcError;

            // Refrescar perfil en caliente
            await loadProfile(currentUserId);
            
            setNotification({ text: '¡Pago exitoso! Plan activado.', type: 'success' });
            setPage(Page.Dashboard);

        } catch (err: any) {
            console.error("Error procesando pago:", err);
            setNotification({ 
                text: 'Hubo un error activando el plan. Contactá a soporte.', 
                type: 'error' 
            });
        } finally {
            setVerifyingPayment(false);
        }
    } 
    // B. PAGO FALLIDO O CANCELADO
    else if (mpStatus === 'failure' || mpStatus === 'rejected' || mpStatus === 'null') {
        setNotification({ text: 'El pago fue cancelado o rechazado.', type: 'error' });
        // No deslogueamos, solo mostramos el error y dejamos al usuario en su estado anterior
        if (page === Page.Pricing) return; // Si ya estaba en pricing, se queda ahi
        setPage(Page.Dashboard);
    }
    // C. PENDIENTE
    else if (mpStatus === 'pending' || mpStatus === 'in_process') {
        setNotification({ text: 'Pago pendiente de acreditación.', type: 'success' });
        setPage(Page.Dashboard);
    }
  };

  // ==================================================================================
  // 4. INICIALIZACIÓN DE APP (Orquestador Principal)
  // ==================================================================================
  useEffect(() => {
    const initApp = async () => {
      setLoading(true);
      try {
        // A. Cargar Datos Globales (Comercios, Rubros, etc.)
        const dbData = await fetchAppData();
        if (dbData) setAppData(dbData);

        // B. Verificar Sesión
        const { data: { session: curSession }, error: sessionError } = await supabase.auth.getSession();
        
        if (sessionError) {
            throw sessionError; // Ir al catch -> Logout
        }

        if (curSession) {
            // C. INTEGRIDAD DE DATOS (Anti-Zombi)
            // Si hay sesión, TIENE que haber perfil. Si no, algo está roto.
            const { data: userProfile, error: profileError } = await supabase
                .from('profiles')
                .select('*')
                .eq('id', curSession.user.id)
                .maybeSingle();

            if (profileError || !userProfile) {
                console.warn("🚨 ZOMBI DETECTADO: Sesión sin perfil válido. Ejecutando purga.");
                await handleLogout(true); // Auto-logout
                return; // Detener inicialización
            }

            // D. Estado Saludable -> Iniciar sesión en UI
            setSession(curSession);
            setProfile(userProfile as Profile);

            // E. Chequear Pagos (Solo si estamos logueados y sanos)
            await handlePaymentCallback(curSession.user.id);
        }

      } catch (err) {
        console.error("Fallo crítico en inicio:", err);
        // Si falla algo crítico en el arranque, limpiamos sesión por seguridad
        await handleLogout(false);
      } finally {
        setLoading(false);
      }
    };

    initApp();

    // F. Listener de Cambios de Auth (Para login/logout en otras pestañas)
    const { data: authListener } = supabase.auth.onAuthStateChange(async (event: string, newSession: Session | null) => {
      if (event === 'SIGNED_OUT') {
        setSession(null);
        setProfile(null);
        setPage(Page.Home);
      } else if (event === 'SIGNED_IN' && newSession) {
        setSession(newSession);
        await loadProfile(newSession.user.id);
        // Si es un inicio de sesión normal (no refresco), ir al dashboard
        if (!paymentProcessedRef.current) {
            setPage(Page.Dashboard);
        }
      }
    });

    return () => authListener.subscription.unsubscribe();
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
  // 6. RENDERIZADO (UI)
  // ==================================================================================
  
  // Watchdog UI para notificaciones temporales
  useEffect(() => {
    if (notification) {
      const timer = setTimeout(() => setNotification(null), 6000);
      return () => clearTimeout(timer);
    }
  }, [notification]);

  if (loading || verifyingPayment) return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-slate-50 px-4">
      <div className="animate-spin rounded-full h-12 w-12 border-t-4 border-indigo-600 mb-4"></div>
      <p className="text-slate-400 font-black uppercase text-[10px] tracking-widest text-center animate-pulse">
        {verifyingPayment ? 'Confirmando Pago...' : 'Iniciando App...'}
      </p>
      {verifyingPayment && (
          <p className="text-slate-300 font-medium text-[9px] mt-2 max-w-xs text-center">
            Estamos validando tu suscripción de forma segura.
          </p>
      )}
    </div>
  );

  const currentComercio = appData.comercios.find(c => c.id === selectedComercioId) || null;

  return (
    <div className="bg-slate-50 min-h-screen font-sans relative">
      {notification && (
        <div className={`fixed top-24 left-1/2 -translate-x-1/2 z-[9999] px-8 py-4 rounded-3xl shadow-2xl animate-fade-up font-black uppercase text-xs tracking-widest text-white flex items-center gap-3 ${notification.type === 'success' ? 'bg-green-500' : 'bg-red-500'}`}>
            <span className="text-lg">{notification.type === 'success' ? '✓' : '✕'}</span>
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
