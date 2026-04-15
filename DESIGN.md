# Design System — SLO Events

## Product Context
- **What this is:** AI-powered events discovery platform for San Luis Obispo
- **Who it's for:** Locals (friend groups) looking for what's happening tonight, this weekend
- **Space/industry:** Local events discovery (sloevents.com)
- **Project type:** Consumer web app, mobile-first

## Aesthetic Direction
- **Direction:** Editorial/Magazine meets Organic/Natural
- **Decoration level:** Intentional (subtle warm grain on hero areas, no blobs or decorative circles)
- **Mood:** A friend who knows every spot in town. Warm, confident, local. Not a corporate ticketing platform.
- **Reference sites:** DICE (bespoke typography, dark-first), Fever (curated editorial quality)
- **Deliberate departures:** Warm palette (events apps default cool/dark), editorial typography (events apps default system fonts)

## Typography
- **Display/Hero:** Plus Jakarta Sans 700-800 — geometric warmth, not a default stack. Conveys confidence without being quirky.
- **Body:** DM Sans 400-600 — clean, excellent readability at small sizes, pairs well with Jakarta Sans.
- **UI/Labels:** DM Sans 500-600
- **Data/Tables:** Geist Mono — supports tabular-nums, modern monospace for event counts and timestamps.
- **Code:** Geist Mono
- **Loading:** Bunny Fonts CDN (https://fonts.bunny.net) or self-hosted
- **Scale:**
  - 4xl: 48px / 800 weight / -0.02em tracking (page titles)
  - 3xl: 36px / 700 weight / -0.02em tracking (section headings)
  - 2xl: 24px / 700 weight / -0.01em tracking (card titles, Tonight Mode headers)
  - xl: 20px / 700 weight (subsection headings)
  - lg: 18px / 600 weight (large body, descriptions)
  - base: 16px / 400 weight / 1.6 line-height (body text)
  - sm: 14px / 400-500 weight (secondary text, metadata)
  - xs: 12px / 500 weight (captions, timestamps, badges)

## Color
- **Approach:** Balanced (primary + accent, semantic colors for hierarchy)
- **Primary:** #EA580C (sunset orange) — golden hour on the central coast. Used for CTAs, active states, brand emphasis.
- **Primary hover:** #C2410C
- **Primary light:** #FFF7ED (backgrounds, focus rings)
- **Accent:** #0F766E (ocean teal) — secondary actions, Spotify connection, tags. Complements the warmth.
- **Accent light:** #CCFBF1
- **Neutrals:** Warm stone gray scale
  - 900: #1C1917 (headings, primary text)
  - 800: #292524
  - 700: #44403C
  - 600: #57534E (secondary text)
  - 500: #78716C
  - 400: #A8A29E (muted text, placeholders)
  - 300: #D6D3D1 (strong borders)
  - 200: #E7E5E4 (borders, dividers)
  - 100: #F5F5F4 (muted backgrounds, surface)
  - 50: #FAFAF9 (page background)
- **Semantic:**
  - Success: #15803D
  - Warning: #A16207
  - Error: #B91C1C
  - Info: #0369A1
- **Dark mode:**
  - Surfaces: stone 900 (#1C1917) for background, stone 800 (#292524) for cards
  - Primary lightens to #FB923C (more visible on dark surfaces, desaturated 10%)
  - Accent lightens to #2DD4BF
  - Text: stone 50 (#FAFAF9) for primary, stone 300 (#D6D3D1) for secondary
  - Borders: stone 700 (#44403C)

## Category Colors
Each event category has a distinct tinted palette (background + text):
- Music: #F3E8FF / #7C3AED (purple)
- Comedy: #FFEDD5 / #C2410C (orange)
- Sports: #DBEAFE / #1D4ED8 (blue)
- Arts: #FCE7F3 / #BE185D (pink)
- Food & Wine: #DCFCE7 / #15803D (green)
- Theater: #FEE2E2 / #B91C1C (red)
- Festival: #FEF9C3 / #A16207 (yellow)
- Education: #E0E7FF / #4338CA (indigo)
- Community: #CCFBF1 / #0F766E (teal)
- Nightlife: #EDE9FE / #6D28D9 (violet)
- Dark mode: use the same hue family at 10% opacity on dark surface, with lighter text variant

## Spacing
- **Base unit:** 4px
- **Density:** Comfortable
- **Scale:** 2xs(2) xs(4) sm(8) md(16) lg(24) xl(32) 2xl(48) 3xl(64)
- **Component spacing:** Cards use 16px internal padding. Grid gaps are 16px. Section spacing is 48px.

## Layout
- **Approach:** Grid-disciplined for event feeds, creative for Tonight Mode headers
- **Grid:** 1 column mobile, 2 columns tablet, 3 columns desktop
- **Max content width:** 1200px
- **Border radius:**
  - sm: 4px (badges, small elements)
  - md: 8px (buttons, inputs, cards)
  - lg: 12px (large cards, modals)
  - full: 9999px (pills, avatars, category badges)

## Motion
- **Approach:** Intentional (subtle animations that communicate state, not decoration)
- **Easing:** enter(ease-out) exit(ease-in) move(ease-in-out)
- **Duration:** micro(50-100ms) short(150-250ms) medium(250-400ms) long(400-700ms)
- **Signature animations:**
  - Pulsing red dot on "Happening Now" section header
  - Smooth fade-in on event cards entering the viewport
  - Tab transition: slide + fade between Tonight/Weekend views
  - Hover: subtle lift (translateY -2px + shadow increase) on event cards
- **Rules:**
  - Only animate transform and opacity (never width, height, top, left)
  - Respect prefers-reduced-motion
  - No transition: all (list properties explicitly)

## Decisions Log
| Date | Decision | Rationale |
|------|----------|-----------|
| 2026-04-13 | Initial design system | Created by /design-consultation. Editorial/warm aesthetic chosen to differentiate from cool/dark events app norms. SLO's landscape (golden hour, wine country, coastal) drove the warm palette. |
| 2026-04-13 | Primary: sunset orange #EA580C | User rejected initial amber #B45309 (read as brown). Orange is warmer, more energetic, still distinct from category defaults. |
| 2026-04-13 | Plus Jakarta Sans + DM Sans | Geometric warmth for display, clean readability for body. Neither is in the overused category (Inter, Roboto, Poppins). |
