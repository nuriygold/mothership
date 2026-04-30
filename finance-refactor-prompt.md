# Finance System Refactor Prompt

Introduce financial primitives for the mothership repo.

Goals:
- Add Drizzle tables: Account, Transaction, Payable
- Remove task-derived financial logic
- Stabilize Finance overview API

Implementation notes:
- Update the Drizzle schema with the new tables
- Regenerate the Drizzle migrations
- Update any services or API routes referencing finance data
- Ensure migrations are created and checked in

This file stores the implementation prompt used for the refactor work.
