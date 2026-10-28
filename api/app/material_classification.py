"""Authoritative material classification and unit policy for StkFlo.

The ordinary material matrix is deliberately aligned with the active
expiry-threshold rules.  The only category NA record is the system-owned
zero-stock Cancelled BMR marker; Packaging uses type NA automatically.
"""

ALLOWED_CATEGORY_TYPES: dict[str, frozenset[str]] = {
    "SOLID_RAW_MAT": frozenset({"API", "EXCIPIENT"}),
    "LIQUID_RAW_MAT": frozenset({"API", "LICENSED FP", "EXCIPIENT"}),
    "TABLETS_CAPSULES": frozenset({"LICENSED FP"}),
    "CREAMS_OINTMENTS": frozenset({"LICENSED FP", "EXCIPIENT"}),
    "AMPOULES": frozenset({"API", "LICENSED FP", "EXCIPIENT"}),
    "PACKAGING": frozenset({"NA"}),
}

STOCK_UOMS = frozenset({"G", "MG", "ML", "L", "TAB", "CAP", "AMP", "UNIT"})


def validate_material_classification(category: str, kind: str, uom: str, *, system_marker: bool = False) -> None:
    """Raise ValueError on invalid classifications; call on both API create/edit paths."""
    category, kind, uom = category.strip(), kind.strip(), uom.strip()
    if system_marker:
        if (category, kind, uom) == ("NA", "NA", "NA"):
            return
        raise ValueError("Cancelled BMR must retain NA category, type and UOM")
    if kind not in ALLOWED_CATEGORY_TYPES.get(category, frozenset()):
        raise ValueError(f"Material category/type combination is not permitted: {category} / {kind}")
    if uom not in STOCK_UOMS:
        raise ValueError(f"Material UOM is not permitted: {uom}")


def validate_base_uom(requested: str | None, base: str) -> None:
    if (requested or "").strip() != base:
        raise ValueError(f"UOM does not match the material base UOM ({base})")
