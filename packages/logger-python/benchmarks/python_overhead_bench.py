"""
Reproducible Performance Benchmarks for Skyra Python Logger.
Fulfills requirements of Task LOGHUB-PKG-005 Section 24:
- Measures submitted vs written ops/sec
- Latencies (p50, p95, p99)
- Queue memory & drop rates
- Redaction & schema validation overhead
- Multi-threaded burst & fsync latency
"""

import os
import platform
import sys
import tempfile
import threading
import time
from pathlib import Path
from typing import Any, Dict, List

# Add packages/logger-python to path
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from skyra_logger import (
    create_skyra_logger,
    redact_sensitive_data,
    validate_log_event,
)
from skyra_logger.config import ResourceLimits


def calculate_percentiles(latencies_ns: List[int]) -> Dict[str, float]:
    if not latencies_ns:
        return {"p50_us": 0.0, "p95_us": 0.0, "p99_us": 0.0}
    sorted_lats = sorted(latencies_ns)
    n = len(sorted_lats)
    p50 = sorted_lats[int(n * 0.50)] / 1000.0  # microseconds
    p95 = sorted_lats[min(int(n * 0.95), n - 1)] / 1000.0
    p99 = sorted_lats[min(int(n * 0.99), n - 1)] / 1000.0
    return {"p50_us": round(p50, 2), "p95_us": round(p95, 2), "p99_us": round(p99, 2)}


def run_benchmarks():
    print("=" * 80)
    print("SKYRA LOGHUB — PYTHON LOGGER PERFORMANCE BENCHMARK SUITE (LOGHUB-PKG-005)")
    print("=" * 80)

    # Environment specs
    py_ver = f"{sys.version_info.major}.{sys.version_info.minor}.{sys.version_info.micro}"
    os_info = f"{platform.system()} {platform.release()} ({platform.machine()})"
    cpu_count = os.cpu_count() or 1
    print(f"Python Version : {py_ver}")
    print(f"Operating System: {os_info}")
    print(f"Logical CPUs   : {cpu_count}")
    print("=" * 80)

    results = []

    # Scenario 1: Small Informational Events (Stdout transport - simulated via devnull)
    print("\n[Scenario 1] Small Informational Events (Stdout transport, 10,000 iterations)...")
    logger_s1 = create_skyra_logger(
        project_id="bench-skyra",
        service_name="bench-stdout",
        transport={"type": "stdout"},
    )
    # Redirect write to null sink for benchmark purity
    logger_s1.transport.write = lambda lvl, line, cnt: None  # type: ignore

    latencies_s1 = []
    t0 = time.perf_counter()
    for i in range(10_000):
        start = time.perf_counter_ns()
        logger_s1.info("Order processed successfully", {"index": i, "order_id": f"ord_{i}"})
        latencies_s1.append(time.perf_counter_ns() - start)

    logger_s1.flush()
    elapsed_s1 = time.perf_counter() - t0
    logger_s1.close()
    stats_s1 = calculate_percentiles(latencies_s1)
    rate_s1 = 10_000 / elapsed_s1
    print(f"  -> Rate: {rate_s1:,.1f} events/sec | Elapsed: {elapsed_s1:.3f}s | Latency: p50={stats_s1['p50_us']}µs, p95={stats_s1['p95_us']}µs, p99={stats_s1['p99_us']}µs")
    results.append(("Scenario 1: Small Informational Events (Stdout)", 10000, 10000, 0, rate_s1, stats_s1))

    # Scenario 2: Typical Structured Events (JSONL File Transport, 10,000 iterations)
    print("\n[Scenario 2] Typical Structured Events (JSONL File Transport, 10,000 iterations)...")
    with tempfile.TemporaryDirectory() as temp_dir:
        logger_s2 = create_skyra_logger(
            project_id="bench-skyra",
            service_name="bench-file",
            transport={"type": "file", "directory": temp_dir},
            fsync_on_levels=set(),  # asynchronous durability benchmark
        )

        latencies_s2 = []
        t0 = time.perf_counter()
        for i in range(10_000):
            start = time.perf_counter_ns()
            logger_s2.info(
                f"HTTP request completed: GET /api/v1/customers/{i}",
                {
                    "component": "http-gateway",
                    "action": "http.request.completed",
                    "outcome": "success",
                    "duration_ms": 14.5,
                    "http": {"request": {"method": "GET"}, "response": {"status_code": 200}},
                    "user_id": f"usr_{i}",
                    "tags": ["api", "read"],
                },
            )
            latencies_s2.append(time.perf_counter_ns() - start)

        logger_s2.flush()
        elapsed_s2 = time.perf_counter() - t0
        status_s2 = logger_s2.get_status()
        logger_s2.close()
        stats_s2 = calculate_percentiles(latencies_s2)
        rate_s2 = status_s2["total_events_written"] / elapsed_s2
        print(f"  -> Written: {status_s2['total_events_written']:,} | Rate: {rate_s2:,.1f} ops/sec | Elapsed: {elapsed_s2:.3f}s | Latency: p50={stats_s2['p50_us']}µs, p95={stats_s2['p95_us']}µs, p99={stats_s2['p99_us']}µs")
        results.append(("Scenario 2: Typical Structured Events (File)", 10000, status_s2["total_events_written"], status_s2["total_events_dropped"], rate_s2, stats_s2))

    # Scenario 3: Errors with Stack Traces & Synchronous Fsync (1,000 iterations)
    print("\n[Scenario 3] Errors with Stack Traces & Fsync (1,000 iterations)...")
    with tempfile.TemporaryDirectory() as temp_dir:
        logger_s3 = create_skyra_logger(
            project_id="bench-skyra",
            service_name="bench-fsync",
            transport={"type": "file", "directory": temp_dir},
            fsync_on_levels={"error", "fatal"},
        )

        latencies_s3 = []
        sample_err = ValueError("Payment processor transaction declined")
        t0 = time.perf_counter()
        for i in range(1_000):
            start = time.perf_counter_ns()
            logger_s3.error("Payment failure", {"error": sample_err, "transaction_id": f"txn_{i}"})
            latencies_s3.append(time.perf_counter_ns() - start)

        logger_s3.flush()
        elapsed_s3 = time.perf_counter() - t0
        status_s3 = logger_s3.get_status()
        logger_s3.close()
        stats_s3 = calculate_percentiles(latencies_s3)
        rate_s3 = status_s3["total_events_written"] / elapsed_s3
        print(f"  -> Written: {status_s3['total_events_written']:,} | Fsynced: {status_s3['total_events_fsynced']:,} | Rate: {rate_s3:,.1f} ops/sec | Elapsed: {elapsed_s3:.3f}s | Latency: p50={stats_s3['p50_us']}µs, p95={stats_s3['p95_us']}µs, p99={stats_s3['p99_us']}µs")
        results.append(("Scenario 3: Errors with Stack Traces & Fsync", 1000, status_s3["total_events_written"], status_s3["total_events_dropped"], rate_s3, stats_s3))

    # Scenario 4: Deep Redaction Engine Overhead (10,000 iterations)
    print("\n[Scenario 4] Deep Redaction Engine (10,000 iterations)...")
    payload = {
        "user": {"name": "Alice", "password": "SuperSecretPassword123!", "token": "Bearer abc123def456"},
        "payment": {"cardNumber": "4111 2222 3333 4444", "cvv": "123", "amount": 99.95},
        "connection": "postgres://admin:secretpass@db:5432/orders",
    }
    latencies_s4 = []
    t0 = time.perf_counter()
    for _ in range(10_000):
        start = time.perf_counter_ns()
        redact_sensitive_data(payload)
        latencies_s4.append(time.perf_counter_ns() - start)
    elapsed_s4 = time.perf_counter() - t0
    stats_s4 = calculate_percentiles(latencies_s4)
    rate_s4 = 10_000 / elapsed_s4
    print(f"  -> Redaction Rate: {rate_s4:,.1f} ops/sec | Elapsed: {elapsed_s4:.3f}s | Latency: p50={stats_s4['p50_us']}µs, p95={stats_s4['p95_us']}µs, p99={stats_s4['p99_us']}µs")
    results.append(("Scenario 4: Deep Redaction Engine", 10000, 10000, 0, rate_s4, stats_s4))

    # Scenario 5: Schema Validation Overhead (10,000 iterations)
    print("\n[Scenario 5] Draft 2020-12 Schema Validation (10,000 iterations)...")
    sample_event = {
        "@timestamp": "2026-10-22T10:00:00.000Z",
        "ecs.version": "8.11.0",
        "event": {"id": "fe09617d-2b47-49f4-8c8a-788e040a4309", "action": "http.request.completed", "outcome": "success", "duration": 15000000},
        "log": {"level": "info"},
        "message": "Benchmark test event",
        "service": {"name": "bench-validator", "environment": "production"},
        "skyra": {"schema_version": "1.0", "project_id": "skyra-bench", "duration_ms": 15.0},
        "host": {"hostname": "bench-host"},
    }
    latencies_s5 = []
    t0 = time.perf_counter()
    for _ in range(10_000):
        start = time.perf_counter_ns()
        validate_log_event(sample_event)
        latencies_s5.append(time.perf_counter_ns() - start)
    elapsed_s5 = time.perf_counter() - t0
    stats_s5 = calculate_percentiles(latencies_s5)
    rate_s5 = 10_000 / elapsed_s5
    print(f"  -> Validation Rate: {rate_s5:,.1f} ops/sec | Elapsed: {elapsed_s5:.3f}s | Latency: p50={stats_s5['p50_us']}µs, p95={stats_s5['p95_us']}µs, p99={stats_s5['p99_us']}µs")
    results.append(("Scenario 5: Schema Validation Overhead", 10000, 10000, 0, rate_s5, stats_s5))

    # Scenario 6: High-Concurrency Multithreaded Burst (8 threads x 1,250 events = 10,000 events)
    print("\n[Scenario 6] Multithreaded Concurrent Burst (8 threads, 10,000 total events)...")
    with tempfile.TemporaryDirectory() as temp_dir:
        logger_s6 = create_skyra_logger(
            project_id="bench-skyra",
            service_name="bench-threaded",
            transport={"type": "file", "directory": temp_dir},
            fsync_on_levels=set(),
        )

        num_threads = 8
        events_per_thread = 1_250

        def thread_task(tid: int):
            for i in range(events_per_thread):
                logger_s6.info(f"Thread {tid} event {i}", {"thread_id": tid, "seq": i})

        threads = [threading.Thread(target=thread_task, args=(t,)) for t in range(num_threads)]
        t0 = time.perf_counter()
        for t in threads:
            t.start()
        for t in threads:
            t.join()

        logger_s6.flush()
        elapsed_s6 = time.perf_counter() - t0
        status_s6 = logger_s6.get_status()
        logger_s6.close()
        rate_s6 = status_s6["total_events_written"] / elapsed_s6
        print(f"  -> Written: {status_s6['total_events_written']:,} | Rate: {rate_s6:,.1f} ops/sec | Elapsed: {elapsed_s6:.3f}s | Drops: {status_s6['total_events_dropped']}")
        results.append(("Scenario 6: Multithreaded Burst (8 threads)", 10000, status_s6["total_events_written"], status_s6["total_events_dropped"], rate_s6, {"p50_us": 0, "p95_us": 0, "p99_us": 0}))

    # Scenario 7: Queue Saturation & Backpressure
    print("\n[Scenario 7] Queue Saturation & Backpressure (10,000 events with 500 queue limit)...")
    limits_s7 = ResourceLimits(max_pending_events=500, max_queue_memory_bytes=64 * 1024)
    with tempfile.TemporaryDirectory() as temp_dir:
        logger_s7 = create_skyra_logger(
            project_id="bench-skyra",
            service_name="bench-sat",
            limits=limits_s7,
            transport={"type": "file", "directory": temp_dir},
            fsync_on_levels=set(),
        )

        t0 = time.perf_counter()
        for i in range(10_000):
            # Mix normal and critical events
            if i % 10 == 0:
                logger_s7.error(f"Critical error {i}", {"component": "sat", "index": i})
            else:
                logger_s7.info(f"Normal load event {i}", {"component": "sat", "index": i})

        logger_s7.flush()
        elapsed_s7 = time.perf_counter() - t0
        status_s7 = logger_s7.get_status()
        logger_s7.close()
        rate_s7 = status_s7["total_events_submitted"] / elapsed_s7
        print(f"  -> Submitted: {status_s7['total_events_submitted']:,} | Written: {status_s7['total_events_written']:,} | Dropped: {status_s7['total_events_dropped']:,} | Rate: {rate_s7:,.1f} submitted/sec | Elapsed: {elapsed_s7:.3f}s")
        results.append(("Scenario 7: Queue Saturation", status_s7["total_events_submitted"], status_s7["total_events_written"], status_s7["total_events_dropped"], rate_s7, {"p50_us": 0, "p95_us": 0, "p99_us": 0}))

    print("\n" + "=" * 80)
    print("BENCHMARK SUMMARY TABLE")
    print("=" * 80)
    print(f"{'Scenario':<45} | {'Submitted':<10} | {'Written':<10} | {'Dropped':<8} | {'Throughput':<14} | {'p50 (µs)':<10}")
    print("-" * 105)
    for name, sub, wrt, drp, rate, stats in results:
        p50_str = f"{stats['p50_us']}" if stats["p50_us"] > 0 else "N/A"
        print(f"{name:<45} | {sub:<10} | {wrt:<10} | {drp:<8} | {rate:>10,.1f}/s | {p50_str:<10}")
    print("=" * 80)


if __name__ == "__main__":
    run_benchmarks()
