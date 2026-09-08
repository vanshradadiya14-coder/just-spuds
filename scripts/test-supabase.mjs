import { createClient } from '@supabase/supabase-js'

const url = 'https://djismufvsorifvtsojmr.supabase.co'
const key = 'sb_publishable_CzY7QOf8A4WGHAzmFiLvMg_JrojyTjA'

const supabase = createClient(url, key)

async function testConnection() {
  console.log('Testing Supabase connection...')
  try {
    const { data, error } = await supabase.from('orders').select('*').limit(5)
    if (error) {
      console.error('Supabase query error:', error)
      return
    }
    console.log('SUCCESS: Supabase connected successfully!')
    console.log(`Retrieved ${data.length} orders from the database.`)
    console.log('Orders:', JSON.stringify(data, null, 2))
  } catch (err) {
    console.error('Network or client error:', err)
  }
}

testConnection()
