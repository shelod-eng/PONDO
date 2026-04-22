# PONDO Color Palette Guide (Tailwind Ready)

## Design Psychology
- Trust Anchor: deep blue/navy
- Action Accent: orange-red CTA gradient
- Positive Status: emerald green
- Neutral Clarity: slate/white for readability

## Core Palette
- `pondo-navy-900`: `#06152a` (page background)
- `pondo-navy-800`: `#102743` (inner panels)
- `pondo-navy-700`: `#163256` (main cards)
- `pondo-navy-600`: `#18365a` (header band)
- `pondo-border`: `#2d4e74`
- `pondo-text-primary`: `#ffffff`
- `pondo-text-secondary`: `#cdd6e1`
- `pondo-amber`: `#f5b642`
- `pondo-success`: `#34d399`
- `pondo-danger`: `#ef4444`

## CTA Gradient
- Start: `#ea6a3f`
- End: `#d64534`
- Hover start: `#ef7449`
- Hover end: `#bf3b2c`

## Usage Rules
1. Use `pondo-navy-900` for body background and high contrast readability.
2. Use `pondo-navy-700` cards with `pondo-border` for structure.
3. Reserve CTA gradient only for primary actions.
4. Use `pondo-success` for approved/verified statuses.
5. Keep dense text on dark panels in `pondo-text-secondary`.

## Tailwind Snippet (example)
```ts
// tailwind.config.ts
extend: {
  colors: {
    pondo: {
      navy900: '#06152a',
      navy800: '#102743',
      navy700: '#163256',
      navy600: '#18365a',
      border: '#2d4e74',
      amber: '#f5b642',
      success: '#34d399',
      danger: '#ef4444',
    },
  },
}
```
