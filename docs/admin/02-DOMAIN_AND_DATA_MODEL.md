# Skyra LogHub — Administrative Domain & Data Model

**Document Version:** 1.0.0  
**Status:** Approved Architecture Specification  
**Task ID:** `LOGHUB-ADMIN-001`  
**Phase:** Phase 4 — Administration Backend Foundation  
**Date:** 2026-10-28  

---

## 1. Domain Model Overview

The Skyra LogHub administrative domain models organizational boundaries, project segregation, human user identities, authoritative memberships, fine-grained access privileges, machine ingestion credentials, and immutable audit logs.

```text
┌────────────────────────────────────────────────────────────────────────┐
│                              Tenant                                    │
│   (id: UUID, code: "skyra-internal", name: string, status: ACTIVE)     │
└──────────────┬──────────────────────────────────────────┬──────────────┘
               │ 1..*                                     │ 1..*
               ▼                                          ▼
┌──────────────────────────────┐           ┌─────────────────────────────┐
│           Project            │           │      Tenant Membership      │
│ (id: "billing", status: ...) │           │ (userId, tenantId, status)  │
└──────────────┬───────────────┘           └──────────────┬──────────────┘
               │ 1..*                                     │ 1..*
               ├──────────────────┐                       │
               ▼                  ▼                       ▼
┌───────────────────────┐  ┌─────────────┐ ┌─────────────────────────────┐
│  Ingestion Credential │  │Project Quota│ │     Project Membership      │
│  (keyHash, keyPrefix) │  │(maxBytes,..)│ │ (userId, projectId, status) │
└───────────────────────┘  └─────────────┘ └──────────────┬──────────────┘
                                                          │ 1..*
                                                          ▼
                                           ┌─────────────────────────────┐
                                           │       Role Assignment       │
                                           │ (userId, roleId, scope)     │
                                           └─────────────────────────────┘
```

---

## 2. Core Domain Entities & Aggregates

### 2.1 Tenant (Organization Boundary)
Represents a discrete enterprise customer or independent institutional boundary.
- **Identifier:** `id: UUID` (Immutable internal surrogate key).
- **Code:** `code: string` (e.g. `skyra-internal`, `acme-corp`), unique across the platform, used for human-readable slug routing and configuration references.
- **Name:** `name: string` (Display title, up to 255 chars).
- **Status:** Enum `TenantStatus { ACTIVE, SUSPENDED, DECOMMISSIONED }`.
- **Invariants:**
  - Decommissioned or Suspended tenants immediately block all ingestion admissions and analytical query operations.
  - Deletion of a tenant is restricted to authorized platform administrative workflows and triggers cascading archival safeguards.

### 2.2 Project (Observability Logging Namespace)
Represents an application, microservice group, or operational subsystem within a tenant.
- **Identifier:** `id: string` (Canonical kebab-case identifier, e.g. `skyra-tech`, `billing-gateway`), unique within a tenant.
- **Tenant Scope:** `tenantId: UUID` (Foreign key referencing `tenants.id`).
- **Name:** `name: string` (Descriptive name).
- **Status:** Enum `ProjectStatus { ACTIVE, SUSPENDED, ARCHIVED }`.
- **Invariants:**
  - Every project strictly belongs to exactly one tenant.
  - A project cannot be transitioned across tenants under any circumstance.
  - Archiving a project preserves historical canonical JSONL archives and metadata but disables ingestion and issues warnings on query execution.

### 2.3 Environment Concept (Scoped Allowlist)
Rather than introducing a separate, heavyweight `environments` table that introduces excessive join overhead for immutable logging streams, environments are modeled as **validated allowlist collections** scoped to projects and credentials:
- **Canonical Values:** `production`, `staging`, `development`, `local`, `qa`, `dr`.
- **Enforcement:** Stored as `allowedEnvironments: string[]` on `IngestionCredential` and validated on ingestion against canonical naming rules.

### 2.4 User Identity (External OIDC Binding)
Represents a human user whose authentication is delegated to an authoritative corporate OpenID Connect (OIDC) identity provider.
- **Identifier:** `id: UUID` (Stable internal surrogate key).
- **OIDC Issuer:** `issuer: string` (URL of the IdP, e.g. `https://login.microsoftonline.com/tenant-id/v2.0`).
- **OIDC Subject:** `subject: string` (The unchangeable pairwise or public unique user identifier issued by the IdP).
- **Composite Identity Key:** `@@unique([issuer, subject])` — Guarantees that users from different issuers with identical subject strings can never collide or cross-authenticate.
- **Email:** `email: string` (Primary corporate email address, used for display and invitations; NOT the immutable primary key).
- **Display Name:** `displayName: string` (Human-readable name).
- **Status:** Enum `UserStatus { ACTIVE, SUSPENDED, DEACTIVATED }`.
- **Invariants:**
  - Passwords, MFA secrets, and private keys are **never stored** in the Skyra LogHub database.
  - Email addresses are mutable; identity persistence anchors strictly on `(issuer, subject)`.

### 2.5 Tenant Membership (Workspace Access)
Defines that a user is recognized as a member of a specific tenant.
- **Key:** `@@unique([userId, tenantId])`.
- **Status:** Enum `MembershipStatus { PENDING_INVITE, ACTIVE, SUSPENDED, REVOKED }`.
- **Created / Updated Timestamps:** Timestamptz.

### 2.6 Project Membership (Project Scoping)
Defines that a user has authorization to access a specific project within the tenant.
- **Key:** `@@unique([userId, projectId])`.
- **Status:** Enum `MembershipStatus { ACTIVE, SUSPENDED, REVOKED }`.

### 2.7 Roles & Permissions
- **Role:** Named security role (e.g. `OrgOwner`, `OrgAdmin`, `ProjectAdmin`, `Developer`, `Viewer`).
- **Permission:** Granular capability verb (e.g. `projects.create`, `credentials.rotate`, `logs.search`).
- **Role Assignment:** Links a `userId` to a `roleId` within an explicit `tenantId` (and optional `projectId`) scope.

### 2.8 Ingestion Credential (Machine Token Metadata)
Represents a provisioned bearer credential used by log shippers, application SDKs, and ingestion proxies.
- **Identifier:** `id: UUID`.
- **Tenant Scope:** `tenantId: UUID`.
- **Key Hash:** `keyHash: string` (Hex-encoded SHA-256 digest of the raw bearer token, unique across the platform).
- **Key Prefix:** `keyPrefix: string` (First 16–24 characters of the token, e.g. `skyra_live_7c9e6...`, used for audit identification).
- **Allowed Projects:** `allowedProjects: string[]`.
- **Allowed Environments:** `allowedEnvironments: string[]`.
- **Rate Limit:** `rateLimitPerMin: number` (Default 600 requests/minute).
- **Lifecycle Flags:** `isRevoked: boolean`, `expiresAt: DateTime`, `lastUsedAt: DateTime | null`.
- **Rotation Metadata:** `rotatedFromId: UUID | null` (Points to superseded credential during active rotation overlap).

### 2.9 Project Quota (Admission Budget)
Defines enforceable ingestion throughput and payload limits.
- **Key:** `@@unique([tenantId, projectId])`.
- **Constraints:** `maxBatchSize` (default 500), `maxPayloadBytes` (default 5 MiB), `maxEventsPerSec` (default 5,000).

### 2.10 Administrative Audit Event
Tamper-evident record of security and administrative operations.
- **Identifier:** `id: UUID`.
- **Tenant Scope:** `tenantId: UUID`.
- **Actor:** `actorUserId: UUID`, `actorEmail: string`, `actorIp: string`.
- **Action:** Enum `AdminActionType` (e.g. `PROJECT_CREATED`, `CREDENTIAL_ROTATED`, `MEMBER_ROLE_CHANGED`).
- **Target:** `targetType: string`, `targetId: string`.
- **Details:** JSON payload containing sanitized before/after metadata (secrets strictly redacted).
- **Timestamp:** `createdAt: DateTime` (Immutable timestamptz).
