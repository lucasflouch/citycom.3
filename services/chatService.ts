
import { supabase } from '../supabaseClient';
import { Conversation, Message, Comercio, Profile, AppData } from '../types';

/**
 * Encuentra una conversación existente entre un cliente y un comercio, o crea una nueva si no existe.
 */
export const findOrCreateConversation = async (clienteId: string, comercio: Comercio): Promise<Conversation | null> => {
  try {
    const { data: existing, error: findError } = await supabase
      .from('conversations')
      .select('*')
      .eq('cliente_id', clienteId)
      .eq('comercio_id', comercio.id)
      .maybeSingle();

    if (findError) throw findError;
    if (existing) return existing as Conversation;

    const { data: newConv, error: createError } = await supabase
      .from('conversations')
      .insert({
        cliente_id: clienteId,
        comercio_id: comercio.id,
        participant_ids: [clienteId, comercio.usuarioId],
      })
      .select()
      .single();

    if (createError) throw createError;
    return newConv as Conversation;
  } catch (error) {
    console.error('Error en findOrCreateConversation:', error);
    return null;
  }
};

/**
 * Obtiene todas las conversaciones de un usuario, enriqueciéndolas con los datos de la otra parte y los mensajes no leídos.
 */
export const getConversationsForUser = async (userId: string, appData: AppData): Promise<(Conversation & { otherParty: Profile | Comercio })[]> => {
    try {
        const { data: conversations, error } = await supabase
            .from('conversations')
            .select('*')
            .contains('participant_ids', [userId])
            .order('updated_at', { ascending: false });

        if (error) throw error;
        if (!conversations || conversations.length === 0) return [];

        // 1. Obtener perfiles de clientes para conversaciones donde el usuario actual es el comercio.
        const clientIdsToFetch = conversations
            .filter(conv => conv.cliente_id !== userId) // Filtrar solo donde soy el comercio
            .map(conv => conv.cliente_id);

        let clientProfiles: Profile[] = [];
        if (clientIdsToFetch.length > 0) {
            const { data: profilesData, error: profilesError } = await supabase
                .from('profiles')
                .select('id, nombre, email') // Pedimos solo los campos necesarios
                .in('id', [...new Set(clientIdsToFetch)]); // Usamos Set para evitar duplicados
            
            if (profilesError) throw profilesError;
            clientProfiles = profilesData as Profile[];
        }
        // Creamos un mapa para búsqueda rápida O(1)
        const profilesMap = new Map<string, Profile>(clientProfiles.map(p => [p.id, p]));

        // 2. Calcular mensajes no leídos
        const conversationIds = conversations.map(c => c.id);
        const { data: unreadMessages, error: unreadError } = await supabase
            .from('messages')
            .select('conversation_id')
            .in('conversation_id', conversationIds)
            .eq('is_read', false)
            .neq('sender_id', userId);

        if (unreadError) throw unreadError;

        const unreadCounts = (unreadMessages || []).reduce((acc, msg) => {
            acc[msg.conversation_id] = (acc[msg.conversation_id] || 0) + 1;
            return acc;
        }, {} as Record<string, number>);

        // 3. Unir toda la información
        const enrichedConversations = conversations.map(conv => {
            const isMeClient = conv.cliente_id === userId;
            
            let otherParty: Profile | Comercio | undefined;
            if (isMeClient) {
                // Si soy el cliente, la otra parte es el comercio.
                otherParty = appData.comercios.find(c => c.id === conv.comercio_id);
            } else {
                // Si soy el comercio, la otra parte es un cliente. Buscamos en nuestro mapa de perfiles.
                otherParty = profilesMap.get(conv.cliente_id);
            }

            return { 
                ...conv, 
                otherParty: otherParty || { id: '?', nombre: 'Usuario no encontrado' },
                unreadCount: unreadCounts[conv.id] || 0
            };
        });

        return enrichedConversations as (Conversation & { otherParty: Profile | Comercio })[];
    } catch (error) {
        console.error('Error fetching conversations:', error);
        return [];
    }
};

/**
 * Marca todos los mensajes de una conversación como leídos para un usuario específico.
 */
export const markConversationAsRead = async (conversationId: string, userId: string): Promise<void> => {
    try {
        const { error } = await supabase
            .from('messages')
            .update({ is_read: true })
            .eq('conversation_id', conversationId)
            .neq('sender_id', userId);
        
        if (error) throw error;
    } catch (err) {
        console.error("Error marking messages as read:", err);
    }
};


/**
 * Obtiene todos los mensajes de una conversación específica.
 */
export const getMessagesForConversation = async (conversationId: string): Promise<Message[]> => {
  try {
    const { data, error } = await supabase
      .from('messages')
      .select('*')
      .eq('conversation_id', conversationId)
      .order('created_at', { ascending: true });
    
    if (error) throw error;
    return data as Message[];
  } catch (error) {
    console.error('Error fetching messages:', error);
    return [];
  }
};

/**
 * Envía un nuevo mensaje en una conversación.
 */
export const sendMessage = async (conversationId: string, senderId: string, content: string): Promise<Message | null> => {
  try {
    // Insertar el mensaje
    const { data: messageData, error: messageError } = await supabase
      .from('messages')
      .insert({
        conversation_id: conversationId,
        sender_id: senderId,
        content: content,
        is_read: false // Aseguramos que los nuevos mensajes se marquen como no leídos
      })
      .select()
      .single();

    if (messageError) throw messageError;

    // Actualizar el timestamp y el último mensaje de la conversación
    const { error: convError } = await supabase
      .from('conversations')
      .update({
        last_message: content,
        updated_at: new Date().toISOString(),
      })
      .eq('id', conversationId);
    
    if (convError) throw convError;

    return messageData as Message;
  } catch (error) {
    console.error('Error sending message:', error);
    return null;
  }
};
