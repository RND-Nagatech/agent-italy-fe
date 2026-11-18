export type BankAccount = { id: string; branchId: string; sourceAlias: string; bankCode: string; bankName: string; accountNumber: string; accountName: string }
export type BankSelection = { branchIds: string[]; accountIds: string[]; from: string; to: string; method: 'TRANSFER' | 'ALL'; category: 'ALL' | 'PENJUALAN' | 'PEMBELIAN'; statementIds: string[] }
export type BankScopeResolved = { handled: true; selection: BankSelection; needsSource: boolean; needsDate: boolean; needsAccounts: boolean; conflict: boolean; accounts: BankAccount[]; warnings: string[]; documents: Array<{ id: string; filename: string; bankName: string; accountNumber: string; from: string; to: string; entryCount: number; complete: boolean }> }
export type BankScopeResult = BankScopeResolved | { handled: false }
export const isBankingQuery = (value: string) => /\bbank(?:nya)?\b|\btransfer\b|rekening|rekonsiliasi|mutasi|transaksional|transaksi\s+bank/i.test(value)
