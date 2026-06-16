# Zed deploy guide · theRensisioure

**Dyslexia-friendly.** Short chunks. Monospace commands. One step at a time.

---

## Quick tips

- **Font in Zed:** JetBrains Mono or OpenDyslexic (Settings → Typography).
- **Terminal:** integrated panel — `` Ctrl+` `` or **View → Terminal**.
- **Tasks:** `` Ctrl+Shift+P `` → `task: spawn` → pick a deploy task.
- **Repo must be public** and named exactly `theRensisioure` for profile README to show.

---

## What deploys

| Piece | Path | Live URL |
|-------|------|----------|
| Profile README | `README.md` | https://github.com/theRensisioure |
| GitHub Pages | `docs/index.html` | https://therenisioure.github.io/theRensisioure/ |

---

## Step 0 · Open in Zed

1. **Zed** → **File → Open Folder**
2. Pick: `T:\theRensisioure`
3. Confirm you see: `README.md`, `docs/`, `assets/`

---

## Step 1 · Preview locally (safe)

**Option A — Zed task**

1. `` Ctrl+Shift+P ``
2. Type: `task: spawn`
3. Choose: **Pages preview (8787)**

**Option B — terminal**

```powershell
cd T:\theRensisioure\docs
python -m http.server 8787
```

**Check:** open http://127.0.0.1:8787/ — glyph grid + dyslexia controls.

**Stop:** `Ctrl+C` in terminal.

---

## Step 2 · GitHub account

1. Create user **theRensisioure** on GitHub (if missing).
2. In Zed terminal:

```powershell
gh auth login
```

3. Pick **GitHub.com** → **HTTPS** → login as **theRensisioure**.

**Verify:**

```powershell
gh api user --jq .login
```

**Success:** prints `theRensisioure` (not `Zychs`).

---

## Step 3 · First push

**Zed task:** `Deploy · first push (gh create)`

**Or terminal:**

```powershell
cd T:\theRensisioure
git status
git push -u origin main
```

**If no remote yet:**

```powershell
gh repo create theRensisioure --public --source=. --remote=origin --push
```

**Success:** https://github.com/theRensisioure/theRensisioure exists and README renders.

---

## Step 4 · Enable GitHub Pages

1. Browser → https://github.com/theRensisioure/theRensisioure/settings/pages
2. **Source:** Deploy from a branch
3. **Branch:** `main`
4. **Folder:** `/docs`
5. **Save**

**Wait ~1–2 min.** Then open https://therenisioure.github.io/theRensisioure/

---

## Step 5 · Later updates

1. Edit `README.md` or `docs/index.html` in Zed.
2. **Preview** (Step 1) if you changed Pages.
3. Commit + push:

```powershell
cd T:\theRensisioure
git add README.md docs assets
git commit -m "profile: <what you changed>"
git push
```

**Zed task:** `Deploy · push main`

---

## Zed tasks (built-in)

| Task | What it does |
|------|----------------|
| Pages preview (8787) | Local Pages server |
| gh · who am I | Shows logged-in GitHub user |
| Deploy · first push | `gh repo create` + push |
| Deploy · push main | `git push` only |
| Open live profile | Browser → GitHub profile |
| Open live Pages | Browser → Pages URL |

**Rerun last task:** `` Ctrl+Shift+P `` → `task: rerun`

---

## Troubleshooting

| Problem | Fix |
|---------|-----|
| README not on profile | Repo must be **public** + named `theRensisioure` |
| `gh` shows wrong user | `gh auth login` again as theRensisioure |
| Pages 404 | Settings → Pages → `main` + `/docs`; wait 2 min |
| Hero image broken on Pages | Image must live in `docs/assets/profile-grid.png` |
| Port 8787 busy | Use `python -m http.server 8788` instead |

---

## Emergency

- **Stuck terminal?** `Ctrl+C`
- **Undo bad commit (local only)?** `git reset --soft HEAD~1`
- **Never force-push** unless you mean to wipe remote history