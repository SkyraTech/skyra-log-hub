# Skyra Logger (Python)

Canonical ECS-aligned structured logging SDK, strict JSON parser, schema validation, and sensitive-data redaction engine for Skyra Tech Python applications.

## Installation
```bash
pip install skyra-logger
```

## Features
- JSON Schema Draft 2020-12 validation against canonical Skyra Log Event v1.
- Strict duplicate property detection at all object nesting depths.
- Automated sensitive credential redaction (compound keys, JWTs, Bearer tokens, URLs, connection strings).
- Parity with `@skyra/logger-core` TypeScript package.
