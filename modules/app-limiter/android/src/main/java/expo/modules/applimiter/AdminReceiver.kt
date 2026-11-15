package expo.modules.applimiter

import android.app.admin.DeviceAdminReceiver

/** Device admin with no policies: its only effect is that Android won't uninstall the app while it is active. */
class AdminReceiver : DeviceAdminReceiver()
