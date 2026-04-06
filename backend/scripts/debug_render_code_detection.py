import requests

from app.services.lab_prompts.render_code_agent import RenderCodeAgent


def main() -> None:
    base = "http://127.0.0.1:8000"
    key = "physics.circuit_ohm_series_001"
    d = requests.get(f"{base}/api/v1/labs/{key}", timeout=10).json()
    rc = d.get("render_code") or ""
    init = d.get("initial_state") or {}
    vh = d.get("visual_hint") or {}

    agent = RenderCodeAgent()
    issues = agent.detect_issues(rc, init, vh)
    print("issues:", [i.code for i in issues])

    # Mirror internal booleans (keep in sync with detect_issues)
    import re

    elem_fn = None
    if re.search(r"(?<!\.)\bcreateElement\s*\(\s*['\"]", rc):
        elem_fn = "createElement"
    else:
        m1 = re.search(r"\bcreateElement\s*:\s*([A-Za-z_]\w*)\b", rc)
        m2 = re.search(r"\bconst\s+([A-Za-z_]\w*)\s*=\s*createElement\b", rc)
        alias = (m1.group(1) if m1 else None) or (m2.group(1) if m2 else None)
        if alias and re.search(rf"(?<!\.)\b{re.escape(alias)}\s*\(\s*['\"]", rc):
            elem_fn = alias

    print("elem_fn:", elem_fn)

    # t aliases
    t_aliases = set()
    for m in re.finditer(
        r"\b(?:const|let|var)\s+([A-Za-z_]\w*)\s*=\s*[^;\n]*\bt\b[^;\n]*[;\n]",
        rc,
    ):
        t_aliases.add(m.group(1))
    t_symbol = r"(?:t|props\.t"
    if t_aliases:
        t_symbol += r"|" + r"|".join(re.escape(a) for a in sorted(t_aliases))
    t_symbol += r")"
    print("t_aliases:", sorted(t_aliases)[:20])

    has_any_t = re.search(r"\bt\b", rc) is not None or "props.t" in rc
    print("has_any_t:", has_any_t)

    pats = [
        rf"strokeDashoffset\s*:\s*[^,\n]*\b{t_symbol}\b",
        rf"opacity\s*:\s*[^,\n]*\b{t_symbol}\b",
        rf"transform\s*:\s*[^,\n]*\b{t_symbol}\b",
        rf"['\"]stroke-dashoffset['\"]\s*:\s*[^,\n]*\b{t_symbol}\b",
        rf"Math\.(?:sin|cos)\s*\(\s*[^)]*\b{t_symbol}\b",
    ]
    for p in pats:
        print("anim_pat", p, "->", bool(re.search(p, rc)))

    has_show_current_key = any(
        k.lower() in ("showcurrent", "show_current", "showcurrentflow") for k in init.keys()
    )
    print("has_show_current_key:", has_show_current_key)
    print("has strokeDashoffset substring:", ("strokeDashoffset" in rc), ("stroke-dashoffset" in rc))

    # interaction booleans
    fn_pat = re.escape(elem_fn) if elem_fn else r"createElement"
    tag_aliases = {}
    for m in re.finditer(
        r"\b(?:const|let|var)\s+([A-Za-z_]\w*)\s*=\s*['\"](input|button)['\"]\s*[;\n]",
        rc,
        flags=re.IGNORECASE,
    ):
        tag_aliases[m.group(1)] = m.group(2).lower()
    input_vars = [re.escape(v) for v, tname in tag_aliases.items() if tname == "input"]
    button_vars = [re.escape(v) for v, tname in tag_aliases.items() if tname == "button"]
    input_arg = r"(?:['\"]input['\"]" + (r"|" + r"|".join(input_vars) if input_vars else "") + r")"
    button_arg = r"(?:['\"]button['\"]" + (r"|" + r"|".join(button_vars) if button_vars else "") + r")"

    has_control_element = (
        re.search(rf"{fn_pat}\s*\(\s*{input_arg}\b", rc) is not None
        or re.search(rf"{fn_pat}\s*\(\s*{button_arg}\b", rc) is not None
    )
    has_input_type = re.search(r"\btype\s*:\s*['\"](?:range|checkbox)['\"]", rc) is not None
    has_event_handler = re.search(r"\bon(Change|Input|Click)\s*:", rc) is not None
    has_on_state_change_ref = "onStateChange" in rc
    has_on_state_change_call = re.search(r"\bonStateChange\s*\(\s*\{", rc) is not None

    print("has_control_element:", has_control_element)
    print("has_input_type:", has_input_type)
    print("has_event_handler:", has_event_handler)
    print("has_on_state_change_ref:", has_on_state_change_ref)
    print("has_on_state_change_call:", has_on_state_change_call)


if __name__ == "__main__":
    main()

