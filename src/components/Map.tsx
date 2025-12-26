
import React, { useEffect, useRef } from 'react';
import { Comercio } from '../types';

declare const L: any;

interface MapProps {
  comercios: Comercio[];
  center?: [number, number];
  zoom?: number;
  onLocationSelect?: (lat: number, lng: number) => void;
  isPicker?: boolean;
}

const Map: React.FC<MapProps> = ({ 
  comercios, 
  center = [-34.6037, -58.3816], 
  zoom = 12, 
  onLocationSelect, 
  isPicker = false 
}) => {
  const mapRef = useRef<any>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const markersGroup = useRef<any>(null);
  const pickerMarkerRef = useRef<any>(null);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    // Inicialización suave
    const timer = setTimeout(() => {
      if (!containerRef.current) return;
      
      const map = L.map(containerRef.current, {
        zoomControl: true,
        scrollWheelZoom: true,
        attributionControl: false
      }).setView(center, zoom);

      // Usamos el estilo Voyager de CartoDB que es el que te gustaba
      L.tileLayer('https://{s}.tile.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png').addTo(map);

      markersGroup.current = L.layerGroup().addTo(map);
      mapRef.current = map;

      // Forzar recalculo de tamaño
      const observer = new ResizeObserver(() => map.invalidateSize());
      observer.observe(containerRef.current);

      if (isPicker) {
        map.on('click', (e: any) => {
          const { lat, lng } = e.latlng;
          if (onLocationSelect) onLocationSelect(lat, lng);
        });
      }

      return () => observer.disconnect();
    }, 100);

    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (!mapRef.current) return;

    if (isPicker) {
      if (pickerMarkerRef.current) mapRef.current.removeLayer(pickerMarkerRef.current);
      
      pickerMarkerRef.current = L.marker(center, {
        draggable: true,
        icon: L.divIcon({
          className: 'custom-picker-pin',
          html: `<div class="flex items-center justify-center w-12 h-12 bg-red-600 rounded-full border-4 border-white shadow-2xl text-white text-2xl animate-bounce">📍</div>`,
          iconSize: [48, 48],
          iconAnchor: [24, 48]
        })
      }).addTo(mapRef.current);

      pickerMarkerRef.current.on('dragend', (e: any) => {
        const { lat, lng } = e.target.getLatLng();
        if (onLocationSelect) onLocationSelect(lat, lng);
      });

      mapRef.current.setView(center, zoom);
    } else {
      // Limpiar marcadores viejos
      markersGroup.current.clearLayers();
      
      // Añadir marcadores de comercios
      comercios.forEach(c => {
        if (c.latitude && c.longitude) {
          const icon = L.divIcon({
            className: 'comercio-marker',
            html: `<div class="w-10 h-10 bg-indigo-600 rounded-2xl border-2 border-white shadow-lg flex items-center justify-center text-white text-xl hover:scale-110 transition-transform">🏪</div>`,
            iconSize: [40, 40],
            iconAnchor: [20, 40]
          });
          
          L.marker([c.latitude, c.longitude], { icon })
            .addTo(markersGroup.current)
            .bindPopup(`
              <div class="p-3 font-sans min-w-[150px]">
                <b class="text-indigo-600 uppercase text-xs block mb-1">${c.nombre}</b>
                <span class="text-[10px] text-slate-400 font-bold leading-tight">${c.direccion || ''}</span>
              </div>
            `);
        }
      });
      
      // Mover cámara a la posición filtrada
      if (center) {
        mapRef.current.setView(center, zoom, { animate: true });
      }
    }
  }, [comercios, center, zoom, isPicker]);

  return (
    <div className="w-full h-full relative group bg-slate-100">
      <div ref={containerRef} className="w-full h-full" style={{ zIndex: 1 }} />
      {isPicker && (
        <div className="absolute top-6 left-1/2 -translate-x-1/2 z-10 bg-white/95 backdrop-blur-md px-6 py-2 rounded-full shadow-2xl border border-indigo-100 pointer-events-none">
           <p className="text-[11px] font-black text-indigo-600 uppercase tracking-widest flex items-center gap-2">
             <span className="animate-pulse">👆</span> Marcá la ubicación de tu local
           </p>
        </div>
      )}
    </div>
  );
};

export default Map;
