'use client';

import React, { useEffect, useRef, useState } from 'react';
import { X, Eye, Code } from 'lucide-react';

/**
 * CampaignEditor — a real in-app modal to fully edit a campaign draft's subject
 * and HTML body before sending. Two body modes:
 *   - Visual: edit the rendered email text inline (contentEditable).
 *   - HTML:   edit the raw HTML source in a textarea.
 * `body` state is the single source of truth; the visual surface is uncontrolled
 * (innerHTML set only when entering visual mode) so the caret isn't reset on typing.
 */
export function CampaignEditor({
  campaign, busy, onSave, onClose,
}: {
  campaign: any;
  busy: boolean;
  onSave: (id: string, patch: { subject: string; body: string }) => void;
  onClose: () => void;
}) {
  const [subject, setSubject] = useState<string>(campaign.subject || '');
  const [body, setBody] = useState<string>(campaign.body || '');
  const [mode, setMode] = useState<'visual' | 'html'>('visual');
  const visualRef = useRef<HTMLDivElement | null>(null);

  // Seed the visual surface when entering visual mode (NOT on every keystroke).
  useEffect(() => {
    if (mode === 'visual' && visualRef.current) visualRef.current.innerHTML = body;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode]);

  // Pretty-print the HTML (one tag per line, indented) when entering HTML mode so
  // it's readable instead of a single minified paragraph. Idempotent.
  useEffect(() => {
    if (mode === 'html') setBody((b) => formatHtml(b));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode]);

  return (
    <div onClick={onClose} role="dialog" aria-modal="true" style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: '40px 16px', zIndex: 1100, overflow: 'auto' }}>
      <div onClick={(e) => e.stopPropagation()} style={{ width: '100%', maxWidth: 760, background: 'var(--bg-card)', border: '1px solid var(--border-card)', borderRadius: 12, padding: 20 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
          <span style={{ fontSize: 16, fontWeight: 700, color: 'var(--text-primary)' }}>Edit campaign</span>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)' }}><X size={18} /></button>
        </div>

        <div style={{ marginBottom: 14 }}>
          <div style={{ fontSize: 11.5, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 4 }}>Subject</div>
          <input value={subject} onChange={(e) => setSubject(e.target.value)} style={{ width: '100%', padding: '8px 10px', borderRadius: 8, border: '1px solid var(--border-card)', background: 'var(--bg-page)', color: 'var(--text-primary)', fontSize: 13.5 }} />
        </div>

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
          <div style={{ fontSize: 11.5, fontWeight: 600, color: 'var(--text-muted)' }}>Body</div>
          <div style={{ display: 'flex', gap: 6 }}>
            <ModeTab active={mode === 'visual'} onClick={() => setMode('visual')} icon={Eye} label="Visual" />
            <ModeTab active={mode === 'html'} onClick={() => setMode('html')} icon={Code} label="HTML" />
          </div>
        </div>

        {mode === 'visual' ? (
          <div
            ref={visualRef}
            contentEditable
            suppressContentEditableWarning
            onInput={(e) => setBody((e.currentTarget as HTMLDivElement).innerHTML)}
            style={{ minHeight: 320, maxHeight: 460, overflow: 'auto', border: '1px solid var(--border-card)', borderRadius: 8, padding: 14, background: '#fff', color: '#111', outline: 'none' }}
          />
        ) : (
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            spellCheck={false}
            wrap="off"
            style={{ width: '100%', minHeight: 320, maxHeight: 460, border: '1px solid var(--border-card)', borderRadius: 8, padding: 12, background: 'var(--bg-page)', color: 'var(--text-primary)', fontSize: 12.5, fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', lineHeight: 1.6, whiteSpace: 'pre', overflow: 'auto' }}
          />
        )}

        <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 6 }}>
          Tip: “Visual” edits text in place; switch to “HTML” to change images, links, or layout.
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 16 }}>
          <button onClick={onClose} style={{ padding: '8px 16px', borderRadius: 8, fontSize: 13, fontWeight: 600, border: '1px solid var(--border-card)', background: 'transparent', color: 'var(--text-primary)', cursor: 'pointer' }}>Cancel</button>
          <button
            onClick={() => onSave(campaign.id, { subject, body: minifyHtml(body) })}
            disabled={busy || !subject.trim()}
            style={{ padding: '8px 16px', borderRadius: 8, fontSize: 13, fontWeight: 700, border: 'none', background: '#22d3ee', color: '#04252b', cursor: busy || !subject.trim() ? 'not-allowed' : 'pointer', opacity: busy || !subject.trim() ? 0.5 : 1 }}
          >
            Save changes
          </button>
        </div>
      </div>
    </div>
  );
}

/**
 * Pretty-print minified HTML: put each tag on its own line and indent by nesting
 * depth. Whitespace between tags is cosmetic in HTML email, and we minify it back
 * on save, so this is purely for readable editing. Idempotent (re-formatting
 * already-formatted HTML yields the same result).
 */
function formatHtml(html: string): string {
  if (!html) return '';
  const withBreaks = html.replace(/>\s*</g, '>\n<');
  const voidTag = /^<(area|base|br|col|embed|hr|img|input|link|meta|param|source|track|wbr)[\s/>]/i;
  const tab = '  ';
  let indent = 0;
  const out: string[] = [];
  for (const raw of withBreaks.split('\n')) {
    const line = raw.trim();
    if (!line) continue;
    const isClosing = /^<\//.test(line);
    const isTagOpen = /^<[a-zA-Z]/.test(line);
    const opensAndCloses = isTagOpen && /<\/[a-zA-Z][^>]*>\s*$/.test(line); // <h1>text</h1>
    const isVoid = voidTag.test(line) || /\/>\s*$/.test(line);
    if (isClosing) indent = Math.max(0, indent - 1);
    out.push(tab.repeat(indent) + line);
    if (isTagOpen && !isClosing && !opensAndCloses && !isVoid) indent++;
  }
  return out.join('\n');
}

/** Collapse the cosmetic whitespace between tags so the stored/sent HTML stays compact. */
function minifyHtml(html: string): string {
  return html.replace(/>\s+</g, '><').trim();
}

function ModeTab({ active, onClick, icon: Icon, label }: { active: boolean; onClick: () => void; icon: any; label: string }) {
  return (
    <button onClick={onClick} style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '4px 10px', borderRadius: 6, fontSize: 12, fontWeight: 600, cursor: 'pointer', border: `1px solid ${active ? '#22d3ee' : 'var(--border-card)'}`, background: active ? '#22d3ee' : 'transparent', color: active ? '#04252b' : 'var(--text-muted)' }}>
      <Icon size={13} /> {label}
    </button>
  );
}
