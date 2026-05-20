package com.buildyoustore.kotstation

import android.app.Application

class KotStationApp : Application() {
    lateinit var printerManager: BluetoothPrinterManager
        private set

    override fun onCreate() {
        super.onCreate()
        printerManager = BluetoothPrinterManager(this)
    }
}
