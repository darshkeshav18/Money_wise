package com.moneywise.notifications

import com.moneywise.data.Transaction

object BankParsers {

    fun parse(pkg: String, bankLabel: String, text: String): Transaction? {
        return when {
            pkg.contains("sbi", true)     -> parseSBI(text, bankLabel)
            pkg.contains("hdfc", true)    -> parseHDFC(text, bankLabel)
            pkg.contains("canara", true)  -> parseCanara(text, bankLabel)
            pkg.contains("union", true) || pkg.contains("ubi", true) -> parseUnionBank(text, bankLabel)
            pkg.contains("super.payments", true) || pkg.contains("super.money", true) || pkg.contains("supermoney", true) -> parseSuperMoney(text, bankLabel)
            else -> null
        }
    }

    // ---------- CANARA BANK ----------
    private fun parseCanara(text: String, bankLabel: String): Transaction? {
        val amount = Regex("""INR\s?([0-9,]+(?:\.[0-9]{1,2})?)""", RegexOption.IGNORE_CASE)
            .find(text)?.groupValues?.get(1)?.replace(",", "")?.toDoubleOrNull() ?: return null

        val type = when {
            Regex("""\bDEBITED\b|\bDr\.?\b""", RegexOption.IGNORE_CASE).containsMatchIn(text) -> "debit"
            Regex("""\bCREDITED\b|\bCr\.?\b""", RegexOption.IGNORE_CASE).containsMatchIn(text) -> "credit"
            else -> return null
        }

        val reason = Regex("""towards\s+([^.]+)""", RegexOption.IGNORE_CASE).find(text)?.groupValues?.get(1)?.trim()
            ?: Regex("""\bto\s+([A-Za-z0-9 &._-]+?)\s*;""", RegexOption.IGNORE_CASE).find(text)?.groupValues?.get(1)?.trim()

        val availBal = Regex("""(?:Total\s+)?Avail\.?bal\s+INR\s?([0-9,]+(?:\.[0-9]{1,2})?)""", RegexOption.IGNORE_CASE)
            .find(text)?.groupValues?.get(1)?.replace(",", "")?.toDoubleOrNull()
            ?: Regex("""\bBal\s+INR\s?([0-9,]+(?:\.[0-9]{1,2})?)""", RegexOption.IGNORE_CASE)
                .find(text)?.groupValues?.get(1)?.replace(",", "")?.toDoubleOrNull()

        return Transaction(amount, type, reason, availBal, bankLabel)
    }

    // ---------- HDFC BANK ----------
    private fun parseHDFC(text: String, bankLabel: String): Transaction? {
        val amount = Regex("""(?:Rs\.?|INR)\s?([0-9,]+(?:\.[0-9]{1,2})?)""", RegexOption.IGNORE_CASE)
            .find(text)?.groupValues?.get(1)?.replace(",", "")?.toDoubleOrNull() ?: return null

        val type = when {
            Regex("""\bSent\b|\bdebited\b""", RegexOption.IGNORE_CASE).containsMatchIn(text) -> "debit"
            Regex("""\bcredited\b|\bdeposited\b""", RegexOption.IGNORE_CASE).containsMatchIn(text) -> "credit"
            else -> return null
        }

        val reason = Regex("""\bTo\s+([A-Za-z0-9 .&_-]+?)\s+On\b""", RegexOption.IGNORE_CASE)
            .find(text)?.groupValues?.get(1)?.trim()
            ?: Regex("""from\s+VPA\s+([A-Za-z0-9.@_-]+)""", RegexOption.IGNORE_CASE)
                .find(text)?.groupValues?.get(1)

        val availBal = Regex("""(?:Avl|Avail)\.?\s?[Bb]al\.?\s?(?:Rs\.?|INR)?\s?([0-9,]+(?:\.[0-9]{1,2})?)""")
            .find(text)?.groupValues?.get(1)?.replace(",", "")?.toDoubleOrNull()

        return Transaction(amount, type, reason, availBal, bankLabel)
    }

    // ---------- SBI ----------
    private fun parseSBI(text: String, bankLabel: String): Transaction? {
        val type = when {
            Regex("""\bdebited\b""", RegexOption.IGNORE_CASE).containsMatchIn(text) -> "debit"
            Regex("""\bcredited\b""", RegexOption.IGNORE_CASE).containsMatchIn(text) -> "credit"
            else -> return null
        }

        val amount = Regex("""(?:debited|credited)\s+by\s+(?:Rs\.?|INR)?\s?([0-9,]+(?:\.[0-9]{1,2})?)""", RegexOption.IGNORE_CASE)
            .find(text)?.groupValues?.get(1)?.replace(",", "")?.toDoubleOrNull() ?: return null

        val reason = Regex("""trf to\s+([A-Za-z0-9 .&_-]+?)\s+If\b""", RegexOption.IGNORE_CASE)
            .find(text)?.groupValues?.get(1)?.trim()
            ?: Regex("""transfer from\s+([A-Za-z0-9 .&_-]+?)\s*-SBI""", RegexOption.IGNORE_CASE)
                .find(text)?.groupValues?.get(1)?.trim()

        val availBal = Regex("""(?:Avl|Avail)\.?\s?[Bb]al\.?\s?(?:Rs\.?|INR)?\s?([0-9,]+(?:\.[0-9]{1,2})?)""")
            .find(text)?.groupValues?.get(1)?.replace(",", "")?.toDoubleOrNull()

        return Transaction(amount, type, reason, availBal, bankLabel)
    }

    private fun parseSuperMoney(text: String, bankLabel: String): Transaction? {
        val amount = Regex("""(?:₹|INR|Rs\.?)\s?([0-9,]+(?:\.[0-9]{1,2})?)""", RegexOption.IGNORE_CASE)
            .find(text)?.groupValues?.get(1)?.replace(",", "")?.toDoubleOrNull() ?: return null

        val type = when {
            Regex("""\b(received|credited|deposited)\b""", RegexOption.IGNORE_CASE).containsMatchIn(text) -> "credit"
            Regex("""\b(sent|debited|paid)\b""", RegexOption.IGNORE_CASE).containsMatchIn(text) -> "debit"
            else -> return null
        }

        val reason = Regex("""(?:received from|sent to|paid to|to|from)\s+(.+?)(?:\s+(?:Deposited|on|at|from|to|in)\b|\.|\n|$)""", RegexOption.IGNORE_CASE)
            .find(text)?.groupValues?.get(1)?.trim()

        return Transaction(amount, type, reason ?: "UPI Transfer", null, bankLabel)
    }

    private fun parseUnionBank(text: String, bankLabel: String): Transaction? {
        val amount = Regex("""(?:Rs:?|INR|₹)\s?([0-9,]+(?:\.[0-9]{1,2})?)""", RegexOption.IGNORE_CASE)
            .find(text)?.groupValues?.get(1)?.replace(",", "")?.toDoubleOrNull() ?: return null

        val type = when {
            Regex("""\b(debited|debit|Dr\.?)\b""", RegexOption.IGNORE_CASE).containsMatchIn(text) -> "debit"
            Regex("""\b(credited|credit|Cr\.?)\b""", RegexOption.IGNORE_CASE).containsMatchIn(text) -> "credit"
            else -> return null
        }

        val reason = Regex("""Fvg:\s*(.+?)(?:\s+(?:Avl|Avail|Bal|Available)\b|\.|\n|$)""", RegexOption.IGNORE_CASE)
            .find(text)?.groupValues?.get(1)?.trim()

        val availBal = Regex("""(?:Avl|Avail|Bal|Available)\s?Bal\s*(?:Rs:?|INR|₹)?\s?([0-9,]+(?:\.[0-9]{1,2})?)""", RegexOption.IGNORE_CASE)
            .find(text)?.groupValues?.get(1)?.replace(",", "")?.toDoubleOrNull()

        return Transaction(amount, type, reason ?: "Union Bank Transfer", availBal, bankLabel)
    }
}
