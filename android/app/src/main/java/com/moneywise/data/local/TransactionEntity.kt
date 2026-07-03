package com.moneywise.data.local

import androidx.room.Entity
import androidx.room.PrimaryKey

@Entity(tableName = "transactions")
data class TransactionEntity(
    @PrimaryKey(autoGenerate = true) val id: Long = 0,
    val amount: Double,
    val type: String,              // "debit" / "credit"
    val category: String,          // "Need" / "Want" / "Savings" / "Uncategorized" / "Other Income"
    val reason: String?,
    val bank: String,
    val timestamp: Long,
    val availableBalance: Double?,
    val synced: Boolean = false,
    val dedupeKey: String
)
