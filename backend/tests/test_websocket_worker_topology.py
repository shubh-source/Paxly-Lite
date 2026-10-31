import pytest
import os
import asyncio
from app.websocket.manager import ConnectionManager, InMemoryBroker
from app.core.config import settings

class MockWebSocket:
    def __init__(self, name: str = "mock_ws"):
        self.name = name
        self.sent_messages = []
        self.closed = False

    async def send_json(self, data: dict):
        if self.closed:
            raise ConnectionResetError("Socket closed")
        self.sent_messages.append(data)

@pytest.mark.asyncio
async def test_cross_worker_message_and_reaction_delivery_via_broker():
    # Setup shared broker across two worker managers
    broker = InMemoryBroker()
    worker_1_manager = ConnectionManager(broker=broker)
    worker_2_manager = ConnectionManager(broker=broker)

    ws_alice = MockWebSocket("alice_worker_1")
    ws_bob = MockWebSocket("bob_worker_2")

    space_id = "space_cross_worker_alpha"

    # Alice connects to Worker 1
    await worker_1_manager.connect(ws_alice, space_id=space_id, user_id="u_alice")
    # Bob connects to Worker 2
    await worker_2_manager.connect(ws_bob, space_id=space_id, user_id="u_bob")

    # 1. Alice sends a chat message on Worker 1 to space_id
    chat_payload = {
        "type": "chat_message",
        "message_id": "msg_cross_101",
        "sender_id": "u_alice",
        "text": "Hello Bob from Worker 1!"
    }
    await worker_1_manager.send_to_space(
        space_id=space_id,
        message=chat_payload,
        exclude_user="u_alice"
    )

    # Bob on Worker 2 must receive the message via broker broadcast
    assert len(ws_bob.sent_messages) == 1, "Bob on Worker 2 must receive cross-worker message"
    assert ws_bob.sent_messages[0]["message_id"] == "msg_cross_101"
    # Alice on Worker 1 was excluded, must not receive duplicate
    assert len(ws_alice.sent_messages) == 0

    # 2. Bob sends a reaction on Worker 2 to space_id
    reaction_payload = {
        "type": "reaction",
        "message_id": "msg_cross_101",
        "user_id": "u_bob",
        "emoji": "❤️"
    }
    await worker_2_manager.send_to_space(
        space_id=space_id,
        message=reaction_payload,
        exclude_user="u_bob"
    )

    # Alice on Worker 1 must receive the reaction
    assert len(ws_alice.sent_messages) == 1, "Alice on Worker 1 must receive cross-worker reaction"
    assert ws_alice.sent_messages[0]["emoji"] == "❤️"
    assert ws_alice.sent_messages[0]["message_id"] == "msg_cross_101"

@pytest.mark.asyncio
async def test_cross_worker_couple_space_isolation():
    broker = InMemoryBroker()
    worker_1_manager = ConnectionManager(broker=broker)
    worker_2_manager = ConnectionManager(broker=broker)

    ws_alice_space_a = MockWebSocket("alice_space_a")
    ws_charlie_space_b = MockWebSocket("charlie_space_b")

    # Alice in Space A on Worker 1
    await worker_1_manager.connect(ws_alice_space_a, space_id="space_alpha", user_id="u_alice")
    # Charlie in Space B on Worker 2
    await worker_2_manager.connect(ws_charlie_space_b, space_id="space_beta", user_id="u_charlie")

    # Alice sends a message to Space A
    await worker_1_manager.send_to_space(
        space_id="space_alpha",
        message={"type": "chat_message", "message_id": "msg_sec_1", "text": "Private space A content"}
    )

    # Charlie in Space B must NEVER receive Space A's messages across workers
    assert len(ws_charlie_space_b.sent_messages) == 0, "Cross-worker broadcast must strictly enforce couple space isolation"

@pytest.mark.asyncio
async def test_broker_outage_fallback_and_recovery():
    broker = InMemoryBroker()
    worker_manager = ConnectionManager(broker=broker)

    ws_local_bob = MockWebSocket("bob_local")
    space_id = "space_outage_test"
    await worker_manager.connect(ws_local_bob, space_id=space_id, user_id="u_bob")

    # Simulate broker outage
    broker.is_healthy = False

    # Dispatch to space during broker outage
    # Must NOT raise exception; local delivery must succeed; warning logged cleanly
    outage_msg = {"type": "chat_message", "message_id": "msg_outage_1", "text": "Outage message"}
    await worker_manager.send_to_space(space_id=space_id, message=outage_msg)

    assert len(ws_local_bob.sent_messages) == 1, "Local delivery must still succeed during broker outage"
    assert ws_local_bob.sent_messages[0]["message_id"] == "msg_outage_1"

    # Simulate broker recovery
    broker.is_healthy = True
    recovered_msg = {"type": "chat_message", "message_id": "msg_recovered_2", "text": "Recovered message"}
    await worker_manager.send_to_space(space_id=space_id, message=recovered_msg)
    assert len(ws_local_bob.sent_messages) == 2

def test_worker_topology_validation_and_safety_checks():
    # 1. Default single-worker configuration is validated as safe
    os.environ["WEB_CONCURRENCY"] = "1"
    topo1 = ConnectionManager.check_worker_topology()
    assert topo1["concurrency"] == 1
    assert topo1["is_safe"] is True
    assert topo1["mode"] == "single_worker"

    # 2. Multi-worker without broker detected as unsafe/partitioned
    os.environ["WEB_CONCURRENCY"] = "4"
    # Ensure REDIS_URL is None in settings
    orig_redis = getattr(settings, "REDIS_URL", None)
    settings.REDIS_URL = None
    try:
        topo2 = ConnectionManager.check_worker_topology()
        assert topo2["concurrency"] == 4
        assert topo2["is_safe"] is False
        assert topo2["mode"] == "unsupported_multi_worker_partitioned"

        # 3. Multi-worker with REDIS_URL detected as safe
        settings.REDIS_URL = "redis://localhost:6379/0"
        topo3 = ConnectionManager.check_worker_topology()
        assert topo3["concurrency"] == 4
        assert topo3["is_safe"] is True
        assert topo3["mode"] == "multi_worker_broker"
    finally:
        settings.REDIS_URL = orig_redis
        os.environ["WEB_CONCURRENCY"] = "1"
