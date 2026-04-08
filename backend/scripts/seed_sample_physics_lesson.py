"""
插入一条示例「物理课件」LessonDeck，幻灯片中嵌入数据库里已有的欧姆定律相关实验。

用法（在 backend 目录下）:
  .venv\\Scripts\\python.exe -m scripts.seed_sample_physics_lesson

环境变量:
  SEED_TEACHER_ID  课件归属教师 users.id，默认 1003（与前端 VITE_TEACHER_USER_ID 一致）

查找实验顺序:
  1) registry_key = physics.circuit_ohm_series_001 或 physics.ohms_law_series
  2) 标题/registry_key 含「欧姆」或 ohm（不区分大小写）
  3) 任意一条 physics 学科的 lab_definitions 记录

若库中完全没有 lab_definitions，脚本会退出并提示先在 Labs 中创建/导入实验。
"""

from __future__ import annotations

import asyncio
import os
import sys

from sqlalchemy import or_, select

from app.database import SessionLocal
from app.models.lab import LabDefinition
from app.models.user import AccountType, User
from app.schemas.lesson import LessonCreate, LessonDeckUpsert, SlideUpsert
from app.services.lesson.lesson_service import LessonService


async def _pick_ohm_lab(db) -> LabDefinition | None:
    preferred_keys = ("physics.circuit_ohm_series_001", "physics.ohms_law_series")
    for key in preferred_keys:
        r = await db.execute(select(LabDefinition).where(LabDefinition.registry_key == key))
        lab = r.scalar_one_or_none()
        if lab is not None:
            return lab

    r = await db.execute(
        select(LabDefinition)
        .where(
            or_(
                LabDefinition.title.ilike("%欧姆%"),
                LabDefinition.title.ilike("%ohm%"),
                LabDefinition.registry_key.ilike("%ohm%"),
            )
        )
        .limit(1)
    )
    lab = r.scalar_one_or_none()
    if lab is not None:
        return lab

    r = await db.execute(
        select(LabDefinition).where(LabDefinition.subject_lab == "physics").limit(1)
    )
    return r.scalar_one_or_none()


async def _resolve_teacher_id(db) -> int | None:
    raw = os.environ.get("SEED_TEACHER_ID", "").strip()
    if raw.isdigit():
        tid = int(raw)
        u = await db.get(User, tid)
        if u is not None:
            return tid
        print(f"SEED_TEACHER_ID={tid} 在 users 表中不存在，尝试查找教师账号…", file=sys.stderr)

    r = await db.execute(select(User.id).where(User.account_type == AccountType.TEACHER).limit(1))
    row = r.first()
    if row is None:
        return None
    return int(row[0])


async def main() -> None:
    async with SessionLocal() as db:
        teacher_id = await _resolve_teacher_id(db)
        if teacher_id is None:
            print("错误：数据库中没有教师用户（users.account_type = teacher）。请先注册教师账号。", file=sys.stderr)
            sys.exit(1)

        lab = await _pick_ohm_lab(db)
        if lab is None:
            print(
                "错误：lab_definitions 表为空或没有物理实验。"
                "请先在教师端 Labs 中创建实验，或导入后再运行本脚本。",
                file=sys.stderr,
            )
            sys.exit(1)

        print(f"教师 users.id = {teacher_id}")
        print(f"引用实验 registry_key = {lab.registry_key!r}  title = {lab.title!r}  status = {lab.status}")

        detail = await LessonService.create_deck(
            db,
            teacher_id=teacher_id,
            payload=LessonCreate(
                title="物理样例：欧姆定律与电路",
                subject="physics",
                grade="Grade 9",
            ),
        )
        deck_id = detail.id

        await LessonService.replace_deck(
            db,
            deck_id=deck_id,
            teacher_id=teacher_id,
            payload=LessonDeckUpsert(
                title="物理样例：欧姆定律与电路",
                subject="physics",
                grade="Grade 9",
                status="draft",
                slides=[
                    SlideUpsert(
                        title="课程导入",
                        text="本课通过交互式电路实验理解欧姆定律：U = I × R，并观察串联电路中电流与电压的关系。",
                        notes="可先提问：电阻变大时灯泡亮度如何变化？",
                    ),
                    SlideUpsert(
                        title="欧姆定律实验",
                        text="下方实验来自 Lab 目录。可改变电压或电阻，观察电流与灯泡亮度变化。",
                        notes="演示串联电路；强调测量与理论对比。",
                        lab_registry_key=lab.registry_key,
                    ),
                    SlideUpsert(
                        title="小结",
                        text="· 欧姆定律：U = I × R\n· 串联电路中电流处处相等\n· 实验现象与公式是否一致？",
                        notes="布置 1 道巩固题。",
                    ),
                ],
            ),
        )

        print(f"完成：已创建课件 lesson_decks.id = {deck_id}，共 3 张幻灯片（第 2 张嵌入实验）。")
        print("请在浏览器使用与上面「教师 users.id」一致的 X-User-Id 访问 /teacher/lessons（前端见 VITE_TEACHER_USER_ID / localStorage）。")
        print(f"OK: lesson_decks.id={deck_id} teacher_id={teacher_id} lab={lab.registry_key!r} — set VITE_TEACHER_USER_ID={teacher_id} to see it in the UI.")


if __name__ == "__main__":
    asyncio.run(main())
