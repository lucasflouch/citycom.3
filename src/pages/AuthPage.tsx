
import React, { useState } from 'react';
import { supabase } from '../supabaseClient';
import { Page, PageValue } from '../types';

interface AuthPageProps {
  onNavigate: (page: PageValue) => void;
}

const AuthPage: React.FC<AuthPageProps> = ({ onNavigate }) => {
  const [loading, setLoading] = useState(false);
  const [email, setEmail] = useState('');
  const [telefono, setTelefono] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isLogin, setIsLogin] = useState(true);
  const [errorMsg, setErrorMsg] = useState('');

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');

    if (!isLogin && password !== confirmPassword) {
      setErrorMsg('Las contraseñas no coinciden');
      return;
    }

    setLoading(true);
    try {
      if (isLogin) {
        const { error, data } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        if (data.session) onNavigate(Page.Dashboard);
      } else {
        const { error, data } = await supabase.auth.signUp({
          email,
          password,
          options: {
            data: { 
                telefono, 
                nombre: email.split('@')[0] 
            }
          }
        });
        
        if (error) {
            if (error.status === 500) {
                throw new Error("Error interno del servidor de Auth (500). Verificá los Triggers en Supabase SQL Editor.");
            }
            throw error;
        }

        if (data.session) {
          onNavigate(Page.Dashboard);
        } else {
          alert('¡Cuenta creada! Verificá tu email para confirmar. Si no recibís el código, revisá SPAM o reintentá.');
          setIsLogin(true);
        }
      }
    } catch (error: any) {
      console.error("Auth error details:", error);
      setErrorMsg(error.message || 'Error en la autenticación');
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleLogin = async () => {
    try {
        const { error } = await supabase.auth.signInWithOAuth({
            provider: 'google',
            options: { redirectTo: window.location.origin }
        });
        if (error) throw error;
    } catch (err: any) {
        setErrorMsg(err.message);
    }
  };

  return (
    <div className="flex flex-col items-center justify-center min-h-[85vh] px-4 py-8">
      <div className="max-w-md w-full bg-white p-10 rounded-5xl shadow-indigo border border-indigo-50">
        <div className="text-center mb-10">
          <div className="text-6xl mb-4 transform hover:scale-110 transition-transform cursor-default inline-block">🇦🇷</div>
          <h2 className="text-4xl font-black text-slate-900 tracking-tighter">
            {isLogin ? '¡Hola!' : 'Unite'}
          </h2>
          <p className="text-slate-400 font-bold mt-2 uppercase text-[10px] tracking-widest">
            {isLogin ? 'Ingresá a tu panel' : 'Creá tu cuenta gratis'}
          </p>
        </div>

        <form onSubmit={handleAuth} className="space-y-4">
          <div className="space-y-3">
            <input
              type="email"
              placeholder="Email"
              required
              className="w-full px-6 py-4 bg-slate-50 border-none rounded-3xl focus:ring-2 focus:ring-indigo-500 outline-none transition-all font-bold text-slate-700"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
            
            {!isLogin && (
              <input
                type="tel"
                placeholder="WhatsApp (Ej: 1165550215)"
                required
                className="w-full px-6 py-4 bg-slate-50 border-none rounded-3xl focus:ring-2 focus:ring-indigo-500 outline-none transition-all font-bold text-slate-700"
                value={telefono}
                onChange={(e) => setTelefono(e.target.value)}
              />
            )}

            <input
              type="password"
              placeholder="Contraseña"
              required
              className="w-full px-6 py-4 bg-slate-50 border-none rounded-3xl focus:ring-2 focus:ring-indigo-500 outline-none transition-all font-bold text-slate-700"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />

            {!isLogin && (
              <input
                type="password"
                placeholder="Confirmar contraseña"
                required
                className="w-full px-6 py-4 bg-slate-50 border-none rounded-3xl focus:ring-2 focus:ring-indigo-500 outline-none transition-all font-bold text-slate-700"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
              />
            )}
          </div>

          {errorMsg && (
            <div className="bg-red-50 text-red-600 p-4 rounded-2xl text-[10px] font-black uppercase tracking-widest border border-red-100">
              ⚠️ {errorMsg}
            </div>
          )}

          <button
            disabled={loading}
            className="w-full py-5 bg-indigo-600 text-white rounded-3xl font-black text-lg shadow-indigo hover:bg-indigo-700 active:scale-[0.98] transition-all disabled:opacity-50 mt-4 uppercase tracking-widest"
          >
            {loading ? 'Procesando...' : isLogin ? 'Ingresar' : 'Crear Cuenta'}
          </button>
        </form>

        <div className="relative my-8">
          <div className="absolute inset-0 flex items-center"><div className="w-full border-t border-slate-100"></div></div>
          <div className="relative flex justify-center text-[10px] uppercase font-black"><span className="px-4 bg-white text-slate-300">O</span></div>
        </div>

        <button 
          onClick={handleGoogleLogin}
          type="button"
          className="w-full py-4 border-2 border-slate-100 rounded-3xl font-black flex items-center justify-center gap-3 hover:bg-slate-50 transition-all text-slate-600 active:scale-[0.98]"
        >
          <img src="https://www.gstatic.com/firebasejs/ui/2.0.0/images/smartlock/google.svg" className="w-5" alt="Google" />
          <span className="text-[10px] uppercase tracking-widest">Continuar con Google</span>
        </button>

        <p className="mt-8 text-center text-slate-400 font-bold text-xs uppercase tracking-tighter">
          {isLogin ? '¿No tenés cuenta?' : '¿Ya sos parte?'}
          <button onClick={() => setIsLogin(!isLogin)} className="ml-2 text-indigo-600 font-black hover:underline decoration-2 underline-offset-4">
            {isLogin ? 'Registrate' : 'Iniciá sesión'}
          </button>
        </p>

        <div className="text-center mt-6">
            <button onClick={() => onNavigate(Page.Home)} className="text-[8px] text-slate-300 uppercase tracking-[0.3em] font-black hover:text-indigo-600 transition-colors">
                &larr; Volver al Inicio
            </button>
        </div>
      </div>
    </div>
  );
};

export default AuthPage;
