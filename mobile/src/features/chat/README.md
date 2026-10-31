# Mobile Chat and Disputes

Read `api/features/chat/README.md` for policy, transactions, schema and activation.

- `ChatScreen.tsx`: Chat/Disputes tabs, persisted HTTP messaging, paid-order case entry and evidence links.
- `ResolutionChoice.tsx`: server-timed 20-minute resolution selector, reused in order return details.
- `types.ts`: view contracts.
- `src/app/chat/index.tsx`: account-keyed entrypoint; bottom navigation and old support callers point here.

No WebSockets yet. Focus/foreground/manual refresh obtains replies; background/blur aborts reads. There is no periodic chat API timer. The local countdown does not authorize money movement; server deadlines and transactional financial checks remain authoritative. Evidence links and private gallery uploads are supported. Local drafts and persistent selected files are grouped in ../uploads; see api/features/uploads/README.md for lifecycle, configuration and verification limits.

History now uses 20-message cursors with Load older messages; customer conversation lists are cursor-paged. New local request diagnostics and optional order/catalogue SSE are described in architecture/review-next/WALKTHROUGH.md. Chat WebSockets remain unimplemented pending provider/product review.
