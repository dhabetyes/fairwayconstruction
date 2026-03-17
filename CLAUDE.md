# CLAUDE.md — Fairway Construction LLC Website

This file documents the codebase structure, development conventions, and workflows for AI assistants working on this project.

## Project Overview

A static marketing website for **Fairway Construction LLC**, a Phoenix-based roofing contractor (ROC License 363519). Single-page design with a server-side PHP contact form. Deployed to GoDaddy shared hosting via cPanel's Git integration.

**Live URL**: Based on deployment config, files serve from `~/public_html` on GoDaddy cPanel hosting.

---

## Repository Structure

```
fairwayconstruction/
├── index.html          # Main landing page (single-page site)
├── contact.php         # Form submission handler (POST endpoint)
├── .cpanel.yml         # cPanel Git deployment config
├── .gitattributes      # Git line-ending and binary file rules
├── css/
│   └── styles.css      # All site styles (mobile-first, CSS variables)
├── js/
│   └── main.js         # All site JavaScript (vanilla, no frameworks)
└── public/
    └── images/
        └── logo.png    # Company logo
```

No build tools, no package manager, no node_modules. What you see is what gets deployed.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Markup | HTML5 (semantic, ARIA-accessible) |
| Styles | CSS3 (custom properties, flexbox, grid) |
| Scripts | Vanilla JavaScript (ES6, no frameworks) |
| Backend | PHP 7+ (form handling only) |
| Email | PHP `mail()` function |
| Fonts | Google Fonts (Montserrat, Open Sans) via CDN |
| Hosting | GoDaddy shared hosting (cPanel) |
| Deployment | cPanel Git integration (push-to-deploy) |

---

## Deployment

Deployment is fully automated via `.cpanel.yml`. Pushing to the repo triggers cPanel to copy all files to `~/public_html`.

```yaml
deployment:
  tasks:
    - export DEPLOYPATH=/home/$USER/public_html
    - /bin/cp -R $REPOSITORY_ROOT/. $DEPLOYPATH
```

**There is no staging environment.** Changes pushed to `main`/`master` go live immediately.

---

## Key Files

### `index.html`
Single-page layout with anchor-based navigation. Sections in order:
1. `#home` — Hero with CTAs and trust badges
2. `#services` — 4 service cards (Shingle, Tile, Metal, SPF & Coatings)
3. `#about` — Company stats (5+ years, 200+ roofs, 100% satisfaction)
4. `#testimonials` — 3 customer testimonials
5. `#estimate` — Contact/estimate request form
6. Footer — Contact info, links, copyright

### `css/styles.css`
Organized with section comments. Key design tokens defined as CSS variables at `:root`:
```css
--navy: #1E3380      /* Primary brand color */
--orange: #6CB33E    /* Accent/CTA color (green-toned despite name) */
--gray: #...         /* Neutral tones */
```

Breakpoints:
- Mobile-first base styles
- `@media (min-width: 768px)` — tablet
- `@media (min-width: 1024px)` — desktop

### `js/main.js`
Wrapped in an IIFE with `'use strict'`. Key behaviors:
- Mobile hamburger menu toggle
- Smooth scroll with sticky nav offset compensation
- Live form validation (blur + input events)
- Fetch-based form submission to `contact.php`
- Success/error message display
- Dynamic footer year

### `contact.php`
Accepts only `POST` requests. Returns JSON:
```json
{ "success": true }
{ "success": false, "error": "User-facing error message" }
```

HTTP status codes: `200` (success), `400` (validation error), `405` (wrong method), `500` (mail failure).

Logs server-side errors to `/logs/form_errors.log` (outside `public_html` for security).

Hardcoded recipient: `info@fairwayconstructionaz.com`

---

## Business Information (Hardcoded in Source)

Do not change these without confirming with the client:
- **Phone**: (602) 890-5941
- **Email**: info@fairwayconstructionaz.com
- **Address**: 2250 W. Glendale Ave #206, Phoenix, AZ 85021
- **ROC License**: 363519
- **Business hours**: Mon–Fri 7 AM – 5 PM

---

## Code Conventions

### HTML
- Semantic elements (`<nav>`, `<section>`, `<article>`, `<footer>`)
- ARIA labels and roles for accessibility
- 2-space indentation
- Inline SVG icons (no icon font dependency)

### CSS
- BEM-like class naming: `.nav-container`, `.service-card`, `.form-group`
- Mobile-first: base styles for mobile, `min-width` media queries for larger screens
- CSS custom properties for all colors/brand values
- 2-space indentation

### JavaScript
- IIFE wrapper for scope isolation
- `'use strict'` mode
- camelCase variable and function names
- Comments above logical blocks
- Event delegation where appropriate
- No external libraries

### PHP
- Sanitize all input with `htmlspecialchars()`, `strip_tags()`, `trim()`
- Validate before processing
- Return JSON responses with appropriate HTTP status codes
- 4-space indentation

---

## Development Workflow

Since there are no build tools, development is straightforward:

1. Edit HTML/CSS/JS/PHP files directly
2. Test locally (any PHP-capable local server: XAMPP, MAMP, `php -S localhost:8000`)
3. Commit and push — cPanel auto-deploys

**No npm install, no build step, no compilation needed.**

### Local Testing

```bash
# Simple PHP dev server (requires PHP installed locally)
php -S localhost:8000

# Then open http://localhost:8000
```

For form testing locally, `contact.php` requires a working `mail()` setup. On most dev machines, email won't actually send — check logs or mock the response.

---

## No Formal Testing

There is no test suite. Validation is done through:
- Browser-side JavaScript (client validation)
- Server-side PHP (input sanitization + validation)
- Manual browser testing

When making changes, manually verify:
- Mobile hamburger menu opens/closes
- Smooth scroll to sections works
- Form validation shows errors for empty required fields
- Form submits and shows success message

---

## Things to Avoid

- **Do not add a build system** (webpack, npm, etc.) unless the project scope expands significantly
- **Do not introduce external JS dependencies** — the vanilla approach is intentional
- **Do not minify files manually** — no tooling to maintain minified versions
- **Do not push sensitive credentials** — no `.env` files needed; hardcoded values are intentional for this simple site
- **Do not change business info** (phone, address, license) without client confirmation
- **Do not add a database** — this site is intentionally stateless

---

## Git Conventions

No enforced branching strategy, but AI-assisted work uses the pattern:
```
claude/<description>-<session-id>
```

Commit messages are plain English, describing what changed and why.
