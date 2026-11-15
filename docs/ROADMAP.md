# Roadmap

Version 1 covers: master password, per-app and group limits, weekday/weekend and per-day schedules, bedtime,
block screen with password-protected extra time, warning before the end, usage statistics, pause, locked apps,
uninstall protection.

## Before relying on it

The blocking approach has not been run on a real device yet. Check on the target phone:

- [ ] The accessibility service can be enabled (restricted settings on Android 13+).
- [ ] A 1-minute limit: the warning appears, then the block screen.
- [ ] "More time" with the right password returns to the app and counting continues.
- [ ] Five wrong passwords start the 30-second wait.
- [ ] Settings and the uninstall dialog show the block screen.
- [ ] Bedtime blocks a limited app and leaves other apps alone.
- [ ] Usage starts from zero after midnight.
- [ ] The service is still running the next morning (battery optimisation).

## Ideas

- **Fingerprint unlock** for the parent, instead of typing the password.
- **Launch-count limits**: open an app at most N times a day.
- **Website limits** inside browsers (needs reading the address bar through accessibility).
- **Recovery code** shown once at setup, for a forgotten password.
- **Export / import** of the configuration.
- **Weekly summary** notification with the week's usage.
- **Ask for time**: the child sends a request and the parent approves it on their own phone (needs a backend).
- **Reward time**: extra minutes earned by finishing a task the parent confirms.
- **Count all apps** in the statistics, not only limited ones (UsageStats permission).
- **Picture-in-picture and split screen** detection.
