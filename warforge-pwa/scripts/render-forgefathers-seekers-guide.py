#!/usr/bin/env python3
"""Build the pedagogical Forgefather's Seekers tactical guide package."""

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
from reportlab.lib.enums import TA_CENTER, TA_LEFT
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.platypus import (
    BaseDocTemplate, Flowable, Frame, Image, KeepTogether, LongTable, PageBreak,
    PageTemplate, Paragraph, Spacer, Table, TableStyle,
)

REPORT_SCHEMA = "warforge-detachment-tactical-guide/v1.0.0"
GUIDE_VERSION = "forgefathers-seekers-guide/v1.0.0"
SNAPSHOT_DATE = "2026-08-11"
CATALOG_VERSION = "1.2.13.0"
DETACHMENT_ID = "book-salamanders:detachment:0"

NAVY = colors.HexColor("#112C38")
INK = colors.HexColor("#20323A")
MUTED = colors.HexColor("#62747C")
GOLD = colors.HexColor("#C79A2B")
TEAL = colors.HexColor("#247E91")
GREEN = colors.HexColor("#3E7D5E")
ORANGE = colors.HexColor("#C96E2B")
RED = colors.HexColor("#A64A45")
PAPER = colors.HexColor("#F7F4EC")
PALE = colors.HexColor("#EAF1F2")
GRID = colors.HexColor("#D4DEE0")
WHITE = colors.white


def register_fonts() -> tuple[str, str]:
    pairs = [
        (Path("C:/Windows/Fonts/arial.ttf"), Path("C:/Windows/Fonts/arialbd.ttf")),
        (Path("/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"), Path("/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf")),
    ]
    for regular, bold in pairs:
        if regular.exists() and bold.exists():
            pdfmetrics.registerFont(TTFont("WarforgeSans", str(regular)))
            pdfmetrics.registerFont(TTFont("WarforgeSansBold", str(bold)))
            return "WarforgeSans", "WarforgeSansBold"
    return "Helvetica", "Helvetica-Bold"


FONT, FONT_BOLD = register_fonts()
BASE = getSampleStyleSheet()
STYLES = {
    "Title": ParagraphStyle("Title", parent=BASE["Title"], fontName=FONT_BOLD, fontSize=25, leading=29, textColor=NAVY, alignment=TA_LEFT, spaceAfter=8),
    "Subtitle": ParagraphStyle("Subtitle", parent=BASE["Normal"], fontName=FONT, fontSize=11, leading=15, textColor=MUTED, spaceAfter=10),
    "H1": ParagraphStyle("H1", parent=BASE["Heading1"], fontName=FONT_BOLD, fontSize=16, leading=20, textColor=NAVY, spaceBefore=8, spaceAfter=7),
    "H2": ParagraphStyle("H2", parent=BASE["Heading2"], fontName=FONT_BOLD, fontSize=11.5, leading=14, textColor=TEAL, spaceBefore=7, spaceAfter=5),
    "H3": ParagraphStyle("H3", parent=BASE["Heading3"], fontName=FONT_BOLD, fontSize=9.5, leading=12, textColor=INK, spaceBefore=5, spaceAfter=4),
    "Body": ParagraphStyle("Body", parent=BASE["BodyText"], fontName=FONT, fontSize=8.2, leading=11.2, textColor=INK, spaceAfter=5),
    "Lead": ParagraphStyle("Lead", parent=BASE["BodyText"], fontName=FONT, fontSize=9.1, leading=13.2, textColor=INK, spaceAfter=7),
    "Small": ParagraphStyle("Small", parent=BASE["BodyText"], fontName=FONT, fontSize=6.7, leading=8.5, textColor=MUTED),
    "Table": ParagraphStyle("Table", parent=BASE["BodyText"], fontName=FONT, fontSize=6.2, leading=7.6, textColor=INK),
    "TableHead": ParagraphStyle("TableHead", parent=BASE["BodyText"], fontName=FONT_BOLD, fontSize=6.2, leading=7.5, textColor=WHITE),
    "Callout": ParagraphStyle("Callout", parent=BASE["BodyText"], fontName=FONT, fontSize=8.3, leading=11.5, textColor=NAVY, backColor=PALE, borderColor=TEAL, borderWidth=.7, borderPadding=7, spaceAfter=8),
    "Warning": ParagraphStyle("Warning", parent=BASE["BodyText"], fontName=FONT, fontSize=7.8, leading=10.5, textColor=INK, backColor=colors.HexColor("#FFF0DD"), borderColor=ORANGE, borderWidth=.7, borderPadding=6, spaceAfter=7),
    "Fact": ParagraphStyle("Fact", parent=BASE["BodyText"], fontName=FONT, fontSize=7.8, leading=10.5, textColor=INK, backColor=colors.HexColor("#EAF3ED"), borderColor=GREEN, borderWidth=.7, borderPadding=6, spaceAfter=7),
    "Cover": ParagraphStyle("Cover", parent=BASE["BodyText"], fontName=FONT_BOLD, fontSize=8, leading=11, textColor=TEAL),
}


def clean(value: Any) -> str:
    text = str("" if value is None else value)
    text = re.sub(r"<[^>]+>", "", text)
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


class GuideDoc(BaseDocTemplate):
    def __init__(self, filename: str):
        width, height = A4
        super().__init__(filename, pagesize=A4, leftMargin=14 * mm, rightMargin=14 * mm,
                         topMargin=16 * mm, bottomMargin=14 * mm,
                         title="Guide tactique Forgefather's Seekers", author="Warforge")
        self.page_width, self.page_height = width, height
        frame = Frame(self.leftMargin, self.bottomMargin, self.width, self.height, id="normal")
        self.addPageTemplates(PageTemplate(id="guide", frames=[frame], onPage=self.decorate))

    def decorate(self, canvas, _doc):
        canvas.saveState()
        canvas.setFillColor(NAVY)
        canvas.rect(0, self.page_height - 8 * mm, self.page_width, 8 * mm, fill=1, stroke=0)
        canvas.setFillColor(WHITE)
        canvas.setFont(FONT_BOLD, 6.7)
        canvas.drawString(14 * mm, self.page_height - 5.2 * mm, "WARFORGE 40K - GUIDE TACTIQUE V11")
        canvas.setFillColor(MUTED)
        canvas.setFont(FONT, 6.3)
        canvas.drawString(14 * mm, 6.5 * mm, "Space Marines (identite Salamanders) - Forgefather's Seekers")
        canvas.drawRightString(self.page_width - 14 * mm, 6.5 * mm, f"{canvas.getPageNumber()} - {SNAPSHOT_DATE}")
        canvas.restoreState()


CHART_AUDIT: list[dict[str, Any]] = []


class GroupBarChart(Flowable):
    def __init__(self, values: list[tuple[str, float]], width=175 * mm, height=70 * mm):
        super().__init__(); self.values = values; self.width = width; self.height = height
        CHART_AUDIT.append({
            "id": "group-points", "type": "horizontal-bar",
            "title": "Repartition des 2 000 points par ensemble operationnel",
            "population": "Liste principale, n=6 ensembles",
            "xAxis": {"label": "Cout", "unit": "points", "minimum": 0, "maximum": 500, "ticks": [0, 100, 200, 300, 400, 500]},
            "yAxis": {"label": "Ensembles", "unit": "categorie", "ticks": [x[0] for x in values]},
            "legend": False,
        })

    def wrap(self, avail_width, _avail_height): self.actual_width = min(self.width, avail_width); return self.actual_width, self.height

    def draw(self):
        w = getattr(self, "actual_width", self.width); left, right, bottom, top = 95, w - 15, 30, self.height - 29
        c = self.canv; c.setFillColor(NAVY); c.setFont(FONT_BOLD, 8.5)
        c.drawCentredString(w / 2, self.height - 11, "Repartition des 2 000 points par ensemble operationnel")
        c.setFillColor(MUTED); c.setFont(FONT, 6.1); c.drawCentredString(w / 2, self.height - 21, "Liste principale - n=6 ensembles")
        for tick in [0, 100, 200, 300, 400, 500]:
            x = left + (right - left) * tick / 500
            c.setStrokeColor(GRID); c.line(x, bottom, x, top)
            c.setFillColor(MUTED); c.setFont(FONT, 5.8); c.drawCentredString(x, bottom - 9, str(tick))
        row_h = (top - bottom) / len(self.values)
        for i, (label, value) in enumerate(self.values):
            y = top - (i + .72) * row_h
            c.setFillColor(MUTED); c.setFont(FONT, 5.8); c.drawRightString(left - 5, y, clean(label)[:32])
            c.setFillColor(GOLD if i == 0 else TEAL); c.rect(left, y - 1, (right - left) * value / 500, max(3, row_h * .45), fill=1, stroke=0)
            c.setFillColor(INK); c.setFont(FONT_BOLD, 5.8); c.drawString(left + (right-left)*value/500 + 3, y, f"{int(value)} pts")
        c.setFillColor(MUTED); c.setFont(FONT, 6.1); c.drawCentredString((left+right)/2, 3, "Cout de l'ensemble (points) - echelle 0 a 500")
        c.saveState(); c.translate(8, (bottom+top)/2); c.rotate(90); c.drawCentredString(0, 0, "Ensembles (categories)"); c.restoreState()


class RoleHeatmap(Flowable):
    def __init__(self, rows: list[tuple[str, list[int]]], cols: list[str], width=175 * mm, height=80 * mm):
        super().__init__(); self.rows=rows; self.cols=cols; self.width=width; self.height=height
        CHART_AUDIT.append({
            "id": "role-heatmap", "type": "heatmap", "title": "Responsabilites des ensembles",
            "population": f"Liste principale, n={len(rows)} ensembles",
            "xAxis": {"label":"Fonctions tactiques", "unit":"categorie", "ticks":cols},
            "yAxis": {"label":"Ensembles", "unit":"categorie", "ticks":[x[0] for x in rows]},
            "colorScale": {"label":"Responsabilite", "unit":"niveau 0-4", "minimum":0, "maximum":4, "ticks":[0,1,2,3,4]}, "legend":True,
        })

    def wrap(self, avail_width, _avail_height): self.actual_width=min(self.width,avail_width); return self.actual_width,self.height

    def draw(self):
        c=self.canv; w=getattr(self,"actual_width",self.width); left,right,bottom,top=92,w-38,43,self.height-28
        c.setFillColor(NAVY); c.setFont(FONT_BOLD,8.5); c.drawCentredString(w/2,self.height-10,"Responsabilites des ensembles")
        c.setFillColor(MUTED); c.setFont(FONT,6.1); c.drawCentredString(w/2,self.height-20,f"Liste principale - n={len(self.rows)} ensembles - echelle 0 a 4")
        cw=(right-left)/len(self.cols); rh=(top-bottom)/len(self.rows)
        palette=[colors.HexColor("#F1F2ED"),colors.HexColor("#D7E6E4"),colors.HexColor("#9EC8C4"),colors.HexColor("#5C9D91"),colors.HexColor("#276A55")]
        for ri,(label,vals) in enumerate(self.rows):
            y=top-(ri+1)*rh; c.setFillColor(MUTED); c.setFont(FONT,5.6); c.drawRightString(left-4,y+rh*.35,clean(label)[:27])
            for ci,val in enumerate(vals):
                x=left+ci*cw; c.setFillColor(palette[val]); c.setStrokeColor(WHITE); c.rect(x,y,cw,rh,fill=1,stroke=1)
                c.setFillColor(WHITE if val>=3 else INK); c.setFont(FONT_BOLD,5.5); c.drawCentredString(x+cw/2,y+rh*.35,str(val))
        for ci,label in enumerate(self.cols):
            x=left+(ci+.5)*cw; c.saveState(); c.translate(x,bottom-3); c.rotate(45); c.setFillColor(MUTED); c.setFont(FONT,5.2); c.drawRightString(0,0,clean(label)[:18]); c.restoreState()
        lx=right+10
        for i,col in enumerate(palette): c.setFillColor(col); c.rect(lx,bottom+i*(top-bottom)/5,7,(top-bottom)/5+.2,fill=1,stroke=0)
        c.setFillColor(MUTED); c.setFont(FONT,5.3)
        for i in range(5): c.drawString(lx+10,bottom+i*(top-bottom)/4-2,str(i))
        c.drawCentredString((left+right)/2,2,"Fonctions tactiques (categories)")
        c.saveState(); c.translate(8,(bottom+top)/2); c.rotate(90); c.drawCentredString(0,0,"Ensembles (categories)"); c.restoreState()


class DistanceChart(Flowable):
    def __init__(self, series: list[tuple[str, list[tuple[int,float]]]], width=175*mm, height=76*mm):
        super().__init__(); self.series=series; self.width=width; self.height=height
        max_y=max(v for _,pts in series for _,v in pts); self.max_y=max(10,math.ceil(max_y/2)*2)
        CHART_AUDIT.append({
            "id":"distance-damage", "type":"line", "title":"Profil de pression selon la distance",
            "population":"Configurations minimales du snapshot, cible Infanterie E4/Sv3+/2PV, n=3 unites",
            "xAxis":{"label":"Distance","unit":"pouces","minimum":0,"maximum":36,"ticks":[0,9,12,18,24,36]},
            "yAxis":{"label":"Degats utiles moyens","unit":"PV","minimum":0,"maximum":self.max_y,"ticks":[round(self.max_y*i/5,1) for i in range(6)]},
            "legend":True,
        })

    def wrap(self,avail_width,_avail_height): self.actual_width=min(self.width,avail_width); return self.actual_width,self.height

    def draw(self):
        c=self.canv; w=getattr(self,"actual_width",self.width); left,right,bottom,top=40,w-18,31,self.height-34
        c.setFillColor(NAVY); c.setFont(FONT_BOLD,8.5); c.drawCentredString(w/2,self.height-10,"Profil de pression selon la distance")
        c.setFillColor(MUTED); c.setFont(FONT,5.8); c.drawCentredString(w/2,self.height-20,"Configurations minimales - cible Infanterie E4 / Sv3+ / 2 PV - n=3")
        for t in [0,9,12,18,24,36]:
            x=left+(right-left)*t/36; c.setStrokeColor(GRID); c.line(x,bottom,x,top); c.setFillColor(MUTED); c.drawCentredString(x,bottom-9,str(t))
        for i in range(6):
            val=self.max_y*i/5; y=bottom+(top-bottom)*i/5; c.setStrokeColor(GRID); c.line(left,y,right,y); c.setFillColor(MUTED); c.drawRightString(left-4,y-2,f"{val:.0f}")
        palette=[TEAL,GOLD,GREEN]
        for si,(label,pts) in enumerate(self.series):
            coords=[]
            for xval,yval in pts:
                x=left+(right-left)*xval/36; y=bottom+(top-bottom)*yval/self.max_y; coords.append((x,y)); c.setFillColor(palette[si]); c.circle(x,y,2,fill=1,stroke=0)
            c.setStrokeColor(palette[si]); c.setLineWidth(1.4)
            for a,b in zip(coords,coords[1:]): c.line(a[0],a[1],b[0],b[1])
            lx=left+si*(right-left)/3; c.setFillColor(palette[si]); c.rect(lx,top+5,8,2,fill=1,stroke=0); c.setFillColor(MUTED); c.setFont(FONT,5.5); c.drawString(lx+11,top+3,clean(label))
        c.setFillColor(MUTED); c.setFont(FONT,6); c.drawCentredString((left+right)/2,3,"Distance (pouces) - echelle 0 a 36")
        c.saveState(); c.translate(8,(bottom+top)/2); c.rotate(90); c.drawCentredString(0,0,"Degats utiles moyens (PV)"); c.restoreState()


MAIN_ALLOCATIONS = {
    "ref-forgefather-infernus-a": list(range(92, 102)),
    "ref-forgefather-infernus-b": list(range(102, 112)),
    "ref-forgefather-redeemer": [1],
    "ref-forgefather-eradicators": list(range(120, 126)),
    "ref-forgefather-aggressors": [131, 132, 133, 126, 127, 128],
    "ref-forgefather-bladeguard": [83, 84, 85],
    "ref-forgefather-assault-intercessors": [63, 64, 65, 66, 67, 48, 49, 50, 51, 52],
    "ref-forgefather-captain": [26],
    "ref-forgefather-scouts-a": list(range(180, 185)),
    "ref-forgefather-scouts-b": list(range(185, 190)),
    "ref-forgefather-lancer": [12],
    "ref-forgefather-ballistus": [5],
    "ref-forgefather-vindicator": [11],
}

GROUPS = [
    {"name":"Moteur de mission", "points":445, "units":"Vulkan He'stan + 2 x 10 Infernus", "roles":"Action, OC, pression Torrent, ancre", "preserve":"Vulkan et au moins un operateur Infernus", "abandon":"Si l'Action n'est ni legale ni rentable, redevenir une bulle de pression."},
    {"name":"Paquet de percee", "points":415, "units":"Land Raider Redeemer + 6 Aggressors", "roles":"Transport, anti-infanterie, contre-attaque", "preserve":"Redeemer jusqu'a la livraison ou au pivot de table", "abandon":"Ne pas forcer la sortie si elle expose les Aggressors sans echange utile."},
    {"name":"Batterie anti-char", "points":490, "units":"6 Eradicators + Gladiator Lancer + Ballistus", "roles":"Dommages concentres, acces aux cibles, lanes", "preserve":"Deux angles differents plutot qu'une batterie compacte", "abandon":"Changer de cible si l'ecran rend la cible prioritaire inaccessible."},
    {"name":"Contre-charge", "points":335, "units":"Captain + 3 Bladeguard + 10 Assault Intercessors", "roles":"OC, echange melee, reserve de milieu", "preserve":"Le Captain et son unite tant que le centre n'a pas bascule", "abandon":"Ne pas charger seulement pour faire des degats si cela perd l'objectif."},
    {"name":"Ecrans et rotation", "points":130, "units":"2 x 5 Scouts", "roles":"Infiltration, ecran, Action, reserve du R5", "preserve":"Au moins une unite pour le dernier tiers de partie", "abandon":"Sacrifier seulement contre un gain de tempo ou de score identifie."},
    {"name":"Canon de milieu", "points":185, "units":"Vindicator", "roles":"Menace centrale, denial, echange robuste", "preserve":"Tant qu'il interdit un couloir ou force une reaction", "abandon":"Accepter l'echange si cela securise le moteur d'Action."},
]

SCENARIO_PLANS = [
    {
        "mission":"Secure Asset", "opponent":"Take and Hold", "opponent_id":"take-and-hold",
        "mission_id":"gdm-2026-primary-secure-asset-priority-assets-vs-take-and-hold",
        "thesis":"Construire un socle autour d'une ressource exterieure fiable puis empecher Take and Hold de transformer trois objectifs en majorite.",
        "support":"Objectif exterieur protege, accessible aux Infernus et couvert par le Redeemer ou le Vindicator.",
        "priority":"Retirer ou contester l'unite adverse qui cree son troisieme objectif, plutot que surinvestir dans un duel deja gagne.",
        "preserve":"Un operateur Infernus, une releve Scout et une plateforme de tir capable de nettoyer la contestation.",
        "trade":"Une unite Scout peut etre echangee pour casser la majorite; Vulkan ne doit pas etre expose pour un simple gain de dommage.",
        "first":"Securiser une position sans montrer les trois plateformes lourdes; garder une deuxieme couche hors de la reponse adverse.",
        "second":"Utiliser la derniere activation pour contester le troisieme objectif adverse puis verrouiller la ressource.",
        "rounds":["R1 : etablir la ressource et conserver une sortie sure.","R2 : produire le cycle Action + controle et tester le troisieme objectif.","R3 : remplacer l'operateur, ne pas vider le home.","R4 : conserver deux menaces entre centre et home adverse.","R5 : jouer la derniere bascule d'OC avec les Scouts ou les Assault Intercessors."],
        "abort":"Abandonner l'Action si l'operateur ne peut pas encore controler en fin de tour ou si son exposition donne une majorite facile.",
        "fallback":"Tirer avec les Infernus, tenir deux positions et utiliser les plateformes pour retirer le troisieme objectif adverse.",
        "secondaries":"Naturels : Cleanse, Secure No Man's Land et Centre Ground. Plus couteux : Behind Enemy Lines si les Scouts sont deja requis pour le primaire.",
        "setup":"Une Infernus est a portee de la ressource; une unite adverse menace la contestation et le Redeemer peut ouvrir un angle.",
        "decision":"Commencer l'Action maintenant ou nettoyer d'abord la contestation ?",
        "a":"Si la contestation peut etre retiree sans exposer la releve, Action puis tir Infernus; conserver le Redeemer comme mur.",
        "b":"Si la contestation survivra probablement, ne pas declarer l'Action comme un acquis : nettoyer, ecranter et reporter le cycle.",
        "lesson":"Le plan n'est pas 'faire l'Action'; il est 'finir le tour avec un operateur qui controle encore'.",
    },
    {
        "mission":"Vital Link", "opponent":"Purge the Foe", "opponent_id":"purge-the-foe",
        "mission_id":"gdm-2026-primary-vital-link-priority-assets-vs-purge-the-foe",
        "thesis":"Maintenir la liaison de ressource sans offrir a Purge the Foe des unites faciles a detruire ni des echanges unitaires successifs.",
        "support":"Un objectif d'appui couvert par plusieurs portees; Scouts et Infernus alternent les taches, les vehicules absorbent la pression.",
        "priority":"Supprimer l'outil adverse qui combine destruction et prise d'objectif; eviter les cibles secondaires qui ne changent pas le score.",
        "preserve":"Les Scouts jusqu'a une fenetre de mission claire et au moins deux sources anti-char reparties.",
        "trade":"Le Vindicator peut etre offert pour casser le tempo adverse; une Infernus ne doit pas etre isolee en avant du dispositif.",
        "first":"Prendre l'espace avec le Redeemer sans debarquer automatiquement; refuser un premier echange facile.",
        "second":"Punir l'unite adverse exposee, puis avancer l'operateur derriere la zone nettoyee.",
        "rounds":["R1 : refuser les pertes gratuites et definir la liaison.","R2 : choisir un seul echange favorable et tenir la ressource.","R3 : faire pivoter le Redeemer ou le Vindicator sur l'axe menace.","R4 : proteger les petites unites encore capables d'Actions.","R5 : convertir les survivants en controle, pas en poursuite de destruction."],
        "abort":"Si la liaison exige d'offrir deux unites pour une seule fenetre, reduire l'ambition territoriale.",
        "fallback":"Jouer une bulle compacte, forcer Purge a venir et utiliser Torrent/contre-charge pour gagner l'echange.",
        "secondaries":"Naturels : Bring It Down et No Prisoners seulement si les cibles existent. Garder une carte d'Action ne doit pas obliger a alimenter le moteur de destruction adverse.",
        "setup":"Une Scout peut avancer vers la liaison, mais une unite adverse menace de la tuer puis de prendre la position.",
        "decision":"Envoyer la Scout seule ou investir une escorte ?",
        "a":"Si le Redeemer peut couper la ligne de reponse, envoyer la Scout comme operateur et garder l'Infernus comme releve.",
        "b":"Si l'adversaire marque sur la destruction et la position, ne pas nourrir ce double rendement : temporiser derriere le couvert.",
        "lesson":"Face a Purge, une activation de score ne doit pas devenir simultanement une cible de score adverse.",
    },
    {
        "mission":"Extract Relic", "opponent":"Disruption", "opponent_id":"disruption",
        "mission_id":"gdm-2026-primary-extract-relic-priority-assets-vs-disruption",
        "thesis":"Creer un convoi en trois couches : operateur, ecran et force de nettoyage, tout en empechant Disruption d'interrompre le passage cle.",
        "support":"Choisir la route qui garde deux couverts successifs et un angle de Redeemer; eviter le couloir le plus court s'il est facile a bloquer.",
        "priority":"Detruire ou repousser l'unite capable d'interrompre l'extraction, pas necessairement la plus dangereuse en degats.",
        "preserve":"Un Scout pour l'ouverture, une Infernus pour la releve et le Redeemer comme obstacle mobile.",
        "trade":"Les Assault Intercessors peuvent nettoyer un verrou; les Eradicators ne doivent pas devenir des operateurs de mission.",
        "first":"Occuper la route sans engager l'operateur final; montrer un faux axe avec une Scout.",
        "second":"Laisser Disruption reveler son verrou puis choisir la route opposee ou le supprimer par le feu.",
        "rounds":["R1 : reconnaitre deux routes et poser les ecrans.","R2 : engager l'operateur uniquement si la releve existe.","R3 : franchir la zone de rupture avec Redeemer/Vindicator.","R4 : proteger l'extraction plutot que chercher un nouveau front.","R5 : reserver une unite mobile pour la derniere interruption ou la derniere reprise."],
        "abort":"Si le passage exige d'exposer operateur et releve au meme tir, arreter l'extraction et nettoyer d'abord.",
        "fallback":"Transformer le convoi en ancre locale, tirer sur les outils de disruption et reprendre la sequence au tour suivant.",
        "secondaries":"Projection et Actions sont compatibles si les Scouts empruntent des axes differents. Eviter d'empiler deux Actions sur le meme operateur.",
        "setup":"La route courte est menacee; la route longue demande une Avance Infernus mais reste masquee.",
        "decision":"Prendre la route courte ou utiliser Compagnons du Chercheur sur la route longue ?",
        "a":"Si Vulkan est vivant et l'Action reste legale apres Avance, choisir la route longue et proteger l'arrivee.",
        "b":"Sans Vulkan ou sans releve, ne pas inferer la permission : nettoyer la route courte et retarder l'operateur.",
        "lesson":"La mobilite utile est celle qui conserve la legalite et la survie de l'Action, pas seulement la distance parcourue.",
    },
    {
        "mission":"Vanguard Operation", "opponent":"Reconnaissance", "opponent_id":"reconnaissance",
        "mission_id":"gdm-2026-primary-vanguard-operation-priority-assets-vs-reconnaissance",
        "thesis":"Avancer par bonds proteges pendant que Reconnaissance cherche la largeur, l'information et plusieurs zones independantes.",
        "support":"Un objectif d'appui central-decale, assez proche pour les Infernus mais pas sur l'axe de toutes les unites de projection adverses.",
        "priority":"Retirer la premiere unite independante qui ouvre une nouvelle zone de score, puis ecranter la seconde vague.",
        "preserve":"Les deux Scouts ne doivent pas etre depensees au meme round; une plateforme longue portee garde le flanc faible.",
        "trade":"Accepter un flanc secondaire si le centre et l'objectif d'appui restent stables.",
        "first":"Infiltrer les Scouts avec une voie de retrait; ne pas transformer l'avance en exposition simultanee.",
        "second":"Utiliser les lignes longues pour retirer une unite de reconnaissance apres qu'elle s'est declaree.",
        "rounds":["R1 : mesurer la largeur adverse et conserver les Scouts.","R2 : etablir le premier bond Infernus/vehicule.","R3 : casser une branche de projection adverse.","R4 : preparer la reserve mobile et fermer les coins.","R5 : choisir entre bascule de zone et protection de l'objectif d'appui."],
        "abort":"Si l'avance ouvre simultanement deux angles adverses, tenir la position et forcer Reconnaissance a s'etirer davantage.",
        "fallback":"Jouer le centre avec Redeemer/Vindicator et deleguer les bords aux Scouts en rotation.",
        "secondaries":"Centre Ground et Display of Might sont coherents. Behind Enemy Lines et Outflank deviennent couteux si les Scouts doivent aussi fermer les zones adverses.",
        "setup":"L'adversaire montre deux petites unites sur deux flancs; une seule peut etre retiree ce tour.",
        "decision":"Eliminer l'unite la plus proche ou celle qui ouvre le plus de zones ?",
        "a":"Tirer sur l'unite qui cree une nouvelle zone de score si sa perte ferme aussi un couloir.",
        "b":"Si elle est trop protegee, bloquer son mouvement avec un ecran et tuer la cible accessible sans disperser toute la liste.",
        "lesson":"Contre Reconnaissance, deny une zone peut valoir plus que maximiser les degats sur une unite centrale.",
    },
    {
        "mission":"Sabotage", "opponent":"Priority Assets", "opponent_id":"priority-assets",
        "mission_id":"gdm-2026-primary-sabotage-priority-assets-vs-priority-assets",
        "thesis":"Dans le miroir, gagner le tempo des operateurs : obliger l'adversaire a nettoyer avant d'agir pendant que les Infernus peuvent agir et rester offensives.",
        "support":"Une ressource exterieure avec deux voies d'acces et une releve; refuser une ancre unique que l'adversaire peut bloquer.",
        "priority":"Neutraliser l'operateur ou retirer son controle en fin de tour; le reste de l'armee n'est prioritaire que s'il protege cette fonction.",
        "preserve":"Vulkan, une Infernus et une Scout jusqu'au dernier round; garder 1 PC si Blazing Earth protege la sequence.",
        "trade":"Le Redeemer peut contester physiquement; ne pas depenser 2 PC offensifs si cela ouvre la charge decisive adverse.",
        "first":"Declarer une ressource defendable et presenter une deuxieme menace sans depenser les deux Scouts.",
        "second":"Contester l'Action adverse en fin de tour, puis effectuer la sienne sur un autre axe.",
        "rounds":["R1 : etablir deux operateurs potentiels.","R2 : forcer l'adversaire a choisir entre score et nettoyage.","R3 : remplacer l'operateur avant qu'il ne soit detruit.","R4 : garder les PC pour le duel de ressource.","R5 : prioriser OC et timing final plutot que l'attrition generale."],
        "abort":"Si les deux operateurs sont exposes au meme paquet adverse, renoncer a l'un des axes et concentrer la releve.",
        "fallback":"Contester avec un vehicule, tirer avec les Infernus et conserver l'Action pour une fenetre plus sure.",
        "secondaries":"Les deux camps aiment les Actions; Cleanse et Plunder ne doivent pas consommer l'unique operateur du primaire. Les Scouts portent les cartes laterales.",
        "setup":"Les deux camps peuvent agir sur des ressources opposees; vous pouvez depenser 2 PC offensifs ou conserver 1 PC defensif.",
        "decision":"Immolation Protocols maintenant ou reserve pour Blazing Earth/Armour of Contempt ?",
        "a":"Depenser offensivement seulement si la cible retire l'operateur ou la releve adverse et que la position reste defendable.",
        "b":"Sinon, tirer sans bonus et garder le PC qui protege la charge ou la sauvegarde critique.",
        "lesson":"Dans le miroir, le meilleur stratageme est celui qui change l'etat de la ressource, pas celui qui produit le plus de degats bruts.",
    },
]


def load_context(root: Path) -> dict[str, Any]:
    pwa = root / "warforge-pwa"
    kb_path = pwa / "data/strategy/knowledge-base.json"
    kb = json.loads(kb_path.read_text(encoding="utf-8"))
    salamanders = json.loads((pwa / "data/units/Salamanders.json").read_text(encoding="utf-8"))
    space_marines = json.loads((pwa / "data/units/Space Marines.json").read_text(encoding="utf-8"))
    roster = next(x for x in kb["referenceRosters"] if x["id"] == "reference-roster-salamanders-forgefather-secure-asset-2000")
    assessment_path = root / "output/pdf/detachment-inventory-report-2026-08-11/assessments.json"
    expert_path = root / "output/pdf/detachment-inventory-expert-report-2026-08-11/expert-assessments.json"
    prudent = json.loads(assessment_path.read_text(encoding="utf-8"))
    expert = json.loads(expert_path.read_text(encoding="utf-8"))

    def recursive_find(node: Any, wanted: str) -> dict[str, Any] | None:
        if isinstance(node, dict):
            if node.get("id") == wanted: return node
            for value in node.values():
                found = recursive_find(value, wanted)
                if found: return found
        elif isinstance(node, list):
            for value in node:
                found = recursive_find(value, wanted)
                if found: return found
        return None

    assessment = recursive_find(prudent, "space-marines:2000:forgefather-s-seekers")
    expert_assessment = recursive_find(expert, "expert:space-marines:2000:forgefather-s-seekers") or recursive_find(expert, "expert:salamanders:2000:forgefather-s-seekers")
    stats_paths = sorted((root / "deliverables/statistics-reports").glob("*/snapshot-statistique-exhaustif.json.gz"))
    if not stats_paths: raise RuntimeError("Snapshot statistique absent")
    stats_path = stats_paths[-1]
    with gzip.open(stats_path, "rt", encoding="utf-8") as stream: stats = json.load(stream)
    with (pwa / "data/inventory/datasheet_x_figs.csv").open(encoding="utf-8-sig", newline="") as stream:
        inventory = list(csv.DictReader(stream))
    return {"pwa":pwa,"kb":kb,"salamanders":salamanders,"space_marines":space_marines,"roster":roster,
            "assessment":assessment,"expert":expert_assessment,"stats":stats,"stats_path":stats_path,"inventory":inventory,
            "input_paths":[kb_path,pwa/"data/units/DataInfo.json",pwa/"data/units/Salamanders.json",pwa/"data/units/Space Marines.json",
                           pwa/"data/inventory/datasheet_x_figs.csv",assessment_path,expert_path,stats_path]}


def resolve_unit(ctx: dict[str, Any], unit_id: str) -> dict[str, Any]:
    match = re.match(r"book-(space-marines|salamanders):unit:(\d+)", unit_id)
    if not match: raise ValueError(unit_id)
    book = ctx["space_marines"] if match.group(1)=="space-marines" else ctx["salamanders"]
    return book["Units"][int(match.group(2))]


def build_guide_data(ctx: dict[str, Any]) -> dict[str, Any]:
    roster = ctx["roster"]["draft"]
    detachment = ctx["salamanders"]["Dettachments"][0]
    units=[]; total=0; enhancement_total=0
    seen_figures: set[int] = set()
    inventory_index={(row["UnitId"],int(row["ID_figurine"])):row["Type"] for row in ctx["inventory"]}
    for item in roster["items"]:
        raw=resolve_unit(ctx,item["unitId"]); point=raw["Points"][item["pointIndex"]]; cost=int(point["Cost"]); models=int(point.get("ModelCount",1)); total+=cost
        enhancement=None
        if item.get("enhancement"):
            enhancement=detachment["Enhancements"][item["enhancement"]["enhancementIndex"]]
            enhancement_total+=int(enhancement["Cost"]); total+=int(enhancement["Cost"])
        figures=MAIN_ALLOCATIONS.get(item["id"],[]); availability="hors inventaire autorise" if item["unitId"]=="book-salamanders:unit:1" else "inventaire"
        if figures:
            if len(figures)!=models: raise AssertionError(f"Allocation incorrecte {item['id']}: {len(figures)} != {models}")
            for fig in figures:
                if fig in seen_figures: raise AssertionError(f"Figurine reutilisee: {fig}")
                if (item["unitId"],fig) not in inventory_index: raise AssertionError(f"Association inventaire absente {item['unitId']} / {fig}")
                seen_figures.add(fig)
        elif item["unitId"]!="book-salamanders:unit:1": raise AssertionError(f"Allocation absente {item['id']}")
        units.append({"itemId":item["id"],"unitId":item["unitId"],"name":raw["Name"],"models":models,"points":cost,
                      "enhancement":enhancement["Name"] if enhancement else None,"enhancementCost":int(enhancement["Cost"]) if enhancement else 0,
                      "availability":availability,"figureIds":figures})
    if total!=2000: raise AssertionError(f"Total liste {total}")
    strict=[dict(x) for x in units if x["unitId"]!="book-salamanders:unit:1"]
    strict.append({"itemId":"inventory-strict-infernus-c","unitId":"book-space-marines:unit:17","name":"INFERNUS SQUAD","models":5,"points":85,
                   "enhancement":None,"enhancementCost":0,"availability":"inventaire - proxy","figureIds":[43,44,45,46,47]})
    if sum(x["points"]+x["enhancementCost"] for x in strict)!=2000: raise AssertionError("Variante stricte != 2000")

    disposition="gdm-2026-force-disposition-priority-assets"
    matchups=[]
    for guide in ctx["kb"]["matchupGuides"]:
        side=next((s for s in guide.get("sides",[]) if s["forceDispositionId"]==disposition),None)
        if not side: continue
        scenario=next(s for s in ctx["kb"]["scenarios"] if s["id"]==side["scenarioId"])
        if scenario["id"] not in {x["mission_id"] for x in SCENARIO_PLANS}: continue
        claims=[next(c for c in ctx["kb"]["tacticalClaims"] if c["id"]==cid) for cid in side.get("claimIds",[])+guide.get("globalClaimIds",[])]
        matchups.append({"guideId":guide["id"],"title":guide["title"],"layoutContextId":guide["layoutContextId"],"layoutId":guide["selectedLayoutId"],
                         "scenario":scenario,"claimIds":[c["id"] for c in claims],"claims":claims,"workedExampleId":guide.get("workedExampleId")})
    if len(matchups)!=5: raise AssertionError(f"Confrontations trouvees: {len(matchups)}")
    secondary=[]
    for guide in ctx["kb"]["secondaryMissionGuides"]:
        scenario=next(s for s in ctx["kb"]["scenarios"] if s["id"]==guide["scenarioId"])
        secondary.append({"id":guide["id"],"title":scenario["title"].replace(" - briefing GDM",""),"familyId":guide["familyId"],
                          "capabilityRequirements":guide["capabilityRequirements"],"claimIds":guide["claimIds"],"decisionExampleIds":guide["decisionExampleIds"]})
    if len(secondary)!=18: raise AssertionError(f"Secondaires trouvees: {len(secondary)}")
    capabilities=sorted({req["capability"] for mission in secondary for req in mission["capabilityRequirements"]})
    if len(capabilities)!=10: raise AssertionError(f"Capacites trouvees: {len(capabilities)}")

    stat_units={u["id"]:u for u in ctx["stats"]["units"]}
    series=[]
    for uid,label in [("book-space-marines:unit:17","Infernus (5)"),("book-space-marines:unit:66","Land Raider Redeemer"),("book-space-marines:unit:33","Aggressors (3)")]:
        rows=stat_units[uid]["offenseScenarios"]; points=[]
        for distance in [0,9,12,18,24,36]:
            modes=[x for x in rows if x["targetId"]=="infantry" and x["distance"]==distance and x["mode"] in ("melee","standard-ranged","vehicle-combined")]
            points.append((distance,max((x["usefulDamage"]["mean"] for x in modes),default=0)))
        series.append((label,points))
    return {
        "schemaVersion":REPORT_SCHEMA,"guideVersion":GUIDE_VERSION,"status":"draft/preliminary","snapshotDate":SNAPSHOT_DATE,
        "catalogVersion":CATALOG_VERSION,"engineVersion":ctx["stats"]["engineVersion"],"missionPackId":"gdm-2026-11th",
        "detachment":{"id":DETACHMENT_ID,"name":detachment["Name"],"costDP":detachment["Cost"],"forceDisposition":"PRIORITY ASSETS",
                      "rule":detachment["Rule"],"stratagems":detachment["Stratagems"],"enhancements":detachment["Enhancements"]},
        "mainRoster":{"title":ctx["roster"]["title"],"points":total,"enhancementPoints":enhancement_total,"units":units,
                      "inventoryException":{"unitId":"book-salamanders:unit:1","name":"VULKAN HE'STAN","reason":"Cle du moteur Compagnons du Chercheur et du plan OC/Torrent-Melta."}},
        "inventoryStrictRoster":{"points":2000,"units":strict,"lostEffects":["Seeker's Companions","Inspiring Commander","Forgefather","Seeker of the Unfound"]},
        "groups":GROUPS,"scenarioPlans":SCENARIO_PLANS,"primaryMatchups":sorted(matchups,key=lambda x:x["scenario"]["title"]),
        "secondaryMissions":secondary,"capabilities":capabilities,"statistics":{"distances":ctx["stats"]["distances"],"series":series,
            "assumptions":ctx["stats"]["assumptions"],"catalogFingerprint":ctx["stats"]["catalogFingerprint"]},
        "analyses":{"prudent":ctx["assessment"],"expert":ctx["expert"]},
        "assumptions":["Aucun PC, timing, resultat de des, cible, portee, ligne de vue ou condition de score n'est suppose satisfait.",
                       "Les briefs GDM sont une archive approuvee non officielle; la carte active reste la reference a la table.",
                       "Les valeurs statistiques sont des baselines theoriques et non des promesses de resultat."],
    }


def table(rows: list[list[Any]], widths: list[float], repeat=1, small=False) -> LongTable:
    styles = STYLES["Table"]
    data=[]
    for ri,row in enumerate(rows): data.append([cell if hasattr(cell,"wrap") else p(cell,"TableHead" if ri==0 else "Table") for cell in row])
    t=LongTable(data,colWidths=widths,repeatRows=repeat,hAlign="LEFT")
    t.setStyle(TableStyle([
        ("BACKGROUND",(0,0),(-1,0),NAVY),("TEXTCOLOR",(0,0),(-1,0),WHITE),("GRID",(0,0),(-1,-1),.35,GRID),
        ("VALIGN",(0,0),(-1,-1),"TOP"),("LEFTPADDING",(0,0),(-1,-1),4),("RIGHTPADDING",(0,0),(-1,-1),4),
        ("TOPPADDING",(0,0),(-1,-1),3),("BOTTOMPADDING",(0,0),(-1,-1),3),
        ("ROWBACKGROUNDS",(0,1),(-1,-1),[WHITE,colors.HexColor("#F3F6F5")]),
    ])); return t


def unit_image(root: Path, slug: str, width=42*mm, height=28*mm) -> Image | None:
    path=root/"warforge-pwa/public/data/img/units"/f"{slug}.webp"
    if not path.exists(): return None
    im=Image(str(path),width=width,height=height); im.hAlign="LEFT"; return im


def scenario_section(story: list[Any], plan: dict[str, Any], matchup: dict[str, Any]):
    scenario=matchup["scenario"]
    opponent_logic={
        "Take and Hold":"Take and Hold cherche surtout a transformer la largeur de table en majorite. Son plan devient dangereux lorsqu'il conserve trois objectifs contre deux : une seule contestation peut alors faire basculer plusieurs conditions de score a la fois. Votre reponse n'est donc pas de tenir toujours plus fort votre meilleur objectif, mais de rendre instable son objectif le plus faible.",
        "Purge the Foe":"Purge the Foe veut que chaque unite exposee lui rapporte deux fois : une destruction, puis une position plus facile a reprendre. Les petites unites de mission ne doivent pas avancer seules si leur perte ouvre aussi l'objectif. Il faut construire des echanges groupes, avec une premiere unite qui agit et une seconde qui menace immediatement la reponse.",
        "Disruption":"Disruption ne demande pas necessairement de detruire votre ancre. Il lui suffit souvent d'interrompre la route, d'occuper la zone au mauvais moment ou de vous faire recommencer une sequence. La valeur d'une unite adverse se mesure donc a sa capacite a casser le passage, pas seulement a son profil de dommages.",
        "Reconnaissance":"Reconnaissance gagne en etirant la partie. Plusieurs petites unites independantes peuvent ouvrir des zones et obliger votre bloc central a choisir. Vous ne pourrez pas fermer tous les axes en meme temps : l'enjeu consiste a identifier celui dont la perte modifie vraiment le primaire, puis a conceder temporairement le reste.",
        "Priority Assets":"Le miroir Priority Assets est une course au tempo des operateurs. Les deux camps savent qu'une petite contestation peut obliger l'autre a consacrer une activation offensive avant de commencer son Action. Votre avantage vient de la souplesse des Infernus avec Vulkan, mais seulement tant que l'operateur, la releve et le budget de PC ne sont pas exposes ensemble.",
    }
    story += [PageBreak(), p(f"{plan['mission']} contre {plan['opponent']}","H1"),
              p(f"Confrontation {plan['mission']} / {plan['opponent']} - Force Disposition Priority Assets - layout conceptuel {matchup['layoutId']}","Subtitle"),
              p(plan["thesis"],"Lead"),
              p("Comprendre le duel avant de deployer","H2"),
              p(opponent_logic[plan["opponent"]]),
              p("Votre moteur Priority Assets fonctionne differemment. Il cherche d'abord une ressource exploitable et une sequence repetable. Une position qui semble solide mais qui exige chaque tour le Redeemer, les Infernus et deux plateformes de tir n'est pas une vraie ressource : c'est toute votre armee concentree au meme endroit."),
              p("La premiere decision consiste donc a choisir un point d'appui qui reste utile meme si l'Action n'est pas possible ce tour-ci. "+plan["support"]),
              p("Ce que la carte vous demande de verifier","H2"),
              p("Warforge retient les fenetres ci-dessous pour construire le plan. Les valeurs exactes et toutes les conditions restent celles de la carte active :"),
              bullets(scenario.get("scoringWindows",[])),
              p("La carte active determine toujours les conditions et valeurs exactes. Le guide ne transforme aucune fenetre en score acquis.","Warning"),
              p("Donner un role a chaque couche","H2"),
              p("Les Scouts ouvrent la partie. Ils revelent la route, ferment une zone ou obligent l'adversaire a montrer sa premiere unite de contestation. Ils ne sont pas la ressource elle-meme : leur valeur vient de l'information et du temps qu'ils achetent."),
              p("Derriere eux, Vulkan et les Infernus constituent le moteur de mission. Le Redeemer ou le Vindicator ne prennent le relais que lorsque l'adversaire engage une vraie ressource. Enfin, Lancer, Ballistus et Eradicators nettoient depuis des angles separes. Cette profondeur evite qu'un seul mouvement adverse puisse toucher l'operateur, sa releve et son soutien."),
              p("Dans cette confrontation, la cible prioritaire est donc la suivante : "+plan["priority"]),
              p("Il faut en revanche proteger "+plan["preserve"].lower()+". "+plan["trade"]),
              p("Jouer en premier ou en second","H2"),
              rich(f"<b>Si vous jouez en premier.</b> {esc(plan['first'])}","Callout"),
              rich(f"<b>Si vous jouez en second.</b> {esc(plan['second'])}","Fact"),
              PageBreak(), p("Le fil de la partie, round apres round","H2")]
    for index, text in enumerate(plan["rounds"], start=1):
        explanation=[
            "Le premier round sert a installer le probleme que l'adversaire devra resoudre. Ne depensez pas votre releve pour ameliorer un tir sans consequence sur la mission.",
            "Au deuxieme round, le moteur de score devient concret. C'est le moment de verifier si l'operateur, le nettoyeur et le soutien peuvent agir dans le bon ordre.",
            "Le troisieme round est souvent celui de la premiere vraie attrition. Remplacer une unite detruite vaut davantage que poursuivre une cible qui fuit le plan de score.",
            "Au quatrieme round, toute unite encore intacte doit deja avoir un role pour la fin de partie. Une ressource utilisee sans plan pour le round cinq est probablement surinvestie.",
            "Le cinquieme round recompense le dernier controle legal. Les Scouts, Assault Intercessors ou un vehicule survivant doivent etre mesures comme outils de bascule, pas seulement comme dommages restants.",
        ][index-1]
        story += [p(f"Round {index}","H3"),p(text+" "+explanation)]
    story += [p("Savoir renoncer sans perdre le plan","H2"),
              p("Une bonne sequence de mission comprend toujours une condition d'abandon. "+plan["abort"]),
              p("Renoncer ne signifie pas passer un tour vide. La ligne de repli est la suivante : "+plan["fallback"]),
              p("Faire cohabiter primaire et secondaires","H2"),
              p(plan["secondaries"]+" Le principe reste de confier la carte secondaire a l'unite la moins structurante. Si la meme Infernus doit porter le primaire, nettoyer la ressource et accomplir une seconde Action, le plan est deja trop fragile."),
              p("Le contre-jeu que l'adversaire cherchera","H2"),
              p("L'adversaire cherchera rarement a battre toute votre ancre frontalement. Il essaiera plutot de contester l'operateur avec une petite unite, d'isoler Vulkan, de couper les lignes Torrent/Melta ou de vous faire depenser 2 PC avant sa charge. La meilleure protection est une releve separee, pas un empilement supplementaire sur le meme objectif."),
              p("Une situation typique","H2"),
              p(plan["setup"]+" La question n'est pas seulement de savoir ce qui produit le plus de dommages, mais quelle branche conserve un plan coherent si l'adversaire reussit sa reponse."),
              rich(f"<b>Point de decision :</b> {esc(plan['decision'])}","Callout"),
              p("Dans une fenetre favorable, "+plan["a"][0].lower()+plan["a"][1:]),
              p("Dans une fenetre fragile, "+plan["b"][0].lower()+plan["b"][1:]),
              rich(f"<b>A retenir :</b> {esc(plan['lesson'])}","Fact"),
              p("Resume de la confrontation","H2"),
              table([["Point d'appui","Cible prioritaire","A preserver"],[plan["support"],plan["priority"],plan["preserve"]]],[58*mm,59*mm,58*mm]),
              p("Traçabilite","H2"), p("Claims reutilises : "+", ".join(matchup["claimIds"]),"Small")]


def build_markdown(data: dict[str, Any]) -> str:
    lines=["# Guide tactique Space Marines - Forgefather's Seekers","",f"> Version {GUIDE_VERSION} - {SNAPSHOT_DATE} - statut `draft/preliminary`","",
           "## Lecture en deux minutes","","Le plan est de creer une ressource fiable avec Vulkan et les Infernus, de la proteger par couches, puis de conserver une unite de bascule pour le cinquieme round.","",
           "## Liste principale - 2 000 points","","| Unite | Figurines | Points | Optimisation | Inventaire |","|---|---:|---:|---|---|"]
    for u in data["mainRoster"]["units"]:
        lines.append(f"| {u['name']} | {u['models']} | {u['points'] + u['enhancementCost']} | {u['enhancement'] or '-'} | {u['availability']} |")
    lines += ["", "Vulkan He'stan est l'unique exception hors inventaire. La variante stricte le remplace par 5 Infernus pour conserver 2 000 points.","",
              "## Regle, stratagemes et optimisations","",
              "- Quete de Vulkan : les armes de tir Adeptus Astartes ont Assault et gagnent +1 en Force contre une cible a 12 pouces ou moins.",
              "- Compagnons du Chercheur : avec Vulkan dans l'armee, les Infernus peuvent conditionnellement commencer une Action apres une Avance ou tirer apres avoir commence une Action.",""]
    strat_fr={
        "Armour Of Contempt":"degrader de 1 la PA des attaques qui ciblent l'unite pendant la sequence.",
        "Crucible Of Battle":"ajouter 1 au jet de Blessure contre la cible eligible la plus proche a 6 pouces.",
        "Wrathful Inferno":"permettre a l'unite Infantry qui vient de Fall Back de tirer ce tour.",
        "Immolation Protocols":"donner Blessures Devastatrices aux armes Torrent de l'unite pour la phase.",
        "Burning Vengeance":"faire debarquer puis tirer une unite transportee contre l'unite ennemie qui vient de tirer.",
        "Blazing Earth":"infliger -2 a la charge d'une cible eligible a 12 pouces d'un porteur Torrent.",
    }
    for strat in data["detachment"]["stratagems"]:
        lines.append(f"- **{strat['Name']} ({strat['CPCost']} PC)** : {strat_fr[strat['Name']]}")
    lines += [""]
    enhancement_fr={
        "Immolator":"ajouter 1 aux Attaques des armes Torrent de l'unite menee.",
        "War-Tempered Artifice":"ajouter 3 a la Force des armes de melee du porteur.",
        "Forged In Battle":"changer conditionnellement un jet de Touche ou de sauvegarde en 6 non modifie, une fois par tour.",
        "Adamantine Mantle":"reduire les Degats subis par le porteur, avec une protection particuliere contre Melta et Torrent.",
    }
    for enhancement in data["detachment"]["enhancements"]:
        lines.append(f"- **{enhancement['Name']} ({enhancement['Cost']} pts)** : {enhancement_fr[enhancement['Name']]}")
    lines += ["","## Ensembles operationnels",""]
    for group in data["groups"]:
        lines += [f"### {group['name']} - {group['points']} pts","",f"- Composition : {group['units']}",f"- Roles : {group['roles']}",f"- A preserver : {group['preserve']}",f"- Abandon : {group['abandon']}",""]
    lines += ["## Doctrine de portee","","| Palier | Decision |","|---|---|",
              "| Melee / engagement | Choisir le mode Pistol ou melee legal; les autres armes ne sont pas supposees eligibles. |",
              "| 0-9 pouces | Melta a demi-portee, Torrent et +1 Force : rendement maximal, risque de contre-charge maximal. |",
              "| 10-12 pouces | Torrent et +1 Force sans bonus Melta de demi-portee : zone de travail frequente des Infernus. |",
              "| 13-18 pouces | Melta sans +1 Force; les Infernus n'ont plus de pyreblaster a portee. |",
              "| 19-24 pouces | Armes 24 pouces et Rapid Fire selon leur propre demi-portee. |",
              "| 25-36+ pouces | Lancer, Ballistus, missiles et canons longs ouvrent les voies. |","",
              "## Secondaires tactiques - 18 cartes","","| Mission | Famille | Capacites requises |","|---|---|---|"]
    for mission in sorted(data["secondaryMissions"], key=lambda x: (x["familyId"], x["title"])):
        requirements=", ".join(f"{req['capability']} ({req['importance']})" for req in mission["capabilityRequirements"])
        lines.append(f"| {mission['title']} | {mission['familyId']} | {requirements} |")
    lines += ["","Regle de decision : accomplir avec l'unite la moins structurante; conserver seulement avec un horizon explicite; distinguer defausse volontaire de fin de tour et remplacement unique a 1 PC; verifier toute clause au tirage.","",
              "## Cinq confrontations primaires",""]
    for plan in SCENARIO_PLANS:
        lines += [f"### {plan['mission']} contre {plan['opponent']}","",plan["thesis"],"",f"- Objectif d'appui : {plan['support']}",f"- Cible prioritaire : {plan['priority']}",f"- Abandon : {plan['abort']}",f"- Repli : {plan['fallback']}","","Plan par round :"]
        lines += [f"{i+1}. {text}" for i,text in enumerate(plan["rounds"])]
        lines += ["",f"Exemple : {plan['setup']} **Decision :** {plan['decision']}",f"- Branche A : {plan['a']}",f"- Branche B : {plan['b']}",f"- Lecon : {plan['lesson']}",""]
    lines += ["## Secondaires tactiques","","Les 18 cartes sont couvertes dans le PDF et le JSON avec leur famille, leurs capacites requises et les unites responsables.","",
              "## Limites","","- Verifier les cartes et les regles officielles actives a la table.","- Aucune condition de jeu ni aucun resultat de des n'est suppose satisfait.","- Les conseils sont des infererences pedagogiques, pas des taux de victoire.",""]
    return "\n".join(lines)


def build_pdf(root: Path, out_path: Path, data: dict[str, Any]):
    story: list[Any]=[]
    cover=unit_image(root,"land-raider-redeemer",175*mm,67*mm)
    story += [Spacer(1,14*mm),p("FORGEFATHER'S SEEKERS","Title"),p("Guide tactique complet - Space Marines, identite Salamanders","Subtitle")]
    if cover: story += [cover,Spacer(1,5*mm)]
    story += [p("2 000 points - 2 DP - Force Disposition PRIORITY ASSETS","Cover"),Spacer(1,5*mm),
              rich("<b>But du guide.</b> Transformer les regles du detachement, les cinq confrontations primaires possibles et le portefeuille secondaire en decisions simples a la table.","Callout"),
              p("Ce document distingue les faits du catalogue, les calculs du moteur et les infererences tactiques. Il ne fournit ni probabilite de victoire ni resultat garanti.","Warning"),
              Spacer(1,8*mm),p(f"Catalogue {CATALOG_VERSION} - moteur {data['engineVersion']} - mission pack GDM 2026 V11", "Small"),PageBreak()]
    story += [p("Mode d'emploi","H1"),rich("<b>En 30 secondes :</b> choisissez une ressource exterieure, nommez l'operateur, la releve et l'unite qui nettoie. Gardez au moins une unite mobile pour le round 5.","Callout"),
              p("Les cinq confrontations - et seulement cinq","H2"),
              table([["Votre disposition","Mission","Disposition adverse"]]+[["Priority Assets",x["mission"],x["opponent"]] for x in SCENARIO_PLANS],[42*mm,67*mm,66*mm]),
              p("Sommaire","H2"),bullets(["Identite et regles du detachement","Liste principale et variante inventaire stricte","Ensembles operationnels, portees et budget de PC",
                                            "Couverture des 18 secondaires","Cinq chapitres de confrontation primaire","Exemples, alternatives et aide-memoire"]),
              p("Hypotheses visibles","H2"),bullets(data["assumptions"]),PageBreak()]

    det=data["detachment"]
    story += [p("1. Comprendre le detachement","H1"),rich("<b>Identite :</b> une armee de courte portee qui avance sans couper son tir, transforme les Infernus en operateurs de mission avec Vulkan, et fait payer les contestations par Torrent, Melta et contre-charge.","Callout"),
              p("Forgefather's Seekers n'est pas seulement un detachement de lance-flammes. Son interet vient de la facon dont il relie trois besoins qui entrent normalement en concurrence : avancer vers une ressource, accomplir une Action et conserver une menace de tir. Vulkan et les Infernus forment la charniere de ce plan, tandis que le reste de la liste cree l'espace dont ils ont besoin.","Lead"),
              p("Faits officiels structures","H2"),
              p("Restriction : votre armee peut inclure des unites Salamanders, mais aucune unite Adeptus Astartes issue d'un autre Chapitre.","Fact"),
              p("Quete de Vulkan : les armes de tir des figurines Adeptus Astartes de l'armee ont Assault. Lorsqu'une telle attaque cible une unite a 12 pouces ou moins, elle gagne +1 en Force.","Fact"),
              p("Compagnons du Chercheur : si Vulkan He'stan est dans l'armee, chaque Escouade Infernus peut, pendant votre tour et sous les conditions de mission, commencer une Action apres avoir Avance ou tirer pendant un tour ou elle a commence une Action.","Fact"),
              p("Ces deux regles ne doivent pas etre lues comme une autorisation de foncer. Assault facilite la projection, mais une Avance qui place l'operateur sans releve devant toute l'armee adverse reste une mauvaise Avance. De meme, tirer apres avoir commence une Action n'a de valeur que si ce tir protege l'accomplissement de l'Action ou retire une contestation importante."),
              p("La zone critique de 12 pouces","H2"),bullets(["Toutes les armes de tir Adeptus Astartes ont Assault via le detachement.","A 12 pouces ou moins, les attaques de tir gagnent +1 en Force.",
                    "Les Infernus et Aggressors Torrent atteignent leur plein role de pression.","Les armes Melta de portee 18 pouces gagnent leur bonus Melta a 9 pouces; ne pas confondre ce seuil avec le bonus de Force a 12 pouces."]),
              p("Ce que Vulkan change","H2"),bullets(["Les Infernus non Personnage passent a OC 2 tant qu'elles ne sont pas Battle-shocked.","Une cible visible a 24 pouces peut etre designee pour relancer les Blessures des armes Torrent ou Melta qui la visent.",
                    "La premiere mise en place de Vulkan associe un objectif a son role d'ancre.","Compagnons du Chercheur autorise conditionnellement Action apres Avance ou tir apres avoir commence une Action."]),PageBreak()]

    strat_rows=[["Stratageme","PC","Quand / cible","Usage conseille","Garde-fou"]]
    use_map={
        "Armour Of Contempt":"Preserver l'unite qui tient la ressource ou le Redeemer sous feu concentre.",
        "Crucible Of Battle":"Convertir une unite Infantry proche de sa cible en echange decisif.",
        "Wrathful Inferno":"Desengager une unite Infantry puis conserver son tir utile.",
        "Immolation Protocols":"Transformer une activation Torrent majeure en Blessures Devastatrices.",
        "Burning Vengeance":"Faire sortir une unite embarquee apres le tir adverse et repondre a cette unite.",
        "Blazing Earth":"Penaliser une charge eligible contre un porteur Torrent.",
    }
    guard={
        "Armour Of Contempt":"Ne protege qu'une sequence d'attaques; verifier la cible et le timing.","Crucible Of Battle":"Cible la plus proche et a 6 pouces; ne pas l'inferer.",
        "Wrathful Inferno":"Unite Infantry qui vient de Fall Back; n'autorise pas automatiquement une Action.","Immolation Protocols":"2 PC et Torrent utile; ne pas vider la reserve defensive sans gain de mission.",
        "Burning Vengeance":"Transport cible, passagers embarques, cible adverse encore eligible.","Blazing Earth":"Exclusions Monster/Vehicle/Fly, portee/visibilite et 1 PC.",
    }
    timing_fr={
        "Armour Of Contempt":"Apres qu'une unite ennemie a choisi ses cibles : une unite Adeptus Astartes ciblee.",
        "Crucible Of Battle":"Phase de Tir ou de Combat : une unite Adeptus Astartes Infantry pas encore activee.",
        "Wrathful Inferno":"Apres un Fall Back : cette unite Adeptus Astartes Infantry.",
        "Immolation Protocols":"Phase de Tir : une unite Adeptus Astartes qui n'a pas encore tire.",
        "Burning Vengeance":"Apres le tir d'une unite ennemie : un Transport Adeptus Astartes qu'elle a cible.",
        "Blazing Earth":"Debut de la phase de Charge adverse : une unite Adeptus Astartes equipee de Torrent.",
    }
    for s in det["stratagems"]: strat_rows.append([s["Name"],str(s["CPCost"]),timing_fr[s["Name"]],use_map[s["Name"]],guard[s["Name"]]])
    story += [p("2. Stratagemes et optimisations","H1"),table(strat_rows,[28*mm,9*mm,48*mm,48*mm,42*mm]),
              p("Le tableau ci-dessus sert d'index, pas de plan automatique. Cette armee peut facilement depenser ses PC plus vite qu'elle ne construit son avantage : Immolation Protocols reclame 2 PC, tandis que la position avancee peut encore demander Armour of Contempt ou Blazing Earth pendant la reponse adverse."),
              p("Avant chaque depense offensive, revenez donc a la mission. Si le stratageme retire l'operateur adverse, sa releve ou l'unite qui cree la majorite, il peut justifier son cout. S'il ne fait qu'augmenter des dommages sur une cible qui ne change pas le score, la reserve defensive est souvent plus importante."),
              p("Arbre de decision PC","H2"),
              bullets(["1. Une condition de score ou la survie de l'operateur depend-elle de ce PC ? Si oui, reserver la reponse defensive.","2. La depense offensive retire-t-elle l'operateur, la releve ou le troisieme objectif adverse ? Si non, tirer sans bonus.",
                       "3. Le Captain peut-il legalement reduire la depense de son propre groupe ? Verifier que son unite est bien la cible du stratageme.","4. Apres la depense, reste-t-il une ligne de repli si la charge ou les degats adverses reussissent ?"]),
              p("Optimisations","H2"),
              table([["Optimisation","Cout","Meilleur porteur / role","Erreur a eviter"]]+[[e["Name"],str(e["Cost"]),
                    {"Immolator":"Leader d'une unite Torrent; alternative a la liste principale.","War-Tempered Artifice":"Captain de contre-charge; choix de la liste principale.","Forged In Battle":"Leader d'une unite importante pour fiabiliser un jet par tour.","Adamantine Mantle":"Personnage expose ou ancre individuelle."}[e["Name"]],
                    {"Immolator":"Ne pas confondre volume supplementaire et score automatique.","War-Tempered Artifice":"Ne justifie pas une charge sans objectif tactique.","Forged In Battle":"La condition Leader doit etre respectee.","Adamantine Mantle":"Ne protege que le porteur, pas toute l'unite."}[e["Name"]]] for e in det["enhancements"]],[32*mm,12*mm,68*mm,63*mm]),PageBreak()]

    story += [p("3. Liste principale a 2 000 points","H1"),
              p("La liste a ete construite comme une succession de couches plutot que comme une collection de meilleures fiches. Le moteur Vulkan/Infernus produit le jeu de mission; le Redeemer et les Aggressors ouvrent le milieu de table; trois sources anti-char empechent l'adversaire de proteger son plan derriere une seule cible robuste; les Scouts et les Assault Intercessors conservent les activations dont les pieces lourdes ont besoin.","Lead"),
              p("Cela explique aussi pourquoi certaines unites semblent redondantes. Deux Infernus permettent de separer l'operateur de sa releve. Deux Scouts evitent de sacrifier au premier round l'unique outil disponible pour une carte laterale ou une reprise au cinquieme round. Lancer, Ballistus et Eradicators ne cherchent pas tous le meme angle : ils rendent la suppression de l'anti-char beaucoup plus difficile."),
              rich("<b>Exception autorisee :</b> Vulkan He'stan est la seule unite hors inventaire. Toutes les autres entrees utilisent des figurines reelles ou des proxies deja declares, sans double emploi physique.","Warning")]
    roster_rows=[["Unite","Taille","Points","Optimisation","Inventaire"]]
    for u in data["mainRoster"]["units"]: roster_rows.append([u["name"],str(u["models"]),str(u["points"]+u["enhancementCost"]),u["enhancement"] or "-",u["availability"]])
    roster_rows.append(["TOTAL","",str(data["mainRoster"]["points"]),"dont 25 pts d'optimisation", "1 exception"])
    story += [table(roster_rows,[55*mm,14*mm,18*mm,47*mm,41*mm]),
              p("Equipements conseilles","H2"),bullets(["Aggressors : flamestorm gauntlets pour Torrent et la pression a 12 pouces.","Eradicators : deux multi-meltas dans l'unite de six.",
                    "Redeemer : multi-melta, storm bolter et hunter-killer missile.","Captain : power fist et plasma pistol avec War-Tempered Artifice; surveiller Hazardous.",
                    "Assault Intercessor Sergeant : hand flamer et power fist.","Scouts : equipement adapte au role; le lance-missiles/sniper garde une option longue, les shotguns/couteaux servent la rotation."]),
              p("Associations et transports","H2"),bullets(["Vulkan rejoint une Escouade Infernus de 10 : moteur d'Action et ancre OC.","Le Captain rejoint les Bladeguard ou les Assault Intercessors selon le besoin de contre-charge; declarer l'association avant la partie.",
                    "Le Redeemer transporte les 6 Aggressors : 12 places utilisees sur 14 par les figurines Gravis.","La seconde Infernus reste la releve; ne pas la coller a la premiere."]),PageBreak()]

    story += [p("Variante strictement inventaire","H2"),p("Remplacer Vulkan He'stan (85 pts) par une troisieme Escouade Infernus de 5 (85 pts). Total inchange : 2 000 points.","Fact"),
              p("Ce que la variante perd","H3"),bullets(data["inventoryStrictRoster"]["lostEffects"]),
              p("Consequences de pilotage","H3"),bullets(["Les Infernus ne doivent plus etre presentees comme capables d'Action apres Avance ou de tir apres Action.","Leur OC reste celui du datasheet, sauf autre effet legal.",
                   "La relance de Blessure Torrent/Melta et l'ancre personnelle de Vulkan disparaissent.","La liste gagne une unite independante et de la redondance, mais perd son moteur qualitatif principal."]),
              GroupBarChart([(g["name"],g["points"]) for g in GROUPS]),
              p("Lecture du graphique","Small"),p("Les points mesurent uniquement l'investissement de liste. Ils ne mesurent ni la valeur tactique ni une probabilite de victoire.","Small"),PageBreak()]

    role_cols=["Primaire","Secondaire","Dommages","Durabilite","Mobilite","Denial"]
    role_rows=[("Moteur mission",[4,4,3,2,3,3]),("Paquet percee",[3,2,4,4,3,4]),("Batterie antichar",[2,3,4,2,2,3]),("Contre-charge",[3,3,3,3,2,3]),("Ecrans/rotation",[3,4,1,1,4,3]),("Canon milieu",[3,2,4,4,2,4])]
    story += [p("4. Ensembles operationnels","H1"),RoleHeatmap(role_rows,role_cols),p("Echelle d'inference : 0 absent, 1 appoint, 2 secondaire, 3 important, 4 responsabilite centrale. Ce n'est ni une statistique officielle ni un taux de reussite.","Small")]
    for g in GROUPS:
        story += [KeepTogether([p(g["name"],"H2"),rich(f"<b>Composition :</b> {esc(g['units'])}<br/><b>Roles :</b> {esc(g['roles'])}<br/><b>A preserver :</b> {esc(g['preserve'])}<br/><b>Condition d'abandon :</b> {esc(g['abandon'])}")])]
    story += [PageBreak(),p("5. Doctrine de portee","H1")]
    series=[(name,[(int(x),float(y)) for x,y in pts]) for name,pts in data["statistics"]["series"]]
    story += [DistanceChart(series),p("Baseline du moteur statistique hors synergies : configurations minimales, cible Infanterie standard. La liste utilise des unites plus grandes; lire surtout les ruptures de portee, pas extrapoler lineairement les valeurs.","Warning"),
              table([["Palier","Regles/armes","Decision tactique"],["Melee / engagement","Pistol ou melee selon l'eligibilite","Ne pas confondre les pistolets avec les autres armes de tir; choisir le mode legal."],
                     ["0-9 pouces","Melta a demi-portee; Torrent; +1 F","Zone de conversion maximale mais aussi de contre-charge."],["10-12 pouces","Torrent et +1 F, Melta sans bonus de demi-portee","Zone souvent optimale pour agir/tirer sans avancer davantage."],
                     ["13-18 pouces","Melta et armes 18, plus de bonus +1 F","Eradicators et armes intermediaires; eviter de croire les Infernus encore actives."],
                     ["19-24 pouces","Rapid Fire des armes 24 selon demi-portee; canons 24","Pression de soutien, pas le coeur du detachement."],["25-36+ pouces","Lancer, Ballistus, missiles, canons longs","Ouvrir les voies avant d'exposer l'operateur."]],[27*mm,58*mm,90*mm]),PageBreak()]

    story += [p("6. Secondaires tactiques","H1"),
              p("Une liste de mission ne doit pas seulement etre capable de realiser une carte lorsqu'elle apparait. Elle doit pouvoir le faire sans desassembler son primaire. Forgefather's Seekers dispose d'un excellent operateur d'Action, mais cet operateur est aussi une source d'OC, de Torrent et de controle de ressource. Toute la section secondaire consiste donc a savoir quand employer cette piece et quand la remplacer par une Scout ou une unite de combat.","Lead"),
              rich("<b>Regle de portefeuille :</b> les cartes actives non accomplies/non defaussees sont conservees; la defausse volontaire de fin de tour et le remplacement unique a 1 PC sont des decisions distinctes. Toujours verifier les clauses propres a la carte.","Callout"),
              p("Dix capacites et responsables","H2")]
    cap_owner={"action-capacity":"Infernus avec Vulkan; Scouts; Assault Intercessors","concentrated-damage":"Eradicators; Lancer; Ballistus; Vindicator","distributed-damage":"Infernus; Aggressors; Redeemer",
               "durable-presence":"Redeemer; Vindicator; Ballistus; Bladeguard","independent-units":"Scouts; Lancer; Vindicator","objective-control":"Vulkan; Infernus; Assault Intercessors",
               "screening":"Scouts; Assault Intercessors; vehicules","target-access":"Lancer; Ballistus; Redeemer; Eradicators","territorial-projection":"Scouts; Infernus apres Avance; Assault Intercessors",
               "unit-redundancy":"2 Infernus; 2 Scouts; 3 plateformes anti-char"}
    story += [table([["Capacite","Responsables de la liste"]]+[[cap,cap_owner[cap]] for cap in data["capabilities"]],[58*mm,117*mm])]
    fam_label={"destruction-targeted":"Destruction ciblee","objective-control":"Controle d'objectifs","territorial-projection":"Projection territoriale","actions-operations":"Actions et operations"}
    family_grade={"destruction-targeted":"Plutot naturelle si les cibles existent","objective-control":"Naturelle mais concurrence le primaire","territorial-projection":"Moyenne : Scouts importants, peu de Deep Strike","actions-operations":"Naturelle avec Vulkan/Infernus et Scouts"}
    family_intro={
        "destruction-targeted":"Les cartes de destruction sont servies par la profondeur de l'anti-char et le volume Torrent. Elles restent toutefois dependantes de la liste adverse : une bonne couverture de dommages ne cree pas une cible eligible et ne garantit pas son acces.",
        "objective-control":"Les cartes d'objectifs ressemblent au primaire, ce qui est a la fois leur force et leur danger. Elles sont efficaces lorsque la meme position produit deux progres coherents; elles deviennent couteuses si elles obligent a quitter la ressource deja construite.",
        "territorial-projection":"La projection est le point le moins naturel de la liste principale. Les Scouts portent donc une responsabilite disproportionnee. Les depenser trop tot pour un ecran banal peut fermer plusieurs cartes plus tard dans la partie.",
        "actions-operations":"Les Actions sont la famille la plus en phase avec le detachement. Vulkan et les Infernus apportent une souplesse rare, mais cette souplesse ne doit pas conduire a leur attribuer toutes les Actions. Les Scouts restent la meilleure solution lorsque le primaire exige deja l'Infernus.",
    }
    for family in ["destruction-targeted","objective-control","territorial-projection","actions-operations"]:
        missions=[m for m in data["secondaryMissions"] if m["familyId"]==family]
        story += [p(fam_label[family],"H2"),p(family_intro[family]),p(family_grade[family],"Small"),
                  table([["Mission","Capacites centrales","Porteur conseille / repli"]]+[[m["title"],", ".join(r["capability"] for r in m["capabilityRequirements"] if r["importance"]=="core"),
                         "Infernus/anti-char" if family=="destruction-targeted" else "Assault Intercessors/Scouts" if family=="objective-control" else "Scouts/Infernus" if family=="territorial-projection" else "Infernus/Scouts"] for m in missions],[46*mm,66*mm,63*mm])]
    story += [p("Regles de decision secondaire","H2"),
              table([["Signal","Decision"],["Carte faisable ce tour sans compromettre le primaire","L'accomplir avec l'unite la moins structurante."],["Carte faisable au prochain tour et operateur protege","La conserver avec un horizon explicite."],
                     ["Carte bloque deux activations cles","Envisager la defausse volontaire de fin de tour selon les regles actives."],["Carte immediatement injouable et remplacement unique disponible","Comparer 1 PC au besoin de Blazing Earth/Armour of Contempt avant de remplacer."],
                     ["Deux cartes demandent le meme operateur","Prioriser celle qui partage deja la position du primaire; ne pas supposer les deux realisables."]],[56*mm,119*mm])]

    matchup_by_scenario={m["scenario"]["id"]:m for m in data["primaryMatchups"]}
    for plan in SCENARIO_PLANS: scenario_section(story,plan,matchup_by_scenario[plan["mission_id"]])

    story += [PageBreak(),p("7. Situations recurrentes","H1"),
              p("Action apres Avance","H2"),bullets(["Verifier Vulkan dans l'armee, l'unite Infernus, l'Action disponible et la legalite du timing.","Mesurer la position finale et l'OC attendu en fin de tour.","Designer avant l'Avance l'unite qui nettoie la contestation." ]),
              p("Action puis tir","H2"),bullets(["Commencer l'Action seulement si le tir ne compromet pas son accomplissement.","Tirer sur la menace qui retire l'OC ou detruit l'operateur.","Ne pas presenter le tir comme une garantie de nettoyage." ]),
              p("Defense contre une charge","H2"),bullets(["Verifier 1 PC, porteur Torrent, cible a 12 pouces, visible et non exclue.","Blazing Earth penalise la charge; il ne l'interdit pas.","Conserver une releve derriere l'unite menacee." ]),
              p("Sortie du Redeemer","H2"),bullets(["Choisir avant le mouvement si le Redeemer est transport, mur ou arme.","Debarquer les Aggressors seulement si leur tir/melee change l'objectif ou retire la menace.","Burning Vengeance est une reaction conditionnelle, pas un plan de debarquement automatique." ]),
              p("Reprise du cinquieme round","H2"),bullets(["Conserver une Scout ou les Assault Intercessors hors de l'echange du R4.","Compter l'OC final et les ecrans adverses avant de choisir la route.","Au R5, la position finale peut valoir davantage que la destruction d'une cible secondaire." ]),PageBreak()]

    story += [p("8. Alternatives et ajustements","H1"),
              table([["Besoin","Alternative possedee/proxy","Delta / consequence"],["Plus de projection","Assault Intercessors with Jump Packs - 85 pts","Remplace une petite Infernus; perd le moteur Action specifique."],
                     ["Unite rapide independante","Outrider Squad - 70 pts","Exige de trouver 15 pts; meilleur flanc, moins d'OC dense."],["Transport moins cher","Repulsor - 170 pts","Libere 80 pts; perd le profil Redeemer/Torrent et son plan de percee."],
                     ["Transport utilitaire","Rhino - 65 pts","Echange possible avec une Scout; verifier les passagers eligibles."],["Melee mobile","Vanguard Veterans with Jump Packs - 105 pts","Demande une recomposition de 20 pts; meilleure projection, moins de tir lourd."],
                     ["Inventaire strict","5 Infernus - 85 pts","Remplace exactement Vulkan; perd toutes ses aptitudes."]],[42*mm,67*mm,66*mm]),
              p("Aide-memoire avant la partie","H2"),bullets(["1. Confirmer Priority Assets et la carte primaire exacte.","2. Choisir l'objectif d'ancre de Vulkan lors de sa premiere mise en place.","3. Nommer operateur, releve, nettoyeur et reserve du R5.",
                    "4. Declarer les associations de Leaders et le contenu du Redeemer.","5. Identifier les seuils 9 pouces Melta et 12 pouces +1 Force/Torrent.","6. Garder un plan de PC defensif avant toute depense de 2 PC.",
                    "7. Pour chaque secondaire, verifier la fenetre, la clause au tirage et l'unite responsable." ]),
              p("Sources et limites","H2"),p("Sources locales : catalogue Warforge 1.2.13.0, Faction Pack Space Marines 2026-07 v1.1, MFM 1.2.13.0, Compagnon d'evenement 2026-27 v1.1, archive GDM 2026 approuvee, base strategique V5 et moteur statistique actif.","Small"),
              p("Toutes les nouvelles conclusions editoriales de ce guide restent draft/preliminary. GDM est une archive approuvee non officielle. Les cartes, FAQ et regles officielles actives a la table priment.","Warning")]
    doc=GuideDoc(str(out_path)); doc.build(story)


def main() -> None:
    parser=argparse.ArgumentParser(); parser.add_argument("--root",default="."); parser.add_argument("--output")
    args=parser.parse_args(); root=Path(args.root).resolve(); out=Path(args.output).resolve() if args.output else root/"output/pdf/forgefathers-seekers-guide-2026-08-11"
    out.mkdir(parents=True,exist_ok=True)
    ctx=load_context(root); data=build_guide_data(ctx)
    pdf_path=out/"guide-forgefathers-seekers.pdf"; build_pdf(root,pdf_path,data)
    (out/"guide-data.json").write_text(json.dumps(data,ensure_ascii=False,indent=2),encoding="utf-8")
    (out/"guide-forgefathers-seekers.md").write_text(build_markdown(data),encoding="utf-8")
    chart_audit={"schemaVersion":"warforge-chart-audit/v1","charts":CHART_AUDIT,"allChartsHaveAxesUnitsTicksScales":all(
        "xAxis" in c and "yAxis" in c and c["xAxis"].get("ticks") and c["yAxis"].get("ticks") for c in CHART_AUDIT)}
    (out/"chart-audit.json").write_text(json.dumps(chart_audit,ensure_ascii=False,indent=2),encoding="utf-8")
    reader=PdfReader(str(pdf_path))
    sources=[{"path":str(path.relative_to(root)).replace("\\","/"),"sha256":sha256(path)} for path in ctx["input_paths"]]
    manifest={"schemaVersion":"warforge-tactical-guide-manifest/v1","guideVersion":GUIDE_VERSION,"generatedAt":SNAPSHOT_DATE,
              "catalogVersion":CATALOG_VERSION,"engineVersion":data["engineVersion"],"pageCount":len(reader.pages),"files":{},"sources":sources,
              "checks":{"mainRosterPoints":2000,"strictRosterPoints":2000,"primaryMatchups":5,"secondaryMissions":18,"capabilities":10,
                        "inventoryExceptionCount":1,"physicalFigureReuse":False,"chartAuditPassed":chart_audit["allChartsHaveAxesUnitsTicksScales"]}}
    for filename in ["guide-forgefathers-seekers.pdf","guide-forgefathers-seekers.md","guide-data.json","chart-audit.json"]:
        path=out/filename; manifest["files"][filename]={"sha256":sha256(path),"bytes":path.stat().st_size}
    (out/"manifest.json").write_text(json.dumps(manifest,ensure_ascii=False,indent=2),encoding="utf-8")
    print(json.dumps({"output":str(out),"pdf":str(pdf_path),"pages":len(reader.pages),"checks":manifest["checks"]},ensure_ascii=False))


if __name__=="__main__": main()
