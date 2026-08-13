#!/usr/bin/env python3
"""Render the Warforge inventory-to-detachment decision report collection."""

from __future__ import annotations

import argparse
import html
import json
import math
import re
from pathlib import Path
from typing import Any, Iterable

from pypdf import PdfReader
from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER, TA_LEFT
from reportlab.lib.pagesizes import A4, landscape
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.platypus import (
    BaseDocTemplate, Flowable, Frame, Image, KeepTogether, LongTable, PageBreak,
    PageTemplate, Paragraph, Spacer, Table, TableStyle
)

NAVY = colors.HexColor('#102A36')
INK = colors.HexColor('#1D2D35')
MUTED = colors.HexColor('#61737B')
GOLD = colors.HexColor('#C89B2C')
TEAL = colors.HexColor('#247D98')
GREEN = colors.HexColor('#3E8060')
ORANGE = colors.HexColor('#D47A2C')
RED = colors.HexColor('#A64B45')
PAPER = colors.HexColor('#F7F4EC')
GRID = colors.HexColor('#D3DDE0')
WHITE = colors.white


def register_fonts() -> tuple[str, str]:
    candidates = [
        (Path('C:/Windows/Fonts/arial.ttf'), Path('C:/Windows/Fonts/arialbd.ttf')),
        (Path('/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf'), Path('/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf')),
    ]
    for regular, bold in candidates:
        if regular.exists() and bold.exists():
            pdfmetrics.registerFont(TTFont('WarforgeSans', str(regular)))
            pdfmetrics.registerFont(TTFont('WarforgeSansBold', str(bold)))
            return 'WarforgeSans', 'WarforgeSansBold'
    return 'Helvetica', 'Helvetica-Bold'


FONT, FONT_BOLD = register_fonts()


def clean(value: Any) -> str:
    text = str('' if value is None else value)
    text = re.sub(r'<[^>]+>', '', text)
    return text.replace('\u2011', '-').replace('\u2013', '-').replace('\u2014', '-').replace('\t', ' ').strip()


def esc(value: Any) -> str:
    return html.escape(clean(value))


def fr(value: float | int | None, digits: int = 1) -> str:
    if value is None or not math.isfinite(float(value)):
        return '-'
    return f'{float(value):.{digits}f}'.replace('.', ',')


def pct(value: float | None, digits: int = 0) -> str:
    return '-' if value is None else f'{fr(value, digits)} %'


BASE = getSampleStyleSheet()
STYLES = {
    'Title': ParagraphStyle('Title', parent=BASE['Title'], fontName=FONT_BOLD, fontSize=24, leading=28, textColor=NAVY, alignment=TA_LEFT, spaceAfter=8),
    'Subtitle': ParagraphStyle('Subtitle', parent=BASE['Normal'], fontName=FONT, fontSize=10.5, leading=14, textColor=MUTED, spaceAfter=10),
    'Heading1': ParagraphStyle('Heading1', parent=BASE['Heading1'], fontName=FONT_BOLD, fontSize=16, leading=20, textColor=NAVY, spaceBefore=8, spaceAfter=7),
    'Heading2': ParagraphStyle('Heading2', parent=BASE['Heading2'], fontName=FONT_BOLD, fontSize=11.5, leading=14, textColor=TEAL, spaceBefore=7, spaceAfter=5),
    'Heading3': ParagraphStyle('Heading3', parent=BASE['Heading3'], fontName=FONT_BOLD, fontSize=9.5, leading=12, textColor=INK, spaceBefore=5, spaceAfter=4),
    'Body': ParagraphStyle('Body', parent=BASE['BodyText'], fontName=FONT, fontSize=8.2, leading=11.2, textColor=INK, spaceAfter=5),
    'Small': ParagraphStyle('Small', parent=BASE['BodyText'], fontName=FONT, fontSize=6.8, leading=8.6, textColor=MUTED),
    'Table': ParagraphStyle('Table', parent=BASE['BodyText'], fontName=FONT, fontSize=6.3, leading=7.6, textColor=INK),
    'TableSmall': ParagraphStyle('TableSmall', parent=BASE['BodyText'], fontName=FONT, fontSize=5.3, leading=6.4, textColor=INK),
    'TableHead': ParagraphStyle('TableHead', parent=BASE['BodyText'], fontName=FONT_BOLD, fontSize=6.2, leading=7.4, textColor=WHITE),
    'Callout': ParagraphStyle('Callout', parent=BASE['BodyText'], fontName=FONT, fontSize=8.3, leading=11.5, textColor=NAVY, backColor=colors.HexColor('#E8F0F2'), borderColor=TEAL, borderWidth=.6, borderPadding=7, spaceAfter=8),
    'Warning': ParagraphStyle('Warning', parent=BASE['BodyText'], fontName=FONT, fontSize=7.8, leading=10.5, textColor=INK, backColor=colors.HexColor('#FFF1DE'), borderColor=ORANGE, borderWidth=.6, borderPadding=6, spaceAfter=7),
    'ChartTitle': ParagraphStyle('ChartTitle', parent=BASE['BodyText'], fontName=FONT_BOLD, fontSize=8.5, leading=10.5, textColor=NAVY, alignment=TA_CENTER, spaceAfter=2),
    'CoverMeta': ParagraphStyle('CoverMeta', parent=BASE['BodyText'], fontName=FONT_BOLD, fontSize=8, leading=11, textColor=TEAL),
}


def p(value: Any, style: str = 'Body') -> Paragraph:
    return Paragraph(esc(value), STYLES[style])


def rich(value: str, style: str = 'Body') -> Paragraph:
    return Paragraph(value, STYLES[style])


class ReportDoc(BaseDocTemplate):
    def __init__(self, filename: str, title: str, snapshot: str, pagesize=A4):
        width, height = pagesize
        super().__init__(filename, pagesize=pagesize, leftMargin=14 * mm, rightMargin=14 * mm,
                         topMargin=16 * mm, bottomMargin=14 * mm, title=title, author='Warforge')
        self.report_title = title
        self.snapshot = snapshot
        self.page_width = width
        self.page_height = height
        frame = Frame(self.leftMargin, self.bottomMargin, self.width, self.height, id='normal')
        self.addPageTemplates(PageTemplate(id='report', frames=[frame], onPage=self._decorate))

    def _decorate(self, canvas, _doc):
        canvas.saveState()
        canvas.setFillColor(NAVY)
        canvas.rect(0, self.page_height - 8 * mm, self.page_width, 8 * mm, fill=1, stroke=0)
        canvas.setFillColor(WHITE)
        canvas.setFont(FONT_BOLD, 6.8)
        canvas.drawString(14 * mm, self.page_height - 5.2 * mm, 'WARFORGE 40K - RAPPORT DECISIONNEL V11')
        canvas.setFillColor(MUTED)
        canvas.setFont(FONT, 6.4)
        canvas.drawString(14 * mm, 6.5 * mm, clean(self.report_title)[:80])
        canvas.drawRightString(self.page_width - 14 * mm, 6.5 * mm, f'{canvas.getPageNumber()} - snapshot {self.snapshot}')
        canvas.restoreState()


CHART_AUDIT: list[dict[str, Any]] = []


def nice_max(value: float, minimum: float = 1) -> float:
    value = max(value, minimum)
    magnitude = 10 ** math.floor(math.log10(value))
    normalized_value = value / magnitude
    step = 1 if normalized_value <= 1 else 2 if normalized_value <= 2 else 5 if normalized_value <= 5 else 10
    return step * magnitude


class HorizontalBarChart(Flowable):
    def __init__(self, title: str, values: list[tuple[str, float]], x_label: str, unit: str,
                 population: str, maximum: float = 100, width: float = 175 * mm, height: float = 64 * mm):
        super().__init__()
        self.title, self.values, self.x_label, self.unit, self.population = title, values, x_label, unit, population
        self.maximum, self.width, self.height = maximum, width, height
        self.audit_id = f'chart-{len(CHART_AUDIT) + 1}'
        CHART_AUDIT.append({'id': self.audit_id, 'type': 'bar', 'title': title, 'population': population,
                            'xAxis': {'label': x_label, 'unit': unit, 'minimum': 0, 'maximum': maximum, 'ticks': [0, maximum * .2, maximum * .4, maximum * .6, maximum * .8, maximum]},
                            'yAxis': {'label': 'Options comparées', 'unit': 'catégorie', 'ticks': [label for label, _ in values]}, 'legend': False})

    def wrap(self, avail_width, _avail_height):
        self.actual_width = min(self.width, avail_width)
        return self.actual_width, self.height

    def draw(self):
        width = getattr(self, 'actual_width', self.width)
        left, bottom, right, top = 96, 27, width - 12, self.height - 30
        self.canv.setFont(FONT_BOLD, 8.3); self.canv.setFillColor(NAVY)
        self.canv.drawCentredString(width / 2, self.height - 11, clean(self.title))
        self.canv.setFont(FONT, 6.2); self.canv.setFillColor(MUTED)
        self.canv.drawCentredString(width / 2, self.height - 21, f'{clean(self.population)} - n={len(self.values)}')
        ticks = [self.maximum * index / 5 for index in range(6)]
        self.canv.setFont(FONT, 5.8)
        for tick in ticks:
            x = left + (right - left) * tick / self.maximum
            self.canv.setStrokeColor(GRID); self.canv.line(x, bottom, x, top)
            self.canv.setFillColor(MUTED); self.canv.drawCentredString(x, bottom - 9, fr(tick, 0))
        row_height = (top - bottom) / max(1, len(self.values))
        for index, (label, value) in enumerate(self.values):
            y = top - (index + .75) * row_height
            self.canv.setFillColor(MUTED); self.canv.setFont(FONT, 5.9)
            self.canv.drawRightString(left - 5, y, clean(label)[:31])
            self.canv.setFillColor(TEAL if index else GOLD)
            self.canv.rect(left, y - 1, max(0, (right - left) * min(value, self.maximum) / self.maximum), max(3, row_height * .48), fill=1, stroke=0)
            self.canv.setFillColor(INK); self.canv.drawString(min(right - 20, left + (right - left) * min(value, self.maximum) / self.maximum + 3), y, fr(value, 1))
        self.canv.setFont(FONT, 6.2); self.canv.setFillColor(MUTED)
        self.canv.drawCentredString((left + right) / 2, 3, f'{clean(self.x_label)} ({clean(self.unit)}) - échelle 0 à {fr(self.maximum, 0)}')
        self.canv.saveState(); self.canv.translate(8, (bottom + top) / 2); self.canv.rotate(90)
        self.canv.drawCentredString(0, 0, 'Options comparées (catégories)'); self.canv.restoreState()


class HeatmapChart(Flowable):
    def __init__(self, title: str, rows: list[str], columns: list[str], values: list[list[float]],
                 population: str, width: float = 175 * mm, height: float = 78 * mm):
        super().__init__(); self.title, self.rows, self.columns, self.values, self.population = title, rows, columns, values, population
        self.width, self.height = width, height
        self.audit_id = f'chart-{len(CHART_AUDIT) + 1}'
        CHART_AUDIT.append({'id': self.audit_id, 'type': 'heatmap', 'title': title, 'population': population,
                            'xAxis': {'label': 'Dimensions', 'unit': 'catégorie', 'ticks': columns},
                            'yAxis': {'label': 'Options', 'unit': 'catégorie', 'ticks': rows},
                            'colorScale': {'label': 'Score', 'unit': 'points sur 100', 'minimum': 0, 'maximum': 100, 'ticks': [0, 20, 40, 60, 80, 100]}, 'legend': True})

    def wrap(self, avail_width, _avail_height): self.actual_width = min(self.width, avail_width); return self.actual_width, self.height

    def draw(self):
        width = getattr(self, 'actual_width', self.width)
        left, bottom, right, top = (115 if width > 600 else 86), 58, width - 47, self.height - 31
        self.canv.setFont(FONT_BOLD, 8.3); self.canv.setFillColor(NAVY); self.canv.drawCentredString(width / 2, self.height - 10, clean(self.title))
        self.canv.setFont(FONT, 6.1); self.canv.setFillColor(MUTED); self.canv.drawCentredString(width / 2, self.height - 20, f'{clean(self.population)} - n={len(self.rows)}')
        cell_w = (right - left) / max(1, len(self.columns)); cell_h = (top - bottom) / max(1, len(self.rows))
        def fill(value: float):
            ratio = clamp01(value / 100)
            return colors.Color(0.94 - .72 * ratio, 0.95 - .38 * ratio, 0.93 - .30 * ratio)
        for row_index, row in enumerate(self.rows):
            y = top - (row_index + 1) * cell_h
            self.canv.setFont(FONT, 5.7); self.canv.setFillColor(MUTED); self.canv.drawRightString(left - 4, y + cell_h * .35, clean(row)[:38])
            for column_index, _column in enumerate(self.columns):
                value = self.values[row_index][column_index]
                x = left + column_index * cell_w
                self.canv.setFillColor(fill(value)); self.canv.setStrokeColor(WHITE); self.canv.rect(x, y, cell_w, cell_h, fill=1, stroke=1)
                self.canv.setFillColor(INK); self.canv.setFont(FONT_BOLD, 5.4); self.canv.drawCentredString(x + cell_w / 2, y + cell_h * .35, fr(value, 0))
        self.canv.setFont(FONT, 5.5); self.canv.setFillColor(MUTED)
        for column_index, column in enumerate(self.columns):
            x = left + (column_index + .5) * cell_w
            self.canv.saveState(); self.canv.translate(x, bottom - 3); self.canv.rotate(42); self.canv.drawRightString(0, 0, clean(column)[:22]); self.canv.restoreState()
        legend_x, legend_y, legend_w = right + 12, bottom, 8
        for index in range(50):
            value = 100 * index / 49
            self.canv.setFillColor(fill(value)); self.canv.rect(legend_x, legend_y + (top - bottom) * index / 50, legend_w, (top - bottom) / 50 + .3, fill=1, stroke=0)
        self.canv.setFillColor(MUTED); self.canv.setFont(FONT, 5.5)
        for tick in [0, 20, 40, 60, 80, 100]:
            y = legend_y + (top - bottom) * tick / 100
            self.canv.drawString(legend_x + legend_w + 3, y - 2, fr(tick, 0))
        self.canv.drawCentredString(legend_x + legend_w / 2, top + 4, 'Score')
        self.canv.drawCentredString((left + right) / 2, 3, 'Dimensions (catégories avec libellés)')
        self.canv.saveState(); self.canv.translate(8, (bottom + top) / 2); self.canv.rotate(90); self.canv.drawCentredString(0, 0, 'Options (catégories)'); self.canv.restoreState()


def clamp01(value: float) -> float: return max(0, min(1, value))


class DistanceLineChart(Flowable):
    def __init__(self, title: str, series: list[tuple[str, list[dict[str, Any]]]], population: str,
                 width: float = 175 * mm, height: float = 72 * mm):
        super().__init__(); self.title, self.series, self.population = title, series, population; self.width, self.height = width, height
        maximum = nice_max(max([point['usefulDamage'] for _, points in series for point in points] or [1]))
        self.maximum = maximum
        self.audit_id = f'chart-{len(CHART_AUDIT) + 1}'
        CHART_AUDIT.append({'id': self.audit_id, 'type': 'line', 'title': title, 'population': population,
                            'xAxis': {'label': 'Distance', 'unit': 'pouces', 'minimum': 0, 'maximum': 36, 'ticks': [0, 9, 12, 18, 24, 36]},
                            'yAxis': {'label': 'Dégâts utiles moyens', 'unit': 'PV', 'minimum': 0, 'maximum': maximum, 'ticks': [maximum * i / 5 for i in range(6)]}, 'legend': True})

    def wrap(self, avail_width, _avail_height): self.actual_width = min(self.width, avail_width); return self.actual_width, self.height

    def draw(self):
        width = getattr(self, 'actual_width', self.width)
        left, bottom, right = 43, 29, width - 12
        legend_columns = min(4, max(1, len(self.series)))
        legend_rows = math.ceil(len(self.series) / legend_columns)
        top = self.height - 34 - legend_rows * 8
        self.canv.setFont(FONT_BOLD, 8.3); self.canv.setFillColor(NAVY); self.canv.drawCentredString(width / 2, self.height - 10, clean(self.title))
        self.canv.setFont(FONT, 6.1); self.canv.setFillColor(MUTED); self.canv.drawCentredString(width / 2, self.height - 20, f'{clean(self.population)} - n={len(self.series)}')
        for tick in [0, 9, 12, 18, 24, 36]:
            x = left + (right - left) * tick / 36
            self.canv.setStrokeColor(GRID); self.canv.line(x, bottom, x, top)
            self.canv.setFont(FONT, 5.7); self.canv.setFillColor(MUTED); self.canv.drawCentredString(x, bottom - 9, fr(tick, 0))
        for index in range(6):
            tick = self.maximum * index / 5; y = bottom + (top - bottom) * tick / self.maximum
            self.canv.setStrokeColor(GRID); self.canv.line(left, y, right, y)
            self.canv.setFont(FONT, 5.7); self.canv.setFillColor(MUTED); self.canv.drawRightString(left - 4, y - 2, fr(tick, 1))
        palette = [TEAL, GOLD, GREEN, RED, ORANGE, colors.HexColor('#7768AE'), colors.HexColor('#3B6C88'), colors.HexColor('#7A8B35')]
        legend_slot = (right - left) / legend_columns
        for series_index, (label, points) in enumerate(self.series):
            color = palette[series_index % len(palette)]; path = self.canv.beginPath()
            for point_index, point in enumerate(points):
                x = left + (right - left) * point['distance'] / 36; y = bottom + (top - bottom) * point['usefulDamage'] / self.maximum
                path.moveTo(x, y) if point_index == 0 else path.lineTo(x, y)
            self.canv.setStrokeColor(color); self.canv.setLineWidth(1.4); self.canv.drawPath(path)
            self.canv.setFillColor(color)
            for point in points:
                x = left + (right - left) * point['distance'] / 36; y = bottom + (top - bottom) * point['usefulDamage'] / self.maximum
                self.canv.circle(x, y, 1.7, fill=1, stroke=0)
            legend_column = series_index % legend_columns; legend_row = series_index // legend_columns
            legend_x = left + legend_column * legend_slot; legend_y = self.height - 31 - legend_row * 8
            self.canv.rect(legend_x, legend_y, 7, 2.5, fill=1, stroke=0); self.canv.setFillColor(INK); self.canv.setFont(FONT, 5.0); self.canv.drawString(legend_x + 9, legend_y - 1, clean(label)[:38])
        self.canv.setFont(FONT, 6.1); self.canv.setFillColor(MUTED); self.canv.drawCentredString((left + right) / 2, 3, 'Distance (pouces) - échelle 0 à 36')
        self.canv.saveState(); self.canv.translate(8, (bottom + top) / 2); self.canv.rotate(90); self.canv.drawCentredString(0, 0, f'Dégâts utiles moyens (PV) - 0 à {fr(self.maximum, 1)}'); self.canv.restoreState()


def standard_table(rows: list[list[Any]], widths: list[float] | None = None, small: bool = False, repeat: int = 1) -> LongTable:
    converted: list[list[Any]] = []
    for row_index, row in enumerate(rows):
        style = 'TableHead' if row_index == 0 else ('TableSmall' if small else 'Table')
        converted.append([cell if isinstance(cell, Flowable) else p(cell, style) for cell in row])
    result = LongTable(converted, colWidths=widths, repeatRows=repeat, hAlign='LEFT', splitByRow=True)
    result.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, 0), NAVY), ('TEXTCOLOR', (0, 0), (-1, 0), WHITE),
        ('GRID', (0, 0), (-1, -1), .25, GRID), ('VALIGN', (0, 0), (-1, -1), 'TOP'),
        ('LEFTPADDING', (0, 0), (-1, -1), 2.5), ('RIGHTPADDING', (0, 0), (-1, -1), 2.5),
        ('TOPPADDING', (0, 0), (-1, -1), 2.1), ('BOTTOMPADDING', (0, 0), (-1, -1), 2.1),
        ('ROWBACKGROUNDS', (0, 1), (-1, -1), [WHITE, PAPER])
    ]))
    return result


def cover(title: str, subtitle: str, report: dict[str, Any]) -> list[Flowable]:
    return [
        Spacer(1, 20 * mm), rich('WARFORGE 40K - V11', 'CoverMeta'), Spacer(1, 5 * mm),
        p(title, 'Title'), p(subtitle, 'Subtitle'), Spacer(1, 7 * mm),
        rich(f'<b>Format principal</b> 2 000 points - 3 DP - 4 optimisations<br/><b>Snapshot</b> {esc(report["snapshotDate"])}<br/><b>Catalogue</b> {esc(report["sources"]["catalog"]["version"])}<br/><b>Moteur</b> {esc(report["sources"]["statistics"]["engineVersion"])}<br/><b>Méthode</b> {esc(report["methodologyVersion"])}', 'Callout'),
        p('Rapport d’aide à la décision fondé sur l’inventaire réel et les proxies déclarés. Les recommandations sont des inférences préliminaires, jamais une promesse de résultat.', 'Subtitle'),
        PageBreak()
    ]


def score_rows(assessments: Iterable[dict[str, Any]], limit: int | None = None) -> list[list[Any]]:
    selected = list(assessments)[:limit]
    rows = [['Rang', 'Détachement(s)', 'DP', 'Prim.', 'Sec.', 'Inv.', 'Règles', 'Opt.', 'Flex.', 'Total', 'Couv.', 'Conf.']]
    for item in selected:
        scores = item['scores']
        rows.append([item.get('rank', '-'), ' + '.join(item['detachmentNames']), item['dpCost'], fr(scores['primary']), fr(scores['secondary']),
                     fr(scores['inventory']), fr(scores['ruleAndStratagem']), fr(scores['enhancement']), fr(scores['flexibility']),
                     fr(scores['total']), pct(item['analyticalCoverage']), item['confidence']])
    return rows


def synthesis_story(report: dict[str, Any]) -> list[Flowable]:
    story = cover('Synthèse comparative', 'Détachements, missions et exploitation de l’inventaire', report)
    story += [p('Lecture en deux minutes', 'Heading1'), rich('<b>Le score total sert à ordonner les options dans ce snapshot.</b> Lisez ensuite la couverture et la confiance : une option forte mais faiblement couverte reste une piste à tester. Les missions sont évaluées comme un portefeuille robuste, sans supposer qu’une condition de score est accomplie.', 'Callout')]
    rows = [['Faction', 'Meilleur détachement seul', 'Score', 'Meilleure combinaison', 'Score', 'Options évaluées']]
    chart_values = []
    heat_rows, heat_values = [], []
    for faction in report['factions']:
        singles = [item for item in faction['assessments'] if item['kind'] == 'single']
        combinations = [item for item in faction['assessments'] if item['kind'] == 'combination']
        single, combo = singles[0], combinations[0] if combinations else singles[0]
        rows.append([faction['factionId'], ' + '.join(single['detachmentNames']), fr(single['scores']['total']), ' + '.join(combo['detachmentNames']), fr(combo['scores']['total']), faction['evaluated']['total']])
        chart_values.append((faction['factionId'], combo['scores']['total']))
        heat_rows.append(faction['factionId'])
        heat_values.append([combo['scores'][key] for key in ['primary', 'secondary', 'inventory', 'ruleAndStratagem', 'enhancement', 'flexibility']])
    story += [standard_table(rows, [27*mm, 44*mm, 15*mm, 51*mm, 15*mm, 25*mm]), Spacer(1, 5*mm),
              HorizontalBarChart('Meilleure option par faction', chart_values, 'Score décisionnel', 'points sur 100', f'{len(report["factions"])} factions - meilleures combinaisons'), Spacer(1, 4*mm),
              HeatmapChart('Décomposition des meilleures combinaisons', heat_rows, ['Primaire', 'Secondaire', 'Inventaire', 'Règle/strat.', 'Optimisations', 'Flexibilité'], heat_values, 'Meilleure combinaison de chaque faction')]
    story += [PageBreak(), p('Inventaire et sensibilité au format', 'Heading1')]
    inventory_rows = [['Faction', 'Fiches jouables', 'IDs physiques', 'Associations réelles', 'Associations proxy', 'Détachements', 'Combinaisons']]
    sensitivity_rows = [['Faction', 'Format', 'DP', 'Options évaluées', 'Premier choix', 'Score']]
    for faction in report['factions']:
        summary = faction['inventorySummary']
        inventory_rows.append([faction['factionId'], summary['distinctDatasheets'], summary['physicalFigureIds'], summary['realAssociations'], summary['proxyAssociations'], faction['evaluated']['singles'], faction['evaluated']['combinations']])
        for sensitivity in faction['sensitivity']:
            top = sensitivity['top'][0]
            sensitivity_rows.append([faction['factionId'], sensitivity['battleSize'], sensitivity['dpBudget'], sensitivity['evaluated'], ' + '.join(top['detachmentNames']), fr(top['scores']['total'])])
    story += [standard_table(inventory_rows, [30*mm, 23*mm, 23*mm, 27*mm, 27*mm, 23*mm, 24*mm]), Spacer(1, 5*mm),
              standard_table(sensitivity_rows, [28*mm, 18*mm, 12*mm, 24*mm, 75*mm, 18*mm])]
    story += [p('Portefeuille des missions secondaires', 'Heading1')]
    family_titles = {family['familyId']: family['title'] for family in report.get('secondaryMissionFamilies', [])}
    rows, values = [], []
    family_ids = sorted({mission['familyId'] for faction in report['factions'] for mission in faction['assessments'][0]['secondaryMissionScores']})
    for faction in report['factions']:
        top = faction['assessments'][0]
        rows.append(faction['factionId'])
        values.append([sum(m['score'] for m in top['secondaryMissionScores'] if m['familyId'] == family_id) / max(1, len([m for m in top['secondaryMissionScores'] if m['familyId'] == family_id])) for family_id in family_ids])
    story += [HeatmapChart('Couverture moyenne des familles secondaires', rows, [family_titles.get(fid, fid) for fid in family_ids], values, 'Meilleure option de chaque faction'),
              p('Les besoins de capacité proviennent des 18 guides revus. Une note élevée indique une meilleure adéquation théorique de l’inventaire ; elle ne garantit pas la pioche, la cible, la fenêtre ou l’accomplissement de la carte.', 'Warning')]
    story += [p('Sources et limites', 'Heading1'), p('Les empreintes complètes figurent dans manifest.json. Le catalogue et les missions fournissent les faits ; le snapshot statistique fournit les métriques calculées ; la base stratégique fournit les axes et besoins revus. Les traductions analytiques nouvelles sont marquées préliminaires et diminuent la couverture.')]
    return story


def gallery(core: list[dict[str, Any]], public_root: Path) -> Flowable | None:
    cells: list[Any] = []
    for unit in core[:4]:
        asset = unit.get('imageAsset')
        image_path = public_root / asset if asset else None
        if image_path and image_path.exists():
            try:
                image = Image(str(image_path), width=21*mm, height=21*mm)
                cells.append(KeepTogether([image, p(unit['name'], 'Small')]))
            except Exception:
                cells.append(p(unit['name'], 'Small'))
        else:
            cells.append(p(unit['name'], 'Small'))
    if not cells: return None
    result = Table([cells], colWidths=[42*mm] * len(cells), hAlign='LEFT')
    result.setStyle(TableStyle([('VALIGN', (0,0), (-1,-1), 'TOP'), ('BOX', (0,0), (-1,-1), .3, GRID), ('INNERGRID', (0,0), (-1,-1), .3, GRID), ('BACKGROUND', (0,0), (-1,-1), PAPER), ('LEFTPADDING',(0,0),(-1,-1),4),('RIGHTPADDING',(0,0),(-1,-1),4),('TOPPADDING',(0,0),(-1,-1),4),('BOTTOMPADDING',(0,0),(-1,-1),4)]))
    return result


def faction_story(report: dict[str, Any], faction: dict[str, Any], public_root: Path) -> list[Flowable]:
    story = cover(faction['factionId'], 'Analyse exhaustive des détachements et combinaisons compatibles avec l’inventaire', report)
    summary = faction['inventorySummary']
    story += [p('Périmètre de l’inventaire', 'Heading1'), rich(f'<b>{summary["distinctDatasheets"]}</b> fiches jouables complètes, <b>{summary["physicalFigureIds"]}</b> identifiants physiques, <b>{summary["realAssociations"]}</b> associations réelles et <b>{summary["proxyAssociations"]}</b> associations proxy dans cette projection.', 'Callout'),
              p('Une même figurine peut être associée à plusieurs fiches dans l’inventaire. Les noyaux ci-dessous réservent chaque ID physique une seule fois ; une alternative remplace un choix et ne s’y ajoute pas automatiquement.', 'Warning')]
    top = faction['assessments'][:10]
    story += [HorizontalBarChart('Top 10 des options à 2 000 points', [(' + '.join(item['detachmentNames']), item['scores']['total']) for item in top], 'Score décisionnel', 'points sur 100', f'{faction["factionId"]} - détachements et combinaisons légales'),
              standard_table(score_rows(top), [10*mm, 62*mm, 9*mm, 11*mm, 11*mm, 11*mm, 12*mm, 11*mm, 11*mm, 12*mm, 12*mm, 12*mm], small=True)]
    featured = [next(item for item in faction['assessments'] if item['id'] == featured_id) for featured_id in faction['featuredIds']]
    for index, item in enumerate(featured, 1):
        story += [PageBreak(), p(f'Option approfondie {index} - {" + ".join(item["detachmentNames"])}', 'Heading1')]
        story += [rich(f'<b>Rang global :</b> {item["rank"]} - <b>Coût :</b> {item["dpCost"]} DP - <b>Score :</b> {fr(item["scores"]["total"])} / 100 - <b>Couverture :</b> {pct(item["analyticalCoverage"])} - <b>Confiance :</b> {esc(item["confidence"])}', 'Callout')]
        story += [HeatmapChart('Profil de score de l’option', ['Option approfondie'], ['Primaire', 'Secondaire', 'Inventaire', 'Règle/strat.', 'Optimisations', 'Flexibilité'], [[item['scores'][key] for key in ['primary','secondary','inventory','ruleAndStratagem','enhancement','flexibility']]], 'Une option - six dimensions')]
        core = item.get('core', [])
        image_gallery = gallery(core, public_root)
        if image_gallery: story += [image_gallery, Spacer(1, 3*mm)]
        core_rows = [['Unité', 'Affectation', 'Pts', 'Fig.', 'Réelles', 'Proxy', 'Capacités fortes', 'Armes de portée']]
        for unit in core:
            core_rows.append([unit['name'], unit['assignedDetachmentName'], unit['points'], unit['minimumModels'], unit['realCount'], unit['proxyCount'], ', '.join(unit['capabilities']), ', '.join(unit['weaponKeywords']) or '-'])
        story += [p('Noyau possédé', 'Heading2'), standard_table(core_rows, [38*mm, 38*mm, 10*mm, 10*mm, 11*mm, 11*mm, 48*mm, 36*mm], small=True)]
        if core:
            story += [Spacer(1, 4*mm), DistanceLineChart('Dégâts utiles par palier de distance contre Infanterie', [(unit['name'], unit['distanceCurve']) for unit in core], 'Unités du noyau - moteur exact Warforge', width=260*mm)]
        alternatives = item.get('alternatives', [])
        story += [p('Alternatives possédées', 'Heading2'), standard_table([['Unité', 'Points', 'Motif']] + [[entry['name'], entry['points'], entry['reason']] for entry in alternatives], [48*mm, 16*mm, 155*mm])]
        primary = sorted(item['primaryMissionScores'], key=lambda entry: entry['score'], reverse=True)
        secondary = sorted(item['secondaryMissionScores'], key=lambda entry: entry['score'], reverse=True)
        story += [p('Missions principales ouvertes', 'Heading2'), standard_table([['Mission', 'Score', 'Lecture']] + [[entry['title'], fr(entry['score']), 'Favorable' if entry['score'] >= 67 else 'Neutre' if entry['score'] >= 45 else 'Difficile'] for entry in primary], [150*mm, 20*mm, 38*mm]),
                  p('Secondaires tactiques', 'Heading2')]
        for chunk_index in range(0, len(secondary), 9):
            chunk = secondary[chunk_index:chunk_index + 9]
            story += [HeatmapChart(f'Couverture des missions secondaires - volet {chunk_index // 9 + 1}/2', ['Option'], [entry['title'] for entry in chunk], [[entry['score'] for entry in chunk]], 'Dix capacités contrôlées - mode Tactique', width=260*mm, height=57*mm)]
    story += [PageBreak(), p('Fiches des détachements', 'Heading1')]
    for detail in faction['detachments']:
        strat_rows = [['Stratagème', 'PC', 'Phase', 'Cible / condition', 'Traduction analytique']]
        for stratagem in detail['stratagems']:
            strat_rows.append([stratagem['name'], stratagem['cpCost'], stratagem['phase'], stratagem['target'], ', '.join(stratagem['capabilities']) or 'Non supporté'])
        enh_rows = [['Optimisation', 'Pts', 'Prérequis', 'Porteurs possédés éligibles']]
        for enhancement in detail['enhancements']:
            enh_rows.append([enhancement['name'], enhancement['cost'], ', '.join(enhancement['requiredKeywords']) or 'Aucun champ structuré', ', '.join(enhancement['eligibleCarriers'][:6]) or 'Aucun'])
        unit_rows = [['Unité possédée', 'Pts', 'Réel', 'Proxy', 'Mots-clés d’armes']] + [[unit['name'], unit['points'], unit['real'], unit['proxy'], ', '.join(unit['weaponKeywords']) or '-'] for unit in detail['topOwnedUnits']]
        block: list[Flowable] = [p(f'{detail["name"]} - {detail["cost"]} DP', 'Heading2'),
            rich(f'<b>Source :</b> {esc(detail["sourceKey"])} - <b>Disposition(s) :</b> {esc(", ".join(detail["forceDispositions"]))}<br/><b>{esc(detail["ruleTitle"])}</b> : {esc(detail["ruleText"])}', 'Body')]
        if detail['restrictions']: block.append(p(f'Restriction : {detail["restrictions"]}', 'Warning'))
        block += [rich(f'<b>Score :</b> {fr(detail["score"]["total"])} - <b>Couverture :</b> {pct(detail["coverage"])} - <b>Confiance :</b> {esc(detail["confidence"])} - supportés/partiels/non supportés : {detail["supported"]}/{detail["partial"]}/{detail["unsupported"]}', 'Callout'),
                  standard_table(strat_rows, [31*mm, 9*mm, 14*mm, 92*mm, 68*mm], small=True), Spacer(1, 2*mm),
                  standard_table(enh_rows, [38*mm, 10*mm, 62*mm, 104*mm], small=True), Spacer(1, 2*mm),
                  standard_table(unit_rows, [61*mm, 13*mm, 13*mm, 13*mm, 114*mm], small=True)]
        story += block + [Spacer(1, 4*mm)]
    singles = [item for item in faction['assessments'] if item['kind'] == 'single']
    combinations = [item for item in faction['assessments'] if item['kind'] == 'combination']
    story += [PageBreak(), p('Classement exhaustif - détachements seuls', 'Heading1'), standard_table(score_rows(singles), [10*mm, 65*mm, 9*mm, 11*mm, 11*mm, 11*mm, 12*mm, 11*mm, 11*mm, 12*mm, 12*mm, 12*mm], small=True)]
    story += [PageBreak(), p('Classement exhaustif - combinaisons légales', 'Heading1'), p(f'{len(combinations)} combinaisons évaluées sous 3 DP. Les scores sont recalculés sur l’union des dispositions et des capacités ; ils ne sont pas additionnés.', 'Callout'),
              standard_table(score_rows(combinations), [10*mm, 65*mm, 9*mm, 11*mm, 11*mm, 11*mm, 12*mm, 11*mm, 11*mm, 12*mm, 12*mm, 12*mm], small=True)]
    story += [PageBreak(), p('Sensibilité 1 000 / 3 000 points', 'Heading1')]
    for sensitivity in faction['sensitivity']:
        story += [p(f'{sensitivity["battleSize"]} points - {sensitivity["dpBudget"]} DP - {sensitivity["evaluated"]} options évaluées', 'Heading2'), standard_table(score_rows(sensitivity['top']), [10*mm, 65*mm, 9*mm, 11*mm, 11*mm, 11*mm, 12*mm, 11*mm, 11*mm, 12*mm, 12*mm, 12*mm], small=True)]
    story += [p('Hypothèses et limites', 'Heading1'), p('Ce rapport n’est pas une liste complète. Il ne simule ni table, ni terrain, ni adversaire, ni séquence de CP. Une unité éligible dans le catalogue n’est pas automatiquement une cible valide en partie. Les règles non structurées sont conservées comme texte et diminuent la couverture analytique.')]
    return story


def validate_chart_audit(entries: list[dict[str, Any]]) -> None:
    if not entries: raise ValueError('Aucun graphique généré.')
    for entry in entries:
        if not entry.get('title') or not entry.get('population'): raise ValueError(f'Graphique incomplet : {entry.get("id")}')
        for axis_name in ['xAxis', 'yAxis']:
            axis = entry.get(axis_name, {})
            if not axis.get('label') or not axis.get('unit') or not axis.get('ticks'):
                raise ValueError(f'Axe incomplet {axis_name} : {entry.get("id")}')
        if entry['type'] == 'heatmap':
            scale = entry.get('colorScale', {})
            if scale.get('minimum') != 0 or scale.get('maximum') != 100 or len(scale.get('ticks', [])) < 2:
                raise ValueError(f'Échelle colorimétrique incomplète : {entry.get("id")}')


def build_pdf(path: Path, title: str, snapshot: str, story: list[Flowable], pagesize) -> None:
    doc = ReportDoc(str(path), title, snapshot, pagesize=pagesize)
    doc.build(story)
    reader = PdfReader(str(path))
    if len(reader.pages) == 0: raise ValueError(f'PDF vide : {path}')


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument('--input', required=True)
    parser.add_argument('--output', required=True)
    parser.add_argument('--public-root', required=True)
    args = parser.parse_args()
    report = json.loads(Path(args.input).read_text(encoding='utf-8'))
    output = Path(args.output); output.mkdir(parents=True, exist_ok=True)
    public_root = Path(args.public_root)
    build_pdf(output / '00-synthese-comparative.pdf', 'Synthèse comparative', report['snapshotDate'], synthesis_story(report), A4)
    filenames = {'Space Marines': '01-space-marines.pdf', 'Salamanders': '02-salamanders.pdf', 'Dark Angels': '03-dark-angels.pdf', 'Blood Angels': '04-blood-angels.pdf'}
    for faction in report['factions']:
        build_pdf(output / filenames[faction['factionId']], faction['factionId'], report['snapshotDate'], faction_story(report, faction, public_root), landscape(A4))
    validate_chart_audit(CHART_AUDIT)
    (output / 'chart-audit.json').write_text(json.dumps({'schemaVersion': 'warforge-chart-audit/v1', 'charts': CHART_AUDIT}, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    for filename in ['00-synthese-comparative.pdf', *filenames.values()]:
        path = output / filename
        print(f'{filename}: {len(PdfReader(str(path)).pages)} pages, {path.stat().st_size} bytes')


if __name__ == '__main__':
    main()
