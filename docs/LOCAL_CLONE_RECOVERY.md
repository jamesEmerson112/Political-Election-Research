# Local clone out of sync: a guide for agents

For an agent working in the maintainer's own clone (Windows, GitHub Desktop; run the commands in Git Bash). Read it before doing anything else in a clone that looks like this:

- `git log -1` (GitHub Desktop "History") shows an old commit, and "Pull origin" shows hundreds of commits to pull;
- `git status` (GitHub Desktop "Changes") shows hundreds or thousands of changed files that nobody remembers editing.

**What usually happened:** the files on disk were replaced with a newer version from GitHub (by a copy, a sync, or an interrupted update) while git stayed on the old commit. The "changes" are then GitHub's own work, already safe there. Still check before discarding anything: the steps below prove it, and keep a backup either way.

## Rules
- Don't push from this clone until step 4 is done. Never force-push.
- Before step 2's backup exists, don't discard anything: no "Discard changes" in GitHub Desktop, no `git reset --hard`, `git checkout -- .`, `git restore .` or `git clean`.
- Don't commit the changed files to `main`.
- If anything below doesn't go as described, stop and report to the maintainer instead of improvising.

## 1. Look, change nothing

```bash
git fetch origin
```

```bash
git log -1 --oneline; git status --short -uall | wc -l; git stash list
```

```bash
echo "behind: $(git rev-list --count HEAD..origin/main)  local-only commits: $(git rev-list --count origin/main..HEAD)"
```

If "local-only commits" is not 0, the clone has commits GitHub doesn't have: stop and report them (`git log --oneline origin/main..HEAD`).

## 2. Back up the whole working tree as a local branch

Nothing leaves the machine; the branch is never pushed.

```bash
git switch -c backup/local-$(date +%Y%m%d)
```

```bash
git add -A && git commit -q -m "Backup of the local working tree before syncing with GitHub" && git log -1 --oneline
```

If the commit fails because git has no name or email, use the maintainer's identity from CLAUDE.md ("Commits: the maintainer is the author").

## 3. Find out whether anything in the backup is not on GitHub

Does the backup equal a commit on GitHub exactly?

```bash
git log origin/main --format='%T %h %s' | grep "^$(git rev-parse HEAD^{tree}) "
```

If it prints a commit, every local change is already on GitHub: go to step 4. If it prints nothing, list the backup's files whose content never appeared on GitHub's `main`:

```bash
git diff --name-only --diff-filter=AM origin/main HEAD | while read -r f; do b=$(git rev-parse "HEAD:$f"); git log origin/main --raw --no-abbrev --format= -- "$f" | awk '{print $4}' | grep -q "^$b$" || echo "NOT ON GITHUB: $f"; done
```

Each `NOT ON GITHUB` file is possibly real local work. Don't merge or push it: show the maintainer `git diff origin/main HEAD -- <file>` and let them decide. Files the backup lacks, or holds in an older version, are not local work.

## 4. Bring `main` up to date

```bash
git switch main && git pull --ff-only origin main
```

```bash
git log -1 --oneline; git status --short -uall | wc -l
```

`main` should now match GitHub's latest commit, with 0 changed files. In GitHub Desktop the same is: switch to `main`, then "Pull origin".

## 5. Report, then clean up only when told

Tell the maintainer:
- whether the backup matched a GitHub commit exactly (step 3), and if not, the `NOT ON GITHUB` files;
- that `main` is now at GitHub's latest commit.

Delete the backup only when the maintainer says so:

```bash
git branch -D backup/local-YYYYMMDD
```

## Avoiding it next time
- Pull ("Pull origin", or `git pull --ff-only`) before working locally; cloud sessions push to `main` all the time.
- Get new versions of files only through git, never by copying them into the clone.

## The case of 2026-11-05
- **Where the clone was:** at d7977d8 (2026-11-03), 1,180 commits behind, with 1,814 changed files and no local-only commits.
- **What the numbers show:** exactly 1,814 files differ between d7977d8 and GitHub's 5173d44 ("site: results (winner highlighted, losers dimmed; yes/no bars) and the promise tracker", 2026-11-05). So the files on disk are most likely that commit.
- **What to expect:** step 3 should print 5173d44. A test on a copy built that way (old commit, files replaced with 5173d44) gave 1,814 changed files, an exact match with 5173d44 in step 3, nothing "NOT ON GITHUB", and a clean, up-to-date `main` after step 4. The same test with one edited and one new file listed both as "NOT ON GITHUB".
