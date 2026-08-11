import { BrandMark } from './BrandMark';

export type GlobalNavigationView = 'builder' | 'reference' | 'weapons' | 'statistics' | 'learning' | 'inventory';

interface GlobalNavigationProps {
  activeView: GlobalNavigationView;
  locale: 'fr' | 'en';
  onChangeLocale: (locale: string) => void;
  onExportProfile: () => void;
  onImportProfile: () => void;
  onOpenProjectStatus: () => void;
}

const destinations: Array<{ view: GlobalNavigationView; hash: string; icon: string; fr: string; en: string }> = [
  { view: 'statistics', hash: '#statistics', icon: 'Σ', fr: 'Statistiques', en: 'Statistics' },
  { view: 'builder', hash: '#builder', icon: '⌘', fr: 'Liste', en: 'Builder' },
  { view: 'reference', hash: '#reference/core', icon: '§', fr: 'Règles', en: 'Rules' },
  { view: 'weapons', hash: '#weapons', icon: '✦', fr: 'Arsenal', en: 'Armoury' },
  { view: 'learning', hash: '#learning', icon: '🎓', fr: 'Apprendre', en: 'Learning' },
  { view: 'inventory', hash: '#inventory', icon: '▦', fr: 'Inventaire', en: 'Inventory' }
];

export function GlobalNavigation({ activeView, locale, onChangeLocale, onExportProfile, onImportProfile, onOpenProjectStatus }: GlobalNavigationProps): React.JSX.Element {
  const isFrench = locale === 'fr';

  return (
    <header className="global-navigation">
      <a className="global-navigation-brand" href="#builder" aria-label="Warforge 40K">
        <BrandMark />
        <span>
          <strong>Warforge 40K</strong>
          <small>{isFrench ? 'Compagnon de bataille' : 'Battle companion'}</small>
        </span>
      </a>
      <nav className="global-navigation-links" aria-label={isFrench ? 'Navigation principale' : 'Primary navigation'}>
        {destinations.map((destination) => {
          const active = destination.view === activeView;
          return (
            <a
              key={destination.view}
              className={active ? 'global-navigation-link active' : 'global-navigation-link'}
              href={destination.hash}
              aria-current={active ? 'page' : undefined}
            >
              <span aria-hidden="true">{destination.icon}</span>
              {isFrench ? destination.fr : destination.en}
            </a>
          );
        })}
      </nav>
      <div className="global-navigation-utilities">
        <div className="global-profile-actions" role="group" aria-label={isFrench ? 'Sauvegarde du profil' : 'Profile backup'}>
          <button type="button" className="global-profile-action global-project-status" onClick={onOpenProjectStatus} title={isFrench ? 'Statut du projet et mentions' : 'Project status and notices'}>
            <span aria-hidden="true">i</span>{isFrench ? 'Prototype' : 'Prototype'}
          </button>
          <button type="button" className="global-profile-action" onClick={onExportProfile} title={isFrench ? 'Exporter le profil' : 'Export profile'}>
            <span aria-hidden="true">⇧</span>{isFrench ? 'Exporter' : 'Export'}
          </button>
          <button type="button" className="global-profile-action" onClick={onImportProfile} title={isFrench ? 'Importer un profil' : 'Import profile'}>
            <span aria-hidden="true">⇩</span>{isFrench ? 'Importer' : 'Import'}
          </button>
        </div>
        <label className="global-navigation-language">
          <span>{isFrench ? 'Langue' : 'Language'}</span>
          <select value={locale} onChange={(event) => onChangeLocale(event.target.value)} aria-label={isFrench ? 'Choisir la langue' : 'Choose language'}>
            <option value="fr">Français</option>
            <option value="en">English</option>
          </select>
        </label>
      </div>
    </header>
  );
}
