export type DistributionPriority = 'profit_bagus' | 'opening' | 'boost' | 'none'
export const distributionPriorityOptions: Array<{ value: DistributionPriority; label: string }> = [
  { value: 'profit_bagus', label: 'Exclusive' },
  { value: 'opening', label: 'Opening' },
  { value: 'boost', label: 'Boost' },
  { value: 'none', label: 'Tanpa flag' },
]
export const distributionPriorityLabel = (value?: DistributionPriority) => distributionPriorityOptions.find(option => option.value === value)?.label ?? 'Tanpa flag'
export const distributionPriorityRank = (value?: DistributionPriority) => distributionPriorityOptions.findIndex(option => option.value === (value ?? 'none'))
