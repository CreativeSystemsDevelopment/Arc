from __future__ import annotations

import json
import os
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Any

import psycopg
from psycopg.rows import dict_row


def _ensure_sslmode(connection_url: str) -> str:
    normalized = connection_url.strip()
    if "sslmode=" in normalized:
        return normalized
    separator = "&" if "?" in normalized else "?"
    return f"{normalized}{separator}sslmode=require"


def resolve_database_url() -> str | None:
    candidates = (
        os.environ.get("ARC_DATABASE_URL"),
        os.environ.get("NEON_DATABASE_URL"),
        os.environ.get("DATABASE_URL"),
        os.environ.get("GCP_DATABASE_URL"),
    )
    for candidate in candidates:
        if candidate and candidate.strip():
            return _ensure_sslmode(candidate)
    return None


@dataclass
class ParsedEvent:
    event_name: str | None
    event_id: str | None
    payload: dict[str, Any] | None
    runtime_seq: int | None


def parse_sse_event(raw: str) -> ParsedEvent:
    event_name: str | None = None
    event_id: str | None = None
    payload_raw: str | None = None
    for line in raw.splitlines():
        if line.startswith("event: "):
            event_name = line[7:].strip()
        elif line.startswith("id: "):
            event_id = line[4:].strip()
        elif line.startswith("data: "):
            payload_raw = line[6:]

    payload: dict[str, Any] | None = None
    runtime_seq: int | None = None
    if payload_raw:
        try:
            decoded = json.loads(payload_raw)
            if isinstance(decoded, dict):
                payload = decoded
                if event_name == "runtime_event":
                    seq = decoded.get("seq")
                    if isinstance(seq, int):
                        runtime_seq = seq
        except Exception:
            payload = None
    return ParsedEvent(
        event_name=event_name,
        event_id=event_id,
        payload=payload,
        runtime_seq=runtime_seq,
    )


class RunPersistence:
    def __init__(self, database_url: str | None) -> None:
        self._database_url = database_url
        self._enabled = bool(database_url)

    @property
    def enabled(self) -> bool:
        return self._enabled

    def setup(self) -> None:
        if not self._enabled or not self._database_url:
            return
        with psycopg.connect(self._database_url, autocommit=True) as conn:
            with conn.cursor() as cur:
                cur.execute(
                    """
                    CREATE TABLE IF NOT EXISTS arc_runs (
                        run_id TEXT PRIMARY KEY,
                        thread_id TEXT NOT NULL,
                        message TEXT NOT NULL,
                        status TEXT NOT NULL,
                        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                        started_at TIMESTAMPTZ,
                        completed_at TIMESTAMPTZ,
                        error_text TEXT,
                        last_seq BIGINT,
                        last_event_id TEXT
                    );
                    """
                )
                cur.execute(
                    """
                    CREATE TABLE IF NOT EXISTS arc_run_events (
                        id BIGSERIAL PRIMARY KEY,
                        run_id TEXT NOT NULL REFERENCES arc_runs(run_id) ON DELETE CASCADE,
                        event_name TEXT,
                        event_id TEXT,
                        runtime_seq BIGINT,
                        payload JSONB,
                        raw_event TEXT NOT NULL,
                        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
                    );
                    """
                )
                cur.execute(
                    "CREATE INDEX IF NOT EXISTS idx_arc_runs_thread_created ON arc_runs(thread_id, created_at DESC);"
                )
                cur.execute(
                    "CREATE INDEX IF NOT EXISTS idx_arc_run_events_run_id ON arc_run_events(run_id, id);"
                )
                cur.execute(
                    "CREATE INDEX IF NOT EXISTS idx_arc_run_events_runtime_seq ON arc_run_events(run_id, runtime_seq);"
                )
                cur.execute(
                    "CREATE INDEX IF NOT EXISTS idx_arc_run_events_event_id ON arc_run_events(run_id, event_id);"
                )

    def create_run(self, *, run_id: str, thread_id: str, message: str) -> None:
        if not self._enabled or not self._database_url:
            return
        with psycopg.connect(self._database_url, autocommit=True) as conn:
            with conn.cursor() as cur:
                cur.execute(
                    """
                    INSERT INTO arc_runs (run_id, thread_id, message, status)
                    VALUES (%s, %s, %s, 'queued')
                    ON CONFLICT (run_id) DO UPDATE
                    SET thread_id = EXCLUDED.thread_id,
                        message = EXCLUDED.message,
                        status = 'queued',
                        updated_at = NOW();
                    """,
                    (run_id, thread_id, message),
                )

    def mark_running(self, run_id: str) -> None:
        self._update_run_status(run_id, status="running", started_at=datetime.now(timezone.utc))

    def mark_completed(self, run_id: str) -> None:
        self._update_run_status(run_id, status="completed", completed_at=datetime.now(timezone.utc))

    def mark_error(self, run_id: str, error_text: str) -> None:
        self._update_run_status(
            run_id,
            status="error",
            completed_at=datetime.now(timezone.utc),
            error_text=error_text,
        )

    def _update_run_status(
        self,
        run_id: str,
        *,
        status: str,
        started_at: datetime | None = None,
        completed_at: datetime | None = None,
        error_text: str | None = None,
    ) -> None:
        if not self._enabled or not self._database_url:
            return
        with psycopg.connect(self._database_url, autocommit=True) as conn:
            with conn.cursor() as cur:
                cur.execute(
                    """
                    UPDATE arc_runs
                    SET status = %s,
                        updated_at = NOW(),
                        started_at = COALESCE(%s, started_at),
                        completed_at = COALESCE(%s, completed_at),
                        error_text = COALESCE(%s, error_text)
                    WHERE run_id = %s;
                    """,
                    (status, started_at, completed_at, error_text, run_id),
                )

    def append_event(self, run_id: str, raw_event: str) -> None:
        if not self._enabled or not self._database_url:
            return
        parsed = parse_sse_event(raw_event)
        with psycopg.connect(self._database_url, autocommit=True) as conn:
            with conn.cursor() as cur:
                cur.execute(
                    """
                    INSERT INTO arc_run_events (
                        run_id,
                        event_name,
                        event_id,
                        runtime_seq,
                        payload,
                        raw_event
                    )
                    VALUES (%s, %s, %s, %s, %s::jsonb, %s);
                    """,
                    (
                        run_id,
                        parsed.event_name,
                        parsed.event_id,
                        parsed.runtime_seq,
                        json.dumps(parsed.payload) if parsed.payload is not None else None,
                        raw_event,
                    ),
                )
                if parsed.runtime_seq is not None or parsed.event_id is not None:
                    cur.execute(
                        """
                        UPDATE arc_runs
                        SET updated_at = NOW(),
                            last_seq = COALESCE(%s, last_seq),
                            last_event_id = COALESCE(%s, last_event_id)
                        WHERE run_id = %s;
                        """,
                        (parsed.runtime_seq, parsed.event_id, run_id),
                    )

    def list_events_after(
        self,
        *,
        run_id: str,
        last_event_id: str | None = None,
        last_seq: int | None = None,
    ) -> list[str]:
        if not self._enabled or not self._database_url:
            return []
        with psycopg.connect(self._database_url, row_factory=dict_row) as conn:
            with conn.cursor() as cur:
                if last_event_id:
                    cur.execute(
                        """
                        WITH boundary AS (
                            SELECT id
                            FROM arc_run_events
                            WHERE run_id = %s AND event_id = %s
                            ORDER BY id DESC
                            LIMIT 1
                        )
                        SELECT raw_event
                        FROM arc_run_events
                        WHERE run_id = %s
                          AND id > COALESCE((SELECT id FROM boundary), 0)
                        ORDER BY id ASC;
                        """,
                        (run_id, last_event_id, run_id),
                    )
                elif last_seq is not None:
                    cur.execute(
                        """
                        WITH boundary AS (
                            SELECT MIN(id) AS min_id
                            FROM arc_run_events
                            WHERE run_id = %s
                              AND runtime_seq > %s
                        )
                        SELECT raw_event
                        FROM arc_run_events
                        WHERE run_id = %s
                          AND (
                                (SELECT min_id FROM boundary) IS NULL
                                OR id >= (SELECT min_id FROM boundary)
                              )
                        ORDER BY id ASC;
                        """,
                        (run_id, last_seq, run_id),
                    )
                else:
                    cur.execute(
                        """
                        SELECT raw_event
                        FROM arc_run_events
                        WHERE run_id = %s
                        ORDER BY id ASC;
                        """,
                        (run_id,),
                    )
                rows = cur.fetchall()
        return [str(row["raw_event"]) for row in rows]

    def get_run(self, run_id: str) -> dict[str, Any] | None:
        if not self._enabled or not self._database_url:
            return None
        with psycopg.connect(self._database_url, row_factory=dict_row) as conn:
            with conn.cursor() as cur:
                cur.execute(
                    """
                    SELECT run_id, thread_id, message, status, created_at, updated_at,
                           started_at, completed_at, error_text, last_seq, last_event_id
                    FROM arc_runs
                    WHERE run_id = %s;
                    """,
                    (run_id,),
                )
                row = cur.fetchone()
        return dict(row) if row else None

    def list_recoverable_runs(self) -> list[dict[str, Any]]:
        if not self._enabled or not self._database_url:
            return []
        with psycopg.connect(self._database_url, row_factory=dict_row) as conn:
            with conn.cursor() as cur:
                cur.execute(
                    """
                    SELECT run_id, thread_id, message, last_event_id, last_seq
                    FROM arc_runs
                    WHERE status IN ('queued', 'running')
                    ORDER BY created_at ASC;
                    """
                )
                rows = cur.fetchall()
        return [dict(row) for row in rows]
