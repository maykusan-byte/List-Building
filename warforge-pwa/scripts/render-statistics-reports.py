#!/usr/bin/env python3
"""Render the immutable Warforge statistics snapshot as a modular PDF collection."""

from __future__ import annotations

import argparse
import copy
import csv
import gzip
import hashlib
import html
import json
import math
import os
from pathlib import Path
from statistics import median
from typing import Any, Iterable

from pypdf import PdfReader
from reportlab.graphics.shapes import Circle, Drawing, Line, PolyLine, Rect, String
from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER, TA_LEFT
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.platypus import (
    BaseDocTemplate, Flowable, Frame, Image, KeepTogether, PageBreak, PageTemplate,
    Paragraph, Spacer, Table, TableStyle
)
from reportlab.platypus.tableofcontents import TableOfContents

PAGE_WIDTH, PAGE_HEIGHT = A4
NAVY = colors.HexColor('#102A36')
INK = colors.HexColor('#1D2D35')
MUTED = colors.HexColor('#5F727B')
GOLD = colors.HexColor('#C89B2C')
TEAL = colors.HexColor('#247D98')
GREEN = colors.HexColor('#3E8060')
RED = colors.HexColor('#A64B45')
PAPER = colors.HexColor('#F7F4EC')
GRID = colors.HexColor('#D3DDE0')


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


def esc(value: Any) -> str:
    return html.escape(str(value if value is not None else '—'))


def fr(value: float | int | None, digits: int = 1) -> str:
    if value is None or not math.isfinite(float(value)):
        return '—'
    return f'{float(value):.{digits}f}'.replace('.', ',')


def pct(value: float | None, digits: int = 0) -> str:
    return '—' if value is None else f'{fr(value * 100, digits)} %'


def styles() -> dict[str, ParagraphStyle]:
    base = getSampleStyleSheet()
    return {
        'Title': ParagraphStyle('Title', parent=base['Title'], fontName=FONT_BOLD, fontSize=25, leading=29, textColor=NAVY, alignment=TA_LEFT, spaceAfter=8),
        'Subtitle': ParagraphStyle('Subtitle', parent=base['Normal'], fontName=FONT, fontSize=11, leading=15, textColor=MUTED, spaceAfter=12),
        'Heading1': ParagraphStyle('Heading1', parent=base['Heading1'], fontName=FONT_BOLD, fontSize=17, leading=21, textColor=NAVY, spaceBefore=8, spaceAfter=8),
        'Heading2': ParagraphStyle('Heading2', parent=base['Heading2'], fontName=FONT_BOLD, fontSize=12, leading=15, textColor=TEAL, spaceBefore=7, spaceAfter=5),
        'Body': ParagraphStyle('Body', parent=base['BodyText'], fontName=FONT, fontSize=8.7, leading=12, textColor=INK, spaceAfter=5),
        'Small': ParagraphStyle('Small', parent=base['BodyText'], fontName=FONT, fontSize=7.2, leading=9.3, textColor=MUTED),
        'Table': ParagraphStyle('Table', parent=base['BodyText'], fontName=FONT, fontSize=6.5, leading=8, textColor=INK),
        'TableHead': ParagraphStyle('TableHead', parent=base['BodyText'], fontName=FONT_BOLD, fontSize=6.8, leading=8, textColor=colors.white),
        'Callout': ParagraphStyle('Callout', parent=base['BodyText'], fontName=FONT, fontSize=8.5, leading=12, textColor=NAVY, backColor=colors.HexColor('#E8F0F2'), borderColor=TEAL, borderWidth=.6, borderPadding=7, spaceAfter=8),
        'CoverMeta': ParagraphStyle('CoverMeta', parent=base['BodyText'], fontName=FONT_BOLD, fontSize=8, leading=12, textColor=TEAL),
    }


STYLES = styles()


class StatisticsDocTemplate(BaseDocTemplate):
    def __init__(self, filename: str, title: str, metadata: dict[str, str]):
        super().__init__(filename, pagesize=A4, leftMargin=16 * mm, rightMargin=16 * mm, topMargin=17 * mm, bottomMargin=15 * mm, title=title, author='Warforge')
        self.report_title = title
        self.metadata = metadata
        frame = Frame(self.leftMargin, self.bottomMargin, self.width, self.height, id='normal')
        self.addPageTemplates(PageTemplate(id='report', frames=[frame], onPage=self._decorate))

    def _decorate(self, canvas, doc):
        canvas.saveState()
        canvas.setFillColor(NAVY)
        canvas.rect(0, PAGE_HEIGHT - 8 * mm, PAGE_WIDTH, 8 * mm, fill=1, stroke=0)
        canvas.setFont(FONT_BOLD, 6.8)
        canvas.setFillColor(colors.white)
        canvas.drawString(16 * mm, PAGE_HEIGHT - 5.2 * mm, 'WARFORGE 40K · RAPPORT STATISTIQUE V11')
        canvas.setFont(FONT, 6.5)
        canvas.setFillColor(MUTED)
        canvas.drawString(16 * mm, 7 * mm, self.metadata['version'])
        canvas.drawRightString(PAGE_WIDTH - 16 * mm, 7 * mm, f'{canvas.getPageNumber()} · {self.metadata["snapshot"]}')
        canvas.restoreState()

    def afterFlowable(self, flowable):
        if isinstance(flowable, Paragraph) and flowable.style.name in {'Heading1', 'Heading2'}:
            level = 0 if flowable.style.name == 'Heading1' else 1
            text = flowable.getPlainText()
            key = f'bookmark-{self.page}-{abs(hash((text, self.page)))}'
            self.canv.bookmarkPage(key)
            self.canv.addOutlineEntry(text, key, level=level, closed=level > 0)
            self.notify('TOCEntry', (level, text, self.page, key))


class BarChart(Flowable):
    def __init__(self, values: list[tuple[str, float]], width=175 * mm, height=58 * mm, color=TEAL):
        super().__init__()
        self.values = values
        self.width, self.height, self.color = width, height, color

    def wrap(self, avail_width, avail_height):
        return min(self.width, avail_width), self.height

    def draw(self):
        if not self.values:
            return
        width = self._availWidth if hasattr(self, '_availWidth') else self.width
        left, bottom, right, top = 42, 17, width - 8, self.height - 8
        maximum = max(value for _, value in self.values) or 1
        bar_height = max(4, (top - bottom) / max(1, len(self.values)) - 2)
        self.canv.setFont(FONT, 6.5)
        for index, (label, value) in enumerate(self.values):
            y = top - (index + 1) * ((top - bottom) / len(self.values)) + 1
            self.canv.setFillColor(MUTED)
            self.canv.drawRightString(left - 4, y + 1, label[:19])
            self.canv.setFillColor(colors.HexColor('#E5EBED'))
            self.canv.rect(left, y, right - left, bar_height, fill=1, stroke=0)
            self.canv.setFillColor(self.color)
            self.canv.rect(left, y, (right - left) * value / maximum, bar_height, fill=1, stroke=0)
            self.canv.setFillColor(INK)
            self.canv.drawString(min(right - 18, left + (right - left) * value / maximum + 3), y + 1, fr(value, 0))


class LineChart(Flowable):
    def __init__(self, series: list[tuple[str, list[tuple[float, float]], colors.Color]], width=175 * mm, height=62 * mm, x_label='Distance (pouces)', y_label='Dégâts utiles'):
        super().__init__()
        self.series, self.width, self.height = series, width, height
        self.x_label, self.y_label = x_label, y_label

    def wrap(self, avail_width, avail_height):
        self.actual_width = min(self.width, avail_width)
        return self.actual_width, self.height

    def draw(self):
        width = getattr(self, 'actual_width', self.width)
        left, bottom, right, top = 34, 22, width - 9, self.height - 14
        points = [point for _, values, _ in self.series for point in values]
        if not points:
            return
        max_x = max(x for x, _ in points) or 1
        max_y = max(y for _, y in points) or 1
        self.canv.setStrokeColor(GRID)
        self.canv.rect(left, bottom, right - left, top - bottom, fill=0, stroke=1)
        self.canv.setFont(FONT, 6.2)
        self.canv.setFillColor(MUTED)
        for tick in sorted(set(x for x, _ in points)):
            x = left + (right - left) * tick / max_x
            self.canv.line(x, bottom, x, top)
            self.canv.drawCentredString(x, bottom - 9, fr(tick, 0))
        for label, values, color in self.series:
            coords = []
            for x_value, y_value in values:
                x = left + (right - left) * x_value / max_x
                y = bottom + (top - bottom) * y_value / max_y
                coords.extend((x, y))
            self.canv.setStrokeColor(color)
            self.canv.setLineWidth(1.6)
            if len(coords) >= 4:
                path = self.canv.beginPath(); path.moveTo(coords[0], coords[1])
                for index in range(2, len(coords), 2): path.lineTo(coords[index], coords[index + 1])
                self.canv.drawPath(path)
            self.canv.setFillColor(color)
            for index in range(0, len(coords), 2): self.canv.circle(coords[index], coords[index + 1], 1.7, fill=1, stroke=0)
        self.canv.setFillColor(MUTED); self.canv.setFont(FONT, 6.5)
        self.canv.drawCentredString((left + right) / 2, 3, self.x_label)
        legend_x = left
        for label, _, color in self.series:
            self.canv.setFillColor(color); self.canv.rect(legend_x, top + 4, 7, 2.5, fill=1, stroke=0)
            self.canv.setFillColor(INK); self.canv.drawString(legend_x + 10, top + 2, label)
            legend_x += 52


class ScatterChart(Flowable):
    def __init__(self, points: list[tuple[float, float, str]], width=175 * mm, height=68 * mm, x_label='X', y_label='Y'):
        super().__init__(); self.points = points; self.width = width; self.height = height; self.x_label = x_label; self.y_label = y_label

    def wrap(self, avail_width, avail_height): self.actual_width = min(self.width, avail_width); return self.actual_width, self.height

    def draw(self):
        if not self.points: return
        width = getattr(self, 'actual_width', self.width); left, bottom, right, top = 36, 22, width - 8, self.height - 10
        max_x = max(x for x, _, _ in self.points) or 1; max_y = max(y for _, y, _ in self.points) or 1
        self.canv.setStrokeColor(GRID); self.canv.rect(left, bottom, right - left, top - bottom, fill=0, stroke=1)
        self.canv.setFillColor(TEAL)
        for x_value, y_value, _ in self.points:
            x = left + (right - left) * x_value / max_x; y = bottom + (top - bottom) * y_value / max_y
            self.canv.circle(x, y, 2, fill=1, stroke=0)
        self.canv.setFillColor(MUTED); self.canv.setFont(FONT, 6.5)
        self.canv.drawCentredString((left + right) / 2, 3, self.x_label)
        self.canv.saveState(); self.canv.translate(8, (bottom + top) / 2); self.canv.rotate(90); self.canv.drawCentredString(0, 0, self.y_label); self.canv.restoreState()


def p(text: Any, style='Body') -> Paragraph:
    return Paragraph(esc(text), STYLES[style])


def rich(text: str, style='Body') -> Paragraph:
    return Paragraph(text, STYLES[style])


def cover(title: str, subtitle: str, snapshot: dict[str, Any]) -> list[Flowable]:
    return [
        Spacer(1, 21 * mm),
        rich('WARFORGE 40K · V11', 'CoverMeta'),
        Spacer(1, 5 * mm), p(title, 'Title'), p(subtitle, 'Subtitle'),
        Spacer(1, 8 * mm),
        rich(f'<b>Catalogue</b> {esc(snapshot["catalogVersion"])}<br/><b>Moteur</b> {esc(snapshot["engineVersion"])}<br/><b>Snapshot</b> {esc(snapshot["snapshotDate"])}<br/><b>Fingerprint</b> {esc(snapshot["catalogFingerprint"])}', 'Callout'),
        Spacer(1, 6 * mm),
        p('Calculs théoriques exacts et reproductibles. Les moyennes ne constituent ni une promesse de résultat, ni un taux de victoire.', 'Subtitle'),
        PageBreak()
    ]


def table(rows: list[list[Any]], widths: list[float] | None = None, repeat=1, font_size=6.5) -> Table:
    converted = []
    for row_index, row in enumerate(rows):
        converted.append([cell if isinstance(cell, Flowable) else p(cell, 'TableHead' if row_index == 0 else 'Table') for cell in row])
    result = Table(converted, colWidths=widths, repeatRows=repeat, hAlign='LEFT')
    result.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, 0), NAVY), ('TEXTCOLOR', (0, 0), (-1, 0), colors.white),
        ('GRID', (0, 0), (-1, -1), .3, GRID), ('VALIGN', (0, 0), (-1, -1), 'TOP'),
        ('LEFTPADDING', (0, 0), (-1, -1), 3), ('RIGHTPADDING', (0, 0), (-1, -1), 3),
        ('TOPPADDING', (0, 0), (-1, -1), 2.5), ('BOTTOMPADDING', (0, 0), (-1, -1), 2.5),
        ('ROWBACKGROUNDS', (0, 1), (-1, -1), [colors.white, PAPER])
    ]))
    return result


def toc() -> list[Flowable]:
    contents = TableOfContents(); contents.levelStyles = [STYLES['Body'], STYLES['Small']]
    return [p('Sommaire', 'Heading1'), contents, PageBreak()]


def make_pdf(path: Path, title: str, subtitle: str, snapshot: dict[str, Any], story: list[Flowable]):
    metadata = {'version': f'Catalogue {snapshot["catalogVersion"]} · moteur {snapshot["engineVersion"]}', 'snapshot': snapshot['snapshotDate']}
    document = StatisticsDocTemplate(str(path), title, metadata)
    document.multiBuild(cover(title, subtitle, snapshot) + toc() + story)


def scenario(unit: dict[str, Any], target_id: str, distance: int, mode: str) -> dict[str, Any] | None:
    return next((entry for entry in unit['offenseScenarios'] if entry.get('targetId') == target_id and entry.get('distance') == distance and entry.get('mode') == mode), None)


def defense(unit: dict[str, Any], threat_id: str) -> dict[str, Any] | None:
    return next((entry for entry in unit['defenseScenarios'] if entry.get('threatId') == threat_id), None)


def median_damage(units: list[dict[str, Any]], target: str, distance: int, mode: str) -> float:
    values = [entry['usefulDamage']['mean'] for unit in units if (entry := scenario(unit, target, distance, mode))]
    return float(median(values)) if values else 0


def guide_story(snapshot: dict[str, Any]) -> list[Flowable]:
    story: list[Flowable] = [p('Ce que mesure la collection', 'Heading1')]
    story += [p('Chaque valeur est calculée sur une configuration légale et une cible ou menace explicite. Les aptitudes non structurées sont signalées et ne sont jamais appliquées implicitement.')]
    chapters = [
        ('Moyenne, médiane et quantiles', 'La moyenne décrit la production attendue à long terme. La médiane partage la distribution en deux. P10 et P90 encadrent 80 % des résultats.'),
        ('Dégâts utiles', 'Les dégâts sont alloués attaque par attaque. Le surplus perdu sur une figurine n’est pas reporté sur la suivante.'),
        ('Fiabilité', 'Le coefficient de variation, le risque de zéro et l’intervalle P10-P90 décrivent la dispersion autour de la moyenne.'),
        ('Distances', 'Les paliers sont 0, 9, 12, 18, 24 et 36 pouces. Une arme est inactive au-delà de sa portée. La demi-portée est inclusive.'),
        ('Pistolet', 'À 0 pouce, le rapport sépare le tir Pistolet de la mêlée. Pour une unité non Monster/Vehicle, Pistolet et autres armes à distance restent des modes exclusifs.'),
        ('Rapid Fire et Melta', 'Rapid Fire ajoute ses attaques et Melta ajoute ses dégâts lorsque la cible est à une distance strictement positive, inférieure ou égale à la moitié de la portée.'),
        ('Couverture', 'Complet signifie qu’aucun effet non structuré identifié ne devrait modifier la métrique. Partiel invite à lire la liste des limites.'),
        ('Limites', 'Placement, lignes de vue réelles, terrain, missions, décisions adverses, auras, stratagèmes et synergies externes ne sont pas simulés.')
    ]
    for title, body in chapters: story += [p(title, 'Heading2'), p(body)]
    story += [p('Scénarios versionnés', 'Heading1'), table([['Cible', 'E', 'Sv', 'Inv.', 'PV/fig.', 'Fig.']] + [[target['label'], target['toughness'], f"{target['save']}+", f"{target.get('invulnerableSave', '—')}+" if target.get('invulnerableSave') else '—', target['woundsPerModel'], target['models']] for target in snapshot['targets']], [55*mm, 15*mm, 18*mm, 18*mm, 22*mm, 18*mm])]
    story += [Spacer(1, 4*mm), table([['Menace', 'A', 'CT', 'F', 'PA', 'D']] + [[threat['label'], threat['attacks'], threat['skill'], threat['strength'], threat['ap'], threat['damage']] for threat in snapshot['threats']], [55*mm, 18*mm, 18*mm, 18*mm, 18*mm, 22*mm])]
    return story


def atlas_story(snapshot: dict[str, Any]) -> list[Flowable]:
    units = snapshot['units']; factions = snapshot['factions']
    story: list[Flowable] = [p('Vue d’ensemble', 'Heading1')]
    story += [rich(f"<b>{snapshot['totals']['factions']}</b> factions · <b>{snapshot['totals']['units']}</b> unités uniques · <b>{snapshot['totals']['configurations']}</b> configurations légales.<br/>Couverture complète : <b>{snapshot['totals']['completeCoverage']}</b> unités ; partielle : <b>{snapshot['totals']['partialCoverage']}</b>.", 'Callout')]
    counts = [(faction['name'], len(faction['unitIds'])) for faction in factions]
    story += [p('Unités accessibles par roster primaire', 'Heading2'), BarChart(counts)]
    costs = [unit['points']['median'] for unit in units]
    buckets = [(f'{start}-{start+49}', sum(1 for value in costs if start <= value < start + 50)) for start in range(0, int(max(costs, default=0)) + 50, 50)]
    story += [p('Distribution des coûts médians', 'Heading2'), BarChart(buckets[:14], color=GOLD)]
    role_counts: dict[str, int] = {}
    for unit in units:
        for role in unit['roles']: role_counts[role['role']] = role_counts.get(role['role'], 0) + 1
    story += [p('Rôles calculés', 'Heading2'), BarChart(sorted(role_counts.items(), key=lambda item: item[1], reverse=True), color=GREEN)]
    return story


def offense_story(snapshot: dict[str, Any]) -> list[Flowable]:
    units = snapshot['units']; story: list[Flowable] = [p('Lecture par cible et distance', 'Heading1'), p('Les courbes utilisent la configuration de référence de chaque unité. Les annexes de faction conservent toutes les configurations légales.')]
    for target in snapshot['targets']:
        story += [p(target['label'], 'Heading1')]
        standard = [('Autres tirs', [(distance, median_damage(units, target['id'], distance, 'standard-ranged')) for distance in snapshot['distances'] if distance > 0], TEAL)]
        pistols = [('Pistolets', [(distance, median_damage(units, target['id'], distance, 'pistol')) for distance in snapshot['distances']], GOLD)]
        melee = [('Mêlée', [(0, median_damage(units, target['id'], 0, 'melee')), (1, median_damage(units, target['id'], 0, 'melee'))], RED)]
        story += [LineChart(standard + pistols + melee)]
        ranked = []
        for unit in units:
            entry = scenario(unit, target['id'], 12, 'standard-ranged')
            if entry: ranked.append((entry['usefulDamage']['mean'], unit, entry))
        ranked.sort(key=lambda item: item[0], reverse=True)
        rows = [['Unité', 'Faction/source', 'Dégâts', 'P10-P90', 'Destruction']]
        for value, unit, entry in ranked[:20]: rows.append([unit['name'], unit['sourceKey'], fr(value), f"{fr(entry['usefulDamage']['p10'])}-{fr(entry['usefulDamage']['p90'])}", pct(entry['destroyProbability'])])
        story += [table(rows, [58*mm, 40*mm, 20*mm, 25*mm, 27*mm]), PageBreak()]
    return story


def defense_story(snapshot: dict[str, Any]) -> list[Flowable]:
    units = snapshot['units']; story: list[Flowable] = []
    for threat in snapshot['threats']:
        story += [p(threat['label'], 'Heading1'), p(f"Salve : {threat['attacks']} attaques · CT {threat['skill']} · F {threat['strength']} · PA {threat['ap']} · D {threat['damage']}.")]
        ranked = []
        for unit in units:
            entry = defense(unit, threat['id'])
            if entry: ranked.append((entry['effectiveWounds'], unit, entry))
        ranked.sort(key=lambda item: item[0], reverse=True)
        rows = [['Unité', 'PV eff.', 'Dégâts reçus', 'P10-P90', 'Survie']]
        for value, unit, entry in ranked[:30]: rows.append([unit['name'], fr(value), fr(entry['incomingDamage']['mean']), f"{fr(entry['incomingDamage']['p10'])}-{fr(entry['incomingDamage']['p90'])}", pct(entry['survivalProbability'])])
        story += [BarChart([(unit['name'], value) for value, unit, _ in ranked[:15]], color=GREEN), table(rows, [67*mm, 24*mm, 28*mm, 27*mm, 24*mm]), PageBreak()]
    return story


def mobility_story(snapshot: dict[str, Any]) -> list[Flowable]:
    units = snapshot['units']; story: list[Flowable] = [p('Projection et contrôle', 'Heading1')]
    story += [ScatterChart([(unit['mobility']['threatRange'], unit['efficiency']['objectiveControlPerHundred'], unit['name']) for unit in units], x_label='Portée de menace (pouces)', y_label='OC / 100 points')]
    rows = [['Unité', 'M', 'Portée max.', 'Menace', 'OC total', 'OC/100', 'Réserves']]
    for unit in sorted(units, key=lambda item: (item['mobility']['threatRange'], item['efficiency']['objectiveControlPerHundred']), reverse=True):
        reserves = ', '.join(label for key, label in [('deepStrike', 'Deep Strike'), ('infiltrators', 'Infiltrators'), ('scouts', 'Scouts')] if unit['mobility'][key]) or '—'
        rows.append([unit['name'], fr(unit['mobility']['move'], 0), fr(unit['mobility']['maximumRange'], 0), fr(unit['mobility']['threatRange'], 0), fr(unit['characteristics']['totalObjectiveControl'], 0), fr(unit['efficiency']['objectiveControlPerHundred']), reserves])
    story += [table(rows, [49*mm, 13*mm, 20*mm, 20*mm, 19*mm, 20*mm, 30*mm])]
    return story


def reliability_story(snapshot: dict[str, Any]) -> list[Flowable]:
    units = snapshot['units']; story: list[Flowable] = [p('Fiabilité et efficience', 'Heading1')]
    story += [ScatterChart([(unit['efficiency']['damagePerHundred'], unit['reliability']['zeroDamageProbability'] * 100, unit['name']) for unit in units], x_label='Dégâts utiles / 100 points', y_label='Risque de zéro (%)')]
    rows = [['Unité', 'Dégâts/100', 'PV eff./100', 'OC/100', 'CV', 'Zéro', 'IQR']]
    for unit in sorted(units, key=lambda item: item['efficiency']['damagePerHundred'], reverse=True):
        rows.append([unit['name'], fr(unit['efficiency']['damagePerHundred']), fr(unit['efficiency']['effectiveWoundsPerHundred']), fr(unit['efficiency']['objectiveControlPerHundred']), fr(unit['reliability']['coefficientOfVariation']), pct(unit['reliability']['zeroDamageProbability']), fr(unit['reliability']['interquartileRange'])])
    story += [table(rows, [55*mm, 22*mm, 23*mm, 20*mm, 17*mm, 18*mm, 16*mm])]
    return story


def configurations_story(snapshot: dict[str, Any]) -> list[Flowable]:
    units = snapshot['units']; story: list[Flowable] = [p('Configurations et breakpoints', 'Heading1'), p('Les volumes ci-dessous comptent les arsenaux légaux statistiquement distincts. Les monographies fournissent les lignes exhaustives.')]
    ranked = sorted(units, key=lambda unit: len(unit['configurations']), reverse=True)
    story += [BarChart([(unit['name'], len(unit['configurations'])) for unit in ranked[:20]], color=GOLD)]
    rows = [['Unité', 'Configurations', 'Points min.', 'Médiane', 'Max.', 'Portée max.']]
    for unit in ranked: rows.append([unit['name'], len(unit['configurations']), unit['points']['minimum'], fr(unit['points']['median'], 0), unit['points']['maximum'], fr(unit['mobility']['maximumRange'], 0)])
    story += [table(rows, [70*mm, 24*mm, 22*mm, 22*mm, 18*mm, 22*mm])]
    story += [p('Paliers de distance', 'Heading1'), table([['Palier', 'Interprétation']] + [[f'{distance}"', 'Mêlée et Pistolet séparés' if distance == 0 else 'Portée et demi-portée évaluées arme par arme'] for distance in snapshot['distances']], [30*mm, 140*mm])]
    return story


def load_images(manifest_path: Path, public_root: Path) -> dict[str, tuple[Path, dict[str, Any]]]:
    if not manifest_path.exists(): return {}
    manifest = json.loads(manifest_path.read_text(encoding='utf-8'))
    result = {}
    for entry in manifest.get('entries', []):
        asset = public_root / entry['asset']
        if asset.exists(): result[entry['unitId']] = (asset, entry)
    return result


def unit_story(unit: dict[str, Any], snapshot: dict[str, Any], image_info: tuple[Path, dict[str, Any]] | None) -> list[Flowable]:
    part = unit.get('_configuration_part')
    heading = unit['name'] if not part else f"{unit['name']} · configurations {part[0]}/{part[1]}"
    total_configurations = unit.get('_configuration_total', len(unit['configurations']))
    story: list[Flowable] = [p(heading, 'Heading1')]
    facts = rich(
        f"<b>Source</b> {esc(unit['sourceKey'])}<br/><b>Configurations</b> {total_configurations}<br/>"
        f"<b>Points</b> {unit['points']['minimum']} / {fr(unit['points']['median'], 0)} / {unit['points']['maximum']} (min./médiane/max.)<br/>"
        f"<b>M/E/Sv</b> {fr(unit['characteristics']['movement'], 0)} / {fr(unit['characteristics']['toughness'], 0)} / {fr(unit['characteristics']['save'], 0)}+<br/>"
        f"<b>PV/OC totaux</b> {fr(unit['characteristics']['totalWounds'], 0)} / {fr(unit['characteristics']['totalObjectiveControl'], 0)}<br/>"
        f"<b>Couverture</b> {esc(unit['coverage'])}", 'Body')
    if image_info:
        image = Image(str(image_info[0]), width=33*mm, height=33*mm, kind='proportional')
        story += [Table([[image, facts]], colWidths=[38*mm, 132*mm], style=[('VALIGN', (0,0), (-1,-1), 'TOP')])]
        story += [p(f"Image : {image_info[1].get('sourceLabel', 'source référencée')} · {image_info[1].get('retrievedAt', '')}", 'Small')]
    else: story += [facts]
    series = []
    for mode, label, color in [('standard-ranged', 'Autres tirs', TEAL), ('pistol', 'Pistolets', GOLD)]:
        values = []
        for distance in snapshot['distances']:
            entry = scenario(unit, 'infantry', distance, mode)
            if entry: values.append((distance, entry['usefulDamage']['mean']))
        series.append((label, values, color))
    melee = scenario(unit, 'infantry', 0, 'melee')
    if melee: series.append(('Mêlée', [(0, melee['usefulDamage']['mean']), (1, melee['usefulDamage']['mean'])], RED))
    story += [p('Dégâts utiles contre Infanterie selon la distance', 'Heading2'), LineChart(series)]
    offense_rows = [['Distance', 'Mode', 'Moy.', 'P10-P90', 'Destruction']]
    for distance in snapshot['distances']:
        modes = ['melee', 'pistol'] if distance == 0 else ['standard-ranged', 'pistol', 'vehicle-combined']
        for mode in modes:
            entry = scenario(unit, 'infantry', distance, mode)
            if entry and (entry['usefulDamage']['mean'] > 0 or mode in {'melee', 'standard-ranged'}):
                offense_rows.append([f'{distance}"', mode, fr(entry['usefulDamage']['mean']), f"{fr(entry['usefulDamage']['p10'])}-{fr(entry['usefulDamage']['p90'])}", pct(entry['destroyProbability'])])
    story += [table(offense_rows, [25*mm, 45*mm, 25*mm, 35*mm, 35*mm])]
    defense_rows = [['Menace', 'Dégâts reçus', 'Survie', 'PV eff.']]
    for threat in snapshot['threats']:
        entry = defense(unit, threat['id'])
        if entry: defense_rows.append([threat['label'], fr(entry['incomingDamage']['mean']), pct(entry['survivalProbability']), fr(entry['effectiveWounds'])])
    story += [p('Défense', 'Heading2'), table(defense_rows, [65*mm, 35*mm, 30*mm, 30*mm])]
    if unit['unsupportedEffects']:
        story += [p('Effets non modélisés', 'Heading2'), p(' · '.join(unit['unsupportedEffects'][:12]), 'Small')]
    story += [p('Configurations légales', 'Heading2')]
    configurations = sorted(unit['configurations'], key=lambda item: (item['points'], item['models'], item['label'], item['hash']))
    if len(configurations) > 300:
        indexes = sorted({round(index * (len(configurations) - 1) / 299) for index in range(300)})
        configurations = [configurations[index] for index in indexes]
        story += [p(f"Extrait déterministe de {len(configurations)} configurations sur {total_configurations}. L’export CSV compressé joint à la collection contient chaque ligne légale.", 'Small')]
    rows = [['Hash', 'Fig.', 'Pts', 'Équipement et exigences']]
    for config in configurations:
        suffix = f" · Détachement : {', '.join(config['requiredDetachments'])}" if config['requiredDetachments'] else ''
        warnings = f" · Limites : {', '.join(config['warnings'])}" if config['warnings'] else ''
        rows.append([config['hash'], config['models'], config['points'], config['label'] + suffix + warnings])
    story += [table(rows, [25*mm, 14*mm, 15*mm, 116*mm])]
    return story


def estimated_pages(unit: dict[str, Any]) -> int:
    return 3 + math.ceil(min(len(unit['configurations']), 300) / 24)


def segment_units(units: list[dict[str, Any]], maximum_configurations=2200) -> list[dict[str, Any]]:
    """PDFs show representative rows; compressed exports retain every row."""
    return [copy.copy(unit) for unit in units]


def faction_chunks(units: list[dict[str, Any]], maximum_pages=150) -> list[list[dict[str, Any]]]:
    chunks: list[list[dict[str, Any]]] = []; current: list[dict[str, Any]] = []; pages = 0
    for unit in sorted(units, key=lambda item: item['name']):
        estimate = estimated_pages(unit)
        if current and pages + estimate > maximum_pages:
            chunks.append(current); current = []; pages = 0
        current.append(unit); pages += estimate
    if current: chunks.append(current)
    return chunks


def slug(value: str) -> str:
    import unicodedata, re
    normalized = unicodedata.normalize('NFKD', value).encode('ascii', 'ignore').decode('ascii').lower()
    return re.sub(r'[^a-z0-9]+', '-', normalized).strip('-')


def render_collection(snapshot: dict[str, Any], images: dict[str, tuple[Path, dict[str, Any]]], output: Path):
    make_pdf(output / '00-guide-methodologie.pdf', 'Guide et méthodologie', 'Lire et interpréter les rapports statistiques Warforge.', snapshot, guide_story(snapshot))
    make_pdf(output / '01-atlas-du-groupe.pdf', 'Atlas statistique du groupe', 'Vue descriptive des neuf rosters primaires.', snapshot, atlas_story(snapshot))
    make_pdf(output / '02-offense-cibles-et-distances.pdf', 'Offense, cibles et distances', 'Dégâts utiles, quantiles, Pistolet, Rapid Fire et Melta.', snapshot, offense_story(snapshot))
    make_pdf(output / '03-defense-par-menace.pdf', 'Défense par menace', 'Survie, dégâts reçus et points de vie effectifs.', snapshot, defense_story(snapshot))
    make_pdf(output / '04-mobilite-et-controle.pdf', 'Mobilité et contrôle', 'Projection, charge, réserves et contrôle d’objectif.', snapshot, mobility_story(snapshot))
    make_pdf(output / '05-fiabilite-et-efficience.pdf', 'Fiabilité et efficience', 'Dispersion, risque et métriques par 100 points.', snapshot, reliability_story(snapshot))
    make_pdf(output / '06-configurations-et-breakpoints.pdf', 'Configurations et breakpoints', 'Tailles, équipements et paliers statistiques.', snapshot, configurations_story(snapshot))
    faction_directory = output / 'factions'; faction_directory.mkdir(exist_ok=True)
    by_id = {unit['id']: unit for unit in snapshot['units']}
    for faction in snapshot['factions']:
        faction_units = [by_id[unit_id] for unit_id in faction['unitIds'] if unit_id in by_id]
        detailed_units = [unit for unit in faction_units if unit['sourceKey'] == faction['sourceKey']]
        shared_units = [unit for unit in faction_units if unit['sourceKey'] != faction['sourceKey']]
        chunks = faction_chunks(segment_units(detailed_units))
        if not chunks: chunks = [[]]
        for index, chunk in enumerate(chunks, 1):
            suffix = f'-partie-{index:02d}' if len(chunks) > 1 else ''
            filename = faction_directory / f"{slug(faction['name'])}{suffix}.pdf"
            story: list[Flowable] = [p('Synthèse du roster', 'Heading1'), rich(f"<b>{len(faction_units)}</b> unités accessibles par les sources primaires : {esc(', '.join(faction['primaryRosterSourceKeys']))}.<br/>Partie {index}/{len(chunks)} · {len(detailed_units)} fiches propres à la faction · {len(shared_units)} fiches partagées référencées.", 'Callout')]
            if shared_units and index == 1:
                shared_rows = [['Unité partagée', 'Source', 'Configurations', 'Points min.-max.']]
                for unit in sorted(shared_units, key=lambda item: item['name']):
                    shared_rows.append([unit['name'], unit['sourceKey'], len(unit['configurations']), f"{unit['points']['minimum']}-{unit['points']['maximum']}"])
                story += [p('Unités partagées', 'Heading2'), p('Leurs fiches exhaustives figurent dans la monographie de leur source canonique ; ce roster conserve ici leur périmètre et leurs chiffres de synthèse.'), table(shared_rows, [65*mm, 42*mm, 28*mm, 35*mm])]
            story += [BarChart([(unit['name'], len(unit['configurations'])) for unit in sorted(chunk, key=lambda item: len(item['configurations']), reverse=True)[:15]], color=GOLD)]
            for unit in chunk:
                story += [PageBreak()] + unit_story(unit, snapshot, images.get(unit['id']))
            make_pdf(filename, f"Monographie · {faction['name']}", 'Fiches d’unités et configurations légales exhaustives.', snapshot, story)


def manifest(output: Path, snapshot: dict[str, Any]) -> dict[str, Any]:
    files = []
    for path in sorted(output.rglob('*.pdf')):
        data = path.read_bytes(); pages = len(PdfReader(path).pages)
        files.append({'path': path.relative_to(output).as_posix(), 'bytes': len(data), 'pages': pages, 'sha256': hashlib.sha256(data).hexdigest()})
    data_files = []
    for path in sorted(output.glob('*.gz')):
        data = path.read_bytes()
        data_files.append({'path': path.relative_to(output).as_posix(), 'bytes': len(data), 'sha256': hashlib.sha256(data).hexdigest()})
    result = {
        'schemaVersion': snapshot['schemaVersion'], 'snapshotDate': snapshot['snapshotDate'],
        'catalogVersion': snapshot['catalogVersion'], 'catalogFingerprint': snapshot['catalogFingerprint'],
        'engineVersion': snapshot['engineVersion'], 'files': files, 'dataFiles': data_files
    }
    (output / 'manifest.json').write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding='utf-8')
    lines = ['# Rapports statistiques Warforge', '', f"Snapshot : {snapshot['snapshotDate']} · catalogue {snapshot['catalogVersion']} · moteur {snapshot['engineVersion']}", '', '| Fichier | Pages | Taille | SHA-256 |', '|---|---:|---:|---|']
    for entry in files: lines.append(f"| `{entry['path']}` | {entry['pages']} | {entry['bytes']} | `{entry['sha256']}` |")
    lines += ['', '## Exports exhaustifs', '', '| Fichier | Taille | SHA-256 |', '|---|---:|---|']
    for entry in data_files: lines.append(f"| `{entry['path']}` | {entry['bytes']} | `{entry['sha256']}` |")
    (output / 'MANIFESTE.md').write_text('\n'.join(lines) + '\n', encoding='utf-8')
    return result


def validate(result: dict[str, Any], output: Path):
    if not result['files']: raise RuntimeError('Aucun PDF généré.')
    for entry in result['files']:
        path = output / entry['path']
        if entry['pages'] < 2: raise RuntimeError(f'PDF incomplet : {path}')
        if entry['pages'] > 180: raise RuntimeError(f'PDF supérieur à 180 pages : {path}')
        if entry['bytes'] >= 80 * 1024 * 1024: raise RuntimeError(f'PDF supérieur à 80 Mio : {path}')
        reader = PdfReader(path)
        first_text = (reader.pages[0].extract_text() or '').strip()
        if 'WARFORGE' not in first_text.upper(): raise RuntimeError(f'Couverture illisible : {path}')
    if len(result.get('dataFiles', [])) != 2: raise RuntimeError('Les deux exports exhaustifs compressés sont requis.')


def write_data_exports(snapshot: dict[str, Any], output: Path):
    snapshot_path = output / 'snapshot-statistique-exhaustif.json.gz'
    with gzip.open(snapshot_path, 'wt', encoding='utf-8', newline='') as handle:
        json.dump(snapshot, handle, ensure_ascii=False, separators=(',', ':'))
    csv_path = output / 'configurations-exhaustives.csv.gz'
    with gzip.open(csv_path, 'wt', encoding='utf-8-sig', newline='') as handle:
        writer = csv.writer(handle, delimiter=';')
        writer.writerow(['snapshot', 'catalogue', 'moteur', 'unitId', 'unité', 'source', 'factionsRoster', 'configurationHash', 'libellé', 'figurines', 'points', 'détachementsRequis', 'avertissements'])
        for unit in snapshot['units']:
            factions = ','.join(unit['rosterFactionIds'])
            for configuration in unit['configurations']:
                writer.writerow([
                    snapshot['snapshotDate'], snapshot['catalogVersion'], snapshot['engineVersion'], unit['id'], unit['name'], unit['sourceKey'], factions,
                    configuration['hash'], configuration['label'], configuration['models'], configuration['points'],
                    ','.join(configuration['requiredDetachments']), ','.join(configuration['warnings'])
                ])


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--snapshot', required=True, type=Path)
    parser.add_argument('--images', required=True, type=Path)
    parser.add_argument('--public-root', required=True, type=Path)
    parser.add_argument('--output', required=True, type=Path)
    args = parser.parse_args()
    snapshot = json.loads(args.snapshot.read_text(encoding='utf-8'))
    args.output.mkdir(parents=True, exist_ok=True)
    write_data_exports(snapshot, args.output)
    render_collection(snapshot, load_images(args.images, args.public_root), args.output)
    result = manifest(args.output, snapshot); validate(result, args.output)
    print(f"{len(result['files'])} PDF validés dans {args.output}")


if __name__ == '__main__': main()
