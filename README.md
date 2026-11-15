# Max App Limiter

An Android app for limiting how long other apps can be used each day. You set a master password, choose apps and
give each one (or a group of them) a daily allowance, for example YouTube 20 minutes. When the time is used up
the app is covered by a block screen. More time can be granted from that screen, but only with the password.
Allowances reset at midnight.

## Features

- Daily time limit per app, or one shared limit for a group of apps.
- Different limits for weekdays and weekends, or for each day of the week.
- Bedtime: a nightly window in which every limited app is blocked.
- Block screen with "More time" (5, 15, 30, 60 minutes or the rest of today) behind the master password.
- Warning shortly before a limit runs out.
- Usage for today and the last 7 days.
- Pause all limits for an hour or the rest of the day.
- Protection against bypassing: the app itself is password-locked, Settings and the app installer need the
  password, and the app can be made a device admin so it can't be uninstalled.

## Setting it up on the phone

1. Build and install the APK (see below) and open the app.
2. Create the master password. It cannot be recovered, so write it down.
3. On the Limits tab, tap **Open Accessibility settings** and turn on **Max App Limiter: app time limits**.
   If the entry is greyed out (Android 13 and later, for apps not installed from a store): open **App info**,
   tap **⋮**, choose **Allow restricted settings**, then try again.
4. In Settings inside the app, turn on **Uninstall protection**, allow **Run without battery limits** and
   **Notifications**.
5. Add limits.

## Building

Requirements: Node 22, JDK 17 or newer, Android SDK.

```bash
npm install
npm run android                                         # build and install on a connected device (debug)
npx eas-cli@latest build -p android --profile preview   # standalone APK built by EAS
```

Checks: `npm test`, `npm run typecheck`, `npm run lint`.

## Known limits

- Restarting the phone in **safe mode** switches off every app of this kind. It is also the way to remove the
  app if the password is lost: in safe mode, turn off the device admin and uninstall it.
- Apps shown in picture-in-picture or split screen may not be detected.
- Some phones (for example Xiaomi and Huawei) stop background services aggressively. Allow the app to run
  without battery limits, and check the vendor's own autostart setting.
- Uninstalling through the Play Store is not covered by the Settings lock. Add Play Store to the locked apps,
  or turn on uninstall protection.
- Only apps that have a limit are counted in the usage statistics.
