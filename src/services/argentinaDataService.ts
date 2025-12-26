
import { Provincia, Ciudad } from '../types';

const GEOREF_API = 'https://apis.datos.gob.ar/georef/api';

/**
 * Robust fetch with timeout to prevent hanging on slow government APIs
 */
async function fetchWithTimeout(resource: string, options: RequestInit & { timeout?: number } = {}) {
  const { timeout = 8000 } = options;
  
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeout);
  
  try {
    const response = await fetch(resource, {
      ...options,
      signal: controller.signal
    });
    clearTimeout(id);
    return response;
  } catch (error) {
    clearTimeout(id);
    throw error;
  }
}

export const fetchArgentinaProvincias = async (): Promise<Provincia[]> => {
  try {
    const res = await fetchWithTimeout(`${GEOREF_API}/provincias?campos=id,nombre&orden=nombre`);
    if (!res.ok) throw new Error(`API Provincias status: ${res.status}`);
    const data = await res.json();
    return data.provincias.map((p: any) => ({
      id: String(p.id).padStart(2, '0'),
      nombre: p.nombre
    }));
  } catch (error) {
    console.error("Error fetching Provincias from Georef API:", error);
    // Return minimal set of provinces as fallback to avoid empty UI
    return [
      { id: '02', nombre: 'CABA' }, 
      { id: '06', nombre: 'Buenos Aires' },
      { id: '14', nombre: 'Córdoba' },
      { id: '82', nombre: 'Santa Fe' }
    ];
  }
};

export const fetchArgentinaCiudades = async (provinciaId: string): Promise<Ciudad[]> => {
  if (!provinciaId) return [];
  const cleanId = String(provinciaId).padStart(2, '0');

  try {
    const res = await fetchWithTimeout(`${GEOREF_API}/localidades?provincia=${cleanId}&max=1000&campos=id,nombre,centroide&orden=nombre`);
    if (!res.ok) throw new Error(`API Localidades status: ${res.status}`);
    const data = await res.json();
    
    return (data.localidades || []).map((item: any) => ({
      id: String(item.id),
      nombre: item.nombre,
      provinciaId: cleanId,
      lat: item.centroide?.lat,
      lng: item.centroide?.lon
    }));
  } catch (error) {
    console.error(`Error fetching cities for province ${cleanId}:`, error);
    // Return empty array instead of throwing to prevent "Failed to fetch" crashing the UI
    return [];
  }
};
