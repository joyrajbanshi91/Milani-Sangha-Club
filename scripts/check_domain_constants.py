#!/usr/bin/env python3
"""Fail if the shared domain constants have drifted between frontend and backend.

The two apps duplicate a block of role, membership, payment, ticket and
collection constants because they are separate npm packages. This check keeps the
duplication honest: the region between the `#region shared-domain` and
`#endregion shared-domain` markers must be identical in both files.

Usage:  python3 scripts/check_domain_constants.py
Exit:   0 if identical, 1 otherwise (prints a unified diff).
"""

from __future__ import annotations

import difflib
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
FILES = [
    ROOT / "frontend" / "src" / "config" / "constants.ts",
    ROOT / "backend" / "src" / "config" / "constants.ts",
]
START = "// #region shared-domain"
END = "// #endregion shared-domain"


def extract_region(path: Path) -> list[str]:
    if not path.exists():
        sys.exit(f"error: {path} does not exist")

    lines = path.read_text(encoding="utf-8").splitlines()
    try:
        start = next(i for i, line in enumerate(lines) if line.strip() == START)
        end = next(i for i, line in enumerate(lines) if line.strip() == END)
    except StopIteration:
        sys.exit(f"error: {path} is missing the shared-domain region markers")

    if end <= start:
        sys.exit(f"error: {path} has the region markers in the wrong order")

    return [line.rstrip() for line in lines[start + 1 : end]]


def main() -> int:
    first, second = (extract_region(path) for path in FILES)

    if first == second:
        print(f"ok: shared domain constants match ({len(first)} lines)")
        return 0

    diff = difflib.unified_diff(
        first,
        second,
        fromfile=str(FILES[0].relative_to(ROOT)),
        tofile=str(FILES[1].relative_to(ROOT)),
        lineterm="",
    )
    print("error: shared domain constants have drifted:\n")
    print("\n".join(diff))
    return 1


if __name__ == "__main__":
    sys.exit(main())
