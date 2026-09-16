---
name: openlaunch.lol bridge
description: A scoped Clear Sky extension for reviewing ETH/USDC bridges across Base, Robinhood and Arc.
colors:
  # Light-default snapshot of inherited tokens; runtime .dark overrides remain authoritative.
  paper: "#fafaf8"
  card: "#ffffff"
  line: "#e7e5e4"
  line-strong: "#d6d3d1"
  ink: "#0f172a"
  body: "#475569"
  muted: "#64748b"
  inverse: "#ffffff"
  brand: "#0052ff"
  brand-strong: "#0041cc"
  brand-soft: "#eaf0ff"
  up: "#15803d"
  up-soft: "#ecfdf3"
  down-ink: "#b91c1c"
  down-soft: "#fef2f2"
  scrim: "#0f172a"
typography:
  control:
    fontFamily: "var(--font-sans)"
    fontSize: "13px"
    fontWeight: 500
  detail:
    fontFamily: "var(--font-sans)"
    fontSize: "12px"
  caption:
    fontFamily: "var(--font-sans)"
    fontSize: "11px"
  address:
    fontFamily: "var(--font-mono)"
rounded:
  control: "8px"
  block: "12px"
  pill: "999px"
spacing:
  "2": "8px"
  "3": "12px"
  "4": "16px"
  "5": "20px"
  "6": "24px"
components:
  bridge-trigger:
    backgroundColor: "{colors.card}"
    textColor: "{colors.body}"
    typography: "{typography.control}"
    rounded: "{rounded.pill}"
    padding: "0 11px"
  bridge-primary:
    backgroundColor: "{colors.brand}"
    textColor: "{colors.inverse}"
    rounded: "{rounded.block}"
    padding: "12px 16px"
    width: "100%"
  bridge-primary-hover:
    backgroundColor: "{colors.brand-strong}"
  bridge-primary-disabled:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.muted}"
  bridge-error:
    backgroundColor: "{colors.down-soft}"
    textColor: "{colors.down-ink}"
    rounded: "{rounded.control}"
    padding: "12px"
---

# Design System: openlaunch.lol bridge

## Overview

**Creative North Star: "The Instrument Strip"**

This component-local record inherits the incumbent Clear Sky world and the global design authority. It describes `BridgeDialog.tsx`, `BridgeDialog.module.css` and `BridgeProvider.tsx`; it does not redefine the site's identity, palette or typography. The direction contract remains in `docs/bridge-surface.md`.

The bridge is a bounded interaction over the existing page: one clear amount, open cost rows and visible wallet identity. Quiet navigation opens the panel; an explicit action advances review. Transfer feedback preserves the same visual language.

**Key Characteristics:**

- Inherited light and dark tokens, with one filled action inside the active panel.
- Hairline-separated content within a single bounded dialog.
- Native recipient disclosure and explicit, readable transfer progress.

## Colors

Clear Sky's blue action and slate neutrals carry into the panel. Frontmatter records the default light values; all component CSS binds to the inherited `--color-*` properties, including their existing dark overrides.

### Primary

Base Blue identifies the main action, focus, selection and pending-status accent. Strong Blue supplies the filled action's hover state; Soft Blue supports status icons.

### Neutral

Paper provides quiet hover and disabled surfaces. Card is the dialog and trigger ground. Ink carries amounts and important labels; Body and Muted distinguish explanation from secondary context. Line separates sections, while Line Strong supports progress connectors and the recovery link. The scrim remains dark in both themes.

### Semantic

Up and Up Soft identify completed transfer feedback. Down Ink on Down Soft identifies errors. Written state labels carry the meaning independently of colour.

**The Panel Action Rule.** Keep the bridge entry neutral; reserve the filled brand treatment inside the active panel for its next action.

## Typography

Inter is inherited through `--font-sans`; full addresses and request identifiers use the runtime `--font-mono` binding. This extension does not select a new font. The worktree's inherited mono binding and the global design record may differ; resolve that globally, not in bridge styles.

The hierarchy is a restrained dialog title, prominent amount, compact control text, then detail and caption text. The implementation uses a 24px title, 38px amount entry (34px on phones), 27px receive amount and 20px transfer heading. These are local component measurements, not a new site-wide display ramp. Current financial figures use tabular numerals; this record does not promote their inherited sans rendering into an exception to global typography guidance.

## Layout

A centred panel is at most 480px wide, with 16px viewport clearance and internal scrolling. At 520px and below it becomes a full-width bottom sheet, retains 16px top clearance and adds bottom safe-area padding. Content order and cost visibility remain the same.

The source and destination flank a route reversal control. Amount entry leads into open estimate and fee rows; labels align left and values right. Repeated 8–24px spacing organizes controls and sections. The desktop trigger becomes icon-only between 1024px and 1279px while retaining its accessible name.

## Elevation & Depth

Content inside the dialog stays flat and uses single-pixel hairlines. The overlay alone uses the existing `--shadow-dialog` or mobile `--shadow-sheet`, over a scrim mixed at 45%. No new shadow palette is introduced.

**The Bounded Interaction Rule.** Use the dialog boundary to contain the transaction; keep route, estimate, recipient and progress sections open within it.

## Shapes

Header entry uses a pill; the filled action and mobile menu entry use soft block corners. Close and route-reversal controls are circles. The local dialog has 24px corners, becoming 22px top corners on phones. These dialog measurements do not replace the global shape scale.

The network menu uses a local 16px outer radius and 10px row radius around a 6px inset, preserving concentric corners. Its network names reuse the existing 14px control text, with 11px gas captions and a 12px menu label. These are component-local measurements, not a new site-wide token scale.

## Components

### Entry and action controls

The neutral header entry is at least 36px tall; its mobile menu variant is at least 48px. The primary action is full-width and at least 48px tall. Disabled primary actions use Paper, Line and Muted at full opacity. Hover is restricted to fine pointers; active controls use the existing restrained press scale.

### Amount and quote

The amount field is borderless within its section, with an explicit source-asset label, available-balance context and a brand caret. Base UI network pickers expose Base, Robinhood and Arc with gas currencies. Each trigger combines the official mark, network name and gas token; its portaled menu uses spacious logo-led rows, a selected checkmark, keyboard highlighting and viewport collision handling. The menu stays above the scrolling dialog and inherits light/dark tokens. Pointer opening uses a short origin-aware transition; keyboard opening and reduced-motion preferences skip it. Official locally hosted Base, Robinhood, Arc, Ethereum and USDC marks identify the route and asset. Preserve their upstream geometry and colours; the Robinhood feather switches between official black/white variants, and the white Arc mark keeps a dark backing in either theme. Quotes distinguish estimated output, minimum received, included Relay fee and extra source gas. ETH/USDC routes disclose conversion and estimated value change. Changing the source asset clears the amount and quote. No quote value is implied before a quote exists.

Base exposes a compact 44px ETH/USDC token picker beside the send amount and in the receive row. It reuses the network menu's Base UI behavior, official marks, focus, collision handling and motion. Networks with only one supported asset show a static token label, not a pretend dropdown. Base USDC's available balance is shown separately from ETH available for gas. Robinhood routes disclose that USDC is unavailable under the current safety checks.

Base and Arc USDC approval is a separate action, limited to the entered amount. A pending or uncertain approval has its own source-network status and explorer link, never a misleading bridge-delivery progress indicator. Approval confirmation leads to a fresh quote and a separate deposit confirmation. Use plain explanatory text with a restrained accent rule, not another nested card.

### Receiving wallet

A native details/summary row combines the existing wallet avatar, receiving-wallet label and short address. It opens to a full, selectable, wrapping address in both the review and tracked-transfer views. Keep the full address available at phone widths.

**The Inspectable Recipient Rule.** A shortened receiving address must disclose its complete value in the same flow before and after submission.

### Transfer progress and recovery

An ordered three-step sequence uses neutral numbered circles, hairline connectors and green check states only when completed. Status text distinguishes waiting, checking, delivery, refund and failure. Recovery uses a neutral outlined Relay link and explicit explorer links; a new-transfer control is secondary.

### Focus and motion

Base UI owns the dialog interaction. Opening focuses the popup; closing restores the initiating control, with the mobile menu button as fallback. All panel buttons, links, inputs and summaries receive a 2px brand focus outline with 4px offset.

Entry uses a short opacity/rise transition; press feedback is finite. A spinner indicates active work. Reduced motion disables panel transitions and spinner rotation. Closing the panel preserves tracking so reopening can show the same transfer.

## Do's and Don'ts

### Do:

- **Do** bind colours, fonts and elevation to the existing runtime theme variables.
- **Do** preserve the complete receiving-wallet disclosure in review and transfer states.
- **Do** keep costs, estimates and recovery actions legible beside their amounts.
- **Do** retain keyboard focus, mobile safe-area clearance and reduced-motion behavior.

### Don't:

- **Don't** add nested cards around each cost or progress section.
- **Don't** use colour alone to communicate completion, failure or uncertainty.
- **Don't** replace official network or token marks with letter badges, distort their proportions, or recolour them with CSS filters.
