
import React, { useState, useMemo } from 'react';
import { AuthSession } from '@supabase/supabase-js';
import { Comercio, Page, PageValue, Review, Profile, AppData } from '../types';
import { supabase } from '../supabaseClient';
import Map from '../components/Map';

interface ComercioDetailPageProps {
  comercioId: string;
  appData: AppData;
  onNavigate: (page: PageValue) => void;
  session: AuthSession | null;
  profile: Profile | null;
  onReviewSubmitted: () => Promise<void>;
}

const ComercioDetailPage: React.FC<ComercioDetailPageProps> = ({ comercioId, appData, onNavigate, session, profile, onReviewSubmitted }) => {
  const comercio = useMemo(() => appData.comercios.find(c => c.id === comercioId), [appData.comercios, comercioId]);
  
  const [activeImage, setActiveImage] = useState<string | null>(null);
  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState('');
  const [submitting, setSubmitting] = useState(false);

  if (!comercio) return <div className="text-center py-20 font-bold">Comercio no encontrado</div>;

  const currentImage = activeImage || comercio.imagenUrl;
  const gallery = comercio.imagenes && comercio.imagenes.length > 0 ? comercio.imagenes : [comercio.imagenUrl];
  const reviews = comercio.reviews || [];
  const rubro = appData.rubros.find(r => r.id === comercio.rubroId);

  const handleRatingSubmit = async () => {
    if (!session) return alert('Debes iniciar sesión para calificar.');
    if (rating === 0) return alert('Por favor selecciona una puntuación.');
    if (!comment.trim()) return alert('Por favor escribe un comentario.');

    setSubmitting(true);
    try {
      const { error } = await supabase.from('reviews').insert([{
        comercio_id: comercio.id,
        usuario_id: session.user.id,
        usuario_nombre: profile?.nombre || session.user.email?.split('@')[0],
        rating: rating,
        comentario: comment,
        created_at: new Date().toISOString()
      }]);

      if (error) throw error;
      
      await onReviewSubmitted();
      alert('¡Gracias por tu reseña!');
      setComment('');
      setRating(0);
    } catch (err: any) {
      alert('Error: ' + err.message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="max-w-6xl mx-auto bg-gray-50 min-h-screen pb-32">
      {/* Portada con efecto de profundidad */}
      <div className="relative h-[400px] md:h-[500px] overflow-hidden rounded-b-[4rem] shadow-soft">
        <img src={currentImage} className="w-full h-full object-cover transition-all duration-1000 transform hover:scale-105" alt={comercio.nombre} />
        <div className="absolute inset-0 bg-gradient-to-t from-slate-900/90 via-slate-900/20 to-transparent"></div>
        
        <button 
          onClick={() => onNavigate(Page.Home)}
          className="absolute top-8 left-8 w-14 h-14 bg-white/90 backdrop-blur rounded-full flex items-center justify-center shadow-xl hover:scale-110 transition-transform z-20"
        >
          <span className="text-xl">←</span>
        </button>

        <div className="absolute bottom-12 left-8 right-8 md:left-12 md:right-12 text-white z-10">
          <div className="flex flex-wrap items-center gap-4 mb-4">
            <span className="bg-indigo-600 px-4 py-1.5 rounded-full text-[10px] font-black uppercase tracking-widest shadow-lg">
              {rubro?.icon} {rubro?.nombre || 'General'}
            </span>
            <div className="flex items-center gap-2 text-amber-400 font-black text-xl bg-black/40 px-4 py-1.5 rounded-2xl backdrop-blur-md">
              ★ {comercio.rating || 0} 
              <span className="text-white/70 text-sm font-bold ml-1">({comercio.reviewCount || 0} opiniones)</span>
            </div>
          </div>
          <h1 className="text-4xl md:text-7xl font-black tracking-tighter uppercase leading-none mb-3 drop-shadow-lg">{comercio.nombre}</h1>
          <div className="inline-flex items-center gap-3 bg-white/10 backdrop-blur px-5 py-2 rounded-2xl border border-white/20">
            <span className="text-xl">📍</span> 
            <span className="text-white font-black uppercase text-[10px] tracking-[0.2em]">{comercio.direccion || 'Ubicación verificada'}</span>
          </div>
        </div>

        <div className="absolute bottom-12 right-12 hidden lg:flex gap-3">
          {gallery.slice(0, 4).map((img, i) => (
            <button 
              key={i} 
              onClick={() => setActiveImage(img)}
              className={`w-16 h-16 rounded-2xl border-2 transition-all overflow-hidden shadow-2xl ${currentImage === img ? 'border-white scale-110' : 'border-white/30 hover:border-white/60'}`}
            >
              <img src={img} className="w-full h-full object-cover" />
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-10 p-4 md:p-8 lg:-mt-10 relative z-10">
        <div className="lg:col-span-2 space-y-10">
          {/* Información del Negocio */}
          <section className="bg-white p-8 md:p-12 rounded-[3.5rem] shadow-soft border border-slate-50">
            <h3 className="text-2xl font-black uppercase tracking-tighter text-slate-900 mb-6 border-l-4 border-indigo-600 pl-5 italic">¿Quiénes somos?</h3>
            <p className="text-slate-500 text-lg leading-relaxed font-medium">
              {comercio.descripcion || "Este comercio es un referente en su zona. Brinda atención personalizada y productos de alta calidad. ¡Contactalos hoy mismo para más información sobre sus ofertas vigentes!"}
            </p>
          </section>

          {/* Mapa Compacto y Dirección */}
          <section className="bg-white p-8 md:p-12 rounded-[3.5rem] shadow-soft border border-slate-50">
             <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-8 gap-4 border-l-4 border-indigo-600 pl-5 italic">
                <h3 className="text-2xl font-black uppercase tracking-tighter text-slate-900">Ubicación Exacta</h3>
                <div className="bg-slate-50 px-4 py-2 rounded-xl border border-slate-100">
                    <span className="text-slate-400 font-black text-[10px] uppercase tracking-widest block mb-0.5">DIRECCIÓN CARGADA:</span>
                    <span className="text-indigo-600 font-black text-sm uppercase">{comercio.direccion || 'Sin dirección especificada'}</span>
                </div>
             </div>
             <div className="h-[250px] w-full rounded-3xl overflow-hidden border border-slate-100 shadow-inner">
                <Map 
                    comercios={[comercio]} 
                    center={comercio.latitude && comercio.longitude ? [comercio.latitude, comercio.longitude] : undefined}
                    zoom={16} 
                />
             </div>
             <div className="mt-8 flex items-center gap-4 bg-indigo-50 p-6 rounded-3xl border border-indigo-100">
                <div className="text-3xl">🏁</div>
                <div>
                    <h4 className="font-black text-indigo-900 uppercase text-xs tracking-widest mb-1">Indicaciones para llegar</h4>
                    <p className="text-indigo-700/70 text-sm font-medium">Ubicado en <span className="font-black text-indigo-900 underline">{comercio.direccion}</span>, {appData.ciudades.find(c => c.id === comercio.ciudadId)?.nombre}.</p>
                </div>
                <a 
                  href={`https://www.google.com/maps/dir/?api=1&destination=${comercio.latitude},${comercio.longitude}`}
                  target="_blank"
                  className="ml-auto bg-white px-6 py-3 rounded-2xl text-[10px] font-black uppercase tracking-widest text-indigo-600 shadow-sm hover:shadow-md transition-all whitespace-nowrap"
                >
                    Ir con Google Maps
                </a>
             </div>
          </section>

          {/* Reseñas */}
          <section className="bg-white p-8 md:p-12 rounded-[3.5rem] shadow-soft border border-slate-50">
            <h3 className="text-2xl font-black uppercase tracking-tighter text-slate-900 mb-10 border-l-4 border-indigo-600 pl-5 italic">Opiniones de la Comunidad</h3>
            
            <div className="space-y-6 mb-12">
              {reviews.length > 0 ? reviews.map((rev) => (
                <div key={rev.id} className="bg-slate-50 p-6 rounded-3xl border border-slate-100 group hover:border-indigo-100 transition-colors">
                  <div className="flex justify-between items-center mb-4">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 bg-indigo-100 text-indigo-600 rounded-full flex items-center justify-center font-black text-xs">{rev.usuario_nombre.charAt(0)}</div>
                        <span className="font-black text-slate-900 uppercase text-xs tracking-wider">{rev.usuario_nombre}</span>
                    </div>
                    <div className="text-amber-400 font-bold text-sm tracking-widest">{'★'.repeat(rev.rating)}</div>
                  </div>
                  <p className="text-slate-600 font-medium italic">"{rev.comentario}"</p>
                </div>
              )) : (
                <div className="text-center py-12 bg-slate-50 rounded-[2.5rem] border border-dashed border-slate-200">
                    <p className="text-slate-400 font-black uppercase text-[10px] tracking-widest italic opacity-60">Todavía no hay reseñas. Sé el primero.</p>
                </div>
              )}
            </div>

            {session ? (
              <div className="bg-indigo-50 p-8 rounded-[2.5rem] border border-indigo-100">
                <h4 className="text-lg font-black uppercase tracking-tighter text-indigo-900 mb-6 text-center italic">¿Visitaste este lugar?</h4>
                <div className="flex justify-center gap-2 mb-8">
                  {[1,2,3,4,5].map(star => (
                    <button key={star} onClick={() => setRating(star)} className={`text-4xl transition-all hover:scale-125 ${rating >= star ? 'text-amber-400 drop-shadow-sm' : 'text-slate-300'}`}>★</button>
                  ))}
                </div>
                <textarea value={comment} onChange={(e) => setComment(e.target.value)} placeholder="Contanos tu experiencia..." className="w-full p-6 rounded-3xl border-none outline-none focus:ring-4 focus:ring-indigo-200 font-medium text-slate-700 mb-6 min-h-[140px] shadow-inner" />
                <button onClick={handleRatingSubmit} disabled={submitting} className="w-full py-5 bg-indigo-600 text-white rounded-3xl font-black uppercase tracking-widest text-xs shadow-indigo hover:bg-indigo-700 active:scale-95 disabled:opacity-50 transition-all">
                  {submitting ? 'Enviando opinión...' : 'Publicar Calificación'}
                </button>
              </div>
            ) : (
              <div className="bg-slate-100 p-8 rounded-[2.5rem] text-center border border-slate-200">
                <p className="text-slate-400 font-black uppercase text-[10px] tracking-widest">Iniciá sesión para dejar una opinión</p>
              </div>
            )}
          </section>
        </div>

        {/* Barra Lateral de Contacto */}
        <div className="space-y-8">
          <div className="bg-slate-900 p-8 md:p-10 rounded-[3.5rem] shadow-2xl text-white sticky top-24">
            <h3 className="text-xl font-black uppercase tracking-widest mb-10 border-b border-white/10 pb-5 italic">Contacto Directo</h3>
            <div className="space-y-6">
              <a href={`https://wa.me/${comercio.whatsapp}`} target="_blank" className="flex items-center gap-5 bg-green-500/10 p-6 rounded-[2.5rem] border border-green-500/20 hover:bg-green-500 hover:text-white transition-all group">
                <div className="w-12 h-12 bg-green-500 text-white rounded-2xl flex items-center justify-center text-2xl font-bold shadow-lg shadow-green-500/20 group-hover:bg-white group-hover:text-green-600 transition-colors">W</div>
                <div>
                  <p className="text-[10px] font-black uppercase opacity-60 tracking-widest">WhatsApp</p>
                  <p className="font-black text-lg">Chatear ahora</p>
                </div>
              </a>
              
              <a href={`tel:${comercio.whatsapp}`} className="flex items-center gap-5 bg-indigo-500/10 p-6 rounded-[2.5rem] border border-indigo-500/20 hover:bg-indigo-500 hover:text-white transition-all group">
                <div className="w-12 h-12 bg-indigo-500 text-white rounded-2xl flex items-center justify-center text-2xl font-bold shadow-lg shadow-indigo-500/20 group-hover:bg-white group-hover:text-indigo-600 transition-colors">T</div>
                <div>
                  <p className="text-[10px] font-black uppercase opacity-60 tracking-widest">Llamada</p>
                  <p className="font-black text-lg">{comercio.whatsapp}</p>
                </div>
              </a>

              <div className="bg-white/5 p-8 rounded-[2.5rem] border border-white/10 mt-8">
                <h4 className="text-[10px] font-black uppercase tracking-widest mb-6 opacity-60 border-b border-white/5 pb-2">Información del Local</h4>
                <div className="text-sm font-bold space-y-4">
                    <div className="flex flex-col gap-1">
                        <span className="text-slate-500 text-[8px] uppercase tracking-widest font-black">Dirección</span>
                        <span className="text-indigo-400 font-black">{comercio.direccion || 'No especificada'}</span>
                    </div>
                    <div className="flex flex-col gap-1">
                        <span className="text-slate-500 text-[8px] uppercase tracking-widest font-black">Localidad</span>
                        <span className="text-slate-100 font-black">{appData.ciudades.find(c => c.id === comercio.ciudadId)?.nombre}</span>
                    </div>
                    <div className="pt-4 mt-4 border-t border-white/5 flex items-center gap-3">
                        <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
                        <span className="text-green-500 text-[10px] font-black uppercase tracking-widest">Local Verificado</span>
                    </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ComercioDetailPage;
