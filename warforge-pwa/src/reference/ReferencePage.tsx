import type { NormalizedDatabase } from '../domain/types';
import { BrandMark } from '../components/BrandMark';
import { useEffect, useState } from 'react';
import { ReferenceCorePage } from './core/ReferenceCorePage';
import { ReferenceFactionsPage } from './factions/ReferenceFactionsPage';
import { ReferenceMissionsPage } from './missions/ReferenceMissionsPage';
import { ReferenceSearchPage } from './search/ReferenceSearchPage';

export interface ReferencePageProps {
  database: NormalizedDatabase | null;
  locale: 'fr' | 'en';
}

export function ReferencePage(props: ReferencePageProps) {
  const [route, setRoute] = useState<string>('core');

  useEffect(() => {
    const handleHashChange = () => {
      const match = window.location.hash.match(/^#(reference|rules)(?:\/([^?#]+))?/);
      if (match) {
        // match[2] is the sub-route like 'core', 'factions', etc.
        // If it starts with 'rules', we map to 'core' automatically if no sub-route is provided, 
        // though RulesPage handles its own #rules/... hash internally for sections.
        if (match[1] === 'rules') {
           setRoute('core');
        } else {
           setRoute(match[2] || 'core');
        }
      }
    };
    
    window.addEventListener('hashchange', handleHashChange);
    handleHashChange(); // initial
    return () => window.removeEventListener('hashchange', handleHashChange);
  }, []);

  
  const title = route === 'core' ? 'Règles de base' :
                route === 'factions' ? 'Factions & Codex' :
                route === 'missions' ? 'Missions & Déploiements' :
                'Recherche Globale';

  return (
    <main className="rules-shell">
      <header className="rules-topbar">
        <div className="brand-lockup">
          <BrandMark />
          <div>
            <span className="eyebrow">WARFORGE 40K · RÉFÉRENCE</span>
            <h1>{title}</h1>
            <p>{props.locale === 'en' ? 'Offline access' : 'Accès hors ligne'}</p>
          </div>
        </div>
      </header>

      <nav className="reference-nav" style={{ padding: '0 1.5rem', borderBottom: '1px solid var(--border)', display: 'flex', gap: '1.5rem', marginBottom: '1rem', background: '#f8f4eb' }}>
        <a href="#reference/core" style={{ padding: '0.75rem 0', color: route === 'core' ? 'var(--ink)' : 'var(--ink-soft)', fontWeight: route === 'core' ? 800 : 500, borderBottom: route === 'core' ? '2px solid var(--ink)' : '2px solid transparent', textDecoration: 'none' }}>Règles de Base</a>
        <a href="#reference/factions" style={{ padding: '0.75rem 0', color: route === 'factions' ? 'var(--ink)' : 'var(--ink-soft)', fontWeight: route === 'factions' ? 800 : 500, borderBottom: route === 'factions' ? '2px solid var(--ink)' : '2px solid transparent', textDecoration: 'none' }}>Codex & Factions</a>
        <a href="#reference/missions" style={{ padding: '0.75rem 0', color: route === 'missions' ? 'var(--ink)' : 'var(--ink-soft)', fontWeight: route === 'missions' ? 800 : 500, borderBottom: route === 'missions' ? '2px solid var(--ink)' : '2px solid transparent', textDecoration: 'none' }}>Missions</a>
        <a href="#reference/search" style={{ padding: '0.75rem 0', color: route === 'search' ? 'var(--ink)' : 'var(--ink-soft)', fontWeight: route === 'search' ? 800 : 500, borderBottom: route === 'search' ? '2px solid var(--ink)' : '2px solid transparent', textDecoration: 'none' }}>Recherche Globale</a>
      </nav>

      {route === 'core' && <ReferenceCorePage locale={props.locale} />}
      {route === 'factions' && <ReferenceFactionsPage database={props.database} locale={props.locale} />}
      {route === 'missions' && <ReferenceMissionsPage locale={props.locale} />}
      {route === 'search' && <ReferenceSearchPage database={props.database} locale={props.locale} />}
    </main>
  );

}
