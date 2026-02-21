---
name: pwa-deployment
description: Deployment workflow for the Moon Lamp PWA to GitHub Pages. Use when deploying changes, bumping versions, understanding the GitHub Actions CI/CD pipeline, debugging deployment failures, or understanding how __VERSION__ substitution works across multiple files.
---

# PWA Deployment

## Deployment Target
GitHub Pages at: `https://<username>.github.io/moon_phase_lamp_PWA/`
Repository branch: `main` (auto-deploys on push)

## How Deployment Works (GitHub Actions)
Workflow file: `.github/workflows/update_service_worker_version.yml`

### Steps executed on every push to `main`:
1. **Increment version** — reads `version.json`, bumps minor version (e.g. `4.13` → `4.14`), writes back
2. **Commit version.json** — commits the bumped `version.json` to the repo via `git push`
3. **Substitute `__VERSION__`** — replaces `__VERSION__` in: `sw.js`, `js/app.js`, `js/ui.js` (**for deployment artifact only — NOT committed to repo**)
4. **Upload artifact** — uploads the entire repo directory as the GitHub Pages artifact
5. **Deploy** — GitHub Pages deploys the artifact

### Key: `__VERSION__` in Source vs Deployed
- Source files (`sw.js`, `js/app.js`, `js/ui.js`) contain the literal string `__VERSION__`
- The deployed artifact has it replaced with the actual version number (e.g., `4.14`)
- This means local development always uses the literal `__VERSION__` token
- **Never commit a file with the substituted version number** — the token must stay as `__VERSION__` in source

## Version Number Format
```json
{"version": "4.13"}
```
- Format: `MAJOR.MINOR` (integers)
- CI increments the MINOR component automatically
- To manually bump MAJOR: edit `version.json` directly (e.g., `{"version": "5.0"}`)
- Current version: `version.json` (always check this file)

## Deploying a Change
Simply push to `main`. The GitHub Action handles everything:
```bash
git add .
git commit -m "feat: your change description"
git push origin main
```
GitHub Actions will:
- Bump `version.json` minor version
- Commit and push the version bump
- Build and deploy to GitHub Pages

## Troubleshooting Failed Deployments

### Action fails at "Increment version"
- Check `version.json` is valid JSON: `{"version": "x.y"}`
- The `jq` command extracts the version string

### Action fails at "Update version in files"
- Check that `sw.js`, `js/app.js`, and `js/ui.js` still contain `__VERSION__`
- If the token was accidentally replaced and committed, restore it

### Pages shows stale content
- Check browser: hard refresh (Ctrl+Shift+R) or clear cache
- Check Service Worker in DevTools → Application → Service Workers → Update
- The new SW version should have a different cache name (`moon-lamp-vX.Y`)

### Action fails at "Commit version update"
- May happen if a concurrent push created a conflict on `version.json`
- Re-run the workflow manually via GitHub Actions → "Run workflow"

## Local Development
No build step required. Open `index.html` directly via a local server:
```bash
# Python simple server
python -m http.server 8080
# Then visit: http://localhost:8080
```
Service worker won't install properly over `file://` — use a local HTTP server.
The `__VERSION__` token will be literal in local dev, which is fine for testing.

## Adding a New File to the PWA
If adding a new CSS or JS file that must be cached offline:
1. Create the file in the appropriate directory (`css/` or `js/`)
2. Add it to `filesToCache` in `sw.js`
3. Link it in `index.html`
4. Push — GitHub Actions handles the rest

## Permissions Required
The workflow requires these GitHub repo permissions (set in workflow YAML):
```yaml
permissions:
  contents: write   # To push version.json commit
  pages: write      # To deploy to Pages
  id-token: write   # For OIDC authentication with Pages
```
