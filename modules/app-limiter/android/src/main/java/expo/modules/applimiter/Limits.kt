package expo.modules.applimiter

import java.util.Calendar
import java.util.Locale
import java.util.TimeZone

/** A daily allowance shared by one or more apps. `minutesByDay` has 7 entries, Monday first. */
data class Rule(
  val id: String,
  val name: String,
  val packages: List<String>,
  val minutesByDay: List<Int>,
  val enabled: Boolean = true,
)

/** Window (minutes of the day) in which every limited app is blocked; it may cross midnight. */
data class Bedtime(val enabled: Boolean = false, val startMinute: Int = 21 * 60, val endMinute: Int = 7 * 60)

/** Everything a decision depends on. `usage` and `extra` hold today's values only. */
data class LimiterState(
  val rules: List<Rule> = emptyList(),
  val bedtime: Bedtime = Bedtime(),
  /** Apps that always need the password. */
  val locked: Set<String> = emptySet(),
  /** Milliseconds used today per package. */
  val usage: Map<String, Long> = emptyMap(),
  /** Extra milliseconds granted today per rule id. */
  val extra: Map<String, Long> = emptyMap(),
  /** Password unlocks per package (epoch ms): they lift the lock and bedtime, not the daily limit. */
  val unlockUntil: Map<String, Long> = emptyMap(),
  /** All limits are off until this moment (epoch ms). Locked apps stay locked. */
  val pauseUntil: Long = 0L,
)

enum class Reason { LIMIT, BEDTIME, LOCKED }

sealed class Decision {
  /**
   * The app may be used. `recheckMs` is when to decide again (null: never, the app is not limited).
   * `rule` is set when the time must be counted, `remainingMs` when a limit is running down.
   */
  data class Allow(val recheckMs: Long?, val rule: Rule? = null, val remainingMs: Long? = null) : Decision()

  data class Block(val reason: Reason, val rule: Rule? = null) : Decision()
}

/** What a password grant changes: extra time for the rule and/or an unlock for its packages. */
data class Grant(val extraMs: Long, val unlockUntil: Long?)

/** Pure limit logic: no Android imports, so it runs in plain JUnit tests. */
object Limits {
  /** The service re-decides at least this often, which also bounds how much usage a killed service loses. */
  const val MAX_TICK_MS = 30_000L

  private fun calendar(nowMs: Long, tz: TimeZone): Calendar = Calendar.getInstance(tz, Locale.US).apply { timeInMillis = nowMs }

  /** Local calendar day, `yyyy-MM-dd`. Usage is keyed by it, so a new day starts from zero without any job. */
  fun dayKey(nowMs: Long, tz: TimeZone): String {
    val c = calendar(nowMs, tz)
    return String.format(Locale.US, "%04d-%02d-%02d", c.get(Calendar.YEAR), c.get(Calendar.MONTH) + 1, c.get(Calendar.DAY_OF_MONTH))
  }

  /** 0 = Monday … 6 = Sunday. */
  fun weekdayIndex(nowMs: Long, tz: TimeZone): Int = (calendar(nowMs, tz).get(Calendar.DAY_OF_WEEK) + 5) % 7

  fun minuteOfDay(nowMs: Long, tz: TimeZone): Int {
    val c = calendar(nowMs, tz)
    return c.get(Calendar.HOUR_OF_DAY) * 60 + c.get(Calendar.MINUTE)
  }

  fun msToMidnight(nowMs: Long, tz: TimeZone): Long {
    val c = calendar(nowMs, tz)
    c.add(Calendar.DAY_OF_MONTH, 1)
    c.set(Calendar.HOUR_OF_DAY, 0)
    c.set(Calendar.MINUTE, 0)
    c.set(Calendar.SECOND, 0)
    c.set(Calendar.MILLISECOND, 0)
    return c.timeInMillis - nowMs
  }

  fun inBedtime(bedtime: Bedtime, minute: Int): Boolean {
    if (!bedtime.enabled || bedtime.startMinute == bedtime.endMinute) return false
    return if (bedtime.startMinute < bedtime.endMinute) {
      minute >= bedtime.startMinute && minute < bedtime.endMinute
    } else {
      minute >= bedtime.startMinute || minute < bedtime.endMinute
    }
  }

  fun ruleFor(pkg: String, rules: List<Rule>): Rule? = rules.firstOrNull { it.enabled && pkg in it.packages }

  fun allowanceMs(rule: Rule, weekday: Int): Long = (rule.minutesByDay.getOrNull(weekday) ?: 0).coerceAtLeast(0) * 60_000L

  fun usedMs(rule: Rule, usage: Map<String, Long>): Long = rule.packages.sumOf { usage[it] ?: 0L }

  /** May be negative when the app was used past the limit (e.g. while limits were paused). */
  fun remainingMs(rule: Rule, weekday: Int, usage: Map<String, Long>, extra: Map<String, Long>): Long =
    allowanceMs(rule, weekday) + (extra[rule.id] ?: 0L) - usedMs(rule, usage)

  fun decide(pkg: String, nowMs: Long, tz: TimeZone, s: LimiterState): Decision {
    val unlockedMs = (s.unlockUntil[pkg] ?: 0L) - nowMs
    if (pkg in s.locked) {
      return if (unlockedMs > 0) Decision.Allow(minOf(unlockedMs, MAX_TICK_MS)) else Decision.Block(Reason.LOCKED)
    }
    val rule = ruleFor(pkg, s.rules) ?: return Decision.Allow(null)
    val toMidnight = msToMidnight(nowMs, tz)
    if (s.pauseUntil > nowMs) return Decision.Allow(minOf(s.pauseUntil - nowMs, toMidnight, MAX_TICK_MS), rule)
    if (unlockedMs <= 0 && inBedtime(s.bedtime, minuteOfDay(nowMs, tz))) return Decision.Block(Reason.BEDTIME, rule)
    val remaining = remainingMs(rule, weekdayIndex(nowMs, tz), s.usage, s.extra)
    if (remaining <= 0) return Decision.Block(Reason.LIMIT, rule)
    var recheck = minOf(remaining, toMidnight, MAX_TICK_MS)
    if (unlockedMs > 0) recheck = minOf(recheck, unlockedMs)
    return Decision.Allow(recheck, rule, remaining)
  }

  /**
   * "More time" after the password. `minutes` = null means the rest of today.
   * A locked app only gets an unlock. A limited app ends up with at least that much time left today, and during
   * bedtime its apps are also unlocked for that long.
   */
  fun grant(reason: Reason, rule: Rule?, minutes: Int?, nowMs: Long, tz: TimeZone, s: LimiterState): Grant {
    val duration = minutes?.let { it * 60_000L } ?: msToMidnight(nowMs, tz)
    if (reason == Reason.LOCKED || rule == null) return Grant(0L, nowMs + duration)
    val remaining = remainingMs(rule, weekdayIndex(nowMs, tz), s.usage, s.extra)
    val extra = (duration - remaining).coerceAtLeast(0L)
    return Grant(extra, if (reason == Reason.BEDTIME) nowMs + duration else null)
  }

  /** "45 min", "1 h", "1 h 20 min"; under a minute rounds up so a running limit never reads "0 min". */
  fun formatDuration(ms: Long): String {
    val minutes = ((ms.coerceAtLeast(0L) + 59_999L) / 60_000L).toInt()
    val h = minutes / 60
    val m = minutes % 60
    return when {
      h == 0 -> "$m min"
      m == 0 -> "$h h"
      else -> "$h h $m min"
    }
  }

  fun formatClock(minuteOfDay: Int): String = String.format(Locale.US, "%02d:%02d", minuteOfDay / 60 % 24, minuteOfDay % 60)
}
