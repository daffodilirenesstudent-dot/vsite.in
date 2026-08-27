package com.buildyoustore.kotstation

import android.Manifest
import android.annotation.SuppressLint
import android.bluetooth.BluetoothAdapter
import android.content.Intent
import android.content.SharedPreferences
import android.content.pm.PackageManager
import android.os.Build
import android.os.Bundle
import android.view.View
import android.webkit.*
import androidx.appcompat.app.AppCompatActivity
import androidx.core.app.ActivityCompat
import androidx.core.content.ContextCompat
import java.util.UUID

private const val PREF_DEVICE_ID   = "device_id"
private const val PREF_DEVICE_NAME = "device_name"
private const val REQ_BT_PERMS     = 1001
private const val REQ_SETUP        = 1002
private const val WEB_APP_URL      = "https://app.buildyoustore.com/manage/orders"

class MainActivity : AppCompatActivity() {

    private lateinit var webView: WebView
    private lateinit var printerManager: BluetoothPrinterManager
    private lateinit var prefs: SharedPreferences

    @SuppressLint("SetJavaScriptEnabled")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        // Hide status bar — full-screen kiosk feel
        window.decorView.systemUiVisibility = (
            View.SYSTEM_UI_FLAG_FULLSCREEN or
            View.SYSTEM_UI_FLAG_HIDE_NAVIGATION or
            View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY
        )

        printerManager = (application as KotStationApp).printerManager
        prefs = getSharedPreferences("kot_station_prefs", MODE_PRIVATE)

        // Ensure a stable device ID persisted across app restarts
        if (prefs.getString(PREF_DEVICE_ID, null) == null) {
            prefs.edit()
                .putString(PREF_DEVICE_ID,   UUID.randomUUID().toString())
                .putString(PREF_DEVICE_NAME, Build.MODEL)
                .apply()
        }
        val deviceId   = prefs.getString(PREF_DEVICE_ID, "")!!
        val deviceName = prefs.getString(PREF_DEVICE_NAME, Build.MODEL)!!

        webView = WebView(this).apply {
            settings.javaScriptEnabled       = true
            settings.domStorageEnabled       = true
            settings.databaseEnabled         = true
            settings.mediaPlaybackRequiresUserGesture = false
            settings.userAgentString         = settings.userAgentString + " KOTStation/1.0"

            webViewClient = object : WebViewClient() {
                override fun shouldOverrideUrlLoading(view: WebView, req: WebResourceRequest) = false
            }
            webChromeClient = WebChromeClient()

            addJavascriptInterface(
                KOTPrintBridge(this@MainActivity, printerManager, deviceId, deviceName),
                "KOTPrint"
            )
        }

        setContentView(webView)
        requestBluetoothPermissions()
    }

    private fun requestBluetoothPermissions() {
        val needed = buildList {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                if (ContextCompat.checkSelfPermission(this@MainActivity, Manifest.permission.BLUETOOTH_CONNECT) != PackageManager.PERMISSION_GRANTED)
                    add(Manifest.permission.BLUETOOTH_CONNECT)
                if (ContextCompat.checkSelfPermission(this@MainActivity, Manifest.permission.BLUETOOTH_SCAN) != PackageManager.PERMISSION_GRANTED)
                    add(Manifest.permission.BLUETOOTH_SCAN)
            } else {
                if (ContextCompat.checkSelfPermission(this@MainActivity, Manifest.permission.BLUETOOTH) != PackageManager.PERMISSION_GRANTED)
                    add(Manifest.permission.BLUETOOTH)
                if (ContextCompat.checkSelfPermission(this@MainActivity, Manifest.permission.ACCESS_FINE_LOCATION) != PackageManager.PERMISSION_GRANTED)
                    add(Manifest.permission.ACCESS_FINE_LOCATION)
            }
        }

        if (needed.isEmpty()) {
            onPermissionsReady()
        } else {
            ActivityCompat.requestPermissions(this, needed.toTypedArray(), REQ_BT_PERMS)
        }
    }

    override fun onRequestPermissionsResult(requestCode: Int, permissions: Array<out String>, grantResults: IntArray) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults)
        if (requestCode == REQ_BT_PERMS) onPermissionsReady()
    }

    private fun onPermissionsReady() {
        // If no printer paired yet, open setup
        if (printerManager.pairedAddress == null) {
            startActivityForResult(Intent(this, PrinterSetupActivity::class.java), REQ_SETUP)
        } else {
            loadWebApp()
        }
    }

    override fun onActivityResult(requestCode: Int, resultCode: Int, data: Intent?) {
        super.onActivityResult(requestCode, resultCode, data)
        if (requestCode == REQ_SETUP) loadWebApp()
    }

    private fun loadWebApp() {
        webView.loadUrl(WEB_APP_URL)
    }

    override fun onBackPressed() {
        if (webView.canGoBack()) webView.goBack() else super.onBackPressed()
    }
}
