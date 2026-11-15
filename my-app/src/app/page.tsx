import Link from "next/link";
import { ArrowRight, ArrowUpRight, Check, Plus } from "lucide-react";
import { SiteHeader } from "@/components/marketing/site-header";
import { ProductPreview } from "@/components/marketing/product-preview";
import { Brand } from "@/components/brand";
import { ThemeSelect } from "@/components/theme-select";

const features = [
  { number: "01", title: "Give every client their own space", description: "Dedicated sub-accounts keep each client's team, assets, and projects together, under your agency's brand.", detail: "Client workspaces" },
  { number: "02", title: "Take a website from idea to launch", description: "A visual website and funnel builder, with the pages, media, and checkout experience in the same workspace.", detail: "Websites & funnels" },
  { number: "03", title: "Keep the next step in sight", description: "Move projects and leads through clear pipelines. See what's ready, what's in progress, and what needs a decision.", detail: "Projects & pipelines" },
  { number: "04", title: "Connect the work to the business", description: "Bring agency subscriptions and client sales together with Stripe Connect, alongside the work they support.", detail: "Payments & billing" },
];
const questions = [
  { title: "Who is Zenvo for?", answer: "Zenvo is being built for agencies that manage websites and ongoing projects for multiple clients. The agency owns the main workspace; each client gets a separate sub-account." },
  { title: "Can I use my own branding?", answer: "White-label branding is part of the planned platform: agency identity, client workspaces, and custom domains. These capabilities are being developed alongside the website builder." },
  { title: "What can I use today?", answer: "You can create an account and access your secure workspace today. Client management, the builder, pipelines, and billing are in development. The interactive preview above uses sample data to show the intended experience." },
  { title: "How will pricing work?", answer: "Subscription plans will be published when billing is available. Creating an account currently does not start a paid subscription or require a payment card." },
];

export default function Home() {
  return (
    <div className="marketing-page">
      <a href="#main-content" className="skip-link">Skip to content</a>
      <SiteHeader />
      <main id="main-content">
        <section className="hero site-width" aria-labelledby="hero-title">
          <div className="hero-copy">
            <p className="section-kicker"><span className="client-bracket" aria-hidden="true" /> Built for agency owners</p>
            <h1 id="hero-title">Your agency.<br />Every client.<br /><span>One workspace.</span></h1>
            <p className="hero-description">Bring your client workspaces, websites, projects, and payments together. Built around the way agencies work.</p>
            <div className="hero-actions"><Link href="/sign-up" className="action">Create your account <ArrowRight size={16} strokeWidth={1.5} aria-hidden="true" /></Link><a href="#platform" className="text-action">Explore the platform <ArrowUpRight size={16} strokeWidth={1.5} aria-hidden="true" /></a></div>
          </div>
          <ProductPreview />
        </section>
        <div className="platform-strip"><div className="site-width"><p>From the first brief<br /><strong>to the next big thing</strong></p><span>Client workspaces</span><span>Website builder</span><span>Project pipelines</span><span>Connected payments</span></div></div>
        <section id="platform" className="platform-section site-width section-space" aria-labelledby="platform-title">
          <div className="section-intro"><p className="section-kicker">The Zenvo platform</p><h2 id="platform-title">Less switching.<br />More moving forward.</h2><p>One connected place for the moving parts of agency life. Here’s the platform we’re building.</p><a href="#workflow" className="text-action">See how it fits together <ArrowRight size={16} strokeWidth={1.5} /></a></div>
          <div className="feature-list">{features.map(feature => <article className="feature-row" key={feature.number}><span className="feature-number">{feature.number}</span><div><p className="feature-detail">{feature.detail}</p><h3>{feature.title}</h3><p>{feature.description}</p></div></article>)}</div>
        </section>
        <section id="workflow" className="workflow-section section-space" aria-labelledby="workflow-title"><div className="site-width"><div className="workflow-heading"><div><p className="section-kicker">A workflow that stays connected</p><h2 id="workflow-title">Start with your agency.<br />Make room for every client.</h2></div><p>The same simple structure, whether you’re opening your first client workspace or organizing your next one.</p></div><ol className="workflow-steps">
          <li><span className="step-number">01 / Agency</span><h3>Make it yours</h3><p>Set the identity, invite your team, and choose how your agency works.</p></li>
          <li><span className="step-number">02 / Client</span><h3>Give the work a home</h3><p>Organize each client in a dedicated workspace with its own people and projects.</p></li>
          <li><span className="step-number">03 / Delivery</span><h3>Bring it all together</h3><p>Build the site, move the project forward, and connect the checkout.</p></li>
        </ol><p className="workflow-caption"><Check size={16} strokeWidth={1.5} aria-hidden="true" /> Designed for agencies and the businesses they support</p></div></section>
        <section id="questions" className="questions-section site-width section-space" aria-labelledby="questions-title"><div><p className="section-kicker">A few things to know</p><h2 id="questions-title">Good questions.<br />Straight answers.</h2></div><div className="faq-list">{questions.map(question => <details key={question.title}><summary>{question.title}<Plus size={18} strokeWidth={1.5} aria-hidden="true" /></summary><p>{question.answer}</p></details>)}</div></section>
        <section className="closing-section site-width"><div><p className="section-kicker">Your next chapter</p><h2>Make space for<br />your best work.</h2></div><div><p>Start with your account.<br />Build your agency’s next chapter with Zenvo.</p><Link href="/sign-up" className="action">Get started with Zenvo <ArrowRight size={16} strokeWidth={1.5} aria-hidden="true" /></Link></div></section>
      </main>
      <footer className="site-footer site-width"><div><Brand /><p>A home for your agency’s work</p></div><nav aria-label="Footer"><a href="#platform">Platform</a><Link href="/sign-in">Sign in</Link><Link href="/agency" prefetch={false}>Your workspace</Link></nav><ThemeSelect /></footer>
    </div>
  );
}
