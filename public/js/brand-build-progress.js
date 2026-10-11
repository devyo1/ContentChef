import { html, useEffect, useState, useRef } from './lib.js';
import { Icon } from './icons.js';

const brandStages = [
  ['reading', 'Read your website'], ['visuals', 'Study the visuals'],
  ['styles', 'Gather brand details'], ['design', 'Design your brand'], ['review', 'Prepare your preview'],
];

export function BrandBuildProgress({ progress, onCancel, stages = brandStages, heading = 'Bringing your brand to life' }) {
  const [elapsed, setElapsed] = useState(0);
  const panel = useRef(null);
  useEffect(() => {
    panel.current?.scrollIntoView({ block: 'nearest' });
    const start = Date.now();
    const timer = setInterval(() => setElapsed(Math.floor((Date.now() - start) / 1000)), 1000);
    return () => clearInterval(timer);
  }, []);
  const step = Math.max(0, stages.findIndex(([id]) => id === progress.stage));
  return html`<section ref=${panel} class="brand-build-progress" aria-label=${heading}>
    <div class="brand-build-heading"><span class="brand-build-icon"><${Icon} name="sparkles" size=${20} /></span><div><strong>${heading}</strong><span>Step ${step + 1} of ${stages.length}</span></div><time aria-label="Time elapsed">${Math.floor(elapsed / 60)}:${String(elapsed % 60).padStart(2, '0')}</time></div>
    <div class="brand-build-track" role="progressbar" aria-label="Build stages" aria-valuemin="0" aria-valuemax=${stages.length} aria-valuenow=${step} aria-valuetext=${`Step ${step + 1} of ${stages.length}: ${stages[step][1]}`}><div style=${{ width: `${(step + 0.25) / stages.length * 100}%` }}></div></div>
    <ol class="brand-build-stages">${stages.map(([id, label], index) => html`<li class=${index < step ? 'complete' : index === step ? 'current' : ''} aria-current=${index === step ? 'step' : undefined}><span class="brand-build-dot">${index < step ? html`<${Icon} name="check" size=${12} />` : index + 1}</span>${label}</li>`)}</ol>
    <p class="brand-build-detail" role="status" aria-live="polite" aria-atomic="true">${progress.detail}</p>
    <div class="brand-build-footer"><p>${elapsed >= 90 ? 'Still working. Your assistant may need a few minutes; you can keep this window open.' : 'Progress follows each stage. Your assistant may spend a few minutes on the design.'}</p><button type="button" class="btn sm" onClick=${onCancel}>Cancel</button></div>
  </section>`;
}
