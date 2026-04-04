"""单元测试示例 - Repository 层"""
import pytest
import pytest_asyncio
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Paper
from tests.factories import PaperFactory, PaperSectionFactory


@pytest.mark.unit
class TestPaperRepository:
    """Paper Repository 单元测试"""

    @pytest_asyncio.fixture
    async def sample_paper(self, db_session: AsyncSession) -> Paper:
        """创建样本试卷"""
        return await PaperFactory.create(session=db_session)

    @pytest.mark.asyncio
    async def test_create_paper(self, db_session: AsyncSession) -> None:
        """测试创建试卷"""
        paper = await PaperFactory.create(session=db_session)

        assert paper.id is not None
        assert paper.title is not None
        assert paper.status.value == "draft"

    @pytest.mark.asyncio
    async def test_paper_with_sections(
        self, db_session: AsyncSession, sample_paper: Paper
    ) -> None:
        """测试试卷关联大题"""
        section1 = await PaperSectionFactory.create(
            session=db_session, paper=sample_paper, section_order=1
        )
        section2 = await PaperSectionFactory.create(
            session=db_session, paper=sample_paper, section_order=2
        )

        await db_session.refresh(sample_paper, ["sections"])

        assert len(sample_paper.sections) == 2
        assert section1 in sample_paper.sections
        assert section2 in sample_paper.sections

    @pytest.mark.asyncio
    async def test_paper_cascade_delete(
        self, db_session: AsyncSession, sample_paper: Paper
    ) -> None:
        """测试删除试卷时级联删除大题"""
        await PaperSectionFactory.create(session=db_session, paper=sample_paper)

        await db_session.delete(sample_paper)
        await db_session.flush()

        result = await db_session.get(Paper, sample_paper.id)
        assert result is None
