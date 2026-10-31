# Shared mobile order refresh

Implemented 28 October 2026. Order reads now share one scheduler and request coordinator. This removes redundant polling without introducing SSE or changing backend payment/checkout rules.

## Before

Four independent timers existed: root order notifications, the Orders screen, order detail, and checkout's pending-payment state. Notifications and Orders fetched the same list every 15 seconds. Screen timers stopped on unmount, which did not guarantee they stopped when a screen lost focus. Checkout's timer continued while a pending order ID existed, including after the payment sheet closed. Notification reads did not update the screen store; checkout maintained a separate order copy.

## Step 1: centralize reads and state

`features/order/readCoordinator.ts` owns in-flight reads keyed by list or order ID. Automatic refresh, manual refresh and notifications join the same promise for the same resource. Successful reads are fresh for 15 seconds when a screen subscribes/returns. Manual refresh bypasses freshness but still joins any in-flight request.

`features/order/store.ts` remains the shared order cache. Notifications now observe its changes rather than calling the API independently. Checkout selects its pending order from that store by ID. The Orders screen tracks authoritative list membership separately from cached detail records, so preserving an off-list detail does not fabricate list entries.

## Step 2: give polling one owner

One scheduler serves all active subscribers at the existing 15-second cadence. A set of list subscribers produces one list refresh per tick; each distinct detail ID has its own read. A slow request is shared on later ticks rather than overlapped. When the last subscriber for a resource leaves, its pending read is canceled. When there are no subscribers, there is no timer.

The root component enables scheduling only while logged in and React Native AppState is active. Background/inactive transitions clear the timer and abort pending reads. Return to the foreground revalidates stale resources; fresh successful results can be reused. Logout/account reset cancels reads and clears private order state. Session checks that switch users also reset private state.

Screen subscriptions use Expo Router's focus lifecycle. Hidden-but-mounted screens therefore do not keep their own subscription. Disabling notifications removes the root list subscription, but an actively viewed Orders screen may still fetch its own orders. Disabling notifications does not mean disabling order viewing.

References: [Expo Router SDK 58](https://docs.expo.dev/versions/v58.0.0/sdk/router/), [React Native AppState](https://reactnative.dev/docs/appstate).

## Step 3: keep distinct endpoints where needed

Order detail includes payment instructions and server-owned payment eligibility; the list does not. Detail/payment-sheet subscriptions remain separate from the list subscription. A notification list refresh and a detail refresh are different resources, not requests that can be blindly replaced by each other.

List merges retain previously fetched payment details only if the order's status, payment status, total and known update timestamp are unchanged. A changed order drops those cached instructions until detail is revalidated. Explicit server responses such as account=null replace cached instructions. The payment sheet subscribes only while actually visible with account data. A refresh error hides it and stops that subscription; reopening via checkout revalidates with the server.

## Step 4: guard against stale responses

Reads carry a generation and request sequence. Cancellation is best-effort at the network layer, but even a transport that later completes cannot commit an aborted/old generation. A slow older list result cannot overwrite a newer detail result for the same order. Session ownership is checked again while committing cache updates.

Checkout creation and transfer reporting invalidate in-flight reads before/after successful mutation commits, preventing an older response from undoing a newer local mutation. They retain existing authenticated API/session guards and checkout idempotency behavior. No automatic write retries were added.

Their authoritative detail response also starts the detail freshness window, avoiding an immediate duplicate GET when the payment sheet or order detail opens just after the successful mutation.

Client abort does not guarantee a request already received by the server stops executing SQL. This change prevents new scheduled requests while inactive and prevents late results from entering the UI; server-side query deadlines remain a separate protection.

## Step 5: preserve recovery and controls

Orders and detail views provide pull-to-refresh; error/empty states have a Retry action. Request loading and error state are scoped to the list/order ID, so a notification-list failure does not overwrite a detail error or vice versa. Failed reads retain last successful data, clear loading state, and allow immediate retry. There is no loop of immediate automatic retries; subsequent scheduled/manual refreshes can recover.

Notifications compare statuses from shared cache updates and avoid repeating a toast for unchanged state. They operate only while notifications are enabled, the owning user is current and the app is active. This remains foreground polling, not background push delivery.

## Expected request impact

| Situation | Previous behavior | New behavior |
| --- | --- | --- |
| Notifications + visible Orders list | Two list requests per interval | One shared list request per interval |
| Hidden Orders screen | Could retain its timer while mounted | No screen subscription |
| Closed checkout payment sheet | Pending ID could keep detail timer alive | No payment-sheet subscription |
| App backgrounded | Some timers continued attempting reads | No scheduled order reads; pending reads aborted |
| Notifications disabled, no order screen visible | Notification timer stopped, but mounted screens could still poll | No order subscribers/timer |
| Notifications + visible order detail | List and detail reads | List and detail reads still needed for different data |

For the duplicate-list case, steady-state cadence falls from approximately 480 to 240 list requests/hour, excluding manual actions, initial loads, failures and navigation. It is not a claim that every app scenario uses 50% less bandwidth or that all private polling disappears. Active global notifications still query the backend every 15 seconds. SSE and conditional requests remain separate opportunities.

## Verification

- Mobile TypeScript and Expo lint pass.
- **22 mobile tests pass**, including existing authenticated API/session tests and ten order-coordination/merge tests.
- The deterministic scheduler model recorded five list calls in a simulated minute (initial plus four ticks) for two subscribers, rather than two separate five-call streams. This is a modeled request count, not physical-device HTTP telemetry.
- Tests cover overlapping manual/automatic reads, stale revalidation, out-of-order completion, session/reset during async commit, mutation invalidation, retained data and retry after errors, background/logout cancellation, unsubscribe behavior, slow requests and payment-detail merging.
- Android production export passed through Metro/React Compiler, written to a temporary local output directory. No build was uploaded or published.

Reproduce the tests from `api/`, using its existing TypeScript test loader:

```sh
node --import tsx --test --test-isolation=none ../mobile/tests/*.test.ts
```

## Remaining checks

Use a real device to verify navigation/focus, notification preference changes, background/foreground, slow/offline connections, logout/account switch, payment-sheet closure/reopen and pull-to-refresh. Record actual requests and bytes transferred for the same user journey before making bandwidth/Neon compute savings claims. iOS device behavior and live backend load were not exercised by the Android export or pure scheduler tests.

Backend customer order listing still returns its existing latest-100 dataset. This task neither adds customer order-history pagination nor changes support-chat polling. SSE implementation, managed-service activation and deployment capacity retesting remain pending.
