"""Generate the public Warforge rules document from the supplied French Core Rules PDF.

This is a deliberate, reviewable import step: it does not run in normal builds.
It requires PyPDF2 and is run only when the source PDF changes.
"""

from __future__ import annotations

import json
import re
import sys
from pathlib import Path

from PyPDF2 import PdfReader


SOURCE_FILENAME = 'fre_01-06_warhammer40k_new40k_core_rules-ooyuallyp9-s4aczdfbm2_copie.pdf'
SECTIONS = [
    ('introduction', 'Introduction', None, 1, 5),
    ('concepts-de-base', 'Concepts de base', '01', 6, 9),
    ('fiches-techniques', 'Fiches techniques', '02', 10, 11),
    ('mouvement', 'Mouvement', '03', 12, 15),
    ('effectuer-des-attaques', 'Effectuer des attaques', '04', 16, 17),
    ('sequence-d-attaque', 'Séquence d’attaque', '05', 18, 23),
    ('autres-concepts', 'Autres concepts', '06', 24, 25),
    ('round-de-bataille', 'Le round de bataille', '07', 26, 29),
    ('phase-de-commandement', 'Phase de Commandement', '08', 30, 31),
    ('phase-de-mouvement', 'Phase de Mouvement', '09', 32, 33),
    ('phase-de-tir', 'Phase de Tir', '10', 34, 35),
    ('phase-de-charge', 'Phase de Charge', '11', 36, 37),
    ('phase-de-combat', 'Phase de Combat', '12', 38, 43),
    ('terrain', 'Terrain', '13', 44, 51),
    ('objectifs', 'Objectifs', '14', 52, 53),
    ('stratagemes', 'Stratagèmes', '15', 54, 57),
    ('actions', 'Actions', '16', 58, 59),
    ('monstres-et-vehicules', 'Monstres et Véhicules', '17', 60, 63),
    ('transports', 'Transports', '18', 64, 65),
    ('unites-attachees', 'Unités attachées', '19', 66, 67),
    ('reserves-strategiques', 'Réserves stratégiques', '20', 68, 69),
    ('vol-et-elan', 'Vol et Élan', '21', 70, 71),
    ('autres-regles-et-aptitudes', 'Autres règles et aptitudes', '22', 72, 73),
    ('aerodynes', 'Aérodynes', '23', 74, 75),
    ('aptitudes-de-base', 'Aptitudes de base', '24', 76, 85),
    ('appendices', 'Appendices des règles', None, 86, 87),
    ('index', 'Index des règles de base', None, 88, 88),
]


def clean_text(value: str) -> str:
    value = value.replace('\u00ad', '')
    value = value.replace('\ufffd', '')
    value = re.sub(r'[\x00-\x08\x0b\x0c\x0e-\x1f]', '', value)
    value = re.sub(r' *\n *', '\n', value)
    value = re.sub(r'\n{3,}', '\n\n', value)
    return value.strip()


def chapter_for_page(page: int) -> str:
    if page <= 5:
        return 'introduction'
    if page <= 25:
        return 'regles-elementaires'
    if page <= 43:
        return 'round-de-bataille'
    if page <= 59:
        return 'champs-de-bataille-et-tactiques'
    if page <= 75:
        return 'regles-avancees'
    return 'references'


def supplemental_blocks(printed_page: int) -> list[dict[str, object]]:
    """Recreate source visuals whose rule information is not easy to scan as plain text."""
    if printed_page == 53:
        return [{
            'kind': 'diagram',
            'title': 'Exemple de niveau de contrôle',
            'description': 'Exemple de la page source : le joueur Rouge a un niveau de contrôle de 6 contre 5 pour le joueur Bleu et contrôle donc l’objectif.',
            'labels': ['Bleu · CO 5', 'Objectif', 'Rouge · CO 6'],
        }]
    if printed_page == 86:
        return [{
            'kind': 'table',
            'title': 'Effectif initial et demi-effectif',
            'columns': ['État', 'Unité d’une figurine', 'Unité de deux figurines ou plus'],
            'rows': [
                ['En dessous de l’effectif initial', 'PV restants inférieurs à la caractéristique de PV.', 'Figurines restantes inférieures à l’effectif initial.'],
                ['À demi-effectif', 'PV restants égaux à la moitié de la caractéristique de PV.', 'Figurines restantes égales à la moitié de l’effectif initial.'],
                ['En dessous du demi-effectif', 'PV restants inférieurs à la moitié de la caractéristique de PV.', 'Figurines restantes inférieures à la moitié de l’effectif initial.'],
            ],
        }]
    return []


CHAPTERS = {
    'introduction': ('Introduction', 1, 5),
    'regles-elementaires': ('Règles élémentaires', 6, 25),
    'round-de-bataille': ('Le round de bataille', 26, 43),
    'champs-de-bataille-et-tactiques': ('Champs de bataille et tactiques', 44, 59),
    'regles-avancees': ('Règles avancées', 60, 75),
    'references': ('Références', 76, 88),
}


def main() -> int:
    repository_root = Path(__file__).resolve().parents[2]
    source_path = repository_root / 'references' / 'warhammer-40k' / 'rules' / 'core' / SOURCE_FILENAME
    output_path = repository_root / 'warforge-pwa' / 'data' / 'rules' / 'core-rules-fr.json'
    if not source_path.is_file():
        print(f'Source PDF missing: {source_path}', file=sys.stderr)
        return 1

    reader = PdfReader(str(source_path))
    if len(reader.pages) != 88:
        print(f'Expected 88 source pages, received {len(reader.pages)}.', file=sys.stderr)
        return 1

    sections_by_chapter: dict[str, list[dict[str, object]]] = {key: [] for key in CHAPTERS}
    for section_id, title, reference, first_page, last_page in SECTIONS:
        pages = []
        for printed_page in range(first_page, last_page + 1):
            extracted = clean_text(reader.pages[printed_page - 1].extract_text() or '')
            pages.append({
                'id': f'p-{printed_page}',
                'printedPage': printed_page,
                'blocks': [{'kind': 'text', 'text': extracted or 'Page source sans texte extractible.'}] + supplemental_blocks(printed_page),
            })
        sections_by_chapter[chapter_for_page(first_page)].append({
            'id': section_id,
            'reference': reference,
            'title': title,
            'sourcePages': [first_page, last_page],
            'pages': pages,
        })

    document = {
        'schemaVersion': 'warforge-rules/v1',
        'title': 'Règles de base Warhammer 40,000',
        'source': {
            'title': 'Warhammer 40,000 — Règles de base',
            'language': 'fr',
            'filename': SOURCE_FILENAME,
            'pdfPageCount': 88,
            'modifiedAt': '5 juin 2026',
            'version': None,
        },
        'chapters': [
            {
                'id': chapter_id,
                'title': title,
                'sourcePages': [first_page, last_page],
                'sections': sections_by_chapter[chapter_id],
            }
            for chapter_id, (title, first_page, last_page) in CHAPTERS.items()
        ],
        'missionFramework': {
            'packName': 'Pile de Missions Sceau Capitulaire 2026-27',
            'language': 'fr',
            'status': 'public-summary',
            'sources': [
                {
                    'label': 'Comment votre armée affecte votre mission',
                    'url': 'https://www.warhammer-community.com/fr-fr/articles/oefzq9fg/new40k-comment-votre-armee-affecte-votre-mission/',
                },
                {
                    'label': 'Présentation de la Pile de Missions Sceau Capitulaire',
                    'url': 'https://www.warhammer-community.com/fr-fr/articles/adciuo3f/precommandes-du-samedi-regles-cartes-et-plus-encore-pour-le-new40k/',
                },
                {
                    'label': 'Mise à jour Warhammer 40,000 de juillet',
                    'url': 'https://www.warhammer-community.com/fr-fr/articles/rgqanids/mise-a-jour-warhammer-40000-de-juillet-tout-ce-quil-y-a-a-savoir/',
                },
            ],
            'primary': [
                'La carte de Mission Principale indique quand et comment marquer les PdV.',
                'Maximum : 45 PdV par partie et 15 PdV par round de bataille.',
                'La Disposition des Forces ne remplace pas une carte de Mission Principale.',
            ],
            'secondary': [
                'Chaque joueur choisit des missions fixes ou des missions tactiques.',
                'En tactique, piochez deux cartes à chaque tour et conservez celles qui ne sont pas accomplies.',
                'Maximum : 45 PdV par partie et 15 PdV par round de bataille.',
            ],
            'unavailableNotice': 'Les textes et barèmes individuels des cartes de Mission Principale et Secondaire ne sont pas publiés intégralement dans les ressources officielles publiques. Ils seront ajoutés après fourniture d’une source officielle par l’utilisateur.',
        },
    }
    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text(json.dumps(document, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    print(f'Generated {output_path.relative_to(repository_root)} from {source_path.name}.')
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
