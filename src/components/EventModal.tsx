import { useEffect, useState } from 'react'
import { addHours } from 'date-fns'
import { fromDateTimeLocal, toDateTimeLocal } from '../lib/calendar'
import type { EventDraft, OwnerType, ScheduleEvent } from '../types'

type Props = {
  open: boolean
  initialDate: Date
  event?: ScheduleEvent | null
  canDelete?: boolean
  onClose: () => void
  onSave: (draft: EventDraft) => Promise<void>
  onDelete?: () => Promise<void>
}

const categories = ['Công việc', 'Di chuyển', 'Tập luyện', 'Ăn uống', 'Hẹn hò', 'Học tập', 'Cá nhân', 'Khác']

export default function EventModal({ open, initialDate, event, canDelete, onClose, onSave, onDelete }: Props) {
  const [title, setTitle] = useState('')
  const [notes, setNotes] = useState('')
  const [category, setCategory] = useState('Cá nhân')
  const [ownerType, setOwnerType] = useState<OwnerType>('personal')
  const [startAt, setStartAt] = useState(toDateTimeLocal(initialDate))
  const [endAt, setEndAt] = useState(toDateTimeLocal(addHours(initialDate, 1)))
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!open) return
    const base = event?.startAt ?? initialDate
    setTitle(event?.title ?? '')
    setNotes(event?.notes ?? '')
    setCategory(event?.category ?? 'Cá nhân')
    setOwnerType(event?.ownerType ?? 'personal')
    setStartAt(toDateTimeLocal(base))
    setEndAt(toDateTimeLocal(event?.endAt ?? addHours(base, 1)))
  }, [open, event, initialDate])

  if (!open) return null

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    const start = fromDateTimeLocal(startAt)
    const end = fromDateTimeLocal(endAt)
    if (!title.trim() || end <= start) return
    setSaving(true)
    try {
      await onSave({ title: title.trim(), notes: notes.trim(), category, ownerType, startAt: start, endAt: end })
      onClose()
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="modal-backdrop" onMouseDown={e => e.currentTarget === e.target && onClose()}>
      <form className="modal" onSubmit={submit}>
        <div className="modal-head">
          <div>
            <span className="eyebrow">{event ? 'Chỉnh lịch' : 'Thêm lịch'}</span>
            <h2>{event ? event.title : 'Lịch mới'}</h2>
          </div>
          <button type="button" className="icon-btn" onClick={onClose} aria-label="Đóng">×</button>
        </div>

        <label>Tên lịch<input autoFocus value={title} onChange={e => setTitle(e.target.value)} placeholder="Ví dụ: Ăn tối cùng nhau" /></label>
        <div className="form-grid">
          <label>Bắt đầu<input type="datetime-local" value={startAt} onChange={e => setStartAt(e.target.value)} /></label>
          <label>Kết thúc<input type="datetime-local" value={endAt} onChange={e => setEndAt(e.target.value)} /></label>
        </div>
        <label>Loại<select value={category} onChange={e => setCategory(e.target.value)}>{categories.map(x => <option key={x}>{x}</option>)}</select></label>
        <div className="segmented">
          <button type="button" disabled={Boolean(event)} className={ownerType === 'personal' ? 'active' : ''} onClick={() => setOwnerType('personal')}>Của tôi</button>
          <button type="button" disabled={Boolean(event)} className={ownerType === 'both' ? 'active' : ''} onClick={() => setOwnerType('both')}>Của cả hai</button>
        </div>
        <p className="helper">{event ? 'Quyền sở hữu được khóa sau khi tạo lịch.' : 'Lịch “của cả hai” sẽ ở trạng thái đề xuất cho đến khi người kia xác nhận.'}</p>
        <label>Ghi chú<textarea rows={3} value={notes} onChange={e => setNotes(e.target.value)} placeholder="Địa điểm, việc cần nhớ..." /></label>

        <div className="modal-actions">
          {event && canDelete && onDelete ? <button type="button" className="danger ghost" onClick={onDelete}>Xóa</button> : <span />}
          <div className="action-group">
            <button type="button" className="ghost" onClick={onClose}>Hủy</button>
            <button className="primary" disabled={saving}>{saving ? 'Đang lưu…' : 'Lưu lịch'}</button>
          </div>
        </div>
      </form>
    </div>
  )
}
