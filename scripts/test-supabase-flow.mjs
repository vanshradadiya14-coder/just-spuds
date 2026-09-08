import { createClient } from '@supabase/supabase-js'

const url = 'https://djismufvsorifvtsojmr.supabase.co'
const key = 'sb_publishable_CzY7QOf8A4WGHAzmFiLvMg_JrojyTjA'

const supabase = createClient(url, key)

async function testFullFlow() {
  console.log('Testing full database read/write flow...')

  const testOrder = {
    id: `test-order-${Date.now()}`,
    short_id: '#TEST-101',
    store_id: 'just_spuds',
    status: 'placed',
    fulfilment: 'pickup',
    customer: {
      name: 'Verification Bot',
      phone: '07123456789',
      email: 'test@justspuds.co.uk',
    },
    lines: [
      {
        lineId: 'test-line-1',
        productId: 'classic-cheddar-beans',
        name: 'The Great British Classic',
        base: 545,
        extras: [],
        sauces: [],
        meal: false,
        qty: 1,
      },
    ],
    payment: {
      method: 'card',
      status: 'paid',
      subtotal: 545,
      deliveryFee: 0,
      serviceFee: 49,
      tip: 0,
      discount: 0,
      total: 594,
    },
    estimated_delivery_time: '15 mins',
    eta_minutes: 15,
    timeline: [
      {
        status: 'placed',
        timestamp: new Date().toLocaleTimeString(),
        title: 'Order Placed',
        description: 'Test order created via automated check',
      },
    ],
  }

  // 1. Insert test order
  const { error: insertError } = await supabase.from('orders').insert(testOrder)
  if (insertError) {
    console.error('Insert error:', insertError)
    return
  }
  console.log('✅ 1. Insert order: SUCCESS!')

  // 2. Fetch it back
  const { data: fetchResult, error: fetchError } = await supabase
    .from('orders')
    .select('*')
    .eq('id', testOrder.id)
    .single()

  if (fetchError || !fetchResult) {
    console.error('Fetch error:', fetchError)
    return
  }
  console.log('✅ 2. Fetch order back: SUCCESS! Customer:', fetchResult.customer.name, '| Status:', fetchResult.status)

  // 3. Update order (like kitchen accepting it)
  const { error: updateError } = await supabase
    .from('orders')
    .update({ status: 'baking' })
    .eq('id', testOrder.id)

  if (updateError) {
    console.error('Update error:', updateError)
    return
  }
  console.log('✅ 3. Kitchen update status to "baking": SUCCESS!')

  // 4. Delete the test order so database stays clean
  const { error: deleteError } = await supabase
    .from('orders')
    .delete()
    .eq('id', testOrder.id)

  if (deleteError) {
    console.error('Delete error:', deleteError)
    return
  }
  console.log('✅ 4. Cleaned up test order: SUCCESS!')
  console.log('\n🎉 ALL TESTS PASSED: Supabase is 100% operational for Just Spuds!')
}

testFullFlow()
