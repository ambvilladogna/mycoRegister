#!/usr/bin/env bash
set -Eeuo pipefail

# --- Config ------------------------------------------------------------------
DEV_BRANCH="dev"
RELEASE_BRANCH="master"
PROD_REMOTE="production"
ORIGIN_REMOTE="origin"
# Optional: purge only these URLs instead of everything (space-separated), e.g.
# PURGE_URLS="https://example.com/sw.js https://example.com/index.html"
PURGE_URLS="${PURGE_URLS:-}"

# --- State used by the cleanup trap --------------------------------------------
MASTER_SHA=""
MERGED=0
PUSHED=0

log()  { echo "$@"; }
die()  { echo "Error: $*" >&2; exit 1; }
warn() { echo "Warning: $*" >&2; }

cleanup() {
    local code=$?
    trap - EXIT
    if [ "$code" -ne 0 ]; then
        echo "--- Build FAILED (exit $code): restoring repository state ---" >&2
        # Abort a half-done merge, if any
        if [ -f "$(git rev-parse --git-dir)/MERGE_HEAD" ]; then
            git merge --abort || true
        fi
        # Merge happened locally but never reached production: drop it
        if [ "$MERGED" -eq 1 ] && [ "$PUSHED" -eq 0 ] && [ -n "$MASTER_SHA" ]; then
            git checkout "$RELEASE_BRANCH" >/dev/null 2>&1 || true
            git reset --hard "$MASTER_SHA" || true
            echo "Local $RELEASE_BRANCH reset to $MASTER_SHA (merge never pushed)." >&2
        fi
        git checkout "$DEV_BRANCH" >/dev/null 2>&1 || true
        if [ "$PUSHED" -eq 1 ]; then
            echo "NOTE: $RELEASE_BRANCH was already pushed to production; only the later steps failed." >&2
        fi
    fi
    exit "$code"
}
trap cleanup EXIT

log "--- Starting PWA Build Process ---"

# --- 0. Preflight ----------------------------------------------------------------
[ -f .env ] || die ".env not found."
# shellcheck disable=SC1091
source .env
: "${ZONE_ID:?ZONE_ID missing in .env}"
: "${API_TOKEN:?API_TOKEN missing in .env}"

git rev-parse --is-inside-work-tree >/dev/null 2>&1 || die "Not in a Git repository."

CURRENT_BRANCH=$(git rev-parse --abbrev-ref HEAD)
[ "$CURRENT_BRANCH" = "$DEV_BRANCH" ] || die "You must be on '$DEV_BRANCH' (currently on '$CURRENT_BRANCH')."

if ! git diff --quiet || ! git diff --cached --quiet; then
    die "Working tree has uncommitted changes. Commit or stash them first."
fi

# log "0. Fetching remotes..."
# git fetch "$ORIGIN_REMOTE"
# git fetch "$PROD_REMOTE"
# 
# # Local master must already contain everything on production/master, otherwise the push will be rejected.
# if git rev-parse --verify -q "refs/remotes/$PROD_REMOTE/$RELEASE_BRANCH" >/dev/null; then
#     git merge-base --is-ancestor "$PROD_REMOTE/$RELEASE_BRANCH" "$RELEASE_BRANCH" \
#         || die "Local $RELEASE_BRANCH is behind or diverged from $PROD_REMOTE/$RELEASE_BRANCH. Sync it first."
# fi
# # Same for dev vs its remote
# if git rev-parse --verify -q "refs/remotes/$ORIGIN_REMOTE/$DEV_BRANCH" >/dev/null; then
#     git merge-base --is-ancestor "$ORIGIN_REMOTE/$DEV_BRANCH" "$DEV_BRANCH" \
#         || die "Local $DEV_BRANCH is behind or diverged from $ORIGIN_REMOTE/$DEV_BRANCH. Pull/rebase first."
# fi

# --- 1. Generate version ---------------------------------------------------------
log "1. Generating app version file..."
node scripts/generateVersion.js || die "Version file generation failed."

# --- 2. Commit on dev (only if something changed) --------------------------------
log "2. Staging generated and updated files..."
git add public/js/components/footer.js public/sw.js
if git diff --cached --quiet; then
    log "   No version changes to commit, continuing."
else
    git commit -m "Build: Incorporate app version $(git describe --tags --always)"
fi

# --- 3. Merge dev into master ----------------------------------------------------
log "3. Merging $DEV_BRANCH into $RELEASE_BRANCH..."
git checkout "$RELEASE_BRANCH"
MASTER_SHA=$(git rev-parse HEAD)
MERGED=1
git merge "$DEV_BRANCH" --no-ff -m "Merge branch '$DEV_BRANCH' into $RELEASE_BRANCH for release"

# --- 4. Push to production -------------------------------------------------------
log "4. Pushing $RELEASE_BRANCH to $PROD_REMOTE..."
git push "$PROD_REMOTE" "$RELEASE_BRANCH"
PUSHED=1

# --- 5. Back to dev, sync remotes (non-fatal: production is already updated) -----
log "5. Syncing remote branches..."
git checkout "$DEV_BRANCH"
git push "$ORIGIN_REMOTE" "$DEV_BRANCH"     || warn "Failed to push $DEV_BRANCH to $ORIGIN_REMOTE."
git push "$ORIGIN_REMOTE" "$RELEASE_BRANCH" || warn "Failed to push $RELEASE_BRANCH to $ORIGIN_REMOTE."

# --- 6. Purge Cloudflare cache ---------------------------------------------------
log "6. Cleaning Cloudflare cache..."
if [ -n "$PURGE_URLS" ]; then
    FILES_JSON=$(printf '%s\n' $PURGE_URLS | sed 's/.*/"&"/' | paste -sd, -)
    PAYLOAD="{\"files\":[${FILES_JSON}]}"
else
    PAYLOAD='{"purge_everything":true}'
fi

RESPONSE=$(curl -fsS -X POST "https://api.cloudflare.com/client/v4/zones/${ZONE_ID}/purge_cache" \
    -H "Authorization: Bearer ${API_TOKEN}" \
    -H "Content-Type: application/json" \
    --data "$PAYLOAD") || die "Cloudflare request failed (HTTP/network error)."

if ! grep -Eq '"success"[[:space:]]*:[[:space:]]*true' <<<"$RESPONSE"; then
    echo "$RESPONSE" >&2
    die "Cloudflare purge reported failure."
fi

log "--- PWA Build Process Complete! ---"