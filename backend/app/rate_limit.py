from collections import defaultdict, deque
from threading import Lock
from time import monotonic
from typing import Callable

from fastapi import HTTPException, Request

_events: dict[tuple[str, str], deque[float]] = defaultdict(deque)
_lock = Lock()


def rate_limit(scope: str, limit: int, window_seconds: int) -> Callable:
    def dependency(request: Request) -> None:
        client = request.client.host if request.client else "unknown"
        key = (scope, client)
        now = monotonic()
        with _lock:
            events = _events[key]
            while events and now - events[0] >= window_seconds:
                events.popleft()
            if len(events) >= limit:
                raise HTTPException(429, "Too many requests; retry later", headers={"Retry-After": str(window_seconds)})
            events.append(now)
    return dependency
