# Guided demo entry

21 September 2026. The guided tour is the public landing page, before any private network exists.

- `/` and `/demos/` immediately show the approved hero, tour chapters and company selector. Page views and company selection do not create a sandbox.
- **Start guided tour** scrolls to Part One and starts or resumes the visitor's private sandbox. **Get 100 tokenized [company]** does the same preparation and then continues with the selected company exactly once. Neither requires a separate start screen.
- Put the private-network disclosure, 15-minute lifetime, startup status and actionable errors beneath the hero. Keep failures visible without hiding the tour.
- Initial load may read an existing session. Resume a ready session without resetting its progress. A new session starts only after an explicit user action; expiry or an uncertain response must not silently create one.
- Rapid clicks and overlapping calls share one start operation. Reconcile an uncertain mutation with reads, never an automatic repeated mutation. Ignore stale session/runtime responses after expiry or replacement.
- Expiry/reset clears old wallet state and pending actions. Preserve the company choice, but never replay stock preparation or transactions automatically. Restarting a completed journey returns to Part One.
- Keep the local guided runtime and the separate `/sandbox/` wallet gate working. No simulated UI balances may stand in for a ready runtime.

This change does not remove hosting quotas. Static browsing and active private computation have separate capacity needs. See the [launch capacity audit](../planning/research/guided-launch-capacity-2026-09-21.md). Changes to paid capacity require an explicit bounded target and verification; the accepted runtime snapshot remains unchanged for this frontend-only change.
