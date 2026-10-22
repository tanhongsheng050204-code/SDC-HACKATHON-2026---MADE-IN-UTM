"""How the live API holds up with many people at once: a short load test with real numbers.

Each simulated person opens a demo profile and then makes the calls a real visit makes (Today,
Future roles, a role's pathway, progress, plan checks). Only the free, rules-based endpoints are
called: no AI model, so the test costs nothing and does not trip the AI rate limits.

    cd backend
    python scripts/load_test.py https://laluan-api.onrender.com --users 25 --rounds 3

Wake the server first (open /api/health once): a sleeping free instance takes about a minute to
start, and that minute is not what we want to measure. Prints, per endpoint: calls, failures and
the 50th / 95th percentile time, then the total requests per second.
"""

import argparse
import asyncio
import statistics
import time

import httpx

SCREENS = [
    ("today", "/api/profiles/{id}/matches?scenario=baseline"),
    ("journey", "/api/profiles/{id}/journey"),
    ("roles_accelerated", "/api/profiles/{id}/matches?scenario=accelerated&year=2028"),
    ("pathway", "/api/profiles/{id}/pathway?role=data_analyst"),
    ("progress", "/api/profiles/{id}/progress"),
    ("plan_check", "/api/profiles/{id}/plan-check"),
    ("radar", "/api/radar?profile_id={id}"),
]


async def person(client: httpx.AsyncClient, base: str, rounds: int, times: dict, failures: dict) -> None:
    async def call(name: str, method: str, path: str) -> httpx.Response | None:
        start = time.perf_counter()
        try:
            response = await client.request(method, base + path)
            ok = response.status_code < 400
        except httpx.HTTPError:
            response, ok = None, False
        times.setdefault(name, []).append(time.perf_counter() - start)
        if not ok:
            failures[name] = failures.get(name, 0) + 1
        return response if ok else None

    made = await call("open_demo", "POST", "/api/profiles/demo/clerk")
    if made is None:
        return
    profile_id = made.json()["id"]
    for _ in range(rounds):
        for name, path in SCREENS:
            await call(name, "GET", path.format(id=profile_id))


def pct(values: list[float], q: float) -> float:
    ordered = sorted(values)
    return ordered[min(len(ordered) - 1, int(round(q * (len(ordered) - 1))))]


async def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("base", help="API address, e.g. https://laluan-api.onrender.com")
    parser.add_argument("--users", type=int, default=25, help="people at the same time")
    parser.add_argument("--rounds", type=int, default=3, help="times each person goes through the screens")
    args = parser.parse_args()
    base = args.base.rstrip("/")
    times: dict[str, list[float]] = {}
    failures: dict[str, int] = {}
    async with httpx.AsyncClient(timeout=60) as client:
        health = await client.get(base + "/api/health")
        print(f"health: {health.status_code} {health.json().get('snapshot', '')}")
        start = time.perf_counter()
        await asyncio.gather(*(person(client, base, args.rounds, times, failures) for _ in range(args.users)))
        elapsed = time.perf_counter() - start
    total = sum(len(v) for v in times.values())
    print(f"\n{args.users} people at once, {args.rounds} rounds each: {total} requests in {elapsed:.1f} s "
          f"({total / elapsed:.1f} requests a second), {sum(failures.values())} failed\n")
    print(f"{'endpoint':<20}{'calls':>7}{'failed':>8}{'p50 ms':>9}{'p95 ms':>9}")
    for name, values in times.items():
        print(f"{name:<20}{len(values):>7}{failures.get(name, 0):>8}{pct(values, .5) * 1000:>9.0f}{pct(values, .95) * 1000:>9.0f}")
    every = [v for values in times.values() for v in values]
    print(f"{'all':<20}{len(every):>7}{sum(failures.values()):>8}{statistics.median(every) * 1000:>9.0f}{pct(every, .95) * 1000:>9.0f}")


if __name__ == "__main__":
    asyncio.run(main())
