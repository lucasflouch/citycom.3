
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
  
  // Ref para evitar doble ejecución de lógica de pago en React 18 strict mode
  const paymentProcessedRef = useRef(false);

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

  // === WATCHDOG: Evita que la app se quede congelada eternamente ===
  useEffect(() => {
    const watchdogTimer = setTimeout(() => {
      // Si llevamos más de 10 segundos cargando o verificando...
      if (loading || verifyingPayment) {
        console.warn("🚨 Watchdog: Tiempo límite excedido.");
        // Solo forzamos reinicio si NO estamos en medio de un pago activo exitoso
        if (!paymentProcessedRef.current) {
            setVerifyingPayment(false);
            setLoading(false);
            setNotification({ text: 'La carga tardó demasiado. Revisa tu conexión.', type: 'error' });
        }
      }
    }, 12000); 

    return () => clearTimeout(watchdogTimer);
  }, [loading, verifyingPayment]);
  // ================================================================

  useEffect(() => {
    if (notification) {
      const timer = setTimeout(() => setNotification(null), 6000);
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

  const loadProfile = useCallback(async (userId: string) => {
    try {
      const { data, error } = await supabase.from('profiles').select('*').eq('id', userId).maybeSingle();
      if (error) throw error;
      if (data) setProfile(data as Profile);
    } catch (e) { 
      console.error("Error loading profile:", e); 
    }
  }, []);

  const refreshData = async () => {
    try {
      const dbData = await fetchAppData();
      if (dbData) setAppData(dbData);
    } catch (e) {
      console.error("Refresh data failed:", e);
    }
  };

  useEffect(() => {
    const initApp = async () => {
      try {
        // 1. Obtener Sesión
        const { data: { session: cur }, error: sessionError } = await supabase.auth.getSession();
        if (sessionError) throw sessionError;
        setSession(cur);

        // 2. Cargar Datos Básicos
        await refreshData();
        if (cur) await loadProfile(cur.user.id);

        // 3. --- LÓGICA DE PAGO (Prioridad Alta) ---
        const params = new URLSearchParams(window.location.search);
        const mpStatus = params.get('collection_status') || params.get('status'); 
        const paymentId = params.get('payment_id');
        const externalRef = params.get('external_reference');

        // Si detectamos parámetros de pago y no lo hemos procesado aún
        if ((mpStatus || paymentId) && !paymentProcessedRef.current) {
           paymentProcessedRef.current = true; // Bloqueo inmediato
           console.log("💰 Procesando retorno de Mercado Pago...", { mpStatus, paymentId });

           // CASO A: ÉXITO
           if ((mpStatus === 'approved' || mpStatus === 'success') && paymentId && externalRef) {
              setVerifyingPayment(true);
              try {
                  // Decodificar y Parsear Metadata
                  // externalRef viene como JSON stringifyado: {"userId":"...","planId":"..."}
                  let metadata;
                  try {
                      metadata = JSON.parse(externalRef);
                  } catch (e) {
                      console.error("Error parseando external_reference:", externalRef);
                      throw new Error("Datos de referencia corruptos.");
                  }

                  if (!metadata.planId || !metadata.userId) {
                      throw new Error("Falta planId o userId en la referencia.");
                  }

                  // LLAMADA RPC A SUPABASE (Backend)
                  // Nota: p_plan_id ahora debe ser TEXT en la base de datos
                  const { error: rpcError } = await supabase.rpc('handle_payment_success', {
                      p_user_id: metadata.userId,
                      p_plan_id: metadata.planId, 
                      p_payment_id: paymentId
                  });

                  if (rpcError) throw rpcError;

                  // Éxito total
                  setNotification({ text: '¡Pago exitoso! Disfrutá tu nuevo plan.', type: 'success' });
                  
                  // Recargar perfil forzosamente para ver el nuevo plan
                  if (cur) await loadProfile(cur.user.id);
                  else if (metadata.userId) await loadProfile(metadata.userId);

                  setPage(Page.Dashboard);

              } catch (err: any) {
                  console.error("Error verificando pago:", err);
                  setNotification({ 
                      text: 'Pago recibido, pero hubo un error actualizando tu perfil. Contactanos.', 
                      type: 'error' 
                  });
                  setPage(Page.Profile);
              } finally {
                  setVerifyingPayment(false);
                  // Limpiar URL
                  window.history.replaceState({}, '', '/');
              }
           
           // CASO B: PENDIENTE
           } else if (mpStatus === 'pending' || mpStatus === 'in_process') {
              setNotification({ text: 'El pago se está procesando. Te avisaremos cuando finalice.', type: 'success' });
              setPage(Page.Dashboard);
              window.history.replaceState({}, '', '/');

           // CASO C: FALLIDO
           } else if (mpStatus && ['failure', 'rejected', 'null'].includes(mpStatus)) {
              setNotification({ text: 'El pago fue rechazado o cancelado.', type: 'error' });
              setPage(Page.Pricing);
              window.history.replaceState({}, '', '/');
           }
        }

      } catch (err) {
        console.error("Initial load failed:", err);
      } finally {
        setLoading(false);
      }
    };

    initApp();

    const { data: authListener } = supabase.auth.onAuthStateChange(async (event: string, newSession: Session | null) => {
      setSession(newSession);
      if (newSession) {
        await loadProfile(newSession.user.id);
        // Solo redirigir al login si NO estamos procesando un pago
        if (event === 'SIGNED_IN' && !paymentProcessedRef.current) {
            setPage(Page.Dashboard);
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
      <p className="text-slate-400 font-black uppercase text-[10px] tracking-widest text-center animate-pulse">
        {verifyingPayment ? 'Confirmando Pago...' : 'Iniciando App...'}
      </p>
      {verifyingPayment && (
          <p className="text-slate-300 font-medium text-[9px] mt-2 max-w-xs text-center">
            Estamos activando tu plan en nuestra base de datos segura.
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
