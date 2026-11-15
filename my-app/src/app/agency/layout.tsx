import { UserButton } from '@clerk/nextjs';
import { Brand } from '@/components/brand';
import { ThemeSelect } from '@/components/theme-select';
import '../agency.css';
export default function AgencyLayout({ children }: { children: React.ReactNode }) {
  return <div className="workspace-shell"><a href="#workspace-content" className="skip-link">Skip to content</a>
    <header className="workspace-header"><Brand /><div className="account-theme"><ThemeSelect /><UserButton /></div></header>
    <main id="workspace-content" className="workspace-content">{children}</main>
  </div>;
}
