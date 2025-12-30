
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
    const { payment_id } = await req.json()
    if (!payment_id) throw new Error('Falta el payment_id')

    // 1. Verificar pago con MP
    const mpResponse = await fetch(`https://api.mercadopago.com/v1/payments/${payment_id}`, {
      headers: { 
          Authorization: `Bearer ${Deno.env.get('MERCADOPAGO_ACCESS_TOKEN')}` 
      }
    })
    
    if (!mpResponse.ok) throw new Error('Error al consultar API de Mercado Pago')
    const paymentData = await mpResponse.json()

    if (paymentData.status !== 'approved') {
        throw new Error(`El pago no está aprobado. Estado: ${paymentData.status}`)
    }

    // 2. Extraer Metadata
    const { userId, planId } = JSON.parse(paymentData.external_reference)
    const amountPaid = paymentData.transaction_amount;

    if (!userId || !planId) throw new Error('Metadata inválida')

    // 3. Inicializar Supabase Admin
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    // 4. Calcular nueva fecha de vencimiento (HOY + 30 DÍAS)
    const now = new Date();
    const expiresAt = new Date(now.setDate(now.getDate() + 30));

    // 5. Actualizar Perfil (Plan + Vencimiento)
    const { error: updateError } = await supabaseAdmin
      .from('profiles')
      .update({ 
        plan_id: planId,
        plan_expires_at: expiresAt.toISOString()
      })
      .eq('id', userId)

    if (updateError) throw updateError

    // 6. Insertar en Historial de Suscripciones
    const { error: historyError } = await supabaseAdmin
      .from('subscription_history')
      .insert({
        user_id: userId,
        plan_id: planId,
        amount: amountPaid,
        payment_id: String(payment_id),
        status: 'active',
        start_date: new Date().toISOString(),
        end_date: expiresAt.toISOString()
      })

    if (historyError) {
        // No bloqueamos el flujo principal si falla el historial, pero lo logueamos
        console.error("Error al guardar historial:", historyError);
    }

    return new Response(JSON.stringify({ success: true, planId, expiresAt }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200
    })

  } catch (error: any) {
    console.error('Error en Verify Payment:', error.message)
    return new Response(JSON.stringify({ success: false, error: error.message }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }
})
