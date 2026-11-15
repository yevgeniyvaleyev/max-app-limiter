package expo.modules.applimiter

import android.app.Activity
import android.content.Context
import android.content.Intent
import android.graphics.Color
import android.graphics.Typeface
import android.graphics.drawable.GradientDrawable
import android.os.Build
import android.os.Bundle
import android.text.InputType
import android.view.Gravity
import android.view.View
import android.view.ViewGroup.LayoutParams.MATCH_PARENT
import android.view.ViewGroup.LayoutParams.WRAP_CONTENT
import android.view.inputmethod.EditorInfo
import android.view.inputmethod.InputMethodManager
import android.widget.EditText
import android.widget.ImageView
import android.widget.LinearLayout
import android.widget.ScrollView
import android.widget.TextView
import android.window.OnBackInvokedDispatcher
import java.util.TimeZone

/**
 * Full-screen screen shown instead of an app that may not be used right now. It is plain Android views, so it
 * works while the React Native app is not running. "More time" asks for the master password.
 */
class BlockActivity : Activity() {
  private var pkg = ""
  private var reason = Reason.LIMIT
  private var selectedMinutes: Int? = 15
  private var checking = false

  private val dp get() = resources.displayMetrics.density
  private fun px(v: Int) = (v * dp).toInt()

  override fun onCreate(savedInstanceState: Bundle?) {
    super.onCreate(savedInstanceState)
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
      onBackInvokedDispatcher.registerOnBackInvokedCallback(OnBackInvokedDispatcher.PRIORITY_DEFAULT) { goHome() }
    }
    show(intent)
  }

  // singleTask: a second blocked app reuses this activity.
  override fun onNewIntent(intent: Intent) {
    super.onNewIntent(intent)
    setIntent(intent)
    show(intent)
  }

  // Back goes to the home screen, never back into the blocked app.
  @Deprecated("Deprecated in Java")
  override fun onBackPressed() = goHome()

  private fun goHome() {
    startActivity(Intent(Intent.ACTION_MAIN).addCategory(Intent.CATEGORY_HOME).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
    finish()
  }

  private fun appLabel(): String = runCatching {
    packageManager.getApplicationLabel(packageManager.getApplicationInfo(pkg, 0)).toString()
  }.getOrDefault(if (pkg in LimiterStore.SYSTEM_PACKAGES) "Settings" else "This app")

  private fun show(intent: Intent) {
    pkg = intent.getStringExtra(EXTRA_PACKAGE) ?: ""
    reason = runCatching { Reason.valueOf(intent.getStringExtra(EXTRA_REASON) ?: "") }.getOrDefault(Reason.LIMIT)
    selectedMinutes = 15
    checking = false

    val state = LimiterStore.state(this)
    val rule = Limits.ruleFor(pkg, state.rules)
    val label = appLabel()
    val tz = TimeZone.getDefault()
    val now = LimiterStore.now()

    val title: String
    val message: String
    when (reason) {
      Reason.LIMIT -> {
        title = "Time's up"
        val allowed = rule?.let { Limits.allowanceMs(it, Limits.weekdayIndex(now, tz)) + (state.extra[it.id] ?: 0L) } ?: 0L
        val what = if (rule != null && rule.packages.size > 1) "“${rule.name}” (including $label)" else label
        message = if (allowed > 0) {
          "Today's ${Limits.formatDuration(allowed)} for $what is used up.\nThe time resets at midnight."
        } else {
          "$what is not allowed today."
        }
      }
      Reason.BEDTIME -> {
        title = "Bedtime"
        message = "$label is off until ${Limits.formatClock(state.bedtime.endMinute)}."
      }
      Reason.LOCKED -> {
        title = "Locked"
        message = "$label needs the password."
      }
    }

    val root = LinearLayout(this).apply {
      orientation = LinearLayout.VERTICAL
      gravity = Gravity.CENTER_HORIZONTAL
      setPadding(px(28), px(48), px(28), px(32))
    }

    runCatching { packageManager.getApplicationIcon(pkg) }.getOrNull()?.let { icon ->
      root.addView(ImageView(this).apply { setImageDrawable(icon) }, LinearLayout.LayoutParams(px(72), px(72)).apply { bottomMargin = px(20) })
    }
    root.addView(text(title, 28f, TEXT, bold = true), margin(bottom = 10))
    root.addView(text(message, 16f, MUTED), margin(bottom = 28))

    val form = LinearLayout(this).apply {
      orientation = LinearLayout.VERTICAL
      visibility = View.GONE
    }
    val moreLabel = if (reason == Reason.LOCKED) "Unlock" else "More time"
    val more = button(moreLabel, PRIMARY, ON_PRIMARY)
    val close = button("Close", SURFACE, TEXT).apply { setOnClickListener { goHome() } }

    // --- password form ---
    form.addView(text(if (reason == Reason.LOCKED) "Unlock for" else "Allow", 14f, MUTED), margin(bottom = 8))
    val chips = ArrayList<Pair<TextView, Int?>>()
    fun refreshChips() {
      for ((chip, minutes) in chips) {
        val on = minutes == selectedMinutes
        chip.background = rounded(if (on) PRIMARY else SURFACE, 10)
        chip.setTextColor(if (on) ON_PRIMARY else TEXT)
      }
    }
    fun chip(label: String, minutes: Int?) = text(label, 15f, TEXT, bold = true).apply {
      setPadding(px(4), px(12), px(4), px(12))
      setOnClickListener {
        selectedMinutes = minutes
        refreshChips()
      }
      chips.add(this to minutes)
    }
    val row = LinearLayout(this).apply { orientation = LinearLayout.HORIZONTAL }
    for ((label, minutes) in listOf("5 min" to 5, "15 min" to 15, "30 min" to 30, "1 hour" to 60)) {
      row.addView(chip(label, minutes), LinearLayout.LayoutParams(0, WRAP_CONTENT, 1f).apply { marginEnd = px(6) })
    }
    form.addView(row, margin(bottom = 6))
    form.addView(chip("Rest of today", null), margin(bottom = 18))
    refreshChips()

    val password = EditText(this).apply {
      hint = "Password"
      inputType = InputType.TYPE_CLASS_TEXT or InputType.TYPE_TEXT_VARIATION_PASSWORD
      imeOptions = EditorInfo.IME_ACTION_DONE
      isSingleLine = true
      textSize = 17f
      setTextColor(TEXT)
      setHintTextColor(MUTED)
      background = rounded(SURFACE, 10)
      setPadding(px(14), px(14), px(14), px(14))
    }
    val error = text("", 14f, DANGER).apply { visibility = View.GONE }
    val confirm = button("Confirm", PRIMARY, ON_PRIMARY)
    form.addView(password, margin(bottom = 10))
    form.addView(error, margin(bottom = 10))
    form.addView(confirm, margin(bottom = 10))

    fun submit() {
      val entered = password.text.toString()
      if (checking || entered.isEmpty()) return
      checking = true
      confirm.alpha = 0.5f
      // PBKDF2 takes a moment: keep it off the main thread.
      Thread {
        val check = LimiterStore.checkPassword(applicationContext, entered)
        runOnUiThread {
          checking = false
          confirm.alpha = 1f
          if (check.ok) {
            LimiterStore.grant(this, pkg, reason, selectedMinutes)
            LimiterService.instance?.onUnblocked(pkg)
            // The blocked app is the task right under this one.
            finish()
          } else {
            password.setText("")
            error.visibility = View.VISIBLE
            error.text = when {
              check.waitMs > 0 -> "Too many wrong tries. Try again in ${Limits.formatDuration(check.waitMs)}."
              check.attemptsLeft > 0 -> "Wrong password. ${check.attemptsLeft} ${if (check.attemptsLeft == 1) "try" else "tries"} left."
              else -> "Wrong password."
            }
          }
        }
      }.start()
    }
    confirm.setOnClickListener { submit() }
    password.setOnEditorActionListener { _, action, _ ->
      if (action == EditorInfo.IME_ACTION_DONE) submit()
      true
    }

    more.setOnClickListener {
      more.visibility = View.GONE
      form.visibility = View.VISIBLE
      password.requestFocus()
      (getSystemService(Context.INPUT_METHOD_SERVICE) as InputMethodManager).showSoftInput(password, 0)
    }

    root.addView(more, margin(bottom = 10))
    root.addView(form, LinearLayout.LayoutParams(MATCH_PARENT, WRAP_CONTENT))
    root.addView(close, margin())

    setContentView(
      ScrollView(this).apply {
        setBackgroundColor(BACKGROUND)
        isFillViewport = true
        addView(root, LinearLayout.LayoutParams(MATCH_PARENT, WRAP_CONTENT))
      },
    )
  }

  private fun margin(bottom: Int = 0) = LinearLayout.LayoutParams(MATCH_PARENT, WRAP_CONTENT).apply { bottomMargin = px(bottom) }

  private fun rounded(color: Int, radiusDp: Int) = GradientDrawable().apply {
    setColor(color)
    cornerRadius = radiusDp * dp
  }

  private fun text(value: String, sizeSp: Float, color: Int, bold: Boolean = false) = TextView(this).apply {
    text = value
    textSize = sizeSp
    setTextColor(color)
    gravity = Gravity.CENTER
    if (bold) setTypeface(typeface, Typeface.BOLD)
  }

  private fun button(label: String, fill: Int, textColor: Int) = text(label, 16f, textColor, bold = true).apply {
    background = rounded(fill, 12)
    setPadding(px(16), px(15), px(16), px(15))
    isClickable = true
  }

  companion object {
    const val EXTRA_PACKAGE = "package"
    const val EXTRA_REASON = "reason"

    private val BACKGROUND = Color.parseColor("#0F1115")
    private val SURFACE = Color.parseColor("#20242C")
    private val TEXT = Color.parseColor("#E8EAED")
    private val MUTED = Color.parseColor("#9AA0A6")
    private val PRIMARY = Color.parseColor("#748FFC")
    private val ON_PRIMARY = Color.parseColor("#0F1115")
    private val DANGER = Color.parseColor("#FF6B6B")
  }
}
