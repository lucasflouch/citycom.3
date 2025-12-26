
import React from 'react';
import { AuthSession } from '@supabase/supabase-js';
import { Page, PageValue, Profile } from '../types';
import { supabase } from '../supabaseClient';

interface HeaderProps {
  session: AuthSession | null;
  profile: Profile | null;
  onNavigate: (page: PageValue) => void;
}

const Header: React.FC<HeaderProps> = ({ session, profile, onNavigate }) => {
  
  const handleLogout = async () => {
    try {
        await supabase.auth.signOut();
        onNavigate(Page.Home);
    } catch (e) { console.error("Error al salir:", e); }
  };

  return (
    <header className="bg-white shadow-soft sticky top-0 z-[100] border-b border-slate-50">
      <div className="container mx-auto px-6 py-5 flex justify-between items-center">
        <div 
          className="text-2xl font-black text-indigo-600 cursor-pointer flex items-center gap-3 group"
          onClick={() => onNavigate(Page.Home)}
        >
          <div className="w-10 h-10 bg-indigo-600 rounded-2xl flex items-center justify-center text-white text-lg shadow-indigo group-hover:rotate-12 transition-transform">🇦🇷</div>
          <span className="tracking-tighter uppercase">Guía<span className="text-slate-900">Comercial</span></span>
        </div>
        
        <nav className="flex items-center gap-4 md:gap-8">
          <button 
            onClick={() => onNavigate(Page.Home)} 
            className="hidden md:block text-slate-400 hover:text-indigo-600 text-[10px] font-black uppercase tracking-widest transition-colors"
          >
            Inicio
          </button>
          
          {session ? (
            <div className="flex items-center gap-3">
              <button 
                onClick={() => onNavigate(Page.Dashboard)} 
                className="bg-slate-50 text-slate-900 px-6 py-3 rounded-2xl text-[10px] font-black uppercase tracking-widest hover:bg-indigo-50 hover:text-indigo-600 transition-all border border-transparent hover:border-indigo-100"
              >
                Panel: {profile?.nombre || 'Mi Cuenta'}
              </button>
              <button 
                onClick={handleLogout}
                className="w-10 h-10 bg-red-50 text-red-500 rounded-2xl flex items-center justify-center font-bold hover:bg-red-500 hover:text-white transition-all shadow-sm"
                title="Cerrar Sesión"
              >
                ✕
              </button>
            </div>
          ) : (
            <button 
              onClick={() => onNavigate(Page.Auth)}
              className="bg-indigo-600 text-white px-8 py-3 rounded-2xl text-[10px] font-black uppercase tracking-widest shadow-indigo hover:bg-indigo-700 active:scale-95 transition-all"
            >
              Ingresar
            </button>
          )}
        </nav>
      </div>
    </header>
  );
};

export default Header;
