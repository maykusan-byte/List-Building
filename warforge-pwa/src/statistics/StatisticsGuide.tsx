import { useMemo, useState } from 'react';
import { STATISTICS_ANNOTATION_VERSION, STATISTICS_ENGINE_VERSION, STATISTICS_GUIDE_VERSION, STATISTICS_METRIC_DEFINITIONS, allocateDamageMass, percentile, summarizeMass, parseDiceMass, weaponDamageMass, type StatisticsTarget } from '../domain/statistics';

interface GuideEntry {
  id: string;
  title: string;
  short: string;
  question: string;
  formula: string;
  example: string;
  interpretation: string;
  warning: string;
}

export const STATISTICS_GUIDE_ENTRIES: readonly GuideEntry[] = [
  { id: 'mean', title: 'Espérance (moyenne)', short: 'Résultat moyen si la même situation est répétée de nombreuses fois.', question: 'Quelle production puis-je attendre à long terme ?', formula: 'Σ résultat × probabilité du résultat.', example: 'Un D6 vaut en moyenne 3,5 : (1+2+3+4+5+6) ÷ 6.', interpretation: 'Utile pour comparer le rendement général de deux profils.', warning: 'Une moyenne n’est pas une promesse pour le prochain jet.' },
  { id: 'median', title: 'Médiane', short: 'Seuil atteint ou dépassé dans environ la moitié des cas.', question: 'Quel résultat partage les scénarios faibles et forts en deux ?', formula: 'Premier résultat dont la probabilité cumulée atteint 50 %.', example: 'La médiane affichée d’un D6 est 3 selon la convention discrète du moteur.', interpretation: 'Complète la moyenne lorsque la distribution est asymétrique.', warning: 'Deux armes de même médiane peuvent avoir des risques extrêmes très différents.' },
  { id: 'quantiles', title: 'P10, P25, P75 et P90', short: 'Bornes décrivant les résultats faibles, habituels et élevés.', question: 'Quel plancher prudent et quel plafond réaliste puis-je retenir ?', formula: 'Px est le premier résultat dont la probabilité cumulée atteint x %.', example: 'P10 représente un résultat bas observé ou dépassé environ neuf fois sur dix.', interpretation: 'P10 est un plancher prudent ; P90 décrit un scénario favorable, pas un maximum.', warning: 'Ne pas lire P90 comme un résultat garanti.' },
  { id: 'variance', title: 'Variance et écart-type', short: 'Mesurent la dispersion autour de la moyenne.', question: 'Les résultats sont-ils concentrés ou très volatils ?', formula: 'Variance = Σ (résultat − moyenne)² × probabilité ; écart-type = √variance.', example: 'Une arme à dégâts fixes a moins de dispersion qu’une arme D6 de moyenne proche.', interpretation: 'Un écart-type faible indique une production plus régulière.', warning: 'Comparer des écarts-types seulement entre métriques de même unité.' },
  { id: 'cv', title: 'Coefficient de variation', short: 'Écart-type rapporté à la moyenne.', question: 'Quelle arme est la plus fiable relativement à son rendement ?', formula: 'CV = écart-type ÷ moyenne.', example: 'CV 0,25 est plus stable que CV 0,80 pour une même famille de résultats.', interpretation: 'Plus le CV est faible, plus le rendement relatif est stable.', warning: 'Il n’est pas défini lorsque la moyenne vaut zéro.' },
  { id: 'pmf', title: 'Distribution de probabilité (PMF)', short: 'Liste exhaustive des résultats possibles et de leur probabilité.', question: 'Quelle est la forme complète du risque ?', formula: 'Les jets indépendants sont combinés par convolution ; la masse totale vaut 1.', example: 'Pour 2D6, 7 est plus fréquent que 2 ou 12.', interpretation: 'C’est la source commune de la moyenne, des quantiles et des probabilités de seuil.', warning: 'Warforge n’utilise pas de Monte-Carlo : il n’y a pas de bruit d’échantillonnage.' },
  { id: 'useful-damage', title: 'Dégâts utiles et sur-dégâts', short: 'Dégâts réellement retirés après allocation attaque par attaque.', question: 'Combien de la production contribue réellement à détruire la cible ?', formula: STATISTICS_METRIC_DEFINITIONS['useful-damage'].formula, example: 'Une attaque Dégâts 3 contre une figurine à 2 PV produit 2 dégâts utiles ; le dégât excédentaire ne passe pas à la suivante.', interpretation: 'Préférer les dégâts utiles pour mesurer l’efficience contre une cible précise.', warning: 'L’ordre d’allocation défensive suit l’ordre des compositions du catalogue lorsque plusieurs profils existent.' },
  { id: 'destroy', title: 'Probabilité de destruction', short: 'Probabilité que toutes les figurines soient détruites après allocation.', question: 'Quelle est la chance de terminer la cible en une activation ?', formula: STATISTICS_METRIC_DEFINITIONS.destroy.formula, example: 'Une probabilité de 40 % signifie que six activations sur dix échoueraient encore en moyenne.', interpretation: 'C’est une mesure de seuil, plus décisionnelle que les seuls dégâts moyens.', warning: 'Elle suppose la cible intacte et les hypothèses neutres affichées.' },
  { id: 'losses', title: 'Pertes attendues', short: 'Nombre moyen de figurines entièrement détruites.', question: 'Combien de figurines la cible perd-elle réellement ?', formula: STATISTICS_METRIC_DEFINITIONS.losses.formula, example: 'Une attaque Dégâts 3 contre deux figurines à 2 PV détruit une seule figurine.', interpretation: 'Plus fidèle que dégâts ÷ PV lorsqu’une attaque sur-dimensionnée gaspille des dégâts.', warning: 'Dépend directement des PV par figurine et de l’ordre d’allocation.' },
  { id: 'effective-wounds', title: 'PV effectifs', short: 'Résilience ramenée à la menace défensive sélectionnée.', question: 'Quelle quantité de pression cette unité absorbe-t-elle dans ce contexte ?', formula: 'PV bruts ajustés selon les dégâts moyens effectivement reçus par la menace.', example: 'Une bonne sauvegarde augmente les PV effectifs contre une faible PA.', interpretation: 'Toujours comparer les PV effectifs avec la même menace.', warning: 'Ce n’est pas une caractéristique universelle de l’unité.' },
  { id: 'efficiency', title: 'Efficience par 100 points', short: 'Production normalisée pour comparer des coûts différents.', question: 'Quelle quantité de ressource est obtenue pour le même budget ?', formula: 'Métrique × 100 ÷ coût de la configuration.', example: '6 dégâts pour 150 points donnent 4 dégâts par 100 points.', interpretation: 'Permet de comparer des tailles différentes sans masquer leur impact absolu.', warning: 'L’unité la plus efficiente n’est pas forcément celle qui franchit le seuil tactique nécessaire.' },
  { id: 'percentile', title: 'Percentile', short: 'Position d’une valeur dans une cohorte définie.', question: 'Où se situe cette configuration parmi ses comparables ?', formula: 'Part des valeurs inférieures, avec moitié des égalités.', example: '80e percentile signifie que la valeur dépasse approximativement 80 % de la cohorte.', interpretation: 'Lire conjointement la cohorte, son effectif et la métrique.', warning: 'Un percentile de rôle, de faction et de groupe ne répond pas à la même question.' },
  { id: 'hazardous', title: 'Risque Hazardous', short: 'Distribution des échecs de tests et des dégâts subis par le tireur.', question: 'Quel coût propre accompagne cette salve ?', formula: STATISTICS_METRIC_DEFINITIONS.hazardous.formula, example: 'Un seul test a 1 chance sur 6 d’échouer ; deux tests sont combinés sans simulation.', interpretation: 'Lire séparément rendement offensif et risque propre.', warning: 'Le moteur ne présume pas de relance ou de protection externe.' },
  { id: 'one-shot', title: 'Armes One Shot', short: 'Production ponctuelle séparée du rendement répétable.', question: 'Quelle réserve de dégâts n’est utilisable qu’une fois ?', formula: STATISTICS_METRIC_DEFINITIONS['one-shot'].formula, example: 'Un missile One Shot apparaît dans sa propre distribution et pas dans le tir régulier.', interpretation: 'L’ajouter seulement au tour où l’arme est effectivement disponible.', warning: 'Ne pas comparer son rendement comme s’il était produit à chaque tour.' },
  { id: 'mobility', title: 'Mobilité et projection', short: 'Distances théoriques accessibles sous les hypothèses affichées.', question: 'À quelle distance l’unité menace-t-elle une cible ?', formula: STATISTICS_METRIC_DEFINITIONS.mobility.formula, example: 'M 6 et portée 24 donnent une projection de tir de 30 pouces.', interpretation: 'Comparer avec les mêmes conditions de mouvement et de portée.', warning: 'Terrain, pivot, ligne de vue et placement ne sont pas simulés.' },
  { id: 'control', title: 'Contrôle d’objectif', short: 'OC total et OC normalisé par le coût.', question: 'Quelle présence chiffrée l’unité apporte-t-elle ?', formula: STATISTICS_METRIC_DEFINITIONS.control.formula, example: 'Un chef OC2 et quatre figurines OC1 produisent 6 OC.', interpretation: 'L’OC absolu sert aux seuils ; OC/100 sert aux comparaisons de budget.', warning: 'Battle-shock, placement réel et rayon d’objectif peuvent changer la situation.' },
  { id: 'survival', title: 'Probabilité de survie', short: 'Chance qu’au moins une figurine subsiste après la menace.', question: 'Quelle est la chance de ne pas perdre toute l’unité ?', formula: STATISTICS_METRIC_DEFINITIONS.survival.formula, example: '70 % de survie signifie 30 % de destruction complète sous cette menace.', interpretation: 'Toujours nommer la menace associée.', warning: 'Ce n’est pas une durabilité universelle.' },
  { id: 'coverage', title: 'Couverture analytique', short: 'Indique si un effet potentiellement pertinent reste non modélisé.', question: 'Puis-je lire cette valeur sans réserve méthodologique connue ?', formula: STATISTICS_METRIC_DEFINITIONS.coverage.formula, example: 'Une aptitude textuelle non structurée rend la couverture partielle.', interpretation: 'Ouvrir la liste des effets non supportés avant une décision.', warning: 'Complète signifie complète pour la baseline, pas simulation exhaustive de la partie.' },
  { id: 'roles', title: 'Rôles tactiques inférés', short: 'Étiquettes analytiques multi-labels, distinctes des règles officielles.', question: 'Dans quelles fonctions quantitatives ce profil se distingue-t-il ?', formula: STATISTICS_METRIC_DEFINITIONS.roles.formula, example: 'Anti-véhicule est évalué contre la cible Véhicule fixe, pas depuis l’Endurance de l’attaquant.', interpretation: 'Lire score, critère, version et confiance ensemble.', warning: 'Un rôle est une inférence révisable, jamais une recommandation absolue.' },
  { id: 'breakpoint', title: 'Breakpoint', short: 'Seuil où une caractéristique change concrètement le résultat.', question: 'Quand une PA, une Force ou un Dégât supplémentaire devient-il décisif ?', formula: 'Comparaison des distributions de part et d’autre d’un seuil de sauvegarde, blessure ou PV.', example: 'Dégâts 3 éliminent exactement une figurine à 3 PV alors que Dégâts 2 laissent un PV.', interpretation: 'Les breakpoints expliquent pourquoi un petit changement peut avoir un effet discontinu.', warning: 'Ils dépendent du profil de cible.' }
];

export function MetricHelp({ metric }: { metric: string }): React.JSX.Element {
  const entry = STATISTICS_GUIDE_ENTRIES.find((candidate) => candidate.id === metric);
  if (!entry) return <></>;
  return <a className="statistics-help" href={`#statistics/guide/${entry.id}`} title={entry.short} aria-label={`Aide : ${entry.title}`}>?</a>;
}

export function StatisticsGuide({ onBack }: { onBack?: () => void }): React.JSX.Element {
  const [search, setSearch] = useState('');
  const d6 = useMemo(() => summarizeMass(parseDiceMass('D6')), []);
  const examples = useMemo(() => {
    const target: StatisticsTarget = { id: 'guide', label: 'Exemple', toughness: 4, save: 3, invulnerableSave: 4, woundsPerModel: 2, models: 2, keywords: ['infantry'] };
    const reliable = summarizeMass([[3, 1] as const]);
    const explosive = summarizeMass([[0, 0.5] as const, [6, 0.5] as const]);
    const ap = summarizeMass(weaponDamageMass({ Attacks: '1', ToHit: '2+', Strength: '8', AP: '-3', Damage: '2' }, target));
    const damageThree = allocateDamageMass([[3, 1] as const], [[1, 1] as const], 2, 2);
    return { reliable, explosive, ap, allocated: summarizeMass(damageThree.usefulDamage), percentile: percentile([2, 4, 6, 8, 10], 8).percentile };
  }, []);
  const entries = STATISTICS_GUIDE_ENTRIES.filter((entry) => `${entry.title} ${entry.short} ${entry.question}`.toLowerCase().includes(search.trim().toLowerCase()));
  const activeAnchor = window.location.hash.split('/').at(-1);

  return (
    <main className="statistics-guide-page">
      <header className="statistics-guide-hero">
        <div><span className="eyebrow">MÉTHODOLOGIE · {STATISTICS_GUIDE_VERSION}</span><h1>Guide des statistiques</h1><p>Comprendre ce que Warforge calcule, comment le lire et jusqu’où lui faire confiance.</p></div>
        {onBack && <button type="button" onClick={onBack}>Retour au dashboard</button>}
      </header>
      <div className="statistics-guide-layout">
        <aside className="statistics-guide-toc">
          <label>Rechercher<input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Moyenne, percentile…" /></label>
          <nav aria-label="Sommaire du guide">
            <a href="#statistics/guide/quick-read">Lire une fiche en 2 minutes</a>
            {STATISTICS_GUIDE_ENTRIES.map((entry) => <a key={entry.id} href={`#statistics/guide/${entry.id}`}>{entry.title}</a>)}
            <a href="#statistics/guide/limits">Ce que Warforge ne sait pas</a>
          </nav>
        </aside>
        <article className="statistics-guide-content">
          <section id="quick-read" className={activeAnchor === 'quick-read' ? 'guide-highlight' : ''}>
            <h2>Lire une fiche en deux minutes</h2>
            <ol><li>Choisissez la cible : tous les dégâts en dépendent.</li><li>Regardez la médiane et P10 avant la moyenne pour mesurer le plancher.</li><li>Vérifiez la probabilité de destruction si votre plan exige un seuil précis.</li><li>Comparez l’efficience seulement dans une cohorte pertinente.</li><li>Lisez la couverture : une aptitude textuelle non modélisée peut changer la réalité.</li></ol>
            <div className="guide-callout"><strong>Exemple vivant :</strong> un D6 a une moyenne de {d6.mean.toLocaleString('fr-FR')} et un écart-type de {d6.standardDeviation.toLocaleString('fr-FR', { maximumFractionDigits: 2 })}. Ces valeurs sont calculées par le même moteur que le dashboard.</div>
            <div className="guide-example-grid"><div><strong>Même moyenne, risque différent</strong><p>Fixe 3 : moyenne {examples.reliable.mean}, risque de zéro {examples.reliable.zeroProbability * 100} %. Explosif 0/6 : moyenne {examples.explosive.mean}, risque de zéro {examples.explosive.zeroProbability * 100} %.</p></div><div><strong>PA et invulnérable</strong><p>La PA -3 rencontre ici l’invulnérable 4+ ; dégâts moyens calculés : {examples.ap.mean.toLocaleString('fr-FR', { maximumFractionDigits: 2 })}.</p></div><div><strong>Sur-dégât multi-PV</strong><p>Une attaque D3 contre deux figurines à 2 PV inflige {examples.allocated.mean} dégâts utiles et ne reporte pas son excédent.</p></div><div><strong>Percentile de cohorte</strong><p>La valeur 8 dans [2, 4, 6, 8, 10] se situe au percentile {examples.percentile.toLocaleString('fr-FR')} selon la convention des égalités du moteur.</p></div></div>
          </section>
          {entries.map((entry) => (
            <section id={entry.id} key={entry.id} className={activeAnchor === entry.id ? 'guide-highlight' : ''}>
              <h2>{entry.title}</h2><p className="guide-lede">{entry.short}</p>
              <dl><div><dt>Question tactique</dt><dd>{entry.question}</dd></div><div><dt>Unité</dt><dd>{STATISTICS_METRIC_DEFINITIONS[entry.id as keyof typeof STATISTICS_METRIC_DEFINITIONS]?.unit ?? 'Selon la métrique'}</dd></div><div><dt>Calcul</dt><dd>{STATISTICS_METRIC_DEFINITIONS[entry.id as keyof typeof STATISTICS_METRIC_DEFINITIONS]?.formula ?? entry.formula}</dd></div><div><dt>Exemple</dt><dd>{entry.example}</dd></div><div><dt>Bonne lecture</dt><dd>{entry.interpretation}</dd></div><div><dt>Dépendances</dt><dd>Cible, menace, coût et couverture selon l’indicateur affiché.</dd></div><div><dt>Piège à éviter</dt><dd>{entry.warning}</dd></div><div><dt>Effets inclus/exclus</dt><dd>Baseline neutre ; tout effet non structuré apparaît dans la couverture analytique.</dd></div></dl>
              <a href={`#statistics?help=${entry.id}`}>Voir cette métrique dans le dashboard</a>
            </section>
          ))}
          <section id="limits" className={activeAnchor === 'limits' ? 'guide-highlight' : ''}>
            <h2>Ce que Warforge ne sait pas</h2>
            <p>Le moteur ne connaît ni le terrain réel, ni les lignes de vue, ni les décisions adverses, ni la valeur d’un placement, ni les objectifs de mission, ni les ressources dépensées pendant la partie. La baseline exclut couvert, demi-portée, charge, Heavy, Lance, Melta, Rapid Fire, stratagèmes, détachements, améliorations, auras et buffs externes.</p>
            <p>Les aptitudes textuelles non structurées sont listées comme effets non supportés et ne modifient jamais les résultats en silence. Une moyenne théorique n’est ni une promesse, ni un taux de victoire.</p>
          </section>
          <footer>Moteur {STATISTICS_ENGINE_VERSION} · Annotations {STATISTICS_ANNOTATION_VERSION} · Guide {STATISTICS_GUIDE_VERSION} · Méthodologie Warforge, pas source de règles W40K.</footer>
        </article>
      </div>
    </main>
  );
}
