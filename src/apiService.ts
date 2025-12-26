import { AppData, Usuario, Comercio, PublicUser, Opinion, AnalyticsData, AdminAnalyticsData, Conversation, ChatMessage } from './types';

// En producción (Render), el frontend y backend están en el mismo dominio, así que usamos rutas relativas (/api).
// En desarrollo local con Vite, el proxy en vite.config.ts maneja esto.
const BASE_URL = '/api'; 

const SESSION_STORAGE_KEY = 'guiaComercialSession';
const ADMIN_EMAIL = 'admin@guiacomercial.com';

// --- HELPERS ---

const handleResponse = async (response: Response) => {
  if (!response.ok) {
    let error;
    try {
      const errorData = await response.json();
      const message = errorData.error || `El servidor respondió con un error ${response.status}.`;
      error = new Error(message);
    } catch (e) {
      const message = `Error ${response.status}: ${response.statusText}.`;
      error = new Error(message);
    }
    throw error;
  }

  try {
    if (response.status === 204) {
      return {};
    }
    return await response.json();
  } catch (e) {
    throw new Error("La respuesta del servidor fue exitosa pero el formato no es válido.");
  }
};

// --- SESIÓN DE USUARIO (CLIENT-SIDE) ---

export const logoutUser = (): void => {
    localStorage.removeItem(SESSION_STORAGE_KEY);
    sessionStorage.removeItem(SESSION_STORAGE_KEY);
};

export const getCurrentUserFromSession = (): Usuario | null => {
    try {
        const sessionData = localStorage.getItem(SESSION_STORAGE_KEY) || sessionStorage.getItem(SESSION_STORAGE_KEY);
        if (sessionData) {
            return JSON.parse(sessionData);
        }
        return null;
    } catch (error) {
        console.error("Error al leer la sesión:", error);
        logoutUser();
        return null;
    }
};

const saveUserToSession = (user: Omit<Usuario, 'password'>, keepSession: boolean): void => {
    const storage = keepSession ? localStorage : sessionStorage;
    storage.setItem(SESSION_STORAGE_KEY, JSON.stringify(user));
};

export const isAdmin = (email: string): boolean => {
    return email === ADMIN_EMAIL;
};

// --- LLAMADAS A LA API DEL SERVIDOR ---

export const getData = async (): Promise<AppData> => {
  const response = await fetch(`${BASE_URL}/data`);
  return handleResponse(response);
};

export const registerUser = async (userData: Omit<Usuario, 'id'>): Promise<{ message: string; email: string; verificationCode: string; }> => {
  const response = await fetch(`${BASE_URL}/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(userData),
  });
  return handleResponse(response);
};

export const verifyCode = async (email: string, code: string): Promise<Omit<Usuario, 'password'>> => {
  const response = await fetch(`${BASE_URL}/verify`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, code }),
  });
  return handleResponse(response);
};

export const loginUser = async (credentials: Pick<Usuario, 'email' | 'password'>, keepSession: boolean): Promise<Omit<Usuario, 'password'>> => {
  const response = await fetch(`${BASE_URL}/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(credentials),
  });
  const user = await handleResponse(response);
  saveUserToSession(user, keepSession);
  localStorage.setItem('lastLoggedInEmail', user.email);
  return user;
};

export const updateUser = async (userId: string, dataToUpdate: Pick<Usuario, 'nombre' | 'telefono'>): Promise<Omit<Usuario, 'password'>> => {
  const response = await fetch(`${BASE_URL}/usuarios/${userId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(dataToUpdate),
  });
  const updatedUser = await handleResponse(response);
  
  const currentUser = getCurrentUserFromSession();
  if (currentUser) {
      const sessionKept = !!localStorage.getItem(SESSION_STORAGE_KEY);
      saveUserToSession({ ...currentUser, ...updatedUser }, sessionKept);
  }

  return updatedUser;
};

export const createComercio = async (newComercioData: Omit<Comercio, 'id'>): Promise<Comercio> => {
  const response = await fetch(`${BASE_URL}/comercios`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(newComercioData),
  });
  return handleResponse(response);
};

export const updateComercio = async (updatedComercio: Comercio): Promise<Comercio> => {
  const response = await fetch(`${BASE_URL}/comercios/${updatedComercio.id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(updatedComercio),
  });
  return handleResponse(response);
};

export const deleteComercio = async (comercioId: string): Promise<{ message: string }> => {
  const response = await fetch(`${BASE_URL}/comercios/${comercioId}`, {
    method: 'DELETE',
  });
  return handleResponse(response);
};

export const resetData = async (): Promise<{ message: string }> => {
  const response = await fetch(`${BASE_URL}/reset-data`, {
    method: 'POST',
  });
  logoutUser();
  localStorage.removeItem('publicUserSession');
  return handleResponse(response);
};

export interface OpinionData {
    usuarioId: string;
    usuarioNombre: string;
    rating: number;
    texto?: string;
}

export const addOpinion = async (comercioId: string, opinionData: OpinionData): Promise<Comercio> => {
    const response = await fetch(`${BASE_URL}/comercios/${comercioId}/opinar`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(opinionData),
    });
    return handleResponse(response);
};

export const addOpinionReply = async (comercioId: string, opinionId: string, texto: string, usuarioId: string): Promise<Comercio> => {
    const response = await fetch(`${BASE_URL}/comercios/${comercioId}/opiniones/${opinionId}/responder`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ texto, usuarioId }),
    });
    return handleResponse(response);
};

export const toggleOpinionLike = async (comercioId: string, opinionId: string, usuarioId: string): Promise<Comercio> => {
    const response = await fetch(`${BASE_URL}/comercios/${comercioId}/opiniones/${opinionId}/like`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ usuarioId }),
    });
    return handleResponse(response);
};

export interface ReporteData {
    comercioId: string;
    motivo: string;
    detalles?: string;
    usuarioId?: string;
}

export const submitReporte = async (reporteData: ReporteData): Promise<{ message: string }> => {
    const response = await fetch(`${BASE_URL}/reportes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(reporteData),
    });
    return handleResponse(response);
};

// --- PUBLIC USER API CALLS ---

export const registerPublicUser = async (userData: Omit<PublicUser, 'id' | 'favorites' | 'history'>): Promise<PublicUser> => {
  const response = await fetch(`${BASE_URL}/public-register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(userData),
  });
  return handleResponse(response);
};

export const loginPublicUser = async (credentials: Pick<PublicUser, 'email' | 'password'>): Promise<PublicUser> => {
  const response = await fetch(`${BASE_URL}/public-login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(credentials),
  });
  const user = await handleResponse(response);
  localStorage.setItem('publicUserSession', JSON.stringify(user));
  return user;
};

export const updatePublicUser = async (userData: PublicUser): Promise<PublicUser> => {
  const response = await fetch(`${BASE_URL}/public-users/${userData.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(userData),
  });
  const updatedUser = await handleResponse(response);
  localStorage.setItem('publicUserSession', JSON.stringify(updatedUser)); 
  return updatedUser;
};

// --- PAYMENTS API CALLS ---
export const createPaymentPreference = async (comercioId: string, newLevel: number): Promise<{ preferenceId: string }> => {
    const response = await fetch(`${BASE_URL}/payments/create-preference`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ comercioId, newLevel }),
    });
    return handleResponse(response);
};

export const confirmPayment = async (comercioId: string, newLevel: number): Promise<{ message: string }> => {
    const response = await fetch(`${BASE_URL}/payments/confirm-payment`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ comercioId, newLevel }),
    });
    return handleResponse(response);
};

// --- ANALYTICS API CALLS ---

export const trackEvent = async (comercioId: string, eventType: 'view' | 'whatsapp_click' | 'website_click', usuarioId?: string): Promise<void> => {
    try {
        await fetch(`${BASE_URL}/track`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ comercioId, eventType, usuarioId }),
        });
    } catch (error) {
        console.error("Error al registrar evento de tracking:", error);
    }
};

export const getAnalyticsForComercio = async (comercioId: string): Promise<AnalyticsData> => {
    const response = await fetch(`${BASE_URL}/analytics?comercioId=${comercioId}`);
    return handleResponse(response);
};

export const getAdminAnalytics = async (adminEmail: string): Promise<AdminAnalyticsData> => {
    const response = await fetch(`${BASE_URL}/analytics?userEmail=${adminEmail}`);
    return handleResponse(response);
};

// --- MARKETING API CALLS ---

export const sendMonthlySummary = async (adminEmail: string): Promise<{ message: string }> => {
    const response = await fetch(`${BASE_URL}/marketing/send-summary`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ adminEmail }),
    });
    return handleResponse(response);
};

// --- CHAT API CALLS ---

export const startOrGetConversation = async (clienteId: string, comercioId: string): Promise<Conversation> => {
    const response = await fetch(`${BASE_URL}/conversations/start`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clienteId, comercioId }),
    });
    return handleResponse(response);
};

export const getConversations = async (userId: string): Promise<Conversation[]> => {
    const response = await fetch(`${BASE_URL}/conversations/${userId}`);
    return handleResponse(response);
};

export const getMessagesForConversation = async (conversationId: string): Promise<ChatMessage[]> => {
    const response = await fetch(`${BASE_URL}/messages/${conversationId}`);
    return handleResponse(response);
};

export const sendMessage = async (conversationId: string, senderId: string, content: string): Promise<ChatMessage> => {
    const response = await fetch(`${BASE_URL}/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ conversationId, senderId, content }),
    });
    return handleResponse(response);
};

export const markConversationAsRead = async (conversationId: string, userId: string): Promise<{ message: string }> => {
    const response = await fetch(`${BASE_URL}/conversations/${conversationId}/read`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId }),
    });
    return handleResponse(response);
};