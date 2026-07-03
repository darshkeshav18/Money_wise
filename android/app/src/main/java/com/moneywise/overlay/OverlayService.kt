package com.moneywise.overlay

import android.app.Service
import android.content.Context
import android.content.Intent
import android.graphics.PixelFormat
import android.os.Handler
import android.os.IBinder
import android.os.Looper
import android.view.Gravity
import android.view.LayoutInflater
import android.view.View
import android.view.WindowManager
import android.widget.Button
import android.widget.TextView
import com.moneywise.R
import com.moneywise.data.TransactionRepository
import com.moneywise.data.local.AppDatabase
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch

class OverlayService : Service() {

    private lateinit var windowManager: WindowManager
    private var overlayView: View? = null
    private val scope = CoroutineScope(Dispatchers.IO)
    private val dismissHandler = Handler(Looper.getMainLooper())
    private var autoDismissRunnable: Runnable? = null

    companion object {
        fun launch(context: Context, id: Long, amount: Double, type: String) {
            val intent = Intent(context, OverlayService::class.java).apply {
                putExtra("id", id)
                putExtra("amount", amount)
                putExtra("type", type)
            }
            context.startService(intent)
        }
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        val id = intent?.getLongExtra("id", -1) ?: -1
        val amount = intent?.getDoubleExtra("amount", 0.0) ?: 0.0
        val type = intent?.getStringExtra("type") ?: "debit"
        if (id != -1L) showOverlay(id, amount, type)
        return START_NOT_STICKY
    }

    private fun showOverlay(id: Long, amount: Double, type: String) {
        windowManager = getSystemService(WINDOW_SERVICE) as WindowManager
        val inflater = LayoutInflater.from(this)
        overlayView = inflater.inflate(R.layout.overlay_categorize, null)

        val params = WindowManager.LayoutParams(
            WindowManager.LayoutParams.WRAP_CONTENT,
            WindowManager.LayoutParams.WRAP_CONTENT,
            WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY,
            WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE,
            PixelFormat.TRANSLUCENT
        ).apply { gravity = Gravity.CENTER }

        overlayView?.findViewById<TextView>(R.id.tvAmount)?.text =
            "₹$amount ${if (type == "debit") "spent" else "received"}"

        overlayView?.findViewById<Button>(R.id.btnNeed)?.setOnClickListener {
            saveCategory(id, "Need"); dismiss()
        }
        overlayView?.findViewById<Button>(R.id.btnWant)?.setOnClickListener {
            saveCategory(id, "Want"); dismiss()
        }
        overlayView?.findViewById<Button>(R.id.btnSavings)?.setOnClickListener {
            saveCategory(id, "Savings"); dismiss()
        }

        windowManager.addView(overlayView, params)

        // Auto-dismiss after 5s -> Uncategorized
        autoDismissRunnable = Runnable {
            saveCategory(id, "Uncategorized")
            dismiss()
        }
        dismissHandler.postDelayed(autoDismissRunnable!!, 5000)
    }

    private fun saveCategory(id: Long, category: String) {
        scope.launch {
            val dao = AppDatabase.getInstance(applicationContext).transactionDao()
            TransactionRepository(dao).updateCategory(id, category)
        }
    }

    private fun dismiss() {
        autoDismissRunnable?.let { dismissHandler.removeCallbacks(it) }
        overlayView?.let {
            if (it.isAttachedToWindow) windowManager.removeView(it)
        }
        stopSelf()
    }

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onDestroy() {
        super.onDestroy()
        autoDismissRunnable?.let { dismissHandler.removeCallbacks(it) }
    }
}
