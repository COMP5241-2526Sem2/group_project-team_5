import json
import re

import requests


def main() -> None:
    base = "http://127.0.0.1:8000"
    key = "physics.circuit_ohm_series_001"
    d = requests.get(f"{base}/api/v1/labs/{key}", timeout=10).json()
    rc = d.get("render_code") or ""

    print("registry_key:", d.get("registry_key"))
    print("title:", d.get("title"))
    print("render_code_len:", len(rc))

    pats = [
        r"rv\('voltage'",
        r"rv\('r1'",
        r"rv\('r2'",
        r"switchClosed",
        r"createElement\('input'",
        r"onStateChange",
        r"strokeDashoffset",
        r"opacity",
        r"transform",
    ]
    for p in pats:
        print(p, "->", bool(re.search(p, rc)))

    def window(marker: str, before: int = 220, after: int = 280) -> None:
        i = rc.find(marker)
        print("\n--- window:", marker, "idx=", i, "---")
        if i < 0:
            return
        print(rc[max(0, i - before) : i + after])

    window("rv('voltage'")
    window("rv('r1'")
    window("rv('r2'")
    window("switchClosed")
    window("createElement('input'", before=140, after=620)

    # Extract any apparent defaults
    defaults = re.findall(r"rv\('([a-zA-Z0-9_]+)'\s*,\s*([0-9.]+)\)", rc)
    print("\nrv defaults (first 30):")
    print(json.dumps(defaults[:30], ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()

