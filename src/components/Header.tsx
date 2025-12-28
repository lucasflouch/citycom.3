
import React from 'react';
import { Page, PageValue, Profile, Session } from '../types';

interface HeaderProps {
  session: Session | null;
  profile: Profile | null;
  onNavigate: (page: PageValue) => void;
  onLogout: () => void;
}

const Header: React.FC<HeaderProps> = ({ session, profile, onNavigate, onLogout }) => {
  return (
    <header className="bg-white shadow-soft sticky top-0 z-[9999] w-full border-b border-slate-100">
      <div className="container mx-auto px-4 md:px-6 py-4 flex justify-between items-center">
        <div 
          className="text-2xl font-black text-indigo-600 cursor-pointer flex items-center gap-2 group"
          onClick={() => onNavigate(Page.Home)}
        >
          <div className="w-10 h-10 bg-indigo-600 rounded-2xl flex items-center justify-center text-white text-lg shadow-indigo group-hover:rotate-12 transition-transform">🏪</div>
          <span className="tracking-tighter uppercase text-slate-900">Guía<span className="text-indigo-600">Comercial</span></span>
        </div>
        
        <nav className="flex items-center gap-3 md:gap-6">
          <button 
            onClick={() => onNavigate(Page.Home)} 
            className="hidden sm:block text-slate-400 hover:text-indigo-600 text-[10px] font-black uppercase tracking-widest transition-colors"
          >
            Inicio
          </button>
          
          {session ? (
            <div className="flex items-center gap-2 md:gap-4">
              <button 
                onClick={() => onNavigate(Page.Messages)} 
                className="hidden sm:block bg-slate-50 text-slate-900 px-4 py-2 md:px-6 md:py-3 rounded-xl md:rounded-2xl text-[10px] font-black uppercase tracking-widest hover:bg-indigo-50 hover:text-indigo-600 transition-all border border-transparent hover:border-indigo-100"
              >
                Mensajes
              </button>
              <button 
                onClick={() => onNavigate(Page.Dashboard)} 
                className="bg-slate-50 text-slate-900 px-4 py-2 md:px-6 md:py-3 rounded-xl md:rounded-2xl text-[10px] font-black uppercase tracking-widest hover:bg-indigo-50 hover:text-indigo-600 transition-all border border-transparent hover:border-indigo-100"
              >
                {profile?.nombre?.split(' ')[0] || 'Mi Panel'}
              </button>
              <button 
                onClick={onLogout}
                className="bg-red-50 text-red-500 px-4 py-2 md:px-6 md:py-3 rounded-xl md:rounded-2xl text-[10px] font-black uppercase tracking-widest hover:bg-red-500 hover:text-white transition-all shadow-sm"
              >
                Salir
              </button>
            </div>
          ) : (
            <button 
              onClick={() => onNavigate(Page.Auth)}
              className="bg-indigo-600 text-white px-6 py-3 rounded-2xl text-[10px] font-black uppercase tracking-widest shadow-indigo hover:bg-indigo-700 active:scale-95 transition-all"
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
