package expo.modules.applimiter

import android.app.NotificationManager
import android.app.admin.DevicePolicyManager
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.graphics.Bitmap
import android.graphics.Canvas
import android.net.Uri
import android.os.PowerManager
import android.provider.Settings
import expo.modules.kotlin.exception.CodedException
import expo.modules.kotlin.exception.Exceptions
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import expo.modules.kotlin.records.Field
import expo.modules.kotlin.records.Record
import java.io.File
import java.io.FileOutputStream
import java.util.UUID

class RuleRecord : Record {
  @Field var id: String = ""
  @Field var name: String = ""
  @Field var packages: List<String> = emptyList()
  @Field var minutesByDay: List<Int> = emptyList()
  @Field var enabled: Boolean = true
}

class BedtimeRecord : Record {
  @Field var enabled: Boolean = false
  @Field var startMinute: Int = 21 * 60
  @Field var endMinute: Int = 7 * 60
}

/**
 * JS API of the limiter. Everything that changes the configuration needs the session token handed out for the
 * correct password, so the password check does not live in JS only.
 */
class AppLimiterModule : Module() {
  private val context: Context
    get() = appContext.reactContext ?: throw Exceptions.ReactContextLost()

  /** Token of the current unlocked session; null while the app is locked. */
  private var session: String? = null

  private fun newSession(): String = UUID.randomUUID().toString().also { session = it }

  private fun requireSession(token: String) {
    if (session == null || token != session) throw CodedException("ERR_LOCKED", "The limiter is locked", null)
  }

  private fun open(intent: Intent) {
    // The system screens belong to Settings, which is normally locked: let the parent through for a few minutes.
    LimiterStore.unlockSystem(context)
    context.startActivity(intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
  }

  private fun admin() = ComponentName(context, AdminReceiver::class.java)

  private fun isServiceEnabled(): Boolean {
    val enabled = Settings.Secure.getString(context.contentResolver, Settings.Secure.ENABLED_ACCESSIBILITY_SERVICES)
      ?: return false
    val service = ComponentName(context, LimiterService::class.java)
    return enabled.split(':').any { ComponentName.unflattenFromString(it) == service }
  }

  /** Renders the launcher icon once into the cache and returns its file URI (null if it can't be drawn). */
  private fun iconUri(pkg: String): String? = runCatching {
    val dir = File(context.cacheDir, "app-icons").apply { mkdirs() }
    val file = File(dir, "$pkg.png")
    if (!file.exists()) {
      val size = 96
      val bitmap = Bitmap.createBitmap(size, size, Bitmap.Config.ARGB_8888)
      val drawable = context.packageManager.getApplicationIcon(pkg)
      drawable.setBounds(0, 0, size, size)
      drawable.draw(Canvas(bitmap))
      FileOutputStream(file).use { bitmap.compress(Bitmap.CompressFormat.PNG, 100, it) }
    }
    Uri.fromFile(file).toString()
  }.getOrNull()

  override fun definition() = ModuleDefinition {
    Name("AppLimiter")

    // --- password and session ---

    Function("hasPassword") { LimiterStore.hasPassword(context) }

    /** First run only: sets the master password and returns a session token. */
    AsyncFunction("createPassword") { password: String ->
      if (LimiterStore.hasPassword(context)) throw CodedException("ERR_PASSWORD_EXISTS", "A password is already set", null)
      LimiterStore.setPassword(context, password)
      newSession()
    }

    /** Checks the password; on success `token` opens a session. */
    AsyncFunction("unlock") { password: String ->
      val check = LimiterStore.checkPassword(context, password)
      mapOf(
        "ok" to check.ok,
        "token" to if (check.ok) newSession() else null,
        "waitMs" to check.waitMs.toDouble(),
        "attemptsLeft" to check.attemptsLeft,
      )
    }

    AsyncFunction("changePassword") { token: String, password: String ->
      requireSession(token)
      LimiterStore.setPassword(context, password)
    }

    Function("lock") { session = null }

    // --- state ---

    Function("getState") {
      val ctx = context
      mapOf(
        "rules" to LimiterStore.rules(ctx).map {
          mapOf(
            "id" to it.id,
            "name" to it.name,
            "packages" to it.packages,
            "minutesByDay" to it.minutesByDay,
            "enabled" to it.enabled,
          )
        },
        "bedtime" to LimiterStore.bedtime(ctx).let {
          mapOf("enabled" to it.enabled, "startMinute" to it.startMinute, "endMinute" to it.endMinute)
        },
        "lockSettings" to LimiterStore.lockSettings(ctx),
        "lockedPackages" to LimiterStore.lockedPackages(ctx).toList(),
        "warnMinutes" to LimiterStore.warnMinutes(ctx),
        "pauseUntil" to LimiterStore.pauseUntil(ctx).toDouble(),
        "day" to LimiterStore.today(),
        "usage" to LimiterStore.usage(ctx).mapValues { it.value.toDouble() },
        "extra" to LimiterStore.extra(ctx).mapValues { it.value.toDouble() },
      )
    }

    /** Usage per day (oldest first), up to the last `days` recorded days. */
    Function("getUsage") { days: Int ->
      LimiterStore.usageHistory(context).takeLast(days).map { (day, usage) ->
        mapOf("day" to day, "usage" to usage.mapValues { it.value.toDouble() })
      }
    }

    Function("getStatus") {
      val ctx = context
      val dpm = ctx.getSystemService(Context.DEVICE_POLICY_SERVICE) as DevicePolicyManager
      val power = ctx.getSystemService(Context.POWER_SERVICE) as PowerManager
      val notifications = ctx.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
      mapOf(
        "serviceEnabled" to isServiceEnabled(),
        "adminActive" to dpm.isAdminActive(admin()),
        "batteryExempt" to power.isIgnoringBatteryOptimizations(ctx.packageName),
        "notificationsAllowed" to notifications.areNotificationsEnabled(),
      )
    }

    AsyncFunction("getLaunchableApps") {
      val pm = context.packageManager
      val launcher = Intent(Intent.ACTION_MAIN).addCategory(Intent.CATEGORY_LAUNCHER)
      pm.queryIntentActivities(launcher, 0)
        .map { it.activityInfo.packageName to it.loadLabel(pm).toString() }
        .filter { (pkg, _) -> pkg != context.packageName }
        .distinctBy { (pkg, _) -> pkg }
        .sortedBy { (_, label) -> label.lowercase() }
        .map { (pkg, label) -> mapOf("packageName" to pkg, "label" to label, "icon" to iconUri(pkg)) }
    }

    // --- configuration (session required) ---

    Function("saveRule") { token: String, rule: RuleRecord ->
      requireSession(token)
      val minutes = List(7) { (rule.minutesByDay.getOrNull(it) ?: 0).coerceIn(0, 24 * 60) }
      LimiterStore.saveRule(context, Rule(rule.id, rule.name, rule.packages.distinct(), minutes, rule.enabled))
    }

    Function("deleteRule") { token: String, id: String ->
      requireSession(token)
      LimiterStore.deleteRule(context, id)
    }

    Function("setBedtime") { token: String, bedtime: BedtimeRecord ->
      requireSession(token)
      LimiterStore.setBedtime(context, Bedtime(bedtime.enabled, bedtime.startMinute, bedtime.endMinute))
    }

    Function("setLocked") { token: String, lockSettings: Boolean, packages: List<String> ->
      requireSession(token)
      LimiterStore.setLocked(context, lockSettings, packages)
    }

    Function("setWarnMinutes") { token: String, minutes: Int ->
      requireSession(token)
      LimiterStore.setWarnMinutes(context, minutes)
    }

    /** Switches every limit off until `until` (epoch ms); 0 resumes. */
    Function("pauseLimits") { token: String, until: Double ->
      requireSession(token)
      LimiterStore.setPauseUntil(context, until.toLong())
    }

    /** Adds time to a rule for today. */
    Function("grantExtra") { token: String, ruleId: String, minutes: Int ->
      requireSession(token)
      LimiterStore.addExtra(context, ruleId, minutes.coerceIn(0, 24 * 60) * 60_000L)
    }

    // --- system screens (session required) ---

    Function("openAccessibilitySettings") { token: String ->
      requireSession(token)
      open(Intent(Settings.ACTION_ACCESSIBILITY_SETTINGS))
    }

    // Android 13+ hides accessibility for sideloaded apps until "Allow restricted settings" is enabled here.
    Function("openAppSettings") { token: String ->
      requireSession(token)
      open(Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, Uri.parse("package:${context.packageName}")))
    }

    Function("requestAdmin") { token: String ->
      requireSession(token)
      open(
        Intent(DevicePolicyManager.ACTION_ADD_DEVICE_ADMIN)
          .putExtra(DevicePolicyManager.EXTRA_DEVICE_ADMIN, admin())
          .putExtra(
            DevicePolicyManager.EXTRA_ADD_EXPLANATION,
            "Prevents Max App Limiter from being uninstalled without the password.",
          ),
      )
    }

    /** Needed before the app can be uninstalled. */
    Function("removeAdmin") { token: String ->
      requireSession(token)
      (context.getSystemService(Context.DEVICE_POLICY_SERVICE) as DevicePolicyManager).removeActiveAdmin(admin())
    }

    Function("requestIgnoreBatteryOptimizations") { token: String ->
      requireSession(token)
      open(Intent(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS, Uri.parse("package:${context.packageName}")))
    }
  }
}
