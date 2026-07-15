package com.moneywise

import android.Manifest
import android.content.pm.PackageManager
import android.os.Build
import android.os.Bundle
import android.webkit.WebSettings
import android.webkit.WebView
import android.webkit.WebViewClient
import androidx.appcompat.app.AppCompatActivity
import com.moneywise.permissions.PermissionHelper

class MainActivity : AppCompatActivity() {

    private lateinit var webView: WebView

    // Replace this with your Vercel deployment URL
    private val DASHBOARD_URL = "https://money-wise-henna.vercel.app/"

    private val reloadReceiver = object : android.content.BroadcastReceiver() {
        override fun onReceive(context: android.content.Context?, intent: android.content.Intent?) {
            runOnUiThread {
                android.util.Log.d("MainActivity", "Reload broadcast received. Force reloading dashboard WebView.")
                webView.evaluateJavascript("javascript:forceReloadDashboard();", null)
            }
        }
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        // Setup Full Screen WebView
        webView = WebView(this)
        setContentView(webView)

        val settings = webView.settings
        settings.javaScriptEnabled = true
        settings.domStorageEnabled = true
        settings.databaseEnabled = true
        settings.mixedContentMode = WebSettings.MIXED_CONTENT_ALWAYS_ALLOW

        webView.webViewClient = object : WebViewClient() {
            override fun shouldOverrideUrlLoading(view: WebView?, url: String?): Boolean {
                return false
            }
        }

        // Register JavaScript interface bridge
        webView.addJavascriptInterface(WebAppInterface(this), "AndroidBridge")

        webView.loadUrl(DASHBOARD_URL)

        // Request permissions on app launch
        requestAppPermissions()

        // Register reload broadcast receiver
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            registerReceiver(reloadReceiver, android.content.IntentFilter("com.moneywise.ACTION_RELOAD_DASHBOARD"), RECEIVER_NOT_EXPORTED)
        } else {
            registerReceiver(reloadReceiver, android.content.IntentFilter("com.moneywise.ACTION_RELOAD_DASHBOARD"))
        }
    }

    // JavaScript Interface to receive login updates from WebView
    class WebAppInterface(private val activity: MainActivity) {
        @android.webkit.JavascriptInterface
        fun onLoginSuccess(username: String) {
            val prefs = activity.getSharedPreferences("MoneyWisePrefs", android.content.Context.MODE_PRIVATE)
            prefs.edit().putString("username", username).apply()
            android.util.Log.d("MoneyWiseBridge", "Captured logged-in username: $username")
        }

        @android.webkit.JavascriptInterface
        fun onLogout() {
            val prefs = activity.getSharedPreferences("MoneyWisePrefs", android.content.Context.MODE_PRIVATE)
            prefs.edit().remove("username").apply()
            android.util.Log.d("MoneyWiseBridge", "User logged out. Cleared username.")
        }

        @android.webkit.JavascriptInterface
        fun updateSavingsThreshold(income: Int, savingsTarget: Int, phoneNumber: String) {
            val prefs = activity.getSharedPreferences("MoneyWisePrefs", android.content.Context.MODE_PRIVATE)
            prefs.edit()
                .putInt("income", income)
                .putInt("savingsTarget", savingsTarget)
                .putString("phoneNumber", phoneNumber)
                .apply()
            android.util.Log.d("MoneyWiseBridge", "Updated savings threshold: Income=$income, Target=$savingsTarget, Phone=$phoneNumber")
        }
    }

    private fun requestAppPermissions() {
        // 1. Notification Listener Access
        if (!PermissionHelper.isNotificationServiceEnabled(this)) {
            PermissionHelper.requestNotificationAccess(this)
        }

        // 2. Overlay Permission
        if (!PermissionHelper.hasOverlayPermission(this)) {
            PermissionHelper.requestOverlayPermission(this)
        }

        // 3. SMS Permissions
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            val hasReceiveSms = checkSelfPermission(Manifest.permission.RECEIVE_SMS) == PackageManager.PERMISSION_GRANTED
            val hasSendSms = checkSelfPermission(Manifest.permission.SEND_SMS) == PackageManager.PERMISSION_GRANTED
            if (!hasReceiveSms || !hasSendSms) {
                requestPermissions(
                    arrayOf(Manifest.permission.RECEIVE_SMS, Manifest.permission.READ_SMS, Manifest.permission.SEND_SMS),
                    101
                )
            }
        }
    }

    override fun onBackPressed() {
        if (webView.canGoBack()) {
            webView.goBack()
        } else {
            super.onBackPressed()
        }
    }

    override fun onDestroy() {
        try {
            unregisterReceiver(reloadReceiver)
        } catch (e: Exception) {
            // ignore
        }
        super.onDestroy()
    }
}
