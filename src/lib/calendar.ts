import { addDays, addMinutes, addWeeks, differenceInMinutes, format, isWeekend, startOfDay, startOfWeek } from 'date-fns'
import { vi } from 'date-fns/locale'
import type { ScheduleEvent } from '../types'

export const weekStartOf = (date: Date) => startOfWeek(date, { weekStartsOn: 1 })
export const weekDays = (weekStart: Date) => Array.from({ length: 7 }, (_, i) => addDays(weekStart, i))
export const dayKey = (date: Date) => format(date, 'yyyy-MM-dd')
export const dayLabel = (date: Date) => format(date, 'EEE', { locale: vi }).replace('.', '')
export const dateLabel = (date: Date) => format(date, 'd')
export const weekLabel = (weekStart: Date) => `${format(weekStart, 'd MMM', { locale: vi })} – ${format(addDays(weekStart, 6), 'd MMM yyyy', { locale: vi })}`
export const timeLabel = (date: Date) => format(date, 'HH:mm')
export const durationLabel = (start: Date, end: Date) => {
  const mins = differenceInMinutes(end, start)
  if (mins < 60) return `${mins}m`
  const h = Math.floor(mins / 60)
  const m = mins % 60
  return m ? `${h}h${m}` : `${h}h`
}

export const toDateTimeLocal = (date: Date) => format(date, "yyyy-MM-dd'T'HH:mm")
export const fromDateTimeLocal = (value: string) => new Date(value)

const overlaps = (start: Date, end: Date, event: ScheduleEvent, uid: string) => {
  const blocksUser = event.status === 'confirmed' && (event.ownerType === 'both' || event.ownerUid === uid)
  return blocksUser && event.startAt < end && event.endAt > start
}

export type CommonSlot = { start: Date; end: Date }

export function findCommonSlots(events: ScheduleEvent[], memberIds: string[], weekStart: Date, minMinutes = 90): CommonSlot[] {
  if (memberIds.length < 2) return []
  const slots: CommonSlot[] = []
  for (const day of weekDays(weekStart)) {
    const windowStart = addMinutes(startOfDay(day), (isWeekend(day) ? 10 : 18) * 60)
    const windowEnd = addMinutes(startOfDay(day), 23 * 60)
    let cursor = windowStart
    while (addMinutes(cursor, minMinutes) <= windowEnd) {
      const end = addMinutes(cursor, minMinutes)
      const freeForAll = memberIds.every(uid => !events.some(event => overlaps(cursor, end, event, uid)))
      if (freeForAll) {
        let expandedEnd = end
        while (addMinutes(expandedEnd, 30) <= windowEnd && memberIds.every(uid => !events.some(event => overlaps(cursor, addMinutes(expandedEnd, 30), event, uid)))) {
          expandedEnd = addMinutes(expandedEnd, 30)
        }
        slots.push({ start: cursor, end: expandedEnd })
        break
      }
      cursor = addMinutes(cursor, 30)
    }
  }
  return slots.slice(0, 4)
}

export const shiftEventOneWeek = (event: ScheduleEvent) => ({
  ...event,
  startAt: addWeeks(event.startAt, 1),
  endAt: addWeeks(event.endAt, 1),
})
