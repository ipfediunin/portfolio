"""Kafka, the event log: topic setup, an idempotent producer, consumers that commit only after
handling. aiokafka ships no type information; this module is the only place that touches it and
turns what it returns into typed values.

Delivery is at-least-once on both sides: the producer may resend after a lost acknowledgement (its
idempotence makes the broker drop the duplicate within a session), and a consumer that stops
between handling and committing reads the event again — handlers must recognise a repeat."""

from __future__ import annotations

import contextlib
from collections.abc import AsyncIterator
from dataclasses import dataclass

from aiokafka import AIOKafkaConsumer, AIOKafkaProducer
from aiokafka.admin import AIOKafkaAdminClient, NewTopic
from aiokafka.errors import KafkaError, TopicAlreadyExistsError
from aiokafka.structs import TopicPartition

__all__ = [
    "EventConsumer",
    "EventProducer",
    "EventRecord",
    "KafkaError",
    "Published",
    "consumer_lag",
    "ensure_topic",
]


@dataclass(frozen=True)
class Published:
    partition: int
    offset: int


@dataclass(frozen=True)
class EventRecord:
    topic: str
    partition: int
    offset: int
    key: str | None
    value: bytes


async def ensure_topic(bootstrap: str, topic: str, partitions: int) -> None:
    """Creates the topic if it does not exist yet (automatic topic creation is off)."""
    admin = AIOKafkaAdminClient(bootstrap_servers=bootstrap)
    await admin.start()
    try:
        # Several services start together and race to create it; whoever is second is fine.
        with contextlib.suppress(TopicAlreadyExistsError):
            await admin.create_topics(
                [NewTopic(name=topic, num_partitions=partitions, replication_factor=1)]
            )
    finally:
        await admin.close()


async def consumer_lag(bootstrap: str, topic: str, groups: list[str]) -> dict[str, int]:
    """Per consumer group: how many events of `topic` it has not committed yet (the log's end
    offsets minus the group's committed offsets, over every partition)."""
    admin = AIOKafkaAdminClient(bootstrap_servers=bootstrap)
    reader = AIOKafkaConsumer(bootstrap_servers=bootstrap, enable_auto_commit=False)
    await admin.start()
    try:
        await reader.start()
        try:
            await reader.topics()  # refreshes the metadata partitions_for_topic reads
            partitions = [
                TopicPartition(topic, partition)
                for partition in sorted(reader.partitions_for_topic(topic) or ())
            ]
            ends = await reader.end_offsets(partitions) if partitions else {}
        finally:
            await reader.stop()
        lag: dict[str, int] = {}
        for group in groups:
            committed = await admin.list_consumer_group_offsets(group, partitions=partitions)
            behind = 0
            for partition in partitions:
                end = int(ends.get(partition, 0))
                position = committed.get(partition)
                offset = int(position.offset) if position is not None else -1
                # No commit yet: the group starts from the beginning of the log.
                behind += end - max(offset, 0)
            lag[group] = behind
        return lag
    finally:
        await admin.close()


class EventProducer:
    """acks=all: a publish counts only when the broker has the event; idempotence: a resend after
    a lost acknowledgement does not duplicate it in the log."""

    def __init__(self, bootstrap: str) -> None:
        self._producer = AIOKafkaProducer(
            bootstrap_servers=bootstrap, acks="all", enable_idempotence=True, linger_ms=5
        )

    async def start(self) -> None:
        await self._producer.start()

    async def stop(self) -> None:
        await self._producer.stop()

    async def publish(self, topic: str, key: str, value: bytes) -> Published:
        metadata = await self._producer.send_and_wait(topic, value=value, key=key.encode())
        return Published(partition=int(metadata.partition), offset=int(metadata.offset))


class EventConsumer:
    """One member of a consumer group. Offsets are committed explicitly, after handling."""

    def __init__(self, bootstrap: str, topic: str, group: str) -> None:
        self.group = group
        self._consumer = AIOKafkaConsumer(
            topic,
            bootstrap_servers=bootstrap,
            group_id=group,
            enable_auto_commit=False,
            auto_offset_reset="earliest",
        )

    async def start(self) -> None:
        await self._consumer.start()

    async def stop(self) -> None:
        await self._consumer.stop()

    async def records(self) -> AsyncIterator[EventRecord]:
        async for message in self._consumer:
            key = message.key
            yield EventRecord(
                topic=str(message.topic),
                partition=int(message.partition),
                offset=int(message.offset),
                key=key.decode() if isinstance(key, bytes) else None,
                value=bytes(message.value),
            )

    async def commit(self) -> None:
        await self._consumer.commit()
