package expo.modules.applimiter

import android.accessibilityservice.AccessibilityService
import android.app.KeyguardManager
import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.os.PowerManager
import android.os.SystemClock
import android.view.accessibility.AccessibilityEvent
import android.view.inputmethod.InputMethodManager
import android.widget.Toast

/**
 * Watches which app is in the foreground, counts the time spent in limited apps and covers an app with
 * [BlockActivity] when it may not be used. Only window changes are observed; screen content is never read.
 */
class LimiterService : AccessibilityService() {
  private val handler = Handler(Looper.getMainLooper())
  private val recheck = Runnable { tick() }

  /** Package currently in the foreground (ignoring the keyboard and system UI overlays). */
  private var foreground: String? = null

  /** Limited package whose time is being counted, and the elapsedRealtime up to which it is already stored. */
  private var tracked: String? = null
  private var lastCommit = 0L

  /** "day|rule|extra" keys already warned about, so each allowance warns once. */
  private val warned = HashSet<String>()

  private val screenReceiver = object : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
      when (intent.action) {
        // Screen off doesn't count as usage.
        Intent.ACTION_SCREEN_OFF -> stopTracking()
        // tick() itself waits for the keyguard to go away.
        Intent.ACTION_SCREEN_ON, Intent.ACTION_USER_PRESENT -> tick()
      }
    }
  }

  override fun onServiceConnected() {
    super.onServiceConnected()
    instance = this
    val filter = IntentFilter().apply {
      addAction(Intent.ACTION_SCREEN_OFF)
      addAction(Intent.ACTION_SCREEN_ON)
      addAction(Intent.ACTION_USER_PRESENT)
    }
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
      registerReceiver(screenReceiver, filter, Context.RECEIVER_NOT_EXPORTED)
    } else {
      registerReceiver(screenReceiver, filter)
    }
  }

  override fun onAccessibilityEvent(event: AccessibilityEvent) {
    if (event.eventType != AccessibilityEvent.TYPE_WINDOW_STATE_CHANGED) return
    val pkg = event.packageName?.toString() ?: return
    if (pkg == foreground || isOverlay(pkg)) return
    stopTracking()
    foreground = pkg
    tick()
  }

  override fun onInterrupt() {}

  override fun onDestroy() {
    stopTracking()
    if (instance === this) instance = null
    runCatching { unregisterReceiver(screenReceiver) }
    super.onDestroy()
  }

  /** The block screen let `pkg` through; it returns to the front without a reliable window event. */
  fun onUnblocked(pkg: String) {
    stopTracking()
    foreground = pkg
    tick()
  }

  /** Keyboards and the notification shade appear on top of an app without leaving it. */
  private fun isOverlay(pkg: String): Boolean {
    if (pkg == "com.android.systemui") return true
    val imm = getSystemService(Context.INPUT_METHOD_SERVICE) as InputMethodManager
    return imm.enabledInputMethodList.any { it.packageName == pkg }
  }

  private fun inUse(): Boolean {
    val power = getSystemService(Context.POWER_SERVICE) as PowerManager
    val keyguard = getSystemService(Context.KEYGUARD_SERVICE) as KeyguardManager
    return power.isInteractive && !keyguard.isKeyguardLocked
  }

  /** Stores the time since the last commit. Called on every tick, so a killed service loses at most one tick. */
  private fun commit() {
    val pkg = tracked ?: return
    val now = SystemClock.elapsedRealtime()
    // A tick is never later than MAX_TICK_MS; anything much longer means the device slept in between.
    LimiterStore.addUsage(this, pkg, (now - lastCommit).coerceIn(0L, 2 * Limits.MAX_TICK_MS))
    lastCommit = now
  }

  private fun stopTracking() {
    handler.removeCallbacks(recheck)
    commit()
    tracked = null
  }

  private fun tick() {
    handler.removeCallbacks(recheck)
    val pkg = foreground ?: return
    if (pkg == packageName || !inUse()) return
    commit()
    when (val d = LimiterStore.decide(this, pkg)) {
      is Decision.Block -> block(pkg, d.reason)
      is Decision.Allow -> {
        if (d.rule == null) {
          tracked = null
        } else if (tracked == null) {
          tracked = pkg
          lastCommit = SystemClock.elapsedRealtime()
        }
        warnIfNearlyOut(d)
        d.recheckMs?.let { handler.postDelayed(recheck, it.coerceAtLeast(250L)) }
      }
    }
  }

  /**
   * Covers the app with BlockActivity. No GLOBAL_ACTION_HOME here: the home screen arrives asynchronously and
   * would cover BlockActivity right after it opens. BlockActivity's Close/back go home instead.
   */
  private fun block(pkg: String, reason: Reason) {
    stopTracking()
    // Forget the foreground, so returning to the app raises a "changed" event and it is blocked again.
    foreground = null
    startActivity(
      Intent(this, BlockActivity::class.java)
        .putExtra(BlockActivity.EXTRA_PACKAGE, pkg)
        .putExtra(BlockActivity.EXTRA_REASON, reason.name)
        .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP),
    )
  }

  private fun warnIfNearlyOut(d: Decision.Allow) {
    val rule = d.rule ?: return
    val remaining = d.remainingMs ?: return
    val warnMs = LimiterStore.warnMinutes(this) * 60_000L
    if (warnMs <= 0 || remaining > warnMs) return
    val key = "${LimiterStore.today()}|${rule.id}|${LimiterStore.extra(this)[rule.id] ?: 0L}"
    if (warned.size > 100) warned.clear()
    if (!warned.add(key)) return
    val title = "${rule.name}: ${Limits.formatDuration(remaining)} left"
    Toast.makeText(this, title, Toast.LENGTH_LONG).show()
    notify(title)
  }

  private fun notify(title: String) {
    val manager = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
    if (!manager.areNotificationsEnabled()) return
    val builder = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
      manager.createNotificationChannel(
        NotificationChannel(CHANNEL, "Time limit warnings", NotificationManager.IMPORTANCE_HIGH),
      )
      Notification.Builder(this, CHANNEL).setTimeoutAfter(60_000L)
    } else {
      @Suppress("DEPRECATION")
      Notification.Builder(this).setPriority(Notification.PRIORITY_HIGH)
    }
    val notification = builder
      .setSmallIcon(R.drawable.app_limiter_notification)
      .setContentTitle(title)
      .setContentText("The app will be blocked when the time runs out.")
      .setAutoCancel(true)
      .build()
    runCatching { manager.notify(1, notification) }
  }

  companion object {
    private const val CHANNEL = "limit_warning"

    /** The running service, if any (same process as the block screen). */
    @Volatile
    var instance: LimiterService? = null
      private set
  }
}
