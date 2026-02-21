---
name: ui-theming
description: UI design system and theme consistency for the Moon Lamp PWA. Use when adding new components, new UI sections, editing existing elements, or styling anything. Covers all CSS variables, dark/light theme tokens, typography rules, component patterns, and DO/DON'T guidelines.
---

# UI Theming & Design System

## When to Apply This Skill
- Adding any new HTML element, component, or section
- Styling buttons, cards, inputs, labels, status indicators
- Creating new tab content panels
- Writing or editing any CSS
- Reviewing existing UI for consistency issues

## Core Rule
**Never hardcode colors, backgrounds, or borders.** Always use the CSS custom properties defined in `css/base.css`. Both dark and light themes will break if you bypass the variable system.

---

## CSS Variables — Full Reference

### Dark Theme (default — `:root`)
```css
/* Text */
--text: #e8ecf4                /* Primary text */
--text-secondary: #6b7a99      /* Labels, captions, section headings */

/* Backgrounds */
--background: #0a0c14          /* Page background */
--background-gradient: linear-gradient(180deg, #0a0c14 0%, #0d1120 100%)
--card-bg: #111827             /* Card and panel backgrounds */
--surface: #161d2e             /* Subtle surface (toggles, inputs) */
--surface-raised: #1c2438      /* Elevated surface (hover states, modal icons) */

/* Interactive */
--primary: #c8cfe8             /* Buttons, borders, focus rings, checkboxes */
--primary-light: #e2e6f3       /* Hover state of primary */
--secondary: #8b95b8           /* Secondary interactive elements */

/* Semantic */
--accent: #e8b84b              /* Active tab, highlights, warnings */
--accent-bg: rgba(232,184,75,0.15)   /* Tinted accent background */
--accent-glow: rgba(232,184,75,0.25) /* Accent glow effects */
--success: #4ade80             /* Connected, positive states */
--success-glow: rgba(74,222,128,0.3)
--danger: #f87171              /* Disconnected, errors */
--danger-glow: rgba(248,113,113,0.3)

/* Borders & Glass */
--card-border: rgba(255,255,255,0.07)   /* Card borders */
--glass-bg: rgba(255,255,255,0.03)      /* Glass morphism fill */
--glass-border: rgba(255,255,255,0.07)  /* Glass morphism border */
--hover-border: rgba(255,255,255,0.15)  /* Border color on hover */

/* Specialised */
--dial-target: #22c55e         /* Motor dial target position */
--dial-current: #3b82f6        /* Motor dial current position */
--card-glow: transparent       /* Card glow (can be overridden per-component) */
```

### Light Theme (`[data-theme="light"]` on root element)
```css
/* Text */
--text: #1a2035
--text-secondary: #5a6580

/* Backgrounds */
--background: #f0f2f7
--background-gradient: linear-gradient(180deg, #f0f2f7 0%, #e8ebf4 100%)
--card-bg: #ffffff
--surface: #e8ebf4
--surface-raised: #dde1ee

/* Interactive */
--primary: #3d4f7c
--primary-light: #5a6fa0
--secondary: #6b7a99

/* Semantic */
--accent: #f59e0b
--accent-bg: rgba(245,158,11,0.15)
--accent-glow: rgba(245,158,11,0.2)
--success: #16a34a
--success-glow: rgba(22,163,74,0.2)
--danger: #dc2626
--danger-glow: rgba(220,38,38,0.2)

/* Borders & Glass */
--card-border: rgba(0,0,0,0.08)
--glass-bg: rgba(0,0,0,0.02)
--glass-border: rgba(0,0,0,0.08)
--hover-border: rgba(0,0,0,0.2)

/* Specialised */
--dial-target: #34d399
--dial-current: #2563eb
```

---

## Semantic Color Usage Guide

| Use case | Variable |
|----------|----------|
| All body text | `var(--text)` |
| Labels, captions, section headings | `var(--text-secondary)` |
| Card / panel background | `var(--card-bg)` |
| Page background | `var(--background)` |
| Toggle, input, subtle section bg | `var(--surface)` |
| Hover background on surface | `var(--surface-raised)` |
| Primary buttons, focus ring, active borders | `var(--primary)` |
| Primary button hover | `var(--primary-light)` |
| Active tab, highlighted value, warning | `var(--accent)` |
| Tinted accent bg (e.g. info banners) | `var(--accent-bg)` |
| Success / connected / positive | `var(--success)` |
| Error / disconnected / destructive | `var(--danger)` |
| Card border | `var(--card-border)` OR `var(--primary)` (cards use `--primary` border) |
| Glass morphism panel | `var(--glass-bg)` + `var(--glass-border)` |
| Hover border upgrade | `var(--hover-border)` |

---

## Typography

### Fonts loaded in `index.html`
- **Josefin Sans** — display font for H1 only
- **Inter** — all body text, labels, buttons

### Heading hierarchy
```css
h1 { font-family: 'Josefin Sans', 'Inter'; font-size: 1.4em; font-weight: 300;
     letter-spacing: 0.18em; text-transform: uppercase; color: var(--text); }

h2 { font-size: 1.05em; font-weight: 500; letter-spacing: 0.06em;
     text-transform: uppercase; color: var(--text-secondary); }

h3 { font-size: 1em; font-weight: 500; letter-spacing: 0.04em;
     text-transform: uppercase; color: var(--text-secondary); }

.info-text { font-size: 0.85em; color: var(--text-secondary); line-height: 1.5; }
```

### Rules
- `h2` and `h3` are always **uppercase** with letter-spacing — section labels, not prose headings
- Body text: no text-transform, normal letter-spacing
- Version/badge labels: 0.1em letter-spacing, uppercase, pill border `border-radius: 999px`
- Never use Arial, Roboto, or generic system fonts — Inter is already specified in the stack

---

## Component Patterns

### Card
```css
.card {
    background: var(--card-bg);
    border-radius: 12px;
    padding: 20px 22px;
    margin-bottom: 16px;
    border: 1px solid var(--primary);   /* Note: uses --primary, NOT --card-border */
}
```

### Buttons
```css
/* Full-width primary */
.btn.btn-primary { background: var(--primary); color: var(--background); }
.btn.btn-primary:hover { background: var(--primary-light); }
.btn.btn-primary:active { transform: scale(0.98); opacity: 0.9; }

/* Full-width secondary */
.btn.btn-secondary { background: var(--surface); color: var(--text);
                     border: 1px solid var(--glass-border); }
.btn.btn-secondary:hover { background: var(--surface-raised);
                            border-color: var(--hover-border); }

/* All .btn */
.btn { padding: 13px 24px; border-radius: 8px; font-size: 0.9em;
       font-weight: 600; letter-spacing: 0.03em; width: 100%; }
.btn:disabled { opacity: 0.35; cursor: not-allowed; }

/* Icon button */
.btn-icon { background: none; border: none; padding: 8px; border-radius: 8px; }
.btn-icon:hover { background: rgba(255,255,255,0.1); }
```

### Glass morphism panel (toggles, color picker, brightness slider)
```css
.my-panel {
    background: var(--glass-bg);
    border: 1px solid var(--glass-border);
    border-radius: 12px;
    padding: 12px 16px;
}
.my-panel:hover { border-color: var(--primary); }  /* optional upgrade */
```

### Form row
```css
.form-row { display: flex; align-items: center; gap: 12px; margin-bottom: 12px; }
.form-row label { min-width: 80px; color: var(--text-secondary); font-size: 0.9em; }
/* Inputs: background: var(--card-bg); border: 1px solid var(--glass-border);
   border-radius: 8px; color: var(--text); focus: border-color: var(--primary) */
```

### Status / badge pill
```css
.my-badge {
    padding: 2px 6px;
    border: 1px solid var(--glass-border);
    border-radius: 999px;        /* pill shape */
    background: var(--surface);
    color: var(--text-secondary);
    font-size: 0.62em;
    text-transform: uppercase;
    letter-spacing: 0.1em;
}
```

### Modal (use existing `.modal-overlay` + `.modal-container` via `js/modal.js`)
- Never create a custom full-screen overlay — use the modal system in `js/modal.js`
- Modal icon variants: `.modal-icon-info`, `.modal-icon-success`, `.modal-icon-warning`, `.modal-icon-error`, `.modal-icon-confirm`

---

## Theme Switching Mechanism
The theme is toggled by setting/removing `data-theme="light"` on the root HTML element:
```js
// Enable light theme
document.documentElement.setAttribute('data-theme', 'light');

// Reset to dark theme
document.documentElement.removeAttribute('data-theme');

// Read current theme
const isDark = !document.documentElement.hasAttribute('data-theme');
```
CSS variables in `[data-theme="light"]` automatically override the `:root` defaults.
**Never use `prefers-color-scheme` media query** — the app has a manual toggle only.

---

## Atmospheric Details (preserve, don't override)
- **Moon glow** — `body::before` pseudo-element: fixed, top-right, golden radial gradient `rgba(232,184,75,0.06)`. Don't add `overflow: hidden` to `body` — it would clip this.
- **Background gradient** — Always applied as `background-image: var(--background-gradient)` with `background-attachment: fixed` on `body`. Don't flatten to a solid color.
- **Backdrop blur** on modal overlay: `backdrop-filter: blur(5px)` — keep this for all overlay elements.

---

## Interaction Patterns
Every interactive element needs at minimum:
1. `:hover` — border or background lightening (use `var(--hover-border)` or `var(--surface-raised)`)
2. `:active` — `transform: scale(0.97)` or `scale(0.98)` for satisfying tap feedback
3. `:disabled` — `opacity: 0.35; cursor: not-allowed; transform: none !important`
4. Focus on inputs — `outline: none; border-color: var(--primary)`

---

## Responsive Breakpoints (`css/responsive.css`)
- **≤480px**: container padding 12px, cards 16px padding
- **≤360px**: container padding 8px, cards 12px 14px, minimum font sizes

Max content width: `600px` centered (`.container`). All new sections must stay inside this constraint.

---

## DO
- Use `var(--glass-bg)` + `var(--glass-border)` for subtle grouped panels
- Use `var(--surface)` / `var(--surface-raised)` for input backgrounds and hover states
- Use `border-radius: 12px` for cards, `8px` for buttons/inputs, `999px` for pills
- Match section heading style to existing `h2`: uppercase, `var(--text-secondary)`, letter-spacing
- Use `gap` for spacing between flex children instead of individual margins
- Add `transition: border-color 0.3s ease` on interactive borders

## DON'T
- ❌ Hardcode any hex color outside of `base.css` variables
- ❌ Use `color: white` or `color: black` anywhere
- ❌ Add new fonts — only Josefin Sans + Inter are loaded
- ❌ Use `border-radius > 12px` on cards (breaks visual language)
- ❌ Create new full-screen overlays — use the modal system
- ❌ Use `box-shadow` with dark opaque colors on dark theme (use glow vars instead)
- ❌ Use `prefers-color-scheme` — theme is manual only
- ❌ Add `overflow: hidden` to `body` (clips the moon glow)
