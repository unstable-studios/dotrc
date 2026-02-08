#!/bin/bash
# Usage: ./scripts/batch-issues.sh 42 43 44 45
#   or:  ./scripts/batch-issues.sh $(gh issue list --label bug --json number -q '.[].number')
#
# Launches Claude Code in headless mode to implement each issue as stacked PRs.
# Output is logged to ./logs/batch-<timestamp>.log

set -euo pipefail

if [ $# -eq 0 ]; then
  echo "Usage: $0 <issue-number> [issue-number ...]"
  echo "  e.g. $0 42 43 44 45"
  echo "  e.g. $0 \$(gh issue list --label bug --json number -q '.[].number')"
  exit 1
fi

ISSUES="$*"
REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
LOG_DIR="$REPO_ROOT/logs"
TIMESTAMP="$(date +%Y%m%d-%H%M%S)"
LOG_FILE="$LOG_DIR/batch-$TIMESTAMP.log"

mkdir -p "$LOG_DIR"

echo "Starting batch issue processing at $(date)" | tee "$LOG_FILE"
echo "Issues: $ISSUES" | tee -a "$LOG_FILE"
echo "Log: $LOG_FILE" | tee -a "$LOG_FILE"
echo "---" | tee -a "$LOG_FILE"

cd "$REPO_ROOT"

claude -p "
You have the following GitHub issues to implement as stacked PRs: $ISSUES

Work through them in the order listed. Follow the 'Autonomous Issue Workflow' instructions in CLAUDE.md exactly.

Start by reading all the issues with gh issue view, then plan your ordering and begin implementation.

When finished, print a summary table of:
- Issue number
- PR URL (or 'skipped' with reason)
- Branch name
" --verbose --output-format stream-json 2>&1 | tee -a "$LOG_FILE"

echo "" | tee -a "$LOG_FILE"
echo "Batch complete at $(date)" | tee -a "$LOG_FILE"
