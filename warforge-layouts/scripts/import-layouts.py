"""Explicit local export. Runtime/build/CI never read the private source corpus.

Run from warforge-layouts with Python + Pillow. No OCR or re-registration.
Contours retain original template precision; illustrative parts remain observations.
"""
import hashlib
import json
import math
from collections import Counter
from pathlib import Path
from PIL import Image, ImageDraw

APP = Path(__file__).resolve().parents[1]
ROOT = APP.parent
CORPUS = ROOT / 'warforge-lists/data/knowledge/layouts'
OUT = APP / 'public'
DATA = OUT / 'data'
DATE = '2026-10-27'

def load(p):
    return json.loads(p.read_text(encoding='utf-8-sig'))

def sha(p):
    return hashlib.sha256(p.read_bytes()).hexdigest()

def write(p, value):
    p.parent.mkdir(parents=True, exist_ok=True)
    p.write_text(json.dumps(value, ensure_ascii=False, separators=(',', ':')) + '\n', encoding='utf-8')

def placed(p, t):
    x, y = p
    if t['reflected']: x = -x
    a = math.radians(t['rotationDegrees'])
    return [x * math.cos(a) - y * math.sin(a) + t['translationInches'][0],
            x * math.sin(a) + y * math.cos(a) + t['translationInches'][1]]

g = load(CORPUS / 'gdm-geometry-2d.json')
f = load(CORPUS / 'official-footprints.json')
e = load(CORPUS / 'enrichment/layout-enrichment.json')
m = load(ROOT / 'warforge-pwa/data/simulator/gdm-2026-layout-measurements.json')
archive = load(ROOT / 'warforge-pwa/data/missions/gdmissions-11th/archive.json')
enrichments = {x['id']: x for x in e['layouts']}
measurements = {x['layoutId']: x for x in m['layouts']}
assert len(g['layouts']) == 45 and all(len(x['terrain']) == 16 for x in g['layouts'])

official = 'https://assets.warhammer-community.com/eng_12-06_warhammer40000_event_companion-s3bfb5f9s1-ivswuij3fo.pdf'
kits = 'https://www.warhammer-community.com/en-gb/articles/cfauyhwi/sunday-preview-exodites-leap-from-the-jungle/'
names = {'large-rectangle':'Grande empreinte', 'medium-rectangle':'Petite empreinte',
         'right-triangle':'Empreinte triangulaire', 'long-line':'Bande longue', 'short-line':'Bande courte'}
labels = {'disruption':'Perturbation', 'priority-assets':'Actifs prioritaires', 'purge-the-foe':'Purger l’ennemi',
          'reconnaissance':'Reconnaissance', 'take-and-hold':'Prendre et tenir'}
kind_specs = [
 ('large-ruin','Grande ruine Manufactorum','Large Manufactorum Ruin','dense','Manufactorum Ruins',1,
  'Murs hauts en angle et plancher visible sur le kit. Conserver l’ouverture indiquée sur le schéma.'),
 ('small-ruin','Petite ruine Manufactorum','Small Manufactorum Ruin','light','Manufactorum Ruins',None,
  'Pan de mur bas, droit ou en angle selon la silhouette de la carte.'),
 ('capacitor','Bloc de condensateurs','Capacitor Stack','dense','Capacitor Cluster',None,
  'Ensemble de cuves et de machinerie, placé dans le sens du schéma.'),
 ('shock-array','Réseau électrique','Shock Array','light','Capacitor Cluster',None,
  'Alignement de bobines électriques sur sa base.'),
 ('shrine','Sanctuaire générateur','Generator Shrine','dense','Galvanic Network',None,
  'Machine centrale de la bande longue, entre les deux barricades.'),
 ('barricade','Barricade de roc-béton','Rockcrete Barricade','light','Galvanic Network',None,
  'Deux barricades disposées de part et d’autre du sanctuaire générateur.'),
 ('pylon','Pylône galvanique','Galvanic Pylon','dense','Galvanic Network',None,
  'Deux pylônes parallèles sur la bande courte. Le contour vert représente le groupe.')
]
kinds = [{'id':i,'name':n,'officialName':en,'category':c,'kit':k,'illustratedUpperFloors':fl,
          'heightInches':None,'floorElevationInches':None,'note':note,'sourceUrl':kits}
         for i,n,en,c,k,fl,note in kind_specs]

# Stable, visibly identifiable contour vertices nearest opposite nominal corners.
# These are new UI reference points, not the black dots or dimensions printed by GDM.
anchor_targets = {'large-rectangle':[[0,0],[11.5,7]], 'medium-rectangle':[[0,0],[4,6]],
 'long-line':[[0,0],[10,2.5]], 'short-line':[[0,0],[6,2]], 'right-triangle':[[0,0],[0,-8]]}
templates = []
for t in f['templates']:
    polygon = t['polygonInches']
    indices = [min(range(len(polygon)), key=lambda i:sum((polygon[i][d]-target[d])**2 for d in [0,1]))
               for target in anchor_targets[t['id']]]
    templates.append({'id':t['id'],'name':names[t['id']], 'nominalSize':t['nominalDimensionsInches'],
                      'polygon':polygon,'anchorIndices':indices,'quantity':t['kitQuantity']})
template_index = {t['id']:t for t in templates}

def classify(element, template_id):
    family, color = element['family'], element['color']
    if family == 'large-corner' and color == 'green': return 'large-ruin', 1
    if family == 'small-corner' and color == 'orange': return 'small-ruin', 1
    if color == 'green':
        return {'long-line':('shrine',1),'medium-rectangle':('capacitor',1),'short-line':('pylon',2)}[template_id]
    return {'long-line':('barricade',2),'short-line':('shock-array',1)}[template_id]

summaries, hashes, maximum_residual, thumbnail_records = [], {}, 0, []
for layout in g['layouts']:
    ident = layout['id']
    obs, measured = enrichments[ident], measurements[ident]
    assert layout['status'] == 'owner-reviewed-2d' and layout['boardInches'] == [44,60]
    assert measured['status'] == 'verified'
    for key in ['plainImage','measuredImage']:
        assert sha(ROOT / layout[key]['path']) == layout[key]['sha256'], (ident,key)
    stem = ident.removesuffix('-portrait')
    variant = int(stem[-1]); pair = stem[:-2]
    teams = pair.removesuffix('-mirror').split('-vs-')
    if len(teams)==1: teams *= 2
    summary = {'id':ident,'pair':pair,'teams':teams,'title':' × '.join(labels[x] for x in teams),
               'variant':variant,'thumbnail':f'images/thumbs/{ident}.webp','data':f'data/layouts/{ident}.json'}
    terrain = []
    for number, t in enumerate(layout['terrain'],1):
        template = template_index[t['templateId']]
        residual = max(abs(a-b) for p,q in zip(template['polygon'],t['polygonInches']) for a,b in zip(placed(p,t),q))
        assert residual < 1e-5, (ident,t['id'],residual)
        maximum_residual=max(maximum_residual,residual)
        terrain.append({'id':t['id'],'number':number,'templateId':t['templateId'],'angle':t['rotationDegrees'],
                        'reflected':t['reflected'],'translation':t['translationInches']})
    terrain_index = {t['id']:t for t in terrain}
    elements=[]
    for el in obs['elements']:
        kind,quantity=classify(el,terrain_index[el['terrainId']]['templateId'])
        elements.append({'id':el['id'],'terrainId':el['terrainId'],'kind':kind,'quantity':quantity,
                         'rings':[ring for part in el['parts'] for ring in part['observedRingsInches']],
                         'precision':'illustrative-source-outline'})
    counts=Counter()
    for el in elements: counts[el['kind']]+=el['quantity']
    assert counts == Counter({'large-ruin':8,'small-ruin':8,'capacitor':2,'shock-array':2,'shrine':2,'barricade':4,'pylon':4}), (ident,counts)
    objectives=[{'id':o['id'],'kind':o['kind'],'point':o['iconCenterInches'],'terrainId':o['terrainId'],
                 'precision':'illustrative-source-location'} for o in obs['objectives']]
    source_url='https://gdmissions.app'+next(c['sourcePath'] for c in archive['cards']['layouts']
        if any(ident+'.png' in x['image'] for x in c['layouts']))
    value={**summary,'board':[44,60],'terrain':terrain,'elements':elements,'objectives':objectives,
           'deployments':[{'role':z['role'],'polygon':z['polygonInches']} for z in layout['deploymentZones']],
           'source':{'url':source_url,'plainSha256':layout['plainImage']['sha256'],
                     'measuredSha256':layout['measuredImage']['sha256'],'geometryPrecision':'image-registered-approximation',
                     'compositionBasis':'source-artwork-cross-reference-to-gw-kit',
                     'measuredImage':f'images/measured/{ident}.webp'}}
    write(DATA/'layouts'/f'{ident}.json',value)
    hashes[value['data']]=sha(OUT/value['data'])
    image=Image.open(ROOT/layout['measuredImage']['path']).convert('RGB')
    target=OUT/value['source']['measuredImage'];target.parent.mkdir(parents=True,exist_ok=True)
    image.save(target,format='WEBP',lossless=True,method=4)
    hashes[value['source']['measuredImage']]=sha(target)
    plain=Image.open(ROOT/layout['plainImage']['path']).convert('RGB')
    # Calibration belongs to the unmeasured illustration in the observation source.
    rect=obs['sourceImage']['boardRectPx']
    crop=plain.crop((rect['left'],rect['top'],rect['right'],rect['bottom']))
    crop.thumbnail((264,360))
    target=OUT/summary['thumbnail'];target.parent.mkdir(parents=True,exist_ok=True)
    crop.save(target,format='WEBP',quality=90,method=4)
    hashes[summary['thumbnail']]=sha(target)
    thumbnail_records.append((ident,crop.copy(),value))
    summaries.append(summary)

manifest={'schemaVersion':'warforge-layouts/v1','version':'1.0.0','validAsOf':DATE,'board':[44,60],
 'templates':templates,'kinds':kinds,'layouts':sorted(summaries,key=lambda x:(x['pair'],x['variant'])),
 'sources':[{'id':'gdm','title':'GDM 2026 — cartes et cotes','url':'https://gdmissions.app/11th/layouts','date':'2026-08-30'},
            {'id':'gw-companion','title':'GW Event Companion v1.0, pages 7–8 et layouts','url':official,'date':'2026-06-12'},
            {'id':'gw-footprints','title':'GW — empreintes officielles','url':f['source']['url'],'date':'2026-06-12'},
            {'id':'gw-kits','title':'GW — Manufactorum Ruins, Capacitor Cluster, Galvanic Network','url':kits,'date':'2026-07-19'}],
 'precisionNote':'Distances calculées approximatives. Les repères A/B sont propres au visualiseur et ne remplacent pas les cotes imprimées. Silhouettes schématiques ; hauteurs non mesurées.'}
write(DATA/'manifest.json',manifest)
hashes['data/manifest.json']=sha(DATA/'manifest.json')
write(DATA/'integrity.json',{'schemaVersion':'warforge-layouts-integrity/v1','files':hashes})
write(APP/'docs/import-evidence.json',{'date':DATE,'geometrySha256':sha(CORPUS/'gdm-geometry-2d.json'),
 'templatesSha256':sha(CORPUS/'official-footprints.json'),'observationsSha256':sha(CORPUS/'enrichment/layout-enrichment.json'),
 'layouts':45,'placements':720,'deploymentZones':90,'maxReconstructionResidualInches':maximum_residual,
 'categoriesSource':'GW Event Companion v1.0 p8: green=dense, yellow=light',
 'partsSource':'GW product photographs 2026-07-19 and Event Companion artwork. Assemblies, not sprue pieces.',
 'sourceObservationsStatus':'candidate-awaiting-owner; illustrative only; no private acceptance status changed'})

# Bounded visual sheets: source illustration beside the exported parts and footprints.
review=ROOT/'tmp/layouts-implementation';review.mkdir(exist_ok=True,parents=True)
kind_color={k['id']:('#28785d' if k['category']=='dense' else '#c68a26') for k in kinds}
for batch in range(5):
    sheet=Image.new('RGB',(1800,1230),'#faf8f2');draw=ImageDraw.Draw(sheet)
    for n,(ident,thumb,l) in enumerate(thumbnail_records[batch*9:(batch+1)*9]):
        ox=(n%3)*600;oy=(n//3)*410
        draw.text((ox+6,oy+4),ident,fill='black')
        sheet.paste(thumb,(ox+8,oy+30))
        def pts(r):return [(ox+302+x*4.4,oy+30+y*5.7) for x,y in r]
        for t in l['terrain']:
            poly=[placed(p,{'rotationDegrees':t['angle'],'reflected':t['reflected'],'translationInches':t['translation']}) for p in template_index[t['templateId']]['polygon']]
            draw.polygon(pts(poly),fill='#ece8df',outline='#777777')
        for el in l['elements']:
            for ring in el['rings']:draw.polygon(pts(ring),fill=kind_color[el['kind']])
    sheet.save(review/f'composition-review-{batch+1}.png')
print(f'Exported {len(summaries)} layouts, 720 placements; max residual {maximum_residual:.9f} inches.')
