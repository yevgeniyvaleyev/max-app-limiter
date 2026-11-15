package expo.modules.applimiter

import android.content.Context
import android.content.SharedPreferences
import android.util.Base64
import java.security.MessageDigest
import java.security.SecureRandom
import java.util.TimeZone
import javax.crypto.SecretKeyFactory
import javax.crypto.spec.PBEKeySpec
import org.json.JSONArray
import org.json.JSONObject

/** Result of a password check. `waitMs` > 0 means too many wrong tries: nothing was checked. */
data class PasswordCheck(val ok: Boolean, val waitMs: Long, val attemptsLeft: Int)

/**
 * The single source of truth for rules, usage, grants and the password. It lives in SharedPreferences so the
 * accessibility service and the block screen work while the React Native app is not running.
 */
object LimiterStore {
  private const val PREFS = "max_app_limiter"
  private const val KEEP_DAYS = 30
  private const val PBKDF2_ITERATIONS = 60_000
  private const val FREE_ATTEMPTS = 5
  private const val LOCKOUT_BASE_MS = 30_000L
  private const val LOCKOUT_MAX_MS = 15 * 60_000L

  /** How long opening a system screen from inside the unlocked app keeps Settings usable. */
  const val SYSTEM_UNLOCK_MS = 5 * 60_000L

  /** Settings and the installers: where the app could be uninstalled, stopped or switched off, or the date changed. */
  val SYSTEM_PACKAGES = setOf(
    "com.android.settings",
    "com.google.android.packageinstaller",
    "com.android.packageinstaller",
  )

  private fun prefs(ctx: Context): SharedPreferences = ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE)

  fun now(): Long = System.currentTimeMillis()

  fun today(): String = Limits.dayKey(now(), TimeZone.getDefault())

  // --- rules and settings ---

  fun rules(ctx: Context): List<Rule> {
    val arr = JSONArray(prefs(ctx).getString("rules", "[]"))
    return (0 until arr.length()).map { i ->
      val o = arr.getJSONObject(i)
      val pkgs = o.getJSONArray("packages")
      val mins = o.getJSONArray("minutesByDay")
      Rule(
        id = o.getString("id"),
        name = o.getString("name"),
        packages = (0 until pkgs.length()).map { pkgs.getString(it) },
        minutesByDay = (0 until mins.length()).map { mins.getInt(it) },
        enabled = o.optBoolean("enabled", true),
      )
    }
  }

  private fun writeRules(ctx: Context, rules: List<Rule>) {
    val arr = JSONArray()
    for (r in rules) {
      arr.put(
        JSONObject()
          .put("id", r.id)
          .put("name", r.name)
          .put("packages", JSONArray(r.packages))
          .put("minutesByDay", JSONArray(r.minutesByDay))
          .put("enabled", r.enabled),
      )
    }
    prefs(ctx).edit().putString("rules", arr.toString()).apply()
  }

  /** Adds or replaces a rule. An app belongs to one rule only: it is removed from the others, and empty rules go. */
  @Synchronized
  fun saveRule(ctx: Context, rule: Rule) {
    val existing = rules(ctx)
    val others = existing
      .filter { it.id != rule.id }
      .map { it.copy(packages = it.packages - rule.packages.toSet()) }
      .filter { it.packages.isNotEmpty() }
    val index = existing.indexOfFirst { it.id == rule.id }.coerceAtMost(others.size)
    writeRules(ctx, if (index < 0) others + rule else others.toMutableList().apply { add(index, rule) })
  }

  @Synchronized
  fun deleteRule(ctx: Context, id: String) = writeRules(ctx, rules(ctx).filter { it.id != id })

  fun bedtime(ctx: Context): Bedtime {
    val p = prefs(ctx)
    return Bedtime(p.getBoolean("bedtimeEnabled", false), p.getInt("bedtimeStart", 21 * 60), p.getInt("bedtimeEnd", 7 * 60))
  }

  fun setBedtime(ctx: Context, b: Bedtime) {
    prefs(ctx).edit()
      .putBoolean("bedtimeEnabled", b.enabled)
      .putInt("bedtimeStart", b.startMinute.coerceIn(0, 1439))
      .putInt("bedtimeEnd", b.endMinute.coerceIn(0, 1439))
      .apply()
  }

  fun lockSettings(ctx: Context): Boolean = prefs(ctx).getBoolean("lockSettings", true)

  fun lockedPackages(ctx: Context): Set<String> = prefs(ctx).getStringSet("lockedPackages", emptySet())?.toSet() ?: emptySet()

  fun setLocked(ctx: Context, lockSettings: Boolean, packages: Collection<String>) {
    prefs(ctx).edit().putBoolean("lockSettings", lockSettings).putStringSet("lockedPackages", packages.toSet()).apply()
  }

  fun warnMinutes(ctx: Context): Int = prefs(ctx).getInt("warnMinutes", 5)

  fun setWarnMinutes(ctx: Context, minutes: Int) = prefs(ctx).edit().putInt("warnMinutes", minutes.coerceIn(0, 60)).apply()

  fun pauseUntil(ctx: Context): Long = prefs(ctx).getLong("pauseUntil", 0L)

  fun setPauseUntil(ctx: Context, until: Long) = prefs(ctx).edit().putLong("pauseUntil", until).apply()

  // --- per-day counters: { "2026-11-16": { "key": ms } } ---

  private fun dayMaps(ctx: Context, key: String): JSONObject = JSONObject(prefs(ctx).getString(key, "{}"))

  private fun toMap(o: JSONObject?): Map<String, Long> {
    if (o == null) return emptyMap()
    val out = HashMap<String, Long>()
    for (k in o.keys()) out[k] = o.optLong(k, 0L)
    return out
  }

  private fun addToDay(ctx: Context, key: String, entry: String, ms: Long) {
    val all = dayMaps(ctx, key)
    val day = today()
    val map = all.optJSONObject(day) ?: JSONObject()
    map.put(entry, map.optLong(entry, 0L) + ms)
    all.put(day, map)
    // Day keys sort chronologically; drop the oldest beyond the history window.
    val days = all.keys().asSequence().toList().sorted()
    for (old in days.dropLast(KEEP_DAYS)) all.remove(old)
    prefs(ctx).edit().putString(key, all.toString()).apply()
  }

  fun usage(ctx: Context, day: String = today()): Map<String, Long> = toMap(dayMaps(ctx, "usage").optJSONObject(day))

  /** All recorded days, oldest first. */
  fun usageHistory(ctx: Context): List<Pair<String, Map<String, Long>>> {
    val all = dayMaps(ctx, "usage")
    return all.keys().asSequence().toList().sorted().map { it to toMap(all.optJSONObject(it)) }
  }

  @Synchronized
  fun addUsage(ctx: Context, pkg: String, ms: Long) {
    if (ms > 0) addToDay(ctx, "usage", pkg, ms)
  }

  fun extra(ctx: Context, day: String = today()): Map<String, Long> = toMap(dayMaps(ctx, "extra").optJSONObject(day))

  @Synchronized
  fun addExtra(ctx: Context, ruleId: String, ms: Long) {
    if (ms > 0) addToDay(ctx, "extra", ruleId, ms)
  }

  fun unlockUntil(ctx: Context): Map<String, Long> = toMap(JSONObject(prefs(ctx).getString("unlockUntil", "{}")))

  /** Lifts the lock/bedtime for these packages until `until`; expired entries are dropped on the way. */
  @Synchronized
  fun unlock(ctx: Context, packages: Collection<String>, until: Long) {
    val now = now()
    val o = JSONObject()
    for ((pkg, t) in unlockUntil(ctx)) if (t > now) o.put(pkg, t)
    for (pkg in packages) o.put(pkg, until)
    prefs(ctx).edit().putString("unlockUntil", o.toString()).apply()
  }

  /** Called when the unlocked app itself sends the parent to a system screen. */
  fun unlockSystem(ctx: Context) = unlock(ctx, SYSTEM_PACKAGES, now() + SYSTEM_UNLOCK_MS)

  // --- decisions ---

  fun state(ctx: Context): LimiterState {
    val locked = lockedPackages(ctx) + (if (lockSettings(ctx)) SYSTEM_PACKAGES else emptySet())
    return LimiterState(
      rules = rules(ctx),
      bedtime = bedtime(ctx),
      // Locking the limiter itself would leave no way to enter the password.
      locked = locked - ctx.packageName,
      usage = usage(ctx),
      extra = extra(ctx),
      unlockUntil = unlockUntil(ctx),
      pauseUntil = pauseUntil(ctx),
    )
  }

  fun decide(ctx: Context, pkg: String): Decision {
    // Nothing is enforced before a password exists: the app is not set up yet.
    if (!hasPassword(ctx)) return Decision.Allow(null)
    return Limits.decide(pkg, now(), TimeZone.getDefault(), state(ctx))
  }

  /** Applies "more time" for a blocked package after the password was accepted. */
  @Synchronized
  fun grant(ctx: Context, pkg: String, reason: Reason, minutes: Int?) {
    val s = state(ctx)
    val rule = Limits.ruleFor(pkg, s.rules)
    val g = Limits.grant(reason, rule, minutes, now(), TimeZone.getDefault(), s)
    if (rule != null) addExtra(ctx, rule.id, g.extraMs)
    g.unlockUntil?.let { until ->
      // Settings and the installers work as one unit: the uninstall dialog belongs to a different package.
      val pkgs = if (pkg in SYSTEM_PACKAGES) SYSTEM_PACKAGES else rule?.packages ?: listOf(pkg)
      unlock(ctx, pkgs + pkg, until)
    }
  }

  // --- password ---

  fun hasPassword(ctx: Context): Boolean = prefs(ctx).contains("pwHash")

  private fun hash(password: String, salt: ByteArray): ByteArray {
    val spec = PBEKeySpec(password.toCharArray(), salt, PBKDF2_ITERATIONS, 256)
    return SecretKeyFactory.getInstance("PBKDF2WithHmacSHA1").generateSecret(spec).encoded
  }

  @Synchronized
  fun setPassword(ctx: Context, password: String) {
    val salt = ByteArray(16).also { SecureRandom().nextBytes(it) }
    prefs(ctx).edit()
      .putString("pwSalt", Base64.encodeToString(salt, Base64.NO_WRAP))
      .putString("pwHash", Base64.encodeToString(hash(password, salt), Base64.NO_WRAP))
      .putInt("failedAttempts", 0)
      .putLong("lockoutUntil", 0L)
      .apply()
  }

  /** Slow (PBKDF2): call off the main thread. Wrong tries beyond the fifth cost a wait that doubles each time. */
  @Synchronized
  fun checkPassword(ctx: Context, password: String): PasswordCheck {
    val p = prefs(ctx)
    val wait = p.getLong("lockoutUntil", 0L) - now()
    // A wait longer than the maximum means the clock was moved back; treat it as the maximum.
    if (wait > 0) return PasswordCheck(false, minOf(wait, LOCKOUT_MAX_MS), 0)
    val salt = Base64.decode(p.getString("pwSalt", ""), Base64.NO_WRAP)
    val expected = Base64.decode(p.getString("pwHash", ""), Base64.NO_WRAP)
    if (expected.isNotEmpty() && MessageDigest.isEqual(hash(password, salt), expected)) {
      p.edit().putInt("failedAttempts", 0).putLong("lockoutUntil", 0L).apply()
      return PasswordCheck(true, 0L, FREE_ATTEMPTS)
    }
    val failed = p.getInt("failedAttempts", 0) + 1
    val over = failed - FREE_ATTEMPTS
    val lockout = if (over < 0) 0L else minOf(LOCKOUT_BASE_MS shl minOf(over, 10), LOCKOUT_MAX_MS)
    p.edit().putInt("failedAttempts", failed).putLong("lockoutUntil", if (lockout > 0) now() + lockout else 0L).apply()
    return PasswordCheck(false, lockout, (FREE_ATTEMPTS - failed).coerceAtLeast(0))
  }
}
