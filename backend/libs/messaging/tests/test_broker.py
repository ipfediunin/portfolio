import asyncio
import contextlib

import pytest

from messaging import Broker, QueueUnavailable, Topology

# Nothing listens on port 1: every connection attempt is refused.
UNREACHABLE = "amqp://guest:guest@127.0.0.1:1/"


async def test_cancelling_a_pending_connect_leaves_nothing_running() -> None:
    """A robust connection keeps its own reconnect loop; a service that stops while the broker is
    down must not leave it behind (it would retry forever and block the event loop's shutdown)."""
    broker = Broker(UNREACHABLE, Topology(prefix="probe."))
    connecting = asyncio.create_task(broker.connect())
    await asyncio.sleep(0.3)
    connecting.cancel()
    with contextlib.suppress(asyncio.CancelledError):
        await connecting
    await broker.close()
    await asyncio.sleep(0)
    leftovers = [task for task in asyncio.all_tasks() if task is not asyncio.current_task()]
    assert leftovers == []


def test_without_a_connection_the_broker_refuses_right_away() -> None:
    broker = Broker(UNREACHABLE, Topology(prefix="probe."))
    assert not broker.ready
    with pytest.raises(QueueUnavailable, match="not connected"):
        _ = broker.connection
