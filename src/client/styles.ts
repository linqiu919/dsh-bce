import { NAMESPACE } from './constants.ts'

const CSS = `
.dshbce-wrap {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  height: 26px;
  max-width: 280px;
}
.dshbce-control {
  position: relative;
  width: 26px;
  height: 26px;
  flex: none;
}
.dshbce-btn {
  position: relative;
  z-index: 1;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex: none;
  width: 26px;
  height: 26px;
  padding: 0;
  border: none;
  border-radius: 50%;
  background: var(--dsw-alias-fill-secondary, var(--dsw-alias-bg-tertiary, rgba(15, 23, 42, 0.05)));
  color: var(--dsw-alias-label-secondary);
  cursor: pointer;
  transition: background-color 0.12s cubic-bezier(0.16, 1, 0.3, 1), color 0.12s cubic-bezier(0.16, 1, 0.3, 1);
}
.dshbce-btn:hover {
  background: var(--dsw-alias-interactive-bg-hover, rgba(15, 23, 42, 0.08));
  color: var(--dsw-alias-label-primary);
}
.dshbce-btn:hover:active {
  transform: scale(0.96);
}
.dshbce-btn:disabled:not([data-busy='true']) {
  opacity: 0.45;
  cursor: not-allowed;
  color: var(--dsw-alias-label-tertiary, var(--dsw-alias-label-secondary));
}
.dshbce-btn:disabled:not([data-busy='true']):hover {
  background: var(--dsw-alias-fill-secondary, var(--dsw-alias-bg-tertiary, rgba(15, 23, 42, 0.05)));
}
.dshbce-icon {
  width: 13px;
  height: 13px;
  display: block;
}
.dshbce-ring {
  position: absolute;
  inset: 0;
  border-radius: 50%;
  pointer-events: none;
  opacity: 0;
}
.dshbce-wrap[data-busy='true'] .dshbce-control {
  pointer-events: none;
}
.dshbce-wrap[data-busy='true'] .dshbce-ring {
  opacity: 0.72;
  animation: dshbce-from 1.6s linear infinite;
  background: conic-gradient(
    from var(--dshbce-from, 0deg) at 50% 50%,
    transparent 0deg,
    rgba(56, 189, 248, 0) 210deg,
    rgba(56, 189, 248, 0.35) 255deg,
    rgba(99, 102, 241, 0.55) 300deg,
    rgba(168, 85, 247, 0.4) 335deg,
    transparent 360deg
  );
  -webkit-mask: radial-gradient(farthest-side, transparent calc(100% - 1.5px), #000 calc(100% - 1px));
          mask: radial-gradient(farthest-side, transparent calc(100% - 1.5px), #000 calc(100% - 1px));
}
.dshbce-btn[data-busy='true'] {
  opacity: 1;
  cursor: progress;
  pointer-events: none;
  color: #4f46e5;
  background: var(--dsw-alias-fill-secondary, var(--dsw-alias-bg-tertiary, rgba(15, 23, 42, 0.05)));
}
.dshbce-btn[data-busy='true']:hover {
  color: #4f46e5;
  background: var(--dsw-alias-fill-secondary, var(--dsw-alias-bg-tertiary, rgba(15, 23, 42, 0.05)));
}
@property --dshbce-from {
  syntax: '<angle>';
  inherits: false;
  initial-value: 0deg;
}
@keyframes dshbce-from {
  to { --dshbce-from: 360deg; }
}
.dshbce-status {
  min-width: 0;
  max-width: 148px;
  font-size: 11px;
  line-height: 1.2;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  color: var(--dsw-alias-label-tertiary, #8b8b8b);
  pointer-events: none;
}
.dshbce-status[data-level='busy'] {
  color: #6366f1;
}
.dshbce-status[data-level='error'] {
  color: var(--dsw-alias-state-error-primary, #e5484d);
}
.dshbce-status[data-level='ok'] {
  color: var(--dsw-alias-state-success-primary, #30a46c);
}
@media (prefers-reduced-motion: reduce) {
  .dshbce-wrap[data-busy='true'] .dshbce-ring {
    animation: none;
    opacity: 0.45;
  }
  .dshbce-btn,
  .dshbce-restore {
    transition: none;
    animation: none;
  }
}
.dshbce-restore {
  height: 26px;
  padding: 0 8px;
  border: none;
  border-radius: 8px;
  background: transparent;
  color: var(--dsw-alias-label-secondary);
  font-size: 11px;
  line-height: 26px;
  cursor: pointer;
}
.dshbce-restore:hover {
  background: var(--dsw-alias-interactive-bg-hover, rgba(15, 23, 42, 0.08));
  color: var(--dsw-alias-label-primary);
}
.dshbce-live {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border: 0;
}
`

export function injectStyles(): () => void {
  const tag = document.createElement('style')
  tag.dataset.plugin = NAMESPACE
  tag.textContent = CSS
  document.head.appendChild(tag)
  return () => { tag.remove() }
}
