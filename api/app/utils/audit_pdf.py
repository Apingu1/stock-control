# api/app/utils/audit_pdf.py
from __future__ import annotations

from datetime import datetime
import io
import json
from typing import Any, List, Mapping, Optional

from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import mm
from reportlab.pdfgen import canvas as pdfcanvas
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle


class NumberedCanvas(pdfcanvas.Canvas):
    """
    Correct "Page X of Y" canvas.

    Key: we DO NOT finalize pages during the first pass.
    We store page states in showPage(), and only emit pages once in save().
    This prevents the "document duplicated" bug you're seeing.
    """

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self._saved_page_states = []

    def showPage(self):
        # Save state for later, then start a new page WITHOUT writing to output yet
        self._saved_page_states.append(dict(self.__dict__))
        self._startPage()

    def save(self):
        page_count = len(self._saved_page_states)
        for state in self._saved_page_states:
            self.__dict__.update(state)
            self._draw_page_number(page_count)
            super().showPage()
        super().save()

    def _draw_page_number(self, page_count: int):
        page_num = self.getPageNumber()
        text = f"Page {page_num} of {page_count}"

        w, _h = self._pagesize
        x = w - 10 * mm
        y = 7 * mm

        self.setFont("Helvetica", 8)
        self.setFillColor(colors.grey)
        self.drawRightString(x, y, text)
        self.setFillColor(colors.black)


def _try_parse_json(v):
    if v is None:
        return None
    if isinstance(v, (dict, list)):
        return v
    if isinstance(v, str):
        s = v.strip()
        if not s:
            return None
        try:
            return json.loads(s)
        except Exception:
            return v
    return v


def diff_summary(before, after, max_parts: int = 2) -> str:
    b = _try_parse_json(before)
    a = _try_parse_json(after)

    diffs = []

    def is_obj(x):
        return isinstance(x, dict)

    def walk(x, y, path: str):
        if len(diffs) >= 50:
            return
        if x == y:
            return
        if x is None and y is not None:
            diffs.append((path or "root", "add", None, y))
            return
        if y is None and x is not None:
            diffs.append((path or "root", "remove", x, None))
            return
        if isinstance(x, list) and isinstance(y, list):
            m = max(len(x), len(y))
            for i in range(m):
                p = f"{path}[{i}]" if path else f"[{i}]"
                if i >= len(x):
                    diffs.append((p, "add", None, y[i]))
                    if len(diffs) >= 50:
                        return
                    continue
                if i >= len(y):
                    diffs.append((p, "remove", x[i], None))
                    if len(diffs) >= 50:
                        return
                    continue
                walk(x[i], y[i], p)
                if len(diffs) >= 50:
                    return
            return
        if is_obj(x) and is_obj(y):
            keys = sorted(set(x.keys()) | set(y.keys()))
            for k in keys:
                p = f"{path}.{k}" if path else k
                if k not in x:
                    diffs.append((p, "add", None, y.get(k)))
                    if len(diffs) >= 50:
                        return
                    continue
                if k not in y:
                    diffs.append((p, "remove", x.get(k), None))
                    if len(diffs) >= 50:
                        return
                    continue
                walk(x.get(k), y.get(k), p)
                if len(diffs) >= 50:
                    return
            return
        diffs.append((path or "root", "change", x, y))

    walk(b, a, "")

    if not diffs:
        return "—"

    def fmt(v):
        if v is None:
            return "null"
        if isinstance(v, (dict, list)):
            s = json.dumps(v, ensure_ascii=False, separators=(",", ":"), default=str)
        else:
            s = str(v)
        if len(s) > 60:
            s = s[:57] + "…"
        return s

    parts = []
    for (p, kind, bv, av) in diffs[:max_parts]:
        if kind == "add":
            parts.append(f"{p}: +{fmt(av)}")
        elif kind == "remove":
            parts.append(f"{p}: removed {fmt(bv)}")
        else:
            parts.append(f"{p}: {fmt(bv)} → {fmt(av)}")

    if len(diffs) > max_parts:
        parts.append(f"+{len(diffs) - max_parts} more")

    return "; ".join(parts)


def build_audit_pdf(
    *,
    system_name: str,
    exported_by: str,
    exported_by_role: str,
    exported_at_utc: str,
    filters_lines: List[str],
    rows: List[Mapping[str, Any]],
    include_json: bool,
) -> bytes:
    buf = io.BytesIO()

    left = right = top = 10 * mm
    bottom = 12 * mm  # room for footer
    doc = SimpleDocTemplate(
        buf,
        pagesize=A4,
        leftMargin=left,
        rightMargin=right,
        topMargin=top,
        bottomMargin=bottom,
        title="Audit Trail Export",
    )

    styles = getSampleStyleSheet()

    cell_style = ParagraphStyle(
        name="Cell",
        parent=styles["Normal"],
        fontName="Helvetica",
        fontSize=7.5,
        leading=9,
        spaceAfter=0,
        spaceBefore=0,
    )
    header_style = ParagraphStyle(
        name="HeaderCell",
        parent=styles["Normal"],
        fontName="Helvetica-Bold",
        fontSize=8,
        leading=10,
        spaceAfter=0,
        spaceBefore=0,
    )

    story = []
    story.append(Paragraph(f"{system_name} — Audit Trail Export", styles["Title"]))
    story.append(Spacer(1, 6))

    meta_lines = [
        f"Exported by: {exported_by} ({exported_by_role})",
        f"Exported at (UTC): {exported_at_utc}",
        *filters_lines,
        f"Rows: {len(rows)}",
    ]
    for line in meta_lines:
        story.append(Paragraph(line, styles["Normal"]))
    story.append(Spacer(1, 10))

    page_width, _page_height = A4
    usable_w = page_width - left - right

    # Column widths sum == usable_w (includes row #)
    colw = [
        usable_w * 0.05,  # #
        usable_w * 0.14,  # Date/Time
        usable_w * 0.12,  # Event
        usable_w * 0.13,  # Actor
        usable_w * 0.20,  # Target
        usable_w * 0.16,  # Reason
        usable_w * 0.20,  # Changes
    ]

    def P(txt: Optional[str], style: ParagraphStyle):
        t = (txt or "").replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")
        if not t:
            t = "—"
        return Paragraph(t, style)

    data = [
        [
            P("#", header_style),
            P("Date/Time", header_style),
            P("Event", header_style),
            P("Actor", header_style),
            P("Target", header_style),
            P("Reason", header_style),
            P("Changes", header_style),
        ]
    ]

    for i, r in enumerate(rows, start=1):
        dt = r.get("event_at")
        if isinstance(dt, datetime):
            dt_str = dt.strftime("%d/%m/%Y %H:%M:%S")
        else:
            dt_str = str(dt) if dt is not None else "—"

        actor = r.get("actor_username") or "—"
        role = r.get("actor_role") or ""
        actor_disp = f"{actor} ({role})" if role else actor

        target = r.get("target_ref") or r.get("target_type") or "—"
        reason = r.get("reason") or ""
        changes = diff_summary(r.get("before_json"), r.get("after_json"), max_parts=2)

        data.append(
            [
                P(str(i), cell_style),
                P(dt_str, cell_style),
                P(str(r.get("event_type") or "—"), cell_style),
                P(actor_disp, cell_style),
                P(str(target), cell_style),
                P(str(reason), cell_style),
                P(str(changes), cell_style),
            ]
        )

    table = Table(data, colWidths=colw, repeatRows=1)
    table.setStyle(
        TableStyle(
            [
                ("BACKGROUND", (0, 0), (-1, 0), colors.lightgrey),
                ("GRID", (0, 0), (-1, -1), 0.25, colors.grey),
                ("VALIGN", (0, 0), (-1, -1), "TOP"),
                ("LEFTPADDING", (0, 0), (-1, -1), 3),
                ("RIGHTPADDING", (0, 0), (-1, -1), 3),
                ("TOPPADDING", (0, 0), (-1, -1), 2),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 2),
                ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.whitesmoke, colors.white]),
                ("ALIGN", (0, 1), (0, -1), "RIGHT"),
            ]
        )
    )
    story.append(table)

    if include_json:
        story.append(Spacer(1, 12))
        story.append(Paragraph("Appendix — Before/After JSON Snapshots", styles["Heading2"]))
        story.append(Spacer(1, 6))

        mono = ParagraphStyle(
            name="MonoSmall",
            parent=styles["Normal"],
            fontName="Courier",
            fontSize=6.7,
            leading=8,
        )

        def json_text(v):
            if v is None:
                return ""
            if isinstance(v, (dict, list)):
                return json.dumps(v, ensure_ascii=False, indent=2, default=str)
            return str(v)

        for i, r in enumerate(rows, start=1):
            dt = r.get("event_at")
            if isinstance(dt, datetime):
                dt_str = dt.strftime("%d/%m/%Y %H:%M:%S")
            else:
                dt_str = str(dt) if dt is not None else "—"

            heading = f"#{i} — {dt_str} — {r.get('event_type') or ''} — {r.get('target_ref') or ''}"
            story.append(Paragraph(heading, styles["Heading4"]))
            story.append(Paragraph(f"<b>Reason:</b> {r.get('reason') or '—'}", styles["Normal"]))
            story.append(Spacer(1, 4))

            before_s = json_text(r.get("before_json")).replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")
            after_s = json_text(r.get("after_json")).replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")

            story.append(Paragraph("<b>Before:</b>", styles["Normal"]))
            story.append(Paragraph(before_s, mono))
            story.append(Spacer(1, 4))
            story.append(Paragraph("<b>After:</b>", styles["Normal"]))
            story.append(Paragraph(after_s, mono))
            story.append(Spacer(1, 10))

    # ✅ page numbers on ALL pages, and NO duplication
    doc.build(story, canvasmaker=NumberedCanvas)
    return buf.getvalue()
