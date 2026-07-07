package com.moneywise.notifications

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.provider.Telephony
import android.util.Log
import com.moneywise.data.PendingAction
import com.moneywise.data.TransactionRepository
import com.moneywise.data.local.AppDatabase
import com.moneywise.overlay.OverlayService
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch

class SmsReceiver : BroadcastReceiver() {

    private val scope = CoroutineScope(Dispatchers.IO)

    override fun onReceive(context: Context, intent: Intent) {
        // Abort processing immediately if no user is actively logged in
        val prefs = context.getSharedPreferences("MoneyWisePrefs", Context.MODE_PRIVATE)
        val username = prefs.getString("username", null)
        if (username.isNullOrEmpty()) {
            Log.d("SmsReceiver", "No user logged in. Ignoring SMS.")
            return
        }

        if (intent.action != Telephony.Sms.Intents.SMS_RECEIVED_ACTION) return

        val messages = Telephony.Sms.Intents.getMessagesFromIntent(intent)
        for (sms in messages) {
            val sender = sms.displayOriginatingAddress ?: ""
            val messageBody = sms.displayMessageBody ?: ""
            
            Log.d("SmsReceiver", "Received SMS from: $sender - Body: $messageBody")

            val bankLabel = when {
                sender.contains("canbnk", ignoreCase = true) || sender.contains("canara", ignoreCase = true) -> "Canara"
                sender.contains("hdfcbk", ignoreCase = true) || sender.contains("hdfc", ignoreCase = true) -> "HDFC"
                sender.contains("sbi", ignoreCase = true) -> "SBI"
                else -> null
            } ?: continue

            val pkgMock = "com.${bankLabel.lowercase()}.app"
            val txn = BankParsers.parse(pkgMock, bankLabel, messageBody) ?: continue

            scope.launch {
                val dao = AppDatabase.getInstance(context.applicationContext).transactionDao()
                val repo = TransactionRepository(dao)
                
                when (val action = repo.handleIncomingTransaction(context.applicationContext, txn)) {
                    is PendingAction.NeedsCategorization -> {
                        OverlayService.launch(
                            context.applicationContext,
                            id = action.id,
                            amount = action.amount,
                            type = action.type
                        )
                    }
                    is PendingAction.AutoFiled -> {
                        Log.d("SmsReceiver", "Silent auto-filed transaction processed")
                    }
                    PendingAction.Duplicate -> { 
                        Log.d("SmsReceiver", "Duplicate transaction filtered: ₹${txn.amount}")
                    }
                }
            }
        }
    }
}
