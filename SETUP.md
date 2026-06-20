# theRensisioure profile repo — deploy

**Full Zed workflow:** see [ZED-DEPLOY.md](ZED-DEPLOY.md) (dyslexia-friendly, task bindings).

## What ships

| Deliverable | Path | URL after deploy |
|-------------|------|------------------|
| Profile README | `README.md` | https://github.com/theRensisioure |
| GitHub Pages | `docs/index.html` | https://therenisioure.github.io/theRensisioure/ |

**Spotlight:** minimal mystery — no project names on the public surface.

## One-time GitHub setup

1. Create account **theRensisioure** (if not done).
2. Create **public** repo named exactly `theRensisioure` (same as username — required for profile README).
3. Auth CLI as the new account:

```powershell
gh auth login
```

4. Push from this folder:

```powershell
cd T:\theRensisioure
git init
git add README.md assets docs SETUP.md
git commit -m "profile: glyph-grid README + dyslexia Pages lens"
gh repo create theRensisioure --public --source=. --remote=origin --push
```

5. Enable Pages: **Settings → Pages → Build from branch → main → /docs**.

6. Pin this repo on the profile (only public repo with matching name shows README automatically).

## Local preview

```powershell
cd T:\theRensisioure\docs
python -m http.server 8787
```

Open http://127.0.0.1:8787/