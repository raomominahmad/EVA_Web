import type { ReactNode, RefObject } from 'react';
import { BrandMark } from '@/components/brand/BrandMark';
import { Button } from '@/components/ui/Button';
import { Stepper } from '@/components/workflow/Stepper';
import type { WorkflowStep } from '@/app/workflow/workflowTypes';
import type { AppView } from './appView';
import styles from './AppShell.module.css';

interface AppShellProps {
  view: AppView;
  currentStep: WorkflowStep;
  mainRef: RefObject<HTMLElement | null>;
  onStart: () => void;
  /** Changes when the view or step changes, replaying the short entrance transition. */
  contentKey: string;
  children: ReactNode;
}

/** In-page destinations on the landing page; the header shows the first three. */
const LANDING_LINKS = [
  { href: '#features', label: 'Features' },
  { href: '#how-it-works', label: 'How it works' },
  { href: '#about', label: 'About' },
  { href: '#sample-report', label: 'Sample report' },
  { href: '#ai-summary-feature', label: 'AI summary' },
] as const;

/** The landing page's footer: what EVA is, and where to go on the page. */
function LandingFooterTop() {
  return (
    <div className={styles.footerTop}>
      <section id="about" className={styles.about} aria-labelledby="about-title">
        <h2 id="about-title" className={styles.aboutTitle}>
          <BrandMark className={styles.footerMark} />
          About EVA
        </h2>
        <p>
          EVA is an educational Earned Value Analysis tool, built as a university assignment. It
          turns four project values into an explained, auditable report of cost and schedule
          performance. Everything is calculated in your browser.
        </p>
      </section>
      <nav aria-label="Footer">
        <h2 className={styles.footerNavTitle}>On this page</h2>
        <ul className={styles.footerLinks}>
          {LANDING_LINKS.filter(({ href }) => href !== '#about').map(({ href, label }) => (
            <li key={href}>
              <a href={href}>{label}</a>
            </li>
          ))}
        </ul>
      </nav>
    </div>
  );
}

function Brand() {
  return (
    <div className={styles.brand}>
      <BrandMark className={styles.mark} />
      <div className={styles.brandText}>
        <span className={styles.brandName}>EVA</span>
        <span className={styles.brandSubtitle}>Earned Value Analysis</span>
      </div>
    </div>
  );
}

export function AppShell({
  view,
  currentStep,
  mainRef,
  onStart,
  contentKey,
  children,
}: AppShellProps) {
  const landing = view === 'landing';

  return (
    <div className={styles.shell} data-view={view}>
      <header className={`${styles.header} on-navy`}>
        <div className={styles.headerInner}>
          <Brand />
          {landing ? (
            <nav className={styles.siteNav} aria-label="Site">
              <ul className={styles.navLinks}>
                {LANDING_LINKS.slice(0, 3).map(({ href, label }) => (
                  <li key={href}>
                    <a className={styles.navLink} href={href}>
                      {label}
                    </a>
                  </li>
                ))}
              </ul>
              <Button variant="onNavy" className={styles.navAction} onClick={onStart}>
                Create a project
              </Button>
            </nav>
          ) : (
            <Stepper currentStep={currentStep} />
          )}
        </div>
      </header>

      <main ref={mainRef} id="main-content" className={styles.main} tabIndex={-1}>
        <div
          key={contentKey}
          className={landing ? styles.enter : `${styles.mainInner} ${styles.enter}`}
        >
          {children}
        </div>
      </main>

      <footer className={`${styles.footer} on-navy`}>
        {landing ? <LandingFooterTop /> : null}
        <div className={styles.footerInner}>
          <p className={styles.footerBrand}>
            <BrandMark className={styles.footerMark} />
            <span>Earned Value Analysis</span>
          </p>
          <p>Frontend-only analysis. Data stays in this browser.</p>
          <p className={styles.phaseNote}>
            University assignment scope. The optional AI summary runs through a local backend.
          </p>
        </div>
      </footer>
    </div>
  );
}
