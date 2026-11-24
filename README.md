# Sehaj Jaap

A peaceful bilingual Sikh Jaap counter for personal practice and online Sangat groups.

- Live website: [sehaj-jaap.vercel.app](https://sehaj-jaap.vercel.app/)
- Public repository: [github.com/sahibjotsingh13/sehaj-jaap](https://github.com/sahibjotsingh13/sehaj-jaap)

## Features

- English and Punjabi interface
- Tap-based Jaap counter with mala, daily goal, streak, and progress tracking
- Timer, count-target, combined, and paced focus sessions
- Username/password accounts with a minimum eight-character password
- Shareable online Sangat groups with member totals and contribution updates
- Responsive sidebar, mobile navigation, light/dark modes, and reduced-motion support
- Sikh heritage presentation with respectfully displayed imagery

## Architecture

The public application is a Next.js 16 project deployed on Vercel.

- `app/page.tsx` contains the main interactive experience and local practice state.
- `app/api/account` proxies account operations to the account service.
- `app/api/sangat` validates the signed-in account and proxies Sangat operations to the private group service.
- Account credentials are handled server-side; private service tokens are never exposed to the browser.
- Sangat persistence uses a private D1-backed service, while account data is stored in Supabase.

## Local development

Requirements: Node.js 22 and npm.

```bash
npm install
copy .env.example .env.local
npm run dev:vercel
```

Open `http://localhost:3000`.

Set these server-only values in `.env.local`:

- `SANGAT_UPSTREAM_ORIGIN`
- `SANGAT_UPSTREAM_TOKEN`

Do not commit real environment values.

## Verification

```bash
npm run lint
npm run build:vercel
```

Vercel builds the project with the command declared in `vercel.json`. Pushing to the connected `main` branch starts a production deployment automatically.

## Media

Third-party media attribution and license information is recorded in [ASSET_NOTICES.md](ASSET_NOTICES.md). Sikh scripture imagery is displayed without interface text placed over the photograph.

