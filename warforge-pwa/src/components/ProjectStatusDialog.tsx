import { useEffect, useRef } from 'react';

export type ProjectStatusDialogMode = 'welcome' | 'details';

interface ProjectStatusDialogProps {
  locale: 'fr' | 'en';
  mode: ProjectStatusDialogMode;
  onAcknowledge: () => void;
  onClose: () => void;
}

const copy = {
  fr: {
    eyebrow: 'VERSION DE TEST · DIFFUSION PRIVÉE',
    welcomeTitle: 'Bienvenue dans la version de test',
    detailsTitle: 'Statut du projet',
    lead: 'Warforge 40K est un prototype personnel, non officiel, transmis à un cercle restreint de testeurs. Il ne constitue pas un produit commercial et n’est affilié ni approuvé par Games Workshop.',
    commitmentsTitle: 'À respecter',
    commitments: [
      'Ne pas redistribuer l’application, ses exports ou les ressources qu’elle contient.',
      'Ne pas l’utiliser dans le cadre d’une vente, d’un service ou d’une communication publique.',
      'Ne pas copier ni réutiliser les images et illustrations incluses dans cette build.'
    ],
    rightsTitle: 'Droits et signalement',
    rights: 'Les noms, visuels, règles et marques appartiennent à leurs titulaires respectifs. Certaines ressources visuelles sont provisoires et font encore l’objet d’une vérification de provenance ; cette application ne revendique aucun droit sur elles.',
    removal: 'Pour signaler une ressource ou demander son retrait, contactez la personne qui vous a transmis cette version. Le contenu concerné sera retiré ou remplacé dans une prochaine build.',
    acknowledgement: 'En continuant, vous reconnaissez utiliser une build de test privée et non commerciale.',
    confirm: 'J’ai compris',
    close: 'Fermer'
  },
  en: {
    eyebrow: 'TEST BUILD · PRIVATE DISTRIBUTION',
    welcomeTitle: 'Welcome to the test build',
    detailsTitle: 'Project status',
    lead: 'Warforge 40K is an unofficial personal prototype shared with a small group of testers. It is not a commercial product and is neither affiliated with nor approved by Games Workshop.',
    commitmentsTitle: 'Please respect the following',
    commitments: [
      'Do not redistribute the application, its exports, or any bundled resource.',
      'Do not use it in a sale, service, or public communication.',
      'Do not copy or reuse the images and illustrations included in this build.'
    ],
    rightsTitle: 'Rights and reporting',
    rights: 'Names, visuals, rules, and trademarks belong to their respective owners. Some visual resources are provisional and still undergoing provenance review; this application claims no rights over them.',
    removal: 'To report a resource or request its removal, contact the person who provided this build. The affected content will be removed or replaced in a future build.',
    acknowledgement: 'By continuing, you acknowledge that you are using a private, non-commercial test build.',
    confirm: 'I understand',
    close: 'Close'
  }
} as const;

export function ProjectStatusDialog({ locale, mode, onAcknowledge, onClose }: ProjectStatusDialogProps): React.JSX.Element {
  const primaryActionRef = useRef<HTMLButtonElement>(null);
  const text = copy[locale];
  const isWelcome = mode === 'welcome';

  useEffect(() => {
    primaryActionRef.current?.focus();
  }, []);

  return (
    <div className="project-status-backdrop" role="presentation">
      <section className="project-status-dialog" role="dialog" aria-modal="true" aria-labelledby="project-status-title">
        {!isWelcome && <button className="icon-button project-status-close" type="button" onClick={onClose} aria-label={text.close}>×</button>}
        <span className="eyebrow">{text.eyebrow}</span>
        <h2 id="project-status-title">{isWelcome ? text.welcomeTitle : text.detailsTitle}</h2>
        <p className="project-status-lede">{text.lead}</p>

        <section className="project-status-panel" aria-labelledby="project-status-commitments">
          <h3 id="project-status-commitments">{text.commitmentsTitle}</h3>
          <ul>{text.commitments.map((commitment) => <li key={commitment}>{commitment}</li>)}</ul>
        </section>

        <section className="project-status-rights" aria-labelledby="project-status-rights-title">
          <h3 id="project-status-rights-title">{text.rightsTitle}</h3>
          <p>{text.rights}</p>
          <p>{text.removal}</p>
        </section>

        {isWelcome && <p className="project-status-acknowledgement">{text.acknowledgement}</p>}
        <div className="project-status-actions">
          <button ref={primaryActionRef} type="button" onClick={isWelcome ? onAcknowledge : onClose}>{isWelcome ? text.confirm : text.close}</button>
        </div>
      </section>
    </div>
  );
}
