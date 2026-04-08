"""Database preflight checker.

Run from backend/ before starting uvicorn:
    python scripts/check_db_preflight.py

It classifies failures into DNS, port/network, auth, or SSL.
"""

from __future__ import annotations

import argparse
import asyncio
import os
import socket
import ssl
from pathlib import Path
from urllib.parse import ParseResult, urlparse, urlunparse

import httpx
from dotenv import load_dotenv


_BACKEND_ROOT = Path(__file__).resolve().parent.parent
_ENV_PATH = _BACKEND_ROOT / ".env"


def _bool_env(name: str, default: bool = False) -> bool:
    raw = (os.getenv(name) or "").strip().lower()
    if not raw:
        return default
    return raw in {"1", "true", "yes", "on"}


def _mask_dsn(dsn: str) -> str:
    p = urlparse(dsn)
    host = p.hostname or ""
    port = f":{p.port}" if p.port else ""
    user = p.username or ""
    if p.password:
        auth = f"{user}:***" if user else "***"
    else:
        auth = user
    netloc = f"{auth}@{host}{port}" if auth else f"{host}{port}"
    return urlunparse((p.scheme, netloc, p.path, p.params, p.query, p.fragment))


def _dsn_no_driver_suffix(dsn: str) -> str:
    p = urlparse(dsn)
    scheme = p.scheme
    if "+" in scheme:
        scheme = scheme.split("+", 1)[0]
    return urlunparse((scheme, p.netloc, p.path, p.params, p.query, p.fragment))


def _print_header(title: str) -> None:
    print(f"\n=== {title} ===")


def _resolve_dns(host: str, port: int) -> tuple[bool, list[str], str | None]:
    try:
        infos = socket.getaddrinfo(host, port, type=socket.SOCK_STREAM)
    except Exception as exc:
        return False, [], f"{type(exc).__name__}: {exc}"

    ips: list[str] = []
    for item in infos:
        ip = item[4][0]
        if ip not in ips:
            ips.append(ip)
    return True, ips, None


def _tcp_probe(ips: list[str], port: int, timeout_sec: float) -> tuple[bool, str | None]:
    last_err: str | None = None
    for ip in ips:
        sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        sock.settimeout(timeout_sec)
        try:
            sock.connect((ip, port))
            return True, None
        except Exception as exc:
            last_err = f"{ip}:{port} -> {type(exc).__name__}: {exc}"
        finally:
            sock.close()
    return False, last_err


def _build_ssl_arg(dsn: str) -> ssl.SSLContext | bool | None:
    needs_ssl = _bool_env("DATABASE_SSL", False) or ".supabase.co" in dsn
    if not needs_ssl:
        return None
    if _bool_env("DATABASE_SSL_INSECURE", False):
        proto = getattr(ssl, "PROTOCOL_TLS_CLIENT", ssl.PROTOCOL_TLS)
        ctx = ssl.SSLContext(proto)
        ctx.check_hostname = False
        ctx.verify_mode = ssl.CERT_NONE
        return ctx
    return True


async def _pg_auth_probe(dsn: str, timeout_sec: float) -> tuple[bool, str | None, str | None]:
    import asyncpg
    from asyncpg import exceptions as apg_exc

    connect_dsn = _dsn_no_driver_suffix(dsn)
    ssl_arg = _build_ssl_arg(dsn)
    kwargs = {"timeout": timeout_sec}
    if ssl_arg is not None:
        kwargs["ssl"] = ssl_arg

    try:
        conn = await asyncpg.connect(connect_dsn, **kwargs)
        try:
            await conn.fetchval("SELECT 1")
            return True, None, None
        finally:
            await conn.close()
    except apg_exc.InvalidPasswordError as exc:
        return False, "AUTH", f"Invalid password: {exc}"
    except apg_exc.InvalidAuthorizationSpecificationError as exc:
        return False, "AUTH", f"Invalid auth/user: {exc}"
    except apg_exc.InvalidCatalogNameError as exc:
        return False, "AUTH", f"Database does not exist: {exc}"
    except ssl.SSLError as exc:
        return False, "SSL", f"SSL handshake failed: {exc}"
    except asyncio.TimeoutError as exc:
        return False, "PORT", f"Connect timeout: {exc}"
    except Exception as exc:
        msg = str(exc)
        lower = msg.lower()
        if "ssl" in lower or "certificate" in lower:
            return False, "SSL", f"SSL error: {type(exc).__name__}: {exc}"
        if "password" in lower or "authentication" in lower or "auth" in lower:
            return False, "AUTH", f"Auth error: {type(exc).__name__}: {exc}"
        return False, "OTHER", f"{type(exc).__name__}: {exc}"


async def _mysql_auth_probe(dsn: str, timeout_sec: float) -> tuple[bool, str | None, str | None]:
    import aiomysql

    p = urlparse(dsn)
    ssl_arg = _build_ssl_arg(dsn)
    kwargs = {
        "host": p.hostname,
        "port": p.port or 3306,
        "user": p.username,
        "password": p.password,
        "db": p.path.lstrip("/") or None,
        "connect_timeout": int(timeout_sec),
    }
    if ssl_arg is True:
        kwargs["ssl"] = {}
    elif ssl_arg is not None:
        kwargs["ssl"] = ssl_arg

    conn = None
    try:
        conn = await aiomysql.connect(**kwargs)
        async with conn.cursor() as cur:
            await cur.execute("SELECT 1")
            await cur.fetchone()
        return True, None, None
    except ssl.SSLError as exc:
        return False, "SSL", f"SSL handshake failed: {exc}"
    except asyncio.TimeoutError as exc:
        return False, "PORT", f"Connect timeout: {exc}"
    except Exception as exc:
        msg = str(exc).lower()
        if "access denied" in msg or "authentication" in msg or "password" in msg:
            return False, "AUTH", f"Auth error: {type(exc).__name__}: {exc}"
        if "ssl" in msg or "certificate" in msg:
            return False, "SSL", f"SSL error: {type(exc).__name__}: {exc}"
        return False, "OTHER", f"{type(exc).__name__}: {exc}"
    finally:
        if conn is not None:
            conn.close()


def _kind_from_scheme(scheme: str) -> str:
    raw = scheme.lower()
    if "postgres" in raw:
        return "postgres"
    if "mysql" in raw:
        return "mysql"
    if "sqlite" in raw:
        return "sqlite"
    return "other"


def _check_supabase_rest(timeout_sec: float) -> tuple[bool, str]:
    supabase_url = (os.getenv("SUPABASE_URL") or "").strip().rstrip("/")
    supabase_key = (os.getenv("SUPABASE_SERVICE_ROLE_KEY") or "").strip()
    if not supabase_url or not supabase_key:
        return False, "SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY not set, skip REST probe"
    endpoint = f"{supabase_url}/rest/v1/"
    headers = {"apikey": supabase_key, "Authorization": f"Bearer {supabase_key}"}
    try:
        resp = httpx.get(endpoint, headers=headers, timeout=timeout_sec)
        return True, f"REST {resp.status_code} at {endpoint}"
    except Exception as exc:
        return False, f"REST probe failed: {type(exc).__name__}: {exc}"


async def main() -> int:
    parser = argparse.ArgumentParser(description="DB preflight: DNS / port / auth / SSL")
    parser.add_argument("--dsn", default="", help="override DATABASE_URL")
    parser.add_argument("--timeout", type=float, default=6.0, help="probe timeout seconds")
    args = parser.parse_args()

    if _ENV_PATH.exists():
        load_dotenv(_ENV_PATH)

    dsn = (args.dsn or os.getenv("DATABASE_URL") or "").strip()
    if not dsn:
        print("RESULT: FAIL")
        print("CAUSE: CONFIG")
        print("DETAIL: DATABASE_URL is empty")
        return 10

    parsed: ParseResult = urlparse(dsn)
    db_kind = _kind_from_scheme(parsed.scheme)
    host = parsed.hostname
    port = parsed.port

    _print_header("Input")
    print(f"DATABASE_URL: {_mask_dsn(dsn)}")
    print(f"DB kind: {db_kind}")

    if db_kind == "sqlite":
        print("RESULT: PASS")
        print("CAUSE: SQLITE")
        print("DETAIL: SQLite uses local file; no DNS/TCP/auth probe needed")
        return 0

    if not host or not port:
        print("RESULT: FAIL")
        print("CAUSE: CONFIG")
        print("DETAIL: host/port missing in DATABASE_URL")
        return 11

    _print_header("Step 1 - DNS")
    ok_dns, ips, dns_err = _resolve_dns(host, port)
    if not ok_dns:
        print(f"DNS: FAIL ({dns_err})")
        print("RESULT: FAIL")
        print("CAUSE: DNS")
        print("DETAIL: Hostname cannot be resolved")
        return 2
    print(f"DNS: PASS ({host} -> {', '.join(ips)})")

    _print_header("Step 2 - TCP Port")
    ok_tcp, tcp_err = _tcp_probe(ips, port, timeout_sec=args.timeout)
    if not ok_tcp:
        print(f"TCP: FAIL ({tcp_err})")
        print("RESULT: FAIL")
        print("CAUSE: PORT")
        print("DETAIL: DB port unreachable (firewall/network/allowlist)")
        rest_ok, rest_msg = _check_supabase_rest(args.timeout)
        if rest_ok:
            print(f"HINT: {rest_msg}")
            print("HINT: HTTPS is reachable; likely only DB TCP port is blocked")
        else:
            print(f"HINT: {rest_msg}")
        return 3
    print(f"TCP: PASS ({host}:{port} reachable)")

    _print_header("Step 3 - Auth/SSL")
    if db_kind == "postgres":
        ok_auth, category, detail = await _pg_auth_probe(dsn, timeout_sec=args.timeout)
    elif db_kind == "mysql":
        ok_auth, category, detail = await _mysql_auth_probe(dsn, timeout_sec=args.timeout)
    else:
        print(f"Unsupported DB scheme for auth probe: {parsed.scheme}")
        print("RESULT: PASS")
        print("CAUSE: NETWORK_ONLY")
        return 0

    if ok_auth:
        print("AUTH/SSL: PASS (SELECT 1 succeeded)")
        print("RESULT: PASS")
        print("CAUSE: OK")
        return 0

    print(f"AUTH/SSL: FAIL ({detail})")
    print("RESULT: FAIL")
    print(f"CAUSE: {category or 'OTHER'}")
    if category == "AUTH":
        print("DETAIL: Credentials/database name are invalid, or user lacks permissions")
        return 4
    if category == "SSL":
        print("DETAIL: SSL handshake/certificate config mismatch")
        return 5
    if category == "PORT":
        print("DETAIL: Connect timeout while opening DB session")
        return 3
    print("DETAIL: Unknown error, inspect full exception text above")
    return 6


if __name__ == "__main__":
    raise SystemExit(asyncio.run(main()))
