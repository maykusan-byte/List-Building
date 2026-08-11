const headings = new Map([
  ['scoring-model', 'Rendement tactique'], ['list-construction', 'Construction de liste'],
  ['advantage', 'Opportunités'], ['pitfall', 'Modes d’échec'], ['counterplay', 'Contre-jeu adverse'],
  ['play-pattern', 'Séquence conseillée'], ['tradeoff', 'Arbitrages'], ['decision-rule', 'Pilotage du portefeuille actif']
]);

export function renderSecondaryMissionReport(knowledge) {
  const scenarioById = new Map(knowledge.scenarios.map((entry) => [entry.id, entry]));
  const claimById = new Map(knowledge.tacticalClaims.map((entry) => [entry.id, entry]));
  const exampleById = new Map(knowledge.secondaryDecisionExamples.map((entry) => [entry.id, entry]));
  const framework = knowledge.secondaryMissionFrameworks[0];
  const lines = [
    '# Analyse des missions secondaires GDM 2026 — mode Tactique', '',
    '**Projection générée depuis `data/strategy/knowledge-base.json` — ne pas modifier manuellement.**', '',
    '**Édition :** Warhammer 40,000 V11  ', '**Pack :** GDM 2026 — 11th Edition (`gdm-2026-11th`)  ',
    '**Date de l’analyse :** 11 août 2026  ', '**Périmètre :** construction de liste et pilotage génériques, sans recommandation de faction.', '',
    '## Provenance et niveaux de preuve', '',
    '- Le fonctionnement général du mode Tactique est sourcé par le *Compagnon de Rencontre Warhammer* v1.1, document officiel archivé localement.',
    '- Les conditions propres aux 18 cartes proviennent de l’archive GDM 2026 V11 récupérée le 8 août 2026, approuvée pour le développement mais non officielle.',
    '- Les modèles de rendement, opportunités, menaces, séquences et décisions sont des inférences stratégiques revues. Ils ne prédisent ni dés, ni score, ni réussite.', '',
    '## Cadre officiel du portefeuille Tactique', '',
    `- À chaque phase de Commandement, **${framework.cardsDrawnPerCommandPhase} nouvelles cartes** sont piochées et deviennent actives.`,
    '- Une carte non accomplie et non défaussée **reste active** : le portefeuille peut donc croître d’un tour à l’autre.',
    '- Une carte accomplie est résolue puis défaussée à la fin du tour concerné.',
    `- À la fin de son propre tour, le joueur peut défausser volontairement une ou plusieurs cartes actives et gagne **${framework.voluntaryEndTurnDiscard.commandPointsGained} PC**.`,
    `- Une fois par bataille, à la fin de sa phase de Commandement, il peut dépenser **${framework.oncePerBattleRedraw.commandPointCost} PC** pour défausser une carte active et en piocher une nouvelle.`,
    `- Le score secondaire est plafonné à **${framework.victoryPointCaps.round} PdV par round** et **${framework.victoryPointCaps.battle} PdV par bataille**.`, '',
    'Ces mécanismes imposent trois décisions distinctes : conserver une carte active avec un horizon explicite, la défausser volontairement en fin de son tour pour libérer le portefeuille et gagner 1 PC, ou consommer le remplacement immédiat à 1 PC disponible une seule fois par bataille. Les options particulières « Lorsque piochée » restent propres aux cartes qui les portent.', '',
    '## Principes de pilotage transversal', '',
    '1. Inventorier toutes les cartes actives, leur fenêtre et leur horizon avant d’allouer une unité.',
    '2. Favoriser les lignes qui convergent avec le primaire, le déni ou la position du tour suivant.',
    '3. Mesurer le coût marginal : unités, activations, PC, exposition et options abandonnées.',
    '4. Préserver de la redondance : une unité ne peut pas fournir simultanément dégâts, présence, action et écran dans plusieurs zones.',
    '5. Réévaluer en fin de tour les cartes sans horizon crédible au lieu de laisser le portefeuille monopoliser les ressources.', ''
  ];
  knowledge.secondaryMissionFamilies.forEach((family, familyIndex) => {
    lines.push(`## ${familyIndex + 1}. ${family.title}`, '');
    for (const claimId of family.claimIds) {
      const claim = claimById.get(claimId);
      if (claim) lines.push(claim.statement, '', `**Rapprochement familial.** ${claim.rationale}`, '');
    }
    lines.push(`**Capacités mutualisables :** ${family.capabilityTags.map((tag) => `\`${tag}\``).join(', ')}.`, '');
    for (const scenarioId of family.scenarioIds) {
      const scenario = scenarioById.get(scenarioId);
      const guide = knowledge.secondaryMissionGuides.find((entry) => entry.scenarioId === scenarioId);
      if (!scenario || !guide) continue;
      lines.push(`### ${scenario.title.replace(/ — briefing GDM$/, '')}`, '',
        `**Fait de mission sourcé.** ${scenario.summary ?? 'Consulter la carte archivée pour la condition complète.'}`,
        `**Fenêtres déclarées :** ${scenario.scoringWindows.join(' ; ')}.`, '', '**Capacités requises.**', '');
      for (const requirement of guide.capabilityRequirements) lines.push(`- \`${requirement.capability}\` (${requirement.importance}) : ${requirement.rationale}`);
      lines.push('');
      for (const claimId of guide.claimIds) {
        const claim = claimById.get(claimId);
        if (!claim) continue;
        lines.push(`#### ${headings.get(claim.kind) ?? claim.kind}`, '', claim.statement, '', `**Pourquoi :** ${claim.rationale}`, '');
        if (claim.preconditions.length) lines.push(`**Conditions :** ${claim.preconditions.join(' ')}`, '');
        if (claim.counterplay.length) lines.push(`**Menaces :** ${claim.counterplay.join(' ')}`, '');
        if (claim.tradeoffs.length) lines.push(`**Coût d’opportunité :** ${claim.tradeoffs.join(' ')}`, '');
      }
      const example = exampleById.get(guide.decisionExampleIds[0]);
      if (example) {
        lines.push('#### Exemple décisionnel', '', ...example.setup, '', `**Point de décision :** ${example.decisionPoint}`, '');
        for (const branch of example.branches) lines.push(`- **Si ${branch.condition}** ${branch.line} ${branch.rationale}`);
        lines.push('', `**Hypothèses :** ${example.assumptions.join(' ')}`, '');
      }
      lines.push(`*Statut : ${guide.status} · confiance : ${guide.confidence} · revue avant le ${guide.reviewBy}.*`, '');
    }
  });
  lines.push('## Rapprochements entre familles', '',
    '- **Capacités mutualisables :** mobilité et redondance servent projection, contrôle et actions ; accès aux cibles et dégâts servent surtout la destruction, mais peuvent également libérer une zone.',
    '- **Compatibilités de tempo :** une carte est particulièrement efficace lorsque sa fenêtre se superpose au primaire ou à une autre carte active sans demander une activation supplémentaire.',
    '- **Concurrence :** les mêmes unités rapides ou sacrifiables sont souvent sollicitées par projection, contrôle et actions ; les pièces offensives choisissent parfois entre achever une cible et protéger le tempo primaire.',
    '- **Surextension :** multiplier les cartes actives ne crée pas de nouvelles unités. Une ligne multi-zone sans écran, repli ni redondance expose l’armée au déni en chaîne.',
    '- **Dépendance adverse :** destruction et accès dépendent des cibles proposées ; contrôle, projection et actions dépendent du placement, des écrans et de la survie des opérateurs.',
    '- **Conflit de portefeuille :** conserver est légal, mais chaque carte doit garder un horizon. La défausse volontaire et le remplacement unique répondent à deux coûts et timings différents.', '',
    '## Checklist de robustesse de liste', '',
    '- Mobilité, projection multi-zone et unités indépendantes.', '- Unités sacrifiables et redondance des rôles.',
    '- Contrôle d’objectif, présence durable et écrans.', '- Capacité à agir sans neutraliser toute la pression.',
    '- Dégâts concentrés, dégâts distribués et accès aux cibles.', '- Résilience et capacité de repli.', '',
    'Toute modification du pack, de son archive ou du Compagnon officiel exige une nouvelle revue humaine avant de republier les guides.'
  );
  return lines.join('\n') + '\n';
}
