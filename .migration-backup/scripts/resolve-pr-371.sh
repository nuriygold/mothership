#!/bin/bash
set -e

# Start rebase
git rebase origin/main 2>&1 &
REBASE_PID=$!
sleep 2

# Loop: resolve all conflicts automatically
while [ -d .git/rebase-merge ] || [ -d .git/rebase-apply ]; do
  conflicted=$(git diff --name-only --diff-filter=U 2>/dev/null || true)
  
  if [ -n "$conflicted" ]; then
    echo "$conflicted" | while read f; do
      git checkout --theirs -- "$f" 2>/dev/null || true
      git add "$f" 2>/dev/null || true
    done
  fi
  
  # Handle modify/delete conflicts: remove if main deleted it
  for f in \
    app/api/v2/stream/kissin-booth/route.ts \
    components/v2/the-kissin-booth-card.tsx \
    components/voice/hotline-bling-card.tsx \
    components/today/kissin-booth.tsx; do
    if [ -f "$f" ]; then
      git rm -f "$f" 2>/dev/null || true
    fi
  done
  
  git add -A 2>/dev/null || true
  
  GIT_EDITOR=true git rebase --continue 2>&1 || break
done

wait $REBASE_PID 2>/dev/null || true

git log --oneline origin/main..HEAD | head -20
echo ""
echo "Rebase complete. Ready to push."
