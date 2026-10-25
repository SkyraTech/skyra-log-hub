# Skyra LogHub — Ingestion Capacity, Sizing & Cost Model

**Document ID:** `LOGHUB-DOC-ING-008`  
**Task Reference:** `LOGHUB-ING-001A`  
**Phase:** Phase 2 (Centralized Ingestion)  
**Status:** Sizing & Cost Engineering Specification  
**Architecture Reference:** ADR-011, ADR-013, ADR-014

---

## 1. Workload Profiles & Sizing Assumptions

Skyra LogHub architecture distinguishes between:
- **Dashboard / Query Workload:** Sized for **1 owner initially, scaling to 5–10 internal operators**.
- **Ingestion Telemetry Workload:** Sized for observed Skyra platform products, microservices, and web applications running independent customer workloads.

### Canonical Baseline Telemetry Metrics
- **Average Event Size (Uncompressed):** **800 bytes** (Canonical ECS 8.11.0 format with Skyra extensions).
- **Average Event Size (Gzip/Zstd in Parquet):** **160 bytes** (5:1 columnar compression ratio).
- **Batch Packing:** Default 100 events per batch (~80 KiB payload).
- **Peak Batch Constraints:** Maximum 500 events or 5 MiB per request.

---

## 2. Throughput & Storage Sizing Tiers

| Metric | Tier 1 (Pilot / MVP) | Tier 2 (Standard Platform) | Tier 3 (High-Scale Peak) |
|---|---|---|---|
| **Average Events / Sec (EPS)** | 100 EPS | 1,000 EPS | 10,000 EPS |
| **Peak Ingestion EPS** | 500 EPS | 5,000 EPS | 25,000 EPS |
| **Network Ingestion Bandwidth** | 80 KB/s (0.64 Mbps) | 800 KB/s (6.4 Mbps) | 8.0 MB/s (64 Mbps) |
| **Daily Uncompressed Volume** | ~6.9 GB / day | ~69.1 GB / day | ~691 GB / day |
| **Daily Compressed Archive Volume** | ~1.4 GB / day | ~13.8 GB / day | ~138 GB / day |
| **30-Day Retained Archive Volume** | ~42 GB | ~414 GB | ~4.14 TB |
| **Journal WAL Sizing (24h Buffer)** | 10 GB | 100 GB | 1.0 TB |
| **Batches Committed / Sec** | 1 to 5 batches/s | 10 to 50 batches/s | 100 to 250 batches/s |
| **Fsync IOPS Required** | 10–50 IOPS | 50–250 IOPS | 500–1,500 IOPS |

---

## 3. Storage & IOPS Engineering

### 3.1 Write-Ahead Journal IOPS
- Sequential appending requires minimal head movement on NVMe drives.
- A modern NVMe SSD (e.g. Samsung PM9A3 or AWS `gp3` / `io2`) delivers between 3,000 and 64,000 IOPS.
- At 1,000 EPS with 100-event batches, the gateway performs ~10 fsync syscalls per second. This utilizes <1% of a basic NVMe drive's IOPS capacity.
- Group-commit optimizations (aggregating concurrent fsync requests within a 5 ms tick window) allow the single-node gateway to scale comfortably beyond 20,000 EPS.

### 3.2 Compute & Memory Budget
- **Gateway Process (NestJS + Fastify):** 2 vCPU, 2 GiB RAM baseline.
- **Archive Worker & Reconciler:** 1 vCPU, 1 GiB RAM.
- **PostgreSQL (Metadata Only):** 2 vCPU, 4 GiB RAM (retains credentials, checkpoints, and 7-day receipt index).
- **Valkey (Optional Cache):** 1 vCPU, 1 GiB RAM.

---

## 4. Total Cost of Ownership (TCO) Comparison

### Traditional Heavy Stack (Elasticsearch / OpenSearch + Kafka + Logstash)
- **Infrastructure:** 3 Elasticsearch data nodes (16 GB RAM each), 3 Kafka brokers (8 GB RAM each), 2 Logstash workers.
- **Estimated Monthly Cost (AWS/Azure):** **$1,200 – $2,500 / month**.
- **Operational Burden:** JVM heap tuning, shard balancing, split-brain recovery, re-indexing.

### Skyra LogHub File-First Architecture (JSONL + NVMe WAL + DuckDB)
- **Infrastructure:** 1 Primary App/Gateway Host (4 vCPU, 8 GiB RAM, 500 GB NVMe volume) + Small managed PostgreSQL instance.
- **Estimated Monthly Cost (Hetzner / OVH / AWS):** **$60 – $150 / month**.
- **Savings:** **>90% infrastructure cost reduction** while providing strict deterministic recovery and query performance.
