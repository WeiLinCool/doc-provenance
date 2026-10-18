# AGENTS.md - Archived Agent Notes

Archived triplets are frozen historical snapshots. Never edit, translate, or delete them.

To archive a note, move its complete triplet into archived/{class}/, insert `Archived: YYYY-MM-DD` immediately below the status line in both language files, re-record the sidecar, and delete the implemented/ copies. Those are the only permitted header changes; `verify_archived_agent_notes` hashes the result, so any later edit is a violation rather than a diff.
