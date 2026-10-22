package app.parsiword.mobile

import android.os.Bundle
import android.graphics.Color
import android.view.View
import androidx.activity.enableEdgeToEdge
import androidx.core.graphics.Insets
import androidx.core.view.ViewCompat
import androidx.core.view.WindowCompat
import androidx.core.view.WindowInsetsCompat

class MainActivity : TauriActivity() {
  override fun onCreate(savedInstanceState: Bundle?) {
    enableEdgeToEdge()
    super.onCreate(savedInstanceState)
    // Keep the editor and export controls clear of Android's status/navigation bars.
    val content = findViewById<View>(android.R.id.content)
    content.setBackgroundColor(Color.parseColor("#f5f7f6"))
    val paddedInsets = WindowInsetsCompat.Type.systemBars() or WindowInsetsCompat.Type.displayCutout()
    ViewCompat.setOnApplyWindowInsetsListener(content) { view, insets ->
      val bars = insets.getInsets(paddedInsets)
      view.setPadding(bars.left, bars.top, bars.right, bars.bottom)
      // The WebView is already inside this safe rectangle. Passing the same
      // bars/cutout on would add them again through CSS safe-area-inset-*.
      // Consume only that padding; keyboard insets must still reach children.
      WindowInsetsCompat.Builder(insets)
        .setInsets(paddedInsets, Insets.NONE)
        .setInsetsIgnoringVisibility(paddedInsets, Insets.NONE)
        .setDisplayCutout(null)
        .setInsets(WindowInsetsCompat.Type.ime(), insets.getInsets(WindowInsetsCompat.Type.ime()))
        .build()
    }
    WindowCompat.getInsetsController(window, window.decorView).apply {
      isAppearanceLightStatusBars = true
      isAppearanceLightNavigationBars = true
    }
    ViewCompat.requestApplyInsets(content)
  }
}
