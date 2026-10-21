"""
Canonical Skyra Log Event Schema v1.0.0.
Pinned to JSON Schema Draft 2020-12 and Elastic Common Schema (ECS) 8.11.0.

NOTE: Auto-generated from contracts/schemas/v1/log-event.schema.json
Run `pnpm run sync:schemas` to synchronize or `pnpm run check:schema-sync` to verify.
"""

LOG_EVENT_SCHEMA_V1 = {
    "$schema": "https://json-schema.org/draft/2020-12/schema",
    "$id": "https://specs.skyra-tech.com/schemas/logging/v1/log-event.schema.json",
    "title": "SkyraLogEventV1",
    "description": "Canonical language-neutral structured log event envelope for Skyra Tech applications and microservices (ECS 8.11.0 compatible).",
    "type": "object",
    "required": [
        "@timestamp",
        "ecs.version",
        "event",
        "log",
        "message",
        "service",
        "skyra"
    ],
    "properties": {
        "@timestamp": {
            "type": "string",
            "description": "RFC3339 UTC timestamp representing event occurrence time. Must end with Z.",
            "pattern": "^[0-9]{4}-(0[1-9]|1[0-2])-(0[1-9]|[12][0-9]|3[01])T([01][0-9]|2[0-3]):[0-5][0-9]:[0-5][0-9](\\.[0-9]{1,9})?Z$"
        },
        "ecs.version": {
            "type": "string",
            "description": "Elastic Common Schema specification version (pinned to approved ECS 8.11.0 baseline).",
            "const": "8.11.0"
        },
        "event": {
            "type": "object",
            "required": [
                "id"
            ],
            "properties": {
                "id": {
                    "type": "string",
                    "description": "Canonical RFC 4122 UUIDv4 identifier for the event, stable on retries.",
                    "pattern": "^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-4[0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$"
                },
                "action": {
                    "type": "string",
                    "description": "Structured action name. Canonical forms use dot-notation (e.g. http.request.completed, database.query.completed, job.execution.completed, auth.login.failed). Historical underscore forms are normalized.",
                    "pattern": "^[a-z0-9_]+([._][a-z0-9_]+)*$",
                    "maxLength": 128
                },
                "dataset": {
                    "type": "string",
                    "description": "Event dataset identifier (e.g. skyra.application, skyra.audit).",
                    "maxLength": 128
                },
                "category": {
                    "type": "array",
                    "description": "ECS event categories.",
                    "items": {
                        "type": "string",
                        "enum": [
                            "web",
                            "database",
                            "authentication",
                            "iam",
                            "process",
                            "network",
                            "job",
                            "audit",
                            "configuration"
                        ]
                    }
                },
                "type": {
                    "type": "array",
                    "description": "ECS event types.",
                    "items": {
                        "type": "string",
                        "enum": [
                            "access",
                            "change",
                            "start",
                            "end",
                            "info",
                            "error",
                            "connection"
                        ]
                    }
                },
                "outcome": {
                    "type": "string",
                    "enum": [
                        "success",
                        "failure",
                        "unknown"
                    ]
                },
                "duration": {
                    "type": "integer",
                    "minimum": 0,
                    "description": "Total duration in nanoseconds (ECS convention)."
                }
            },
            "additionalProperties": False
        },
        "log": {
            "type": "object",
            "required": [
                "level"
            ],
            "properties": {
                "level": {
                    "type": "string",
                    "enum": [
                        "trace",
                        "debug",
                        "info",
                        "warn",
                        "error",
                        "fatal"
                    ]
                },
                "logger": {
                    "type": "string",
                    "maxLength": 128
                }
            },
            "additionalProperties": False
        },
        "message": {
            "type": "string",
            "minLength": 1,
            "maxLength": 8192,
            "description": "Sanitized human-readable log summary string."
        },
        "service": {
            "type": "object",
            "required": [
                "name",
                "environment"
            ],
            "properties": {
                "name": {
                    "type": "string",
                    "pattern": "^[a-z0-9-]+$",
                    "minLength": 2,
                    "maxLength": 64
                },
                "environment": {
                    "type": "string",
                    "description": "Deployment environment. Canonical names: local, development, test, staging, production. Legacy aliases: dev, qa.",
                    "enum": [
                        "local",
                        "development",
                        "test",
                        "staging",
                        "production",
                        "dev",
                        "qa"
                    ]
                },
                "version": {
                    "type": "string",
                    "maxLength": 64
                },
                "node": {
                    "type": "object",
                    "properties": {
                        "name": {
                            "type": "string",
                            "maxLength": 128
                        }
                    },
                    "additionalProperties": False
                }
            },
            "additionalProperties": False
        },
        "skyra": {
            "type": "object",
            "required": [
                "project_id",
                "schema_version"
            ],
            "properties": {
                "project_id": {
                    "type": "string",
                    "pattern": "^[a-z0-9-]+$",
                    "minLength": 2,
                    "maxLength": 64
                },
                "schema_version": {
                    "type": "string",
                    "pattern": "^1\\.[0-9]+(\\.[0-9]+)?$"
                },
                "component": {
                    "type": "string",
                    "maxLength": 64
                },
                "duration_ms": {
                    "type": "number",
                    "minimum": 0,
                    "description": "Human-readable duration measurement in milliseconds."
                },
                "http": {
                    "type": "object",
                    "properties": {
                        "route_template": {
                            "type": "string",
                            "maxLength": 256
                        }
                    },
                    "additionalProperties": False
                },
                "db": {
                    "type": "object",
                    "properties": {
                        "query_fingerprint": {
                            "type": "string",
                            "maxLength": 1024,
                            "description": "Normalized SQL query pattern hash or parameterized template. Zero raw bind parameters."
                        },
                        "client_duration_ms": {
                            "type": "number",
                            "minimum": 0
                        }
                    },
                    "additionalProperties": False
                },
                "job": {
                    "type": "object",
                    "properties": {
                        "id": {
                            "type": "string",
                            "maxLength": 128
                        },
                        "type": {
                            "type": "string",
                            "maxLength": 64
                        },
                        "status": {
                            "type": "string",
                            "enum": [
                                "queued",
                                "running",
                                "completed",
                                "failed",
                                "cancelled"
                            ]
                        },
                        "queue_duration_ms": {
                            "type": "number",
                            "minimum": 0
                        },
                        "attempt": {
                            "type": "integer",
                            "minimum": 1
                        }
                    },
                    "additionalProperties": False
                },
                "audit": {
                    "type": "object",
                    "properties": {
                        "actor_id": {
                            "type": "string",
                            "maxLength": 128
                        },
                        "action": {
                            "type": "string",
                            "maxLength": 128
                        },
                        "resource_type": {
                            "type": "string",
                            "maxLength": 128
                        },
                        "resource_id": {
                            "type": "string",
                            "maxLength": 128
                        }
                    },
                    "additionalProperties": False
                },
                "security": {
                    "type": "object",
                    "properties": {
                        "audit": {
                            "type": "boolean"
                        },
                        "event_type": {
                            "type": "string",
                            "maxLength": 64
                        },
                        "subject_id": {
                            "type": "string",
                            "maxLength": 128
                        },
                        "decision": {
                            "type": "string",
                            "enum": [
                                "allow",
                                "deny"
                            ]
                        },
                        "auth_mechanism": {
                            "type": "string",
                            "maxLength": 64
                        },
                        "client_ip": {
                            "type": "string",
                            "maxLength": 45
                        }
                    },
                    "additionalProperties": True
                },
                "business": {
                    "type": "object",
                    "description": "Structured business telemetry metadata (strictly free of PII and credentials).",
                    "additionalProperties": True
                }
            },
            "additionalProperties": False
        },
        "trace": {
            "type": "object",
            "required": [
                "id"
            ],
            "properties": {
                "id": {
                    "type": "string",
                    "pattern": "^[0-9a-fA-F]{32}$",
                    "description": "W3C standard 32-hex trace identifier."
                }
            },
            "additionalProperties": False
        },
        "span": {
            "type": "object",
            "required": [
                "id"
            ],
            "properties": {
                "id": {
                    "type": "string",
                    "pattern": "^[0-9a-fA-F]{16}$",
                    "description": "W3C standard 16-hex span identifier."
                }
            },
            "additionalProperties": False
        },
        "http": {
            "type": "object",
            "properties": {
                "request": {
                    "type": "object",
                    "required": [
                        "method"
                    ],
                    "properties": {
                        "method": {
                            "type": "string",
                            "enum": [
                                "GET",
                                "POST",
                                "PUT",
                                "PATCH",
                                "DELETE",
                                "HEAD",
                                "OPTIONS",
                                "CONNECT",
                                "TRACE"
                            ]
                        },
                        "id": {
                            "type": "string",
                            "maxLength": 128
                        }
                    },
                    "additionalProperties": False
                },
                "response": {
                    "type": "object",
                    "required": [
                        "status_code"
                    ],
                    "properties": {
                        "status_code": {
                            "type": "integer",
                            "minimum": 100,
                            "maximum": 599
                        },
                        "bytes": {
                            "type": "integer",
                            "minimum": 0
                        }
                    },
                    "additionalProperties": False
                },
                "route": {
                    "type": "string",
                    "maxLength": 256
                }
            },
            "additionalProperties": False
        },
        "url": {
            "type": "object",
            "properties": {
                "path": {
                    "type": "string",
                    "maxLength": 1024
                },
                "query": {
                    "type": "string",
                    "maxLength": 2048
                },
                "domain": {
                    "type": "string",
                    "maxLength": 256
                },
                "port": {
                    "type": "integer",
                    "minimum": 1,
                    "maximum": 65535
                }
            },
            "additionalProperties": False
        },
        "client": {
            "type": "object",
            "properties": {
                "ip": {
                    "type": "string",
                    "maxLength": 45
                },
                "port": {
                    "type": "integer",
                    "minimum": 1,
                    "maximum": 65535
                }
            },
            "additionalProperties": False
        },
        "user_agent": {
            "type": "object",
            "properties": {
                "original": {
                    "type": "string",
                    "maxLength": 512
                }
            },
            "additionalProperties": False
        },
        "user": {
            "type": "object",
            "properties": {
                "id": {
                    "type": "string",
                    "maxLength": 128
                },
                "name": {
                    "type": "string",
                    "maxLength": 128
                },
                "email": {
                    "type": "string",
                    "maxLength": 256
                },
                "roles": {
                    "type": "array",
                    "items": {
                        "type": "string",
                        "maxLength": 64
                    }
                }
            },
            "additionalProperties": False
        },
        "database": {
            "type": "object",
            "properties": {
                "system": {
                    "type": "string",
                    "enum": [
                        "postgresql",
                        "mysql",
                        "sqlite",
                        "duckdb",
                        "valkey",
                        "redis",
                        "elasticsearch",
                        "mongodb",
                        "oracle",
                        "sqlserver"
                    ]
                },
                "name": {
                    "type": "string",
                    "maxLength": 128
                },
                "operation": {
                    "type": "string",
                    "maxLength": 32
                },
                "table": {
                    "type": "string",
                    "maxLength": 128
                },
                "statement_sanitized": {
                    "type": "string",
                    "maxLength": 4096,
                    "description": "Sanitized query fingerprint with parameters replaced by placeholders."
                },
                "rows_affected": {
                    "type": "integer",
                    "minimum": 0
                }
            },
            "additionalProperties": False
        },
        "error": {
            "type": "object",
            "required": [
                "type",
                "message"
            ],
            "properties": {
                "type": {
                    "type": "string",
                    "minLength": 1,
                    "maxLength": 256
                },
                "message": {
                    "type": "string",
                    "minLength": 1,
                    "maxLength": 4096
                },
                "code": {
                    "oneOf": [
                        {
                            "type": "string",
                            "maxLength": 64
                        },
                        {
                            "type": "integer"
                        }
                    ]
                },
                "stack_trace": {
                    "type": "string",
                    "maxLength": 16384
                }
            },
            "additionalProperties": False
        },
        "job": {
            "type": "object",
            "required": [
                "name"
            ],
            "properties": {
                "name": {
                    "type": "string",
                    "minLength": 1,
                    "maxLength": 128
                },
                "id": {
                    "type": "string",
                    "maxLength": 128
                },
                "queue": {
                    "type": "string",
                    "maxLength": 128
                },
                "attempt": {
                    "type": "integer",
                    "minimum": 1
                },
                "max_attempts": {
                    "type": "integer",
                    "minimum": 1
                }
            },
            "additionalProperties": False
        },
        "host": {
            "type": "object",
            "properties": {
                "hostname": {
                    "type": "string",
                    "maxLength": 256
                },
                "name": {
                    "type": "string",
                    "maxLength": 256
                },
                "ip": {
                    "type": "array",
                    "items": {
                        "type": "string",
                        "maxLength": 45
                    }
                },
                "id": {
                    "type": "string",
                    "maxLength": 128
                }
            },
            "additionalProperties": False
        },
        "process": {
            "type": "object",
            "properties": {
                "pid": {
                    "type": "integer",
                    "minimum": 0
                }
            },
            "additionalProperties": False
        },
        "labels": {
            "type": "object",
            "description": "Key-value string pairs for user-defined attributes.",
            "additionalProperties": {
                "type": "string",
                "maxLength": 256
            }
        },
        "tags": {
            "type": "array",
            "description": "Array of tags.",
            "items": {
                "type": "string",
                "maxLength": 64
            }
        }
    },
    "additionalProperties": False
}
