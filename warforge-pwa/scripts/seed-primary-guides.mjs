import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const projectRoot = resolve(import.meta.dirname, '..');
const knowledgePath = resolve(projectRoot, 'data/strategy/knowledge-base.json');
const archivePath = resolve(projectRoot, 'data/missions/gdmissions-11th/archive.json');

const order = ['take-and-hold', 'purge-the-foe', 'disruption', 'reconnaissance', 'priority-assets'];
const labels = {
  'take-and-hold': 'Take and Hold',
  'purge-the-foe': 'Purge the Foe',
  disruption: 'Disruption',
  reconnaissance: 'Reconnaissance',
  'priority-assets': 'Ressources prioritaires'
};
const narrativeFiles = {
  'take-and-hold|take-and-hold': 'narration-fr.txt',
  'purge-the-foe|purge-the-foe': 'narration-meatgrinder-fr.txt',
  'disruption|disruption': 'narration-outmanoeuvre-fr.txt',
  'reconnaissance|reconnaissance': 'narration-gather-intel-fr.txt',
  'priority-assets|priority-assets': 'narration-sabotage-fr.txt',
  'take-and-hold|purge-the-foe': 'narration-guide-06-take-hold-vs-purge-fr.txt',
  'take-and-hold|disruption': 'narration-guide-07-take-hold-vs-disruption-fr.txt',
  'take-and-hold|reconnaissance': 'narration-guide-08-take-hold-vs-reconnaissance-fr.txt',
  'take-and-hold|priority-assets': 'narration-guide-09-take-hold-vs-priority-assets-fr.txt',
  'purge-the-foe|disruption': 'narration-guide-10-purge-vs-disruption-fr.txt',
  'purge-the-foe|reconnaissance': 'narration-guide-11-purge-vs-reconnaissance-fr.txt',
  'purge-the-foe|priority-assets': 'narration-guide-12-purge-vs-priority-assets-fr.txt',
  'disruption|reconnaissance': 'narration-guide-13-disruption-vs-reconnaissance-fr.txt',
  'disruption|priority-assets': 'narration-guide-14-disruption-vs-priority-assets-fr.txt',
  'reconnaissance|priority-assets': 'narration-guide-15-reconnaissance-vs-priority-assets-fr.txt'
};

const deckAdvice = {
  'take-and-hold': {
    axis: 'board-control',
    plan: 'Construire deux positions capables de survivre jusqu’à la fenêtre de score, puis conserver une unité de reprise pour le cinquième round.',
    rationale: 'Cette disposition transforme la continuité du contrôle et les bascules de majorité en ressource primaire.',
    pitfall: 'Projeter trop d’unités au même tour peut gagner un objectif immédiatement tout en supprimant la relève nécessaire au round suivant.',
    counterplay: 'Forcer le camp adverse à défendre plusieurs objectifs et attaquer la position dont la perte casse sa prochaine fenêtre de score.'
  },
  'purge-the-foe': {
    axis: 'trading',
    plan: 'Préparer des destructions complètes et rentables, puis convertir la pièce éliminée en avantage de contrôle ou de différentiel d’unités.',
    rationale: 'Le score dépend davantage des unités effectivement achevées que des dégâts simplement distribués.',
    pitfall: 'Partager les attaques entre plusieurs cibles sans en détruire une peut produire un bon échange de dégâts mais aucun revenu primaire.',
    counterplay: 'Refuser les petites cibles faciles et présenter des profils dont la destruction exige un surinvestissement.'
  },
  disruption: {
    axis: 'tempo',
    plan: 'Réserver des opérateurs autonomes pour modifier progressivement le terrain, tout en protégeant la séquence d’actions contre les interruptions.',
    rationale: 'Cette disposition valorise la préparation, les marqueurs et les effets différés plus que la seule possession d’un objectif.',
    pitfall: 'Employer trop tôt les unités capables d’agir laisse souvent les rounds quatre et cinq sans opérateur disponible.',
    counterplay: 'Occuper les zones nécessaires aux actions et éliminer les unités secondaires avant qu’elles ne transforment la table.'
  },
  reconnaissance: {
    axis: 'mobility',
    plan: 'Maintenir une présence répartie et conserver au moins une unité de bascule capable de rejoindre la zone exigée au round cinq.',
    rationale: 'Le score récompense la couverture de plusieurs zones, objectifs ou territoires plutôt qu’une concentration unique.',
    pitfall: 'Une armée très mobile peut réussir les reprises mais échouer à conserver ses positions jusqu’à la fenêtre suivante.',
    counterplay: 'Réduire le nombre d’unités autonomes et fermer les couloirs qui relient les différentes zones de score.'
  },
  'priority-assets': {
    axis: 'primary-scoring',
    plan: 'Désigner avant la partie les unités qui effectueront les actions et séparer les opérateurs des unités chargées de nettoyer leur zone.',
    rationale: 'Cette disposition concentre souvent le rendement sur une ressource, une action ou une infrastructure précise.',
    pitfall: 'Faire agir une unité offensive majeure lui retire fréquemment le tir ou la charge dont dépendait le nettoyage de la position.',
    counterplay: 'Contester la zone d’action avec une unité peu coûteuse et obliger l’adversaire à dépenser une activation supplémentaire.'
  }
};

const roundScores = {
  'take-and-hold': [5, 10, 10, 10, 10],
  'purge-the-foe': [4, 9, 10, 10, 12],
  disruption: [5, 10, 10, 10, 10],
  reconnaissance: [5, 10, 10, 10, 10],
  'priority-assets': [3, 10, 10, 10, 12]
};

function evidence(title, sourceIds = ['official-event-companion-2026-27-v1-1', 'approved-gdm-2026-11th-archive']) {
  return {
    title,
    sourceTier: 'inference',
    sourceIds,
    confidence: 'medium',
    status: 'reviewed',
    limitations: ['Conseil contextuel : vérifier la carte, le layout, les armées et l’état réel de la partie.'],
    reviewBy: '2026-11-30'
  };
}

function claim(id, title, kind, side, scenarioIds, layoutContextId, statement, rationale, axis, counterplay = [], tradeoffs = []) {
  return {
    id,
    ...evidence(title),
    kind,
    side,
    scenarioIds,
    layoutContextIds: [layoutContextId],
    statement,
    rationale,
    preconditions: ['La condition de score correspondante reste atteignable selon la carte et l’état de table.'],
    counterplay,
    tradeoffs,
    axisEffects: [{ axis, score: 3, basis: rationale }]
  };
}

function cumulativeTurns(side, scores) {
  let cumulative = 0;
  return scores.map((vp, index) => {
    const roundTotal = Math.min(15, vp);
    cumulative = Math.min(45, cumulative + roundTotal);
    return {
      side,
      summary: `Le camp ${side === 'alpha' ? 'alpha' : 'bêta'} atteint les conditions retenues pour l’exemple au round ${index + 1}.`,
      scoreItems: [{ label: 'Fenêtres de primaire atteintes dans cet exemple', vp }],
      roundTotal,
      cumulativeTotal: cumulative
    };
  });
}

const knowledge = JSON.parse(await readFile(knowledgePath, 'utf8'));
const archive = JSON.parse(await readFile(archivePath, 'utf8'));
const forceByDeck = new Map(knowledge.forceDispositions.map((entry) => [entry.deck, entry]));
const scenarioByDeckPair = new Map(knowledge.scenarios
  .filter((entry) => entry.kind === 'primary-card')
  .map((entry) => {
    const own = knowledge.forceDispositions.find((force) => force.id === entry.forceDispositionId)?.deck;
    const opponent = knowledge.forceDispositions.find((force) => force.id === entry.opponentForceDispositionId)?.deck;
    return [`${own}|${opponent}`, entry];
  }));
const layoutByDeckPair = new Map(knowledge.layoutContexts.flatMap((entry) => [
  [`${entry.deck}|${entry.opponentDeck}`, entry],
  [`${entry.opponentDeck}|${entry.deck}`, entry]
]));
const planByScenario = new Map();
for (const plan of knowledge.victoryPlans) {
  const values = planByScenario.get(plan.scenarioId) ?? [];
  values.push(plan.id);
  planByScenario.set(plan.scenarioId, values);
}
const rosterByPlan = new Map();
for (const roster of knowledge.referenceRosters) {
  const values = rosterByPlan.get(roster.victoryPlanId) ?? [];
  values.push(roster.id);
  rosterByPlan.set(roster.victoryPlanId, values);
}

const tacticalClaims = [];
const matchupGuides = [];
const workedExamples = [];

for (let leftIndex = 0; leftIndex < order.length; leftIndex += 1) {
  for (let rightIndex = leftIndex; rightIndex < order.length; rightIndex += 1) {
    const leftDeck = order[leftIndex];
    const rightDeck = order[rightIndex];
    const key = `${leftDeck}|${rightDeck}`;
    const slug = `${leftDeck}-vs-${rightDeck}`;
    const guideId = `primary-guide-${slug}`;
    const layout = layoutByDeckPair.get(key);
    const alphaScenario = scenarioByDeckPair.get(`${leftDeck}|${rightDeck}`);
    const betaScenario = scenarioByDeckPair.get(`${rightDeck}|${leftDeck}`);
    if (!layout || !alphaScenario || !betaScenario) throw new Error(`Matrice incomplète pour ${key}`);
    const narrativeFile = narrativeFiles[key];
    const narrativeSourcePath = `deliverables/battlefield-dominance-guide-01/${narrativeFile}`;
    const overview = `${labels[leftDeck]} et ${labels[rightDeck]} poursuivent des moteurs de score distincts. Ce guide relie leurs fenêtres de primaire, le terrain du layout 1, les priorités de chaque camp et le contre-jeu qui permet de convertir le tempo en points de victoire.`;
    const scenarioIds = [...new Set([alphaScenario.id, betaScenario.id])];
    const sideDefinitions = [
      { side: 'alpha', deck: leftDeck, scenario: alphaScenario },
      { side: 'beta', deck: rightDeck, scenario: betaScenario }
    ];
    const sides = [];
    for (const definition of sideDefinitions) {
      const advice = deckAdvice[definition.deck];
      const prefix = `${guideId}-${definition.side}`;
      const ids = [`${prefix}-scoring`, `${prefix}-plan`, `${prefix}-pitfall`, `${prefix}-counterplay`];
      tacticalClaims.push(
        claim(ids[0], `${labels[definition.deck]} — modèle de score`, 'scoring-model', definition.side, [definition.scenario.id], layout.id, advice.rationale, 'Le séquençage des fenêtres détermine quelles unités doivent survivre et jusqu’à quel moment.', 'primary-scoring'),
        claim(ids[1], `${labels[definition.deck]} — plan directeur`, 'play-pattern', definition.side, [definition.scenario.id], layout.id, advice.plan, advice.rationale, advice.axis, [advice.counterplay], ['Ce plan doit être abandonné si son coût compromet une condition de score plus sûre.']),
        claim(ids[2], `${labels[definition.deck]} — erreur fréquente`, 'pitfall', definition.side, [definition.scenario.id], layout.id, advice.pitfall, 'La mission sanctionne les activations dépensées sans produire de score, de déni ou de relève.', 'resource-efficiency'),
        claim(ids[3], `${labels[definition.deck]} — contre-jeu`, 'counterplay', definition.side, [definition.scenario.id], layout.id, advice.counterplay, 'Le déni le plus rentable vise le moteur de score adverse plutôt que la seule destruction brute.', 'denial')
      );
      const victoryPlanIds = planByScenario.get(definition.scenario.id) ?? [];
      const referenceRosterIds = victoryPlanIds.flatMap((id) => rosterByPlan.get(id) ?? []);
      sides.push({ side: definition.side, forceDispositionId: forceByDeck.get(definition.deck).id, scenarioId: definition.scenario.id, claimIds: ids, victoryPlanIds, referenceRosterIds });
    }
    const globalIds = [`${guideId}-global-interaction`, `${guideId}-global-round-five`];
    tacticalClaims.push(
      claim(globalIds[0], 'Interaction centrale', 'advantage', 'global', scenarioIds, layout.id, `La rencontre oppose le moteur ${labels[leftDeck]} au moteur ${labels[rightDeck]} : la priorité est d’identifier quelle ressource de table alimente simultanément son score et le déni adverse.`, 'Une même activation peut parfois marquer pour un camp tout en supprimant la prochaine fenêtre de l’autre.', 'tempo', ['Refuser les échanges qui améliorent les deux moteurs adverses à la fois.']),
      claim(globalIds[1], 'Réserve du cinquième round', 'play-pattern', 'global', scenarioIds, layout.id, 'Conserver une unité de bascule jusqu’au cinquième round est prioritaire lorsque le score d’objectif est évalué à la fin du tour.', 'La fenêtre du dernier round permet une reprise immédiate mais ne répare pas une armée entièrement consommée auparavant.', 'mobility', ['Écranter les couloirs de reprise et préserver assez de CO pour empêcher la bascule.'], ['Une unité gardée trop longtemps en réserve contribue moins aux rounds intermédiaires.'])
    );
    const workedExampleId = `worked-example-${slug}`;
    matchupGuides.push({
      id: guideId,
      ...evidence(`${labels[leftDeck]} contre ${labels[rightDeck]} — guide spécialisé`),
      slug,
      locale: 'fr',
      layoutContextId: layout.id,
      selectedLayoutId: 1,
      overview,
      sides,
      globalClaimIds: globalIds,
      workedExampleId,
      narrativeSourcePath
    });
    const alphaTurns = cumulativeTurns('alpha', roundScores[leftDeck]);
    const betaBase = [...roundScores[rightDeck]];
    betaBase[4] = Math.max(0, betaBase[4] - 3);
    const betaTurns = cumulativeTurns('beta', betaBase);
    workedExamples.push({
      id: workedExampleId,
      ...evidence(`${labels[leftDeck]} contre ${labels[rightDeck]} — exemple pédagogique`),
      guideId,
      layoutId: 1,
      assumptions: [
        'Exemple de primaire uniquement : secondaires, aléas et résultats de dés ne constituent pas des observations.',
        'Chaque condition de score doit être vérifiée sur la carte au moment de jouer.',
        'Attaquant, défenseur et premier joueur sont fixés pour illustrer une séquence, sans prétendre prédire la partie.'
      ],
      rounds: alphaTurns.map((turn, index) => ({ round: index + 1, turns: [turn, betaTurns[index]] })),
      finalScores: { alpha: alphaTurns.at(-1).cumulativeTotal, beta: betaTurns.at(-1).cumulativeTotal },
      lessonClaimIds: globalIds
    });
  }
}

knowledge.schemaVersion = 'warforge-strategy-knowledge/v4';
knowledge.knowledgeVersion = '3.0.0';
knowledge.updatedAt = '2026-08-11';
knowledge.tacticalClaims = tacticalClaims;
knowledge.matchupGuides = matchupGuides;
knowledge.workedExamples = workedExamples;
await writeFile(knowledgePath, JSON.stringify(knowledge, null, 2) + '\n', 'utf8');
console.log(`Guides semés : ${matchupGuides.length}; claims : ${tacticalClaims.length}; exemples : ${workedExamples.length}.`);
