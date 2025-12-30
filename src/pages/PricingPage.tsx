
import React, { useState } from 'react';
import { Profile, SubscriptionPlan, Page, PageValue, Session } from '../types';
import { supabase } from '../supabaseClient';

interface PricingPageProps {
  profile: Profile;
  plans: SubscriptionPlan[];
  session: Session;
  onNavigate: (page: PageValue) => void;
  refreshProfile: () => Promise<void>;
}

const PricingPage: React.FC<PricingPageProps> = ({ profile, plans, session, onNavigate, refreshProfile }) => {
  const [loadingPlanId, setLoadingPlanId] = useState<string | null>(null);
  const [statusMsg, setStatusMsg] = useState<{ text: string, type: 'success' | 'error' } | null>(null);

  const handleSelectPlan = async (plan: SubscriptionPlan) => {
    if (plan.id === profile.plan_id) return;

    setLoadingPlanId(plan.id);
    setStatusMsg(null);

    // Lógica para planes gratuitos
    if (plan.precio === 0) {
      try {
        const { error } = await supabase
          .from('profiles')
          .update({ plan_id: plan.id })
          .eq('id', session.user.id);

        if (error) throw error;

        await refreshProfile();
        setStatusMsg({ text: '¡Plan Gratuito activado! Redirigiendo...', type: 'success' });

        setTimeout(() => {
          onNavigate(Page.Dashboard);
        }, 2000);
      } catch (err: any) {
        console.error("Error al cambiar a plan gratuito:", err);
        setStatusMsg({ text: 'Error al cambiar de plan. Intenta de nuevo.', type: 'error' });
        setLoadingPlanId(null);
      }
      return;
    }

    // Lógica para planes pagos
    try {
      console.log("Iniciando proceso de pago para plan:", plan.nombre);
      
      const { data, error } = await supabase.functions.invoke('create-mercadopago-preference', {
        body: { 
            planId: plan.id, 
            userId: session.user.id,
            origin: window.location.origin 
        }
      });

      // Manejo estricto de errores
      if (error) {
        console.error("Supabase Functions Error (Network/System):", error);
        throw new Error(`Error de conexión: ${error.message || 'Desconocido'}`);
      }
      
      if (data?.error) {
        console.error("Supabase Functions Error (Logic):", data.error);
        throw new Error(`Error del servidor: ${data.error}`);
      }

      if (data?.init_point) {
        window.location.href = data.init_point;
      } else {
        console.error("Respuesta inesperada:", data);
        throw new Error('El servidor no devolvió el link de pago.');
      }

    } catch (err: any) {
      console.error("FATAL ERROR EN PAGO:", err);
      
      // Mensaje amigable para el usuario pero con fallback
      const errorMessage = err.message || "Error desconocido";
      
      // FALLBACK AUTOMÁTICO A WHATSAPP
      const adminWhatsapp = "5491123456789"; 
      const text = `Hola! Tuve un problema pagando en la web (${errorMessage}). Quiero el plan ${plan.nombre} por $${plan.precio} para mi usuario ${profile.email}.`;
      const waLink = `https://wa.me/${adminWhatsapp}?text=${encodeURIComponent(text)}`;
      
      setStatusMsg({ 
        text: `Error: ${errorMessage}. Redirigiendo a soporte manual...`, 
        type: 'error' 
      });

      setTimeout(() => {
          window.open(waLink, '_blank');
          setLoadingPlanId(null);
      }, 2500);
    }
  };

  const sortedPlans = [...plans].sort((a, b) => a.precio - b.precio);

  return (
    <div className="max-w-5xl mx-auto py-8 px-4 relative">
      {statusMsg && (
        <div className={`fixed top-24 left-1/2 -translate-x-1/2 z-[2000] px-8 py-4 rounded-3xl shadow-2xl animate-in slide-in-from-top-10 duration-500 font-black uppercase text-xs tracking-widest ${statusMsg.type === 'success' ? 'bg-green-500 text-white' : 'bg-red-500 text-white'}`}>
          {statusMsg.text}
        </div>
      )}
      <div className="text-center mb-12">
        <h1 className="text-5xl md:text-6xl font-black text-slate-900 tracking-tighter">Elegí tu Plan</h1>
        <p className="text-slate-400 font-semibold text-lg max-w-lg mx-auto mt-4">
          Más publicaciones, más imágenes y más visibilidad. Subí de nivel.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
        {sortedPlans.map(plan => {
          const isCurrentPlan = plan.id === profile.plan_id;
          const isRecommended = plan.nombre.toLowerCase().includes('destacado');
          
          return (
            <div 
              key={plan.id}
              className={`bg-white rounded-5xl p-8 border-4 transition-all duration-300 relative ${isCurrentPlan ? 'border-indigo-600 shadow-indigo' : 'border-transparent hover:border-indigo-100 shadow-soft'}`}
            >
              {isRecommended && !isCurrentPlan && (
                  <span className="bg-amber-400 text-amber-900 text-[10px] font-black uppercase tracking-widest px-4 py-1 rounded-full absolute -top-3 left-1/2 -translate-x-1/2">Recomendado</span>
              )}

              <h3 className="text-2xl font-black text-slate-800 tracking-tighter">{plan.nombre}</h3>
              <p className="text-5xl font-black text-indigo-600 my-4">${plan.precio}<span className="text-slate-300 text-lg">/mes</span></p>

              <ul className="space-y-3 text-slate-500 font-medium my-8">
                <li className="flex items-center gap-3">
                  <span className="w-6 h-6 bg-green-100 text-green-600 rounded-full flex items-center justify-center font-bold text-xs">✓</span>
                  <span>Hasta <b>{plan.limitePublicaciones}</b> publicaciones</span>
                </li>
                <li className="flex items-center gap-3">
                  <span className="w-6 h-6 bg-green-100 text-green-600 rounded-full flex items-center justify-center font-bold text-xs">✓</span>
                  <span>Hasta <b>{plan.limiteImagenes}</b> imágenes por publicación</span>
                </li>
                <li className={`flex items-center gap-3 ${plan.tieneChat ? '' : 'opacity-40'}`}>
                   <span className={`w-6 h-6 rounded-full flex items-center justify-center font-bold text-xs ${plan.tieneChat ? 'bg-green-100 text-green-600' : 'bg-slate-100 text-slate-400'}`}>
                    {plan.tieneChat ? '✓' : '✕'}
                   </span>
                  <span>Chat Interno con Clientes</span>
                </li>
                 <li className={`flex items-center gap-3 ${plan.tienePrioridad ? '' : 'opacity-40'}`}>
                   <span className={`w-6 h-6 rounded-full flex items-center justify-center font-bold text-xs ${plan.tienePrioridad ? 'bg-green-100 text-green-600' : 'bg-slate-100 text-slate-400'}`}>
                     {plan.tienePrioridad ? '✓' : '✕'}
                   </span>
                  <span>Prioridad en listados</span>
                </li>
              </ul>

              <button
                onClick={() => handleSelectPlan(plan)}
                disabled={isCurrentPlan || !!loadingPlanId}
                className={`w-full py-4 rounded-2xl font-black uppercase tracking-widest text-xs transition-all ${
                  isCurrentPlan 
                  ? 'bg-slate-100 text-slate-400 cursor-default' 
                  : `bg-indigo-600 text-white shadow-indigo hover:bg-indigo-700 active:scale-95 disabled:opacity-50 ${loadingPlanId && loadingPlanId !== plan.id ? 'disabled:opacity-20' : ''}`
                }`}
              >
                {loadingPlanId === plan.id ? 'Procesando...' : (isCurrentPlan ? 'Plan Actual' : 'Elegir Plan')}
              </button>
            </div>
          );
        })}
      </div>
      <div className="text-center mt-12">
        <button onClick={() => onNavigate(Page.Dashboard)} className="text-slate-400 font-black uppercase text-[10px] tracking-widest hover:text-indigo-600">
            &larr; Volver a mi Panel
        </button>
      </div>
    </div>
  );
};

export default PricingPage;
