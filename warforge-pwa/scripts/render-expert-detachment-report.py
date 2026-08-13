#!/usr/bin/env python3
"""Render the autonomous conditional-expert detachment reports."""

from __future__ import annotations

import argparse
import importlib.util
import json
import math
from pathlib import Path
from typing import Any

from reportlab.lib import colors
from reportlab.lib.pagesizes import A4, landscape
from reportlab.lib.units import mm
from reportlab.platypus import Flowable, PageBreak, Spacer


def load_base():
    path = Path(__file__).with_name('render-detachment-inventory-report.py')
    spec = importlib.util.spec_from_file_location('warforge_prudent_renderer', path)
    if spec is None or spec.loader is None:
        raise RuntimeError(f'Impossible de charger {path}')
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


B = load_base()


class WaterfallChart(Flowable):
    """Auditable score bridge with an explicit numeric scale and categorical ticks."""

    def __init__(self, title: str, start: float, changes: list[tuple[str, float]], population: str,
                 width: float = 250 * mm, height: float = 73 * mm):
        super().__init__()
        self.title, self.start, self.changes, self.population = title, start, changes, population
        self.width, self.height = width, height
        cumulative = [start]
        for _, value in changes:
            cumulative.append(cumulative[-1] + value)
        self.cumulative = cumulative
        low = min(0, min(cumulative))
        high = max(cumulative)
        self.minimum = math.floor(low / 10) * 10
        self.maximum = max(10, math.ceil(high / 10) * 10)
        labels = ['Prudent'] + [label for label, _ in changes] + ['Central']
        self.audit_id = f'chart-{len(B.CHART_AUDIT) + 1}'
        B.CHART_AUDIT.append({
            'id': self.audit_id, 'type': 'waterfall', 'title': title, 'population': population,
            'xAxis': {'label': 'Étapes de formation du score', 'unit': 'catégorie', 'ticks': labels},
            'yAxis': {'label': 'Score cumulé', 'unit': 'points sur 100', 'minimum': self.minimum,
                      'maximum': self.maximum, 'ticks': [self.minimum + (self.maximum-self.minimum)*i/5 for i in range(6)]},
            'legend': True,
        })

    def wrap(self, avail_width, _avail_height):
        self.actual_width = min(self.width, avail_width)
        return self.actual_width, self.height

    def draw(self):
        width = getattr(self, 'actual_width', self.width)
        left, bottom, right, top = 43, 35, width - 12, self.height - 32
        span = max(1, self.maximum - self.minimum)
        labels = ['Prudent'] + [label for label, _ in self.changes] + ['Central']
        values = [self.start] + [value for _, value in self.changes] + [self.cumulative[-1]]
        count = len(labels); slot = (right-left) / max(1, count)
        self.canv.setFont(B.FONT_BOLD, 8.3); self.canv.setFillColor(B.NAVY)
        self.canv.drawCentredString(width/2, self.height-10, B.clean(self.title))
        self.canv.setFont(B.FONT, 6.1); self.canv.setFillColor(B.MUTED)
        self.canv.drawCentredString(width/2, self.height-20, f'{B.clean(self.population)} - n={len(self.changes)} ajustements')
        for i in range(6):
            tick = self.minimum + span*i/5; y = bottom + (top-bottom)*(tick-self.minimum)/span
            self.canv.setStrokeColor(B.GRID); self.canv.line(left, y, right, y)
            self.canv.setFillColor(B.MUTED); self.canv.setFont(B.FONT, 5.7); self.canv.drawRightString(left-4, y-2, B.fr(tick, 0))
        zero_y = bottom + (top-bottom)*(0-self.minimum)/span
        previous = self.start
        for index, (label, value) in enumerate(zip(labels, values)):
            x = left + (index+.16)*slot; bar_w = slot*.68
            if index == 0 or index == count-1:
                low, high, fill = 0, value, B.GOLD if index == 0 else B.TEAL
            else:
                low, high = sorted((previous, previous+value)); fill = B.GREEN if value >= 0 else B.RED
                previous += value
            y0 = bottom + (top-bottom)*(low-self.minimum)/span
            y1 = bottom + (top-bottom)*(high-self.minimum)/span
            self.canv.setFillColor(fill); self.canv.rect(x, min(y0, y1), bar_w, max(2, abs(y1-y0)), fill=1, stroke=0)
            shown = value if 0 < index < count-1 else high
            self.canv.setFillColor(B.INK); self.canv.setFont(B.FONT_BOLD, 5.5)
            self.canv.drawCentredString(x+bar_w/2, max(y0, y1)+3, f'{shown:+.1f}' if 0 < index < count-1 else B.fr(shown, 1))
            self.canv.saveState(); self.canv.translate(x+bar_w/2, bottom-4); self.canv.rotate(28)
            self.canv.setFont(B.FONT, 5.4); self.canv.setFillColor(B.MUTED); self.canv.drawRightString(0, 0, B.clean(label)[:19]); self.canv.restoreState()
        self.canv.setStrokeColor(B.INK); self.canv.line(left, zero_y, right, zero_y)
        self.canv.setFont(B.FONT, 6); self.canv.setFillColor(B.MUTED)
        self.canv.drawCentredString((left+right)/2, 3, 'Étapes de formation du score (catégories)')
        self.canv.saveState(); self.canv.translate(8, (bottom+top)/2); self.canv.rotate(90)
        self.canv.drawCentredString(0, 0, f'Score cumulé (points sur 100) - {B.fr(self.minimum,0)} à {B.fr(self.maximum,0)}'); self.canv.restoreState()
        self.canv.setFillColor(B.GREEN); self.canv.rect(right-90, top+7, 7, 3, fill=1, stroke=0)
        self.canv.setFillColor(B.INK); self.canv.setFont(B.FONT, 5.4); self.canv.drawString(right-80, top+6, 'bonus')
        self.canv.setFillColor(B.RED); self.canv.rect(right-48, top+7, 7, 3, fill=1, stroke=0)
        self.canv.setFillColor(B.INK); self.canv.drawString(right-38, top+6, 'malus')


def assessment_map(faction: dict[str, Any]) -> dict[str, dict[str, Any]]:
    return {item['id']: item for item in faction['assessments']}


def inference_map(document: dict[str, Any]) -> dict[str, dict[str, Any]]:
    return {item['id']: item for item in document['records']}


def score_table(items: list[dict[str, Any]], limit: int | None = None):
    rows = [['Rang', 'Détachement(s)', 'DP', 'Prudent', 'Central', 'Favorable', 'Prim.', 'Sec.', 'Inv.', 'Règles', 'Opt.', 'Flex.', 'Couv.', 'Conf.', 'Cond.']]
    for item in items[:limit]:
        s, r = item['expertScores'], item['scoreRange']
        rows.append([item['rank'], ' + '.join(item['detachmentNames']), item['dpCost'], B.fr(r['prudent']), B.fr(r['central']), B.fr(r['favorable']),
                     B.fr(s['primary']), B.fr(s['secondary']), B.fr(s['inventory']), B.fr(s['ruleAndStratagem']), B.fr(s['enhancement']),
                     B.fr(s['flexibility']), B.pct(item['interpretationCoverage']), B.pct(item['evidenceConfidence']), B.pct(item['conditionalityIndex'])])
    return B.standard_table(rows, small=True)


def expert_cover(title: str, subtitle: str, report: dict[str, Any]):
    story = B.cover(title, subtitle, report)
    story.insert(-1, B.rich('<b>Statut :</b> draft / preliminary. Le score central classe les options ; le scénario prudent départage les profils conditionnels. '
                            'Chaque bonus reste subordonné à ses préconditions, à sa cible, à son timing et à ses ressources.', 'Warning'))
    return story


def score_changes(item: dict[str, Any]) -> list[tuple[str, float]]:
    prudent, expert = item['prudentScores'], item['expertScores']
    return [(label, (expert[key]-prudent[key])*weight) for label, key, weight in [
        ('Principales', 'primary', .20), ('Secondaires', 'secondary', .25), ('Inventaire', 'inventory', .20),
        ('Règles', 'ruleAndStratagem', .20), ('Optimisations', 'enhancement', .10), ('Flexibilité', 'flexibility', .05)]]


def synthesis_story(report: dict[str, Any], records: dict[str, dict[str, Any]]):
    story = expert_cover('Synthèse experte conditionnelle', 'Détachements, chaînes tactiques et inventaire possédé', report)
    story += [B.p('Lecture en deux minutes', 'Heading1'),
              B.rich('<b>Prudent</b> = score structurel du premier rapport. <b>Central</b> = effets interprétés pondérés par preuve et disponibilité. '
                     '<b>Favorable</b> = potentiel si les conditions ordinaires se présentent. Couverture et confiance répondent à deux questions différentes.', 'Callout')]
    rows = [['Faction', 'Meilleur seul', 'Score central', 'Meilleure combinaison', 'Score central', 'Inférences', 'Options']]
    bars, heat_rows, heat_values = [], [], []
    for faction in report['factions']:
        singles = [x for x in faction['assessments'] if x['kind'] == 'single']
        combos = [x for x in faction['assessments'] if x['kind'] == 'combination']
        best_single, best_combo = singles[0], (combos or singles)[0]
        rows.append([faction['factionId'], ' + '.join(best_single['detachmentNames']), B.fr(best_single['expertScores']['total']),
                     ' + '.join(best_combo['detachmentNames']), B.fr(best_combo['expertScores']['total']), faction['inferenceSummary']['records'], len(faction['assessments'])])
        bars.append((faction['factionId'], best_combo['expertScores']['total']))
        heat_rows.append(faction['factionId']); heat_values.append([best_combo['scoreRange']['prudent'], best_combo['scoreRange']['central'], best_combo['scoreRange']['favorable'],
                                                                    best_combo['interpretationCoverage'], best_combo['evidenceConfidence'], best_combo['conditionalityIndex']])
    story += [B.standard_table(rows, small=True), Spacer(1, 4*mm),
              B.HorizontalBarChart('Meilleure option experte par faction', bars, 'Score central', 'points sur 100', f'{len(report["factions"])} factions, format 2 000 points / 3 DP', maximum=100),
              Spacer(1, 3*mm), B.HeatmapChart('Plage de score et qualité d’interprétation', heat_rows,
                 ['Prudent', 'Central', 'Favorable', 'Couverture', 'Confiance', 'Conditionnalité'], heat_values,
                 'Meilleure combinaison de chaque faction ; échelle commune 0-100')]
    story += [PageBreak(), B.p('Formation du score des options de tête', 'Heading1')]
    for faction in report['factions']:
        top = faction['assessments'][0]
        story += [WaterfallChart(f'{faction["factionId"]} — formation du score central', top['scoreRange']['prudent'], score_changes(top),
                                 'Meilleure option du classement expert'), Spacer(1, 4*mm)]
    story += [PageBreak(), B.p('Principales inférences structurantes', 'Heading1')]
    all_ids = [iid for f in report['factions'] for item in f['assessments'][:1] for iid in item['inferenceIds']]
    selected = sorted((records[i] for i in set(all_ids) if i in records), key=lambda x: abs(x['contribution']), reverse=True)[:24]
    rows = [['Faction', 'Source locale', 'Lecture experte', 'Capacités', 'Contribution', 'Disponibilité', 'Confiance']]
    for rec in selected:
        rows.append([rec['factionId'], rec['sourceTitle'], rec['statement'], ', '.join(rec['capabilities']), B.fr(rec['contribution']), rec['availabilityKind'], rec['confidence']])
    story += [B.standard_table(rows, small=True), B.p('Ces contributions ne sont pas des bonus automatiques : les préconditions et le contre-jeu figurent dans les annexes.', 'Warning')]
    story += [PageBreak(), B.p('Classement exhaustif consolidé', 'Heading1')]
    for faction in report['factions']:
        story += [B.p(faction['factionId'], 'Heading2'), score_table(faction['assessments'])]
    return story


def inference_rows(ids: list[str], records: dict[str, dict[str, Any]], limit: int = 12):
    selected = sorted((records[i] for i in ids if i in records), key=lambda x: abs(x['contribution']), reverse=True)[:limit]
    rows = [['Source / relation', 'Participants', 'Effet et capacités', 'Préconditions / timing', 'PC', 'Δ', 'Preuve', 'Disponibilité', 'Contre-jeu']]
    for rec in selected:
        rows.append([f"{rec['sourceTitle']} ({rec['relationKind']})", ', '.join(p['name'] for p in rec['participants']),
                     f"{rec['statement']} [{', '.join(rec['capabilities'])}]", '; '.join(rec['prerequisites']) or 'Aucune condition explicite extraite',
                     '-' if rec['cpCost'] is None else rec['cpCost'], B.fr(rec['contribution']), rec['evidenceKind'], rec['availabilityKind'], rec['counterplay']])
    return B.standard_table(rows, small=True)


def core_table(item: dict[str, Any]):
    rows = [['Unité possédée', 'Détachement affecté', 'Pts', 'Figurines physiques', 'Réel / proxy', 'Capacités', 'Mots-clés armes', 'Contribution']]
    for unit in item.get('core') or []:
        rows.append([unit['name'], unit['assignedDetachmentName'], unit['points'], ', '.join(map(str, unit['figureIds'])),
                     f"{unit['realCount']} / {unit['proxyCount']}", ', '.join(unit['capabilities']), ', '.join(unit['weaponKeywords']), B.fr(unit['inferenceContribution'])])
    return B.standard_table(rows, small=True)


def unit_rule_matrix(item: dict[str, Any], records: dict[str, dict[str, Any]]):
    core = item.get('core') or []
    recs = sorted((records[i] for i in item['inferenceIds'] if i in records), key=lambda r: abs(r['contribution']), reverse=True)[:8]
    columns = [r['sourceTitle'] for r in recs]
    values = [[min(100, 100*abs(r['contribution'])/9) if any(p['type']=='unit' and p['id']==u['unitId'] for p in r['participants']) else 0 for r in recs] for u in core]
    if not core or not recs:
        return B.p('Matrice indisponible : aucun couple unité–règle interprété.', 'Small')
    return B.HeatmapChart('Matrice unités × règles interprétées', [u['name'] for u in core], columns, values,
                          'Noyau possédé ; affinité normalisée 0-100 selon contribution explicite', width=250*mm, height=78*mm)


def unit_mission_matrices(item: dict[str, Any], faction: dict[str, Any]):
    core = item.get('core') or []
    owned = {unit['id']: unit for unit in faction['ownedUnits']}
    charts = []
    for index, missions in enumerate((item['secondaryMissionScores'][:9], item['secondaryMissionScores'][9:])):
        values = []
        for core_unit in core:
            capabilities = owned.get(core_unit['unitId'], {}).get('capabilities', {})
            row = []
            for mission in missions:
                requirements = mission.get('capabilityRequirements') or []
                weights = [1 if requirement.get('importance') == 'core' else .6 for requirement in requirements]
                numerator = sum(capabilities.get(requirement.get('capability'), 0) * weight for requirement, weight in zip(requirements, weights))
                row.append(numerator / sum(weights) if weights else 0)
            values.append(row)
        if core and missions:
            charts.append(B.HeatmapChart(f'Matrice unités × missions secondaires — bloc {index+1}', [unit['name'] for unit in core],
                                         [mission['title'] for mission in missions], values,
                                         'Noyau possédé ; adéquation analytique 0-100 aux capacités requises', width=250*mm, height=78*mm))
    return charts


def mission_charts(item: dict[str, Any]):
    primary = item['primaryMissionScores']
    secondary = item['secondaryMissionScores']
    result = [B.HeatmapChart('Missions principales ouvertes', ['Score expert'], [m['title'] for m in primary], [[m['score'] for m in primary]],
                             f'{len(primary)} missions ouvertes par les Force Dispositions', width=250*mm, height=58*mm)]
    for index, chunk in enumerate((secondary[:9], secondary[9:])):
        result.append(B.HeatmapChart(f'Missions secondaires tactiques — bloc {index+1}', ['Score expert'], [m['title'] for m in chunk], [[m['score'] for m in chunk]],
                                     f'{len(chunk)} missions ; couverture totale attendue 18', width=250*mm, height=58*mm))
    return result


def featured_story(item: dict[str, Any], faction: dict[str, Any], records: dict[str, dict[str, Any]]):
    title = ' + '.join(item['detachmentNames'])
    story = [B.p(title, 'Heading2'),
             B.rich(f"<b>Rang {item['rank']}</b> — {item['dpCost']} DP — prudent {B.fr(item['scoreRange']['prudent'])}, central {B.fr(item['scoreRange']['central'])}, favorable {B.fr(item['scoreRange']['favorable'])}. "
                    f"Couverture {B.pct(item['interpretationCoverage'])}, confiance des preuves {B.pct(item['evidenceConfidence'])}, part inférée {B.pct(item['inferenceShare'])}, conditionnalité {B.pct(item['conditionalityIndex'])}.", 'Callout'),
             WaterfallChart('Formation du score central', item['scoreRange']['prudent'], score_changes(item), title),
             B.p('Noyau physique sans double emploi', 'Heading3'), core_table(item)]
    curves = [(u['name'], u['distanceCurve']) for u in item.get('core') or []]
    if curves:
        story += [B.DistanceLineChart('Projection offensive aux six paliers de distance', curves, 'Noyau possédé ; meilleure option contre Infanterie par palier', width=250*mm)]
    story += [unit_rule_matrix(item, records)] + unit_mission_matrices(item, faction) + mission_charts(item)
    story += [B.p('Chaînes de synergie et conditions', 'Heading3'), inference_rows(item['inferenceIds'], records),
              B.p('Effets non supportés', 'Heading3'), B.p('; '.join(item['unsupportedEffects']) or 'Aucun effet brut non classé pour cette option.', 'Warning')]
    alternatives = item.get('alternatives') or []
    if alternatives:
        story += [B.p('Alternatives possédées', 'Heading3'), B.standard_table([['Unité', 'Points', 'Motif']] + [[a['name'], a['points'], a['reason']] for a in alternatives], small=True)]
    return story


def faction_story(report: dict[str, Any], faction: dict[str, Any], records: dict[str, dict[str, Any]]):
    story = expert_cover(f"Rapport expert — {faction['factionId']}", 'Inférences conditionnelles, missions et allocation physique', report)
    real = sum(len(u.get('realFigureIds') or []) for u in faction['ownedUnits']); proxies = sum(len(u.get('proxyFigureIds') or []) for u in faction['ownedUnits'])
    story += [B.p('Portrait et classement', 'Heading1'),
              B.rich(f"<b>{len(faction['ownedUnits'])} unités accessibles</b>, {real} figurines réelles et {proxies} proxies déclarés. "
                     f"{faction['inferenceSummary']['records']} inférences : {faction['inferenceSummary']['structured']} structurées, "
                     f"{faction['inferenceSummary']['direct']} directes et {faction['inferenceSummary']['chained']} chaînes tactiques.", 'Callout'),
              score_table(faction['assessments'], 15), PageBreak()]
    amap = assessment_map(faction)
    story += [B.p('Trois options approfondies', 'Heading1')]
    for index, item_id in enumerate(faction['featuredIds']):
        story += featured_story(amap[item_id], faction, records)
        if index < len(faction['featuredIds'])-1:
            story.append(PageBreak())
    story += [PageBreak(), B.p('Fiches compactes des détachements', 'Heading1')]
    for detail in faction['detachmentDetails']:
        assessment = amap.get(detail.get('expertAssessmentId'))
        story += [B.p(detail['name'], 'Heading2')]
        if assessment:
            story += [B.rich(f"<b>Score central {B.fr(assessment['expertScores']['total'])}</b> — {assessment['dpCost']} DP — Force Dispositions : {B.esc(', '.join(assessment['forceDispositions']))}. "
                             f"Couverture {B.pct(assessment['interpretationCoverage'])}, confiance {B.pct(assessment['evidenceConfidence'])}.", 'Callout')]
        story += [inference_rows(detail['inferenceIds'], records, 8)]
        if detail['unsupportedEffects']:
            story += [B.p('Non interprété : ' + '; '.join(detail['unsupportedEffects']), 'Warning')]
    story += [PageBreak(), B.p('Classement exhaustif — détachements seuls', 'Heading1'), score_table([x for x in faction['assessments'] if x['kind']=='single']),
              PageBreak(), B.p('Classement exhaustif — combinaisons légales', 'Heading1'), score_table([x for x in faction['assessments'] if x['kind']=='combination'])]
    story += [PageBreak(), B.p('Sensibilité au format', 'Heading1')]
    for entry in faction['sensitivity']:
        story += [B.p(f"{entry['battleSize']} points — {entry['dpBudget']} DP — {entry['evaluated']} options évaluées", 'Heading2'), score_table(entry['top'])]
    return story


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--input', required=True); parser.add_argument('--inferences', required=True)
    parser.add_argument('--output', required=True); parser.add_argument('--public-root', required=True)
    args = parser.parse_args()
    report = json.loads(Path(args.input).read_text(encoding='utf-8'))
    inference_doc = json.loads(Path(args.inferences).read_text(encoding='utf-8'))
    records = inference_map(inference_doc); output = Path(args.output); output.mkdir(parents=True, exist_ok=True)
    B.CHART_AUDIT.clear()
    B.build_pdf(output/'00-synthese-experte.pdf', 'Synthèse experte conditionnelle', report['snapshotDate'], synthesis_story(report, records), A4)
    filenames = {
        'Space Marines': '01-space-marines-expert.pdf',
        'Salamanders': '02-salamanders-expert.pdf',
        'Dark Angels': '03-dark-angels-expert.pdf',
        'Blood Angels': '04-blood-angels-expert.pdf',
    }
    for faction in report['factions']:
        B.build_pdf(output/filenames[faction['factionId']], f"Rapport expert — {faction['factionId']}", report['snapshotDate'], faction_story(report, faction, records), landscape(A4))
    B.validate_chart_audit(B.CHART_AUDIT)
    (output/'chart-audit.json').write_text(json.dumps({'schemaVersion': 'warforge-expert-chart-audit/v1', 'charts': B.CHART_AUDIT}, ensure_ascii=False, indent=2)+'\n', encoding='utf-8')
    print(f'{len(B.CHART_AUDIT)} graphiques audités et {len(report["factions"]) + 1} PDF experts générés.')


if __name__ == '__main__':
    main()
