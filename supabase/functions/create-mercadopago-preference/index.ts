
import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

declare const Deno: any;

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      {
        global: {
          headers: { Authorization: req.headers.get('Authorization')! },
        },
      }
    )

    const { planId, userId, origin } = await req.json()

    if (!planId || !userId) {
      throw new Error('Faltan parámetros requeridos: planId o userId.')
    }

    const { data: planData, error: planError } = await supabaseClient
      .from('subscription_plans')
      .select('nombre, precio')
      .eq('id', planId)
      .single()

    if (planError) throw new Error(`Error al buscar plan: ${planError.message}`)
    if (!planData) throw new Error(`El plan con id "${planId}" no existe.`)
    if (planData.precio <= 0) throw new Error('Este plan es gratuito, no requiere pago.')

    const mpAccessToken = Deno.env.get('MERCADOPAGO_ACCESS_TOKEN')
    if (!mpAccessToken) {
      throw new Error('MERCADOPAGO_ACCESS_TOKEN no configurado en Supabase Secrets.')
    }

    // Usamos el 'origin' enviado desde el cliente si existe, si no, fallback a SITE_URL
    const baseUrl = origin || Deno.env.get('SITE_URL') || 'http://localhost:5173'
    
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
        email: 'test_user_123456@testuser.com', 
      },
      back_urls: {
        success: `${baseUrl}/dashboard?status=success`, // Los params extra los pone MP automáticamente
        failure: `${baseUrl}/pricing?status=failure`,
        pending: `${baseUrl}/pricing?status=pending`,
      },
      auto_return: 'approved',
      external_reference: JSON.stringify({ userId, planId }), 
      statement_descriptor: "GUIA COMERCIAL",
    }

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

    return new Response(JSON.stringify({ init_point: responseData.init_point }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    })

  } catch (error: any) {
    console.error('Error en Edge Function:', error.message)
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 400, 
    })
  }
})
