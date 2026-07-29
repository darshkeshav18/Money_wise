package com.moneywise.data

import com.moneywise.data.local.TransactionDao
import com.moneywise.data.local.TransactionEntity

class TransactionRepository(private val dao: TransactionDao) {

    fun buildDedupeKey(amount: Double, type: String, timestamp: Long): String {
        val bucket = timestamp / 5_000 // 5-second window absorbs SMS+notification duplicates but allows back-to-back payments
        return "$amount-$type-$bucket"
    }

    // Reasons that should skip the categorization popup entirely
    private val autoSkipPatterns = listOf("interest", "refund", "reversal", "cashback")

    suspend fun handleIncomingTransaction(context: android.content.Context, txn: Transaction): PendingAction {
        val key = buildDedupeKey(txn.amount, txn.type, txn.timestamp)
        val existing = dao.findByDedupeKey(key)
        if (existing != null) return PendingAction.Duplicate

        val isCredit = txn.type.equals("credit", ignoreCase = true)
        val autoCategory = txn.reason?.let { reason ->
            autoSkipPatterns.firstOrNull { reason.contains(it, ignoreCase = true) }
        }

        val category = if (isCredit || autoCategory != null) "Other Income" else "Uncategorized"

        val entity = TransactionEntity(
            amount = txn.amount,
            type = txn.type,
            category = category,
            reason = txn.reason,
            bank = txn.bank,
            timestamp = txn.timestamp,
            availableBalance = txn.availableBalance,
            synced = false,
            dedupeKey = key
        )
        val id = dao.insert(entity)

        if (!isCredit) {
            checkSavingsWarning(context)
        }

        val action = when {
            isCredit -> PendingAction.AutoFiled(id)
            autoCategory != null -> PendingAction.AutoFiled(id)
            else -> PendingAction.NeedsCategorization(id, txn.amount, txn.type)
        }

        if (action is PendingAction.AutoFiled) {
            triggerImmediateSync(context)
        }

        return action
    }

    suspend fun updateCategory(context: android.content.Context, id: Long, category: String) {
        val all = dao.getAll()
        val entity = all.firstOrNull { it.id == id } ?: return
        dao.update(entity.copy(category = category, synced = false))

        if (!entity.type.equals("credit", ignoreCase = true)) {
            checkSavingsWarning(context)
        }

        triggerImmediateSync(context)
    }

    private fun triggerImmediateSync(context: android.content.Context) {
        try {
            val syncRequest = androidx.work.OneTimeWorkRequestBuilder<com.moneywise.sync.SyncWorker>().build()
            androidx.work.WorkManager.getInstance(context.applicationContext).enqueue(syncRequest)
            android.util.Log.d("TransactionRepository", "Enqueued SyncWorker for immediate sync.")
        } catch (e: Exception) {
            android.util.Log.e("TransactionRepository", "Failed to enqueue SyncWorker", e)
        }
    }

    private fun broadcastReload(context: android.content.Context) {
        try {
            val intent = android.content.Intent("com.moneywise.ACTION_RELOAD_DASHBOARD").apply {
                setPackage(context.packageName)
            }
            context.sendBroadcast(intent)
            android.util.Log.d("TransactionRepository", "Dispatched ACTION_RELOAD_DASHBOARD broadcast.")
        } catch (e: Exception) {
            android.util.Log.e("TransactionRepository", "Failed to dispatch reload broadcast", e)
        }
    }

    private suspend fun checkSavingsWarning(context: android.content.Context) {
        val prefs = context.getSharedPreferences("MoneyWisePrefs", android.content.Context.MODE_PRIVATE)
        val income = prefs.getInt("income", 0)
        val savingsTarget = prefs.getInt("savingsTarget", 0)
        val phoneNumber = prefs.getString("phoneNumber", "") ?: ""

        if (income <= 0 || savingsTarget <= 0 || phoneNumber.isEmpty()) {
            return
        }

        // Current month tracker e.g. "2026-06"
        val sdf = java.text.SimpleDateFormat("yyyy-MM", java.util.Locale.getDefault())
        val currentMonth = sdf.format(java.util.Date())

        val lastWarnedMonth = prefs.getString("lastWarnedMonth", "")
        if (lastWarnedMonth == currentMonth) {
            return
        }

        val allTxns = dao.getAll()
        val calendar = java.util.Calendar.getInstance()
        val currentYear = calendar.get(java.util.Calendar.YEAR)
        val currentMonthInt = calendar.get(java.util.Calendar.MONTH)

        var totalDebits = 0.0
        var totalCredits = 0.0

        for (t in allTxns) {
            calendar.timeInMillis = t.timestamp
            if (calendar.get(java.util.Calendar.YEAR) == currentYear &&
                calendar.get(java.util.Calendar.MONTH) == currentMonthInt) {
                if (t.type.equals("credit", ignoreCase = true)) {
                    totalCredits += t.amount
                } else {
                    totalDebits += t.amount
                }
            }
        }

        val remainingBalance = (income + totalCredits) - totalDebits
        if (remainingBalance < savingsTarget) {
            try {
                // 1. Send warning SMS
                val smsManager = if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.M) {
                    context.getSystemService(android.telephony.SmsManager::class.java)
                } else {
                    @Suppress("DEPRECATION")
                    android.telephony.SmsManager.getDefault()
                }
                val message = "MoneyWise Alert: Your remaining balance (₹${remainingBalance.toInt()}) has fallen below your monthly savings threshold (₹$savingsTarget). Please manage your spends!"
                smsManager.sendTextMessage(phoneNumber, null, message, null, null)
                android.util.Log.d("TransactionRepository", "Overspend warning SMS sent to: $phoneNumber")

                // 2. ALSO trigger a native system notification banner
                val title = "⚠️ MoneyWise Savings Warning"
                val body = "Your balance (₹${remainingBalance.toInt()}) has fallen below your savings threshold (₹$savingsTarget). Please manage your spends!"
                sendSystemNotification(context, title, body)

                // Mark warned for this month
                prefs.edit().putString("lastWarnedMonth", currentMonth).apply()
            } catch (e: Exception) {
                android.util.Log.e("TransactionRepository", "Failed to send warning SMS/Notification", e)
            }
        }
    }

    private fun sendSystemNotification(context: android.content.Context, title: String, message: String) {
        val channelId = "moneywise_alerts_v3"
        val notificationManager = context.getSystemService(android.content.Context.NOTIFICATION_SERVICE) as android.app.NotificationManager

        if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.O) {
            val channel = android.app.NotificationChannel(
                channelId,
                "MoneyWise Budget Alerts",
                android.app.NotificationManager.IMPORTANCE_HIGH
            ).apply {
                description = "Critical alerts when user exceeds set budget thresholds"
                enableLights(true)
                lightColor = android.graphics.Color.RED
                enableVibration(true)
                vibrationPattern = longArrayOf(100, 200, 300, 400, 500, 400, 300, 200, 400)
            }
            notificationManager.createNotificationChannel(channel)
        }

        val builder = androidx.core.app.NotificationCompat.Builder(context, channelId)
            .setSmallIcon(android.R.drawable.stat_notify_error)
            .setContentTitle(title)
            .setContentText(message)
            .setPriority(androidx.core.app.NotificationCompat.PRIORITY_MAX)
            .setVibrate(longArrayOf(100, 200, 300, 400, 500, 400, 300, 200, 400))
            .setSound(android.provider.Settings.System.DEFAULT_NOTIFICATION_URI)
            .setAutoCancel(true)
            .setDefaults(androidx.core.app.NotificationCompat.DEFAULT_ALL)

        try {
            val notificationId = (System.currentTimeMillis() % 100000).toInt()
            notificationManager.notify(notificationId, builder.build())
            android.util.Log.d("TransactionRepository", "System notification sent successfully.")
        } catch (e: Exception) {
            android.util.Log.e("TransactionRepository", "Failed to trigger system notification", e)
        }
    }
}

sealed class PendingAction {
    data class NeedsCategorization(val id: Long, val amount: Double, val type: String) : PendingAction()
    data class AutoFiled(val id: Long) : PendingAction()
    object Duplicate : PendingAction()
}
