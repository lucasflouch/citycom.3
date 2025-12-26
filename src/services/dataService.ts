
import { supabase } from '../supabaseClient';
import { AppData, Comercio, Ciudad, Banner, Review, Provincia } from '../types';

const mapReview = (db: any): Review => ({
  id: String(db.id),
  comercio_id: String(db.comercio_id),
  usuario_id: String(db.usuario_id),
  usuario_nombre: db.usuario_nombre || 'Usuario Anónimo',
  comentario: db.comentario || '',
  rating: Number(db.rating) || 0,
  created_at: db.created_at || new Date().toISOString()
});

const mapComercio = (db: any, reviews: any[] = []): Comercio => {
  const comercioReviews = reviews.filter(r => String(r.comercio_id) === String(db.id)).map(mapReview);
  const avgRating = comercioReviews.length > 0 
    ? comercioReviews.reduce((acc, curr) => acc + curr.rating, 0) / comercioReviews.length 
    : 0;

  return {
    id: String(db.id),
    nombre: db.nombre || 'Sin nombre',
    imagenUrl: db.imagen_url || 'https://images.unsplash.com/photo-1534723452862-4c874018d66d?w=400',
    imagenes: Array.isArray(db.imagenes) ? db.imagenes : [],
    rubroId: String(db.rubro_id),
    ciudadId: String(db.ciudad_id),
    usuarioId: String(db.usuario_id),
    whatsapp: String(db.whatsapp || ''),
    descripcion: db.descripcion || '',
    direccion: db.direccion || '',
    rating: Number(avgRating.toFixed(1)),
    reviewCount: comercioReviews.length,
    reviews: comercioReviews
  };
};

export const fetchAppData = async (): Promise<AppData | null> => {
  try {
    // Helper to fetch table data with individual error handling to prevent "Failed to fetch" global crashes
    const fetchSafe = async (tableName: string, orderField?: string) => {
      try {
        let query = supabase.from(tableName).select('*');
        if (orderField) query = query.order(orderField);
        const { data, error } = await query;
        if (error) {
          console.error(`Error loading table ${tableName}:`, error);
          return [];
        }
        return data || [];
      } catch (err) {
        console.error(`Network error loading table ${tableName}:`, err);
        return [];
      }
    };

    const [provs, ciuds, rubs, coms, bans, revs] = await Promise.all([
      fetchSafe('provincias', 'nombre'),
      fetchSafe('ciudades', 'nombre'),
      fetchSafe('rubros', 'nombre'),
      fetchSafe('comercios'),
      fetchSafe('banners'),
      fetchSafe('reviews')
    ]);

    // If we have no comercios and no provincias, something might be fundamentally wrong with the connection
    if (provs.length === 0 && coms.length === 0) {
      console.warn("Fetched empty data from Supabase. Check connectivity or project status.");
    }

    return {
      provincias: provs.map((p: any) => ({ id: String(p.id), nombre: p.nombre })),
      ciudades: ciuds.map((c: any) => ({
        id: String(c.id),
        nombre: c.nombre,
        provinciaId: String(c.provincia_id)
      })),
      rubros: rubs.map((r: any) => ({ id: String(r.id), nombre: r.nombre, icon: r.icon || '📍' })),
      comercios: coms.map((c: any) => mapComercio(c, revs)),
      banners: bans.map((b: any) => ({
        id: String(b.id),
        comercioId: String(b.comercio_id),
        imagenUrl: b.imagen_url,
        venceEl: b.vence_el
      })),
      usuarios: [],
      pagos: []
    };
  } catch (error) {
    console.error("Critical error in fetchAppData:", error);
    return null;
  }
};
