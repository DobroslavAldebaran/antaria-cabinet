import { z } from 'zod'

export const UserRoleSchema = z.enum(['admin', 'user'])
export const UserStatusSchema = z.enum(['pending', 'approved', 'rejected'])

export const AppUserSchema = z.object({
  uid: z.string(),
  email: z.string().nullable(),
  displayName: z.string().nullable().optional(),
  role: UserRoleSchema,
  status: UserStatusSchema,
  createdAt: z.string(),
  updatedAt: z.string(),
  approvedAt: z.string().optional(),
  approvedBy: z.string().optional(),
})

export type AppUser = z.infer<typeof AppUserSchema>
export type UserRole = z.infer<typeof UserRoleSchema>
export type UserStatus = z.infer<typeof UserStatusSchema>

export const AppSettingsSchema = z.object({
  bootstrapAdminUid: z.string(),
  registrationOpen: z.boolean().default(false),
  allowWaitlist: z.boolean().default(true),
  createdAt: z.string(),
  updatedAt: z.string(),
})

export type AppSettings = z.infer<typeof AppSettingsSchema>

export const VkSettingsSchema = z.object({
  groupId: z.string().default(''),
  screenName: z.string().default(''),
  accessToken: z.string().default(''),
  updatedAt: z.string(),
})
export type VkSettings = z.infer<typeof VkSettingsSchema>

export const AuditEventSchema = z.object({
  id: z.string(),
  type: z.enum([
    'bootstrap',
    'approve',
    'reject',
    'registration_toggle',
    'export',
    'import',
  ]),
  actorUid: z.string(),
  targetUid: z.string().optional(),
  detail: z.string().optional(),
  createdAt: z.string(),
})

export type AuditEvent = z.infer<typeof AuditEventSchema>
