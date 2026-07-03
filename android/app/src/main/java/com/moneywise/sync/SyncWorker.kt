package com.moneywise.sync

import android.content.Context
import androidx.work.CoroutineWorker
import androidx.work.WorkerParameters
import com.moneywise.data.local.AppDatabase

class SyncWorker(context: Context, params: WorkerParameters) : CoroutineWorker(context, params) {

    override suspend fun doWork(): Result {
        val dao = AppDatabase.getInstance(applicationContext).transactionDao()
        val unsynced = dao.getUnsynced()
        if (unsynced.isEmpty()) return Result.success()

        return try {
            // Replace BACKEND_URL with your backend API endpoint
            for (txn in unsynced) {
                // TODO: POST txn to BACKEND_URL/transactions
                dao.markSynced(txn.id)
            }
            Result.success()
        } catch (e: Exception) {
            Result.retry()
        }
    }
}
