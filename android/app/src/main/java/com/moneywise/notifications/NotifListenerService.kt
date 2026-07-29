package com.moneywise.notifications

import android.app.Notification
import android.service.notification.NotificationListenerService
import android.service.notification.StatusBarNotification
import android.util.Log
import com.moneywise.data.PendingAction
import com.moneywise.data.TransactionRepository
import com.moneywise.data.local.AppDatabase
import com.moneywise.overlay.OverlayService
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch

class NotifListenerService : NotificationListenerService() {

    private val scope = CoroutineScope(Dispatchers.IO)

    // Confirmed packages - verify these against sbn.packageName logged on a real device
    override fun onNotificationPosted(sbn: StatusBarNotification) {
        // Abort processing immediately if no user is actively logged in
        val prefs = applicationContext.getSharedPreferences("MoneyWisePrefs", android.content.Context.MODE_PRIVATE)
        val username = prefs.getString("username", null)
        if (username.isNullOrEmpty()) {
            Log.d("BankNotifListener", "No user logged in. Ignoring notification.")
            return
        }

        val pkg = sbn.packageName
        
        // Log package name to logcat as requested for on-device verification
        Log.d("BankNotifListener", "Posted package: $pkg")
        
        val bankLabel = when {
            pkg.equals("com.sbi.SBIFreedomPlus", true) -> "SBI"
            pkg.equals("com.snapwork.hdfc", true) -> "HDFC"
            pkg.equals("com.canarabank.mobility", true) -> "Canara"
            pkg.contains("unionbank", true) || pkg.contains("vyom", true) -> "Union Bank"
            pkg.contains("super.payments", true) || pkg.contains("super.money", true) || pkg.contains("supermoney", true) -> "SuperMoney"
            else -> null
        } ?: return

        val extras = sbn.notification.extras
        val title = extras.getString(Notification.EXTRA_TITLE) ?: ""
        val text = extras.getCharSequence(Notification.EXTRA_TEXT)?.toString() ?: ""
        val fullText = "$title $text"

        val txn = BankParsers.parse(pkg, bankLabel, fullText) ?: return

        scope.launch {
            val dao = AppDatabase.getInstance(applicationContext).transactionDao()
            val repo = TransactionRepository(dao)
            when (val action = repo.handleIncomingTransaction(applicationContext, txn)) {
                is PendingAction.NeedsCategorization -> {
                    OverlayService.launch(
                        applicationContext,
                        id = action.id,
                        amount = action.amount,
                        type = action.type
                    )
                }
                is PendingAction.AutoFiled -> { /* silently filed, nothing to show */ }
                PendingAction.Duplicate -> { /* ignore, already recorded */ }
            }
        }
    }
}
