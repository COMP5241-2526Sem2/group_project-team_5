"""\
Lab Prompt 模板 — 枚举常量片段。

所有枚举值均已穷举，LLM 输出时必须严格从给定列表中选一。
"""

# ---------------------------------------------------------------------------
# renderer_profile — 严格从以下 7 个选一
# ---------------------------------------------------------------------------
RENDERER_PROFILES_BLOCK = """\
### renderer_profile（严格从以下 7 个选一）
| 值 | 适用场景 |
|---|---|
| `circuit_2d` | 电路实验（串联/并联/串并联/桥式） |
| `function_2d` | 函数绘图、坐标轴曲线 |
| `geometry_3d` | 3D 几何体（棱锥/棱柱/球体/坐标系） |
| `molecule_3d` | 分子结构（化学键/原子球棒模型） |
| `cell_3d` | 细胞结构（细胞膜/细胞核/细胞器） |
| `mechanics_3d` | 力学（弹簧振子/抛体/杠杆/碰撞） |
| `generic_2d` | 通用 2D（光学/波/滴定/扩散/相图/生物过程示意等） |

**禁止**自造 `bio_2d`、`optics_2d`、`physics_2d` 等未在表中出现的名字；若不确定请用 `generic_2d`（2D 示意）或 `cell_3d`（细胞/显微结构 3D）。

渲染器值（简短引用用）:
`circuit_2d` / `function_2d` / `geometry_3d` / `molecule_3d` / `cell_3d` / `mechanics_3d` / `generic_2d`"""

# ---------------------------------------------------------------------------
# dimension — 与 renderer_profile 严格匹配
# ---------------------------------------------------------------------------
DIMENSION_BLOCK = """\
### dimension（与 renderer_profile 严格匹配）
`*_2d` → `"2d"`；`*_3d` → `"3d"`

值: `"2d"` / `"3d"`"""

# ---------------------------------------------------------------------------
# subject_lab — 严格从以下 5 个选一
# ---------------------------------------------------------------------------
SUBJECT_LAB_BLOCK = """\
### subject_lab（严格从以下 5 个选一）
`physics` / `math` / `chemistry` / `biology` / `dynamic`"""

# ---------------------------------------------------------------------------
# visual_hint.type — 严格从以下 9 个选一
# ---------------------------------------------------------------------------
VISUAL_HINT_TYPE_BLOCK = """\
### visual_hint.type（严格从以下 9 个选一）
| 值 | 含义 |
|---|---|
| `wave` | 机械波/光波传播 |
| `pendulum` | 摆动/简谐振动 |
| `particle` | 粒子运动（扩散/布朗运动） |
| `field` | 场线（电场线/磁场线） |
| `curve` | 函数曲线（滴定/PV/衰减） |
| `geometric` | 几何光学（透镜/镜子/光路） |
| `dynamic2d` | 通用 2D 力学 |
| `mixed` | 复合（装置 + 图表） |
| `auto` | 前端自动推断（兜底） |

值: `wave` / `pendulum` / `particle` / `field` / `curve` / `geometric` / `dynamic2d` / `mixed` / `auto`"""

# ---------------------------------------------------------------------------
# topology — 严格从以下 11 个选一
# ---------------------------------------------------------------------------
TOPOLOGY_BLOCK = """\
### topology（严格从以下 11 个选一）
`series` / `parallel` / `series_parallel` / `bridge` / `lens_array` / `pendulum_chain` / `ray_diagram` / `orbital` / `diffusion_grid` / `wave_interference` / `custom`

| 值 | 含义 |
|---|---|
| `series` | 串联电路 |
| `parallel` | 并联电路 |
| `series_parallel` | 串并联混合 |
| `bridge` | 桥式电路 |
| `lens_array` | 透镜阵列 |
| `pendulum_chain` | 摆链 |
| `ray_diagram` | 光路图 |
| `orbital` | 轨道运动 |
| `diffusion_grid` | 扩散网格 |
| `wave_interference` | 波的干涉 |
| `custom` | 自定义 |"""
