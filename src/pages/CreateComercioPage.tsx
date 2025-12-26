
import React, { useState, useEffect } from 'react';
import { AuthSession } from '@supabase/supabase-js';
import { Page, PageValue, AppData, Ciudad, Comercio } from '../types';
import { supabase } from '../supabaseClient';
import { fetchArgentinaCiudades } from '../services/argentinaDataService';
import Map from '../components/Map';

interface CreateComercioPageProps {
  session: AuthSession;
  onNavigate: (page: PageValue) => void;
  data: AppData;
  onComercioCreated: () => Promise<void>;
  editingComercio?: Comercio | null;
}

const CreateComercioPage: React.FC<CreateComercioPageProps> = ({ session, onNavigate, data, onComercioCreated, editingComercio }) => {
  const [loading, setLoading] = useState(false);
  const [loadingCiudades, setLoadingCiudades] = useState(false);
  
  const [nombre, setNombre] = useState('');
  const [descripcion, setDescripcion] = useState('');
  const [whatsapp, setWhatsapp] = useState('');
  const [direccion, setDireccion] = useState('');
  const [provinciaId, setProvinciaId] = useState('');
  const [ciudadId, setCiudadId] = useState('');
  const [rubroId, setRubroId] = useState('');
  const [imagenes, setImagenes] = useState<string[]>([]);
  const [localidades, setLocalidades] = useState<Ciudad[]>([]);
  const [coords, setCoords] = useState<[number, number] | null>(null);

  // 1. Efecto de Geolocalización (Solo si es nuevo)
  useEffect(() => {
    if (!editingComercio && navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          const lat = pos.coords.latitude;
          const lng = pos.coords.longitude;
          setCoords([lat, lng]);
          reverseGeocode(lat, lng);
        },
        (err) => {
          console.warn("GPS Denegado:", err);
          setCoords([-34.6037, -58.3816]); // Fallback: Obelisco
        },
        { enableHighAccuracy: true }
      );
    }
  }, [editingComercio]);

  // 2. Reverse Geocoding: De mapa a texto
  const reverseGeocode = async (lat: number, lng: number) => {
    try {
      const res = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}`);
      const data = await res.json();
      if (data && data.address) {
        const road = data.address.road || '';
        const houseNum = data.address.house_number || '';
        const suburb = data.address.suburb || data.address.city_district || '';
        const formatted = `${road} ${houseNum}${road && houseNum ? ',' : ''} ${suburb}`.trim();
        setDireccion(formatted || data.display_name.split(',')[0]);
      }
    } catch (e) { console.error("Error Georef:", e); }
  };

  useEffect(() => {
    if (editingComercio) {
      setNombre(editingComercio.nombre || '');
      setDescripcion(editingComercio.descripcion || '');
      setWhatsapp(editingComercio.whatsapp || '');
      setDireccion(editingComercio.direccion || '');
      setRubroId(editingComercio.rubroId || '');
      setImagenes(editingComercio.imagenes || []);
      setCiudadId(editingComercio.ciudadId || '');
      if (editingComercio.latitude && editingComercio.longitude) {
        setCoords([editingComercio.latitude, editingComercio.longitude]);
      }
      const city = data.ciudades.find(c => String(c.id) === String(editingComercio.ciudadId));
      if (city) setProvinciaId(city.provinciaId);
    }
  }, [editingComercio, data.ciudades]);

  useEffect(() => {
    const syncLocalidades = async () => {
      if (!provinciaId) return setLocalidades([]);
      setLoadingCiudades(true);
      try {
        const fromApi = await fetchArgentinaCiudades(provinciaId);
        setLocalidades(fromApi);
      } catch (err) { console.error(err); } finally { setLoadingCiudades(false); }
    };
    syncLocalidades();
  }, [provinciaId]);

  const handleLocationSelect = (lat: number, lng: number) => {
    setCoords([lat, lng]);
    reverseGeocode(lat, lng);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;
    Array.from(files).forEach((file: File) => {
      const reader = new FileReader();
      reader.onloadend = () => {
        setImagenes(prev => [...prev, reader.result as string].slice(-5));
      };
      reader.readAsDataURL(file);
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    // VALIDACIÓN ESTRICTA DE UBICACIÓN
    if (!coords) {
      return alert('¡Error! No hemos podido detectar tu ubicación. Por favor, hacé clic en el mapa para marcar dónde queda tu comercio.');
    }

    if (!ciudadId || !rubroId) {
      return alert('Faltan datos obligatorios: Seleccioná localidad y rubro.');
    }
    
    setLoading(true);
    try {
      const payload = {
        nombre, 
        descripcion, 
        whatsapp, 
        direccion,
        imagen_url: imagenes[0] || 'https://images.unsplash.com/photo-1534723452862-4c874018d66d?w=400',
        imagenes: imagenes,
        rubro_id: rubroId,
        ciudad_id: ciudadId,
        usuario_id: session.user.id,
        latitude: coords[0],
        longitude: coords[1]
      };

      const { error } = editingComercio 
        ? await supabase.from('comercios').update(payload).eq('id', editingComercio.id)
        : await supabase.from('comercios').insert([payload]);

      if (error) throw error;
      
      onComercioCreated().catch(err => console.error("Error refresh:", err));
      
      setTimeout(() => {
        onNavigate(Page.Dashboard);
      }, 500);

    } catch (err: any) {
      console.error("Error al guardar:", err);
      alert('Hubo un problema al guardar: ' + (err.message || 'Error de red'));
      setLoading(false); // IMPORTANTE: Liberar el botón si hay error
    }
  };

  return (
    <div className="max-w-6xl mx-auto py-4 px-4 animate-in fade-in duration-1000">
      <div className="bg-white rounded-[4rem] shadow-soft overflow-hidden border border-slate-100">
        <div className="p-10 bg-indigo-600 text-white flex justify-between items-center">
          <div>
            <h2 className="text-3xl font-black uppercase tracking-tighter">
              {editingComercio ? 'Actualizar Información' : 'Publicar mi Comercio'}
            </h2>
            <p className="text-white/60 text-[10px] font-black uppercase tracking-[0.3em] mt-1">Sincronizado con Supabase DB</p>
          </div>
          <button 
            type="button" 
            onClick={() => onNavigate(Page.Dashboard)} 
            className="font-black hover:scale-110 transition-transform bg-white/20 px-6 py-3 rounded-2xl text-[10px] uppercase tracking-widest"
          >
            &larr; Volver
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-10 space-y-12">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-16">
            
            {/* Columna Izquierda: Información General */}
            <div className="space-y-8">
              <div>
                <label className="block text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] mb-4 italic">Galería de Fotos (Máximo 5)</label>
                <div className="flex flex-wrap gap-4">
                  {imagenes.map((img, i) => (
                    <div key={i} className="relative w-24 h-24 rounded-3xl overflow-hidden border border-slate-100 shadow-md group">
                      <img src={img} className="w-full h-full object-cover" />
                      <button 
                        type="button" 
                        onClick={() => setImagenes(prev => prev.filter((_, idx) => idx !== i))} 
                        className="absolute inset-0 bg-red-500/80 text-white opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center font-black text-xs"
                      >
                        BORRAR
                      </button>
                    </div>
                  ))}
                  {imagenes.length < 5 && (
                    <label className="w-24 h-24 flex flex-col items-center justify-center border-4 border-dashed border-slate-100 rounded-3xl cursor-pointer hover:bg-indigo-50 hover:border-indigo-200 text-slate-300 transition-all">
                      <span className="text-4xl font-light">+</span>
                      <input type="file" accept="image/*" multiple onChange={handleFileChange} className="hidden" />
                    </label>
                  )}
                </div>
              </div>

              <div className="space-y-5">
                <div>
                  <label className="block text-[9px] font-black text-slate-400 uppercase tracking-widest ml-3 mb-2">Nombre del Negocio</label>
                  <input type="text" required value={nombre} onChange={e => setNombre(e.target.value)} className="w-full p-5 bg-slate-50 rounded-[2rem] border-none focus:ring-4 focus:ring-indigo-100 font-bold shadow-inner text-lg" placeholder="Ej: Pizzería Los Amigos" />
                </div>

                <div className="grid grid-cols-2 gap-5">
                  <div>
                    <label className="block text-[9px] font-black text-slate-400 uppercase tracking-widest ml-3 mb-2">Provincia</label>
                    <select required value={provinciaId} onChange={e => setProvinciaId(e.target.value)} className="w-full p-5 bg-slate-50 rounded-[2rem] border-none font-bold text-sm shadow-inner cursor-pointer appearance-none">
                      <option value="">Seleccionar...</option>
                      {data.provincias.map(p => <option key={p.id} value={p.id}>{p.nombre}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="block text-[9px] font-black text-slate-400 uppercase tracking-widest ml-3 mb-2">Localidad</label>
                    <select required value={ciudadId} onChange={e => setCiudadId(e.target.value)} disabled={!provinciaId} className="w-full p-5 bg-slate-50 rounded-[2rem] border-none font-bold text-sm shadow-inner disabled:opacity-30 cursor-pointer appearance-none">
                      <option value="">{loadingCiudades ? '⏳ Buscando...' : 'Localidad...'}</option>
                      {localidades.map(c => <option key={c.id} value={c.id}>{c.nombre}</option>)}
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-5">
                  <div>
                    <label className="block text-[9px] font-black text-slate-400 uppercase tracking-widest ml-3 mb-2">Rubro Comercial</label>
                    <select required value={rubroId} onChange={e => setRubroId(e.target.value)} className="w-full p-5 bg-slate-50 rounded-[2rem] border-none font-bold text-sm shadow-inner cursor-pointer appearance-none">
                      <option value="">Rubro...</option>
                      {data.rubros.map(r => <option key={r.id} value={r.id}>{r.icon} {r.nombre}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="block text-[9px] font-black text-slate-400 uppercase tracking-widest ml-3 mb-2">WhatsApp de Ventas</label>
                    <input type="tel" required value={whatsapp} onChange={e => setWhatsapp(e.target.value)} placeholder="Ej: 1123456789" className="w-full p-5 bg-slate-50 rounded-[2rem] border-none font-bold text-sm shadow-inner" />
                  </div>
                </div>
              </div>
              
              <div>
                <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3 italic ml-3">Descripción / Horarios / Servicios</label>
                <textarea value={descripcion} onChange={e => setDescripcion(e.target.value)} placeholder="Contanos qué ofrecés, días y horarios de atención, si hacés envíos, etc..." className="w-full p-8 bg-slate-50 rounded-[2.5rem] border-none min-h-[160px] font-medium shadow-inner focus:ring-4 focus:ring-indigo-100 resize-none" />
              </div>
            </div>

            {/* Columna Derecha: Mapa Interactivo */}
            <div className="flex flex-col">
              <label className="block text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] mb-4 italic">Ubicación Geográfica Precisa</label>
              <div className="flex-1 min-h-[500px] rounded-[3.5rem] overflow-hidden shadow-soft border-8 border-white bg-slate-100 relative">
                {coords ? (
                  <Map 
                      comercios={[]} 
                      isPicker={true} 
                      center={coords} 
                      zoom={17} 
                      onLocationSelect={handleLocationSelect} 
                  />
                ) : (
                  <div className="flex flex-col items-center justify-center h-full gap-4 text-slate-400">
                    <div className="animate-spin rounded-full h-10 w-10 border-t-4 border-indigo-600"></div>
                    <p className="font-black text-[10px] uppercase tracking-widest">Iniciando Mapa GPS...</p>
                  </div>
                )}
              </div>
              
              <div className="bg-indigo-50 p-7 rounded-[2.5rem] border border-indigo-100 shadow-sm mt-8 relative">
                <label className="block text-[8px] font-black text-indigo-400 uppercase tracking-widest mb-2">Dirección Detectada (Podés ajustarla manualmente)</label>
                <div className="flex items-center gap-4">
                   <div className="text-2xl">🇦🇷</div>
                   <input 
                      type="text" 
                      required 
                      placeholder="Calle y altura exacta..." 
                      value={direccion} 
                      onChange={e => setDireccion(e.target.value)} 
                      className="w-full bg-transparent outline-none font-black text-indigo-900 placeholder:text-indigo-200 text-xl" 
                   />
                </div>
              </div>
              <p className="text-[10px] text-slate-400 font-bold italic text-center mt-6 px-10">
                 💡 <b>Consejo:</b> Cuanto más preciso sea el punto en el mapa, más fácil será para tus clientes encontrarte en la guía.
              </p>
            </div>
          </div>

          <button 
            type="submit" 
            disabled={loading} 
            className="w-full py-9 bg-indigo-600 text-white rounded-[3.5rem] font-black uppercase tracking-[0.5em] hover:bg-indigo-700 transition-all shadow-indigo active:scale-[0.98] disabled:opacity-50 text-base border-b-8 border-indigo-900 hover:border-b-4"
          >
            {loading ? 'PUBLICANDO EN LA RED...' : editingComercio ? 'CONFIRMAR CAMBIOS' : 'LANZAR MI COMERCIO'}
          </button>
        </form>
      </div>
    </div>
  );
};

export default CreateComercioPage;
