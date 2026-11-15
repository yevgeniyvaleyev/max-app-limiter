package expo.modules.applimiter

import java.util.Calendar
import java.util.TimeZone
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class LimitsTest {
  private val tz = TimeZone.getTimeZone("Europe/Amsterdam")
  private val min = 60_000L

  /** 2026-11-16 is a Monday. */
  private fun at(day: Int, hour: Int, minute: Int = 0): Long =
    Calendar.getInstance(tz).apply {
      clear()
      set(2026, Calendar.NOVEMBER, day, hour, minute, 0)
    }.timeInMillis

  private val youtube = Rule("r1", "YouTube", listOf("yt"), listOf(20, 20, 20, 20, 20, 60, 60))
  private val social = Rule("r2", "Social", listOf("tiktok", "insta"), List(7) { 30 })

  @Test
  fun dayAndWeekday() {
    assertEquals("2026-11-16", Limits.dayKey(at(16, 23, 59), tz))
    assertEquals("2026-11-17", Limits.dayKey(at(17, 0), tz))
    assertEquals(0, Limits.weekdayIndex(at(16, 12), tz))
    assertEquals(6, Limits.weekdayIndex(at(22, 12), tz))
    assertEquals(90 * min, Limits.msToMidnight(at(16, 22, 30), tz))
  }

  @Test
  fun bedtimeWindow() {
    val night = Bedtime(true, 21 * 60, 7 * 60)
    assertTrue(Limits.inBedtime(night, 22 * 60))
    assertTrue(Limits.inBedtime(night, 6 * 60 + 59))
    assertFalse(Limits.inBedtime(night, 7 * 60))
    assertFalse(Limits.inBedtime(night, 12 * 60))
    val noon = Bedtime(true, 12 * 60, 13 * 60)
    assertTrue(Limits.inBedtime(noon, 12 * 60))
    assertFalse(Limits.inBedtime(noon, 13 * 60))
    assertFalse(Limits.inBedtime(night.copy(enabled = false), 22 * 60))
  }

  @Test
  fun unlimitedAppIsAllowedWithoutRecheck() {
    val d = Limits.decide("maps", at(16, 12), tz, LimiterState(rules = listOf(youtube)))
    assertEquals(Decision.Allow(null), d)
  }

  @Test
  fun limitRunsDownAndBlocks() {
    val now = at(16, 12)
    val fresh = Limits.decide("yt", now, tz, LimiterState(rules = listOf(youtube)))
    assertEquals(Decision.Allow(Limits.MAX_TICK_MS, youtube, 20 * min), fresh)

    val almost = LimiterState(rules = listOf(youtube), usage = mapOf("yt" to 20 * min - 5_000))
    assertEquals(Decision.Allow(5_000, youtube, 5_000), Limits.decide("yt", now, tz, almost))

    val used = LimiterState(rules = listOf(youtube), usage = mapOf("yt" to 20 * min))
    assertEquals(Decision.Block(Reason.LIMIT, youtube), Limits.decide("yt", now, tz, used))
  }

  @Test
  fun weekendAllowanceAndExtraTime() {
    val used = LimiterState(rules = listOf(youtube), usage = mapOf("yt" to 20 * min))
    // Saturday allows 60 min.
    assertTrue(Limits.decide("yt", at(21, 12), tz, used) is Decision.Allow)
    val withExtra = used.copy(extra = mapOf("r1" to 15 * min))
    assertEquals(Decision.Allow(Limits.MAX_TICK_MS, youtube, 15 * min), Limits.decide("yt", at(16, 12), tz, withExtra))
  }

  @Test
  fun groupSharesOneAllowance() {
    val s = LimiterState(rules = listOf(social), usage = mapOf("tiktok" to 20 * min, "insta" to 10 * min))
    assertEquals(Decision.Block(Reason.LIMIT, social), Limits.decide("insta", at(16, 12), tz, s))
  }

  @Test
  fun disabledRuleDoesNotLimit() {
    val s = LimiterState(rules = listOf(youtube.copy(enabled = false)), usage = mapOf("yt" to 99 * min))
    assertEquals(Decision.Allow(null), Limits.decide("yt", at(16, 12), tz, s))
  }

  @Test
  fun recheckStopsAtMidnight() {
    val d = Limits.decide("yt", at(16, 23, 59) + 50_000, tz, LimiterState(rules = listOf(youtube)))
    assertEquals(10_000L, (d as Decision.Allow).recheckMs)
  }

  @Test
  fun bedtimeBlocksLimitedAppsOnly() {
    val s = LimiterState(rules = listOf(youtube), bedtime = Bedtime(true, 21 * 60, 7 * 60))
    assertEquals(Decision.Block(Reason.BEDTIME, youtube), Limits.decide("yt", at(16, 22), tz, s))
    assertEquals(Decision.Allow(null), Limits.decide("maps", at(16, 22), tz, s))
    val unlocked = s.copy(unlockUntil = mapOf("yt" to at(16, 22) + 10_000))
    assertEquals(Decision.Allow(10_000, youtube, 20 * min), Limits.decide("yt", at(16, 22), tz, unlocked))
  }

  @Test
  fun pauseLiftsLimitsButKeepsCounting() {
    val now = at(16, 22)
    val s = LimiterState(
      rules = listOf(youtube),
      bedtime = Bedtime(true, 21 * 60, 7 * 60),
      usage = mapOf("yt" to 50 * min),
      pauseUntil = now + 5_000,
    )
    val d = Limits.decide("yt", now, tz, s) as Decision.Allow
    assertEquals(5_000L, d.recheckMs)
    assertEquals(youtube, d.rule)
    assertNull(d.remainingMs)
  }

  @Test
  fun lockedAppNeedsPasswordEvenWhenPaused() {
    val now = at(16, 12)
    val s = LimiterState(locked = setOf("settings"), pauseUntil = now + 60 * min)
    assertEquals(Decision.Block(Reason.LOCKED), Limits.decide("settings", now, tz, s))
    val unlocked = s.copy(unlockUntil = mapOf("settings" to now + 5 * min))
    assertEquals(Decision.Allow(Limits.MAX_TICK_MS), Limits.decide("settings", now, tz, unlocked))
    val expired = s.copy(unlockUntil = mapOf("settings" to now))
    assertEquals(Decision.Block(Reason.LOCKED), Limits.decide("settings", now, tz, expired))
  }

  @Test
  fun grantGivesTheRequestedTime() {
    val now = at(16, 22)
    val used = LimiterState(rules = listOf(youtube), usage = mapOf("yt" to 23 * min))
    // 3 minutes over the limit: 15 more minutes needs 18 minutes of extra time.
    assertEquals(Grant(18 * min, null), Limits.grant(Reason.LIMIT, youtube, 15, now, tz, used))
    // Bedtime with 20 minutes still left: only the unlock is needed.
    assertEquals(Grant(0, now + 15 * min), Limits.grant(Reason.BEDTIME, youtube, 15, now, tz, LimiterState(rules = listOf(youtube))))
    // Rest of today.
    assertEquals(Grant(123 * min, null), Limits.grant(Reason.LIMIT, youtube, null, now, tz, used))
    assertEquals(Grant(0, now + 5 * min), Limits.grant(Reason.LOCKED, null, 5, now, tz, LimiterState()))
  }

  @Test
  fun formatting() {
    assertEquals("1 min", Limits.formatDuration(1))
    assertEquals("20 min", Limits.formatDuration(20 * min))
    assertEquals("1 h", Limits.formatDuration(60 * min))
    assertEquals("1 h 20 min", Limits.formatDuration(80 * min))
    assertEquals("07:05", Limits.formatClock(7 * 60 + 5))
  }
}
