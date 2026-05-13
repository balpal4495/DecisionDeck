import type { Metadata } from "next"
import "./globals.css"
import { NavLink } from "@/components/ui/NavLink"
import styles from "./layout.module.css"

export const metadata: Metadata = {
  title: "DecisionDeck",
  description: "Engineering manager flight deck and decision memory",
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body>
        <div className={styles.shell}>
          <nav className={styles.nav}>
            <div className={styles.navBrand}>
              <div className={styles.navBrandName}>DecisionDeck</div>
              <div className={styles.navBrandSub}>EM Flight Deck</div>
            </div>
            <ul className={styles.navList}>
              <li className={styles.navItem}>
                <NavLink href="/" className={styles.navLink} activeClassName={styles.navLinkActive}>
                  Dashboard
                </NavLink>
              </li>
              <li className={styles.navItem}>
                <NavLink href="/decisions" className={styles.navLink} activeClassName={styles.navLinkActive}>
                  Decisions
                </NavLink>
              </li>
              <li className={styles.navItem}>
                <NavLink href="/work" className={styles.navLink} activeClassName={styles.navLinkActive}>
                  Work
                </NavLink>
              </li>
              <li className={styles.navItem}>
                <NavLink href="/triage" className={styles.navLink} activeClassName={styles.navLinkActive}>
                  Triage
                </NavLink>
              </li>
              <li className={styles.navItem}>
                <NavLink href="/pulse" className={styles.navLink} activeClassName={styles.navLinkActive}>
                  Pulse
                </NavLink>
              </li>
              <li className={styles.navItem}>
                <NavLink href="/graph" className={styles.navLink} activeClassName={styles.navLinkActive}>
                  Alignment
                </NavLink>
              </li>
              <li className={styles.navItem}>
                <NavLink href="/timeline" className={styles.navLink} activeClassName={styles.navLinkActive}>
                  Timeline
                </NavLink>
              </li>
              <div className={styles.navDivider} />
              <li className={styles.navItem}>
                <NavLink href="/risks" className={styles.navLink} activeClassName={styles.navLinkActive}>
                  Risks
                </NavLink>
              </li>
              <li className={styles.navItem}>
                <NavLink href="/incidents" className={styles.navLink} activeClassName={styles.navLinkActive}>
                  Incidents
                </NavLink>
              </li>
              <div className={styles.navDivider} />
              <li className={styles.navItem}>
                <NavLink href="/reports" className={styles.navLink} activeClassName={styles.navLinkActive}>
                  Reports
                </NavLink>
              </li>
            </ul>
          </nav>
          <main className={styles.main}>{children}</main>
        </div>
      </body>
    </html>
  )
}
