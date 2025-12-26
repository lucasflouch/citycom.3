
import { supabase } from '../supabaseClient';
import { AppData, Comercio, Review, SubscriptionPlan, Profile, SubRubro, Rubro, Ciudad, Provincia } from '../types';

const mapReview = (db: any): Review => ({
  id: String(db.id),
  comercio_id: String(db.comercio_id),
  usuario_id: String(db.usuario_id),
  usuario_nombre: db.usuario_nombre || 'Usuario',
  comentario: db.comentario || '',
  rating: Number(db.rating) || 0,
  created_at: db.created_at || new Date().toISOString()
});

const mapComercio = (db: any, reviewsForComercio: Review[] = [], ownerPlan?: SubscriptionPlan): Comercio => {
  const avgRating = reviewsForComercio.length > 0 
    ? reviewsForComercio.reduce((acc, curr) => acc + curr.rating, 0) / reviewsForComercio.length 
    : 0;

  return {
    id: String(db.id),
    nombre: db.nombre || '',
    slug: db.slug || '',
    imagenUrl: db.imagen_url || '',
    imagenes: Array.isArray(db.imagenes) ? db.imagenes : [],
    rubroId: String(db.rubro_id),
    subRubroId: String(db.sub_rub_id),
    ciudadId: String(db.ciudad_id),
    usuarioId: String(db.usuario_id),
    whatsapp: String(db.whatsapp || ''),
    descripcion: db.descripcion || '',
    direccion: db.direccion || '',
    latitude: db.latitude ? Number(db.latitude) : undefined,
    longitude: db.longitude ? Number(db.longitude) : undefined,
    
    isVerified: !!db.is_verified,
    isWaVerified: !!db.is_wa_verified,
    planId: String(db.plan_id || 'free'),
    
    rating: Number(avgRating.toFixed(1)),
    reviewCount: reviewsForComercio.length,
    reviews: reviewsForComercio,

    // Se inyecta el plan del dueño para usarlo en la lógica de la UI
    plan: ownerPlan
  };
};

export const fetchAppData = async (): Promise<AppData | null> => {
  try {
    const fetchSafe = async (tableName: string, orderField?: string) => {
      let query = supabase.from(tableName).select('*');
      if (orderField) query = query.order(orderField);
      const { data, error } = await query;
      if (error) {
        console.warn(`Error en tabla ${tableName}:`, error.message);
        return [];
      }
      return data || [];
    };

    const [provs, ciuds, rubs, subRubs, plans, coms, revs, profiles] = await Promise.all([
      fetchSafe('provincias', 'nombre'),
      fetchSafe('ciudades', 'nombre'),
      fetchSafe('rubros', 'nombre'),
      fetchSafe('sub_rubros', 'nombre'),
      fetchSafe('subscription_plans', 'precio'),
      fetchSafe('comercios'),
      fetchSafe('reviews'),
      fetchSafe('profiles') // Obtenemos los perfiles de los usuarios
    ]);
    
    // --- MAPAS PARA BÚSQUEDA EFICIENTE O(1) ---
    const reviewsByComercioId = new Map<string, Review[]>();
    revs.forEach(review => {
      const key = String(review.comercio_id);
      if (!reviewsByComercioId.has(key)) reviewsByComercioId.set(key, []);
      reviewsByComercioId.get(key)!.push(mapReview(review));
    });

    const profilesMap = new Map<string, Profile>(profiles.map(p => [String(p.id), p as Profile]));
    const plansMap = new Map<string, SubscriptionPlan>(plans.map(p => [String(p.id), {
        id: String(p.id),
        nombre: p.nombre,
        precio: Number(p.precio),
        limiteImagenes: Number(p.limite_imagenes),
        limitePublicaciones: Number(p.limite_publicaciones || 10), // Fallback para el plan gratis
        tienePrioridad: !!p.tiene_prioridad,
        tieneChat: !!p.tiene_chat
    }]));
    
    const defaultPlan = Array.from(plansMap.values()).find(p => p.nombre.toLowerCase() === 'gratis');

    return {
      provincias: provs.map((p: any): Provincia => ({ id: String(p.id), nombre: p.nombre })),
      ciudades: ciuds.map((c: any): Ciudad => ({
        id: String(c.id),
        nombre: c.nombre,
        provinciaId: String(c.provincia_id)
      })),
      rubros: rubs.map((r: any): Rubro => ({ 
        id: String(r.id), 
        nombre: r.nombre, 
        icon: r.icon || '📍',
        slug: r.slug || r.nombre.toLowerCase().replace(/\s+/g, '-')
      })),
      subRubros: subRubs.map((sr: any): SubRubro => ({
        id: String(sr.id),
        rubroId: String(sr.rubro_id),
        nombre: sr.nombre,
        slug: sr.slug || sr.nombre.toLowerCase().replace(/\s+/g, '-')
      })),
      plans: Array.from(plansMap.values()),
      // Mapear comercios y enriquecerlos con el plan de su dueño
      comercios: coms.map((c: any) => {
        const ownerProfile = profilesMap.get(String(c.usuario_id));
        const ownerPlan = ownerProfile ? plansMap.get(ownerProfile.plan_id) : defaultPlan;
        return mapComercio(c, reviewsByComercioId.get(String(c.id)), ownerPlan);
      }),
      banners: [] // banners no se usa actualmente.
    };
  } catch (error) {
    console.error("Error crítico en fetchAppData:", error);
    return null;
  }
};
