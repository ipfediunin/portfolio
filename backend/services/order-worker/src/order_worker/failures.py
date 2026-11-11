"""How a failed attempt is classified: worth retrying, or not."""


class TransientFailure(Exception):  # noqa: N818 — a kind of outcome, not an error type
    """A dependency is unavailable for now (provider outage, timeout, database restart):
    the same job may succeed later, so it is retried with backoff."""


class PermanentFailure(Exception):  # noqa: N818
    """Retrying cannot help (the provider rejected the request, the data is wrong): the job
    goes to the dead-letter queue right away."""
