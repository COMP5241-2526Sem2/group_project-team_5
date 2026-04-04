"""
Seed script: import frontend MOCK_DYNAMIC_DEFS into the backend database.

Run:
    python -m scripts.seed_labs

Maps frontend LabComponentDefinition fields to backend LabDefinition columns:
  registryKey      → registry_key
  subjectLab        → subject_lab   (enum: math|physics|chemistry|biology|dynamic)
  title             → title
  description       → description
  rendererProfile   → renderer_profile
  initialState      → initial_state
  reducerSpec       → reducer_spec
  metadata          → lab_metadata
  status            → status
"""

import asyncio
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine

from app.config import settings


# ── Frontend MOCK_DYNAMIC_DEFS ─────────────────────────────────────────────────

MOCK_LABS = [
    {
        "registry_key": "dynamic_ph_slider",
        "title": "pH Indicator",
        "description": "Drag the pH slider and watch the colour of the indicator change in real time.",
        "subject_lab": "chemistry",
        "renderer_profile": "generic_2d",
        "dimension": "2d",
        "initial_state": {"ph": 7, "showScale": True, "indicatorColor": "#22c55e"},
        "reducer_spec": {"allowedCommands": ["SET_PARAM"]},
        "lab_metadata": {"grade": "Grade 9", "topic": "Acid–Base", "version": 1},
        "lab_type": "ai_generated",
        "status": "published",
        "teacher_id": 1,
    },
    {
        "registry_key": "dynamic_snells_law",
        "title": "Snell's Law — Refraction",
        "description": "Adjust incidence angle and refractive index; see refracted ray update in real time.",
        "subject_lab": "physics",
        "renderer_profile": "generic_2d",
        "dimension": "2d",
        "initial_state": {"n1": 1.0, "n2": 1.5, "theta1": 30},
        "reducer_spec": {"allowedCommands": ["SET_PARAM"]},
        "lab_metadata": {"grade": "Grade 10", "topic": "Optics", "version": 1},
        "lab_type": "ai_generated",
        "status": "published",
        "teacher_id": 1,
    },
    {
        "registry_key": "builtin.circuit_basic",
        "title": "Basic Circuit",
        "description": "A simple series circuit with a battery and resistor.",
        "subject_lab": "physics",
        "renderer_profile": "circuit_2d",
        "dimension": "2d",
        "initial_state": {"components": [], "wireNodes": [], "batteryVoltage": 9.0, "totalResistance": 0},
        "reducer_spec": {"allowedCommands": ["ADD_COMPONENT", "REMOVE_COMPONENT", "CONNECT", "DISCONNECT", "SET_RESISTANCE", "TOGGLE_SWITCH"]},
        "lab_metadata": {"grade": "Grade 9", "topic": "Electricity", "version": 1},
        "lab_type": "builtin",
        "status": "published",
        "teacher_id": None,
    },
    {
        "registry_key": "builtin.function_plotter",
        "title": "2D Function Plotter",
        "description": "Plot mathematical functions on a 2D coordinate system.",
        "subject_lab": "math",
        "renderer_profile": "function_2d",
        "dimension": "2d",
        "initial_state": {"functions": [], "xMin": -10, "xMax": 10, "yMin": -10, "yMax": 10},
        "reducer_spec": {"allowedCommands": ["SET_FUNCTION", "ADD_CURVE", "REMOVE_CURVE"]},
        "lab_metadata": {"grade": "Grade 10", "topic": "Functions", "version": 1},
        "lab_type": "builtin",
        "status": "published",
        "teacher_id": None,
    },
    {
        "registry_key": "builtin.geometry_3d_demo",
        "title": "3D Geometry Demo",
        "description": "Explore 3D geometric shapes and their properties.",
        "subject_lab": "math",
        "renderer_profile": "geometry_3d",
        "dimension": "3d",
        "initial_state": {"shape": "cube", "sideLength": 2, "rotation": {"x": 0, "y": 0, "z": 0}},
        "reducer_spec": {"allowedCommands": ["SET_SHAPE", "SET_ANGLE"]},
        "lab_metadata": {"grade": "Grade 11", "topic": "Solid Geometry", "version": 1},
        "lab_type": "builtin",
        "status": "published",
        "teacher_id": None,
    },
    {
        "registry_key": "builtin.cell_3d_overview",
        "title": "3D Cell Overview",
        "description": "Interactive 3D model of an animal cell with organelles.",
        "subject_lab": "biology",
        "renderer_profile": "cell_3d",
        "dimension": "3d",
        "initial_state": {"cellType": "animal", "highlightedOrganelle": None, "visibleLayers": ["membrane", "nucleus"]},
        "reducer_spec": {"allowedCommands": ["HIGHLIGHT_ORGANELLE", "TOGGLE_LAYER"]},
        "lab_metadata": {"grade": "Grade 8", "topic": "Cell Biology", "version": 1},
        "lab_type": "builtin",
        "status": "published",
        "teacher_id": None,
    },
    {
        "registry_key": "builtin.mechanics_spring",
        "title": "Spring-Mass Dynamics",
        "description": "Study simple harmonic motion with a spring-mass system.",
        "subject_lab": "physics",
        "renderer_profile": "mechanics_3d",
        "dimension": "3d",
        "initial_state": {"springConstant": 50, "mass": 1.0, "damping": 0.1, "displacement": 0.5},
        "reducer_spec": {"allowedCommands": ["SET_PARAM", "RESET"]},
        "lab_metadata": {"grade": "Grade 11", "topic": "Simple Harmonic Motion", "version": 1},
        "lab_type": "builtin",
        "status": "published",
        "teacher_id": None,
    },
]


# ── SQL helpers ───────────────────────────────────────────────────────────────

INSERT_SQL = text("""
    INSERT INTO lab_definitions
        (registry_key, title, description, subject_lab, renderer_profile,
         dimension, initial_state, reducer_spec, lab_metadata,
         lab_type, status, teacher_id)
    VALUES
        (:registry_key, :title, :description, :subject_lab, :renderer_profile,
         :dimension, :initial_state, :reducer_spec, :lab_metadata,
         :lab_type, :status, :teacher_id)
    ON DUPLICATE KEY UPDATE
        title = VALUES(title),
        description = VALUES(description),
        renderer_profile = VALUES(renderer_profile),
        initial_state = VALUES(initial_state),
        reducer_spec = VALUES(reducer_spec),
        lab_metadata = VALUES(lab_metadata),
        status = VALUES(status)
""")


async def seed() -> None:
    engine = create_async_engine(settings.database_url, echo=False)

    async with AsyncSession(engine) as sess:
        for lab in MOCK_LABS:
            import json

            row = {
                "registry_key": lab["registry_key"],
                "title": lab["title"],
                "description": lab["description"],
                "subject_lab": lab["subject_lab"],
                "renderer_profile": lab["renderer_profile"],
                "dimension": lab["dimension"],
                "initial_state": json.dumps(lab["initial_state"]),
                "reducer_spec": json.dumps(lab["reducer_spec"]) if lab["reducer_spec"] else None,
                "lab_metadata": json.dumps(lab["lab_metadata"]) if lab["lab_metadata"] else None,
                "lab_type": lab["lab_type"],
                "status": lab["status"],
                "teacher_id": lab["teacher_id"],
            }
            await sess.execute(INSERT_SQL, row)
            print(f"  [OK] {lab['registry_key']}")

        await sess.commit()

    await engine.dispose()
    print(f"\nDone. {len(MOCK_LABS)} labs seeded.")


if __name__ == "__main__":
    asyncio.run(seed())
