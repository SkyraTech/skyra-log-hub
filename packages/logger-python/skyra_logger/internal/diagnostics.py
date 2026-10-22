"""
Internal diagnostics emitter for Skyra Logger.
Safely emits telemetry about internal logging state to stderr without recursion or throwing.
"""

import sys
from typing import Optional


def emit_internal_diagnostic(code: str, message: str, exc: Optional[Exception] = None) -> None:
    """
    Safely prints an internal logger diagnostic message to stderr.
    Never throws an exception or calls back into the logging subsystem.
    """
    try:
        err_msg = f" [error={type(exc).__name__}: {exc}]" if exc else ""
        sys.stderr.write(f"[SkyraLogger:{code}] {message}{err_msg}\n")
        sys.stderr.flush()
    except Exception:
        # Prevent any diagnostic error from propagating
        pass
