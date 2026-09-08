import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import './index.css'

// Automatically clear any lingering legacy demo sessions or demo orders from client storage
if (typeof window !== 'undefined') {
  try {
    const userStr = localStorage.getItem('just_spuds_auth_user_v1')
    if (userStr && (userStr.includes('sarah.m@example.com') || userStr.includes('usr-cust-1') || userStr.includes('Demo'))) {
      localStorage.removeItem('just_spuds_auth_user_v1')
    }
    const orderStr = localStorage.getItem('just_spuds_orders_v1')
    if (orderStr && (orderStr.includes('ord-demo-') || orderStr.includes('sarah.m@example.com'))) {
      const parsed = JSON.parse(orderStr)
      const clean = Array.isArray(parsed)
        ? parsed.filter((o: any) => !o.id?.startsWith('ord-demo-') && o.customer?.email !== 'sarah.m@example.com')
        : []
      localStorage.setItem('just_spuds_orders_v1', JSON.stringify(clean))
    }
    const activeOrder = localStorage.getItem('just_spuds_active_order_id')
    if (activeOrder && activeOrder.startsWith('ord-demo-')) {
      localStorage.removeItem('just_spuds_active_order_id')
    }
    const placedOrders = localStorage.getItem('just_spuds_customer_placed_order_ids_v1')
    if (placedOrders && placedOrders.includes('ord-demo-')) {
      localStorage.removeItem('just_spuds_customer_placed_order_ids_v1')
    }
  } catch {
    // Ignore storage issues
  }
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
