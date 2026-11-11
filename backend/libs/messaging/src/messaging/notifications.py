"""Notifications for the page: filed in the sandbox's inbox and published to the realtime hub.

One Lua script does it all, so a notification is either filed and published or not at all, and
only once: a redelivered job or event finds the marker of its first delivery and changes nothing.
Work without a sandbox (filed under a hashed IP) notifies nobody: no page can listen for it.
"""

from __future__ import annotations

from redis.asyncio import Redis

from contracts import Notification, events_channel, is_sandbox_owner, notifications_key

# A redelivery comes within minutes; the marker outlives it by far.
MARKER_TTL_SECONDS = 86_400
# The inbox lives as long as a sandbox.
INBOX_TTL_SECONDS = 1800
INBOX_LENGTH = 20

# KEYS: the once-marker, the inbox · ARGV: notification, marker TTL, inbox TTL, inbox length,
# channel. Returns 1 when filed and published, 0 for a repeat.
_NOTIFY_ONCE = """
if not redis.call('SET', KEYS[1], '1', 'NX', 'EX', ARGV[2]) then
  return 0
end
redis.call('RPUSH', KEYS[2], ARGV[1])
redis.call('LTRIM', KEYS[2], -tonumber(ARGV[4]), -1)
redis.call('EXPIRE', KEYS[2], ARGV[3])
redis.call('PUBLISH', ARGV[5], ARGV[1])
return 1
"""

# For the trace: what the script does, without the values.
NOTIFY_OPERATION = "EVALSHA notify_once (RPUSH notifications:<client> · PUBLISH events:<client>)"


class Notifier:
    def __init__(self, redis: Redis) -> None:
        self._notify_once = redis.register_script(_NOTIFY_ONCE)

    @staticmethod
    def listens_for(owner_key: str) -> bool:
        """Whether a page can listen for this owner's notifications at all."""
        return is_sandbox_owner(owner_key)

    async def notify(self, owner_key: str, notification: Notification, *, once: str) -> bool:
        """Files and publishes `notification` the first time `once` is seen. False for a repeat,
        and for an owner without a sandbox."""
        if not self.listens_for(owner_key):
            return False
        filed = await self._notify_once(
            keys=[f"notified:{once}", notifications_key(owner_key)],
            args=[
                notification.model_dump_json(),
                MARKER_TTL_SECONDS,
                INBOX_TTL_SECONDS,
                INBOX_LENGTH,
                events_channel(owner_key),
            ],
        )
        return bool(filed)
