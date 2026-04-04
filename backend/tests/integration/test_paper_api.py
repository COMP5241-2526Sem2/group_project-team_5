"""集成测试示例 - API 端点测试"""
import pytest
import pytest_asyncio
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Paper, PaperStatus
from tests.factories import PaperFactory


@pytest.mark.integration
class TestPaperAPI:
    """Paper API 集成测试"""

    @pytest.mark.asyncio
    async def test_create_paper_success(
        self, client: AsyncClient, db_session: AsyncSession
    ) -> None:
        """测试成功创建试卷"""
        payload = {
            "title": "2024年高一数学期末考试",
            "course_id": 1,
            "grade": "高一",
            "subject": "数学",
            "semester": "下学期",
            "exam_type": "期末考试",
            "total_score": 150,
            "duration_min": 120,
            "question_count": 30,
            "created_by": 1,
        }

        response = await client.post("/api/v1/papers/", json=payload)

        assert response.status_code == 201
        data = response.json()
        assert data["title"] == payload["title"]
        assert data["status"] == PaperStatus.DRAFT.value
        assert "id" in data

    @pytest.mark.asyncio
    async def test_create_paper_validation_error(
        self, client: AsyncClient, db_session: AsyncSession
    ) -> None:
        """测试创建试卷参数校验失败"""
        payload = {
            "title": "",  # 空标题应该失败
            "course_id": -1,  # 负数 ID 应该失败
            "grade": "高一",
            "subject": "数学",
            "exam_type": "期末考试",
            "total_score": -10,  # 负数分数应该失败
            "duration_min": 120,
            "question_count": 30,
            "created_by": 1,
        }

        response = await client.post("/api/v1/papers/", json=payload)

        assert response.status_code == 422

    @pytest.mark.asyncio
    async def test_get_paper_success(
        self, client: AsyncClient, db_session: AsyncSession
    ) -> None:
        """测试获取单个试卷"""
        paper = await PaperFactory.create(session=db_session)

        response = await client.get(f"/api/v1/papers/{paper.id}")

        assert response.status_code == 200
        data = response.json()
        assert data["id"] == paper.id
        assert data["title"] == paper.title

    @pytest.mark.asyncio
    async def test_get_paper_not_found(
        self, client: AsyncClient, db_session: AsyncSession
    ) -> None:
        """测试获取不存在的试卷"""
        response = await client.get("/api/v1/papers/99999")

        assert response.status_code == 404

    @pytest.mark.asyncio
    async def test_list_papers(
        self, client: AsyncClient, db_session: AsyncSession
    ) -> None:
        """测试分页查询试卷列表"""
        # 创建多个试卷
        for i in range(5):
            await PaperFactory.create(session=db_session, title=f"试卷 {i + 1}")

        response = await client.get("/api/v1/papers/?page=1&page_size=3")

        assert response.status_code == 200
        data = response.json()
        assert "items" in data
        assert "total" in data
        assert "page" in data
        assert "page_size" in data
        assert "pages" in data
        assert len(data["items"]) == 3
        assert data["total"] >= 5

    @pytest.mark.asyncio
    async def test_update_paper(
        self, client: AsyncClient, db_session: AsyncSession
    ) -> None:
        """测试更新试卷"""
        paper = await PaperFactory.create(session=db_session)

        update_payload = {"title": "更新后的标题"}

        response = await client.patch(
            f"/api/v1/papers/{paper.id}", json=update_payload
        )

        assert response.status_code == 200
        data = response.json()
        assert data["title"] == update_payload["title"]

    @pytest.mark.asyncio
    async def test_delete_paper(
        self, client: AsyncClient, db_session: AsyncSession
    ) -> None:
        """测试删除试卷"""
        paper = await PaperFactory.create(session=db_session)

        response = await client.delete(f"/api/v1/papers/{paper.id}")

        assert response.status_code == 204
