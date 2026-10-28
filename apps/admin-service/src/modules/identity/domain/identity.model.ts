export type UserStatus = 'ACTIVE' | 'SUSPENDED' | 'DEACTIVATED';

export interface UserIdentity {
  id: string;
  issuer: string;
  subject: string;
  email: string;
  displayName: string;
  status: UserStatus;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateUserDto {
  issuer: string;
  subject: string;
  email: string;
  displayName: string;
  status?: UserStatus;
}
