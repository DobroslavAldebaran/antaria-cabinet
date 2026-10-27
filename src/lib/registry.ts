import {
  collection,
  doc,
  getDoc,
  getDocs,
  orderBy,
  query,
  runTransaction,
  setDoc,
  updateDoc,
  type Timestamp,
} from 'firebase/firestore'
import { getDb } from './firebase'
import type {
  AppSettings,
  AppUser,
  AuditEvent,
  UserStatus,
} from '../schema/registry'

function isoNow(): string {
  return new Date().toISOString()
}

function tsToIso(value: unknown): string {
  if (!value) return isoNow()
  if (typeof value === 'string') return value
  const t = value as Timestamp
  if (typeof t.toDate === 'function') return t.toDate().toISOString()
  return isoNow()
}

export async function ensureUserRegistry(input: {
  uid: string
  email: string | null
  displayName: string | null
}): Promise<AppUser> {
  const db = getDb()
  const userRef = doc(db, 'users', input.uid)
  const settingsRef = doc(db, 'settings', 'app')

  await runTransaction(db, async (tx) => {
    const userSnap = await tx.get(userRef)
    if (userSnap.exists()) return

    const settingsSnap = await tx.get(settingsRef)
    const now = isoNow()

    if (!settingsSnap.exists()) {
      tx.set(settingsRef, {
        bootstrapAdminUid: input.uid,
        registrationOpen: false,
        allowWaitlist: true,
        createdAt: now,
        updatedAt: now,
      })
      tx.set(userRef, {
        uid: input.uid,
        email: input.email,
        displayName: input.displayName,
        role: 'admin',
        status: 'approved',
        createdAt: now,
        updatedAt: now,
        approvedAt: now,
        approvedBy: input.uid,
      })
      const auditRef = doc(collection(db, 'audit'))
      tx.set(auditRef, {
        type: 'bootstrap',
        actorUid: input.uid,
        targetUid: input.uid,
        detail: 'First user became admin',
        createdAt: now,
      })
      return
    }

    const settings = settingsSnap.data() as AppSettings
    if (!settings.allowWaitlist && !settings.registrationOpen) {
      throw new Error('Регистрация закрыта администратором')
    }

    tx.set(userRef, {
      uid: input.uid,
      email: input.email,
      displayName: input.displayName,
      role: 'user',
      status: settings.registrationOpen ? 'approved' : 'pending',
      createdAt: now,
      updatedAt: now,
      ...(settings.registrationOpen
        ? { approvedAt: now, approvedBy: 'auto-open' }
        : {}),
    })
  })

  const snap = await getDoc(userRef)
  if (!snap.exists()) throw new Error('Не удалось создать профиль пользователя')
  return mapUser(snap.id, snap.data())
}

export async function getAppUser(uid: string): Promise<AppUser | null> {
  const snap = await getDoc(doc(getDb(), 'users', uid))
  if (!snap.exists()) return null
  return mapUser(snap.id, snap.data())
}

export async function listUsers(): Promise<AppUser[]> {
  const q = query(collection(getDb(), 'users'), orderBy('createdAt', 'asc'))
  const snap = await getDocs(q)
  return snap.docs.map((d) => mapUser(d.id, d.data()))
}

export async function getSettings(): Promise<AppSettings | null> {
  const snap = await getDoc(doc(getDb(), 'settings', 'app'))
  if (!snap.exists()) return null
  const data = snap.data()
  return {
    bootstrapAdminUid: String(data.bootstrapAdminUid),
    registrationOpen: Boolean(data.registrationOpen),
    allowWaitlist: data.allowWaitlist !== false,
    createdAt: tsToIso(data.createdAt),
    updatedAt: tsToIso(data.updatedAt),
  }
}

export async function setUserStatus(params: {
  actorUid: string
  targetUid: string
  status: Extract<UserStatus, 'approved' | 'rejected'>
}): Promise<void> {
  const db = getDb()
  const now = isoNow()
  await updateDoc(doc(db, 'users', params.targetUid), {
    status: params.status,
    updatedAt: now,
    ...(params.status === 'approved'
      ? { approvedAt: now, approvedBy: params.actorUid }
      : {}),
  })
  await setDoc(doc(collection(db, 'audit')), {
    type: params.status === 'approved' ? 'approve' : 'reject',
    actorUid: params.actorUid,
    targetUid: params.targetUid,
    createdAt: now,
  })
}

export async function setRegistrationOpen(params: {
  actorUid: string
  open: boolean
}): Promise<void> {
  const now = isoNow()
  await updateDoc(doc(getDb(), 'settings', 'app'), {
    registrationOpen: params.open,
    updatedAt: now,
  })
  await setDoc(doc(collection(getDb(), 'audit')), {
    type: 'registration_toggle',
    actorUid: params.actorUid,
    detail: params.open ? 'opened' : 'closed',
    createdAt: now,
  })
}

export async function writeAudit(event: Omit<AuditEvent, 'id'>): Promise<void> {
  await setDoc(doc(collection(getDb(), 'audit')), {
    ...event,
    // serverTimestamp optional; keep ISO for easy client read
  })
}

function mapUser(id: string, data: Record<string, unknown>): AppUser {
  return {
    uid: id,
    email: (data.email as string | null) ?? null,
    displayName: (data.displayName as string | null | undefined) ?? null,
    role: (data.role as AppUser['role']) ?? 'user',
    status: (data.status as AppUser['status']) ?? 'pending',
    createdAt: tsToIso(data.createdAt),
    updatedAt: tsToIso(data.updatedAt),
    approvedAt: data.approvedAt ? tsToIso(data.approvedAt) : undefined,
    approvedBy: data.approvedBy ? String(data.approvedBy) : undefined,
  }
}
