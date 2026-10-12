import pytest
from sqlalchemy import inspect, text
from sqlalchemy.ext.asyncio import create_async_engine

from app.core.database import Base
from app.main import _initialize_database_schema


@pytest.mark.asyncio
async def test_sqlite_startup_migrations_add_legacy_columns_and_are_idempotent(tmp_path):
    database_path = tmp_path / "legacy.db"
    engine = create_async_engine(f"sqlite+aiosqlite:///{database_path}")
    try:
        async with engine.begin() as conn:
            await conn.run_sync(Base.metadata.create_all)
            # Simulate tables from a pre-Aura SQLite database, plus a partial event table.
            await conn.execute(text("ALTER TABLE messages DROP COLUMN sender_name"))
            await conn.execute(text("ALTER TABLE users DROP COLUMN aura_settings"))
            await conn.execute(text("ALTER TABLE users DROP COLUMN crisis_escalation_enabled"))
            await conn.execute(text("DROP TABLE aura_escalation_events"))
            await conn.execute(text("CREATE TABLE aura_escalation_events (id VARCHAR PRIMARY KEY)"))

        async with engine.begin() as conn:
            await _initialize_database_schema(conn)
        async with engine.begin() as conn:
            await _initialize_database_schema(conn)

        async with engine.connect() as conn:
            schema = await conn.run_sync(
                lambda sync_conn: {
                    table: {column["name"] for column in inspect(sync_conn).get_columns(table)}
                    for table in ("messages", "users", "aura_escalation_events")
                }
            )
            assert "sender_name" in schema["messages"]
            assert {"aura_settings", "last_crisis_alert_at", "crisis_escalation_enabled"} <= schema["users"]
            assert {
                "user_id", "target_partner_id", "risk_level", "status", "created_at", "expires_at", "consumed_at"
            } <= schema["aura_escalation_events"]

            await conn.execute(text("INSERT INTO users (id) VALUES ('migration_default_check')"))
            result = await conn.execute(
                text("SELECT crisis_escalation_enabled, aura_settings FROM users WHERE id = 'migration_default_check'")
            )
            enabled, aura_settings = result.one()
            assert enabled in (1, True)
            assert aura_settings == "{}"
    finally:
        await engine.dispose()


@pytest.mark.asyncio
async def test_startup_migrations_reject_unsupported_dialect():
    class UnsupportedConnection:
        class dialect:
            name = "mysql"

    with pytest.raises(RuntimeError, match="Unsupported database dialect"):
        await _initialize_database_schema(UnsupportedConnection())


@pytest.mark.asyncio
async def test_postgresql_startup_path_uses_postgresql_ddl_without_connecting():
    class RecordingConnection:
        class dialect:
            name = "postgresql"

        def __init__(self):
            self.statements = []

        async def run_sync(self, callback):
            # Avoid invoking SQLAlchemy metadata against any actual database.
            return None

        async def execute(self, statement):
            self.statements.append(str(statement))

    conn = RecordingConnection()
    await _initialize_database_schema(conn)
    assert any("reactions JSONB DEFAULT '{}'::jsonb" in statement for statement in conn.statements)
    assert any("ADD COLUMN IF NOT EXISTS" in statement for statement in conn.statements)
    assert any("CREATE TABLE IF NOT EXISTS aura_escalation_events" in statement for statement in conn.statements)
