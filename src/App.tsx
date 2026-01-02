
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
    // No borramos todo localStorage para preservar preferencias si las hubiera, solo token
    
    if (isAutoLogout) {
      alert("Tu sesión ha expirado o los datos son inválidos. Por favor ingresá nuevamente.");
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
  // Este efecto corre UNA SOLA VEZ al inicio. Si detecta parámetros, limpia la URL
  // inmediatamente y luego procesa.
  // ==================================================================================
  useEffect(() => {
    const processPaymentReturn = async () => {
      // Si ya procesamos, salir inmediatamente para evitar loops.
      if (paymentProcessedRef.current) return;

      const params = new URLSearchParams(window.location.search);
      const paymentId = params.get('payment_id');
      const status = params.get('status') || params.get('collection_status');
      
      // Chequeo rápido: ¿Hay indicios de pago?
      if (!paymentId && !status) return;

      // 1. BLOQUEAR RE-ENTRADA Y LIMPIAR URL (CRÍTICO)
      // Esto evita que React vuelva a leer los params en el siguiente render.
      paymentProcessedRef.current = true;
      console.log("💳 Pago detectado. ID:", paymentId, "Status:", status);
      
      // Limpiamos la URL visualmente y del historial
      window.history.replaceState(null, '', window.location.pathname);

      // 2. VALIDAR ESTADO INICIAL
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

      // 3. PROCESAR CON BACKEND (Edge Function)
      setVerifyingPayment(true);
      try {
        // Invocamos la Edge Function segura que verifica con MercadoPago y actualiza la DB
        const { data: responseData, error: funcError } = await supabase.functions.invoke('verify-payment-v1', {
            body: { payment_id: paymentId }
        });

        if (funcError) throw new Error(funcError.message || 'Error de conexión con validador');
        if (!responseData?.success) throw new Error(responseData?.error || 'Verificación fallida en servidor');

        // 4. ÉXITO
        setNotification({ text: '¡Excelente! Tu plan ha sido activado exitosamente.', type: 'success' });
        
        // Forzamos recarga del perfil si hay sesión activa para reflejar el nuevo plan inmediatamente
        const { data: { session: currentSession } } = await supabase.auth.getSession();
        if (currentSession) {
            await loadProfile(currentSession.user.id);
            setPage(Page.Dashboard);
        } else {
            // Caso raro: Pagó pero perdió la sesión. Lo mandamos al login.
            setPage(Page.Auth);
        }

      } catch (err: any) {
        console.error("Error crítico verificando pago:", err);
        setNotification({ 
            text: `Hubo un problema activando el plan automáticamente: ${err.message}. Si se debitó el dinero, contactá a soporte con el ID: ${paymentId}`, 
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
  // 4. INICIALIZACIÓN DE APP
  // ==================================================================================
  useEffect(() => {
    const initApp = async () => {
      setLoading(true);
      try {
        // A. Cargar Datos Globales
        const dbData = await fetchAppData();
        if (dbData) setAppData(dbData);

        // B. Verificar Sesión Actual
        const { data: { session: curSession }, error: sessionError } = await supabase.auth.getSession();
        
        if (sessionError) throw sessionError;

        if (curSession) {
            const { data: userProfile, error: profileError } = await supabase
                .from('profiles')
                .select('*')
                .eq('id', curSession.user.id)
                .maybeSingle();

            if (profileError || !userProfile) {
                console.warn("Sesión sin perfil válido en DB. Cerrando sesión.");
                await handleLogout(true);
                return;
            }

            setSession(curSession);
            setProfile(userProfile as Profile);
        }

      } catch (err) {
        console.error("Error inicio app:", err);
        // No forzamos logout aquí para permitir navegar como invitado si falla algo menor
      } finally {
        setLoading(false);
      }
    };

    initApp();

    const { data: authListener } = supabase.auth.onAuthStateChange(async (event: string, newSession: Session | null) => {
      if (event === 'SIGNED_OUT') {
        setSession(null);
        setProfile(null);
        setPage(Page.Home);
      } else if (event === 'SIGNED_IN' && newSession) {
        setSession(newSession);
        await loadProfile(newSession.user.id);
        // Importante: No redirigir si estamos procesando un pago, dejamos que el efecto de pago maneje la navegación
        if (!paymentProcessedRef.current) {
            // Comportamiento normal de login
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
  // 6. RENDERIZADO
  // ==================================================================================
  
  useEffect(() => {
    if (notification) {
      const timer = setTimeout(() => setNotification(null), 10000); // 10 segundos para leer bien los mensajes de pago
      return () => clearTimeout(timer);
    }
  }, [notification]);

  // Pantalla de Bloqueo durante verificación de pago
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
