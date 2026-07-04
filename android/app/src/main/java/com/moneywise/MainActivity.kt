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
    private val DASHBOARD_URL = "https://money-wise.vercel.app"

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

        webView.loadUrl(DASHBOARD_URL)

        // Request permissions on app launch
        requestAppPermissions()
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
            if (!hasReceiveSms) {
                requestPermissions(
                    arrayOf(Manifest.permission.RECEIVE_SMS, Manifest.permission.READ_SMS),
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
}
