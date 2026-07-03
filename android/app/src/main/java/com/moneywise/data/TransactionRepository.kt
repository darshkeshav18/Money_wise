package com.moneywise.data

import com.moneywise.data.local.TransactionDao
import com.moneywise.data.local.TransactionEntity

class TransactionRepository(private val dao: TransactionDao) {

    fun buildDedupeKey(amount: Double, type: String, timestamp: Long): String {
        val bucket = timestamp / 120_000 // 2-minute window absorbs SMS+notification duplicates
        return "$amount-$type-$bucket"
    }

    // Reasons that should skip the categorization popup entirely
    private val autoSkipPatterns = listOf("interest", "refund", "reversal", "cashback")

    suspend fun handleIncomingTransaction(txn: Transaction): PendingAction {
        val key = buildDedupeKey(txn.amount, txn.type, txn.timestamp)
        val existing = dao.findByDedupeKey(key)
        if (existing != null) return PendingAction.Duplicate

        val autoCategory = txn.reason?.let { reason ->
            autoSkipPatterns.firstOrNull { reason.contains(it, ignoreCase = true) }
        }

        val category = if (autoCategory != null) "Other Income" else "Uncategorized"

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

        return if (autoCategory != null) {
            PendingAction.AutoFiled(id)       // no popup needed
        } else {
            PendingAction.NeedsCategorization(id, txn.amount, txn.type)  // show overlay
        }
    }

    suspend fun updateCategory(id: Long, category: String) {
        val all = dao.getAll()
        val entity = all.firstOrNull { it.id == id } ?: return
        dao.update(entity.copy(category = category, synced = false))
    }
}

sealed class PendingAction {
    data class NeedsCategorization(val id: Long, val amount: Double, val type: String) : PendingAction()
    data class AutoFiled(val id: Long) : PendingAction()
    object Duplicate : PendingAction()
}
