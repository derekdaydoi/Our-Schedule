import { useEffect, useMemo, useState } from 'react'
import { addDays, addWeeks, format, isSameDay, setHours, setMinutes, subWeeks } from 'date-fns'
import { GoogleAuthProvider, onAuthStateChanged, signInWithPopup, signOut, type User } from 'firebase/auth'
import { Timestamp, addDoc, collection, doc, getDoc, getDocs, onSnapshot, orderBy, query, serverTimestamp, setDoc, updateDoc, deleteDoc, where, writeBatch } from 'firebase/firestore'
import EventModal from './components/EventModal'
import { auth, db, firebaseReady } from './lib/firebase'
import { dateLabel, dayKey, dayLabel, durationLabel, findCommonSlots, timeLabel, weekDays, weekLabel, weekStartOf } from './lib/calendar'
import type { Couple, EventDraft, Member, ScheduleEvent } from './types'

const memberFromUser = (user: User): Member => ({
  uid: user.uid,
  displayName: user.displayName || user.email?.split('@')[0] || 'User',
  email: user.email || '',
  photoURL: user.photoURL || undefined,
})

const initials = (name: string) => name.split(' ').filter(Boolean).slice(-2).map(x => x[0]).join('').toUpperCase()
const newPairCode = () => crypto.randomUUID().replaceAll('-', '').slice(0, 10).toUpperCase()

function MissingConfig() {
  return <main className="center-screen"><div className="setup-card"><div className="brand-mark">OS</div><h1>Our Schedule</h1><p>Code đã sẵn sàng. Thêm Firebase Web config vào file <code>.env</code> để kết nối Auth + Firestore.</p><pre>VITE_FIREBASE_API_KEY=...{`\n`}VITE_FIREBASE_AUTH_DOMAIN=...{`\n`}VITE_FIREBASE_PROJECT_ID=...{`\n`}VITE_FIREBASE_APP_ID=...</pre><p className="muted">Xem README trong repo để setup từng bước.</p></div></main>
}

function Login() {
  const login = async () => auth && signInWithPopup(auth, new GoogleAuthProvider())
  return <main className="center-screen"><div className="login-card"><div className="brand-mark">OS</div><span className="eyebrow">Weekly Couple Planner</span><h1>Một tuần, hai lịch,<br/>một chỗ để chốt.</h1><p>Không phải calendar phức tạp. Chỉ lịch của bạn, lịch của người kia và khoảng thời gian dành cho nhau.</p><button className="primary wide" onClick={login}>Đăng nhập bằng Google</button></div></main>
}

function Pairing({ user, onPaired }: { user: User; onPaired: (id: string) => void }) {
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const create = async () => {
    if (!db) return
    setBusy(true); setError('')
    try {
      const id = newPairCode()
      const member = memberFromUser(user)
      await setDoc(doc(db, 'couples', id), { createdBy: user.uid, members: { [user.uid]: member }, createdAt: serverTimestamp(), updatedAt: serverTimestamp() })
      await setDoc(doc(db, 'users', user.uid), { coupleId: id, profile: member, updatedAt: serverTimestamp() }, { merge: true })
      onPaired(id)
    } catch (e) { setError(e instanceof Error ? e.message : 'Không tạo được lịch đôi.') } finally { setBusy(false) }
  }

  const join = async () => {
    if (!db || !code.trim()) return
    setBusy(true); setError('')
    try {
      const id = code.trim().toUpperCase()
      const ref = doc(db, 'couples', id)
      const snap = await getDoc(ref)
      if (!snap.exists()) throw new Error('Mã ghép đôi không tồn tại.')
      const data = snap.data() as Omit<Couple, 'id'>
      if (Object.keys(data.members || {}).length >= 2 && !data.members?.[user.uid]) throw new Error('Lịch này đã đủ 2 người.')
      const member = memberFromUser(user)
      await updateDoc(ref, { [`members.${user.uid}`]: member, updatedAt: serverTimestamp() })
      await setDoc(doc(db, 'users', user.uid), { coupleId: id, profile: member, updatedAt: serverTimestamp() }, { merge: true })
      onPaired(id)
    } catch (e) { setError(e instanceof Error ? e.message : 'Không ghép được lịch.') } finally { setBusy(false) }
  }

  return <main className="center-screen"><div className="pair-card"><span className="eyebrow">Bước đầu tiên</span><h1>Ghép lịch của hai người</h1><p>Một người tạo lịch đôi và gửi mã cho người còn lại. Mỗi tài khoản vẫn giữ quyền sửa lịch cá nhân của mình.</p><div className="pair-actions"><button className="primary" onClick={create} disabled={busy}>Tạo lịch đôi mới</button><div className="or"><span/>hoặc<span/></div><label>Nhập mã từ người yêu<input value={code} onChange={e => setCode(e.target.value.toUpperCase())} placeholder="VD: 8F3A19BC2D" maxLength={10}/></label><button className="secondary" onClick={join} disabled={busy || !code.trim()}>Ghép vào lịch</button></div>{error && <p className="error">{error}</p>}</div></main>
}

function AppShell({ user, initialCoupleId }: { user: User; initialCoupleId: string }) {
  const [coupleId] = useState(initialCoupleId)
  const [couple, setCouple] = useState<Couple | null>(null)
  const [weekStart, setWeekStart] = useState(() => weekStartOf(new Date()))
  const [selectedDay, setSelectedDay] = useState(() => new Date())
  const [events, setEvents] = useState<ScheduleEvent[]>([])
  const [filter, setFilter] = useState<'all'|'mine'|'partner'|'both'>('all')
  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState<ScheduleEvent | null>(null)
  const [modalDate, setModalDate] = useState(new Date())
  const [showFree, setShowFree] = useState(false)
  const [notice, setNotice] = useState('')

  const days = useMemo(() => weekDays(weekStart), [weekStart])
  const members = useMemo(() => Object.values(couple?.members || {}), [couple])
  const partner = members.find(m => m.uid !== user.uid)

  useEffect(() => {
    if (!db) return
    return onSnapshot(doc(db, 'couples', coupleId), snap => {
      if (snap.exists()) setCouple({ id: snap.id, ...(snap.data() as Omit<Couple, 'id'>) })
    })
  }, [coupleId])

  useEffect(() => {
    if (!db) return
    const start = Timestamp.fromDate(weekStart)
    const end = Timestamp.fromDate(addWeeks(weekStart, 1))
    const q = query(collection(db, 'couples', coupleId, 'events'), where('startAt', '>=', start), where('startAt', '<', end), orderBy('startAt', 'asc'))
    return onSnapshot(q, snap => setEvents(snap.docs.map(d => {
      const x = d.data()
      return { id: d.id, ...x, startAt: x.startAt.toDate(), endAt: x.endAt.toDate() } as ScheduleEvent
    })))
  }, [coupleId, weekStart])

  useEffect(() => {
    if (!days.some(d => isSameDay(d, selectedDay))) setSelectedDay(days[0])
  }, [days, selectedDay])

  const visibleEvents = useMemo(() => events.filter(e => {
    if (filter === 'all') return true
    if (filter === 'both') return e.ownerType === 'both'
    if (filter === 'mine') return e.ownerType === 'personal' && e.ownerUid === user.uid
    return e.ownerType === 'personal' && e.ownerUid !== user.uid
  }), [events, filter, user.uid])

  const commonSlots = useMemo(() => findCommonSlots(events, members.map(m => m.uid), weekStart), [events, members, weekStart])

  const openNew = (day = selectedDay) => {
    const base = setMinutes(setHours(day, 19), 0)
    setEditing(null); setModalDate(base); setModalOpen(true)
  }
  const openEdit = (event: ScheduleEvent) => { setEditing(event); setModalDate(event.startAt); setModalOpen(true) }

  const saveEvent = async (draft: EventDraft) => {
    if (!db) return
    const payload = {
      title: draft.title,
      notes: draft.notes,
      category: draft.category,
      startAt: Timestamp.fromDate(draft.startAt),
      endAt: Timestamp.fromDate(draft.endAt),
      ownerType: draft.ownerType,
      ownerUid: draft.ownerType === 'personal' ? user.uid : null,
      status: draft.ownerType === 'both' ? (editing?.ownerType === 'both' ? editing.status : (members.length > 1 ? 'proposed' : 'confirmed')) : 'confirmed',
      updatedAt: serverTimestamp(),
    }
    if (editing) await updateDoc(doc(db, 'couples', coupleId, 'events', editing.id), payload)
    else await addDoc(collection(db, 'couples', coupleId, 'events'), { ...payload, createdBy: user.uid, createdAt: serverTimestamp() })
  }

  const removeEvent = async () => {
    if (!db || !editing) return
    if (!confirm('Xóa lịch này?')) return
    await deleteDoc(doc(db, 'couples', coupleId, 'events', editing.id))
    setModalOpen(false)
  }

  const acceptProposal = async (event: ScheduleEvent) => {
    if (!db) return
    await updateDoc(doc(db, 'couples', coupleId, 'events', event.id), { status: 'confirmed', acceptedBy: user.uid, acceptedAt: serverTimestamp(), updatedAt: serverTimestamp() })
  }

  const copyPreviousWeek = async () => {
    if (!db || !confirm('Copy các lịch bạn tạo từ tuần trước sang tuần này?')) return
    const prevStart = subWeeks(weekStart, 1)
    const q = query(collection(db, 'couples', coupleId, 'events'), where('startAt', '>=', Timestamp.fromDate(prevStart)), where('startAt', '<', Timestamp.fromDate(weekStart)), orderBy('startAt', 'asc'))
    const snap = await getDocs(q)
    const existingSources = new Set(events.map(e => e.copiedFrom).filter(Boolean))
    const batch = writeBatch(db)
    let count = 0
    snap.docs.forEach(source => {
      const x = source.data()
      const shouldCopy = (x.ownerType === 'personal' && x.ownerUid === user.uid) || (x.ownerType === 'both' && x.createdBy === user.uid)
      if (!shouldCopy || existingSources.has(source.id)) return
      const target = doc(collection(db!, 'couples', coupleId, 'events'))
      batch.set(target, {
        ...x,
        startAt: Timestamp.fromDate(addWeeks(x.startAt.toDate(), 1)),
        endAt: Timestamp.fromDate(addWeeks(x.endAt.toDate(), 1)),
        copiedFrom: source.id,
        status: x.ownerType === 'both' && members.length > 1 ? 'proposed' : 'confirmed',
        acceptedBy: null,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      })
      count++
    })
    if (count) await batch.commit()
    setNotice(count ? `Đã copy ${count} lịch.` : 'Không có lịch mới để copy.')
    setTimeout(() => setNotice(''), 2500)
  }

  const copyCode = async () => { await navigator.clipboard.writeText(coupleId); setNotice('Đã copy mã ghép đôi.'); setTimeout(() => setNotice(''), 1800) }

  const canEdit = (event: ScheduleEvent) => event.ownerType === 'both' || event.ownerUid === user.uid

  return <div className="app-shell">
    <header className="topbar">
      <div className="brand"><div className="brand-mark small">OS</div><div><strong>Our Schedule</strong><span>{weekLabel(weekStart)}</span></div></div>
      <div className="people">{members.map(m => <div className="avatar" title={m.displayName} key={m.uid}>{m.photoURL ? <img src={m.photoURL} alt=""/> : initials(m.displayName)}</div>)}<button className="ghost compact" onClick={() => auth && signOut(auth)}>Đăng xuất</button></div>
    </header>

    <main className="workspace">
      <section className="calendar-panel">
        <div className="calendar-toolbar">
          <div className="week-nav"><button className="icon-btn" onClick={() => setWeekStart(subWeeks(weekStart, 1))}>‹</button><button className="ghost" onClick={() => setWeekStart(weekStartOf(new Date()))}>Tuần này</button><button className="icon-btn" onClick={() => setWeekStart(addWeeks(weekStart, 1))}>›</button></div>
          <div className="filters">{(['all','mine','partner','both'] as const).map(x => <button key={x} className={filter === x ? 'active' : ''} onClick={() => setFilter(x)}>{x === 'all' ? 'Tất cả' : x === 'mine' ? 'Của tôi' : x === 'partner' ? (partner?.displayName || 'Người kia') : 'Cả hai'}</button>)}</div>
          <button className="primary add-btn" onClick={() => openNew()}>＋ Thêm lịch</button>
        </div>

        <div className="mobile-days">{days.map(day => <button key={dayKey(day)} onClick={() => setSelectedDay(day)} className={isSameDay(day, selectedDay) ? 'selected' : ''}><span>{dayLabel(day)}</span><strong>{dateLabel(day)}</strong></button>)}</div>

        <div className="week-grid">{days.map(day => {
          const dayEvents = visibleEvents.filter(e => isSameDay(e.startAt, day))
          return <div className={`day-column ${isSameDay(day, new Date()) ? 'today' : ''}`} key={dayKey(day)} onDoubleClick={() => openNew(day)}>
            <div className="day-head"><span>{dayLabel(day)}</span><strong>{dateLabel(day)}</strong></div>
            <div className="event-stack">{dayEvents.length === 0 && <button className="empty-day" onClick={() => openNew(day)}>＋</button>}{dayEvents.map(event => {
              const owner = event.ownerType === 'both' ? null : members.find(m => m.uid === event.ownerUid)
              return <article key={event.id} className={`event-card ${event.ownerType === 'both' ? 'shared' : event.ownerUid === user.uid ? 'mine' : 'partner'} ${event.status === 'proposed' ? 'proposed' : ''}`} onClick={() => canEdit(event) && openEdit(event)}>
                <div className="event-time">{timeLabel(event.startAt)} · {durationLabel(event.startAt, event.endAt)}</div>
                <h3>{event.title}</h3><p>{event.category}</p>
                <div className="event-foot"><span>{event.ownerType === 'both' ? '♥ Cả hai' : owner?.displayName || 'Cá nhân'}</span>{event.status === 'proposed' && <span className="status">Chờ xác nhận</span>}</div>
                {event.status === 'proposed' && event.createdBy !== user.uid && <button className="accept" onClick={e => { e.stopPropagation(); acceptProposal(event) }}>Xác nhận</button>}
              </article>
            })}</div>
          </div>
        })}</div>

        <div className="mobile-day-view">{visibleEvents.filter(e => isSameDay(e.startAt, selectedDay)).map(event => <article key={event.id} className={`mobile-event ${event.ownerType === 'both' ? 'shared' : event.ownerUid === user.uid ? 'mine' : 'partner'}`} onClick={() => canEdit(event) && openEdit(event)}><div className="mobile-time"><strong>{timeLabel(event.startAt)}</strong><span>{timeLabel(event.endAt)}</span></div><div><h3>{event.title}</h3><p>{event.category} · {durationLabel(event.startAt, event.endAt)}</p>{event.status === 'proposed' && <span className="status">Chờ xác nhận</span>}{event.status === 'proposed' && event.createdBy !== user.uid && <button className="accept inline" onClick={e => {e.stopPropagation(); acceptProposal(event)}}>Xác nhận</button>}</div></article>)}<button className="mobile-add" onClick={() => openNew(selectedDay)}>＋ Thêm lịch ngày này</button></div>
      </section>

      <aside className="side-panel">
        <section className="side-card invite-card"><span className="eyebrow">Ghép đôi</span><h2>{partner ? `Đã ghép với ${partner.displayName}` : 'Gửi mã cho người yêu'}</h2><div className="invite-code"><code>{coupleId}</code><button onClick={copyCode}>Copy</button></div><p>{partner ? 'Mọi thay đổi lịch sẽ đồng bộ realtime trên hai thiết bị.' : 'Người kia đăng nhập Google → nhập mã này → lịch bắt đầu sync.'}</p></section>
        <section className="side-card"><div className="card-title"><div><span className="eyebrow">Smart slot</span><h2>Thời gian trống chung</h2></div><button className="ghost compact" onClick={() => setShowFree(v => !v)}>{showFree ? 'Ẩn' : 'Tìm'}</button></div>{showFree && <div className="slots">{members.length < 2 ? <p className="muted">Ghép đủ 2 người để tính.</p> : commonSlots.length ? commonSlots.map(slot => <button key={slot.start.toISOString()} onClick={() => { setSelectedDay(slot.start); setModalDate(slot.start); setEditing(null); setModalOpen(true) }}><strong>{format(slot.start, 'EEE dd/MM')}</strong><span>{timeLabel(slot.start)}–{timeLabel(slot.end)}</span></button>) : <p className="muted">Không có slot ≥ 90 phút trong khung tối.</p>}</div>}</section>
        <section className="side-card"><span className="eyebrow">Tuần mới</span><h2>Đừng nhập lại lịch lặp</h2><p>Copy những lịch bạn đã tạo ở tuần trước. Lịch chung sẽ quay lại trạng thái đề xuất.</p><button className="secondary wide" onClick={copyPreviousWeek}>Copy tuần trước</button></section>
      </aside>
    </main>

    <EventModal open={modalOpen} initialDate={modalDate} event={editing} canDelete={Boolean(editing && canEdit(editing))} onClose={() => setModalOpen(false)} onSave={saveEvent} onDelete={removeEvent}/>
    {notice && <div className="toast">{notice}</div>}
  </div>
}

export default function App() {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)
  const [coupleId, setCoupleId] = useState<string | null>(null)
  const [profileLoaded, setProfileLoaded] = useState(false)

  useEffect(() => {
    if (!firebaseReady || !auth) { setLoading(false); return }
    return onAuthStateChanged(auth, u => { setUser(u); setLoading(false); setProfileLoaded(false); setCoupleId(null) })
  }, [])

  useEffect(() => {
    if (!user || !db) return
    ;(async () => {
      const ref = doc(db, 'users', user.uid)
      const snap = await getDoc(ref)
      await setDoc(ref, { profile: memberFromUser(user), updatedAt: serverTimestamp() }, { merge: true })
      setCoupleId((snap.data()?.coupleId as string | undefined) || null)
      setProfileLoaded(true)
    })()
  }, [user])

  if (!firebaseReady) return <MissingConfig />
  if (loading) return <main className="center-screen"><div className="loader"/></main>
  if (!user) return <Login />
  if (!profileLoaded) return <main className="center-screen"><div className="loader"/></main>
  if (!coupleId) return <Pairing user={user} onPaired={setCoupleId} />
  return <AppShell user={user} initialCoupleId={coupleId} />
}
