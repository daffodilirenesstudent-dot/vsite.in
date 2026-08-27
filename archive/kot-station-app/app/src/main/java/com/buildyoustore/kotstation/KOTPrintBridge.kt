package com.buildyoustore.kotstation

import android.content.Context
import android.webkit.JavascriptInterface
import org.json.JSONObject

/**
 * JavaScript bridge injected as window.KOTPrint.
 * Called by the web app to print KOT slips and query device info.
 */
class KOTPrintBridge(
    private val context: Context,
    private val printerManager: BluetoothPrinterManager,
    private val deviceId: String,
    private val deviceName: String,
) {
    @JavascriptInterface
    fun print(kotJson: String) {
        try {
            val obj = JSONObject(kotJson)
            val label  = obj.optString("label", "KOT")
            val site   = obj.optString("site", "Kitchen")
            val orderNum = obj.optString("order_number", "")
            val createdAt = obj.optString("created_at", "")
            val itemsArr = obj.optJSONArray("items")

            val sb = StringBuilder()
            sb.appendEscPos(EscPos.INIT)
            sb.appendEscPos(EscPos.ALIGN_CENTER)
            sb.appendEscPos(EscPos.BOLD_ON)
            sb.append(label).append("\n")
            sb.appendEscPos(EscPos.BOLD_OFF)
            sb.append(site).append("\n")
            sb.append(EscPos.DIVIDER).append("\n")
            sb.appendEscPos(EscPos.ALIGN_LEFT)

            if (itemsArr != null) {
                for (i in 0 until itemsArr.length()) {
                    val item = itemsArr.getJSONObject(i)
                    val qty     = item.optInt("qty", 1)
                    val name    = item.optString("name", "")
                    val variant = item.optString("variant", "")
                    val line = if (variant.isNotBlank()) "$qty x $name ($variant)" else "$qty x $name"
                    sb.appendEscPos(EscPos.BOLD_ON)
                    sb.append(line).append("\n")
                    sb.appendEscPos(EscPos.BOLD_OFF)
                }
            }

            sb.append(EscPos.DIVIDER).append("\n")
            if (orderNum.isNotBlank()) sb.append("Order #$orderNum\n")
            if (createdAt.isNotBlank()) {
                val timeStr = createdAt.substringAfter("T").take(5)
                sb.append(timeStr).append("\n")
            }
            sb.append("\n\n\n")  // feed before cut
            sb.appendEscPos(EscPos.CUT)

            printerManager.enqueue(sb.toString().toByteArray(Charsets.US_ASCII))
        } catch (e: Exception) {
            android.util.Log.e("KOTPrint", "print() failed", e)
        }
    }

    @JavascriptInterface
    fun getDeviceId(): String = deviceId

    @JavascriptInterface
    fun getDeviceName(): String = deviceName

    @JavascriptInterface
    fun getPrinterStatus(): String = printerManager.status.name.lowercase()
}

private fun StringBuilder.appendEscPos(bytes: ByteArray) {
    bytes.forEach { append(it.toInt().toChar()) }
}

object EscPos {
    val INIT         = byteArrayOf(0x1B, 0x40)
    val ALIGN_CENTER = byteArrayOf(0x1B, 0x61, 0x01)
    val ALIGN_LEFT   = byteArrayOf(0x1B, 0x61, 0x00)
    val BOLD_ON      = byteArrayOf(0x1B, 0x45, 0x01)
    val BOLD_OFF     = byteArrayOf(0x1B, 0x45, 0x00)
    val CUT          = byteArrayOf(0x1D, 0x56, 0x42, 0x00)
    const val DIVIDER = "--------------------------------"
}
