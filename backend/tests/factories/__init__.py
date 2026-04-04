"""数据工厂模块 - 用于生成测试数据"""
from datetime import datetime, timedelta, timezone
from typing import Any, Protocol, TypeVar

from faker import Faker
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import (
    AttemptStatus,
    Exercise,
    ExerciseAttempt,
    ExerciseAttemptAnswer,
    ExerciseStatus,
    Paper,
    PaperQuestion,
    PaperQuestionOption,
    PaperSection,
    PaperStatus,
)

faker = Faker(["zh_CN", "en_US"])
Faker.seed(42)


class ModelFactory(Protocol):
    """数据工厂协议"""

    @classmethod
    async def create(cls, session: AsyncSession, **kwargs: Any) -> Any:
        ...


class PaperFactory:
    """试卷工厂"""

    @staticmethod
    def build(**kwargs: Any) -> dict[str, Any]:
        """构建试卷属性字典"""
        defaults: dict[str, Any] = {
            "title": faker.sentence(nb_words=6),
            "course_id": faker.random_int(min=1, max=100),
            "grade": faker.random_element(["高一", "高二", "高三"]),
            "subject": faker.random_element(["数学", "语文", "英语", "物理", "化学"]),
            "semester": faker.random_element(["上学期", "下学期"]),
            "exam_type": faker.random_element(["期中考试", "期末考试", "月考"]),
            "total_score": faker.random_int(min=100, max=150),
            "duration_min": faker.random_int(min=60, max=180),
            "question_count": faker.random_int(min=20, max=50),
            "quality_score": None,
            "status": PaperStatus.DRAFT,
            "created_by": faker.random_int(min=1, max=10),
            "published_at": None,
        }
        defaults.update(kwargs)
        return defaults

    @classmethod
    async def create(cls, session: AsyncSession, **kwargs: Any) -> Paper:
        """创建试卷实例"""
        attrs = cls.build(**kwargs)
        paper = Paper(**attrs)
        session.add(paper)
        await session.flush()
        await session.refresh(paper)
        return paper


class PaperSectionFactory:
    """试卷大题工厂"""

    @staticmethod
    def build(paper: Paper | None = None, **kwargs: Any) -> dict[str, Any]:
        defaults: dict[str, Any] = {
            "paper_id": paper.id if paper else faker.random_int(min=1, max=100),
            "title": faker.sentence(nb_words=3),
            "section_order": faker.random_int(min=1, max=10),
            "question_type": faker.random_element(["选择题", "填空题", "解答题"]),
            "question_count": faker.random_int(min=1, max=10),
            "score_each": 5.0,
            "total_score": 30.0,
        }
        defaults.update(kwargs)
        return defaults

    @classmethod
    async def create(cls, session: AsyncSession, paper: Paper, **kwargs: Any) -> PaperSection:
        attrs = cls.build(paper, **kwargs)
        section = PaperSection(**attrs)
        session.add(section)
        await session.flush()
        await session.refresh(section)
        return section


class PaperQuestionFactory:
    """试题工厂"""

    @staticmethod
    def build(
        paper: Paper | None = None,
        section: PaperSection | None = None,
        **kwargs: Any,
    ) -> dict[str, Any]:
        defaults: dict[str, Any] = {
            "paper_id": paper.id if paper else faker.random_int(min=1, max=100),
            "section_id": section.id if section else faker.random_int(min=1, max=100),
            "order_num": faker.random_int(min=1, max=50),
            "question_type": faker.random_element(["选择题", "填空题", "解答题"]),
            "prompt": faker.paragraph(nb_sentences=3),
            "difficulty": faker.random_element(["简单", "中等", "困难"]),
            "score": 5.0,
            "answer_text": None,
            "explanation": None,
            "chapter": faker.word(),
        }
        defaults.update(kwargs)
        return defaults

    @classmethod
    async def create(
        cls,
        session: AsyncSession,
        paper: Paper,
        section: PaperSection,
        **kwargs: Any,
    ) -> PaperQuestion:
        attrs = cls.build(paper, section, **kwargs)
        question = PaperQuestion(**attrs)
        session.add(question)
        await session.flush()
        await session.refresh(question)
        return question


class PaperQuestionOptionFactory:
    """试题选项工厂"""

    @staticmethod
    def build(question: PaperQuestion | None = None, **kwargs: Any) -> dict[str, Any]:
        defaults: dict[str, Any] = {
            "question_id": question.id if question else faker.random_int(min=1, max=100),
            "option_key": "A",
            "option_text": faker.sentence(),
            "is_correct": False,
        }
        defaults.update(kwargs)
        return defaults

    @classmethod
    async def create(
        cls,
        session: AsyncSession,
        question: PaperQuestion,
        **kwargs: Any,
    ) -> PaperQuestionOption:
        attrs = cls.build(question, **kwargs)
        option = PaperQuestionOption(**attrs)
        session.add(option)
        await session.flush()
        await session.refresh(option)
        return option


class ExerciseFactory:
    """练习工厂"""

    @staticmethod
    def build(**kwargs: Any) -> dict[str, Any]:
        defaults: dict[str, Any] = {
            "title": faker.sentence(nb_words=6),
            "course_id": faker.random_int(min=1, max=100),
            "paper_id": None,
            "due_at": datetime.now(timezone.utc) + timedelta(days=7),
            "duration_min": 30,
            "total_score": 100,
            "status": ExerciseStatus.DRAFT,
            "created_by": faker.random_int(min=1, max=10),
        }
        defaults.update(kwargs)
        return defaults

    @classmethod
    async def create(cls, session: AsyncSession, **kwargs: Any) -> Exercise:
        attrs = cls.build(**kwargs)
        exercise = Exercise(**attrs)
        session.add(exercise)
        await session.flush()
        await session.refresh(exercise)
        return exercise


class ExerciseAttemptFactory:
    """练习尝试工厂"""

    @staticmethod
    def build(exercise: Exercise | None = None, **kwargs: Any) -> dict[str, Any]:
        defaults: dict[str, Any] = {
            "exercise_id": exercise.id if exercise else faker.random_int(min=1, max=100),
            "student_id": faker.random_int(min=1, max=1000),
            "started_at": datetime.now(timezone.utc),
            "submitted_at": None,
            "score": None,
            "status": AttemptStatus.IN_PROGRESS,
        }
        defaults.update(kwargs)
        return defaults

    @classmethod
    async def create(
        cls,
        session: AsyncSession,
        exercise: Exercise,
        **kwargs: Any,
    ) -> ExerciseAttempt:
        attrs = cls.build(exercise, **kwargs)
        attempt = ExerciseAttempt(**attrs)
        session.add(attempt)
        await session.flush()
        await session.refresh(attempt)
        return attempt


class ExerciseAttemptAnswerFactory:
    """练习答案工厂"""

    @staticmethod
    def build(
        attempt: ExerciseAttempt | None = None,
        question: PaperQuestion | None = None,
        **kwargs: Any,
    ) -> dict[str, Any]:
        defaults: dict[str, Any] = {
            "attempt_id": attempt.id if attempt else faker.random_int(min=1, max=100),
            "question_id": question.id if question else faker.random_int(min=1, max=100),
            "selected_option": "A",
            "text_answer": None,
            "is_correct": None,
            "awarded_score": None,
            "teacher_feedback": None,
        }
        defaults.update(kwargs)
        return defaults

    @classmethod
    async def create(
        cls,
        session: AsyncSession,
        attempt: ExerciseAttempt,
        question: PaperQuestion,
        **kwargs: Any,
    ) -> ExerciseAttemptAnswer:
        attrs = cls.build(attempt, question, **kwargs)
        answer = ExerciseAttemptAnswer(**attrs)
        session.add(answer)
        await session.flush()
        await session.refresh(answer)
        return answer


# ===== 复杂场景构建器 =====


class PaperScenarioBuilder:
    """试卷场景构建器 - 用于构建完整试卷"""

    def __init__(self, session: AsyncSession):
        self._session = session
        self._paper: Paper | None = None
        self._sections: list[PaperSection] = []
        self._questions: list[PaperQuestion] = []

    async def with_paper(self, **kwargs: Any) -> "PaperScenarioBuilder":
        """构建试卷"""
        self._paper = await PaperFactory.create(self._session, **kwargs)
        return self

    async def with_section(
        self, question_count: int = 5, question_type: str = "选择题", **kwargs: Any
    ) -> "PaperScenarioBuilder":
        """构建大题及其下的试题"""
        if not self._paper:
            raise ValueError("Must call with_paper first")

        section = await PaperSectionFactory.create(
            self._session,
            self._paper,
            question_count=question_count,
            question_type=question_type,
            **kwargs,
        )
        self._sections.append(section)

        # 为大题创建试题
        for i in range(question_count):
            question = await PaperQuestionFactory.create(
                self._session,
                self._paper,
                section,
                order_num=i + 1,
                question_type=question_type,
            )
            self._questions.append(question)

            # 为选择题创建选项
            if question_type == "选择题":
                for option_key in ["A", "B", "C", "D"]:
                    await PaperQuestionOptionFactory.create(
                        self._session, question, option_key=option_key, is_correct=(option_key == "A")
                    )

        return self

    async def build(self) -> tuple[Paper, list[PaperSection], list[PaperQuestion]]:
        """返回构建结果"""
        if not self._paper:
            raise ValueError("Must call with_paper first")
        return self._paper, self._sections, self._questions
