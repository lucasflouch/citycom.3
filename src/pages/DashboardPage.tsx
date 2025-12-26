
import React, { useMemo, useState } from 'react';
import { AuthSession } from '@supabase/supabase-js';
import { Profile, Page, PageValue, AppData, Comercio } from '../types';
import BusinessCard from '../components/BusinessCard';
import { supabase } from '../supabaseClient';

interface DashboardPageProps {
  session: AuthSession;
  profile: Profile | null;
  onNavigate: (page: PageValue, comercio?: Comercio) => void;
  data: AppData;
  refreshData: () => Promise<void>;
}

const DashboardPage: React.FC<DashboardPageProps> = ({ session, profile, onNavigate, data, refreshData }) => {
  const [isDeleting, setIsDeleting] = useState<string | null>(null);

  const myComercios = useMemo(() => {
    // Filtramos los comercios del usuario. usuarioId viene mapeado desde la DB por el dataService.
    return (data.comercios || []).filter(c => String(c.usuarioId) === String(session.user.id));
  }, [data.comercios, session.user.id]);

  const handleDelete = async (e: React.MouseEvent, id: string, nombre: string) => {
    // CRÍTICO: Detener la propagación para que no se abra el detalle al intentar borrar
    e.preventDefault();
    e.stopPropagation();

    if (!window.confirm(`¿Estás seguro de eliminar permanentemente "${nombre}"? Esta acción no se puede deshacer.`)) return;
    
    setIsDeleting(id);
    try {
      const { error } = await supabase
        .from('comercios')
        .delete()
        .eq('id', id);
      
      if (error) {
        if (error.code === '42501') {
          throw new Error("No tenés permiso para borrar este comercio (RLS Policy).");
        }
        throw error;
      }
      
      // Actualizar datos globales
      await refreshData();
      alert('¡Comercio eliminado con éxito!');
    } catch (err: any) {
      console.error("Error al borrar comercio:", err);
      alert('Error: ' + (err.message || 'No se pudo completar el borrado.'));
    } finally {
      setIsDeleting(null);
    }
  };

  const handleEdit = (e: React.MouseEvent, comercio: Comercio) => {
    e.preventDefault();
    e.stopPropagation();
    onNavigate(Page.EditComercio, comercio);
  };

  return (
    <div className="max-w-6xl mx-auto py-4 px-4">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-10 bg-white p-8 rounded-4xl shadow-soft border border-indigo-50 animate-in fade-in duration-500">
        <div>
          <h1 className="text-4xl font-black text-slate-900 tracking-tighter mb-1 uppercase italic">Tu Panel</h1>
          <p className="text-slate-400 font-medium">
            Hola, <span className="text-indigo-600 font-bold">{profile?.nombre || session.user.email?.split('@')[0]}</span>. Gestioná tus publicaciones.
          </p>
        </div>
        <button 
          onClick={() => onNavigate(Page.CreateComercio)}
          className="mt-6 md:mt-0 bg-indigo-600 text-white px-8 py-4 rounded-3xl font-black uppercase tracking-widest text-xs shadow-indigo hover:bg-indigo-700 transition-all active:scale-95"
        >
          + Publicar Nuevo
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
        {myComercios.length === 0 ? (
          <div className="col-span-full bg-white p-20 rounded-5xl shadow-soft border-2 border-dashed border-slate-100 text-center">
            <div className="text-6xl mb-6">🏪</div>
            <h3 className="text-2xl font-bold text-slate-800 mb-2 uppercase tracking-tighter">Aún no tenés comercios</h3>
            <p className="text-slate-400 mb-8 max-w-sm mx-auto font-medium italic">Empezá publicando tu negocio hoy mismo en la guía comercial.</p>
            <button onClick={() => onNavigate(Page.CreateComercio)} className="text-indigo-600 font-black uppercase tracking-widest text-[10px] hover:underline underline-offset-8">Crear ahora &rarr;</button>
          </div>
        ) : (
          myComercios.map(comercio => {
            const ciudad = data.ciudades?.find(c => String(c.id) === String(comercio.ciudadId)) || { id: '', nombre: 'Localidad', provinciaId: '' };
            const provincia = data.provincias?.find(p => String(p.id) === String(ciudad.provinciaId)) || { id: '', nombre: '' };
            const rubro = data.rubros?.find(r => String(r.id) === String(comercio.rubroId)) || { id: '', nombre: 'General', icon: '📍' };

            return (
              <div key={comercio.id} className="relative group bg-white p-2 rounded-4xl border border-transparent hover:border-indigo-100 transition-all shadow-sm">
                <div onClick={() => onNavigate(Page.ComercioDetail, comercio)} className="cursor-pointer">
                  <BusinessCard comercio={comercio} ciudad={ciudad} provincia={provincia} rubro={rubro} />
                </div>
                <div className="mt-4 flex gap-2 p-2 relative z-20">
                  <button 
                    onClick={(e) => handleEdit(e, comercio)}
                    className="flex-1 bg-indigo-50 text-indigo-600 py-3 rounded-2xl text-[10px] font-black uppercase tracking-widest hover:bg-indigo-600 hover:text-white transition-all shadow-sm active:scale-95"
                  >
                    Editar
                  </button>
                  <button 
                    disabled={isDeleting === comercio.id}
                    onClick={(e) => handleDelete(e, comercio.id, comercio.nombre)}
                    className={`bg-red-50 text-red-500 px-6 py-3 rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all shadow-sm active:scale-95 ${isDeleting === comercio.id ? 'opacity-50 cursor-not-allowed' : 'hover:bg-red-600 hover:text-white'}`}
                  >
                    {isDeleting === comercio.id ? '...' : 'Borrar'}
                  </button>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};

export default DashboardPage;
