package com.moneywise.sync

import android.content.Context
import android.util.Log
import androidx.work.CoroutineWorker
import androidx.work.WorkerParameters
import com.moneywise.data.local.AppDatabase
import org.json.JSONObject
import java.io.OutputStreamWriter
import java.net.HttpURLConnection
import java.net.URL

class SyncWorker(context: Context, params: WorkerParameters) : CoroutineWorker(context, params) {

    override suspend fun doWork(): Result {
        val dao = AppDatabase.getInstance(applicationContext).transactionDao()
        val unsynced = dao.getUnsynced()
        if (unsynced.isEmpty()) return Result.success()

        // Fetch captured username from bridge SharedPreferences
        val prefs = applicationContext.getSharedPreferences("MoneyWisePrefs", Context.MODE_PRIVATE)
        val username = prefs.getString("username", null)
        if (username.isNullOrEmpty()) {
            Log.d("SyncWorker", "No logged-in username captured, skipping sync.")
            return Result.success()
        }

        val backendUrl = "https://money-wise-henna.vercel.app/api/transaction/add"
        var hasFailure = false

        for (txn in unsynced) {
            try {
                val url = URL(backendUrl)
                val conn = url.openConnection() as HttpURLConnection
                conn.requestMethod = "POST"
                conn.setRequestProperty("Content-Type", "application/json")
                conn.setRequestProperty("Authorization", "Bearer $username")
                conn.doOutput = true

                val jsonBody = JSONObject().apply {
                    put("amount", txn.amount)
                    put("type", txn.type)
                    put("category", txn.category)
                    put("reason", txn.reason ?: "")
                    put("bank", txn.bank)
                    put("timestamp", txn.timestamp)
                }

                val writer = OutputStreamWriter(conn.outputStream)
                writer.write(jsonBody.toString())
                writer.flush()
                writer.close()

                val responseCode = conn.responseCode
                if (responseCode == HttpURLConnection.HTTP_OK) {
                    dao.markSynced(txn.id)
                    Log.d("SyncWorker", "Transaction ${txn.id} synced successfully with Vercel backend.")
                } else {
                    Log.e("SyncWorker", "Failed to sync transaction ${txn.id}: HTTP $responseCode")
                    hasFailure = true
                }
                conn.disconnect()
            } catch (e: Exception) {
                Log.e("SyncWorker", "Network error syncing transaction ${txn.id}", e)
                hasFailure = true
            }
        }

        return if (hasFailure) Result.retry() else Result.success()
    }
}
