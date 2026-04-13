# Design System Specification: Digital Atelier & Governed OS

## 1. Overview & Creative North Star

The Creative North Star for this design system is **"The Governed Atelier."** It represents a high-end intersection between the precision of a high-performance operating system and the tactile, intentional craft of a boutique design studio.

We reject the "generic SaaS" aesthetic. Instead of rigid grids and heavy borders, we utilize **Intentional Asymmetry** and **Tonal Layering**. The interface should feel like a series of curated, semi-transparent sheets of fine vellum paper stacked on a solid stone surface. It is quiet, authoritative, and deeply functional.

---

## 2. Color & Surface Architecture

We move away from hex-based thinking toward **Perceptual Uniformity**. All colors are mapped via OKLCH to ensure consistent lightness and chroma across the interface. The system ships with two modes — Light and Dark — sharing the same semantic tokens.

### The "No-Line" Rule

**Explicit Mandate:** 1px solid borders are prohibited for sectioning.

Structure is defined through:

1. **Background Shifts:** Moving from `surface` to `surface-container-low`.
2. **Negative Space:** Using the Spacing Scale to create "islands" of content.
3. **Tonal Transitions:** Subtle value shifts that imply a boundary without drawing a line.

### CSS Token Mapping

Every color in the system is referenced by its semantic token. Implementations must use these tokens, never raw values.

#### Light Mode

| Semantic Token | UI Role | Value |
| :--- | :--- | :--- |
| `--color-canvas` | Base background | `oklch(98% 0.005 200)` |
| `--color-surface` | Default containers | `oklch(96% 0.01 200)` |
| `--color-surface-low` | Recessed sections / sidebars | `oklch(95.5% 0.008 200)` |
| `--color-surface-high` | Elevated cards | `oklch(100% 0 0)` |
| `--color-surface-glass` | Floating elements | `oklch(100% 0 0 / 70%)` + `backdrop-blur(12px)` |
| `--color-ink` | Primary text | `oklch(25% 0.01 200)` |
| `--color-ink-faint` | Secondary text / labels | `oklch(45% 0.01 200)` |
| `--color-ink-muted` | Timestamps / shortcuts | `oklch(55% 0.008 200)` |
| `--color-accent` | Key actions / links / focus | `oklch(62.5% 0.038 243)` |
| `--color-accent-faint` | Governed badges / accent bg | `oklch(62.5% 0.038 243 / 10%)` |
| `--color-line` | Ghost borders (accessibility) | `oklch(75% 0.008 200 / 15%)` |
| `--color-on-accent` | Text on accent backgrounds | `oklch(100% 0 0)` |

#### Dark Mode

| Semantic Token | UI Role | Value |
| :--- | :--- | :--- |
| `--color-canvas` | Base background | `oklch(13% 0.01 248)` |
| `--color-surface` | Default containers | `oklch(16% 0.012 248)` |
| `--color-surface-low` | Recessed sections / sidebars | `oklch(14.5% 0.011 248)` |
| `--color-surface-high` | Elevated cards | `oklch(20% 0.015 248)` |
| `--color-surface-glass` | Floating elements | `oklch(18% 0.012 248 / 60%)` + `backdrop-blur(12px)` |
| `--color-ink` | Primary text | `oklch(90% 0.01 220)` |
| `--color-ink-faint` | Secondary text / labels | `oklch(70% 0.012 220)` |
| `--color-ink-muted` | Timestamps / shortcuts | `oklch(55% 0.008 220)` |
| `--color-accent` | Key actions / links / focus | `oklch(72% 0.04 220)` |
| `--color-accent-faint` | Governed badges / accent bg | `oklch(72% 0.04 220 / 10%)` |
| `--color-line` | Ghost borders (accessibility) | `oklch(40% 0.01 248 / 15%)` |
| `--color-on-accent` | Text on accent backgrounds | `oklch(15% 0.01 248)` |

### Surface Hierarchy & Nesting

Depth is achieved by "stacking" surface tiers. The same logic applies in both modes — only the luminance direction changes.

**Light mode (high luminance = close):**

| Level | Token | Role |
| :--- | :--- | :--- |
| 0 | `canvas` | The desk |
| 1 | `surface-low` | Sidebars, recessed sections |
| 2 | `surface` | Main workspace |
| 3 | `surface-high` | Active cards, popovers |
| 4 | `surface-glass` | Floating tooltips, sticky headers |

**Dark mode (lower luminance = deeper):**

| Level | Token | Role |
| :--- | :--- | :--- |
| 0 | `canvas` | The void |
| 1 | `surface-low` | Sidebars, recessed sections |
| 2 | `surface` | Main workspace |
| 3 | `surface-high` | Active cards, popovers |
| 4 | `surface-glass` | Floating tooltips, sticky headers |

### The Glass & Gradient Rule

To prevent the UI from feeling flat, use **Glassmorphism** for floating elements (tooltips, dropdown menus, command palette).

- **Recipe:** `surface-glass` at token opacity with `backdrop-blur(12px)`.
- **Signature Gradient (CTAs):** Linear gradient from `accent` to `accent` at 60% lightness, 135-degree angle. Adds "soul" to the action without breaking the calm aesthetic.
- **Ambient Shadow (floating):** `0 20px 40px -10px oklch(from var(--color-ink) l c h / 0.06)` in light mode, `rgba(0, 0, 0, 0.4)` in dark mode.

---

## 3. Typography: Editorial Authority

We pair **Manrope** (Display / Headlines) for structural authority with **Inter** (Body / Labels) for neutral utility.

| Role | Family | Weight | Size | Tracking | Line-height |
| :--- | :--- | :--- | :--- | :--- | :--- |
| Display LG | Manrope | 700 | 3.5rem | -0.02em | 1.1 |
| Display MD | Manrope | 700 | 2.5rem | -0.02em | 1.15 |
| Display SM | Manrope | 700 | 2rem | -0.02em | 1.2 |
| Headline LG | Manrope | 600 | 1.5rem | -0.015em | 1.3 |
| Headline MD | Manrope | 600 | 1.25rem | -0.015em | 1.35 |
| Headline SM | Manrope | 600 | 1.1rem | -0.01em | 1.4 |
| Title LG | Inter | 500 | 1rem | 0 | 1.45 |
| Title MD | Inter | 500 | 0.9375rem | 0 | 1.45 |
| Body LG | Inter | 400 | 1rem | 0 | 1.6 |
| Body MD | Inter | 400 | 0.875rem | 0 | 1.6 |
| Body SM | Inter | 400 | 0.8125rem | 0 | 1.52 |
| Label MD | Inter | 500 | 0.75rem | 0.05em | 1.2 |
| Label SM | Inter | 500 | 0.6875rem | 0.05em | 1.2 |
| Mono MD | Mono stack | 400 | 0.8125rem | 0 | 1.5 |

### Rules

- **Hierarchy as brand:** Use Display or Headline paired with Body MD in close proximity to create high-contrast, "boutique" layouts. Avoid mid-sized type in hero areas.
- **Labels are uppercase** with wide tracking (`0.05em`). This mimics high-end editorial mastheads and adds sophistication to metadata.
- **Never use 100% black or 100% white for text.** Use `--color-ink` and `--color-on-accent` respectively.
- **Transcript body** uses Body LG (1rem, 1.6 line-height) for AI responses.

---

## 4. Spacing & Density Constants

Spacing follows a geometric progression to maintain the "Governed" feel.

### Full Spacing Scale

| Token | Value | Usage |
| :--- | :--- | :--- |
| `spacing-0.5` | 0.1rem (1.6px) | Micro-adjustments |
| `spacing-1` | 0.2rem (3.2px) | Tight groupings |
| `spacing-2` | 0.4rem (6.4px) | Element internals |
| `spacing-3` | 0.65rem (10.4px) | Compact component padding |
| `spacing-4` | 0.9rem (14.4px) | Standard component padding |
| `spacing-6` | 1.25rem (20px) | Content block gaps |
| `spacing-8` | 1.75rem (28px) | Section gutters |
| `spacing-10` | 2.25rem (36px) | Major vertical rhythm |
| `spacing-12` | 2.75rem (44px) | Major layout gaps |
| `spacing-16` | 3.5rem (56px) | Page margins |
| `spacing-20` | 4.5rem (72px) | Hero margins |

### Layout Constants

| Element | Value | Notes |
| :--- | :--- | :--- |
| Sidebar width (expanded) | `260px` | Fixed |
| Sidebar width (collapsed) | `64px` | Icon-only rail |
| Context panel width | `280px` | Right sidebar for metadata |
| Transcript max-width | `840px` | Centered, asymmetric padding (more left to let reasoning bleed out) |
| Composer min-height | `56px` | Single-line state |
| Composer max-height | `320px` | Auto-expanding with content |
| Hit target minimum | `44px x 44px` | All interactive icons and buttons (Apple HIG) |
| Scroll-fade height | `32px` | Gradient overlay at scroll edges |

---

## 5. Motion Specification

Motion is not decoration — it is a state transition.

| Pattern | Duration | Easing | Notes |
| :--- | :--- | :--- | :--- |
| Streaming content in | `150ms` | `ease-out` | Opacity 0 → 1, translate-y 4px → 0 |
| Collapsing/expanding details | `300ms` | `cubic-bezier(0.22, 1, 0.36, 1)` | Content fades while container resizes |
| Surface hover | `150ms` | `linear` | Subtle background color shift |
| Sidebar collapse/expand | `250ms` | `cubic-bezier(0.22, 1, 0.36, 1)` | Width transition, icons remain stable |
| Modal/popover enter | `200ms` | `cubic-bezier(0.22, 1, 0.36, 1)` | Scale 0.97 → 1, opacity 0 → 1 |
| Modal/popover exit | `150ms` | `ease-in` | Opacity 1 → 0, no scale |
| Approval card pulse | `2000ms` | `ease-in-out` | Gentle accent-faint glow, infinite |
| Stop button enter | `100ms` | `ease-out` | Replaces send button position, crossfade |

### The Signature Curve

`cubic-bezier(0.22, 1, 0.36, 1)` — "Quint Out". Fast entry, graceful deceleration. Use for all layout and container transitions.

---

## 6. Component Language & Shadcn Strategy

We use **shadcn/ui** as our primitive foundation. Every component is wrapped in a custom Tailwind layer to strip "standard" looks and enforce the design system.

### Shadcn Integration Rule

- Do not use `border` utility classes for section separation. Use `bg-surface-low` instead.
- Replace standard shadows with `shadow-ambient` (low-opacity, high-blur).
- All radii use the system scale: `rounded-sm` (0.25rem), `rounded-md` (0.375rem), `rounded-lg` (0.75rem).

### Buttons

| Variant | Background | Text | Border | Radius |
| :--- | :--- | :--- | :--- | :--- |
| Primary | `accent` | `on-accent` | None | `rounded-md` |
| Secondary | `surface-high` | `ink` | None | `rounded-md` |
| Ghost | Transparent | `accent` | None | `rounded-md` |
| Ghost (hover) | `surface-low` | `accent` | None | `rounded-md` |

### Input Fields

- **Base:** Background `surface-high`. No border.
- **Focus:** 1px `line` border transitions in. Background shifts to `surface-high` if not already there.
- **Helper text:** `ink-muted` at Label SM sizing.
- **Search (primary):** Large, `surface` background, `rounded-lg`, with a faint accent glow on focus (`accent-faint` box-shadow).

### Cards & Lists

- **No Dividers:** Prohibit `<hr>` or `border-b` between list items.
- **Technique:** Use `spacing-3` as vertical gutter. Hover state shifts to `surface-high`.
- **Nesting:** Cards use `surface-high` on a `surface` background. Internal elements (chips, tags) use `rounded-sm`.

---

## 7. Transcript & Structured Content

The transcript is the primary work surface. It renders knowledge-work output, not chat messages.

### Markdown Rendering

- **Prose:** Body LG (1rem, 1.6 line-height). Links use `accent` with 1px underline-offset.
- **Headings:** Map to Headline scale. H1 → Headline LG, H2 → Headline MD, H3 → Headline SM.
- **Lists:** Ordered and unordered, with `spacing-2` between items. Nested lists indent by `spacing-4`.
- **Blockquotes:** Left border 2px `accent-faint`, `surface-low` background, `spacing-4` padding.
- **Tables:** `surface-low` header row, no cell borders, `spacing-2` cell padding, `ink-faint` for header text.
- **Horizontal rules:** 1px `line` (the only permitted decorative line in the system).

### Code Blocks

- **Background:** `canvas` in light mode, `surface-low` in dark mode.
- **Corners:** `rounded-none` — intentional. Code is raw material, not a card.
- **Syntax theme:** Monochromatic, varying opacity levels of `ink` and `accent`. No rainbow highlighting.
- **Copy button:** Ghost button, top-right, appears on hover.
- **Font:** Mono stack at Mono MD sizing.

### Reasoning / Thinking Entries

- **Container:** `surface-low` background, left border 2px `line`.
- **Text:** Body SM, `ink-faint`.
- **Behavior:** Collapsed by default via `<details>`. Summary line shows "Reasoning" label at Label SM.
- **Expand transition:** 300ms signature curve.

### Approval Cards

- **Placement:** Inline in transcript flow.
- **Container:** `surface-high` with Ghost Border (`line` at 15% opacity).
- **Pending state:** Gentle `accent-faint` pulse animation (2s, infinite).
- **Resolved state:** Pulse stops. Status badge shows "Approved" or "Declined" at Label SM.

### Streaming Indicator

- **Active generation:** Three-dot pulse in `accent-faint`, placed at the end of the last assistant entry.
- **Partial content:** Renders immediately as deltas arrive. No "waiting for full response" state.

---

## 8. Elevation & Depth: The Layering Principle

Depth is achieved via **Tonal Layering**, not drop shadows.

| Level | Token | Role | Example |
| :--- | :--- | :--- | :--- |
| 0 | `canvas` | The desk / void | Page background |
| 1 | `surface-low` | Folders on the desk | Sidebars, recessed sections |
| 2 | `surface` | The workspace | Main content area |
| 3 | `surface-high` | The paper you write on | Cards, active popovers, inputs |
| 4 | `surface-glass` | The lens held above | Tooltips, command palette, floating menus |

This system ensures that even without a single border, the user instinctively understands the hierarchy of information.

### When Shadows Are Permitted

Shadows are only used at Level 4 (floating glass elements):

- `0 20px 40px -10px oklch(from var(--color-ink) l c h / 0.06)` (light)
- `0 20px 40px -10px rgba(0, 0, 0, 0.4)` (dark)

All other depth is communicated through surface token shifts alone.

---

## 9. Do's and Don'ts

### Do

- **Stack surfaces** to create hierarchy. Sidebars use `surface-low`, main stage uses `surface`, active elements use `surface-high`.
- **Use glassmorphism** for floating tooltips and sticky headers (`backdrop-blur` + `surface-glass`).
- **Embrace negative space.** If a screen feels cluttered, increase spacing rather than adding lines.
- **Use `surface-high`** for hover states to create a "glow" effect rather than a "darken" effect.
- **Use asymmetrical layouts** (wide content column + narrow metadata rail).

### Don't

- **Don't use 100% black or 100% white for text.** Use `ink` and `on-accent` tokens.
- **Don't use standard shadows.** No `shadow-md` or `shadow-lg`. Only the ambient shadow at Level 4.
- **Don't use dividers.** No `<hr>` or `border-b` between list items. Use vertical spacing.
- **Don't use borders for sections.** Background shifts only.
- **Don't use icons as decoration.** Every icon must represent a direct action or critical status.
- **Don't use "standard blue" for links.** Use the `accent` token to maintain the custom color story.

---

## 10. TBD / Deferred

- **Accessibility contrast audit:** Verify all token pairs meet WCAG 2.1 AA (4.5:1 for body text, 3:1 for large text and UI components). The `ink-faint` on `surface` pairing in both modes needs verification.
- **High-contrast mode:** Override tokens for users who need stronger boundaries.
- **Print stylesheet:** Token overrides for print media.
- **Iconography guidelines:** Lucide icon set rules — stroke width, optical sizing, when to use filled vs outline variants.
- **Data visualization palette:** Chart colors derived from the OKLCH accent range.
