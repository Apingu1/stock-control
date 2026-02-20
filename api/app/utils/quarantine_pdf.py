from __future__ import annotations

import io
from datetime import datetime
from typing import Any, List

from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import mm
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle

from ..schemas import QuarantineLogRow
from .audit_pdf import NumberedCanvas  # reuse your existing audit footer/page numbering


def build_quarantine_log_pdf(
    *,
    system_name: str,
    exported_by: str,
    exported_by_role: str,
    exported_at_utc: str,
    filters_lines: List[str],
    rows: List[QuarantineLogRow],
) -> bytes:
    buf = io.BytesIO()

    left = right = top = 10 * mm
    bottom = 12 * mm  # leave space for footer / page numbering
    doc = SimpleDocTemplate(
        buf,
        pagesize=A4,
        leftMargin=left,
        rightMargin=right,
        topMargin=top,
        bottomMargin=bottom,
        title="Quarantine Log Export",
    )

    styles = getSampleStyleSheet()
    title_style = styles["Title"]
    normal = styles["Normal"]

    cell_style = ParagraphStyle(
        name="Cell",
        parent=styles["Normal"],
        fontName="Helvetica",
        fontSize=7.5,
        leading=9,
    )
    header_style = ParagraphStyle(
        name="HeaderCell",
        parent=styles["Normal"],
        fontName="Helvetica-Bold",
        fontSize=8,
        leading=10,
    )

    def esc(s: Any) -> str:
        if s is None:
            return ""
        s = str(s)
        return s.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")

    def P(txt: Any, style: ParagraphStyle):
        t = esc(txt)
        if not t.strip():
            t = "—"
        return Paragraph(t, style)

    story: List[Any] = []
    story.append(Paragraph(f"{system_name} — Quarantine Log Export", title_style))
    story.append(Spacer(1, 6))

    meta_lines = [
        f"Exported by: {exported_by} ({exported_by_role})",
        f"Exported at (UTC): {exported_at_utc}",
        *filters_lines,
        f"Rows: {len(rows)}",
    ]
    for line in meta_lines:
        story.append(Paragraph(esc(line), normal))
    story.append(Spacer(1, 10))

    page_w, _ = A4
    usable_w = page_w - left - right

    # widths tuned for readable “inspection pack” style
    colw = [
        usable_w * 0.04,  # #
        usable_w * 0.13,  # Date/Time
        usable_w * 0.11,  # Type
        usable_w * 0.11,  # Material
        usable_w * 0.16,  # Material name (+ reason)
        usable_w * 0.10,  # Lot
        usable_w * 0.10,  # Qty
        usable_w * 0.17,  # From → To
        usable_w * 0.08,  # Who
    ]

    data = [
        [
            P("#", header_style),
            P("Date/Time", header_style),
            P("Type", header_style),
            P("Material", header_style),
            P("Material / Reason", header_style),
            P("Lot", header_style),
            P("Qty", header_style),
            P("From → To", header_style),
            P("Who", header_style),
        ]
    ]

    for i, r in enumerate(rows, start=1):
        dt = r.event_at
        dt_str = dt.strftime("%d/%m/%Y %H:%M:%S") if isinstance(dt, datetime) else str(dt or "—")

        # Put reason as a second line under the material name (GMP-friendly “inspection pack” format)
        material_name = r.material_name or "—"
        reason = r.reason or ""
        if reason:
            mat_cell = f"{esc(material_name)}<br/><font size='7'>Reason: {esc(reason)}</font>"
        else:
            mat_cell = esc(material_name)

        qty_str = "—"
        if r.qty is not None:
            qty_str = f"{r.qty} {r.uom_code or ''}".strip()

        # Display From → To consistently
        from_status = r.from_status or "—"
        to_status = r.to_status or ("DESTROYED" if r.event_type == "DESTRUCTION" else "—")
        from_to = f"{from_status} → {to_status}"

        data.append(
            [
                P(i, cell_style),
                P(dt_str, cell_style),
                P(r.event_type, cell_style),
                P(r.material_code, cell_style),
                Paragraph(mat_cell or "—", cell_style),
                P(r.lot_number, cell_style),
                P(qty_str, cell_style),
                P(from_to, cell_style),
                P(r.created_by or "—", cell_style),
            ]
        )

    tbl = Table(data, colWidths=colw, repeatRows=1)
    tbl.setStyle(
        TableStyle(
            [
                ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#0B1220")),
                ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
                ("GRID", (0, 0), (-1, -1), 0.25, colors.HexColor("#2A3346")),
                ("VALIGN", (0, 0), (-1, -1), "TOP"),
                ("LEFTPADDING", (0, 0), (-1, -1), 4),
                ("RIGHTPADDING", (0, 0), (-1, -1), 4),
                ("TOPPADDING", (0, 0), (-1, -1), 3),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 3),
                ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, colors.HexColor("#F5F7FB")]),
            ]
        )
    )

    story.append(tbl)
    story.append(Spacer(1, 10))
    story.append(
        Paragraph(
            "Notes: Status-change entries reflect QUARANTINE ↔ AVAILABLE movements (including partial splits/merges). "
            "Destruction entries include all destruction consumptions.",
            normal,
        )
    )

    doc.build(story, canvasmaker=NumberedCanvas)
    return buf.getvalue()
