
import React, { useState, useMemo, useCallback, useEffect } from 'react';
import { Comercio, Page, PageValue, AppData } from '../types';
import FilterBar from '../components/FilterBar';
import BusinessCard from '../components/BusinessCard';
import Map from '../components/Map';
import { fetchArgentinaCiudades } from '../services/argentinaDataService';

interface HomePageProps {
  onNavigate: (page: PageValue, comercio?: Comercio) => void;
  data: AppData;
}

const HomePage: React.FC<HomePageProps> = ({ onNavigate, data }) => {
  const [filters, setFilters] = useState({ provinciaId: '', ciudadId: '', rubroId: '' });
  const [viewMode, setViewMode] = useState<'grid' | 'map'>('grid');
  const [currentCityCoords, setCurrentCityCoords] = useState<[number, number] | null>(null);

  const handleFilterChange = useCallback((newFilters: { provinciaId: string; ciudadId: string; rubroId: string }) => {
    setFilters(newFilters);
  }, []);

  // Sincronizar coordenadas del mapa con la ciudad seleccionada
  useEffect(() => {
    const updateCoords = async () => {
      if (filters.ciudadId && filters.provinciaId) {
        try {
          // Primero intentamos buscar en los datos locales por si ya tienen coords
          const localCity = data.ciudades.find(c => String(c.id) === String(filters.ciudadId));
          if (localCity?.lat && localCity?.lng) {
            setCurrentCityCoords([localCity.lat, localCity.lng]);
            return;
          }

          // Si no, consultamos la API de Georef para centrar el mapa correctamente
          const ciudadesApi = await fetchArgentinaCiudades(filters.provinciaId);
          const ciudadActual = ciudadesApi.find(c => String(c.id) === String(filters.ciudadId));
          if (ciudadActual?.lat && ciudadActual?.lng) {
            setCurrentCityCoords([ciudadActual.lat, ciudadActual.lng]);
          }
        } catch (err) {
          console.warn("No se pudieron obtener las coordenadas para el mapa");
        }
      } else {
        setCurrentCityCoords(null);
      }
    };
    updateCoords();
  }, [filters.ciudadId, filters.provinciaId, data.ciudades]);

  const filteredComercios = useMemo(() => {
    return (data.comercios || []).filter(comercio => {
      // Simplificamos: Si hay filtro de ciudad, comparamos ID directo. 
      // No dependemos de que la ciudad esté en data.ciudades para mostrar el comercio.
      const provinciaMatch = !filters.provinciaId || (data.ciudades.find(c => String(c.id) === String(comercio.ciudadId))?.provinciaId === filters.provinciaId);
      const ciudadMatch = !filters.ciudadId || String(comercio.ciudadId) === String(filters.ciudadId);
      const rubroMatch = !filters.rubroId || String(comercio.rubroId) === String(filters.rubroId);

      return provinciaMatch && ciudadMatch && rubroMatch;
    });
  }, [data.comercios, data.ciudades, filters]);

  // Centro por defecto: Obelisco si no hay nada seleccionado, o centro de Argentina si es vista general
  const mapCenter = useMemo((): [number, number] => {
    if (currentCityCoords) return currentCityCoords;
    if (filters.provinciaId) return [-34.6037, -58.3816]; // Default a CABA si hay provincia pero no ciudad
    return [-38.4161, -63.6167]; // Centro geográfico de Argentina
  }, [currentCityCoords, filters.provinciaId]);

  const mapZoom = useMemo(() => {
    if (filters.ciudadId) return 14;
    if (filters.provinciaId) return 8;
    return 4;
  }, [filters.ciudadId, filters.provinciaId]);

  // Cambiamos la key del mapa para forzar su reinicio total al cambiar de ciudad principal
  const mapKey = `map-v2-${filters.provinciaId}-${filters.ciudadId}`;

  return (
    <div className="space-y-12 pb-20">
      <section>
        <div className="flex flex-col md:flex-row justify-between items-start md:items-end mb-8 gap-4">
            <div>
                <h2 className="text-4xl font-black text-slate-900 tracking-tighter mb-2">Guía de Comercios</h2>
                <p className="text-slate-400 font-medium italic">Encontrá lo que necesitás cerca de tuyo.</p>
            </div>
            
            <div className="flex bg-white p-1.5 rounded-2xl shadow-soft border border-slate-100">
                <button onClick={() => setViewMode('grid')} className={`px-6 py-3 rounded-xl text-[10px] font-black uppercase tracking-[0.2em] transition-all ${viewMode === 'grid' ? 'bg-indigo-600 text-white shadow-indigo' : 'text-slate-400 hover:text-slate-600'}`}>Lista</button>
                <button onClick={() => setViewMode('map')} className={`px-6 py-3 rounded-xl text-[10px] font-black uppercase tracking-[0.2em] transition-all ${viewMode === 'map' ? 'bg-indigo-600 text-white shadow-indigo' : 'text-slate-400 hover:text-slate-600'}`}>Mapa 📍</button>
            </div>
        </div>

        <FilterBar 
          provincias={data.provincias || []} 
          ciudades={data.ciudades || []} 
          rubros={data.rubros || []}
          onFilterChange={handleFilterChange}
        />

        {viewMode === 'map' ? (
            <div className="animate-in fade-in duration-500">
                <div className="w-full h-[600px] rounded-[3rem] overflow-hidden border-8 border-white shadow-soft relative bg-slate-100">
                    <Map 
                      key={mapKey} 
                      comercios={filteredComercios} 
                      center={mapCenter} 
                      zoom={mapZoom} 
                    />
                </div>
                <p className="mt-4 text-center text-[10px] text-slate-400 font-black uppercase tracking-[0.3em] italic">
                   {filteredComercios.length} comercios encontrados en esta zona
                </p>
            </div>
        ) : (
            filteredComercios.length > 0 ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6 animate-in slide-in-from-bottom-6 duration-700">
                    {filteredComercios.map(comercio => {
                        const ciudad = data.ciudades.find(c => String(c.id) === String(comercio.ciudadId));
                        const rubro = data.rubros.find(r => String(r.id) === String(comercio.rubroId));
                        return (
                            <div key={comercio.id} onClick={() => onNavigate(Page.ComercioDetail, comercio)} className="cursor-pointer">
                                <BusinessCard 
                                    comercio={comercio} 
                                    ciudad={ciudad || { id: comercio.ciudadId, nombre: 'Ubicación Verificada', provinciaId: '' }} 
                                    provincia={{id:'', nombre:''}} 
                                    rubro={rubro || { id: '', nombre: 'Comercio', icon: '🏪' }} 
                                />
                            </div>
                        );
                    })}
                </div>
            ) : (
                <div className="text-center py-24 px-4 bg-white rounded-[3.5rem] shadow-soft border border-slate-50">
                    <div className="text-7xl mb-6">🏜️</div>
                    <h3 className="text-2xl font-black text-slate-800 tracking-tighter uppercase">Sin resultados en esta zona</h3>
                    <p className="text-slate-400 mt-2 font-medium max-w-xs mx-auto italic">Asegurate de haber seleccionado la provincia y localidad correctas.</p>
                </div>
            )
        )}
      </section>
    </div>
  );
};

export default HomePage;
