# Design System Master File

> **LOGIC:** When building a specific page, first check `design-system/pichat/pages/[page-name].md`.
> If that file exists, its rules **override** this Master file.
> If not, strictly follow the rules below.

---

**Project:** PiChat
**Category:** Enterprise knowledge agent / chat workspace
**Design Dials:** Variance 3/10 (Centered / Minimal) | Motion 3/10 (Subtle) | Density 6/10 (Standard)

**Verified decisions**

- Style: Minimalism & Swiss Style, adapted from a marketing landing pattern to a chat workspace.
- Theme: light-first, with a full dark variant driven by semantic CSS variables.
- Accent: neutral slate surfaces + link blue `#2563EB` reserved for primary actions, links and selection.
- Typography: system UI stack with CJK fallbacks. No external webfont (blocked network + CLS risk).
- No UI framework dependency. SVG icons are inlined; no emoji as structural icons.

---

## Global Rules

### Color Palette

| Role | Light | Dark | Token |
|------|-------|------|-------|
| Background | `#F6F8FB` | `#0B1120` | `--bg` |
| Surface | `#FFFFFF` | `#0F172A` | `--surface` |
| Surface muted | `#F1F5F9` | `#162033` | `--surface-2` |
| Foreground | `#0F172A` | `#E8EDF5` | `--fg` |
| Muted foreground | `#475569` | `#A3B0C2` | `--fg-muted` |
| Subtle foreground | `#64748B` | `#8B99AD` | `--fg-subtle` |
| Border | `#E2E8F0` | `#1E293B` | `--border` |
| Border strong | `#CBD5E1` | `#334155` | `--border-strong` |
| Accent / CTA | `#2563EB` | `#2563EB` | `--accent` |
| Accent text | `#1D4ED8` | `#93C5FD` | `--accent-text` |
| Accent soft | `#EFF6FF` | `#172554` | `--accent-soft` |
| On accent | `#FFFFFF` | `#FFFFFF` | `--accent-fg` |
| Danger | `#DC2626` | `#F87171` | `--danger` |
| Success | `#15803D` | `#4ADE80` | `--success` |
| Warning | `#B45309` | `#FBBF24` | `--warning` |
| Focus ring | `#2563EB` | `#60A5FA` | `--ring` |

All text pairs must be measured against the surface they sit on. Muted text is never lighter than
`--fg-subtle`; 4.5:1 minimum for normal text, 3:1 for large text and UI boundaries.

### Typography

- **Family:** `system-ui, -apple-system, "Segoe UI", "PingFang SC", "Hiragino Sans GB",
  "Microsoft YaHei", "Noto Sans SC", sans-serif`
- **Code / tool names:** `ui-monospace, "SFMono-Regular", Menlo, Consolas, monospace`
- **Scale:** 11 / 12 / 13 / 14 / 15 / 16 / 18 / 20 / 24 / 30
- **Body:** 15px, line-height 1.7 in the chat thread; 14px, line-height 1.5 in chrome.
- **Headings:** 600–650 weight, `text-wrap: balance` on short headings.
- **Measure:** chat column max-width 48rem (~65–75 Latin chars, ~38 CJK chars).

### Spacing

Density 6/10. Use a 4/8px rhythm: 4, 8, 12, 16, 24, 32, 48, 64.
Chat thread padding 16px mobile / 24–32px desktop. Composer is never tighter than 12px.

### Elevation

| Token | Value | Usage |
|-------|-------|-------|
| `--elev-card` | `0 1px 2px rgba(15,23,42,.04)` | Composer, message cards |
| `--elev-pop` | `0 12px 32px -12px rgba(15,23,42,.18)` | Drawers, popovers |

One shadow level per layer. No hover lift that shifts surrounding layout.

### Motion

- Micro feedback: 150–200ms, `cubic-bezier(0.22, 1, 0.36, 1)`.
- Message entrance: 240ms fade + 6px rise.
- Exit is always shorter than enter.
- No scroll-reveal choreography in the workspace; motion only for state changes.
- Respect `prefers-reduced-motion`: disable animation and smooth scrolling entirely.

---

## Page Pattern

**Chat workspace (primary product surface)**

1. **Left rail** — new conversation, searchable session list, authorized knowledge bases, user
   identity. 280px, collapsible into a mobile drawer with a scrim.
2. **Center** — session header (model + thinking level), scrollable thread, fixed composer.
3. **Right rail** — citations and evidence, 336px, hidden below 1280px and opened as a drawer.
4. **Thread states** — empty/onboarding, thinking, tool running, streaming text, stopped, error,
   empty citations.

Rules:

- The composer is the only sticky element in the center column; the thread owns its own scroll.
- Every assistant answer exposes its evidence: inline citation markers + a citation list.
- Streaming uses token-by-token text, never a full-screen spinner. Tool execution is a compact
  status row, not a modal.
- Permission scope is stated in the workspace, not buried in settings.
- Actions on a message (copy/retry/feedback) stay visible at low emphasis; never hover-only.

---

## Component Specs

### Buttons

- Height 36px (desktop) / 44px (touch). Radius 8–10px.
- Primary: `--accent` background, white text, 600 weight; one primary action per region.
- Secondary: transparent surface, 1px `--border`, `--fg-muted` text.
- Icon-only: 36×36px minimum, 44×44px on touch; `<svg aria-hidden>` + accessible name.
- Disabled: opacity 0.45 + `disabled` attribute + `cursor-not-allowed`.
- Focus: 2px ring, 2px offset, `--ring`. Never remove.

### Composer

- 44px minimum input height; 16px font on mobile to prevent iOS zoom.
- Auto-grow to 200px, then internal scroll.
- Enter sends, Shift+Enter newline; never intercept IME composition.
- Streaming state swaps Send for Stop; both have text or accessible names.
- Model and thinking-level selectors live in the composer toolbar at the bottom, never in the page
  header. Pair them with the knowledge-scope chip and keep the Send/Stop action on the right.

### Citation card

- Index badge, document title (truncate with full title available), knowledge base, chunk id,
  snippet clamped to 4 lines, "查看原文" affordance.
- Selected state uses `--accent-soft` + `--accent` border, not color alone (index badge fills).

### Tool call row

- Monospace tool name, one-line description, status icon + duration.
- Running uses a spinner plus the word "运行中"; done uses a check plus milliseconds.

### Empty state

- One headline, one sentence of scope, 3–4 suggestion cards, and the current knowledge scope.
- Suggestion cards are real buttons with descriptive accessible names.

---

## Anti-Patterns (Do NOT Use)

- ❌ Emojis as icons — inline SVG only.
- ❌ Spinner-only waits for streamed answers; stream the text.
- ❌ Hover-only actions or hover-only affordances.
- ❌ Icon-only controls without an accessible name.
- ❌ Low-contrast gray-on-gray body text.
- ❌ External webfonts for CJK text or Google Fonts imports.
- ❌ Full-page scroll with a fixed composer; use `h-dvh` + an independently scrolling thread.
- ❌ Nested modals or modals for primary navigation.
- ❌ Animating width/height/top/left; animate transform and opacity only.

---

## Pre-Delivery Checklist

- [ ] Keyboard: tab order matches visual order, skip link, Escape closes drawers.
- [ ] Focus visible on every interactive element; drawer moves focus on open.
- [ ] Streaming announced via a status live region; thread has `aria-busy`.
- [ ] 44px touch targets on mobile, 8px spacing between adjacent targets.
- [ ] Contrast verified in both themes, including muted text and borders.
- [ ] Responsive at 375 / 768 / 1024 / 1280 / 1440; no horizontal scroll.
- [ ] Safe-area aware composer (`pb-[env(safe-area-inset-bottom)]`).
- [ ] Reduced motion respected; no layout shift from messages or fonts.
- [ ] No emoji icons, no external fonts, no horizontal overflow.
