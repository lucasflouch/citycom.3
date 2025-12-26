
export interface Provincia {
  id: string;
  nombre: string;
}

export interface Ciudad {
  id: string;
  nombre: string;
  provinciaId: string;
  lat?: number;
  lng?: number;
}

export interface Rubro {
  id: string;
  nombre: string;
  icon: string;
}

export interface Profile {
  id: string;
  nombre?: string;
  email?: string;
  telefono?: string;
  avatar_url?: string;
}

export interface Usuario {
  id: string;
  email: string;
  password?: string;
  nombre?: string;
  telefono?: string;
}

export interface PublicUser {
  id: string;
  email: string;
  password?: string;
  nombre?: string;
  favorites?: string[];
  history?: string[];
}

export interface Review {
  id: string;
  comercio_id: string;
  usuario_id: string;
  usuario_nombre: string;
  comentario: string;
  rating: number;
  created_at: string;
}

// Added missing Opinion interface
export interface Opinion {
  id: string;
  usuarioId: string;
  usuarioNombre: string;
  rating: number;
  texto: string;
  fecha: string;
  likes?: string[];
  reply?: {
    texto: string;
    usuarioId: string;
    fecha: string;
  };
}

export interface Comercio {
  id: string;
  nombre: string;
  imagenUrl: string;
  imagenes?: string[];
  rubroId: string;
  ciudadId: string;
  usuarioId: string;
  whatsapp: string;
  descripcion?: string;
  direccion?: string;
  rating?: number;
  reviewCount?: number;
  reviews?: Review[];
  latitude?: number;
  longitude?: number;
}

export interface Banner {
  id: string;
  comercioId: string;
  imagenUrl: string;
  venceEl: string;
}

// Added missing Analytics and Chat related interfaces
export interface AnalyticsData {
  views: number;
  whatsappClicks: number;
  websiteClicks: number;
  history?: { date: string; views: number }[];
}

export interface AdminAnalyticsData {
  totalComercios: number;
  totalUsuarios: number;
  totalViews: number;
  totalWhatsAppClicks: number;
  recentActivity: any[];
}

export interface Conversation {
  id: string;
  clienteId: string;
  comercioId: string;
  lastMessage?: string;
  lastUpdate: string;
  unreadCount?: number;
}

export interface ChatMessage {
  id: string;
  conversationId: string;
  senderId: string;
  content: string;
  timestamp: string;
  read: boolean;
}

export interface AppData {
  provincias: Provincia[];
  ciudades: Ciudad[];
  rubros: Rubro[];
  comercios: Comercio[];
  banners: Banner[];
  usuarios: Profile[];
  pagos: any[];
}

export enum Page {
  Home = 'Home',
  Auth = 'Auth',
  Dashboard = 'Dashboard',
  CreateComercio = 'CreateComercio',
  EditComercio = 'EditComercio',
  ComercioDetail = 'ComercioDetail'
}

export type PageValue = Page;
