export type UserRole = 'customer' | 'manager' | 'super_admin';
export type UserStatus = 'active' | 'suspended' | 'deactivated';

export interface UserRow {
  id: string;
  full_name: string;
  email: string | null;
  phone: string | null;
  password_hash: string;
  role: UserRole;
  status: UserStatus;
  suspended_reason: string | null;
  preferred_language: 'ar' | 'en';
  email_verified_at: Date | null;
  phone_verified_at: Date | null;
  last_login_at: Date | null;
  created_at: Date;
  updated_at: Date;
}

/** Public representation. Never includes the password hash. */
export interface UserDto {
  id: string;
  fullName: string;
  email: string | null;
  phone: string | null;
  role: UserRole;
  status: UserStatus;
  preferredLanguage: 'ar' | 'en';
  createdAt: Date;
}

export const toUserDto = (row: UserRow): UserDto => ({
  id: row.id,
  fullName: row.full_name,
  email: row.email,
  phone: row.phone,
  role: row.role,
  status: row.status,
  preferredLanguage: row.preferred_language,
  createdAt: row.created_at,
});
