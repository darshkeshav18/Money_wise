package com.moneywise.data

data class Transaction(
    val amount: Double,
    val type: String,              // "debit" | "credit"
    val reason: String?,           // e.g. "interest", "UPI-merchant@ybl"
    val availableBalance: Double?, // parsed from bank message, for reconciliation
    val bank: String,
    val timestamp: Long = System.currentTimeMillis()
)
