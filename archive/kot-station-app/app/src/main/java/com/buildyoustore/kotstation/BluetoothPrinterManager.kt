package com.buildyoustore.kotstation

import android.bluetooth.BluetoothAdapter
import android.bluetooth.BluetoothDevice
import android.bluetooth.BluetoothSocket
import android.content.Context
import android.content.SharedPreferences
import android.util.Log
import java.io.IOException
import java.util.UUID
import java.util.concurrent.LinkedBlockingQueue
import kotlin.concurrent.thread

private const val TAG        = "BTPrinter"
private const val SPP_UUID   = "00001101-0000-1000-8000-00805F9B34FB"
private const val PREFS_KEY  = "paired_printer_address"
private const val RECONNECT_DELAY_MS = 5_000L

enum class PrinterStatus { CONNECTED, DISCONNECTED, CONNECTING }

class BluetoothPrinterManager(private val context: Context) {

    private val prefs: SharedPreferences =
        context.getSharedPreferences("kot_station_prefs", Context.MODE_PRIVATE)

    @Volatile var status: PrinterStatus = PrinterStatus.DISCONNECTED
        private set

    private val queue = LinkedBlockingQueue<ByteArray>()
    private var socket: BluetoothSocket? = null

    var pairedAddress: String?
        get()  = prefs.getString(PREFS_KEY, null)
        set(v) = prefs.edit().putString(PREFS_KEY, v).apply()

    init {
        thread(name = "BTPrintWorker", isDaemon = true) { printLoop() }
    }

    fun enqueue(data: ByteArray) { queue.offer(data) }

    fun reconnect() {
        socket?.runCatching { close() }
        socket = null
        status = PrinterStatus.DISCONNECTED
    }

    private fun printLoop() {
        while (true) {
            val data = queue.take()
            ensureConnected()
            if (status != PrinterStatus.CONNECTED) {
                Log.w(TAG, "Dropped KOT — printer not connected")
                continue
            }
            try {
                socket!!.outputStream.write(data)
                socket!!.outputStream.flush()
            } catch (e: IOException) {
                Log.e(TAG, "Write failed", e)
                reconnect()
            }
        }
    }

    private fun ensureConnected() {
        if (status == PrinterStatus.CONNECTED) return
        val address = pairedAddress ?: return
        val adapter = BluetoothAdapter.getDefaultAdapter() ?: return
        if (!adapter.isEnabled) return

        status = PrinterStatus.CONNECTING
        repeat(3) { attempt ->
            try {
                val device: BluetoothDevice = adapter.getRemoteDevice(address)
                val s = device.createRfcommSocketToServiceRecord(UUID.fromString(SPP_UUID))
                adapter.cancelDiscovery()
                s.connect()
                socket = s
                status = PrinterStatus.CONNECTED
                Log.i(TAG, "Connected to $address on attempt ${attempt + 1}")
                return
            } catch (e: IOException) {
                Log.w(TAG, "Connect attempt ${attempt + 1} failed: ${e.message}")
                if (attempt < 2) Thread.sleep(RECONNECT_DELAY_MS)
            }
        }
        status = PrinterStatus.DISCONNECTED
    }
}
