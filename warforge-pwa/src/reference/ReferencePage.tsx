import type { NormalizedDatabase } from '../domain/types';
import { useEffect, useState } from 'react';
import { ReferenceCorePage } from './core/ReferenceCorePage';
import { ReferenceFactionsPage } from './factions/ReferenceFactionsPage';
import { ReferenceMissionsPage } from './missions/ReferenceMissionsPage';
import { ReferenceSearchPage } from './search/ReferenceSearchPage';

export interface ReferencePageProps {
  database: NormalizedDatabase | null;
  locale: 'fr' | 'en';
}

type ReferenceRoute = 'core' | 'factions' | 'missions' | 'search';

const destinations: Array<{ route: ReferenceRoute; href: string; fr: string; en: string }> = [
  { route: 'core', href: '#reference/core', fr: 'Règles de base', en: 'Core rules' },
  { route: 'factions', href: '#reference/factions', fr: 'Codex & Factions', en: 'Codex & Factions' },
  { route: 'missions', href: '#reference/missions', fr: 'Missions', en: 'Missions' },
  { route: 'search', href: '#reference/search', fr: 'Recherche', en: 'Search' }
];

function referenceRouteFromHash(): ReferenceRoute {
  const match = window.location.hash.match(/^#(reference|rules)(?:\/([^?#]+))?/);
  if (!match || match[1] === 'rules') return 'core';
  return destinations.some((destination) => destination.route === match[2]) ? match[2] as ReferenceRoute : 'core';
}

export function ReferencePage(props: ReferencePageProps): React.JSX.Element {
  const [route, setRoute] = useState<ReferenceRoute>(() => referenceRouteFromHash());

  useEffect(() => {
    const handleHashChange = (): void => setRoute(referenceRouteFromHash());
    window.addEventListener('hashchange', handleHashChange);
    handleHashChange();
    return () => window.removeEventListener('hashchange', handleHashChange);
  }, []);

  
  const isFrench = props.locale === 'fr';
  const title = route === 'core' ? (isFrench ? 'Règles de base' : 'Core rules') :
                route === 'factions' ? (isFrench ? 'Factions & Codex' : 'Factions & Codex') :
                route === 'missions' ? (isFrench ? 'Missions & Déploiements' : 'Missions & Deployments') :
                (isFrench ? 'Recherche globale' : 'Global search');
  return (
    <main className="rules-shell">
      <header className="reference-header">
        <div>
          <span className="eyebrow">WARFORGE 40K · {isFrench ? 'RÉFÉRENCE' : 'REFERENCE'}</span>
          <h1>{title}</h1>
          <p>{isFrench ? 'Outils de référence hors ligne pour préparer et jouer.' : 'Offline reference tools for preparation and play.'}</p>
        </div>
      </header>

      <nav className="reference-nav" aria-label={isFrench ? 'Sections de la référence' : 'Reference sections'}>
        {destinations.map((destination) => {
          const active = route === destination.route;
          return <a key={destination.route} href={destination.href} className={active ? 'active' : undefined} aria-current={active ? 'page' : undefined}>{isFrench ? destination.fr : destination.en}</a>;
        })}
      </nav>

      {route === 'core' && <ReferenceCorePage locale={props.locale} />}
      {route === 'factions' && <ReferenceFactionsPage database={props.database} locale={props.locale} />}
      {route === 'missions' && <ReferenceMissionsPage locale={props.locale} />}
      {route === 'search' && <ReferenceSearchPage database={props.database} locale={props.locale} />}
    </main>
  );

}
