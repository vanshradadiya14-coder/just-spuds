export const PICKUP_TIMES = [
  'ASAP (~15 mins)',
  'In 30 mins',
  '12:00 PM',
  '1:00 PM',
  '2:30 PM',
  '4:00 PM',
  '5:30 PM',
  '7:00 PM',
  '8:30 PM',
  '9:30 PM',
]

export const DELIVERY_TIMES = [
  'ASAP (~25-35 mins)',
  'In 45 mins',
  '12:30 PM',
  '1:30 PM',
  '3:00 PM',
  '5:00 PM',
  '6:30 PM',
  '8:00 PM',
  '9:00 PM',
]

export const SCHEDULE_TIMES = [
  '11:00 AM',
  '11:30 AM',
  '12:00 PM',
  '12:30 PM',
  '1:00 PM',
  '1:30 PM',
  '2:00 PM',
  '2:30 PM',
  '3:00 PM',
  '3:30 PM',
  '4:00 PM',
  '4:30 PM',
  '5:00 PM',
  '5:30 PM',
  '6:00 PM',
  '6:30 PM',
  '7:00 PM',
  '7:30 PM',
  '8:00 PM',
  '8:30 PM',
  '9:00 PM',
  '9:30 PM',
]

export function getScheduleDates(): string[] {
  const days: string[] = ['Today', 'Tomorrow']
  const now = new Date()
  for (let i = 2; i <= 6; i++) {
    const d = new Date(now)
    d.setDate(d.getDate() + i)
    days.push(d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' }))
  }
  return days
}
