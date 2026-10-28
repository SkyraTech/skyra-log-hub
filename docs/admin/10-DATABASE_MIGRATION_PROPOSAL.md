# Skyra LogHub — Database & Prisma Schema Migration Proposal

**Document Version:** 1.0.0  
**Status:** PROPOSED (Pending Review & Approval Gate)  
**Task ID:** `LOGHUB-ADMIN-001`  
**Phase:** Phase 4 — Administration Backend Foundation  
**Date:** 2026-10-28  

---

## 1. Migration Overview & Non-Disruption Guarantee

This document defines the proposed PostgreSQL database schema extensions required for user identity, multi-tenant RBAC, project memberships, and administrative audit trails.

### Safety Invariants
1. **Zero Breaking Changes:** Existing tables (`tenants`, `projects`, `ingestion_credentials`, `project_quotas`, `archive_segments`, `deduplication_receipts`, `ingestion_checkpoints`) remain 100% structurally intact. No existing columns are renamed or dropped.
2. **Additive-Only Evolution:** All new tables and relations are purely additive.
3. **Execution Prohibition:** In accordance with task constraints, **no migrations are executed, and the active `prisma/schema.prisma` files are not modified during milestone `LOGHUB-ADMIN-001`**. This proposal is prepared for formal review and execution in milestone `LOGHUB-ADMIN-002`.

---

## 2. Proposed Prisma Schema Extensions

```prisma
// ============================================================================
// IDENTITY & ACCESS MANAGEMENT (IAM) EXTENSIONS (PROPOSED FOR LOGHUB-ADMIN-002)
// ============================================================================

enum UserStatus {
  ACTIVE
  SUSPENDED
  DEACTIVATED
}

enum MembershipStatus {
  PENDING_INVITE
  ACTIVE
  SUSPENDED
  REVOKED
}

/// Registered human users authenticated via enterprise OIDC
model User {
  id          String        @id @default(uuid()) @db.Uuid
  issuer      String        @db.VarChar(255) // Canonical OIDC Issuer URL
  subject     String        @db.VarChar(255) // Immutable OIDC Subject ID
  email       String        @db.VarChar(255) // Primary corporate email
  displayName String        @map("display_name") @db.VarChar(255)
  status      UserStatus    @default(ACTIVE)
  createdAt   DateTime      @default(now()) @map("created_at") @db.Timestamptz
  updatedAt   DateTime      @updatedAt @map("updated_at") @db.Timestamptz

  tenantMemberships   TenantMembership[]
  projectMemberships  ProjectMembership[]
  roleAssignments     RoleAssignment[]
  auditEvents         AdminAuditEvent[]

  @@unique([issuer, subject], name: "uq_users_issuer_subject")
  @@index([email])
  @@map("users")
}

/// Tenant-level workspace membership
model TenantMembership {
  id          String           @id @default(uuid()) @db.Uuid
  tenantId    String           @map("tenant_id") @db.Uuid
  userId      String           @map("user_id") @db.Uuid
  status      MembershipStatus @default(ACTIVE)
  createdAt   DateTime         @default(now()) @map("created_at") @db.Timestamptz
  updatedAt   DateTime         @updatedAt @map("updated_at") @db.Timestamptz

  tenant      Tenant           @relation(fields: [tenantId], references: [id], onDelete: Cascade)
  user        User             @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@unique([tenantId, userId], name: "uq_tenant_memberships_tenant_user")
  @@map("tenant_memberships")
}

/// Project-scoped access membership
model ProjectMembership {
  id          String           @id @default(uuid()) @db.Uuid
  tenantId    String           @map("tenant_id") @db.Uuid
  projectId   String           @map("project_id") @db.VarChar(64)
  userId      String           @map("user_id") @db.Uuid
  status      MembershipStatus @default(ACTIVE)
  createdAt   DateTime         @default(now()) @map("created_at") @db.Timestamptz
  updatedAt   DateTime         @updatedAt @map("updated_at") @db.Timestamptz

  tenant      Tenant           @relation(fields: [tenantId], references: [id], onDelete: Cascade)
  project     Project          @relation(fields: [projectId], references: [id], onDelete: Cascade)
  user        User             @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@unique([tenantId, projectId, userId], name: "uq_project_memberships_scope")
  @@map("project_memberships")
}

/// System-defined and custom security roles
model Role {
  id          String           @id @default(uuid()) @db.Uuid
  name        String           @unique @db.VarChar(64) // e.g. "OrgOwner", "OrgAdmin", "Developer"
  description String           @db.VarChar(255)
  isSystem    Boolean          @default(true) @map("is_system")
  createdAt   DateTime         @default(now()) @map("created_at") @db.Timestamptz

  permissions RolePermission[]
  assignments RoleAssignment[]

  @@map("roles")
}

/// Granular functional capabilities
model Permission {
  id          String           @id @default(uuid()) @db.Uuid
  code        String           @unique @db.VarChar(64) // e.g. "projects.create", "logs.search"
  description String           @db.VarChar(255)

  roles       RolePermission[]

  @@map("permissions")
}

/// Many-to-many junction between Roles and Permissions
model RolePermission {
  roleId       String     @map("role_id") @db.Uuid
  permissionId String     @map("permission_id") @db.Uuid

  role         Role       @relation(fields: [roleId], references: [id], onDelete: Cascade)
  permission   Permission @relation(fields: [permissionId], references: [id], onDelete: Cascade)

  @@id([roleId, permissionId])
  @@map("role_permissions")
}

/// Scoped role assignments binding Users to Roles within Tenants and Projects
model RoleAssignment {
  id          String   @id @default(uuid()) @db.Uuid
  tenantId    String   @map("tenant_id") @db.Uuid
  userId      String   @map("user_id") @db.Uuid
  roleId      String   @map("role_id") @db.Uuid
  projectId   String?  @map("project_id") @db.VarChar(64) // Nullable: null = tenant-wide
  createdAt   DateTime @default(now()) @map("created_at") @db.Timestamptz

  tenant      Tenant   @relation(fields: [tenantId], references: [id], onDelete: Cascade)
  user        User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  role        Role     @relation(fields: [roleId], references: [id], onDelete: Cascade)
  project     Project? @relation(fields: [projectId], references: [id], onDelete: Cascade)

  @@unique([tenantId, userId, roleId, projectId], name: "uq_role_assignments_scope")
  @@index([tenantId, userId])
  @@map("role_assignments")
}

/// Pending invitations for team onboarding
model Invitation {
  id              String           @id @default(uuid()) @db.Uuid
  tenantId        String           @map("tenant_id") @db.Uuid
  email           String           @db.VarChar(255)
  roleId          String           @map("role_id") @db.Uuid
  projectIds      String[]         @map("project_ids")
  invitedByUserId String           @map("invited_by_user_id") @db.Uuid
  tokenHash       String           @unique @map("token_hash") @db.VarChar(64)
  status          MembershipStatus @default(PENDING_INVITE)
  expiresAt       DateTime         @map("expires_at") @db.Timestamptz
  createdAt       DateTime         @default(now()) @map("created_at") @db.Timestamptz

  tenant          Tenant           @relation(fields: [tenantId], references: [id], onDelete: Cascade)
  role            Role             @relation(fields: [roleId], references: [id], onDelete: Cascade)

  @@index([tenantId, email])
  @@map("invitations")
}

/// Immutable record of human administrative mutations
model AdminAuditEvent {
  id          String   @id @default(uuid()) @db.Uuid
  tenantId    String   @map("tenant_id") @db.Uuid
  actorUserId String?  @map("actor_user_id") @db.Uuid
  actorEmail  String   @map("actor_email") @db.VarChar(255)
  action      String   @db.VarChar(64) // e.g. "CREDENTIAL_ROTATED"
  targetType  String   @map("target_type") @db.VarChar(64)
  targetId    String   @map("target_id") @db.VarChar(64)
  details     Json     @db.JsonB
  ipAddress   String?  @map("ip_address") @db.VarChar(64)
  createdAt   DateTime @default(now()) @map("created_at") @db.Timestamptz

  tenant      Tenant   @relation(fields: [tenantId], references: [id], onDelete: Cascade)
  actor       User?    @relation(fields: [actorUserId], references: [id], onDelete: SetNull)

  @@index([tenantId, createdAt])
  @@map("admin_audit_events")
}
```

---

## 3. Rollback Strategy & Migration Safety

In the event that milestone `LOGHUB-ADMIN-002` requires migration reversal:
- Because all proposed tables are newly introduced, rolling back is completely non-destructive to existing operational data:
  ```sql
  DROP TABLE IF EXISTS admin_audit_events CASCADE;
  DROP TABLE IF EXISTS invitations CASCADE;
  DROP TABLE IF EXISTS role_assignments CASCADE;
  DROP TABLE IF EXISTS role_permissions CASCADE;
  DROP TABLE IF EXISTS permissions CASCADE;
  DROP TABLE IF EXISTS roles CASCADE;
  DROP TABLE IF EXISTS project_memberships CASCADE;
  DROP TABLE IF EXISTS tenant_memberships CASCADE;
  DROP TABLE IF EXISTS users CASCADE;
  DROP TYPE IF EXISTS "UserStatus";
  DROP TYPE IF EXISTS "MembershipStatus";
  ```
- All ingestion archives, gateway credentials, and checkpoints remain intact.
