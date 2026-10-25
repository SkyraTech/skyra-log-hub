-- CreateEnum
CREATE TYPE "TenantStatus" AS ENUM ('ACTIVE', 'SUSPENDED', 'DECOMMISSIONED');

-- CreateEnum
CREATE TYPE "ProjectStatus" AS ENUM ('ACTIVE', 'SUSPENDED', 'ARCHIVED');

-- CreateTable
CREATE TABLE "tenants" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "code" VARCHAR(64) NOT NULL,
    "name" VARCHAR(255) NOT NULL,
    "status" "TenantStatus" NOT NULL DEFAULT 'ACTIVE',
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "tenants_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "projects" (
    "id" VARCHAR(64) NOT NULL,
    "tenant_id" UUID NOT NULL,
    "name" VARCHAR(255) NOT NULL,
    "status" "ProjectStatus" NOT NULL DEFAULT 'ACTIVE',
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "projects_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ingestion_credentials" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "key_hash" VARCHAR(64) NOT NULL,
    "key_prefix" VARCHAR(24) NOT NULL,
    "description" VARCHAR(255) NOT NULL,
    "allowed_projects" TEXT[] NOT NULL,
    "allowed_environments" TEXT[] NOT NULL,
    "rate_limit_per_minute" INTEGER NOT NULL DEFAULT 600,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMPTZ NOT NULL,
    "is_revoked" BOOLEAN NOT NULL DEFAULT false,
    "last_used_at" TIMESTAMPTZ,

    CONSTRAINT "ingestion_credentials_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "project_quotas" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "project_id" VARCHAR(64) NOT NULL,
    "max_batch_size" INTEGER NOT NULL DEFAULT 500,
    "max_payload_bytes" INTEGER NOT NULL DEFAULT 5242880,
    "max_events_per_sec" INTEGER NOT NULL DEFAULT 5000,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "project_quotas_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "archive_segments" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" VARCHAR(64) NOT NULL,
    "project_id" VARCHAR(64) NOT NULL,
    "environment" VARCHAR(32) NOT NULL,
    "service_name" VARCHAR(64) NOT NULL,
    "date" VARCHAR(10) NOT NULL,
    "segment_filename" VARCHAR(64) NOT NULL,
    "record_count" INTEGER NOT NULL,
    "byte_size" BIGINT NOT NULL,
    "sha256_checksum" VARCHAR(64) NOT NULL,
    "first_event_timestamp" TIMESTAMPTZ NOT NULL,
    "last_event_timestamp" TIMESTAMPTZ NOT NULL,
    "finalized_at" TIMESTAMPTZ NOT NULL,
    "writer_instance_id" VARCHAR(128) NOT NULL,
    "journal_segment_id" VARCHAR(64) NOT NULL,
    "journal_start_offset" BIGINT NOT NULL,
    "journal_end_offset" BIGINT NOT NULL,

    CONSTRAINT "archive_segments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "deduplication_receipts" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" VARCHAR(64) NOT NULL,
    "project_id" VARCHAR(64) NOT NULL,
    "batch_id" VARCHAR(64) NOT NULL,
    "content_digest" VARCHAR(71) NOT NULL,
    "journal_segment" VARCHAR(64) NOT NULL,
    "journal_offset" BIGINT NOT NULL,
    "accepted_count" INTEGER NOT NULL,
    "committed_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "deduplication_receipts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ingestion_checkpoints" (
    "id" VARCHAR(64) NOT NULL,
    "journal_segment" VARCHAR(64) NOT NULL,
    "byte_offset" BIGINT NOT NULL,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "ingestion_checkpoints_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "tenants_code_key" ON "tenants"("code");

-- CreateIndex
CREATE UNIQUE INDEX "ingestion_credentials_key_hash_key" ON "ingestion_credentials"("key_hash");

-- CreateIndex
CREATE INDEX "ingestion_credentials_tenant_id_idx" ON "ingestion_credentials"("tenant_id");

-- CreateIndex
CREATE UNIQUE INDEX "project_quotas_tenant_id_project_id_key" ON "project_quotas"("tenant_id", "project_id");

-- CreateIndex
CREATE INDEX "archive_segments_tenant_id_project_id_date_idx" ON "archive_segments"("tenant_id", "project_id", "date");

-- CreateIndex
CREATE UNIQUE INDEX "archive_segments_tenant_id_project_id_environment_service_n_key" ON "archive_segments"("tenant_id", "project_id", "environment", "service_name", "date", "segment_filename");

-- CreateIndex
CREATE INDEX "deduplication_receipts_expires_at_idx" ON "deduplication_receipts"("expires_at");

-- CreateIndex
CREATE UNIQUE INDEX "deduplication_receipts_tenant_id_project_id_batch_id_key" ON "deduplication_receipts"("tenant_id", "project_id", "batch_id");

-- AddForeignKey
ALTER TABLE "projects" ADD CONSTRAINT "projects_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ingestion_credentials" ADD CONSTRAINT "ingestion_credentials_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_quotas" ADD CONSTRAINT "project_quotas_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_quotas" ADD CONSTRAINT "project_quotas_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;
