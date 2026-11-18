import type { DistributionPriority } from './distribution-priority'
export type ItemCategory = 'X' | 'BIASA'
export type Role = 'admin' | 'pusat' | 'cabang'

export type User = {
  id: string
  name: string
  email: string
  role: Role
  branchId: string | null
  active: boolean
  createdAt: string
  updatedAt: string
}

export type ShipmentStatus = 'received' | 'pending' | 'partial' | 'review'
export type ShipmentPeriod = 'this-month' | 'three-months' | 'six-months' | 'one-year' | 'all'

export type SalesBranchSummary = {
  branchId: string
  alias: string
  invoiceCount: number
  detailCount: number
  quantity: number
  totalWeight: number
  salesAmount: number
}

export type SalesSummaryResult = {
  period: ShipmentPeriod
  dateFrom: string | null
  dateTo: string | null
  statusValid: 'DONE'
  totals: {
    branchCount: number
    invoiceCount: number
    detailCount: number
    quantity: number
    totalWeight: number
    salesAmount: number
  }
  branches: SalesBranchSummary[]
}

export type StockVsSalesJenisStatus = 'restock-review' | 'incoming' | 'healthy' | 'no-sales' | 'no-activity' | 'weight-missing'

export type StockVsSalesJenis = {
  kode: string
  nama: string
  physicalStockWeight: number
  openIncomingWeight: number
  availableWeight: number
  soldWeightMonth: number
  soldLinesMonth: number
  salesLinesWithoutWeight: number
  stockRecordsWithoutWeight: number
  openShipmentLinesWithoutWeight: number
  averageSalesWeightPerDay: number
  coverageDays: number | null
  status: StockVsSalesJenisStatus
  recommendation: string
}

export type StockVsSalesBranch = {
  branchId: string
  alias: string
  totals: {
    physicalStockWeight: number
    openIncomingWeight: number
    availableWeight: number
    soldWeightMonth: number
    salesLinesWithoutWeight: number
    stockRecordsWithoutWeight: number
    openShipmentLinesWithoutWeight: number
    jenisWithSales: number
    jenisWithNoSales: number
    jenisWithIncompleteSalesWeight: number
  }
  analysis: {
    topSellingJenis: Array<{
      kode: string
      nama: string
      soldWeightMonth: number
      shareOfBranchWeightPercent: number
    }>
    lowCoverageWithSales: Array<{
      kode: string
      nama: string
      soldWeightMonth: number
      availableWeight: number
      coverageDays: number
    }>
    stockWithoutSales: Array<{ kode: string; nama: string; availableWeight: number }>
    suggestions: string[]
  }
  jenis: StockVsSalesJenis[]
}

export type StockVsSalesResult = {
  period: {
    month: string
    dateFrom: string
    dateThrough: string
    elapsedDays: number
    safeStockDays: number
    timezone: 'Asia/Jakarta'
  }
  policy: {
    stock: string
    weight: string
    openIncoming: string
    sales: string
    coverage: string
  }
  totals: {
    branchCount: number
    jenisCount: number
    physicalStockWeight: number
    openIncomingWeight: number
    availableWeight: number
    soldWeightMonth: number
    salesLinesWithoutWeight: number
    stockRecordsWithoutWeight: number
    openShipmentLinesWithoutWeight: number
    jenisWithSales: number
    jenisWithNoSales: number
    jenisWithIncompleteSalesWeight: number
  }
  branches: StockVsSalesBranch[]
}

export type InventoryLocationSummary = {
  alias: string
  branchId: string
  sourceType: 'branch' | 'central'
  status: 'available' | 'unavailable'
  physicalStockWeight: number | null
  jenisWithStockCount: number | null
  recordsWithoutWeight: number | null
  departmentNamesUnavailable: boolean
  unavailableReason?: string
}

export type InventoryJenisLocation = {
  alias: string
  branchId: string
  sourceType: 'branch' | 'central'
  status: 'available' | 'unavailable'
  physicalStockWeight: number | null
  recordsWithoutWeight: number | null
}

export type InventoryJenisSummary = {
  kode: string
  nama: string
  centralStockWeight: number
  branchStockWeight: number
  networkStockWeight: number
  branchLocationsWithStock: number
  locations: InventoryJenisLocation[]
}

export type InventorySummaryResult = {
  mode: 'inventory-summary'
  asOf: string
  policy: {
    source: string
    stockFilter: string
    weightFormula: string
    deletedByFilter: string
    incomingShipments: string
  }
  summary: {
    locationCount: number
    availableLocationCount: number
    unavailableLocationCount: number
    branchCount: number
    centralSourceCount: number
    totalPhysicalStockWeight: number
    centralPhysicalStockWeight: number
    branchPhysicalStockWeight: number
    jenisCount: number
    jenisWithStockCount: number
    locationsWithIncompleteWeight: number
    recordsWithoutWeight: number
    departmentNamesUnavailableCount: number
  }
  locations: InventoryLocationSummary[]
  jenis: InventoryJenisSummary[]
  unavailableSources: Array<{ alias: string; branchId: string; sourceType: 'branch' | 'central'; reason: string }>
  note: string
  cacheStatus: 'hit' | 'miss' | 'coalesced'
}

export type UserSettings = {
  shipmentDefaultPeriod: ShipmentPeriod
  updatedAt: string | null
}

export type CleaningMinimumStock = {
  kodeDept: string
  namaDept: string
  minimumStock: number
  minimumWeight: number
}

export type CleaningPrioritySettings = {
  items: CleaningMinimumStock[]
  availableJenis: Array<{ kode: string; nama: string }>
  centralSourceAvailable: boolean
  updatedAt: string | null
}

export type DistributionFulfillmentMethod = 'branch-first' | 'even'

export type NetworkRestockSettings = {
  safeStockDays: number
  fulfillmentMethod: DistributionFulfillmentMethod
  updatedAt: string | null
}

export type AgentResponsePreferences = {
  detailLevel: 'low' | 'medium' | 'high'
  languageStyle: 'professional' | 'formal' | 'friendly' | 'casual'
  updatedAt: string | null
}

export type AgentDataSourceConfig = {
  id: string
  databaseName: string
  alias: string
  branchId: string
  sourceType: 'branch' | 'central'
  distributionPriority?: DistributionPriority
  itemCategory?: ItemCategory
  active: boolean
  createdAt: string
  updatedAt: string
}

export type AgentSourceSummary = {
  alias: string
  branchId: string
  sourceType?: 'branch' | 'central'
  distributionPriority?: DistributionPriority
  itemCategory?: ItemCategory
}

export type AgentStatus = {
  configured: boolean
  provider: 'Italy AI'
  model: string
  sources: AgentSourceSummary[]
  readPolicy: string
  attachmentLimits?: { maxFiles: number; maxFileMb: number; maxImageMb: number }
}

export type KnowledgeReference = { documentId: string; title: string; page: number; locationLabel?: string; chunkId: string; excerpt: string }
export type AgentChatAttachment = { id: string; filename: string; mime: string; size: number; createdAt: string }
export type AgentContextReferences = { knowledgeReferences?: KnowledgeReference[]; memoryReferences?: Array<{ id: string; title: string }>; contextWarnings?: string[]; memoryProposal?: { id: string; title: string; status: string } }

export type AgentChatMessage = AgentContextReferences & {
  id?: string
  requestId?: string
  role: 'user' | 'assistant'
  content: string
  attachments?: AgentChatAttachment[]
  blocks?: AgentResponseBlock[]
  usedSources?: AgentSourceSummary[]
  createdAt?: string
  feedback?: { rating: 'helpful' | 'needs-improvement'; category?: string; updatedAt: string } | null
}

export type AgentChatSessionSummary = {
  id: string
  title: string
  messageCount: number
  createdAt: string
  updatedAt: string
}

export type AgentChatSession = AgentChatSessionSummary & {
  messages: AgentChatMessage[]
  pendingAttachments?: AgentChatAttachment[]
}

export type AgentHistorySearchResult = {
  sessionId: string
  sessionTitle: string
  requestId: string
  messageId: string
  sequence: number
  createdAt: string
  question: string
  answer: string
  matchType: 'semantic' | 'keyword' | 'both'
}

export type AgentHistorySearchResponse = {
  items: AgentHistorySearchResult[]
  warning: string | null
}

export type AgentResponseBlock =
  | { type: 'text'; text: string; variant?: 'body' | 'heading' | 'muted' }
  | { type: 'comparison'; title: string; leftLabel: string; leftValue: number; rightLabel: string; rightValue: number; unit: 'gram' | 'pcs' | 'IDR'; note?: string }
  | { type: 'analysis'; title: string; summary: string; findings: string[]; actions: string[] }
  | { type: 'metric'; label: string; value: string | number; unit?: string; note?: string; tone?: 'navy' | 'teal' | 'amber' | 'violet' }
  | { type: 'line_chart'; title: string; series: Array<{ name: string; points: Array<{ label: string; value: number }> }>; unit?: string }
  | { type: 'bar_chart'; title: string; items: Array<{ label: string; value: number; detail?: string }>; unit?: string }
  | { type: 'donut_chart'; title: string; items: Array<{ label: string; value: number }>; centerLabel?: string; centerValue?: string; unit?: string }
  | { type: 'waterfall_chart'; title: string; startLabel: string; startValue: number; steps: Array<{ label: string; value: number }>; endLabel: string; endValue: number; unit?: string }
  | { type: 'table'; title?: string; columns: string[]; rows: Array<Array<string | number | null>> }
  | { type: 'list'; title?: string; items: string[] }
  | { type: 'callout'; tone: 'info' | 'success' | 'warning' | 'critical'; title?: string; text: string }

export type AgentChatResponse = AgentContextReferences & {
  requestId: string
  answer: string
  blocks?: AgentResponseBlock[]
  usedSources: AgentSourceSummary[]
  model: string
}

export type AgentChatProgress = {
  requestId: string
  stage: 'preparing' | 'thinking' | 'reading' | 'analyzing' | 'composing' | 'complete' | 'error'
  message: string
  detail: string
  updatedAt: string
}

export type CacheStats = {
  ttlSeconds: number
  maxEntries: number
  maxBytes: number
  entryCount: number
  hits: number
  misses: number
  coalescedRequests: number
  hitRate: number
  approxBytes: number
  clearedAt: string | null
}

export type ShipmentSummary = {
  noKirim: string
  destination: string | null
  destinationMismatch: boolean
  recordCount: number
  receivedRecordCount: number
  pendingRecordCount: number
  unknownStatusRecordCount: number
  totalWeight: number
  status: ShipmentStatus
  lastInputAt: string | null
}

export type ShipmentItem = {
  itemId: string
  noKirim: string
  destination: string | null
  productCode: string | null
  barcode: string | null
  name: string | null
  attribute: string | null
  groupCode: string | null
  departmentCode: string | null
  color: string | null
  receiptStatus: string | null
  weight: number | null
  inputDate: string | null
  receiveDate: string | null
}

export type ShipmentListResult = {
  items: ShipmentSummary[]
  page: number
  pageSize: number
  total: number
  totalPages: number
  statusCounts: Record<ShipmentStatus, number>
  inProcessByDestination: Array<{ destination: string; shipmentCount: number }>
  debug?: {
    source: string
    cacheStatus: 'hit' | 'miss' | 'coalesced'
    mongoRoundTripMs: number | null
    serviceMs: number
    page: number
    pageSize: number
    totalMatchingGroups: number
    returnedItems: number
    matchingSourceRecords: number
    period: ShipmentPeriod
    status: ShipmentStatus | 'all'
    searchApplied: boolean
  }
}

export type ShipmentDetailResult = {
  summary: ShipmentSummary
  items: ShipmentItem[]
  itemLimit: number
  nextItemCursor: string | null
}
