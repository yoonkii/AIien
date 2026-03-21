# Design System — AIien

## Product Context
- **What this is:** Multiplayer 2D side-scrolling horror game set on a spaceship, where the alien antagonist is controlled by a Gemini AI "Director" that adapts to player behavior
- **Who it's for:** Gaming friends who want co-op horror with genuinely intelligent AI enemies
- **Space/industry:** Indie horror games (comps: Alien: Isolation, Dead Cells, Lone Survivor, Signalis)
- **Project type:** 2D game with two visual modes — player view (horror) and spectator/Director's Cut (analytical)

## Aesthetic Direction
- **Direction:** Industrial Sci-Fi Horror
- **Decoration level:** Intentional — subtle CRT scanline texture on UI overlays, grain/noise on dark areas. The ship has been through hell.
- **Mood:** Cold, utilitarian, deteriorating. Think Alien (1979) set design: exposed pipes, emergency lighting, CRT monitors. Not polished sci-fi — a working ship that's falling apart. Tension comes from what you can't see.
- **Reference sites:** Alien: Isolation UI, Dead Cells (color approach), Signalis (cold palette), Lone Survivor (pixel horror), ROUTINE (minimal HUD)

## Typography
- **Display/Hero:** Cabinet Grotesk Bold — geometric, commanding. Used for game title, death screen, Director's Cut headers. Evokes industrial signage.
- **Body:** Geist — clean, modern, readable at small sizes. Used for spectator AI reasoning text, descriptions, menus.
- **UI/Labels:** IBM Plex Mono — same as HUD/Terminal
- **HUD/Terminal:** IBM Plex Mono — the ship's computer font. Cold, precise, industrial. Used for all in-game HUD elements, status readouts, data displays.
- **Data/Tables:** IBM Plex Mono (tabular-nums) — aligned numbers for HP, ammo, stats, session data.
- **Code:** IBM Plex Mono
- **Loading:** Google Fonts CDN — `IBM+Plex+Mono:wght@400;500;600;700`, system fonts for Geist, Cabinet Grotesk via CDN Fonts
- **Scale:**
  - xs: 9px / 0.5625rem — timestamps, micro labels
  - sm: 11px / 0.6875rem — HUD text, terminal output, stat labels
  - base: 13px / 0.8125rem — terminal body, form inputs
  - md: 15px / 0.9375rem — body text, descriptions
  - lg: 24px / 1.5rem — ammo counter, stat values
  - xl: 32px / 2rem — section headers
  - 2xl: 48px / 3rem — display headings
  - 3xl: 72px / 4.5rem — hero title

## Color
- **Approach:** Restrained + one hot accent. Cold world, warm danger.
- **Backgrounds:**
  - Deep Space: `#0A0E17` — deepest background, void
  - Ship Interior: `#0F1420` — primary background
  - Panel: `#1A2030` — cards, sidebars, elevated surfaces
  - Surface: `#232D40` — interactive surface hover
- **Neutrals (cold blue-grays):**
  - 600: `#2D3748` — borders, dividers
  - 500: `#4A5568` — disabled text, subtle borders
  - 400: `#718096` — secondary text, timestamps
  - 300: `#A0AEC0` — body text
  - 200: `#CBD5E0` — primary text
  - 100: `#E2E8F0` — headings, emphasis
- **Accent — Warning Amber:** `#E8930C` — alien proximity, danger alerts, emergency lighting. The only warm color in a cold world. Use sparingly — when amber appears, something is wrong.
  - Dim: `#B8740A`
  - Glow: `rgba(232, 147, 12, 0.15)`
- **Accent — System Teal:** `#38B2AC` — player HUD, friendly UI, safe zones, system status. Calm and analytical.
  - Dim: `#2C8C87`
  - Glow: `rgba(56, 178, 172, 0.12)`
- **Accent — Alien Red:** `#C53030` — alien attacks, damage, critical alerts, death. Reserved EXCLUSIVELY for alien presence. When red appears, the alien has struck.
  - Glow: `rgba(197, 48, 48, 0.2)`
- **Semantic:** success `#38A169`, warning `#E8930C`, error `#C53030`, info `#38B2AC`
- **Dark mode:** This IS the dark mode. The game is always dark. Light mode exists only for the design preview page, not the game.

## Spacing
- **Base unit:** 4px
- **Density:** Compact for spectator/terminal UI, spacious for player HUD (less UI = more tension)
- **Scale:** 2xs(2) xs(4) sm(8) md(16) lg(24) xl(32) 2xl(48) 3xl(64)

## Layout
- **Approach:** Hybrid — minimal/diegetic for player view, grid-disciplined data-dense for spectator
- **Player HUD:** Corner-anchored elements. Health bottom-left, ammo bottom-right, warning center-top, objective top-right. No backgrounds — text floats over the game.
- **Spectator view:** Split-pane terminal. Map left (70%), AI feed right (30%). Monospace throughout.
- **Border radius:** Minimal — 2px for buttons/inputs, 4px for cards/containers. No rounded corners > 4px. This is industrial, not friendly.

## Motion
- **Approach:** Minimal-functional — motion serves tension, never decoration
- **Easing:** enter(ease-out) exit(ease-in) move(ease-in-out)
- **Duration:** micro(50-100ms) short(150-250ms) medium(250-400ms) long(400-700ms)
- **Game-specific motion:**
  - Screen shake on damage (short, 50-100ms)
  - Slow fade for lights turning off (medium, 250-400ms)
  - CRT flicker effect when alien is nearby (procedural, intensity scales with proximity)
  - Pulsing amber for "Motion Detected" warnings (2s cycle)
  - No bouncy animations. No slide-ins. No decorative transitions.

## Two Visual Registers

### Player View (Horror)
- Minimal HUD — health bar (4px thin), ammo count, objective text only
- No backgrounds on HUD elements — text floats directly over game
- Diegetic where possible (health as suit damage, ammo on weapon display)
- CRT scanline overlay (subtle, 2px repeating gradient at 3% opacity)
- Amber warnings pulse when triggered
- UI DISAPPEARS during safe moments — only shows when relevant

### Spectator / Director's Cut View (Analytical)
- Data-dense terminal layout — IBM Plex Mono throughout
- Teal as primary color (analytical, calm — contrasts with player's amber/red)
- Split-pane: ASCII ship map with entity positions, AI reasoning feed
- AI reasoning shown in teal-bordered blocks
- Alien inner monologue shown in red-bordered italic blocks
- Full stat readouts (strategy, target, HP, tick count)
- Scrolling feed — newest decisions at top

## CRT Aesthetic (Functional Storytelling)
The CRT effect is not just decoration — it's a gameplay signal:
- **Baseline:** Subtle scanlines at 3% opacity. Always present. Sets the tone.
- **Alien nearby:** Scanlines intensify (10-15% opacity). Subtle color aberration. Players learn to read the UI itself as a proximity sensor.
- **Alien attacking:** Full CRT distortion — scanlines at 25%, horizontal jitter, color bleeding. The ship's systems are failing.
- **Power out:** Scanlines flicker erratically. The monitor is losing power. Maximum horror.

## Decisions Log
| Date | Decision | Rationale |
|------|----------|-----------|
| 2026-03-21 | Initial design system created | Created by /design-consultation based on product context + competitive research (Dead Cells, Signalis, Lone Survivor, ROUTINE, Alien: Isolation) |
| 2026-03-21 | Amber as primary accent over red | Industrial emergency lighting feel. Red reserved for alien attacks — makes alien color genuinely alarming because it's rare |
| 2026-03-21 | Two visual registers (player/spectator) | Player view = horror immersion. Spectator view = analytical fascination. Same game, two emotional experiences |
| 2026-03-21 | CRT effect as functional gameplay signal | Scanline intensity correlates with alien proximity. UI itself becomes a fear signal |
