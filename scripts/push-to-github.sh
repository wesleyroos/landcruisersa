#!/usr/bin/env bash
# Push current committed changes to GitHub via the REST API.
# Use this instead of `git push` until HTTPS pack protocol is resolved.
# Usage: ./scripts/push-to-github.sh [commit message]
set -euo pipefail

REPO="wesleyroos/landcruisersa"
TOKEN=$(gh auth token)

# Get current remote state
REMOTE_SHA=$(gh api "repos/$REPO/git/ref/heads/main" --jq '.object.sha')
REMOTE_TREE=$(gh api "repos/$REPO/git/commits/$REMOTE_SHA" --jq '.tree.sha')

MSG="${1:-Update site}"

python3 << PYEOF
import subprocess, json, base64, urllib.request, os, sys

TOKEN = "$TOKEN"
REPO = "$REPO"
PARENT_SHA = "$REMOTE_SHA"
PARENT_TREE = "$REMOTE_TREE"
MSG = """$MSG"""

def api(method, path, data=None):
    url = f"https://api.github.com/repos/{REPO}/{path}"
    body = json.dumps(data).encode() if data else None
    req = urllib.request.Request(url, data=body, method=method,
        headers={"Authorization": f"Bearer {TOKEN}", "Content-Type": "application/json",
                 "Accept": "application/vnd.github+json"})
    with urllib.request.urlopen(req) as r:
        return json.load(r)

# Find files changed vs remote parent (staged + tracked modifications)
result = subprocess.run(["git", "diff", "--name-only", f"origin/main..HEAD"],
    capture_output=True, text=True)
changed = [f for f in result.stdout.strip().split("\n") if f]

# Also include newly tracked files not yet on remote
result2 = subprocess.run(["git", "ls-files", "--others", "--exclude-standard"],
    capture_output=True, text=True)
# Only include if staged
result3 = subprocess.run(["git", "diff", "--cached", "--name-only"],
    capture_output=True, text=True)
staged = [f for f in result3.stdout.strip().split("\n") if f]
changed = list(set(changed + staged))

if not changed:
    print("Nothing to push (no changes vs origin/main).")
    sys.exit(0)

# Skip large content image directories (not in git); include all other files including UI images
skip_prefixes = (
    "public/images/wp-media/",
    "public/images/posts/",
    "public/images/training/",
    "public/images/partners/",
    "public/images/models/",
    "public/images/og/",
    "public/uploads/",
)
files = [f for f in changed if os.path.exists(f)
         and not any(f.startswith(p) for p in skip_prefixes)]

print(f"Uploading {len(files)} changed files...", flush=True)
tree_items = []
for filepath in files:
    with open(filepath, "rb") as fh:
        raw = fh.read()
    try:
        content = raw.decode("utf-8")
        encoding = "utf-8"
    except UnicodeDecodeError:
        content = base64.b64encode(raw).decode()
        encoding = "base64"
    blob = api("POST", "git/blobs", {"content": content, "encoding": encoding})
    tree_items.append({"path": filepath, "mode": "100644", "type": "blob", "sha": blob["sha"]})
    print(f"  {filepath}", flush=True)

new_tree = api("POST", "git/trees", {"base_tree": PARENT_TREE, "tree": tree_items})
new_commit = api("POST", "git/commits", {
    "message": MSG + "\n\nCo-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>",
    "tree": new_tree["sha"], "parents": [PARENT_SHA]
})
api("PATCH", "git/refs/heads/main", {"sha": new_commit["sha"], "force": True})
print(f"\n✓ Pushed: {new_commit['sha'][:8]}", flush=True)
print(f"  GitHub Actions will now deploy to Fly automatically.")
PYEOF
