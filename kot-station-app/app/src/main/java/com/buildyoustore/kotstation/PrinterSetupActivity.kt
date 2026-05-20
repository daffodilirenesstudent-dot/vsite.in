package com.buildyoustore.kotstation

import android.bluetooth.BluetoothAdapter
import android.bluetooth.BluetoothDevice
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.os.Bundle
import android.widget.*
import androidx.appcompat.app.AppCompatActivity

/**
 * One-time setup screen: scan for Bluetooth devices and pair the thermal printer.
 * After pairing, the address is persisted and MainActivity reloads.
 */
class PrinterSetupActivity : AppCompatActivity() {

    private lateinit var printerManager: BluetoothPrinterManager
    private lateinit var listView: ListView
    private val devices = mutableListOf<BluetoothDevice>()
    private val adapter by lazy { ArrayAdapter(this, android.R.layout.simple_list_item_1, mutableListOf<String>()) }

    private val receiver = object : BroadcastReceiver() {
        override fun onReceive(context: Context, intent: Intent) {
            if (intent.action == BluetoothDevice.ACTION_FOUND) {
                val device: BluetoothDevice? = intent.getParcelableExtra(BluetoothDevice.EXTRA_DEVICE)
                if (device != null && devices.none { it.address == device.address }) {
                    devices.add(device)
                    adapter.add("${device.name ?: "Unknown"} (${device.address})")
                }
            }
        }
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        printerManager = (application as KotStationApp).printerManager

        val layout = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(32, 48, 32, 32)
        }

        layout.addView(TextView(this).apply {
            text = "Select Thermal Printer"
            textSize = 20f
        })
        layout.addView(TextView(this).apply {
            text = "Tap a device to pair it as the KOT printer"
            textSize = 13f
            setPadding(0, 8, 0, 16)
        })

        // Pre-populate paired devices
        val btAdapter = BluetoothAdapter.getDefaultAdapter()
        btAdapter?.bondedDevices?.forEach { d ->
            if (!devices.any { it.address == d.address }) {
                devices.add(d)
                adapter.add("${d.name ?: "Unknown"} (${d.address}) [paired]")
            }
        }

        listView = ListView(this).apply { this.adapter = this@PrinterSetupActivity.adapter }
        listView.setOnItemClickListener { _, _, position, _ ->
            val device = devices[position]
            printerManager.pairedAddress = device.address
            Toast.makeText(this, "Saved: ${device.name}", Toast.LENGTH_SHORT).show()
            setResult(RESULT_OK)
            finish()
        }
        layout.addView(listView)

        val scanBtn = Button(this).apply { text = "Scan for devices" }
        scanBtn.setOnClickListener {
            btAdapter?.startDiscovery()
            Toast.makeText(this, "Scanning…", Toast.LENGTH_SHORT).show()
        }
        layout.addView(scanBtn)

        setContentView(layout)
        registerReceiver(receiver, IntentFilter(BluetoothDevice.ACTION_FOUND))
    }

    override fun onDestroy() {
        super.onDestroy()
        unregisterReceiver(receiver)
        BluetoothAdapter.getDefaultAdapter()?.cancelDiscovery()
    }
}
