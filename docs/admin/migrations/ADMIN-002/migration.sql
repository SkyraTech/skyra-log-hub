-- ============================================================================
-- SKYRA LOGHUB — MIGRATION: 20261028000000_admin_iam_foundation
-- Task ID: LOGHUB-ADMIN-002
-- Phase: Phase 4 — Administration Backend Foundation
-- Classification: Additive Schema Evolution (GATE B EXECUTION REQUIRED)
-- Description: Adds IAM tables, RBAC models, Project Memberships, Invitations,
--              and Administrative Audit Events.
-- Safety Invariant: Completely additive. Preserves all existing tables and data.
-- ============================================================================

-- Step 1: Create Enums
DO $$ BEGIN
    CREATE TYPE "UserStatus" AS ENUM ('ACTIVE', 'SUSPENDED', 'DEACTIVATED');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE "MembershipStatus" AS ENUM ('PENDING_INVITE', 'ACTIVE', 'SUSPENDED', 'REVOKED');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- Step 2: Create Users Table (Federated OIDC Identity)
CREATE TABLE IF NOT EXISTS "users" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "issuer" VARCHAR(255) NOT NULL,
    "subject" VARCHAR(255) NOT NULL,
    "email" VARCHAR(255) NOT NULL,
    "display_name" VARCHAR(255) NOT NULL,
    "status" "UserStatus" NOT NULL DEFAULT 'ACTIVE',
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- Unique composite index for OIDC identity (prevents cross-issuer subject collision)
CREATE UNIQUE INDEX IF NOT EXISTS "uq_users_issuer_subject" ON "users"("issuer", "subject");
CREATE INDEX IF NOT EXISTS "users_email_idx" ON "users"("email");

-- Step 3: Create Tenant Memberships Table
CREATE TABLE IF NOT EXISTS "tenant_memberships" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "status" "MembershipStatus" NOT NULL DEFAULT 'ACTIVE',
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tenant_memberships_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "fk_tenant_memberships_tenant" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "fk_tenant_memberships_user" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS "uq_tenant_memberships_tenant_user" ON "tenant_memberships"("tenant_id", "user_id");
CREATE INDEX IF NOT EXISTS "tenant_memberships_user_id_idx" ON "tenant_memberships"("user_id");

-- Step 4: Create Project Memberships Table
CREATE TABLE IF NOT EXISTS "project_memberships" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "project_id" VARCHAR(64) NOT NULL,
    "user_id" UUID NOT NULL,
    "status" "MembershipStatus" NOT NULL DEFAULT 'ACTIVE',
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "project_memberships_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "fk_project_memberships_tenant" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "fk_project_memberships_project" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "fk_project_memberships_user" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS "uq_project_memberships_scope" ON "project_memberships"("tenant_id", "project_id", "user_id");
CREATE INDEX IF NOT EXISTS "project_memberships_user_id_idx" ON "project_memberships"("user_id");
CREATE INDEX IF NOT EXISTS "project_memberships_project_id_idx" ON "project_memberships"("project_id");

-- Step 5: Create Roles Table
CREATE TABLE IF NOT EXISTS "roles" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "name" VARCHAR(64) NOT NULL,
    "description" VARCHAR(255) NOT NULL,
    "is_system" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "roles_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "roles_name_key" ON "roles"("name");

-- Step 6: Create Permissions Table
CREATE TABLE IF NOT EXISTS "permissions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "code" VARCHAR(64) NOT NULL,
    "description" VARCHAR(255) NOT NULL,

    CONSTRAINT "permissions_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "permissions_code_key" ON "permissions"("code");

-- Step 7: Create Role Permissions Junction Table
CREATE TABLE IF NOT EXISTS "role_permissions" (
    "role_id" UUID NOT NULL,
    "permission_id" UUID NOT NULL,

    CONSTRAINT "role_permissions_pkey" PRIMARY KEY ("role_id", "permission_id"),
    CONSTRAINT "fk_role_permissions_role" FOREIGN KEY ("role_id") REFERENCES "roles"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "fk_role_permissions_permission" FOREIGN KEY ("permission_id") REFERENCES "permissions"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- Step 8: Create Role Assignments Table
CREATE TABLE IF NOT EXISTS "role_assignments" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "role_id" UUID NOT NULL,
    "project_id" VARCHAR(64),
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "role_assignments_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "fk_role_assignments_tenant" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "fk_role_assignments_user" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "fk_role_assignments_role" FOREIGN KEY ("role_id") REFERENCES "roles"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "fk_role_assignments_project" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- Unique index ensuring no duplicate assignment of the same role within a scope
CREATE UNIQUE INDEX IF NOT EXISTS "uq_role_assignments_scope" ON "role_assignments"("tenant_id", "user_id", "role_id", COALESCE("project_id", ''));
CREATE INDEX IF NOT EXISTS "role_assignments_tenant_user_idx" ON "role_assignments"("tenant_id", "user_id");

-- Step 9: Create Invitations Table
CREATE TABLE IF NOT EXISTS "invitations" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "email" VARCHAR(255) NOT NULL,
    "role_id" UUID NOT NULL,
    "project_ids" TEXT[] NOT NULL DEFAULT '{}',
    "invited_by_user_id" UUID NOT NULL,
    "token_hash" VARCHAR(64) NOT NULL,
    "status" "MembershipStatus" NOT NULL DEFAULT 'PENDING_INVITE',
    "expires_at" TIMESTAMPTZ NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "invitations_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "fk_invitations_tenant" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "fk_invitations_role" FOREIGN KEY ("role_id") REFERENCES "roles"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS "invitations_token_hash_key" ON "invitations"("token_hash");
CREATE INDEX IF NOT EXISTS "invitations_tenant_id_email_idx" ON "invitations"("tenant_id", "email");

-- Step 10: Create Administrative Audit Events Table
CREATE TABLE IF NOT EXISTS "admin_audit_events" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "actor_user_id" UUID,
    "actor_email" VARCHAR(255) NOT NULL,
    "action" VARCHAR(64) NOT NULL,
    "target_type" VARCHAR(64) NOT NULL,
    "target_id" VARCHAR(64) NOT NULL,
    "details" JSONB NOT NULL DEFAULT '{}',
    "ip_address" VARCHAR(64),
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "admin_audit_events_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "fk_admin_audit_events_tenant" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "fk_admin_audit_events_actor" FOREIGN KEY ("actor_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "admin_audit_events_tenant_id_created_at_idx" ON "admin_audit_events"("tenant_id", "created_at" DESC);
CREATE INDEX IF NOT EXISTS "admin_audit_events_action_idx" ON "admin_audit_events"("action");
