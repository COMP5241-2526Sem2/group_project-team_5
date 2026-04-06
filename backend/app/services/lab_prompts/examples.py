"""\
Lab Prompt 示例 JSON 片段。

每个常量是对应示例的完整 JSON 定义（render_code 部分为模板字符串字面量）。
命名约定: `EXAMPLE_<学科>_<名称>` — 值均为 Python 三引号原始字符串（r'''）。
"""

from . import enums as enums
from . import rules as rules

# 示例 1: Ohm's Law 串联电路（物理 / circuit_2d）
EXAMPLE_OHM_SERIES = r'''\
{"type":"lab_definition","definition":{
  "registry_key": "physics.ohms_law_series",
  "title": "Ohm's Law — Series Circuit",
  "description": "Explore voltage, current, and resistance in a series circuit.",
  "subject_lab": "physics",
  "renderer_profile": "circuit_2d",
  "dimension": "2d",
  "initial_state": {
    "voltage": 9,
    "r1": 10,
    "r2": 20,
    "showCurrent": true,
    "switch_closed": true,
    "show_values": true
  },
  "reducer_spec": { "allowedCommands": ["SET_PARAM"], "maxNodes": 50 },
  "lab_metadata": { "grade": "Grade 10", "topic": "Ohm's Law", "version": "1.0" },
  "lab_type": "ai_generated",
  "status": "draft",
  "visual_profile": null,
  "visual_hint": {
    "type": "curve",
    "primary_concept": "Series circuit with battery, switch and two resistors showing current flow",
    "renderSpec": {
      "topology": "series",
      "components": [
        { "id": "bat", "type": "battery", "label": "E", "value_key": "voltage", "unit": "V", "x": 0, "y": 1 },
        { "id": "sw", "type": "switch", "label": "S", "value_key": "switch_closed", "x": 1, "y": 1 },
        { "id": "r1", "type": "resistor", "label": "R1", "value_key": "r1", "unit": "Ω", "x": 2, "y": 1, "direction": "h" },
        { "id": "r2", "type": "resistor", "label": "R2", "value_key": "r2", "unit": "Ω", "x": 3, "y": 1, "direction": "h" }
      ],
      "wires": [
        { "from": "bat.pos", "to": "sw.a" },
        { "from": "sw.b", "to": "r1.a" },
        { "from": "r1.b", "to": "r2.a" },
        { "from": "r2.b", "to": "bat.neg" }
      ],
      "layout": { "direction": "lr", "rows": 3, "cols": 5, "padding": 20 },
      "drawing_commands": [],
      "canvas": { "width": 620, "height": 240 }
    }
  },
  "render_code": `export default function OhmSeriesCircuitSvgLab(props) {
  const {state, onStateChange, readonly, t} = props;
  function rv(k, d) { var v = state[k]; if (typeof v === 'number' && isFinite(v)) return v; return d; }
  function rb(k) { var v = state[k]; return !(v === false || v === 0); }
  var V = rv('voltage', 9);
  var r1 = rv('r1', 10);
  var r2 = rv('r2', 20);
  var closed = rb('switch_closed');
  var showVal = state.show_values !== false && state.show_values !== 0;
  var showCur = rb('showCurrent');
  var totalR = r1 + r2;
  var I = closed && totalR > 0 ? V / totalR : 0;
  var v1 = I * r1;
  var v2 = I * r2;
  var anim = (typeof t === 'number' && isFinite(t)) ? t : 0;
  var dashOff = -(anim * 28) % 28;

  var OFF = 20, CELL = 90;
  function gx(x) { return OFF + x * CELL; }
  function gy(y) { return OFF + y * CELL; }
  var W = 620, H = 240, yT = gy(0), yB = gy(2), xL = gx(0), xR = gx(5);
  var yM = gy(1);
  var xb = gx(0), xs = gx(1), xr1 = gx(2), xr2 = gx(3);

  function swClick() { if (readonly) return; if (onStateChange) onStateChange({ switch_closed: !closed }); }

  var glow = I > 0 ? '#fbbf24' : '#374151';

  function wireSeg(x1, y1, x2, y2, w, dash) {
    return createElement('line', {
      x1: x1, y1: y1, x2: x2, y2: y2,
      stroke: w > 3 ? '#334155' : '#3b82f6',
      strokeWidth: w,
      strokeDasharray: dash ? '10 18' : undefined,
      strokeDashoffset: dash ? dashOff : undefined
    });
  }
  var wireKids = [
    wireSeg(xL, yT, gx(1), yT, 4, false),
    wireSeg(gx(1), yT, gx(2), yT, 4, false),
    wireSeg(gx(2), yT, gx(3), yT, 4, false),
    wireSeg(gx(3), yT, xR, yT, 4, false),
    wireSeg(xR, yT, xR, yB, 4, false),
    wireSeg(xR, yB, xL, yB, 4, false),
    wireSeg(xL, yB, xL, yM, 4, false),
    wireSeg(xL, yM, xL, yT, 4, false)
  ];
  var flowKids = (I > 0 && showCur) ? [
    wireSeg(xL, yT, gx(1), yT, 2, true),
    wireSeg(gx(1), yT, gx(2), yT, 2, true),
    wireSeg(gx(2), yT, gx(3), yT, 2, true),
    wireSeg(gx(3), yT, xR, yT, 2, true),
    wireSeg(xR, yT, xR, yB, 2, true),
    wireSeg(xR, yB, xL, yB, 2, true),
    wireSeg(xL, yB, xL, yM, 2, true),
    wireSeg(xL, yM, xL, yT, 2, true)
  ] : [];

  var bat = createElement('g', { transform: 'translate(' + xb + ',' + yM + ')' },
    createElement('rect', { x: -22, y: -28, width: 44, height: 56, rx: 6, fill: '#1e293b', stroke: '#3b5bdb', strokeWidth: 1.5 }),
    createElement('line', { x1: -12, y1: -12, x2: 12, y2: -12, stroke: '#60a5fa', strokeWidth: 3 }),
    createElement('line', { x1: -7, y1: 0, x2: 7, y2: 0, stroke: '#60a5fa', strokeWidth: 2 }),
    createElement('line', { x1: -12, y1: 12, x2: 12, y2: 12, stroke: '#60a5fa', strokeWidth: 3 }),
    createElement('line', { x1: -7, y1: 24, x2: 7, y2: 24, stroke: '#60a5fa', strokeWidth: 2 }),
    showVal ? createElement('text', { x: 0, y: -36, textAnchor: 'middle', fill: '#fbbf24', fontSize: 11, fontFamily: 'monospace' }, 'E = ' + V + 'V') : null
  );

  var sw = createElement('g', {
    transform: 'translate(' + xs + ',' + yT + ')',
    onClick: swClick,
    style: { cursor: readonly ? 'default' : 'pointer' }
  },
    createElement('rect', { x: -24, y: -16, width: 48, height: 32, rx: 6, fill: '#1e293b', stroke: closed ? '#10b981' : '#f97316', strokeWidth: 1.5 }),
    createElement('circle', { cx: -10, cy: 0, r: 4, fill: closed ? '#10b981' : '#6b7280' }),
    createElement('circle', { cx: 10, cy: 0, r: 4, fill: closed ? '#10b981' : '#6b7280' }),
    createElement('line', { x1: -10, y1: 0, x2: closed ? 10 : 5, y2: closed ? 0 : -10, stroke: closed ? '#10b981' : '#f97316', strokeWidth: 2.5, strokeLinecap: 'round' }),
    createElement('text', { x: 0, y: -22, textAnchor: 'middle', fill: closed ? '#10b981' : '#f97316', fontSize: 11, fontFamily: 'monospace' }, closed ? 'ON' : 'OFF')
  );

  function resGroup(xc, val, label) {
    return createElement('g', { transform: 'translate(' + xc + ',' + yT + ')' },
      createElement('rect', { x: -22, y: -14, width: 44, height: 28, rx: 5, fill: '#1e293b', stroke: glow, strokeWidth: 1.5 }),
      createElement('polyline', { points: '-15,0 -10,-9 -5,9 0,-9 5,9 10,-9 15,0', fill: 'none', stroke: glow, strokeWidth: 2, strokeLinejoin: 'round' }),
      showVal ? createElement('text', { x: 0, y: -22, textAnchor: 'middle', fill: '#9ca3af', fontSize: 11, fontFamily: 'monospace' }, label + ' = ' + val + ' \\u03a9') : null
    );
  }
  var r1g = resGroup(xr1, r1, 'R1');
  var r2g = resGroup(xr2, r2, 'R2');

  var panel = createElement('g', null,
    createElement('text', { x: 418, y: 22, fill: '#60a5fa', fontSize: 10, fontFamily: 'monospace', fontWeight: '700' }, 'I = ' + I.toFixed(2)),
    createElement('text', { x: 418, y: 36, fill: '#64748b', fontSize: 8, fontFamily: 'monospace' }, 'I = V / (R1+R2)'),
    createElement('text', { x: 418, y: 54, fill: '#fbbf24', fontSize: 10, fontFamily: 'monospace' }, 'R\\u603b = ' + totalR.toFixed(2)),
    createElement('text', { x: 418, y: 68, fill: '#64748b', fontSize: 8, fontFamily: 'monospace' }, 'R = R1 + R2'),
    createElement('text', { x: 418, y: 86, fill: '#34d399', fontSize: 10, fontFamily: 'monospace' }, 'V1 = ' + v1.toFixed(2)),
    createElement('text', { x: 418, y: 100, fill: '#64748b', fontSize: 8, fontFamily: 'monospace' }, 'V1 = I\\u00d7R1'),
    createElement('text', { x: 418, y: 118, fill: '#6ee7b7', fontSize: 10, fontFamily: 'monospace' }, 'V2 = ' + v2.toFixed(2)),
    createElement('text', { x: 418, y: 132, fill: '#64748b', fontSize: 8, fontFamily: 'monospace' }, 'V2 = I\\u00d7R2')
  );

  var svg = createElement('svg', { width: W, height: H, style: { display: 'block', minWidth: W } },
    createElement('defs', null,
      createElement('marker', { id: 'arrInc', markerWidth: 10, markerHeight: 7, refX: 9, refY: 3.5, orient: 'auto' },
        createElement('polygon', { points: '0 0, 10 3.5, 0 7', fill: '#3b82f6' })
      )
    ),
    wireKids.concat(flowKids).concat([bat, sw, r1g, r2g, panel])
  );

  return createElement('div', { style: { background: '#0b1120', borderRadius: '10px', overflow: 'hidden' } },
    createElement('div', { style: { overflowX: 'auto' } }, svg),
    !readonly ? createElement('div', { style: { background: '#0f172a', padding: '10px 16px', display: 'flex', gap: '12px', alignItems: 'center', flexWrap: 'wrap' } },
      createElement('label', { style: { display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', color: '#d1d5db' }},
        createElement('span', { style: { color: '#60a5fa', fontFamily: 'monospace' }}, 'U'),
        createElement('input', { type: 'range', min: 1, max: 24, step: 0.5, value: V,
          onChange: function(e) { onStateChange({ voltage: parseFloat(e.target.value) }); },
          style: { width: '100px', accentColor: '#3b82f6' } }),
        createElement('span', { style: { fontFamily: 'monospace', color: '#60a5fa' }}, V + 'V')
      ),
      createElement('label', { style: { display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', color: '#d1d5db' }},
        createElement('span', { style: { color: '#fbbf24', fontFamily: 'monospace' }}, 'R1'),
        createElement('input', { type: 'range', min: 1, max: 500, step: 1, value: r1,
          onChange: function(e) { onStateChange({ r1: parseFloat(e.target.value) }); },
          style: { width: '80px', accentColor: '#fbbf24' } }),
        createElement('span', { style: { fontFamily: 'monospace', color: '#fbbf24' }}, r1 + '\\u03a9')
      ),
      createElement('label', { style: { display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', color: '#d1d5db' }},
        createElement('span', { style: { color: '#fbbf24', fontFamily: 'monospace' }}, 'R2'),
        createElement('input', { type: 'range', min: 1, max: 500, step: 1, value: r2,
          onChange: function(e) { onStateChange({ r2: parseFloat(e.target.value) }); },
          style: { width: '80px', accentColor: '#fbbf24' } }),
        createElement('span', { style: { fontFamily: 'monospace', color: '#fbbf24' }}, r2 + '\\u03a9')
      ),
      createElement('button', {
        onClick: swClick,
        style: { padding: '4px 12px', borderRadius: '6px', border: '1px solid ' + (closed ? '#10b981' : '#f97316'),
          background: closed ? 'rgba(16,185,129,0.1)' : 'rgba(249,115,22,0.1)',
          color: closed ? '#10b981' : '#f97316', cursor: 'pointer', fontSize: '12px' }
      }, closed ? '\\u65ad\\u5f00\\u5f00\\u5173' : '\\u9593\\u5408\\u5f00\\u5173')
    ) : null
  );
}`
}}
'''

# 示例 2: Snell's Law 折射（物理 / generic_2d）
EXAMPLE_SNELL = r'''\
{"type":"lab_definition","definition":{
  "registry_key": "physics.snell_refraction_01",
  "title": "Snell's Law — Light Refraction",
  "description": "Investigate how light bends when passing between two media.",
  "subject_lab": "physics",
  "renderer_profile": "generic_2d",
  "dimension": "2d",
  "initial_state": {
    "n1": 1.0,
    "n2": 1.33,
    "incidentAngle": 45,
    "showNormal": true,
    "showAngles": true,
    "showRays": true
  },
  "reducer_spec": { "allowedCommands": ["SET_PARAM"], "maxNodes": 50 },
  "lab_metadata": { "grade": "Grade 10", "topic": "Refraction", "version": "1.0" },
  "lab_type": "ai_generated",
  "status": "draft",
  "visual_profile": null,
  "visual_hint": {
    "type": "geometric",
    "primary_concept": "Refraction diagram with incident ray, reflected ray, and refracted ray",
    "renderSpec": {
      "topology": "ray_diagram",
      "components": [
        { "id": "lens", "type": "lens", "x": 2, "y": 1, "focal": 0 },
        { "id": "ws", "type": "wave_source", "x": 0, "y": 1 }
      ],
      "wires": [],
      "layout": { "direction": "lr", "rows": 1, "cols": 1, "padding": 0 },
      "drawing_commands": [
        { "type": "arrow", "attrs": { "x1": 0, "y1": 0, "x2": 260, "y2": 160 }, "stroke": "#3b82f6" },
        { "type": "arrow", "attrs": { "x1": 260, "y1": 160, "x2": 480, "y2": 80 }, "stroke": "#fbbf24" },
        { "type": "arrow", "attrs": { "x1": 260, "y1": 160, "x2": 480, "y2": 240 }, "stroke": "#3b82f6" }
      ],
      "canvas": { "width": 520, "height": 320 }
    }
  },
  "render_code": `export default function SnellRefractionLab(props) {
  const {state, onStateChange, readonly, t} = props;
  function rv(k, d) { var v = state[k]; if (typeof v === 'number' && isFinite(v)) return v; return d; }
  function rb(k) { var v = state[k]; return !(v === false || v === 0); }
  var n1 = rv('n1', 1.0);
  var n2 = rv('n2', 1.33);
  var incidentAngle = rv('incidentAngle', 45);
  var showNormal = rb('showNormal');
  var showAngles = rb('showAngles');
  var showRays = rb('showRays');

  var W = 520, H = 320;
  var ix = 260, iy = 160;
  var sy = 160;

  var theta1 = incidentAngle * Math.PI / 180;
  var sinTheta2 = (n1 / n2) * Math.sin(theta1);
  var totalReflection = Math.abs(sinTheta2) > 1;
  var theta2 = totalReflection ? 0 : Math.asin(sinTheta2);

  var len = 220;
  var incX = ix - len * Math.cos(theta1);
  var incY = iy - len * Math.sin(theta1);
  var refLX = ix - len * Math.cos(theta1);
  var refLY = iy + len * Math.sin(theta1);
  var refRX = ix + len * Math.cos(theta2);
  var refRY = iy + len * Math.sin(theta2);

  var rayKids = showRays ? (
    totalReflection
      ? [
          createElement('line', { x1: incX, y1: incY, x2: ix, y2: iy, stroke: '#3b82f6', strokeWidth: 2.5 }),
          createElement('line', { x1: ix, y1: iy, x2: refLX, y2: refLY, stroke: '#60a5fa', strokeWidth: 1.5, strokeDasharray: '6 4' }),
        ]
      : [
          createElement('line', { x1: incX, y1: incY, x2: ix, y2: iy, stroke: '#3b82f6', strokeWidth: 2.5 }),
          createElement('line', { x1: ix, y1: iy, x2: refLX, y2: refLY, stroke: '#60a5fa', strokeWidth: 1.5, strokeDasharray: '6 4' }),
          createElement('line', { x1: ix, y1: iy, x2: refRX, y2: refRY, stroke: '#fbbf24', strokeWidth: 2 }),
        ]
  ) : [];

  var angleArc = function(cx, cy, r, startAngle, endAngle, stroke, fill) {
    var x1 = cx + r * Math.cos(startAngle), y1 = cy + r * Math.sin(startAngle);
    var x2 = cx + r * Math.cos(endAngle), y2 = cy + r * Math.sin(endAngle);
    var large = Math.abs(endAngle - startAngle) > Math.PI ? 1 : 0;
    return createElement('path', {
      d: 'M ' + x1 + ' ' + y1 + ' A ' + r + ' ' + r + ' 0 ' + large + ' 1 ' + x2 + ' ' + y2,
      fill: fill || 'none', stroke: stroke || '#94a3b8', strokeWidth: 1.5
    });
  };
  var angleKids = showAngles ? [
    angleArc(ix, iy, 50, Math.PI - theta1, Math.PI, '#3b82f6'),
    !totalReflection ? angleArc(ix, iy, 50, 0, theta2, '#fbbf24') : null,
    createElement('text', { x: ix - 62, y: iy - 48, fill: '#60a5fa', fontSize: 10, fontFamily: 'monospace', textAnchor: 'middle' }, '\\u03b8\\u2081=' + incidentAngle.toFixed(1) + '\\u00b0'),
    !totalReflection ? createElement('text', { x: ix + 58, y: iy + 36, fill: '#fbbf24', fontSize: 10, fontFamily: 'monospace', textAnchor: 'middle' }, '\\u03b8\\u2082=' + (theta2 * 180 / Math.PI).toFixed(1) + '\\u00b0') : null
  ] : [];

  var normalLine = showNormal ? createElement('line', { x1: 24, y1: iy, x2: W - 24, y2: iy, stroke: '#10b981', strokeWidth: 1, strokeDasharray: '6 4' }) : null;

  var labelKids = [
    createElement('text', { x: 20, y: 20, fill: '#94a3b8', fontSize: 11, fontFamily: 'monospace' }, 'n\\u2081 = ' + n1.toFixed(2) + ' (\\u7a7a\\u6c14)'),
    createElement('text', { x: 20, y: 36, fill: '#94a3b8', fontSize: 11, fontFamily: 'monospace' }, 'n\\u2082 = ' + n2.toFixed(2) + ' (\\u6c34)'),
    createElement('text', { x: ix - 10, y: iy + 30, fill: '#94a3b8', fontSize: 10, fontFamily: 'monospace', textAnchor: 'middle' }, '\\u754c\\u9762'),
    totalReflection ? createElement('text', { x: ix + 100, y: iy + 50, fill: '#f97316', fontSize: 11, fontFamily: 'monospace' }, '\\u5168\\u53cd\\u5c04!') : null,
    showRays ? createElement('g', null,
      createElement('line', { x1: 10, y1: sy, x2: 30, y2: sy, stroke: '#3b82f6', strokeWidth: 2.5 }),
      createElement('text', { x: 35, y: sy + 4, fill: '#60a5fa', fontSize: 9, fontFamily: 'monospace' }, '\\u5165\\u5c04\\u5149')
    ) : null,
    showRays ? createElement('g', null,
      createElement('line', { x1: 10, y1: sy + 15, x2: 30, y2: sy + 15, stroke: '#60a5fa', strokeWidth: 1.5, strokeDasharray: '6 4' }),
      createElement('text', { x: 35, y: sy + 19, fill: '#60a5fa', fontSize: 9, fontFamily: 'monospace' }, '\\u53cd\\u5c04\\u5149')
    ) : null,
    showRays ? createElement('g', null,
      createElement('line', { x1: 10, y1: sy + 30, x2: 30, y2: sy + 30, stroke: '#fbbf24', strokeWidth: 2 }),
      createElement('text', { x: 35, y: sy + 34, fill: '#fbbf24', fontSize: 9, fontFamily: 'monospace' }, '\\u6298\\u5c04\\u5149')
    ) : null
  ];

  var lensRect = createElement('rect', { x: ix - 4, y: 20, width: 8, height: H - 40, fill: 'rgba(59,130,246,0.12)', stroke: '#3b82f6', strokeWidth: 1.5 });
  var airRect = createElement('rect', { x: 0, y: 0, width: Math.max(0, ix - 4), height: H, fill: 'rgba(59,130,246,0.06)' });
  var waterRect = createElement('rect', { x: ix + 4, y: 0, width: Math.max(0, W - ix - 4), height: H, fill: 'rgba(56,189,248,0.08)' });

  var svg = createElement('svg', { width: W, height: H, style: { display: 'block' } },
    createElement('rect', { x: 0, y: 0, width: W, height: H, fill: '#0b1120' }),
    airRect,
    waterRect,
    lensRect,
    normalLine,
    rayKids,
    angleKids,
    labelKids
  );

  return createElement('div', { style: { background: '#0b1120', borderRadius: '10px', overflow: 'hidden' } },
    createElement('div', { style: { overflowX: 'auto' } }, svg),
    !readonly ? createElement('div', { style: { background: '#0f172a', padding: '10px 16px', display: 'flex', gap: '12px', alignItems: 'center', flexWrap: 'wrap' } },
      createElement('label', { style: { display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', color: '#d1d5db' }},
        createElement('span', { style: { color: '#60a5fa', fontFamily: 'monospace' }}, 'n1'),
        createElement('input', { type: 'range', min: 0.5, max: 3.0, step: 0.01, value: n1,
          onChange: function(e) { onStateChange({ n1: parseFloat(e.target.value) }); },
          style: { width: '80px', accentColor: '#3b82f6' } }),
        createElement('span', { style: { fontFamily: 'monospace', color: '#60a5fa' }}, n1.toFixed(2))
      ),
      createElement('label', { style: { display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', color: '#d1d5db' }},
        createElement('span', { style: { color: '#fbbf24', fontFamily: 'monospace' }}, 'n2'),
        createElement('input', { type: 'range', min: 0.5, max: 3.0, step: 0.01, value: n2,
          onChange: function(e) { onStateChange({ n2: parseFloat(e.target.value) }); },
          style: { width: '80px', accentColor: '#fbbf24' } }),
        createElement('span', { style: { fontFamily: 'monospace', color: '#fbbf24' }}, n2.toFixed(2))
      ),
      createElement('label', { style: { display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', color: '#d1d5db' }},
        createElement('span', { style: { color: '#94a3b8', fontFamily: 'monospace' }}, '\\u5165\\u5c04\\u89d2'),
        createElement('input', { type: 'range', min: 5, max: 85, step: 1, value: incidentAngle,
          onChange: function(e) { onStateChange({ incidentAngle: parseFloat(e.target.value) }); },
          style: { width: '100px', accentColor: '#94a3b8' } }),
        createElement('span', { style: { fontFamily: 'monospace', color: '#94a3b8' }}, incidentAngle + '\\u00b0')
      )
    ) : null
  );
}`
}}
'''

# 示例 3: Simple Pendulum（物理 / generic_2d）
EXAMPLE_PENDULUM = r'''\
{"type":"lab_definition","definition":{
  "registry_key": "physics.pendulum_simple",
  "title": "Simple Pendulum",
  "description": "Investigate simple harmonic motion by adjusting length, mass, and damping.",
  "subject_lab": "physics",
  "renderer_profile": "generic_2d",
  "dimension": "2d",
  "initial_state": {
    "length": 1.5,
    "gravity": 9.8,
    "mass": 1.0,
    "initialAngle": 30,
    "damping": 0.05,
    "showVelocity": true,
    "showTrajectory": true
  },
  "reducer_spec": { "allowedCommands": ["SET_PARAM"], "maxNodes": 50 },
  "lab_metadata": { "grade": "Grade 10", "topic": "Simple Harmonic Motion", "version": "1.0" },
  "lab_type": "ai_generated",
  "status": "draft",
  "visual_profile": null,
  "visual_hint": {
    "type": "pendulum",
    "primary_concept": "Simple pendulum with adjustable length and damping, showing trajectory arc",
    "renderSpec": {
      "topology": "pendulum_chain",
      "components": [{ "id": "pivot", "type": "point", "x": 2, "y": 0 }],
      "wires": [],
      "layout": { "direction": "tb", "rows": 1, "cols": 1, "padding": 0 },
      "drawing_commands": [
        { "type": "arc", "attrs": { "x": 240, "y": 60, "r": 150, "startAngle": 0, "endAngle": 180 }, "stroke": "rgba(96,165,250,0.15)", "strokeWidth": 1, "strokeDasharray": "4 4" }
      ],
      "canvas": { "width": 520, "height": 380 }
    }
  },
  "render_code": `export default function SimplePendulumLab(props) {
  const {state, onStateChange, readonly, t} = props;
  function rv(k, d) { var v = state[k]; if (typeof v === 'number' && isFinite(v)) return v; return d; }
  function rb(k) { var v = state[k]; return !(v === false || v === 0); }
  var L = rv('length', 1.5);
  var g = rv('gravity', 9.8);
  var m = rv('mass', 1.0);
  var theta0 = rv('initialAngle', 30) * Math.PI / 180;
  var damping = rv('damping', 0.05);
  var showVel = rb('showVelocity');
  var showTrail = rb('showTrajectory');

  var W = 520, H = 380;
  var pivotX = 260, pivotY = 60;
  var scale = 110;
  var Lpx = L * scale;
  var omega = Math.sqrt(g / L);
  var period = 2 * Math.PI / omega;

  var anim = (typeof t === 'number' && isFinite(t)) ? t : 0;
  var theta = theta0 * Math.cos(omega * anim) * Math.exp(-damping * anim * 0.5);
  var bobX = pivotX + Lpx * Math.sin(theta);
  var bobY = pivotY + Lpx * Math.cos(theta);
  var velSign = -Math.sin(theta) * theta0 * omega * Math.exp(-damping * anim * 0.5);
  var velLabel = Math.abs(velSign) < 0.01 ? '0.00' : Math.abs(velSign).toFixed(2);
  var velDir = velSign >= 0 ? '\\u2192' : '\\u2190';

  var swingDir = theta > 0 ? 1 : -1;
  var arcEndAngle = theta > 0 ? Math.PI / 2 - theta : Math.PI / 2 + theta;

  var trailKids = showTrail ? [
    createElement('path', {
      d: 'M ' + (pivotX + Lpx * Math.sin(-theta0)) + ' ' + (pivotY + Lpx * Math.cos(-theta0)) +
         ' A ' + Lpx + ' ' + Lpx + ' 0 0 1 ' + bobX + ' ' + bobY,
      fill: 'none', stroke: 'rgba(96,165,250,0.2)', strokeWidth: 1.5, strokeDasharray: '4 4'
    })
  ] : [];

  var rod = createElement('line', {
    x1: pivotX, y1: pivotY, x2: bobX, y2: bobY,
    stroke: '#94a3b8', strokeWidth: 2.5
  });

  var bob = createElement('g', null,
    createElement('circle', {
      cx: bobX, cy: bobY, r: 14 + Math.min(m * 6, 10),
      fill: 'url(#bobGrad)', stroke: '#60a5fa', strokeWidth: 2
    }),
    createElement('circle', {
      cx: bobX, cy: bobY, r: 6,
      fill: '#bfdbfe', opacity: 0.6
    }),
    showVel ? createElement('text', {
      x: bobX + 20, y: bobY - 5,
      fill: '#fbbf24', fontSize: 10, fontFamily: 'monospace'
    }, velLabel + 'm/s') : null,
    showVel ? createElement('text', {
      x: bobX + 20, y: bobY + 8,
      fill: '#64748b', fontSize: 9, fontFamily: 'monospace'
    }, velDir) : null
  );

  var pivot = createElement('g', null,
    createElement('circle', { cx: pivotX, cy: pivotY, r: 6, fill: '#64748b', stroke: '#94a3b8', strokeWidth: 1.5 }),
    createElement('rect', { x: pivotX - 20, y: pivotY - 4, width: 40, height: 8, rx: 3, fill: '#475569' })
  );

  var angleArcStart = Math.PI / 2 - theta0;
  var angleArcEnd = Math.PI / 2;
  var ax1 = pivotX + 30 * Math.cos(angleArcStart);
  var ay1 = pivotY + 30 * Math.sin(angleArcStart);
  var ax2 = pivotX + 30 * Math.cos(angleArcEnd);
  var ay2 = pivotY + 30 * Math.sin(angleArcEnd);
  var angleArcR = 30;
  var angleLabelX = pivotX + 22;
  var angleLabelY = pivotY + 20;
  var angleLabel = (theta0 * 180 / Math.PI).toFixed(1);

  var svg = createElement('svg', { width: W, height: H, style: { display: 'block' } },
    createElement('defs', null,
      createElement('radialGradient', { id: 'bobGrad', cx: '35%', cy: '35%', r: '65%' },
        createElement('stop', { offset: '0%', stopColor: '#bfdbfe' }),
        createElement('stop', { offset: '100%', stopColor: '#1d4ed8' })
      )
    ),
    createElement('rect', { x: 0, y: 0, width: W, height: H, fill: '#0b1120' }),
    createElement('line', { x1: 0, y1: pivotY, x2: W, y2: pivotY, stroke: '#1e293b', strokeWidth: 1, strokeDasharray: '8 8' }),
    createElement('path', {
      d: 'M ' + (pivotX - Lpx - 10) + ' ' + (pivotY + 10) + ' A ' + (Lpx + 10) + ' ' + (Lpx + 10) + ' 0 0 1 ' + (pivotX + Lpx + 10) + ' ' + (pivotY + 10),
      fill: 'none', stroke: 'rgba(96,165,250,0.1)', strokeWidth: 1, strokeDasharray: '4 6'
    }),
    trailKids,
    createElement('path', {
      d: 'M ' + ax1 + ' ' + ay1 + ' A ' + angleArcR + ' ' + angleArcR + ' 0 0 1 ' + ax2 + ' ' + ay2,
      fill: 'none', stroke: '#10b981', strokeWidth: 1.5
    }),
    createElement('text', { x: angleLabelX, y: angleLabelY, fill: '#10b981', fontSize: 10, fontFamily: 'monospace' }, angleLabel + '\\u00b0'),
    rod,
    bob,
    pivot,
    createElement('text', { x: pivotX + 8, y: pivotY - 12, fill: '#94a3b8', fontSize: 9, fontFamily: 'monospace' }, 'L=' + L + 'm'),
    createElement('text', { x: 12, y: H - 20, fill: '#64748b', fontSize: 10, fontFamily: 'monospace' }, 'T = ' + period.toFixed(3) + 's  (\\u5468\\u671f)'),
    createElement('text', { x: 12, y: H - 36, fill: '#64748b', fontSize: 10, fontFamily: 'monospace' }, '\\u03c9 = ' + omega.toFixed(3) + ' rad/s')
  );

  return createElement('div', { style: { background: '#0b1120', borderRadius: '10px', overflow: 'hidden' } },
    createElement('div', { style: { overflowX: 'auto' } }, svg),
    !readonly ? createElement('div', { style: { background: '#0f172a', padding: '10px 16px', display: 'flex', gap: '12px', alignItems: 'center', flexWrap: 'wrap' } },
      createElement('label', { style: { display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', color: '#d1d5db' }},
        createElement('span', { style: { color: '#60a5fa', fontFamily: 'monospace' }}, 'L'),
        createElement('input', { type: 'range', min: 0.3, max: 3.0, step: 0.1, value: L,
          onChange: function(e) { onStateChange({ length: parseFloat(e.target.value) }); },
          style: { width: '100px', accentColor: '#3b82f6' } }),
        createElement('span', { style: { fontFamily: 'monospace', color: '#60a5fa' }}, L.toFixed(1) + 'm')
      ),
      createElement('label', { style: { display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', color: '#d1d5db' }},
        createElement('span', { style: { color: '#fbbf24', fontFamily: 'monospace' }}, 'm'),
        createElement('input', { type: 'range', min: 0.1, max: 5.0, step: 0.1, value: m,
          onChange: function(e) { onStateChange({ mass: parseFloat(e.target.value) }); },
          style: { width: '80px', accentColor: '#fbbf24' } }),
        createElement('span', { style: { fontFamily: 'monospace', color: '#fbbf24' }}, m.toFixed(1) + 'kg')
      ),
      createElement('label', { style: { display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', color: '#d1d5db' }},
        createElement('span', { style: { color: '#10b981', fontFamily: 'monospace' }}, '\\u03b8'),
        createElement('input', { type: 'range', min: 5, max: 80, step: 1, value: theta0 * 180 / Math.PI,
          onChange: function(e) { onStateChange({ initialAngle: parseFloat(e.target.value) }); },
          style: { width: '80px', accentColor: '#10b981' } }),
        createElement('span', { style: { fontFamily: 'monospace', color: '#10b981' }}, (theta0 * 180 / Math.PI).toFixed(0) + '\\u00b0')
      ),
      createElement('label', { style: { display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', color: '#d1d5db' }},
        createElement('span', { style: { color: '#94a3b8', fontFamily: 'monospace' }}, 'd'),
        createElement('input', { type: 'range', min: 0, max: 0.5, step: 0.01, value: damping,
          onChange: function(e) { onStateChange({ damping: parseFloat(e.target.value) }); },
          style: { width: '80px', accentColor: '#94a3b8' } }),
        createElement('span', { style: { fontFamily: 'monospace', color: '#94a3b8' }}, damping.toFixed(2) + ' kg/s')
      )
    ) : null
  );
}`
}}
'''

# 示例 4: Acid-Base Titration（化学 / function_2d）
EXAMPLE_TITRATION = r'''\
{"type":"lab_definition","definition":{
  "registry_key": "chemistry.acid_base_titration_01",
  "title": "Acid-Base Titration Curve",
  "description": "Explore the pH curve during acid-base titration with adjustable acid/base concentration.",
  "subject_lab": "chemistry",
  "renderer_profile": "function_2d",
  "dimension": "2d",
  "initial_state": {
    "acidConc": 0.1,
    "baseConc": 0.1,
    "acidVolume": 25,
    "indicator": 7.0,
    "showDerivative": true
  },
  "reducer_spec": { "allowedCommands": ["SET_PARAM"], "maxNodes": 50 },
  "lab_metadata": { "grade": "Grade 11", "topic": "Acid-Base Titration", "version": "1.0" },
  "lab_type": "ai_generated",
  "status": "draft",
  "visual_profile": null,
  "visual_hint": {
    "type": "curve",
    "primary_concept": "Titration curve plotting pH vs volume of base added, with equivalence point",
    "renderSpec": {
      "topology": "custom",
      "components": [],
      "wires": [],
      "layout": { "direction": "lr", "rows": 1, "cols": 1, "padding": 0 },
      "drawing_commands": [],
      "axis": { "show": true, "xLabel": "V (mL)", "yLabel": "pH", "origin": false },
      "canvas": { "width": 560, "height": 360 }
    }
  },
  "render_code": `export default function TitrationCurveLab(props) {
  const {state, onStateChange, readonly, t} = props;
  function rv(k, d) { var v = state[k]; if (typeof v === 'number' && isFinite(v)) return v; return d; }
  function rb(k) { var v = state[k]; return !(v === false || v === 0); }
  var acidConc = rv('acidConc', 0.1);
  var baseConc = rv('baseConc', 0.1);
  var acidVolume = rv('acidVolume', 25);
  var indicator = rv('indicator', 7.0);
  var showDeriv = rb('showDerivative');

  var W = 560, H = 360;
  var marginX = 60, marginY = 40;
  var plotW = W - marginX - 40, plotH = H - marginY - 50;
  var maxV = 60;

  function computePH(vBase) {
    var C1 = acidConc, V1 = acidVolume;
    var C2 = baseConc, V2 = vBase;
    var nAcid = C1 * V1;
    var nBase = C2 * V2;
    var diff = nAcid - nBase;
    if (diff > 0) {
      var H = diff / (V1 + V2);
      return -Math.log10(H);
    } else if (Math.abs(diff) < 1e-10) {
      return 7.0;
    } else {
      var OH = nBase - nAcid;
      var pOH = -Math.log10(OH / (V1 + V2));
      return 14 - pOH;
    }
  }

  function toX(v) { return marginX + (v / maxV) * plotW; }
  function toY(pH) { var clamped = Math.max(0, Math.min(14, pH)); return marginY + plotH - (clamped / 14) * plotH; }

  var pts = [];
  var step = 0.5;
  for (var v = 0; v <= maxV; v += step) {
    pts.push([toX(v), toY(computePH(v))]);
  }

  function ptStr(arr) { return arr.map(function(p) { return p[0] + ',' + p[1]; }).join(' '); }

  var eqV = acidConc * acidVolume / baseConc;
  var eqX = toX(eqV), eqY = toY(7);
  var eqMarker = createElement('g', null,
    createElement('line', { x1: eqX, y1: marginY, x2: eqX, y2: H - marginY - 50, stroke: '#f97316', strokeWidth: 1, strokeDasharray: '6 4' }),
    createElement('circle', { cx: eqX, cy: eqY, r: 5, fill: '#f97316' }),
    createElement('text', { x: eqX + 5, y: eqY - 6, fill: '#f97316', fontSize: 9, fontFamily: 'monospace' }, 'V\\u7b49=' + eqV.toFixed(1) + 'mL')
  );

  var derivPts = [];
  var h = 0.1;
  for (var vi = h; vi <= maxV - h; vi += 1) {
    var dpH = (computePH(vi + h) - computePH(vi - h)) / (2 * h);
    derivPts.push([toX(vi), toY(7 + dpH * 1.5)]);
  }
  var derivLine = showDeriv ? createElement('polyline', { points: ptStr(derivPts), fill: 'none', stroke: '#10b981', strokeWidth: 1.5, opacity: 0.7 }) : null;

  var indicatorY = toY(indicator);
  var indMarker = createElement('g', null,
    createElement('line', { x1: marginX, y1: indicatorY, x2: W - marginY - 40, y2: indicatorY, stroke: '#8b5cf6', strokeWidth: 1, strokeDasharray: '4 4' }),
    createElement('text', { x: W - marginY - 38, y: indicatorY - 4, fill: '#8b5cf6', fontSize: 9, fontFamily: 'monospace' }, '\\u7b3c\\u7ebf pH=' + indicator.toFixed(1))
  );

  var acidConcPts = pts.filter(function(p, i) { return i % 12 === 0; });
  var acidConcLabels = [
    createElement('text', { x: toX(10), y: toY(computePH(10)) - 8, fill: '#60a5fa', fontSize: 9, fontFamily: 'monospace', textAnchor: 'middle' }, 'pH=' + computePH(10).toFixed(2))
  ];

  var axisX = createElement('g', null,
    createElement('line', { x1: marginX, y1: H - marginY - 50, x2: W - marginY - 20, y2: H - marginY - 50, stroke: '#475569', strokeWidth: 1.5 }),
    createElement('line', { x1: marginX, y1: H - marginY - 50, x2: marginX - 5, y2: H - marginY - 55, stroke: '#475569', strokeWidth: 1.5 }),
    createElement('line', { x1: marginX, y1: H - marginY - 50, x2: marginX - 5, y2: H - marginY - 45, stroke: '#475569', strokeWidth: 1.5 }),
    createElement('text', { x: W - marginY - 10, y: H - marginY - 40, fill: '#94a3b8', fontSize: 11, fontFamily: 'monospace' }, 'V (mL)'),
    createElement('text', { x: marginX - 30, y: marginY + 5, fill: '#94a3b8', fontSize: 11, fontFamily: 'monospace' }, 'pH')
  );

  var tickY = [0, 2, 4, 7, 10, 12, 14];
  var tickYKids = tickY.map(function(v) {
    return createElement('g', null,
      createElement('line', { x1: marginX - 5, y1: toY(v), x2: marginX, y2: toY(v), stroke: '#475569', strokeWidth: 1 }),
      createElement('text', { x: marginX - 8, y: toY(v) + 4, fill: '#64748b', fontSize: 9, fontFamily: 'monospace', textAnchor: 'end' }, String(v))
    );
  });
  var tickX = [0, 10, 20, 30, 40, 50, 60];
  var tickXKids = tickX.map(function(v) {
    return createElement('g', null,
      createElement('line', { x1: toX(v), y1: H - marginY - 50, x2: toX(v), y2: H - marginY - 45, stroke: '#475569', strokeWidth: 1 }),
      createElement('text', { x: toX(v), y: H - marginY - 34, fill: '#64748b', fontSize: 9, fontFamily: 'monospace', textAnchor: 'middle' }, String(v))
    );
  });

  var svg = createElement('svg', { width: W, height: H, style: { display: 'block' } },
    createElement('rect', { x: 0, y: 0, width: W, height: H, fill: '#0b1120' }),
    axisX,
    tickYKids,
    tickXKids,
    createElement('polyline', { points: ptStr(pts), fill: 'none', stroke: '#3b82f6', strokeWidth: 2 }),
    derivLine,
    eqMarker,
    indMarker,
    acidConcLabels,
    createElement('text', { x: marginX + 5, y: marginY + 15, fill: '#64748b', fontSize: 9, fontFamily: 'monospace' }, 'HCl ' + acidConc + 'M, ' + acidVolume + 'mL + NaOH ' + baseConc + 'M')
  );

  return createElement('div', { style: { background: '#0b1120', borderRadius: '10px', overflow: 'hidden' } },
    createElement('div', { style: { overflowX: 'auto' } }, svg),
    !readonly ? createElement('div', { style: { background: '#0f172a', padding: '10px 16px', display: 'flex', gap: '12px', alignItems: 'center', flexWrap: 'wrap' } },
      createElement('label', { style: { display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', color: '#d1d5db' }},
        createElement('span', { style: { color: '#60a5fa', fontFamily: 'monospace' }}, '[H+]'),
        createElement('input', { type: 'range', min: 0.01, max: 1.0, step: 0.01, value: acidConc,
          onChange: function(e) { onStateChange({ acidConc: parseFloat(e.target.value) }); },
          style: { width: '80px', accentColor: '#3b82f6' } }),
        createElement('span', { style: { fontFamily: 'monospace', color: '#60a5fa' }}, acidConc.toFixed(2) + 'M')
      ),
      createElement('label', { style: { display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', color: '#d1d5db' }},
        createElement('span', { style: { color: '#fbbf24', fontFamily: 'monospace' }}, '[OH-]'),
        createElement('input', { type: 'range', min: 0.01, max: 1.0, step: 0.01, value: baseConc,
          onChange: function(e) { onStateChange({ baseConc: parseFloat(e.target.value) }); },
          style: { width: '80px', accentColor: '#fbbf24' } }),
        createElement('span', { style: { fontFamily: 'monospace', color: '#fbbf24' }}, baseConc.toFixed(2) + 'M')
      ),
      createElement('label', { style: { display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', color: '#d1d5db' }},
        createElement('span', { style: { color: '#10b981', fontFamily: 'monospace' }}, 'V\\u9178'),
        createElement('input', { type: 'range', min: 5, max: 100, step: 1, value: acidVolume,
          onChange: function(e) { onStateChange({ acidVolume: parseFloat(e.target.value) }); },
          style: { width: '80px', accentColor: '#10b981' } }),
        createElement('span', { style: { fontFamily: 'monospace', color: '#10b981' }}, acidVolume + 'mL')
      ),
      createElement('label', { style: { display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', color: '#d1d5db' }},
        createElement('input', { type: 'checkbox', checked: showDeriv,
          onChange: function(e) { onStateChange({ showDerivative: e.target.checked }); },
          style: { accentColor: '#10b981' } }),
        createElement('span', { style: { color: '#94a3b8', fontFamily: 'monospace', fontSize: '11px' }}, '\\u6e10\\u8fdb\\u66f2\\u7ebf')
      )
    ) : null
  );
}`
}}
'''

# 示例 5: Animal Cell Structure（生物 / cell_3d）
EXAMPLE_CELL = r'''\
{"type":"lab_definition","definition":{
  "registry_key": "biology.cell_animal_01",
  "title": "Animal Cell Structure",
  "description": "Explore the structure of an animal cell, showing organelles and their functions.",
  "subject_lab": "biology",
  "renderer_profile": "cell_3d",
  "dimension": "3d",
  "initial_state": {
    "showNucleus": true,
    "showMitochondria": true,
    "showER": true,
    "showGolgi": true,
    "showRibosome": true,
    "showCytoplasm": true,
    "highlightOrganelle": "none"
  },
  "reducer_spec": { "allowedCommands": ["SET_PARAM"], "maxNodes": 50 },
  "lab_metadata": { "grade": "Grade 9", "topic": "Cell Biology", "version": "1.0" },
  "lab_type": "ai_generated",
  "status": "draft",
  "visual_profile": null,
  "visual_hint": {
    "type": "mixed",
    "primary_concept": "Cross-section of an animal cell showing major organelles",
    "renderSpec": {
      "topology": "custom",
      "components": [],
      "wires": [],
      "layout": { "direction": "lr", "rows": 1, "cols": 1, "padding": 0 },
      "drawing_commands": [],
      "canvas": { "width": 480, "height": 480 }
    }
  },
  "render_code": `export default function AnimalCellLab(props) {
  const {state, onStateChange, readonly, t} = props;
  function rb(k) { var v = state[k]; return !(v === false || v === 0); }
  function rv(k, d) { var v = state[k]; if (typeof v === 'number' && isFinite(v)) return v; return d; }
  var showNucleus = rb('showNucleus');
  var showMito = rb('showMitochondria');
  var showER = rb('showER');
  var showGolgi = rb('showGolgi');
  var showRibosome = rb('showRibosome');
  var showCytoplasm = rb('showCytoplasm');
  var highlight = state.highlightOrganelle || 'none';

  var W = 480, H = 480;
  var cx = 240, cy = 240;
  var anim = (typeof t === 'number' && isFinite(t)) ? t : 0;

  function hl(type, color) {
    return highlight === type ? color : 'none';
  }
  function hlStroke(type, color) {
    return highlight === type ? color + 'ff' : color + '44';
  }
  function highlightGlow(type, color) {
    return highlight === type ? 'url(#glow' + type + ')' : 'none';
  }

  var hScale = 1 + 0.02 * Math.sin(anim * 2);

  var cytoplasm = showCytoplasm ? createElement('g', null,
    createElement('ellipse', { cx: cx, cy: cy, rx: 190 * hScale, ry: 180 * hScale, fill: 'rgba(16,185,129,0.06)', stroke: '#10b981', strokeWidth: 2 })
  ) : null;

  var nucleus = showNucleus ? createElement('g', null,
    createElement('circle', { cx: cx - 10, cy: cy - 20, r: 62, fill: 'rgba(168,85,247,0.15)', stroke: '#a855f7', strokeWidth: hlStroke('nucleus', 2) }),
    createElement('circle', { cx: cx - 10, cy: cy - 20, r: 62, fill: highlightGlow('nucleus', '#a855f7'), pointerEvents: 'none' }),
    createElement('circle', { cx: cx - 10, cy: cy - 20, r: 18, fill: 'rgba(168,85,247,0.4)', stroke: '#c084fc', strokeWidth: 1.5 }),
    createElement('text', { x: cx - 10, y: cy - 20, fill: '#c084fc', fontSize: 9, fontFamily: 'monospace', textAnchor: 'middle', dominantBaseline: 'middle' }, '核\\u808c')
  ) : null;

  var mitoPositions = [
    [cx + 50, cy - 80], [cx - 80, cy + 30], [cx + 70, cy + 60], [cx - 40, cy - 90]
  ];
  var mitoKids = showMito ? mitoPositions.map(function(pos) {
    var mx = pos[0], my = pos[1];
    return createElement('g', { transform: 'translate(' + mx + ',' + my + ')', opacity: 0.7 + 0.3 * Math.sin(anim * 1.5 + mx * 0.05) },
      createElement('ellipse', { cx: 0, cy: 0, rx: 20, ry: 10, transform: 'rotate(30)', fill: '#ef4444', stroke: '#f87171', strokeWidth: hlStroke('mitochondria', 1.5) }),
      createElement('path', { d: 'M -15,0 Q 0,-6 15,0', fill: 'none', stroke: '#fca5a5', strokeWidth: 1 }),
      createElement('text', { x: 24, y: 4, fill: '#f87171', fontSize: 7, fontFamily: 'monospace' }, '\\u7c97\\u7cd9')
    );
  }) : [] : [];

  var erPositions = [
    [cx - 100, cy - 40, 'translate(' + (cx - 100) + ',' + (cy - 40) + ')'],
    [cx + 20, cy + 100, 'translate(' + (cx + 20) + ',' + (cy + 100) + ')']
  ];
  var erKids = showER ? erPositions.map(function(pos) {
    var ex = pos[0], ey = pos[1];
    var w1 = 50, w2 = 25;
    return createElement('g', { transform: 'translate(' + ex + ',' + ey + ')' },
      createElement('path', { d: 'M 0,0 Q 15,-20 0,-40 Q -15,-60 0,-80 Q 15,-100 0,-120', fill: 'none', stroke: '#3b82f6', strokeWidth: 1.5, strokeDasharray: '4 3' }),
      createElement('path', { d: 'M 0,0 Q 15,-20 0,-40 Q -15,-60 0,-80 Q 15,-100 0,-120', fill: 'none', stroke: '#60a5fa', strokeWidth: 0.8, strokeDasharray: '2 4', transform: 'translate(6,-3)' }),
      createElement('text', { x: 10, y: -55, fill: '#60a5fa', fontSize: 7, fontFamily: 'monospace' }, '\\u5185\\u8d28\\u7b52')
    );
  }) : [] : [];

  var golgi = showGolgi ? createElement('g', { transform: 'translate(' + (cx + 100) + ',' + (cy - 20) + ')' },
    createElement('path', { d: 'M -30,10 Q 0,-5 30,10', fill: 'none', stroke: '#f97316', strokeWidth: 2 }),
    createElement('path', { d: 'M -30,0 Q 0,-15 30,0', fill: 'none', stroke: '#f97316', strokeWidth: 2 }),
    createElement('path', { d: 'M -30,-10 Q 0,-25 30,-10', fill: 'none', stroke: '#f97316', strokeWidth: 2 }),
    createElement('path', { d: 'M -30,-20 Q 0,-35 30,-20', fill: 'none', stroke: '#f97316', strokeWidth: 2 }),
    createElement('circle', { cx: 35, cy: 5, r: 4, fill: '#fbbf24', stroke: '#f59e0b', strokeWidth: 1 }),
    createElement('circle', { cx: 35, cy: -5, r: 4, fill: '#fbbf24', stroke: '#f59e0b', strokeWidth: 1 }),
    createElement('text', { x: 38, y: 4, fill: '#f97316', fontSize: 7, fontFamily: 'monospace' }, '\\u9ad8\\u5c14\\u57fa\\u7b52')
  ) : null;

  var riboPositions = [
    [cx + 30, cy - 50], [cx - 30, cy + 80], [cx - 60, cy - 60],
    [cx + 90, cy + 40], [cx + 50, cy + 120], [cx - 110, cy + 80]
  ];
  var riboKids = showRibosome ? riboPositions.map(function(pos) {
    var rx = pos[0], ry = pos[1];
    var offset = Math.sin(anim * 3 + rx * 0.1) * 2;
    return createElement('g', { transform: 'translate(' + (rx + offset) + ',' + ry + ')', opacity: 0.6 + 0.4 * Math.sin(anim * 2 + ry * 0.1) },
      createElement('circle', { cx: -4, cy: 0, r: 4, fill: '#fbbf24', stroke: '#f59e0b', strokeWidth: 1 }),
      createElement('circle', { cx: 4, cy: 0, r: 4, fill: '#fbbf24', stroke: '#f59e0b', strokeWidth: 1 })
    );
  }) : [] : [];

  var labelKids = [
    createElement('text', { x: cx, y: H - 12, fill: '#64748b', fontSize: 10, fontFamily: 'monospace', textAnchor: 'middle' }, '\\u52a8\\u7269\\u7ec6\\u80de \\u7c7b\\u578b: \\u690d\\u7269\\u7ec6\\u80de'),
    createElement('text', { x: 8, y: 18, fill: '#475569', fontSize: 9, fontFamily: 'monospace' }, '\\u70b9\\u51fb\\u7ec6\\u80de\\u67f1\\u67f1\\u67f1\\u67f1\\u67f1\\u67f1\\u67f1\\u67f1')
  ];

  var svg = createElement('svg', { width: W, height: H, style: { display: 'block' } },
    createElement('defs', null,
      createElement('filter', { id: 'glow' },
        createElement('feGaussianBlur', { stdDeviation: 3, result: 'blur' }),
        createElement('feMerge', null,
          createElement('feMergeNode', { in: 'blur' }),
          createElement('feMergeNode', { in: 'SourceGraphic' })
        )
      )
    ),
    createElement('rect', { x: 0, y: 0, width: W, height: H, fill: '#0b1120' }),
    cytoplasm,
    nucleus,
    mitoKids,
    erKids,
    golgi,
    riboKids,
    labelKids
  );

  return createElement('div', { style: { background: '#0b1120', borderRadius: '10px', overflow: 'hidden' } },
    createElement('div', { style: { overflowX: 'auto' } }, svg),
    !readonly ? createElement('div', { style: { background: '#0f172a', padding: '10px 16px', display: 'flex', gap: '12px', alignItems: 'center', flexWrap: 'wrap' } },
      createElement('label', { style: { display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', color: '#d1d5db' }},
        createElement('input', { type: 'checkbox', checked: showCytoplasm,
          onChange: function(e) { onStateChange({ showCytoplasm: e.target.checked }); },
          style: { accentColor: '#10b981' } }),
        createElement('span', { style: { color: '#10b981', fontFamily: 'monospace' }}, '\\u7ec6\\u80de\\u8d28')
      ),
      createElement('label', { style: { display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', color: '#d1d5db' }},
        createElement('input', { type: 'checkbox', checked: showNucleus,
          onChange: function(e) { onStateChange({ showNucleus: e.target.checked }); },
          style: { accentColor: '#a855f7' } }),
        createElement('span', { style: { color: '#a855f7', fontFamily: 'monospace' }}, '\\u6838')
      ),
      createElement('label', { style: { display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', color: '#d1d5db' }},
        createElement('input', { type: 'checkbox', checked: showMito,
          onChange: function(e) { onStateChange({ showMitochondria: e.target.checked }); },
          style: { accentColor: '#ef4444' } }),
        createElement('span', { style: { color: '#f87171', fontFamily: 'monospace' }}, '\\u7c97\\u7cd9')
      ),
      createElement('label', { style: { display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', color: '#d1d5db' }},
        createElement('input', { type: 'checkbox', checked: showER,
          onChange: function(e) { onStateChange({ showER: e.target.checked }); },
          style: { accentColor: '#3b82f6' } }),
        createElement('span', { style: { color: '#60a5fa', fontFamily: 'monospace' }}, '\\u5185\\u8d28\\u7b52')
      ),
      createElement('label', { style: { display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', color: '#d1d5db' }},
        createElement('input', { type: 'checkbox', checked: showGolgi,
          onChange: function(e) { onStateChange({ showGolgi: e.target.checked }); },
          style: { accentColor: '#f97316' } }),
        createElement('span', { style: { color: '#f97316', fontFamily: 'monospace' }}, '\\u9ad8\\u5c14\\u57fa\\u7b52')
      ),
      createElement('label', { style: { display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', color: '#d1d5db' }},
        createElement('input', { type: 'checkbox', checked: showRibosome,
          onChange: function(e) { onStateChange({ showRibosome: e.target.checked }); },
          style: { accentColor: '#fbbf24' } }),
        createElement('span', { style: { color: '#fbbf24', fontFamily: 'monospace' }}, '\\u6839\\u7b52')
      )
    ) : null
  );
}`
}}
'''

ALL_EXAMPLES = [
    ("physics — Ohm's Law Series", EXAMPLE_OHM_SERIES),
    ("physics — Snell's Law", EXAMPLE_SNELL),
    ("physics — Simple Pendulum", EXAMPLE_PENDULUM),
    ("chemistry — Acid-Base Titration", EXAMPLE_TITRATION),
    ("biology — Animal Cell", EXAMPLE_CELL),
]
