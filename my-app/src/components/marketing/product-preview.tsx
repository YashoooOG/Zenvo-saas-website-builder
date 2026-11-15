"use client";

import { useRef, useState } from "react";
import { ArrowUpRight, LayoutGrid, PanelsTopLeft, Columns3, Check, ChevronRight } from "lucide-react";

const views = ["Clients", "Projects", "Websites"] as const;
const clients = [
  { name: "Acme Studio", initials: "AS", kind: "Brand & digital", projects: 4, color: "cobalt" },
  { name: "Forma Living", initials: "FL", kind: "Home & interiors", projects: 2, color: "sand" },
  { name: "Orbit Coffee", initials: "OC", kind: "Food & hospitality", projects: 3, color: "sage" },
];

export function ProductPreview() {
  const [view, setView] = useState(0);
  const buttons = useRef<(HTMLButtonElement | null)[]>([]);
  return (
    <div className="product-demo">
      <div className="demo-switcher" role="tablist" aria-label="Explore the product preview">
        {views.map((label, index) => <button key={label} ref={element => { buttons.current[index] = element; }} type="button" role="tab" id={`preview-tab-${index}`} aria-controls="preview-panel" aria-selected={view === index} tabIndex={view === index ? 0 : -1} onClick={() => setView(index)} onKeyDown={event => {
          const next = event.key === "ArrowRight" ? (index + 1) % 3 : event.key === "ArrowLeft" ? (index + 2) % 3 : event.key === "Home" ? 0 : event.key === "End" ? 2 : -1;
          if (next !== -1) { event.preventDefault(); setView(next); buttons.current[next]?.focus(); }
        }}>{label}</button>)}
      </div>
      <div className="preview-window" id="preview-panel" role="tabpanel" aria-labelledby={`preview-tab-${view}`} tabIndex={0}>
        <div className="preview-bar"><span className="studio-mark">n.</span><span>North Studio <span className="preview-breadcrumb">/ {views[view]}</span></span><span className="preview-avatar">JD</span></div>
        <div className="preview-body">
          <aside className="preview-sidebar" aria-label="Illustrative workspace sidebar"><span className="preview-sidebar-label">Workspace</span><span><LayoutGrid /> Overview</span><span className={view === 0 ? "is-current" : ""}><PanelsTopLeft /> Clients</span><span className={view === 1 ? "is-current" : ""}><Columns3 /> Projects</span><span className={view === 2 ? "is-current" : ""}><PanelsTopLeft /> Websites</span><div className="preview-sidebar-bottom">North Studio<br /><small>Agency workspace</small></div></aside>
          <div className="preview-content">
            {view === 0 && <><div className="preview-heading"><div><p>Everything in its place</p><h3>Client workspaces</h3></div><span className="preview-count">03</span></div>
              <div className="client-list">{clients.map(client => <div className="client-row" key={client.name}><span className={`client-mark ${client.color}`}>{client.initials}</span><div><strong>{client.name}</strong><span>{client.kind}</span></div><span className="project-count">{client.projects} projects</span><ChevronRight size={16} strokeWidth={1.5} aria-hidden="true" /></div>)}</div>
              <div className="preview-note"><span className="note-mark"><Check size={16} strokeWidth={1.5} /></span><span>One agency. A space for every client.</span></div></>}
            {view === 1 && <><div className="preview-heading"><div><p>Acme Studio / Website refresh</p><h3>From brief to launch</h3></div></div><div className="mini-board">{[{name:"To do",items:["Mobile layouts","Image selection"]},{name:"In progress",items:["Homepage design","Client feedback"]},{name:"Done",items:["Creative brief"]}].map((lane,index)=><div className="mini-lane" key={lane.name}><h4><span className={`lane-dot lane-${index}`} />{lane.name}<span>{lane.items.length}</span></h4>{lane.items.map((item,i)=><div className="mini-ticket" key={item}><p>{item}</p><div><span>{index===2 ? "Approved" : "Website"}</span><span className="ticket-avatar">{i===0?"JD":"MK"}</span></div></div>)}</div>)}</div></>}
            {view === 2 && <><div className="preview-heading"><div><p>Forma Living / Storefront</p><h3>A home for the brand</h3></div><span className="preview-text-status">Draft</span></div><div className="mini-website"><div className="mini-site-nav"><strong>forma</strong><span>Objects for everyday living</span></div><div className="mini-site-hero"><div><p>Made for the way you live</p><h4>Less, but<br />considered.</h4><span>Explore the collection <ArrowUpRight size={16} /></span></div><div className="forma-object" aria-hidden="true"><div className="forma-vase" /><div className="forma-plinth" /></div></div></div></>}
          </div>
        </div>
      </div>
      <p className="demo-caption"><span className="caption-line" /> Interactive product preview · sample data</p>
    </div>
  );
}
