# Mobile push notifications

Start with `../../../../api/server/notifications/README.md` for the complete flow, migration and activation checklist.

- `client.ts`: capability gate, installation identity, OS permission, Expo token and authenticated registration.
- `PushNotifications.tsx`: root lifecycle integration, token refresh, foreground cache refresh and safe notification-tap routes.
- `NotificationSettings.tsx`: separate catalogue opt-in and explicit OS permission action, mounted in Account.
- `payload.ts`: validates event identifiers; never navigates to an arbitrary URL from a push payload.

Flags default inactive. Set `EXPO_PUBLIC_PUSH_ENABLED=true` for a configured Android native build. Keep `EXPO_PUBLIC_IOS_PUSH_ENABLED` unset/false until paid Apple/APNs activation and an iOS rebuild/test. Expo Go skips the native notification module. The existing foreground order refresh/toasts remain available when remote push is off.

A login session owns each registration. Backend logout deletes the session and cascades its registrations. Foregrounding checks permission again and updates/removes registration; OS revocation while the app is closed is also handled through provider errors. Permission is requested only through explicit user action, not automatically at login. Product alerts require a separate opt-in, default false.
