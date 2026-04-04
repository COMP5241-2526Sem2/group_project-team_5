"""测试配置和共享 fixtures"""
import asyncio
from collections.abc import AsyncGenerator, Generator
from pathlib import Path
from typing import Any

import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from app.config import Settings
from app.database import get_db
from app.main import app
from app.models import Base

# 测试数据库配置（确保目录存在，避免 Windows 上 unable to open database file）
_test_db_dir = Path(__file__).resolve().parent.parent / "data"
_test_db_dir.mkdir(parents=True, exist_ok=True)
_test_db_path = _test_db_dir / "test.db"
TEST_DATABASE_URL = f"sqlite+aiosqlite:///{_test_db_path.as_posix()}"
test_engine = create_async_engine(TEST_DATABASE_URL, echo=False)
TestSessionLocal = async_sessionmaker(
    bind=test_engine, class_=AsyncSession, expire_on_commit=False
)


@pytest.fixture(scope="session")
def event_loop() -> Generator[asyncio.AbstractEventLoop, None, None]:
    """创建事件循环 (session 级别复用)"""
    loop = asyncio.new_event_loop()
    yield loop
    loop.close()


@pytest_asyncio.fixture(scope="function")
async def db_session() -> AsyncGenerator[AsyncSession, None]:
    """创建测试数据库会话 - 每个测试函数独立"""
    async with test_engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    async with TestSessionLocal() as session:
        yield session
        await session.rollback()

    async with test_engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)


@pytest_asyncio.fixture(scope="function")
async def client(db_session: AsyncSession) -> AsyncGenerator[AsyncClient, None]:
    """创建测试客户端"""

    async def override_get_db() -> AsyncGenerator[AsyncSession, None]:
        yield db_session

    app.dependency_overrides[get_db] = override_get_db

    async with AsyncClient(
        transport=ASGITransport(app=app), base_url="http://test"
    ) as ac:
        yield ac

    app.dependency_overrides.clear()


@pytest_asyncio.fixture
async def authenticated_client(
    client: AsyncClient,
    db_session: AsyncSession,
) -> AsyncClient:
    """创建已认证的测试客户端 (预留)"""
    return client


@pytest.fixture
def anyio_backend() -> str:
    """指定 anyio 使用 asyncio 后端"""
    return "asyncio"


# ===== 通用断言辅助函数 =====


def assert_paginated_response(
    response_data: dict[str, Any],
    expected_keys: list[str] | None = None,
) -> None:
    """验证分页响应格式"""
    assert "items" in response_data
    assert "total" in response_data
    assert "page" in response_data
    assert "page_size" in response_data
    assert "pages" in response_data
    assert isinstance(response_data["items"], list)


def assert_created_response(
    response_data: dict[str, Any],
    expected_keys: list[str],
) -> None:
    """验证创建响应格式"""
    for key in expected_keys:
        assert key in response_data
    assert "id" in response_data
    assert "created_at" in response_data


def assert_updated_response(
    response_data: dict[str, Any],
    updated_fields: list[str],
) -> None:
    """验证更新响应格式"""
    for key in updated_fields:
        assert key in response_data


def assert_error_response(
    response_data: dict[str, Any],
    expected_code: str,
    expected_message: str | None = None,
) -> None:
    """验证错误响应格式"""
    assert "code" in response_data
    assert "message" in response_data
    assert response_data["code"] == expected_code
    if expected_message:
        assert expected_message in response_data["message"]
