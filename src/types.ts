export type OwnerType = 'personal' | 'both'
export type EventStatus = 'proposed' | 'confirmed'

export type Member = {
  uid: string
  displayName: string
  email: string
  photoURL?: string
}

export type Couple = {
  id: string
  createdBy: string
  members: Record<string, Member>
}

export type ScheduleEvent = {
  id: string
  title: string
  notes: string
  category: string
  startAt: Date
  endAt: Date
  ownerType: OwnerType
  ownerUid?: string
  createdBy: string
  status: EventStatus
  acceptedBy?: string
  copiedFrom?: string
}

export type EventDraft = {
  title: string
  notes: string
  category: string
  startAt: Date
  endAt: Date
  ownerType: OwnerType
}
