# Skyra LogHub — UI/UX Design System & Token Specification

**Document Version:** 1.0.0  
**Status:** Approved Architecture Specification  
**Task ID:** `LOGHUB-CONSOLE-001`  
**Phase:** Phase 4 — Web Console, Administration & Observability Experience  
**Date:** 2026-10-27  

---

## 1. Visual Design Philosophy & Brand Identity

The Skyra LogHub Web Console visual identity is engineered as an **authoritative, high-density observability workstation**. It embodies modern enterprise SaaS design excellence:

- **Purposeful Palette:** Distinct contrast between background surfaces, interactive controls, and severity indicators.
- **Data Density Without Noise:** Tight, well-spaced typography that allows engineers to scan 50+ log records per viewport without cognitive fatigue.
- **Accessibility by Invariant:** Every text-to-background pairing strictly satisfies **WCAG 2.2 AA contrast ratios** ($\ge 4.5:1$ for normal text, $\ge 3.0:1$ for large text and UI components).
- **Dual First-Class Themes:** Seamless support for Light Mode and Dark Mode using tokenized CSS custom properties.

---

## 2. Design Tokens: Color System

### 2.1 Surface & Neutral Scale

| Token Name | Light Theme Value | Dark Theme Value | Usage Description |
| :--- | :--- | :--- | :--- |
| `--color-bg-base` | `#F8FAFC` (Slate 50) | `#0B0F17` (Deep Void) | Canvas background behind cards |
| `--color-bg-subtle` | `#F1F5F9` (Slate 100) | `#111827` (Gray 900) | Sidebar and global top bar background |
| `--color-surface-default` | `#FFFFFF` (White) | `#182234` (Surface Navy) | Data tables, cards, and modal bodies |
| `--color-surface-raised` | `#FFFFFF` (White) | `#1E293B` (Slate 800) | Tooltips, dropdown menus, and popovers |
| `--color-surface-overlay` | `#0F172A80` (50% alpha) | `#030712B3` (70% alpha) | Modal drawer backdrop |
| `--color-text-primary` | `#0F172A` (Slate 900) | `#F8FAFC` (Slate 50) | Headings, primary table cells |
| `--color-text-secondary` | `#475569` (Slate 600) | `#94A3B8` (Slate 400) | Field labels, timestamps, metadata |
| `--color-text-muted` | `#94A3B8` (Slate 400) | `#64748B` (Slate 500) | Placeholders, disabled actions |
| `--color-text-inverse` | `#FFFFFF` | `#0F172A` | Text on solid brand buttons |
| `--color-border-subtle` | `#E2E8F0` (Slate 200) | `#1E293B` (Slate 800) | Subtle table row dividers |
| `--color-border-default` | `#CBD5E1` (Slate 300) | `#334155` (Slate 700) | Input borders, card borders |
| `--color-border-strong` | `#94A3B8` (Slate 400) | `#475569` (Slate 600) | Active focus rings, selected tabs |

### 2.2 Brand & Interactive Accent Scale

| Token Name | Light Theme Value | Dark Theme Value | Usage Description |
| :--- | :--- | :--- | :--- |
| `--color-brand-primary` | `#2563EB` (Blue 600) | `#3B82F6` (Blue 500) | Primary CTA buttons, active route link |
| `--color-brand-hover` | `#1D4ED8` (Blue 700) | `#60A5FA` (Blue 400) | Hover state on primary interactive elements |
| `--color-brand-subtle` | `#EFF6FF` (Blue 50) | `#1E3A8A4D` (Blue 900 30%) | Selected table row background |
| `--color-accent-cyan` | `#0891B2` (Cyan 600) | `#06B6D4` (Cyan 500) | Trace correlation, histogram accents |
| `--color-accent-purple` | `#7C3AED` (Purple 600) | `#A855F7` (Purple 500) | Service name tags, query token highlights |

### 2.3 Semantic Severity Scale (ECS-Aligned)

Severity indicators use a compound combination of **background tint**, **strong text**, and **iconography** to guarantee accessibility for users with color-vision deficiencies:

| ECS Log Level | Background Token | Text Token | Border Token | Hex Value (Light / Dark) |
| :--- | :--- | :--- | :--- | :--- |
| **FATAL / EMERG** | `--color-sev-fatal-bg` | `--color-sev-fatal-text` | `--color-sev-fatal-border` | Light: `#FEF2F2` / `#991B1B` • Dark: `#450A0A` / `#FCA5A5` |
| **ERROR** | `--color-sev-error-bg` | `--color-sev-error-text` | `--color-sev-error-border` | Light: `#FFF1F2` / `#BE123C` • Dark: `#4C0519` / `#FDA4AF` |
| **WARN** | `--color-sev-warn-bg` | `--color-sev-warn-text` | `--color-sev-warn-border` | Light: `#FFFBEB` / `#B45309` • Dark: `#451A03` / `#FCD34D` |
| **INFO** | `--color-sev-info-bg` | `--color-sev-info-text` | `--color-sev-info-border` | Light: `#EFF6FF` / `#1D4ED8` • Dark: `#172554` / `#93C5FD` |
| **DEBUG / TRACE**| `--color-sev-debug-bg` | `--color-sev-debug-text` | `--color-sev-debug-border` | Light: `#F1F5F9` / `#475569` • Dark: `#1E293B` / `#94A3B8` |

---

## 3. Typography Scale & Hierarchy

- **Primary Font Family:** `Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif`
- **Monospace Font Family:** `ui-monospace, "JetBrains Mono", "SF Mono", Consolas, monospace` (mandatory for timestamps, JSON payloads, query expressions, and UUIDs).

| Style Name | Size | Line Height | Weight | Letter Spacing | Font Family |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `display-1` | 28px (`1.75rem`) | 36px | 700 (Bold) | `-0.02em` | Primary |
| `heading-1` | 22px (`1.375rem`)| 28px | 600 (Semibold) | `-0.01em` | Primary |
| `heading-2` | 18px (`1.125rem`)| 24px | 600 (Semibold) | `-0.01em` | Primary |
| `heading-3` | 15px (`0.9375rem`)| 20px | 600 (Semibold) | `0` | Primary |
| `body-base` | 13px (`0.8125rem`)| 18px | 400 (Regular) | `0` | Primary |
| `body-medium` | 13px (`0.8125rem`)| 18px | 500 (Medium) | `0` | Primary |
| `caption` | 11px (`0.6875rem`)| 14px | 400 (Regular) | `+0.01em` | Primary |
| `code-base` | 12px (`0.75rem`) | 16px | 400 (Regular) | `0` | Monospace |
| `code-dense`| 11px (`0.6875rem`)| 15px | 400 (Regular) | `0` | Monospace |

---

## 4. Spacing, Elevation & Radius Tokens

### 4.1 Spacing Scale (4px Base Grid)
- `--space-1`: `4px` (`0.25rem`)
- `--space-2`: `8px` (`0.5rem`)
- `--space-3`: `12px` (`0.75rem`)
- `--space-4`: `16px` (`1.0rem`)
- `--space-6`: `24px` (`1.5rem`)
- `--space-8`: `32px` (`2.0rem`)
- `--space-12`: `48px` (`3.0rem`)

### 4.2 Border Radius Scale
- `--radius-xs`: `2px` (micro badges, tags)
- `--radius-sm`: `4px` (buttons, input fields)
- `--radius-md`: `6px` (cards, modal containers)
- `--radius-lg`: `8px` (event drawer panel)
- `--radius-full`: `9999px` (severity pill badges)

### 4.3 Elevation & Shadows
- `--shadow-sm`: `0 1px 2px 0 rgba(0, 0, 0, 0.05)`
- `--shadow-md`: `0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -2px rgba(0, 0, 0, 0.1)`
- `--shadow-lg`: `0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -4px rgba(0, 0, 0, 0.1)`
- `--shadow-drawer`: `-4px 0 24px rgba(0, 0, 0, 0.25)`

---

## 5. High-Density Log Table Specification

```text
┌────────────────────────────────────────────────────────────────────────────────────────┐
│ [Time (UTC)]            [Sev]   [Service]        [Message]                             │
├────────────────────────────────────────────────────────────────────────────────────────┤
│ 2026-10-27 15:42:01.234 [ERROR]  auth-service     Token signature verification failed... │
│ 2026-10-27 15:42:01.210 [WARN]   gateway-ingress  Rate limit threshold reached for IP...│
│ 2026-10-27 15:42:00.985 [INFO]   billing-api      Invoice #8942 dispatched successfully │
└────────────────────────────────────────────────────────────────────────────────────────┘
```
- **Table Density:** Row height is **32px** in compact mode and **40px** in comfortable mode.
- **Timestamp Display:** Rendered in monospace font (`code-base`) with exact millisecond precision. Hovering reveals localized machine time.
- **Severity Badge:** Compact pill (`18px` height, uppercase font, bold status dot).
- **Message Truncation:** Single-line ellipsis overflow with tooltip preview on hover; clicking row slides open the Event Detail Drawer.

---

## 6. Event Detail Drawer Specification

- **Position & Dimensions:** Slides out from the right canvas edge, occupying **50% of the viewport width** (minimum 580px, maximum 960px).
- **Navigation Tabs:**
  1. **Formatted Fields:** Categorized table displaying ECS standard fields (`@timestamp`, `event.id`, `log.level`, `service.name`, `error.type`, `http.response.status_code`).
  2. **Raw JSON:** Formatted, syntax-highlighted JSON viewer with expandable/collapsible nodes and search filtering.
  3. **Correlation Context:** Displays `trace.id`, `span.id`, and links to search related events matching the same trace.
- **Top Actions:**
  - `[Copy Event ID]`
  - `[Copy Raw JSON]`
  - `[Filter By This Service]`
  - `[Close (Esc)]`
