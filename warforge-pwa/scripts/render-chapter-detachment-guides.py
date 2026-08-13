#!/usr/bin/env python3
"""Generate the Dark Angels and Blood Angels pedagogical detachment guides."""

from __future__ import annotations

import argparse
import csv
import gzip
import hashlib
import html
import json
import math
import re
from pathlib import Path
from typing import Any

from pypdf import PdfReader
from reportlab.lib import colors
from reportlab.lib.enums import TA_LEFT
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.platypus import (
    BaseDocTemplate, Flowable, Frame, Image, KeepTogether, LongTable, PageBreak,
    PageTemplate, Paragraph, Spacer, TableStyle,
)

REPORT_SCHEMA = "warforge-detachment-tactical-guide/v1.0.0"
SNAPSHOT_DATE = "2026-08-11"
CATALOG_VERSION = "1.2.13.0"
NAVY = colors.HexColor("#142A38")
INK = colors.HexColor("#25343B")
MUTED = colors.HexColor("#65757C")
GOLD = colors.HexColor("#C59432")
TEAL = colors.HexColor("#267D8D")
GREEN = colors.HexColor("#407C5A")
ORANGE = colors.HexColor("#C76C2B")
RED = colors.HexColor("#A84E48")
PALE = colors.HexColor("#EAF1F2")
GRID = colors.HexColor("#D7E0E2")
WHITE = colors.white


def register_fonts() -> tuple[str, str]:
    for regular, bold in [
        (Path("C:/Windows/Fonts/arial.ttf"), Path("C:/Windows/Fonts/arialbd.ttf")),
        (Path("/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"), Path("/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf")),
    ]:
        if regular.exists() and bold.exists():
            pdfmetrics.registerFont(TTFont("WarforgeSans", str(regular)))
            pdfmetrics.registerFont(TTFont("WarforgeSansBold", str(bold)))
            return "WarforgeSans", "WarforgeSansBold"
    return "Helvetica", "Helvetica-Bold"


FONT, FONT_BOLD = register_fonts()
BASE = getSampleStyleSheet()
STYLES = {
    "Title": ParagraphStyle("Title", parent=BASE["Title"], fontName=FONT_BOLD, fontSize=24, leading=29, textColor=NAVY, alignment=TA_LEFT, spaceAfter=8),
    "Subtitle": ParagraphStyle("Subtitle", parent=BASE["Normal"], fontName=FONT, fontSize=11, leading=15, textColor=MUTED, spaceAfter=10),
    "H1": ParagraphStyle("H1", parent=BASE["Heading1"], fontName=FONT_BOLD, fontSize=16, leading=20, textColor=NAVY, spaceBefore=8, spaceAfter=7),
    "H2": ParagraphStyle("H2", parent=BASE["Heading2"], fontName=FONT_BOLD, fontSize=11.5, leading=14, textColor=TEAL, spaceBefore=7, spaceAfter=5),
    "H3": ParagraphStyle("H3", parent=BASE["Heading3"], fontName=FONT_BOLD, fontSize=9.5, leading=12, textColor=INK, spaceBefore=5, spaceAfter=4),
    "Body": ParagraphStyle("Body", parent=BASE["BodyText"], fontName=FONT, fontSize=8.25, leading=11.45, textColor=INK, spaceAfter=5),
    "Lead": ParagraphStyle("Lead", parent=BASE["BodyText"], fontName=FONT, fontSize=9.2, leading=13.3, textColor=INK, spaceAfter=7),
    "Small": ParagraphStyle("Small", parent=BASE["BodyText"], fontName=FONT, fontSize=6.7, leading=8.5, textColor=MUTED),
    "Table": ParagraphStyle("Table", parent=BASE["BodyText"], fontName=FONT, fontSize=6.2, leading=7.7, textColor=INK),
    "TableHead": ParagraphStyle("TableHead", parent=BASE["BodyText"], fontName=FONT_BOLD, fontSize=6.2, leading=7.6, textColor=WHITE),
    "Callout": ParagraphStyle("Callout", parent=BASE["BodyText"], fontName=FONT, fontSize=8.35, leading=11.6, textColor=NAVY, backColor=PALE, borderColor=TEAL, borderWidth=.7, borderPadding=7, spaceAfter=8),
    "Warning": ParagraphStyle("Warning", parent=BASE["BodyText"], fontName=FONT, fontSize=7.9, leading=10.7, textColor=INK, backColor=colors.HexColor("#FFF0DD"), borderColor=ORANGE, borderWidth=.7, borderPadding=6, spaceAfter=7),
    "Fact": ParagraphStyle("Fact", parent=BASE["BodyText"], fontName=FONT, fontSize=7.9, leading=10.7, textColor=INK, backColor=colors.HexColor("#EAF3ED"), borderColor=GREEN, borderWidth=.7, borderPadding=6, spaceAfter=7),
    "Cover": ParagraphStyle("Cover", parent=BASE["BodyText"], fontName=FONT_BOLD, fontSize=8, leading=11, textColor=TEAL),
}


def clean(value: Any) -> str:
    text = re.sub(r"<[^>]+>", "", str("" if value is None else value))
    return text.replace("\u2011", "-").replace("\u2013", "-").replace("\u2014", "-").replace("\t", " ").strip()


def esc(value: Any) -> str:
    return html.escape(clean(value))


def p(value: Any, style: str = "Body") -> Paragraph:
    return Paragraph(esc(value), STYLES[style])


def rich(value: str, style: str = "Body") -> Paragraph:
    return Paragraph(value, STYLES[style])


def bullets(items: list[str]) -> Paragraph:
    return rich("<br/>".join(f"&#8226; {esc(item)}" for item in items))


def sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


COMMON_SCENARIOS = {
    "PRIORITY ASSETS": [
        ("Secure Asset", "Take and Hold", "gdm-2026-primary-secure-asset-priority-assets-vs-take-and-hold"),
        ("Vital Link", "Purge the Foe", "gdm-2026-primary-vital-link-priority-assets-vs-purge-the-foe"),
        ("Extract Relic", "Disruption", "gdm-2026-primary-extract-relic-priority-assets-vs-disruption"),
        ("Vanguard Operation", "Reconnaissance", "gdm-2026-primary-vanguard-operation-priority-assets-vs-reconnaissance"),
        ("Sabotage", "Priority Assets", "gdm-2026-primary-sabotage-priority-assets-vs-priority-assets"),
    ],
    "TAKE AND HOLD": [
        ("Battlefield Dominance", "Take and Hold", "gdm-2026-primary-battlefield-dominance-take-and-hold-vs-take-and-hold"),
        ("Immovable Object", "Purge the Foe", "gdm-2026-primary-immovable-object-take-and-hold-vs-purge-the-foe"),
        ("Determined Acquisition", "Disruption", "gdm-2026-primary-determined-acquisition-take-and-hold-vs-disruption"),
        ("Purge and Secure", "Reconnaissance", "gdm-2026-primary-purge-and-secure-take-and-hold-vs-reconnaissance"),
        ("Inescapable Dominion", "Priority Assets", "gdm-2026-primary-inescapable-dominion-take-and-hold-vs-priority-assets"),
    ],
}


CONFIGS: dict[str, dict[str, Any]] = {
    "dark-angels": {
        "slug": "inner-circle-task-force",
        "faction": "Dark Angels",
        "book": "Dark Angels",
        "detachmentIndex": 1,
        "detachmentId": "book-dark-angels:detachment:1",
        "detachmentName": "INNER CIRCLE TASK FORCE",
        "guideVersion": "inner-circle-task-force-guide/v1.0.0",
        "forceDisposition": "PRIORITY ASSETS",
        "cover": "deathwing-knights",
        "tagline": "Choisir l'objectif jure, superposer les couches Deathwing et garder une bascule mobile pour le dernier round.",
        "identity": "Inner Circle Task Force n'est pas une simple liste de Terminators. Son vrai moteur consiste a annoncer, au debut de la phase de Mouvement, l'objectif sur lequel la Deathwing doit convertir sa qualite de combat. Defensive Footing protege un acquis; Aggressive Push designe les positions encore adverses. Le detachement devient fort lorsque cette declaration organise tout le tour : entree de reserve, nettoyage, charge, consolidation et releve.",
        "main": [
            ("azrael", "book-dark-angels:unit:0", 0, None, [23], "inventaire"),
            ("belial", "book-dark-angels:unit:1", 0, None, [38], "inventaire - proxy"),
            ("captain-term", "book-dark-angels:unit:27", 0, 3, [39], "inventaire"),
            ("knights-a", "book-dark-angels:unit:7", 0, None, list(range(165, 170)), "inventaire - proxy"),
            ("knights-b", "book-dark-angels:unit:7", 0, None, list(range(170, 175)), "inventaire - proxy"),
            ("companions", "book-dark-angels:unit:15", 1, None, [], "hors inventaire autorise"),
            ("terminators", "book-dark-angels:unit:35", 0, None, list(range(175, 180)), "inventaire"),
            ("hellblasters", "book-dark-angels:unit:75", 1, None, list(range(43, 53)), "inventaire"),
            ("jump-intercessors", "book-dark-angels:unit:97", 0, None, list(range(140, 145)), "inventaire"),
            ("inceptors", "book-dark-angels:unit:74", 0, None, [134, 135, 136], "inventaire"),
            ("scouts-a", "book-dark-angels:unit:65", 0, None, list(range(180, 185)), "inventaire"),
            ("scouts-b", "book-dark-angels:unit:65", 0, None, list(range(185, 190)), "inventaire"),
            ("lancer", "book-dark-angels:unit:85", 0, None, [12], "inventaire"),
            ("ballistus", "book-dark-angels:unit:39", 0, None, [4], "inventaire"),
        ],
        "strictReplace": {
            "remove": ["companions"],
            "add": [("bladeguard", "book-dark-angels:unit:32", 1, None, [18, 19, 20, 21, 83, 84], "inventaire")],
        },
        "exceptions": ["6 Inner Circle Companions : exception structurante, car ils donnent a Azrael une unite Deathwing mobile et dense sans consommer une seconde brique Terminator."],
        "strictLoss": "La variante stricte remplace exactement les six Inner Circle Companions par six Bladeguard Veterans. Elle conserve 2 000 points, mais Azrael perd un accompagnement naturellement Deathwing et la liste devient moins fluide autour de l'objectif jure.",
        "groups": [
            ("Ancre de l'Inner Circle", 300, "Azrael et 6 Inner Circle Companions", "Tenir l'objectif jure, apporter l'OC et organiser la releve."),
            ("Marteau de Belial", 315, "Belial et 5 Deathwing Knights", "Recevoir ou lancer l'echange decisif sur l'objectif jure."),
            ("Reserve de teleportation", 515, "Captain in Terminator Armour, 5 Knights et 5 Terminators", "Menacer une entree a 6 pouces sans confondre arrivee et charge autorisee."),
            ("Feux de jugement", 530, "10 Hellblasters, Gladiator Lancer et Ballistus", "Nettoyer les ecrans, casser une cible robuste et ouvrir le chemin Deathwing."),
            ("Bascule mobile", 210, "5 Jump Intercessors et 3 Inceptors", "Secondaires, flanc faible, reprise tardive et acces aux cibles."),
            ("ecrans et operations", 130, "2 x 5 Scouts", "Information, ecran, Action et reserve du cinquieme round."),
        ],
        "curveUnits": [("book-dark-angels:unit:7", "Deathwing Knights"), ("book-dark-angels:unit:75", "Hellblasters"), ("book-dark-angels:unit:85", "Gladiator Lancer")],
        "capOwners": {
            "action-capacity": "Scouts; Jump Intercessors; Inceptors", "concentrated-damage": "Knights; Lancer; Ballistus",
            "distributed-damage": "Hellblasters; Terminators; Inceptors", "durable-presence": "Knights; Terminators; Inner Circle Companions",
            "independent-units": "Scouts; Inceptors; Lancer", "objective-control": "Azrael/Companions; Knights; Terminators",
            "screening": "Scouts; Jump Intercessors; briques Deathwing", "target-access": "Deep Strike; Inceptors; Lancer",
            "territorial-projection": "Inceptors; Jump Intercessors; Relic Teleportarium", "unit-redundancy": "2 Knights; 2 Scouts; 3 sources de tir lourd",
        },
        "rangeDoctrine": [
            ("Engagement", "Melee et Pistol seulement selon l'eligibilite", "La Deathwing convertit l'objectif jure; les pistolets restent un appoint."),
            ("0-9 pouces", "Charge, Pistol, Melta a demi-portee", "Zone de decision : proteger la consolidation et la releve avant de chercher le dommage maximal."),
            ("10-12 pouces", "Plasma, Torrent eventuel, arrivee a plus de 6 pouces", "Relic Teleportarium facilite la position, mais interdit la charge a l'unite ciblee ce tour."),
            ("13-18 pouces", "Rapid Fire selon la demi-portee de l'arme", "Les Hellblasters et Terminators preparent l'objectif; verifier la portee propre de chaque profil."),
            ("19-24 pouces", "Plasma et bolters longue portee", "Nettoyer sans exposer simultanement les trois couches Deathwing."),
            ("25-36+ pouces", "Lancer et Ballistus", "Ouvrir une lane ou retirer le transport qui livrerait le contre-jeu adverse."),
        ],
        "pcDoctrine": "Le budget de PC est d'abord defensif. Armour of Contempt et Unmatched Fortitude protègent la couche exposee; Martial Mastery et Wrath of the Lion ne sont prioritaires que si l'echange decide réellement l'objectif jure. Relic Teleportarium est un outil de positionnement, pas une charge a 6 pouces.",
        "alternatives": [
            ("Plus d'Inner Circle", "Lion El'Jonson ou une seconde unite de Companions", "Fortifie le theme mais concentre davantage les points dans peu d'activations."),
            ("Inventaire strict", "6 Bladeguard Veterans", "Remplacement exact des Companions; moins de synergie Deathwing."),
            ("Projection", "5 Vanguard Veterans ou 3 Outriders", "Plus de largeur, moins de resistance sur l'objectif jure."),
            ("Transport", "Land Raider Redeemer", "Livre une brique et cree une zone de refus, mais oblige a retirer 250 points ailleurs."),
        ],
    },
    "blood-angels": {
        "slug": "liberator-assault-group",
        "faction": "Blood Angels",
        "book": "Blood Angels",
        "detachmentIndex": 0,
        "detachmentId": "book-blood-angels:detachment:0",
        "detachmentName": "LIBERATOR ASSAULT GROUP",
        "guideVersion": "liberator-assault-group-guide/v1.0.0",
        "forceDisposition": "TAKE AND HOLD",
        "cover": "blood-angels-sanguinary-guard",
        "tagline": "Construire la majorite avant de charger, lancer les vagues dans le bon ordre et conserver une unite rapide pour la derniere bascule.",
        "identity": "Liberator Assault Group recompense la charge, mais ce n'est pas une permission de charger tout ce qui est accessible. Red Thirst ajoute Attaques et Force au moment ou une unite ayant charge est selectionnee pour combattre. La liste doit donc creer une suite de charges utiles : une premiere vague ouvre l'objectif, une seconde tient la reponse et une troisieme demeure disponible pour le score ou la contre-attaque.",
        "main": [
            ("dante", "book-blood-angels:unit:3", 0, None, [25], "inventaire - proxy"),
            ("sanguinary-guard", "book-blood-angels:unit:9", 0, None, [], "hors inventaire autorise"),
            ("astorath", "book-blood-angels:unit:0", 0, None, [33], "inventaire - proxy"),
            ("death-company", "book-blood-angels:unit:7", 1, None, list(range(155, 165)), "inventaire - proxy"),
            ("jump-captain", "book-blood-angels:unit:19", 0, 0, [], "hors inventaire autorise"),
            ("vanguard", "book-blood-angels:unit:44", 1, None, list(range(145, 155)), "inventaire"),
            ("jump-intercessors", "book-blood-angels:unit:96", 0, None, list(range(140, 145)), "inventaire"),
            ("inceptors", "book-blood-angels:unit:60", 0, None, [134, 135, 136], "inventaire"),
            ("scouts-a", "book-blood-angels:unit:39", 0, None, list(range(180, 185)), "inventaire"),
            ("scouts-b", "book-blood-angels:unit:39", 0, None, list(range(185, 190)), "inventaire"),
            ("lancer", "book-blood-angels:unit:75", 0, None, [12], "inventaire"),
            ("ballistus-a", "book-blood-angels:unit:56", 0, None, [4], "inventaire"),
            ("ballistus-b", "book-blood-angels:unit:56", 0, None, [5], "inventaire - proxy"),
            ("intercessors", "book-blood-angels:unit:31", 0, None, list(range(43, 48)), "inventaire"),
            ("hellblasters", "book-blood-angels:unit:65", 1, None, list(range(48, 58)), "inventaire"),
        ],
        "strictReplace": {
            "remove": ["sanguinary-guard", "jump-captain"],
            "add": [
                ("lieutenant", "book-blood-angels:unit:22", 0, 0, [26], "inventaire - proxy"),
                ("bladeguard", "book-blood-angels:unit:43", 0, None, [18, 19, 20], "inventaire"),
                ("reivers", "book-blood-angels:unit:47", 0, None, [68, 69, 70, 71, 72], "inventaire - proxy"),
            ],
        },
        "exceptions": [
            "3 Sanguinary Guard : unite-cle pour donner a Dante une escorte de frappe et un paquet de projection coherent.",
            "Captain with Jump Pack : second cadre aerien, ajoute pour que les Vanguard aient leur propre Leader sans reutiliser la figurine physique de Dante.",
        ],
        "strictLoss": "La variante stricte remplace exactement la Sanguinary Guard et le Captain with Jump Pack par un Lieutenant avec Speed of the Primarch, trois Bladeguard et cinq Reivers. Elle conserve 2 000 points, mais perd une vague de charge aerienne et transforme 230 points de projection en presence de milieu et outil de mission.",
        "groups": [
            ("Garde du ciel", 250, "Dante et 3 Sanguinary Guard", "Choisir la cible structurante et garder une sortie apres l'echange."),
            ("Compagnie de la mort", 315, "Astorath et 10 Death Company Marines with Jump Packs", "Premiere vague de rupture ou menace qui force l'ecran adverse."),
            ("Vague Liberator", 325, "Captain with Jump Pack, Speed of the Primarch et 10 Vanguard Veterans", "Menace de contre-charge et paquet qui ne doit pas etre depense avant la bascule centrale."),
            ("Mission rapide", 350, "5 Jump Intercessors, 3 Inceptors et 2 x 5 Scouts", "Actions, largeur, ecrans, secondaires et reserve du cinquieme round."),
            ("Couverture antichar", 460, "Gladiator Lancer et 2 Ballistus", "Ouvrir les transports, casser les briques qui empechent les charges utiles."),
            ("Socle flexible", 300, "5 Intercessors et 10 Hellblasters", "Home, tir intermediaire et unite qui n'a pas besoin de charger pour contribuer."),
        ],
        "curveUnits": [("book-blood-angels:unit:7", "Death Company Jump"), ("book-blood-angels:unit:44", "Vanguard Veterans"), ("book-blood-angels:unit:75", "Gladiator Lancer")],
        "capOwners": {
            "action-capacity": "Scouts; Jump Intercessors; Intercessors", "concentrated-damage": "Death Company; Sanguinary Guard; Lancer/Ballistus",
            "distributed-damage": "Vanguard; Hellblasters; Inceptors", "durable-presence": "Vanguard avec Speed; Intercessors; dreadnoughts",
            "independent-units": "Scouts; Inceptors; Lancer", "objective-control": "Intercessors; Scouts; charges de bascule",
            "screening": "Scouts; Jump Intercessors; Intercessors", "target-access": "Fly/Jump Pack; Inceptors; tirs longs",
            "territorial-projection": "Trois vagues Jump; Inceptors; Scouts", "unit-redundancy": "3 vagues rapides; 2 Scouts; 3 plateformes antichar",
        },
        "rangeDoctrine": [
            ("Engagement", "Melee et Pistol selon l'eligibilite", "Choisir la charge qui change le controle; Pistol ne rend pas les autres armes eligibles."),
            ("0-9 pouces", "Charge courte, Pistol, Melta a demi-portee", "Zone de conversion et de contre-charge; ne pas y placer deux vagues sans repli."),
            ("10-12 pouces", "Pistol, Torrent eventuel, preparation de charge", "Mesurer ecrans et trajectoires avant d'utiliser Aggressive Onslaught."),
            ("13-18 pouces", "Pistolets 18, Rapid Fire selon profil", "Zone de staging : menacer deux objectifs plutot que declarer trop tot la cible."),
            ("19-24 pouces", "Hellblasters, bolters, tirs de soutien", "Retirer l'ecran qui rendrait la charge suivante inutile."),
            ("25-36+ pouces", "Lancer et Ballistus", "Forcer l'adversaire a sortir ou ouvrir le transport de la cible de melee."),
        ],
        "pcDoctrine": "Le PC le plus important est souvent celui qui conserve l'ordre des vagues. Red Rampage augmente la conversion d'une unite qui va vraiment combattre; Aggressive Onslaught et Relentless Assault recreent une ligne de charge sous conditions; Armour of Contempt et Angelic Grace maintiennent l'unite qui doit encore tenir. Donner inconditionnellement dans Red Thirst rend l'unite Battle-shocked : ce compromis doit etre accepte avant de compter son OC.",
        "alternatives": [
            ("Plus de Sanguinary Guard", "Passer l'escorte de Dante a 6", "Meilleure masse de frappe, mais demande 135 points et reduit les activations independantes."),
            ("Compagnie de la mort plus autonome", "Lemartes a la place d'Astorath", "Change la protection et le pilotage; ajuster 15 points ailleurs."),
            ("Inventaire strict", "Lieutenant, 3 Bladeguard et 5 Reivers", "Remplacement exact des deux exceptions; moins de projection aerienne."),
            ("Transport de milieu", "Land Raider Redeemer ou Repulsor", "Ajoute une ancre, mais transforme profondement une liste fondee sur les vagues Jump."),
        ],
    },
}


class GuideDoc(BaseDocTemplate):
    def __init__(self, filename: str, cfg: dict[str, Any]):
        width, height = A4
        super().__init__(filename, pagesize=A4, leftMargin=14*mm, rightMargin=14*mm, topMargin=16*mm, bottomMargin=14*mm,
                         title=f"Guide tactique {cfg['detachmentName']}", author="Warforge")
        self.cfg, self.page_width, self.page_height = cfg, width, height
        frame = Frame(self.leftMargin, self.bottomMargin, self.width, self.height, id="normal")
        self.addPageTemplates(PageTemplate(id="guide", frames=[frame], onPage=self.decorate))

    def decorate(self, canvas, _doc):
        canvas.saveState(); canvas.setFillColor(NAVY); canvas.rect(0, self.page_height-8*mm, self.page_width, 8*mm, fill=1, stroke=0)
        canvas.setFillColor(WHITE); canvas.setFont(FONT_BOLD, 6.7); canvas.drawString(14*mm, self.page_height-5.2*mm, "WARFORGE 40K - GUIDE TACTIQUE V11")
        canvas.setFillColor(MUTED); canvas.setFont(FONT, 6.3); canvas.drawString(14*mm, 6.5*mm, f"{self.cfg['faction']} - {self.cfg['detachmentName'].title()}")
        canvas.drawRightString(self.page_width-14*mm, 6.5*mm, f"{canvas.getPageNumber()} - {SNAPSHOT_DATE}"); canvas.restoreState()


class GroupBarChart(Flowable):
    def __init__(self, groups: list[tuple[str, int, str, str]], audit: list[dict[str, Any]], width=175*mm, height=70*mm):
        super().__init__(); self.groups=groups; self.width=width; self.height=height; self.maximum=max(500, math.ceil(max(g[1] for g in groups)/100)*100)
        audit.append({"id":"group-points","type":"horizontal-bar","title":"Repartition des 2 000 points par ensemble operationnel","population":f"Liste principale, n={len(groups)} ensembles","xAxis":{"label":"Cout","unit":"points","minimum":0,"maximum":self.maximum,"ticks":list(range(0,self.maximum+1,100))},"yAxis":{"label":"Ensembles","unit":"categorie","ticks":[g[0] for g in groups]},"legend":False})

    def wrap(self, avail_width, _): self.actual_width=min(self.width,avail_width); return self.actual_width,self.height
    def draw(self):
        c=self.canv; w=getattr(self,"actual_width",self.width); left,right,bottom,top=95,w-18,30,self.height-29
        c.setFillColor(NAVY); c.setFont(FONT_BOLD,8.5); c.drawCentredString(w/2,self.height-11,"Repartition des 2 000 points par ensemble operationnel")
        c.setFillColor(MUTED); c.setFont(FONT,6.1); c.drawCentredString(w/2,self.height-21,f"Liste principale - n={len(self.groups)} ensembles")
        for tick in range(0,self.maximum+1,100):
            x=left+(right-left)*tick/self.maximum; c.setStrokeColor(GRID); c.line(x,bottom,x,top); c.setFillColor(MUTED); c.drawCentredString(x,bottom-9,str(tick))
        row_h=(top-bottom)/len(self.groups)
        for i,(label,value,_,__) in enumerate(self.groups):
            y=top-(i+.72)*row_h; c.setFillColor(MUTED); c.setFont(FONT,5.7); c.drawRightString(left-5,y,clean(label)[:31])
            c.setFillColor(GOLD if i<2 else TEAL); c.rect(left,y-1,(right-left)*value/self.maximum,max(3,row_h*.45),fill=1,stroke=0)
            c.setFillColor(INK); c.setFont(FONT_BOLD,5.7); c.drawString(left+(right-left)*value/self.maximum+3,y,f"{value} pts")
        c.setFillColor(MUTED); c.setFont(FONT,6.1); c.drawCentredString((left+right)/2,3,f"Cout (points) - echelle 0 a {self.maximum}")
        c.saveState(); c.translate(8,(bottom+top)/2); c.rotate(90); c.drawCentredString(0,0,"Ensembles (categories)"); c.restoreState()


class DistanceChart(Flowable):
    def __init__(self, series: list[tuple[str,list[tuple[int,float]]]], audit: list[dict[str, Any]], width=175*mm, height=76*mm):
        super().__init__(); self.series=series; self.width=width; self.height=height
        maximum=max(v for _,pts in series for _,v in pts); self.maximum=max(6,math.ceil(maximum/2)*2)
        audit.append({"id":"distance-damage","type":"line","title":"Pression theorique selon la distance","population":f"Configurations du snapshot, cible Infanterie E4/Sv3+/2PV, n={len(series)} unites","xAxis":{"label":"Distance","unit":"pouces","minimum":0,"maximum":36,"ticks":[0,9,12,18,24,36]},"yAxis":{"label":"Degats utiles moyens","unit":"PV","minimum":0,"maximum":self.maximum,"ticks":[round(self.maximum*i/5,1) for i in range(6)]},"legend":True})

    def wrap(self,avail_width,_): self.actual_width=min(self.width,avail_width); return self.actual_width,self.height
    def draw(self):
        c=self.canv; w=getattr(self,"actual_width",self.width); left,right,bottom,top=40,w-18,31,self.height-34
        c.setFillColor(NAVY); c.setFont(FONT_BOLD,8.5); c.drawCentredString(w/2,self.height-10,"Pression theorique selon la distance")
        c.setFillColor(MUTED); c.setFont(FONT,5.8); c.drawCentredString(w/2,self.height-20,f"Cible Infanterie E4 / Sv3+ / 2 PV - n={len(self.series)}")
        for t in [0,9,12,18,24,36]:
            x=left+(right-left)*t/36; c.setStrokeColor(GRID); c.line(x,bottom,x,top); c.setFillColor(MUTED); c.drawCentredString(x,bottom-9,str(t))
        for i in range(6):
            val=self.maximum*i/5; y=bottom+(top-bottom)*i/5; c.setStrokeColor(GRID); c.line(left,y,right,y); c.setFillColor(MUTED); c.drawRightString(left-4,y-2,f"{val:.1f}")
        palette=[TEAL,GOLD,GREEN]
        for si,(label,pts) in enumerate(self.series):
            coords=[]
            for xv,yv in pts:
                x=left+(right-left)*xv/36; y=bottom+(top-bottom)*yv/self.maximum; coords.append((x,y)); c.setFillColor(palette[si]); c.circle(x,y,2,fill=1,stroke=0)
            c.setStrokeColor(palette[si]); c.setLineWidth(1.4)
            for a,b in zip(coords,coords[1:]): c.line(a[0],a[1],b[0],b[1])
            lx=left+si*(right-left)/3; c.setFillColor(palette[si]); c.rect(lx,top+5,8,2,fill=1,stroke=0); c.setFillColor(MUTED); c.setFont(FONT,5.4); c.drawString(lx+11,top+3,clean(label)[:21])
        c.setFillColor(MUTED); c.setFont(FONT,6); c.drawCentredString((left+right)/2,3,"Distance (pouces) - echelle 0 a 36")
        c.saveState(); c.translate(8,(bottom+top)/2); c.rotate(90); c.drawCentredString(0,0,"Degats utiles moyens (PV)"); c.restoreState()


def table(rows: list[list[Any]], widths: list[float], repeat=1) -> LongTable:
    data=[]
    for ri,row in enumerate(rows): data.append([cell if hasattr(cell,"wrap") else p(cell,"TableHead" if ri==0 else "Table") for cell in row])
    result=LongTable(data,colWidths=widths,repeatRows=repeat,hAlign="LEFT")
    result.setStyle(TableStyle([("BACKGROUND",(0,0),(-1,0),NAVY),("TEXTCOLOR",(0,0),(-1,0),WHITE),("GRID",(0,0),(-1,-1),.35,GRID),("VALIGN",(0,0),(-1,-1),"TOP"),("LEFTPADDING",(0,0),(-1,-1),4),("RIGHTPADDING",(0,0),(-1,-1),4),("TOPPADDING",(0,0),(-1,-1),3),("BOTTOMPADDING",(0,0),(-1,-1),3),("ROWBACKGROUNDS",(0,1),(-1,-1),[WHITE,colors.HexColor("#F3F6F5")])]))
    return result


def recursive_find(node: Any, wanted: str) -> dict[str, Any] | None:
    if isinstance(node, dict):
        if node.get("id")==wanted: return node
        for value in node.values():
            found=recursive_find(value,wanted)
            if found: return found
    elif isinstance(node,list):
        for value in node:
            found=recursive_find(value,wanted)
            if found: return found
    return None


def load_context(root: Path, cfg: dict[str, Any]) -> dict[str, Any]:
    pwa=root/"warforge-pwa"; kb_path=pwa/"data/strategy/knowledge-base.json"
    kb=json.loads(kb_path.read_text(encoding="utf-8")); book_path=pwa/"data/units"/f"{cfg['book']}.json"; book=json.loads(book_path.read_text(encoding="utf-8"))
    assessment_path=root/"output/pdf/detachment-inventory-report-2026-08-11/assessments.json"; expert_path=root/"output/pdf/detachment-inventory-expert-report-2026-08-11/expert-assessments.json"
    prudent=json.loads(assessment_path.read_text(encoding="utf-8")); expert=json.loads(expert_path.read_text(encoding="utf-8"))
    assessment_id=f"{cfg['faction'].lower().replace(' ','-')}:2000:{cfg['slug']}"; expert_id=f"expert:{assessment_id}"
    stats_paths=sorted((root/"deliverables/statistics-reports").glob("*/snapshot-statistique-exhaustif.json.gz"))
    if not stats_paths: raise RuntimeError("Snapshot statistique absent")
    with gzip.open(stats_paths[-1],"rt",encoding="utf-8") as stream: stats=json.load(stream)
    inv_path=pwa/"data/inventory/datasheet_x_figs.csv"
    with inv_path.open(encoding="utf-8-sig",newline="") as stream: inventory=list(csv.DictReader(stream))
    return {"pwa":pwa,"kb":kb,"book":book,"assessment":recursive_find(prudent,assessment_id),"expert":recursive_find(expert,expert_id),"stats":stats,"inventory":inventory,"statsPath":stats_paths[-1],"inputPaths":[kb_path,pwa/"data/units/DataInfo.json",book_path,inv_path,assessment_path,expert_path,stats_paths[-1]]}


def resolve_unit(ctx: dict[str, Any], unit_id: str) -> dict[str, Any]:
    index=int(unit_id.rsplit(":",1)[1]); return ctx["book"]["Units"][index]


def roster_from_specs(ctx: dict[str, Any], cfg: dict[str, Any], specs: list[tuple]) -> dict[str, Any]:
    det=ctx["book"]["Dettachments"][cfg["detachmentIndex"]]; inventory={(r["UnitId"],int(r["ID_figurine"])):r["Type"] for r in ctx["inventory"]}
    units=[]; used:set[int]=set(); total=0
    for item_id,unit_id,point_index,enh_index,figures,availability in specs:
        raw=resolve_unit(ctx,unit_id); point=raw["Points"][point_index]; models=int(point.get("ModelCount",1)); cost=int(point["Cost"]); enhancement=None
        if enh_index is not None: enhancement=det["Enhancements"][enh_index]; cost+=int(enhancement["Cost"])
        if figures and len(figures)!=models: raise AssertionError(f"Allocation incorrecte {item_id}: {len(figures)} != {models}")
        for fig in figures:
            if fig in used: raise AssertionError(f"Figurine reutilisee dans la variante: {fig}")
            if (unit_id,fig) not in inventory: raise AssertionError(f"Association inventaire absente {unit_id}/{fig}")
            used.add(fig)
        if not figures and "hors inventaire" not in availability: raise AssertionError(f"Allocation absente {item_id}")
        units.append({"itemId":item_id,"unitId":unit_id,"name":raw["Name"],"models":models,"points":int(point["Cost"]),"enhancement":enhancement["Name"] if enhancement else None,"enhancementCost":int(enhancement["Cost"]) if enhancement else 0,"availability":availability,"figureIds":figures})
        total+=cost
    if total!=2000: raise AssertionError(f"Total liste {cfg['slug']}: {total}")
    return {"points":total,"units":units,"physicalFigureReuse":False}


def build_scenario_plans(cfg: dict[str, Any]) -> list[dict[str, Any]]:
    plans=[]
    for mission,opponent,mission_id in COMMON_SCENARIOS[cfg["forceDisposition"]]:
        if cfg["faction"]=="Dark Angels":
            support="Un objectif que les Deathwing peuvent rejoindre en deux couches, couvert par un angle de Hellblasters ou de char."
            preserve="une brique Deathwing, les Scouts de releve et au moins une source de tir lourd"
            first="Declarer un objectif jure defendable et montrer une seule couche; garder l'autre hors de la reponse immediate."
            second="Laisser l'adversaire reveler son operateur, puis designer l'objectif qui transforme la contre-attaque Deathwing en reprise."
            lesson="L'objectif jure doit organiser le tour; il ne doit jamais devenir une obligation de charger une cible sans valeur de mission."
        else:
            support="Un objectif central-decale avec deux zones de staging, afin que deux vagues Jump ne soient jamais exposees au meme contre-feu."
            preserve="une vague de charge, une unite rapide de secondaire et au moins deux plateformes antichar"
            first="Installer les Scouts et les lanes; menacer deux charges sans livrer la Death Company avant que l'ecran adverse soit identifie."
            second="Utiliser la derniere information pour lancer une seule vague utile, puis placer la suivante hors de la reponse directe."
            lesson="Red Thirst augmente une charge utile; il ne transforme pas une charge sans plan de controle en bonne decision."
        theses={
            "Take and Hold":"Gagner la majorite par vagues : construire deux objectifs solides, puis rendre instable le troisieme objectif adverse.",
            "Purge the Foe":"Refuser les activations faciles : chaque unite exposee doit acheter du score, du tempo ou une reprise, jamais seulement des dommages.",
            "Disruption":"Proteger la sequence : distinguer l'operateur, l'ecran et l'unite qui retire le verrou adverse.",
            "Reconnaissance":"Ne pas courir apres toute la largeur : fermer l'axe qui change le primaire et conceder temporairement le flanc secondaire.",
            "Priority Assets":"Casser le tempo de l'operateur adverse tout en gardant sa propre majorite ou sa propre ressource defendable.",
        }
        plans.append({"mission":mission,"opponent":opponent,"missionId":mission_id,"thesis":theses[opponent],"support":support,"preserve":preserve,"first":first,"second":second,"lesson":lesson,
            "rounds":[
                "R1 : mesurer les axes, proteger les operateurs et refuser l'exposition simultanee des couches.",
                "R2 : engager une seule ressource offensive et conserver une releve a distance de la reponse adverse.",
                "R3 : remplacer la premiere couche usee, puis choisir si le centre ou un flanc devient la priorite.",
                "R4 : attribuer des maintenant chaque unite survivante au primaire, a une secondaire ou a la bascule finale.",
                "R5 : compter l'OC et les positions legales avant les dommages; la derniere unite mobile ne poursuit pas une cible secondaire.",
            ],
            "abort":"Si operateur, releve et soutien peuvent etre touches par la meme reponse, reduire l'ambition et reconstruire la profondeur.",
            "fallback":"Tenir deux positions, nettoyer l'unite qui produit le double rendement adverse et reporter l'activation de score plutot que l'annoncer acquise.",
            "secondary":"Confier la carte a l'unite la moins structurante. Une Scout ou une petite unite mobile porte l'Action laterale; la brique centrale ne quitte le primaire que si les deux objectifs se superposent vraiment.",
            "setup":f"Au debut du round 3 de {mission}, l'adversaire peut contester l'objectif cle avec une unite ecran et garde sa piece de contre-attaque en retrait.",
            "decision":"Envoyer la piece la plus puissante maintenant, ou retirer l'ecran avec une couche secondaire avant de basculer ?",
            "a":"Si le nettoyage ouvre l'objectif sans exposer la releve, utiliser le tir ou la petite vague, puis conserver la brique principale pour la reprise.",
            "b":"Si la cible restera contestee ou si le contre-jeu prend deux couches a la fois, tenir la position, ecranter et reporter la bascule.",
        })
    return plans


def build_data(root: Path, cfg: dict[str, Any]) -> tuple[dict[str, Any], dict[str, Any]]:
    ctx=load_context(root,cfg); main=roster_from_specs(ctx,cfg,cfg["main"])
    strict_specs=[x for x in cfg["main"] if x[0] not in cfg["strictReplace"]["remove"]]+cfg["strictReplace"]["add"]
    strict=roster_from_specs(ctx,cfg,strict_specs); det=ctx["book"]["Dettachments"][cfg["detachmentIndex"]]; scenarios=build_scenario_plans(cfg)
    disposition=f"gdm-2026-force-disposition-{cfg['forceDisposition'].lower().replace(' ','-')}"; scenario_ids={s["missionId"] for s in scenarios}; matchups=[]
    for guide in ctx["kb"]["matchupGuides"]:
        side=next((s for s in guide.get("sides",[]) if s["forceDispositionId"]==disposition and s["scenarioId"] in scenario_ids),None)
        if side:
            scenario=next(s for s in ctx["kb"]["scenarios"] if s["id"]==side["scenarioId"]); claim_ids=side.get("claimIds",[])+guide.get("globalClaimIds",[])
            matchups.append({"guideId":guide["id"],"layoutId":guide["selectedLayoutId"],"scenario":scenario,"claimIds":claim_ids})
    if len(matchups)!=5: raise AssertionError(f"Confrontations trouvees {cfg['slug']}: {len(matchups)}")
    secondary=[]
    for guide in ctx["kb"]["secondaryMissionGuides"]:
        scenario=next(s for s in ctx["kb"]["scenarios"] if s["id"]==guide["scenarioId"])
        secondary.append({"id":guide["id"],"title":scenario["title"].replace(" - briefing GDM","").replace(" — briefing GDM",""),"familyId":guide["familyId"],"capabilityRequirements":guide["capabilityRequirements"],"claimIds":guide["claimIds"],"decisionExampleIds":guide["decisionExampleIds"]})
    capabilities=sorted({r["capability"] for m in secondary for r in m["capabilityRequirements"]})
    if len(secondary)!=18 or len(capabilities)!=10: raise AssertionError("Portefeuille secondaire incomplet")
    stat_units={u["id"]:u for u in ctx["stats"]["units"]}; series=[]
    for uid,label in cfg["curveUnits"]:
        rows=stat_units[uid]["offenseScenarios"]; points=[]
        for distance in [0,9,12,18,24,36]:
            modes=[x for x in rows if x["targetId"]=="infantry" and x["distance"]==distance and x["mode"] in ("melee","pistol","standard-ranged","vehicle-combined")]
            points.append((distance,max((x["usefulDamage"]["mean"] for x in modes),default=0)))
        series.append((label,points))
    data={"schemaVersion":REPORT_SCHEMA,"guideVersion":cfg["guideVersion"],"status":"draft/preliminary","snapshotDate":SNAPSHOT_DATE,"catalogVersion":CATALOG_VERSION,"engineVersion":ctx["stats"]["engineVersion"],"missionPackId":"gdm-2026-11th","faction":cfg["faction"],
          "detachment":{"id":cfg["detachmentId"],"name":det["Name"],"costDP":det["Cost"],"forceDisposition":cfg["forceDisposition"],"rule":det["Rule"],"stratagems":det["Stratagems"],"enhancements":det["Enhancements"]},"mainRoster":main,"inventoryStrictRoster":strict,"inventoryExceptions":cfg["exceptions"],"strictLoss":cfg["strictLoss"],"groups":cfg["groups"],"scenarioPlans":scenarios,"primaryMatchups":sorted(matchups,key=lambda x:x["scenario"]["id"]),"secondaryMissions":secondary,"capabilities":capabilities,"statistics":{"distances":ctx["stats"]["distances"],"series":series,"assumptions":ctx["stats"]["assumptions"],"catalogFingerprint":ctx["stats"]["catalogFingerprint"]},"analyses":{"prudent":ctx["assessment"],"expert":ctx["expert"]},"assumptions":["Aucun PC, timing, resultat de des, cible, portee, ligne de vue ou condition de score n'est suppose satisfait.","Les briefs GDM sont une archive approuvee non officielle; la carte active reste la reference a la table.","Les valeurs statistiques sont des baselines theoriques et non des promesses de resultat."]}
    return data,ctx


def unit_image(root: Path, slug: str, width=175*mm, height=67*mm) -> Image | None:
    path=root/"warforge-pwa/public/data/img/units"/f"{slug}.webp"
    if not path.exists(): return None
    result=Image(str(path),width=width,height=height); result.hAlign="LEFT"; return result


def build_markdown(cfg: dict[str, Any], data: dict[str, Any]) -> str:
    lines=[f"# Guide tactique {cfg['faction']} - {cfg['detachmentName'].title()}","",f"> Version {cfg['guideVersion']} - {SNAPSHOT_DATE} - statut `draft/preliminary`","","## Le plan en deux minutes","",cfg["identity"],"",cfg["tagline"],"","## Liste principale - 2 000 points","","| Unite | Figurines | Points | Optimisation | Disponibilite |","|---|---:|---:|---|---|"]
    for u in data["mainRoster"]["units"]: lines.append(f"| {u['name']} | {u['models']} | {u['points']+u['enhancementCost']} | {u['enhancement'] or '-'} | {u['availability']} |")
    lines += ["", "Exceptions explicites :", *[f"- {x}" for x in cfg["exceptions"]], "", "### Variante strictement inventaire", "", cfg["strictLoss"], "", "## Regle du detachement", "", f"**{data['detachment']['rule']['Title']}** - {data['detachment']['rule']['Text']}", "", "## Stratagemes", ""]
    for s in data["detachment"]["stratagems"]: lines += [f"### {s['Name']} - {s['CPCost']} PC","",f"**Quand :** {s.get('When','')}  ",f"**Cible :** {s.get('Target','')}  ",f"**Effet :** {s.get('Effect','')}  ",f"**Restriction :** {s.get('Restrictions','Aucune restriction supplementaire structuree.')}  ",""]
    lines += ["## Ensembles operationnels",""]
    for name,points,units,role in cfg["groups"]: lines += [f"### {name} - {points} points","",f"{units}. {role}",""]
    lines += ["## Doctrine de portee",""]
    for distance,rules,decision in cfg["rangeDoctrine"]: lines += [f"### {distance}","",f"{rules}. {decision}",""]
    lines += ["## Les 18 secondaires", "", "Le portefeuille est pilote par capacites, pas par intuition. Une carte est naturelle seulement si une unite non structurante peut la porter sans casser le primaire.", ""]
    for family in ["destruction-targeted","objective-control","territorial-projection","actions-operations"]:
        lines += [f"### {family}",""]
        for m in data["secondaryMissions"]:
            if m["familyId"]==family: lines.append(f"- **{m['title']}** : "+", ".join(r["capability"] for r in m["capabilityRequirements"] if r["importance"]=="core"))
        lines += [""]
    lines += ["## Les cinq confrontations primaires",""]
    for s in data["scenarioPlans"]:
        lines += [f"### {s['mission']} contre {s['opponent']}","",s["thesis"],"",f"**Point d'appui :** {s['support']}","",f"**Premier joueur :** {s['first']}","",f"**Second joueur :** {s['second']}","","Plan par round :",*[f"{i+1}. {x}" for i,x in enumerate(s["rounds"])],"",f"**Condition d'abandon :** {s['abort']}","",f"**Repli :** {s['fallback']}","",f"**Exemple :** {s['setup']} {s['decision']}","",f"- Branche favorable : {s['a']}",f"- Branche sure : {s['b']}","",f"**A retenir :** {s['lesson']}",""]
    lines += ["## Limites","","- Verifier les cartes et les regles officielles actives a la table.","- Aucune condition de jeu ni aucun resultat de des n'est suppose satisfait.","- Les conseils sont des infererences pedagogiques `draft/preliminary`, pas des taux de victoire.",""]
    return "\n".join(lines)


def scenario_section(story: list[Any], cfg: dict[str, Any], plan: dict[str, Any], matchup: dict[str, Any]):
    scenario=matchup["scenario"]
    opponent_logic={
        "Take and Hold":"Take and Hold transforme la largeur en majorite. Son troisieme objectif est souvent plus important que votre meilleur objectif deja securise.",
        "Purge the Foe":"Purge the Foe cherche un double rendement : detruire l'unite exposee puis reprendre facilement sa position. Les petites activations gratuites sont donc dangereuses.",
        "Disruption":"Disruption n'a pas besoin de detruire votre ancre; interrompre la sequence ou bloquer le passage au bon moment peut suffire.",
        "Reconnaissance":"Reconnaissance etire la table avec plusieurs unites independantes. Il faut fermer l'axe qui change le primaire, pas poursuivre toutes les silhouettes.",
        "Priority Assets":"Priority Assets construit une ressource repetable. La bonne cible est l'operateur, sa releve ou l'unite qui protege le cycle, pas necessairement la plus couteuse.",
    }
    story += [PageBreak(),p(f"{plan['mission']} contre {plan['opponent']}","H1"),p(f"{cfg['forceDisposition']} - layout conceptuel {matchup['layoutId']}","Subtitle"),p(plan["thesis"],"Lead"),
              p("Comprendre le moteur adverse","H2"),p(opponent_logic[plan["opponent"]]),p("Votre plan ne cherche pas a gagner partout. Il choisit la position dont le controle produit la prochaine fenetre de score, puis separe clairement l'operateur, la releve et la piece qui retire la contestation."),
              p("Choisir le point d'appui","H2"),p(plan["support"]+" Ce point doit encore etre utile si la charge, l'Action ou le tir prevu n'est finalement pas legal."),
              p("Fenetres a verifier sur la carte","H2"),bullets(scenario.get("scoringWindows",[])),p("La carte active fixe les valeurs et conditions exactes. Cette synthese ne transforme aucune fenetre en score acquis.","Warning"),
              p("Donner un ordre aux ensembles","H2"),p("La premiere couche revele l'ecran ou protege l'operateur. La deuxieme retire ce qui empeche le score. La troisieme reste hors de la reponse directe et devient la releve. Si deux couches sont exposees avant que l'adversaire ait engage sa ressource, le plan a depense son assurance trop tot."),
              p("Dans ce duel, preserve surtout "+plan["preserve"]+". La cible prioritaire est l'unite qui permet au moteur adverse de scorer et de survivre dans la meme activation."),
              p("Premier ou second joueur","H2"),rich(f"<b>En premier :</b> {esc(plan['first'])}","Callout"),rich(f"<b>En second :</b> {esc(plan['second'])}","Fact"),PageBreak(),p("Le fil de la partie","H2")]
    explanations=["Le premier round installe les menaces et protege l'information.","Le deuxieme round ouvre la premiere vraie fenetre de bascule.","Le troisieme round demande une releve : poursuivre une cible hors plan coute souvent une position.","Au quatrieme round, chaque survivant doit deja avoir un role pour la fin.","Le cinquieme round recompense la position legale finale, pas le dommage spectaculaire."]
    for i,text in enumerate(plan["rounds"]): story += [p(f"Round {i+1}","H3"),p(text+" "+explanations[i])]
    story += [p("Condition d'abandon et ligne de repli","H2"),p(plan["abort"]),p("Renoncer n'est pas passer : "+plan["fallback"]),p("Faire cohabiter primaire et secondaires","H2"),p(plan["secondary"]),
              p("Exemple pedagogique","H2"),p(plan["setup"]+" La question est : "+plan["decision"].lower()),rich(f"<b>Branche favorable :</b> {esc(plan['a'])}","Callout"),rich(f"<b>Branche sure :</b> {esc(plan['b'])}","Fact"),p("Enseignement : "+plan["lesson"]),
              p("Traceabilite","H2"),p("Claims reutilises : "+", ".join(matchup["claimIds"]),"Small")]


def build_pdf(root: Path, cfg: dict[str, Any], data: dict[str, Any], out_path: Path, audit: list[dict[str, Any]]):
    story:list[Any]=[]; cover=unit_image(root,cfg["cover"])
    story += [Spacer(1,14*mm),p(cfg["detachmentName"],"Title"),p(f"Guide tactique complet - {cfg['faction']}","Subtitle")]
    if cover: story += [cover,Spacer(1,5*mm)]
    story += [p(f"2 000 points - {data['detachment']['costDP']} DP - Force Disposition {cfg['forceDisposition']}","Cover"),Spacer(1,5*mm),rich("<b>But du guide.</b> Transformer le detachement, les cinq confrontations primaires et le portefeuille secondaire en decisions simples, ordonnees et adaptables a la table.","Callout"),p("Les faits du catalogue, les calculs du moteur et les conseils tactiques sont distingues. Aucun taux de victoire ni resultat garanti n'est produit.","Warning"),Spacer(1,8*mm),p(f"Catalogue {CATALOG_VERSION} - moteur {data['engineVersion']} - GDM 2026 V11","Small"),PageBreak()]
    story += [p("Le plan en deux minutes","H1"),p(cfg["identity"],"Lead"),rich(f"<b>A retenir :</b> {esc(cfg['tagline'])}","Callout"),p("Les cinq confrontations - exactement cinq","H2"),table([["Mission","Disposition adverse"]]+[[x["mission"],x["opponent"]] for x in data["scenarioPlans"]],[88*mm,87*mm]),p("Mode d'emploi","H2"),bullets(["Avant le deploiement : nommer l'ancre, la premiere couche, la releve et l'unite du round 5.","Au debut de chaque round : identifier la prochaine fenetre de primaire avant de choisir les cibles.","Avant chaque PC : demander si la depense change le controle, preserve la releve ou ouvre une charge utile.","Pour chaque secondaire : employer l'unite la moins structurante et garder un horizon explicite si la carte est conservee."]),p("Hypotheses visibles","H2"),bullets(data["assumptions"]),PageBreak()]
    det=data["detachment"]; story += [p("1. Comprendre le detachement","H1"),p(cfg["identity"],"Lead"),rich(f"<b>Fait de catalogue - {esc(det['rule']['Title'])}.</b> {esc(det['rule']['Text'])}","Fact"),p("Cette regle ne s'active pas toute seule. Les portees, cibles, charges, etats de Battle-shock et conditions d'objectif doivent etre vrais au moment pertinent. Le guide en tire une methode de pilotage, pas une garantie."),p("Restrictions","H2"),p(det["rule"].get("Restrictions") or "Aucune restriction textuelle supplementaire."),p("Les stratagemes comme arbres de decision","H2")]
    for s in det["stratagems"]:
        story += [KeepTogether([p(f"{s['Name']} - {s['CPCost']} PC","H3"),p(f"Quand : {s.get('When','')} Cible : {s.get('Target','')}"),p(f"Effet utile : {s.get('Effect','')}"),p("Preconditions : PC disponible, bon timing, cible eligible et toutes les restrictions verifiees. Contre-jeu : l'adversaire peut refuser la cible, forcer la depense tot ou changer l'ordre de ses activations. Erreur frequente : compter l'effet avant d'avoir verifie la cible et la fenetre.","Small")])]
    story += [p("Doctrine de PC","H2"),p(cfg["pcDoctrine"]),p("Optimisations","H2"),table([["Optimisation","Cout","Lecture tactique"]]+[[e["Name"],str(e["Cost"]),e["Description"]] for e in det["enhancements"]],[38*mm,12*mm,125*mm]),PageBreak()]
    story += [p("2. La liste principale a 2 000 points","H1"),p("La liste est construite comme une succession de fonctions. Les pieces de melee ou de position ne sont pas toutes envoyees au meme round; les feux longs ouvrent la cible; les petites unites gardent les Actions et la largeur; la derniere couche conserve la capacite de reprendre.","Lead")]
    rows=[["Unite","Taille","Points","Optimisation","Disponibilite"]]
    for u in data["mainRoster"]["units"]: rows.append([u["name"],str(u["models"]),str(u["points"]+u["enhancementCost"]),u["enhancement"] or "-",u["availability"]])
    rows.append(["TOTAL","",str(data["mainRoster"]["points"]),"","exceptions explicites"]); story += [table(rows,[55*mm,14*mm,18*mm,47*mm,41*mm]),p("Exceptions autorisees","H2"),bullets(cfg["exceptions"]),p("Associations et ordre d'exposition","H2")]
    if cfg["faction"]=="Dark Angels": story += [p("Azrael accompagne les Inner Circle Companions. Belial prend une unite de Knights. Le Captain en armure Terminator prend l'autre unite ou les Terminators selon le plan de reserve. Les Scouts montrent l'axe; les Hellblasters et les chars nettoient; la Deathwing occupe seulement apres que le contre-jeu a ete mesure.")]
    else: story += [p("Dante accompagne la Sanguinary Guard; Astorath dirige la Death Company; le Captain with Jump Pack prend les Vanguard. Les Jump Intercessors et Inceptors restent des outils de mission tant qu'une vraie bascule n'exige pas leur charge. Les trois plateformes lourdes ouvrent les transports et les ecrans avant l'engagement des vagues.")]
    story += [p("Variante strictement inventaire","H2"),p(cfg["strictLoss"],"Fact"),GroupBarChart(cfg["groups"],audit),p("Le graphique mesure l'investissement de points, pas une valeur tactique ni une probabilite de victoire.","Small"),PageBreak()]
    story += [p("3. Les ensembles operationnels","H1"),p("Une unite n'est jamais seulement 'bonne'. Elle est responsable d'une etape du plan, possede une condition de preservation et devient sacrifiable seulement lorsqu'un echange identifie le justifie.","Lead")]
    for name,points,units,role in cfg["groups"]: story += [KeepTogether([p(name,"H2"),rich(f"<b>Composition :</b> {esc(units)} - {points} points.<br/><b>Responsabilite :</b> {esc(role)}<br/><b>Condition de preservation :</b> garder cet ensemble tant qu'aucune autre couche ne peut reprendre sa fonction.<br/><b>Condition d'abandon :</b> l'engager seulement si le score, le tempo ou la suppression d'une piece structurante compense sa perte.")])]
    story += [PageBreak(),p("4. Distances, armes et ordre d'engagement","H1"),DistanceChart(data["statistics"]["series"],audit),p("Baseline theorique hors synergies, contre une Infanterie E4/Sv3+/2PV. Lire les ruptures de portee; ne pas extrapoler ces moyennes en resultat garanti.","Warning"),p("Les six paliers","H2"),table([["Palier","Regles ou armes","Decision"]]+[list(x) for x in cfg["rangeDoctrine"]],[28*mm,57*mm,90*mm]),p("Pistol, Melta et Rapid Fire : trois erreurs a eviter","H2"),bullets(["Pistol rend eligibles les armes Pistol dans la situation prevue; il ne rend pas toutes les armes de tir eligibles en engagement.","Melta ajoute son bonus a demi-portee propre de l'arme. Le palier de 9 pouces n'est pertinent que pour une arme de portee 18 pouces.","Rapid Fire depend aussi de la demi-portee de chaque arme. Une unite peut donc changer de volume a 12 ou 18 pouces selon son profil exact."]),PageBreak()]
    story += [p("5. Les 18 secondaires tactiques","H1"),p("Une liste de mission doit realiser une carte sans desassembler son primaire. La question n'est pas seulement 'puis-je le faire ?', mais 'quelle unite peut le faire tout en laissant une releve et une ligne de repli ?'.","Lead"),rich("<b>Regle de portefeuille :</b> distinguer accomplissement, conservation, defausse volontaire de fin de tour et remplacement unique a 1 PC. Verifier toute clause propre au tirage.","Callout"),p("Dix capacites et responsables","H2"),table([["Capacite","Responsables"]]+[[cap,cfg["capOwners"][cap]] for cap in data["capabilities"]],[58*mm,117*mm])]
    family_text={"destruction-targeted":"Ces cartes deviennent naturelles seulement si la cible existe et reste accessible. Les pieces lourdes ouvrent; les vagues de melee achevent lorsque la position finale est utile.","objective-control":"Elles ressemblent au primaire. Leur danger est de faire quitter une position deja construite pour une seconde condition moins importante.","territorial-projection":"Les Scouts, Inceptors et petites unites Jump doivent survivre assez longtemps. Les employer comme ecran banal au premier round ferme plusieurs cartes plus tard.","actions-operations":"L'Action doit revenir a l'unite la moins structurante. Une brique centrale n'abandonne son role que si primaire et secondaire partagent reellement la meme position."}
    labels={"destruction-targeted":"Destruction ciblee","objective-control":"Controle d'objectifs","territorial-projection":"Projection territoriale","actions-operations":"Actions et operations"}
    for family in labels:
        missions=[m for m in data["secondaryMissions"] if m["familyId"]==family]; story += [p(labels[family],"H2"),p(family_text[family]),table([["Mission","Capacites centrales"]]+[[m["title"],", ".join(r["capability"] for r in m["capabilityRequirements"] if r["importance"]=="core")] for m in missions],[60*mm,115*mm])]
    story += [p("Regles de decision","H2"),bullets(["Accomplir maintenant si l'unite la moins structurante peut le faire sans ouvrir le primaire.","Conserver seulement avec une fenetre future nommee, une route et une releve.","Defausser volontairement si la carte bloque deux activations structurantes et que sa fenetre ne s'ameliore pas.","Utiliser le remplacement unique a 1 PC seulement apres comparaison avec le besoin defensif du round.","Si deux cartes demandent la meme unite, prioriser celle qui partage deja la position du primaire."])]
    matchup={m["scenario"]["id"]:m for m in data["primaryMatchups"]}
    for plan in data["scenarioPlans"]: scenario_section(story,cfg,plan,matchup[plan["missionId"]])
    story += [PageBreak(),p("6. Situations recurrentes","H1"),p("Charge utile ou charge disponible ?","H2"),p("Une charge utile change le controle, retire une piece structurante ou place l'unite dans une position encore defendable. Une charge simplement disponible consomme une vague, ouvre le contre-feu et peut eloigner l'unite des secondaires."),p("Depense offensive ou reserve defensive ?","H2"),p("Avant d'augmenter les dommages, nommer la reponse adverse la plus dangereuse. Si garder 1 PC preserve l'operateur ou la releve, la depense offensive doit retirer une piece qui change réellement cet etat."),p("Reprise au cinquieme round","H2"),p("Conserver une unite rapide hors de l'echange du round 4. Au dernier round, compter l'OC, la distance et les ecrans avant de choisir la cible. Une unite qui ne tue rien peut etre la plus importante si elle produit le dernier controle legal."),p("Quand abandonner le centre","H2"),p("Si le centre absorbe trois ensembles sans produire de majorite ni de secondaire, il est deja perdu fonctionnellement. Replier une couche, tenir deux positions et menacer la bascule finale vaut mieux qu'alimenter une attrition sans horizon."),PageBreak(),p("7. Alternatives et aide-memoire","H1"),table([["Besoin","Alternative","Consequence"]]+[list(x) for x in cfg["alternatives"]],[42*mm,67*mm,66*mm]),p("Avant la partie","H2"),bullets([f"Confirmer {cfg['forceDisposition']} et la mission primaire exacte.","Declarer les associations de Leaders et les reserves.","Nommer premiere couche, releve, nettoyeur et unite du round 5.","Mesurer les paliers Pistol, Melta, Rapid Fire et les portees de charge.","Garder un plan de PC defensif avant toute depense offensive.","Pour chaque secondaire, verifier fenetre, clause au tirage et unite responsable."]),p("Sources et limites","H2"),p("Sources locales : catalogue Warforge 1.2.13.0, faction pack applicable, MFM 1.2.13.0, Compagnon d'evenement 2026-27 v1.1, archive GDM 2026 approuvee, base strategique V5, inventaire versionne et moteur statistique actif.","Small"),p("Les conseils editoriaux restent draft/preliminary. GDM est une archive approuvee non officielle. Les cartes, FAQ et regles officielles actives a la table priment.","Warning")]
    GuideDoc(str(out_path),cfg).build(story)


def generate(root: Path, key: str) -> dict[str, Any]:
    cfg=CONFIGS[key]; out=root/"output/pdf"/f"{cfg['slug']}-guide-{SNAPSHOT_DATE}"; out.mkdir(parents=True,exist_ok=True); audit=[]; data,ctx=build_data(root,cfg)
    pdf_path=out/f"guide-{cfg['slug']}.pdf"; md_path=out/f"guide-{cfg['slug']}.md"; build_pdf(root,cfg,data,pdf_path,audit)
    (out/"guide-data.json").write_text(json.dumps(data,ensure_ascii=False,indent=2),encoding="utf-8"); md_path.write_text(build_markdown(cfg,data),encoding="utf-8")
    chart_audit={"schemaVersion":"warforge-chart-audit/v1","charts":audit,"allChartsHaveAxesUnitsTicksScales":all(c.get("xAxis",{}).get("ticks") and c.get("yAxis",{}).get("ticks") for c in audit)}
    (out/"chart-audit.json").write_text(json.dumps(chart_audit,ensure_ascii=False,indent=2),encoding="utf-8")
    reader=PdfReader(str(pdf_path)); sources=[{"path":str(path.relative_to(root)).replace("\\","/"),"sha256":sha256(path)} for path in ctx["inputPaths"]]
    manifest={"schemaVersion":"warforge-tactical-guide-manifest/v1","guideVersion":cfg["guideVersion"],"generatedAt":SNAPSHOT_DATE,"catalogVersion":CATALOG_VERSION,"engineVersion":data["engineVersion"],"pageCount":len(reader.pages),"files":{},"sources":sources,"checks":{"mainRosterPoints":2000,"strictRosterPoints":2000,"primaryMatchups":5,"secondaryMissions":18,"capabilities":10,"inventoryExceptionCount":len(cfg["exceptions"]),"physicalFigureReuse":False,"chartAuditPassed":chart_audit["allChartsHaveAxesUnitsTicksScales"]}}
    for filename in [pdf_path.name,md_path.name,"guide-data.json","chart-audit.json"]:
        path=out/filename; manifest["files"][filename]={"sha256":sha256(path),"bytes":path.stat().st_size}
    (out/"manifest.json").write_text(json.dumps(manifest,ensure_ascii=False,indent=2),encoding="utf-8")
    return {"output":str(out),"pdf":str(pdf_path),"pages":len(reader.pages),"checks":manifest["checks"]}


def main() -> None:
    parser=argparse.ArgumentParser(); parser.add_argument("--root",default="."); parser.add_argument("--guide",choices=["dark-angels","blood-angels","all"],default="all"); args=parser.parse_args(); root=Path(args.root).resolve()
    keys=list(CONFIGS) if args.guide=="all" else [args.guide]; print(json.dumps([generate(root,key) for key in keys],ensure_ascii=False,indent=2))


if __name__=="__main__": main()
