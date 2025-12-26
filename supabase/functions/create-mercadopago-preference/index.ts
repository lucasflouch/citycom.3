// supabase/functions/create-mercadopago-preference/index.ts

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

// Cabeceras CORS incluidas directamente para un despliegue manual más sencillo
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// Declaración del objeto global Deno para el entorno de Supabase
declare const Deno: {
  env: {
    get(key: string): string | undefined;
  };
};

console.log(`Función create-mercadopago-preference iniciada.`);

serve(async (req: Request) => {
  // Manejo de la solicitud pre-vuelo CORS
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: req.headers.get('Authorization')! } } }
    )

    const { planId, userId } = await req.json()

    if (!planId || !userId) {
      throw new Error('Faltan parámetros requeridos: planId o userId.')
    }

    // 1. Obtener detalles del plan desde la base de datos de Supabase
    const { data: planData, error: planError } = await supabaseClient
      .from('subscription_plans')
      .select('nombre, precio')
      .eq('id', planId)
      .single()

    if (planError) throw planError
    if (!planData) throw new Error(`Plan con id "${planId}" no fue encontrado.`)
    if (planData.precio <= 0) throw new Error('Este plan es gratuito y no requiere pago.')

    // 2. Obtener el Access Token de Mercado Pago desde los secretos de Supabase
    const accessToken = Deno.env.get('MERCADOPAGO_ACCESS_TOKEN')
    if (!accessToken) throw new Error('La variable secreta MERCADOPAGO_ACCESS_TOKEN no está configurada.')
    
    // 3. Obtener la URL del sitio para las redirecciones
    const siteUrl = Deno.env.get('SITE_URL');
    if (!siteUrl) throw new Error('La variable secreta SITE_URL no está configurada.');

    const preferencePayload = {
      items: [
        {
          title: `Suscripción Guía Comercial - Plan ${planData.nombre}`,
          quantity: 1,
          unit_price: Number(planData.precio),
          currency_id: 'ARS',
        },
      ],
      back_urls: {
        success: `${siteUrl}`, // Redirige al sitio desplegado en Vercel
        failure: `${siteUrl}`,
        pending: `${siteUrl}`,
      },
      auto_return: 'approved',
      // ¡CRÍTICO! Esta URL la configuraremos en la Fase 3
      // notification_url: `${Deno.env.get('SUPABASE_URL')}/functions/v1/handle-mercadopago-webhook`,
      external_reference: JSON.stringify({ userId, planId }),
    }

    // 4. Llamar a la API de Mercado Pago para crear la preferencia
    const mpResponse = await fetch('https://api.mercadopago.com/checkout/preferences', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify(preferencePayload),
    })

    if (!mpResponse.ok) {
      const errorBody = await mpResponse.json();
      console.error('Error de Mercado Pago:', errorBody);
      throw new Error('No se pudo crear la preferencia en Mercado Pago.')
    }

    const responseData = await mpResponse.json()

    // 5. Devolver el link de pago al frontend
    return new Response(JSON.stringify({ init_point: responseData.init_point }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    })
  } catch (error) {
    console.error('Error en la Edge Function:', error.message)
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 500,
    })
  }
})
