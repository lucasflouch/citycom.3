import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

// Definimos los headers CORS directamente aquí para que el código sea 
// 100% compatible con el Editor Online de Supabase sin dependencias externas.
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// Declaramos Deno para evitar errores de TypeScript en el entorno local (VS Code),
// aunque en el entorno de Edge Functions (Deno) ya existe globalmente.
declare const Deno: any;

console.log(`Función create-mercadopago-preference iniciada.`)

serve(async (req: Request) => {
  // 1. Manejo de Pre-flight (OPTIONS) para CORS
  // Esto permite que el navegador verifique los permisos antes de enviar la petición real.
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    // 2. Inicializar cliente Supabase con el contexto del usuario (Auth)
    // Pasamos el header de Authorization para respetar las políticas RLS de la base de datos.
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      {
        global: {
          headers: { Authorization: req.headers.get('Authorization')! },
        },
      }
    )

    // 3. Parsear el cuerpo de la solicitud que viene del frontend
    const { planId, userId } = await req.json()

    if (!planId || !userId) {
      throw new Error('Faltan parámetros requeridos: planId o userId.')
    }

    // 4. Validar que el Plan existe en la Base de Datos y obtener su precio real
    const { data: planData, error: planError } = await supabaseClient
      .from('subscription_plans')
      .select('nombre, precio')
      .eq('id', planId)
      .single()

    if (planError) throw new Error(`Error al buscar plan: ${planError.message}`)
    if (!planData) throw new Error(`El plan con id "${planId}" no existe.`)
    if (planData.precio <= 0) throw new Error('Este plan es gratuito, no requiere pago.')

    // 5. Configuración de Mercado Pago (Access Token desde Secrets)
    const mpAccessToken = Deno.env.get('MERCADOPAGO_ACCESS_TOKEN')
    if (!mpAccessToken) {
      throw new Error('MERCADOPAGO_ACCESS_TOKEN no configurado en Supabase Secrets.')
    }

    const siteUrl = Deno.env.get('SITE_URL') ?? 'http://localhost:5173' // Fallback para dev local
    
    // 6. Construcción del objeto de Preferencia para Mercado Pago
    const preferencePayload = {
      items: [
        {
          id: planId,
          title: `Suscripción Guía Comercial - Plan ${planData.nombre}`,
          description: `Acceso mensual al plan ${planData.nombre}`,
          quantity: 1,
          currency_id: 'ARS',
          unit_price: Number(planData.precio),
        },
      ],
      payer: {
        email: 'test_user_123456@testuser.com', // En producción, usar email real del usuario si está disponible
      },
      back_urls: {
        success: `${siteUrl}/dashboard?status=success`,
        failure: `${siteUrl}/pricing?status=failure`,
        pending: `${siteUrl}/pricing?status=pending`,
      },
      auto_return: 'approved',
      external_reference: JSON.stringify({ userId, planId }), // Metadata para identificar la transacción luego
      statement_descriptor: "GUIA COMERCIAL",
    }

    // 7. Llamada a la API de Mercado Pago para crear la preferencia
    const mpResponse = await fetch('https://api.mercadopago.com/checkout/preferences', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${mpAccessToken}`,
      },
      body: JSON.stringify(preferencePayload),
    })

    if (!mpResponse.ok) {
      const errorData = await mpResponse.json()
      console.error('Error MP:', errorData)
      throw new Error(`Mercado Pago API Error: ${mpResponse.statusText}`)
    }

    const responseData = await mpResponse.json()

    // 8. Respuesta Exitosa al frontend con el link de pago (init_point)
    return new Response(JSON.stringify({ init_point: responseData.init_point }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    })

  } catch (error: any) {
    console.error('Error en Edge Function:', error.message)
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 400, // Bad Request
    })
  }
})