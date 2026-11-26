import { useTableSort } from '../lib/table-sort'
import { motion, useReducedMotion } from 'motion/react'
import { Activity, AlertTriangle, BarChart3, CheckCircle2, Download, Info, LoaderCircle, PieChart, Sparkles, Table2 } from 'lucide-react'
import { useEffect, useId, useRef, useState, type ReactNode } from 'react'
import type { AgentResponseBlock } from '../lib/types'
import { buybackAuditExplanation } from '../lib/buyback-audit-presentation'
import { marketplaceStatusCell, marketplaceStatusLabel } from '../lib/price-audit-status'
import { marketplaceColumnLabel } from '../lib/marketplace-report-presentation'
import { isSalesAuthorizationTable } from '../lib/sales-authorization-report'
import './AgentResponse.css'
import { CardHeading } from './CardHeading'

type Props = {
  blocks?: AgentResponseBlock[]
  fallbackText: string
}

const chartColors = ['#159987', '#e29a22', '#6077bf', '#75c8ba', '#d16b55', '#68788c', '#9a78c5', '#beca53']
const numberFormat = new Intl.NumberFormat('id-ID', { maximumFractionDigits: 2 })

export function AgentResponse({ blocks, fallbackText }: Props) {
  const reduceMotion = useReducedMotion() ?? false
  const sourceBlocks = blocks?.length ? blocks : parseFallback(fallbackText)
  const hasMarketplaceAudit = sourceBlocks.some(block => block.type === 'table' && block.title === 'Audit harga penjualan marketplace perhiasan')
  const displayBlocks = sourceBlocks
    .map(block => hasMarketplaceAudit && block.type === 'metric' && block.unit === 'penjualan' ? { ...block, label: marketplaceStatusLabel(block.label) } : block)
    .filter((block) => !(block.type === 'metric' && /^total\s+baris$/i.test(block.label.trim())))

  return <div className="agent-response-blocks">
    {displayBlocks.map((block, index) => {
      if (block.type === 'metric') {
        if (displayBlocks[index - 1]?.type === 'metric') return null
        let groupEnd = index
        while (groupEnd < displayBlocks.length && displayBlocks[groupEnd].type === 'metric') groupEnd += 1
        const group = displayBlocks.slice(index, groupEnd) as Array<Extract<AgentResponseBlock, { type: 'metric' }>>
        return <motion.div
          className="agent-response-metric-grid"
          key={`metrics-${index}`}
          initial={reduceMotion ? false : { opacity: 0, y: 9 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: reduceMotion ? 0 : 0.28, delay: reduceMotion ? 0 : Math.min(index * 0.045, 0.27), ease: [0.22, 1, 0.36, 1] }}
        >{group.map((metric, metricIndex) => <motion.div
          key={`${metric.label}-${metricIndex}`}
          initial={reduceMotion ? false : { scale: 0.97 }}
          animate={{ scale: 1 }}
          transition={{ duration: reduceMotion ? 0 : 0.28, delay: reduceMotion ? 0 : metricIndex * 0.045 }}
        >{renderBlock(metric, index + metricIndex, reduceMotion)}</motion.div>)}</motion.div>
      }
      return <motion.div
        className="agent-response-block"
        key={`${block.type}-${index}`}
        initial={reduceMotion ? false : { opacity: 0, y: 9 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: reduceMotion ? 0 : 0.28, delay: reduceMotion ? 0 : Math.min(index * 0.045, 0.27), ease: [0.22, 1, 0.36, 1] }}
      >{renderBlock(block, index, reduceMotion)}</motion.div>
    })}
  </div>
}

function renderBlock(block: AgentResponseBlock, index: number, reduceMotion: boolean) {
  switch (block.type) {
    case 'comparison': return <ComparisonBlock block={block} />
    case 'analysis': return <AnalysisBlock block={block} />
    case 'text':
      return block.variant === 'heading'
        ? <h3 className="agent-response-heading">{renderInline(block.text)}</h3>
        : <p className={`agent-response-text${block.variant === 'muted' ? ' is-muted' : ''}`}>{renderInline(block.text)}</p>
    case 'metric': {
      const displayLabel = metricDisplayLabel(block.label)
      return <section className={`agent-response-metric is-${block.tone ?? 'navy'}`} aria-label={`${displayLabel}: ${formatMetric(block.value, block.unit, displayLabel)}`}>
        <CardHeading as="h3" className="agent-response-metric-label" icon={<Sparkles size={19} />}>{displayLabel}</CardHeading>
        <motion.strong className="agent-response-metric-value" data-tooltip={formatMetric(block.value, block.unit, displayLabel)} tabIndex={0} initial={reduceMotion ? false : { scale: 0.96 }} animate={{ scale: 1 }} transition={{ duration: reduceMotion ? 0 : 0.36, delay: reduceMotion ? 0 : Math.min(index * 0.045, 0.27) + 0.08 }}>
          <span className="agent-response-metric-value-number">{formatMetricValue(block.value, block.unit, displayLabel)}</span>
          {metricUnitLabel(displayLabel, block.unit) && <span className="agent-response-metric-value-unit">{metricUnitLabel(displayLabel, block.unit)}</span>}
        </motion.strong>
        {block.note && <span className="agent-response-metric-note">{renderInline(block.note)}</span>}
      </section>
    }
    case 'line_chart':
      return <LineChart block={block} reduceMotion={reduceMotion} />
    case 'bar_chart':
      return <BarChart block={block} reduceMotion={reduceMotion} />
    case 'donut_chart':
      return <DonutChart block={block} reduceMotion={reduceMotion} />
    case 'waterfall_chart':
      return <WaterfallChart block={block} reduceMotion={reduceMotion} />
    case 'table': return <AgentTable block={block} />
    case 'list':
      return <section className="agent-response-card agent-response-list-card">
        {block.title && <CardTitle icon={<CheckCircle2 size={14} />} title={block.title} />}
        <ul>{block.items.map((item, itemIndex) => <li key={itemIndex}><span className="agent-response-list-dot" />{renderInline(item)}</li>)}</ul>
      </section>
    case 'callout': {
      const Icon = block.tone === 'success' ? CheckCircle2 : block.tone === 'warning' || block.tone === 'critical' ? AlertTriangle : Info
      return <aside className={`agent-response-callout is-${block.tone}`}>
        <Icon size={16} />
        <div>{block.title && <strong>{renderInline(block.title)}</strong>}<p>{renderInline(block.text)}</p></div>
      </aside>
    }
  }
}

function CardTitle({ icon, title }: { icon: ReactNode; title?: string }) {
  if (!title) return null
  return <CardHeading as="h3" className="agent-response-card-title" icon={icon}>{renderInline(title)}</CardHeading>
}

function LineChart({ block, reduceMotion }: { block: Extract<AgentResponseBlock, { type: 'line_chart' }>; reduceMotion: boolean }) {
  const gradientId = `agent-line-fill-${useId().replace(/:/g, '')}`
  const allValues = block.series.flatMap((series) => series.points.map((point) => point.value))
  const min = Math.min(0, ...allValues)
  const max = Math.max(1, ...allValues)
  const width = 620
  const height = 220
  const left = block.unit === 'gram' || block.unit === 'pcs' ? 78 : 48
  const right = 12
  const top = 14
  const bottom = 34
  const plotWidth = width - left - right
  const plotHeight = height - top - bottom
  const x = (pointIndex: number, pointCount: number) => left + (pointCount <= 1 ? plotWidth / 2 : pointIndex * plotWidth / (pointCount - 1))
  const y = (value: number) => top + plotHeight - ((value - min) / (max - min || 1)) * plotHeight
  const ticks = [0, 0.5, 1].map((ratio) => min + (max - min) * ratio)
  const labelPoints = block.series[0]?.points ?? []
  const xLabels = [...new Set([0, Math.floor((labelPoints.length - 1) / 2), labelPoints.length - 1])].filter((pointIndex) => pointIndex >= 0)

  return <section className="agent-response-card agent-response-chart-card">
    <CardTitle icon={<Activity size={14} />} title={block.title} />
    <div className="agent-response-chart-wrap">
      <svg className="agent-response-line-chart" viewBox={`0 0 ${width} ${height}`} role="img" aria-label={`${block.title}. ${block.series.map((series) => `${series.name}: ${series.points.map((point) => `${point.label} ${numberFormat.format(point.value)}`).join(', ')}`).join('. ')}`}>
        <defs><linearGradient id={gradientId} x1="0" x2="0" y1="0" y2="1"><stop offset="0%" stopColor="#159987" stopOpacity=".18" /><stop offset="100%" stopColor="#159987" stopOpacity="0" /></linearGradient></defs>
        {ticks.map((tick, tickIndex) => <g key={tickIndex}>
          <line x1={left} x2={width - right} y1={y(tick)} y2={y(tick)} stroke="#e8edf3" strokeDasharray="3 5" />
          <text x={left - 8} y={y(tick) + 3} textAnchor="end" className="agent-response-axis-label">{formatChartValue(tick)}{block.unit === 'gram' ? ' gram' : block.unit === 'pcs' ? ' pcs' : ''}</text>
        </g>)}
        {xLabels.map((pointIndex) => <text key={pointIndex} x={x(pointIndex, labelPoints.length)} y={height - 8} textAnchor={pointIndex === 0 ? 'start' : pointIndex === labelPoints.length - 1 ? 'end' : 'middle'} className="agent-response-axis-label">{labelPoints[pointIndex]?.label}</text>)}
        {block.series.map((series, seriesIndex) => {
          const color = chartColors[seriesIndex % chartColors.length]
          const points = series.points.map((point, pointIndex) => `${x(pointIndex, series.points.length)},${y(point.value)}`)
          const linePath = points.map((point, pointIndex) => `${pointIndex === 0 ? 'M' : 'L'} ${point}`).join(' ')
          return <g key={series.name}>
            {seriesIndex === 0 && <path d={`${linePath} L ${x(series.points.length - 1, series.points.length)} ${height - bottom} L ${x(0, series.points.length)} ${height - bottom} Z`} fill={`url(#${gradientId})`} />}
            <motion.path d={linePath} fill="none" stroke={color} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" initial={reduceMotion ? false : { pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: reduceMotion ? 0 : 0.7, ease: 'easeOut' }} />
            {series.points.map((point, pointIndex) => <circle key={`${point.label}-${pointIndex}`} cx={x(pointIndex, series.points.length)} cy={y(point.value)} r="3.2" fill={color} stroke="#fff" strokeWidth="1.5" />)}
          </g>
        })}
      </svg>
    </div>
    <div className="agent-response-legend">{block.series.map((series, seriesIndex) => <span key={series.name}><i style={{ background: chartColors[seriesIndex % chartColors.length] }} />{series.name}</span>)}</div>
  </section>
}

function BarChart({ block, reduceMotion }: { block: Extract<AgentResponseBlock, { type: 'bar_chart' }>; reduceMotion: boolean }) {
  const max = Math.max(1, ...block.items.map((item) => Math.abs(item.value)))
  const isRestockChart = /restock|kebutuhan/i.test(block.title)
  const unitLabel = block.unit ?? (isRestockChart ? 'gram' : 'nilai')
  const highlightedIndex = block.items.reduce((highestIndex, item, index) =>
    item.value > block.items[highestIndex].value ? index : highestIndex, 0)
  const highlightedItem = block.items[highlightedIndex]
  const comparisonItems = block.items.filter((_, index) => index !== highlightedIndex)

  const bar = (value: number, highlighted: boolean, index: number) => <div className={`agent-response-bar-track${highlighted ? ' is-highlighted' : ''}`} aria-hidden="true">
    <motion.span
      style={{ background: highlighted ? '#d28a16' : '#168779' }}
      initial={reduceMotion ? false : { width: 0 }}
      animate={{ width: `${Math.max(2, Math.abs(value) / max * 100)}%` }}
      transition={{ duration: reduceMotion ? 0 : 0.55, delay: reduceMotion ? 0 : Math.min(index * 0.045, 0.25), ease: 'easeOut' }}
    />
  </div>

  return <section className="agent-response-card agent-response-chart-card">
    <CardTitle icon={<BarChart3 size={14} />} title={block.title} />
    {highlightedItem ? <>
      <div className="agent-response-bar-highlight">
        <div className="agent-response-bar-highlight-heading">
          <div className="agent-response-bar-highlight-name">
            <span>{isRestockChart ? 'Kebutuhan tertinggi' : 'Nilai tertinggi'}</span>
            <strong>{renderInline(highlightedItem.label)}</strong>
          </div>
          <div className="agent-response-bar-highlight-value">
            <strong>{numberFormat.format(highlightedItem.value)}</strong>
            <span>{unitLabel}</span>
          </div>
        </div>
        {bar(highlightedItem.value, true, 0)}
        <BarDetail detail={highlightedItem.detail} highlighted />
      </div>
      {comparisonItems.length > 0 && <div className="agent-response-bars">
        <div className="agent-response-bar-comparison-title"><span>{isRestockChart ? 'Jenis lainnya' : 'Perbandingan lainnya'}</span><span>{unitLabel}</span></div>
        {comparisonItems.map((item, index) => <div className="agent-response-bar-row" key={`${item.label}-${index}`}>
          <div className="agent-response-bar-heading">
            <span title={item.label}>{renderInline(item.label)}</span>
            <strong>{numberFormat.format(item.value)} <small>{unitLabel}</small></strong>
          </div>
          {bar(item.value, false, index + 1)}
          <BarDetail detail={item.detail} />
        </div>)}
      </div>}
    </> : <p className="agent-response-bar-empty">Belum ada data untuk ditampilkan.</p>}
  </section>
}

function BarDetail({ detail, highlighted = false }: { detail?: string; highlighted?: boolean }) {
  const facts = detail?.split(/\s*;\s*/).filter(Boolean) ?? []
  if (!facts.length) return null
  return <div className={`agent-response-bar-detail${highlighted ? ' is-highlighted' : ''}`}>
    {facts.map((fact, index) => <span key={`${fact}-${index}`}>{renderInline(fact)}</span>)}
  </div>
}

function DonutChart({ block, reduceMotion }: { block: Extract<AgentResponseBlock, { type: 'donut_chart' }>; reduceMotion: boolean }) {
  const total = block.items.reduce((sum, item) => sum + Math.max(0, item.value), 0)
  const circumference = 2 * Math.PI * 54
  let previousFraction = 0
  return <section className="agent-response-card agent-response-donut-card">
    <CardTitle icon={<PieChart size={14} />} title={block.title} />
    <div className="agent-response-donut-layout">
      <div className="agent-response-donut-visual">
        <svg viewBox="0 0 144 144" role="img" aria-label={`${block.title}. ${block.items.map((item) => `${item.label} ${numberFormat.format(item.value)}`).join(', ')}`}>
          <circle cx="72" cy="72" r="54" fill="none" stroke="#edf1f5" strokeWidth="18" />
          {total > 0 && <g transform="rotate(-90 72 72)">{block.items.map((item, index) => {
            const fraction = Math.max(0, item.value) / total
            const offset = -previousFraction * circumference
            previousFraction += fraction
            return <motion.circle key={`${item.label}-${index}`} cx="72" cy="72" r="54" fill="none" stroke={chartColors[index % chartColors.length]} strokeWidth="18" strokeDasharray={`${fraction * circumference} ${circumference}`} strokeDashoffset={offset} initial={reduceMotion ? false : { opacity: 0, scale: 0.88 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: reduceMotion ? 0 : 0.42, delay: reduceMotion ? 0 : index * 0.06 }} />
          })}</g>}
        </svg>
        <div className="agent-response-donut-center"><strong>{block.centerValue ?? numberFormat.format(total)}</strong><span>{block.centerLabel ?? 'Total'}{block.unit === 'gram' ? ' · gram' : block.unit === 'pcs' ? ' · pcs' : ''}</span></div>
      </div>
      <div className="agent-response-donut-legend">{block.items.map((item, index) => <div key={`${item.label}-${index}`}><i style={{ background: chartColors[index % chartColors.length] }} /><span>{renderInline(item.label)}</span><strong>{numberFormat.format(item.value)}{block.unit === 'gram' ? <small> gram</small> : block.unit === 'pcs' ? <small> pcs</small> : null}<small>{total > 0 ? `${Math.round(item.value / total * 100)}%` : '0%'}</small></strong></div>)}</div>
    </div>
  </section>
}

function WaterfallChart({ block, reduceMotion }: { block: Extract<AgentResponseBlock, { type: 'waterfall_chart' }>; reduceMotion: boolean }) {
  const width = 760
  const height = 218
  const right = 20
  const top = 20
  const baseline = 148
  const values: number[] = [block.startValue]
  const steps = block.steps.map((step) => {
    const from = values[values.length - 1]
    const to = from + step.value
    values.push(to)
    return { ...step, from, to }
  })
  const max = Math.max(1, block.endValue, ...values)
  const left = Math.max(72, numberFormat.format(max).length * 7.5 + 16)
  const plotHeight = baseline - top
  const y = (value: number) => top + plotHeight - value / max * plotHeight
  const segmentCount = steps.length + 2
  const slot = (width - left - right) / segmentCount
  const barWidth = Math.min(62, slot * 0.42)
  const centerX = (index: number) => left + slot * (index + 0.5)
  const endColor = block.endValue > 0 ? '#d28a16' : '#159987'
  const equationLabel = [
    numberFormat.format(block.startValue),
    ...steps.map((step) => `${step.value < 0 ? '−' : step.value > 0 ? '+' : ''} ${numberFormat.format(Math.abs(step.value))}`),
    `= ${numberFormat.format(block.endValue)}`,
    block.unit ?? 'nilai',
  ].join(' ')

  return <section className="agent-response-card agent-response-waterfall-card">
    <CardTitle icon={<Activity size={14} />} title={block.title} />
    <div className="agent-response-waterfall-scroll">
      <svg className="agent-response-waterfall-svg" viewBox={`0 0 ${width} ${height}`} role="img" aria-label={`${block.title}. ${block.startLabel} ${numberFormat.format(block.startValue)} ${block.unit ?? ''}; ${steps.map((step) => `${step.label} ${step.value}`).join('; ')}; ${block.endLabel} ${numberFormat.format(block.endValue)} ${block.unit ?? ''}`}>
        {[0, 0.5, 1].map((ratio) => {
          const value = max * ratio
          const tickY = y(value)
          return <g key={ratio}>
            <line x1={left} x2={width - right} y1={tickY} y2={tickY} stroke="#e8edf3" strokeDasharray="3 5" />
            <text x={left - 8} y={tickY + 4} textAnchor="end" className="agent-response-waterfall-axis">{numberFormat.format(value)}</text>
          </g>
        })}
        <line x1={left} x2={width - right} y1={baseline} y2={baseline} stroke="#cfd7e1" />
        {steps.map((step, index) => {
          const startX = centerX(index) + barWidth / 2
          const nextX = centerX(index + 1) - barWidth / 2
          return <line key={`connector-${index}`} x1={startX} x2={nextX} y1={y(step.from)} y2={y(step.from)} stroke="#aab5c3" strokeDasharray="4 4" />
        })}
        {steps.length > 0 && <line x1={centerX(steps.length) + barWidth / 2} x2={centerX(segmentCount - 1) - barWidth / 2} y1={y(steps[steps.length - 1].to)} y2={y(steps[steps.length - 1].to)} stroke="#aab5c3" strokeDasharray="4 4" />}
        <motion.rect
          x={centerX(0) - barWidth / 2}
          y={y(block.startValue)}
          width={barWidth}
          height={Math.max(2, baseline - y(block.startValue))}
          rx="5"
          fill="#d28a16"
          initial={reduceMotion ? false : { opacity: 0, scaleY: 0.15, transformOrigin: 'bottom' }}
          animate={{ opacity: 1, scaleY: 1 }}
          transition={{ duration: reduceMotion ? 0 : 0.45, ease: 'easeOut' }}
        />
        {steps.map((step, index) => {
          const topY = Math.min(y(step.from), y(step.to))
          const color = step.value < 0 ? '#159987' : step.value > 0 ? '#6077bf' : '#9aa7b6'
          const signedValue = `${step.value < 0 ? '−' : step.value > 0 ? '+' : ''}${numberFormat.format(Math.abs(step.value))}`
          return <g key={`${step.label}-${index}`}>
            <motion.rect
              x={centerX(index + 1) - barWidth / 2}
              y={topY}
              width={barWidth}
              height={Math.max(2, Math.abs(y(step.from) - y(step.to)))}
              rx="4"
              fill={color}
              initial={reduceMotion ? false : { opacity: 0, scaleY: 0.15, transformOrigin: 'center' }}
              animate={{ opacity: 1, scaleY: 1 }}
              transition={{ duration: reduceMotion ? 0 : 0.4, delay: reduceMotion ? 0 : index * 0.06, ease: 'easeOut' }}
            />
            <text x={centerX(index + 1)} y={Math.max(16, topY - 8)} textAnchor="middle" className="agent-response-waterfall-value">{signedValue}</text>
            <text x={centerX(index + 1)} y={baseline + 22} textAnchor="middle" className="agent-response-waterfall-label">{chartLabelLines(step.label).map((line, lineIndex) => <tspan key={lineIndex} x={centerX(index + 1)} dy={lineIndex === 0 ? 0 : 13}>{line}</tspan>)}</text>
          </g>
        })}
        <motion.rect
          x={centerX(segmentCount - 1) - barWidth / 2}
          y={y(block.endValue)}
          width={barWidth}
          height={Math.max(2, baseline - y(block.endValue))}
          rx="5"
          fill={endColor}
          initial={reduceMotion ? false : { opacity: 0, scaleY: 0.15, transformOrigin: 'bottom' }}
          animate={{ opacity: 1, scaleY: 1 }}
          transition={{ duration: reduceMotion ? 0 : 0.45, delay: reduceMotion ? 0 : 0.14, ease: 'easeOut' }}
        />
        <text x={centerX(0)} y={Math.max(16, y(block.startValue) - 8)} textAnchor="middle" className="agent-response-waterfall-value">{numberFormat.format(block.startValue)}</text>
        <text x={centerX(0)} y={baseline + 22} textAnchor="middle" className="agent-response-waterfall-label">{chartLabelLines(block.startLabel).map((line, lineIndex) => <tspan key={lineIndex} x={centerX(0)} dy={lineIndex === 0 ? 0 : 13}>{line}</tspan>)}</text>
        <text x={centerX(segmentCount - 1)} y={Math.max(16, y(block.endValue) - 8)} textAnchor="middle" className="agent-response-waterfall-value">{numberFormat.format(block.endValue)}</text>
        <text x={centerX(segmentCount - 1)} y={baseline + 22} textAnchor="middle" className="agent-response-waterfall-label">{chartLabelLines(block.endLabel).map((line, lineIndex) => <tspan key={lineIndex} x={centerX(segmentCount - 1)} dy={lineIndex === 0 ? 0 : 13}>{line}</tspan>)}</text>
      </svg>
    </div>
    <p className="agent-response-waterfall-equation" aria-label={equationLabel}>
      <span className="is-total">{numberFormat.format(block.startValue)}</span>
      {steps.map((step, index) => <span key={`${step.label}-${index}`} className="is-step">{step.value < 0 ? '−' : step.value > 0 ? '+' : '±'} {numberFormat.format(Math.abs(step.value))}</span>)}
      <span className="is-total">= {numberFormat.format(block.endValue)}</span>
      <small>{block.unit ?? 'unit'}</small>
    </p>
  </section>
}

function chartLabelLines(label: string) {
  const words = label.split(/\s+/)
  if (label.length <= 17 || words.length === 1) return [label.slice(0, 20)]
  const firstLine: string[] = []
  let firstLength = 0
  while (words.length && firstLength + words[0].length + (firstLine.length ? 1 : 0) <= 17) {
    const word = words.shift()!
    firstLine.push(word)
    firstLength += word.length + (firstLine.length > 1 ? 1 : 0)
  }
  const secondLine = words.join(' ')
  return [firstLine.join(' '), secondLine.length > 20 ? `${secondLine.slice(0, 19)}…` : secondLine].filter(Boolean)
}

const metricIntegerFormat = new Intl.NumberFormat('id-ID', { maximumFractionDigits: 0 })
const metricBankAmountFormat = new Intl.NumberFormat('id-ID', { maximumFractionDigits: 2 })
const metricDecimalFormat = new Intl.NumberFormat('id-ID', { maximumFractionDigits: 3 })

function metricDisplayLabel(label: string) {
  return /^total\s+harga\s+online(?:\s+final)?$/i.test(label.trim()) ? 'Total penjualan online' : label
}

function metricUnitLabel(label?: string, unit?: string) {
  const normalizedUnit = unit?.trim()
  if (!normalizedUnit) return ''

  // A stale/generated response must not label payment amounts as weight.
  if (/gram/i.test(normalizedUnit) && label && /transaksi|non[\s-]?cash|debet|debit|credit|kredit|transfer|harga|penjualan|pendapatan|biaya/i.test(label)) {
    return 'IDR'
  }
  if (/^idr$/i.test(normalizedUnit)) return 'IDR'
  return normalizedUnit
}

function formatMetricValue(value: string | number, unit?: string, label?: string) {
  const displayUnit = metricUnitLabel(label, unit).toLowerCase()
  const numericValue = displayUnit === 'gram' ? weightCell(value) : currencyCell(value)
  if (numericValue === null) return typeof value === 'string' ? value : String(value)
  if (displayUnit === 'idr' && label && /uang\s+(?:masuk|keluar)/i.test(label)) return metricBankAmountFormat.format(numericValue)
  return (displayUnit === 'gram' ? metricDecimalFormat : metricIntegerFormat).format(numericValue)
}

function formatMetric(value: string | number, unit?: string, label?: string) {
  const displayUnit = metricUnitLabel(label, unit)
  const formatted = formatMetricValue(value, unit, label)
  return displayUnit ? `${formatted} ${displayUnit}` : formatted
}

function formatChartValue(value: number) {
  const magnitude = Math.abs(value)
  if (magnitude >= 1_000_000_000) return `${numberFormat.format(value / 1_000_000_000)} M`
  if (magnitude >= 1_000_000) return `${numberFormat.format(value / 1_000_000)} jt`
  if (magnitude >= 1_000) return `${numberFormat.format(value / 1_000)} rb`
  return numberFormat.format(value)
}

function renderInline(text: string): ReactNode[] {
  const tokenPattern = /(\*\*[^*]+\*\*|`[^`]+`|\*[^*]+\*)/g
  return text.split(tokenPattern).filter(Boolean).map((part, index) => {
    if (part.startsWith('**') && part.endsWith('**')) return <strong key={index}>{part.slice(2, -2)}</strong>
    if (part.startsWith('`') && part.endsWith('`')) return <code key={index}>{part.slice(1, -1)}</code>
    if (part.startsWith('*') && part.endsWith('*')) return <em key={index}>{part.slice(1, -1)}</em>
    return part
  })
}

function parseFallback(answer: string): AgentResponseBlock[] {
  const lines = answer.replace(/^```(?:markdown|md)?\s*/i, '').replace(/\s*```$/, '').split(/\r?\n/)
  const blocks: AgentResponseBlock[] = []
  let paragraph: string[] = []
  const flush = () => {
    const text = paragraph.join(' ').trim()
    if (text) blocks.push({ type: 'text', text, variant: 'body' })
    paragraph = []
  }
  const parseCells = (line: string) => line.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map((cell) => cell.trim())

  for (let index = 0; index < lines.length && blocks.length < 16; index += 1) {
    const line = lines[index].trim()
    if (!line) { flush(); continue }
    const heading = line.match(/^#{1,4}\s+(.+)$/)
    if (heading) { flush(); blocks.push({ type: 'text', text: heading[1].replace(/\s*#+$/, ''), variant: 'heading' }); continue }
    if (line.includes('|') && index + 1 < lines.length && /^\s*\|?\s*:?-{3,}/.test(lines[index + 1])) {
      flush()
      const columns = parseCells(line)
      index += 1
      const rows: Array<Array<string | null>> = []
      while (index + 1 < lines.length && lines[index + 1].includes('|')) { index += 1; rows.push(parseCells(lines[index])) }
      blocks.push({ type: 'table', columns, rows: rows.map((row) => columns.map((_, columnIndex) => row[columnIndex] ?? null)) })
      continue
    }
    const listItem = line.match(/^\s*(?:[-*+]\s+|\d+[.)]\s+)(.+)$/)
    if (listItem) {
      flush()
      const items = [listItem[1]]
      while (index + 1 < lines.length) {
        const next = lines[index + 1].match(/^\s*(?:[-*+]\s+|\d+[.)]\s+)(.+)$/)
        if (!next) break
        items.push(next[1]); index += 1
      }
      blocks.push({ type: 'list', items })
      continue
    }
    if (/^([-*_]\s*){3,}$/.test(line)) { flush(); continue }
    paragraph.push(line.replace(/^>\s?/, ''))
  }
  flush()
  return blocks.length ? blocks : [{ type: 'text', text: answer, variant: 'body' }]
}

function numericCell(value: unknown): number | null {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null
  const text = String(value ?? '').replace(/\*|Rp|gram(?:\/hari)?|%|hari|dtk/gi, '').trim()
  if (!/^-?[\d.,]+$/.test(text)) return null
  const normalized = text.includes(',') ? text.replace(/\./g, '').replace(',', '.') : text
  const number = Number(normalized)
  return Number.isFinite(number) ? number : null
}
function barcodeColumn(column: string): boolean {
  return /(?:barcode|kode[_\s-]*barcode)/i.test(column)
}
function barcodeCell(value: unknown): number | null {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null
  const firstBarcode = String(value ?? '').match(/\d+/)?.[0]
  if (!firstBarcode) return null
  const barcode = Number(firstBarcode)
  return Number.isFinite(barcode) ? barcode : null
}
function currencyColumn(column: string): boolean {
  return !/^range\b|%|persen/i.test(column) && /\b(?:rp|idr|rupiah|omzet|pendapatan)\b|nilai\s+(?:penjualan|jual|transaksi)|harga|biaya/i.test(column)
}
function pcsColumn(column: string): boolean {
  if (/\b(?:gram|berat|weight|idr|rupiah|omzet|pendapatan|harga|biaya)\b|%|persen/i.test(column)) return false
  return /\b(?:pcs|qty|quantity|unit|units|stock_on_hand)\b|jumlah\s+(?:barang|unit)/i.test(column)
}
function pcsCell(value: unknown): number | null {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null
  const digits = String(value ?? '').trim().replace(/[^\d-]/g, '')
  if (!/^-?\d+$/.test(digits)) return null
  const count = Number(digits)
  return Number.isSafeInteger(count) ? count : null
}
function currencyCell(value: unknown): number | null {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null
  const text = String(value ?? '').replace(/\*|\bRp\.?|\bIDR\b|\s/gi, '')
  if (!/^-?\d[\d.,]*$/.test(text)) return null
  const normalized = text.includes(',') ? text.replace(/\./g, '').replace(',', '.')
    : /^-?\d{1,3}(?:\.\d{3})+$/.test(text) ? text.replace(/\./g, '') : text
  const amount = Number(normalized)
  return Number.isFinite(amount) ? amount : null
}
function weightColumn(column: string): boolean {
  return /\b(?:gram|berat|weight)\b/i.test(column) && !/harga|idr|rupiah|biaya|ongkos|selisih|^range\b|%|persen/i.test(column)
}
function weightCell(value: unknown): number | null {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null
  const text = String(value ?? '').replace(/\*/g, '').replace(/\s*gram(?:\/hari)?\s*$/i, '').trim()
  if (!/^-?\d+(?:[.,]\d+)*$/.test(text)) return null
  const normalized = text.includes(',') && text.includes('.')
    ? text.lastIndexOf(',') > text.lastIndexOf('.') ? text.replace(/\./g, '').replace(',', '.') : text.replace(/,/g, '')
    : text.includes(',') ? /^-?\d{1,3}(?:,\d{3})+$/.test(text) ? text.replace(/,/g, '') : text.replace(',', '.') : text
  const weight = Number(normalized)
  return Number.isFinite(weight) ? weight : null
}
const tableWeightFormat = new Intl.NumberFormat('en-US', { maximumFractionDigits: 3 })
const tablePcsFormat = new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 })
const tableCurrencyFormat = new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 0, maximumFractionDigits: 2 })
const tableRateFormat = new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 0, maximumFractionDigits: 6 })
function tableColumnClass(column: string) {
  if (/marketplace/i.test(column)) return 'is-marketplace-column'
  if (/rekening\s+toko|kode\s+bank|(?:status|hasil)\s+pemeriksaan/i.test(column)) return 'is-bank-column'
  if (/^range\b/i.test(column)) return 'is-reference-range'
  if (/^keterangan\s+pemeriksaan/i.test(column)) return 'is-audit-explanation'
  return ''
}
function AgentColumn({ column, index, sorting, numeric }: { column: string; index: number; sorting: ReturnType<typeof useTableSort>; numeric: boolean }) {
  const className = tableColumnClass(column)
  return numeric ? sorting.header(String(index), renderInline(column), true, className) : <th scope="col" className={className || undefined}>{renderInline(column)}</th>
}
function excelColumnName(index: number) {
  let name = ''
  while (index > 0) {
    const remainder = (index - 1) % 26
    name = String.fromCharCode(65 + remainder) + name
    index = Math.floor((index - 1) / 26)
  }
  return name
}
function AgentTable({ block }: { block: Extract<AgentResponseBlock, {type: 'table'}> }) {
  const tablePageSize = 10
  const [visibleRows, setVisibleRows] = useState(tablePageSize)
  const [exporting, setExporting] = useState(false)
  const [exportError, setExportError] = useState<string | null>(null)
  const tableScrollRef = useRef<HTMLDivElement>(null)
  const scrollToLatestAfterLoadRef = useRef(false)
  const sorting = useTableSort(undefined, () => setVisibleRows(tablePageSize))
  useEffect(() => setVisibleRows(tablePageSize), [block.columns, block.rows])
  useEffect(() => {
    if (!scrollToLatestAfterLoadRef.current) return
    scrollToLatestAfterLoadRef.current = false
    const scrollElement = tableScrollRef.current
    if (!scrollElement) return
    const frame = window.requestAnimationFrame(() => {
      scrollElement.scrollTo({ top: scrollElement.scrollHeight, behavior: 'smooth' })
    })
    return () => window.cancelAnimationFrame(frame)
  }, [visibleRows])
  const isMarketplaceSalesTable = /marketplace|penjualan\s+online|harga\s+online/i.test([block.title ?? '', ...block.columns].join(' '))
  const isMarketplaceAudit = /^Audit harga penjualan marketplace (?:perhiasan|logam mulia)$/.test(block.title ?? '')
  const isBuybackAudit = /^Audit harga buyback (?:perhiasan|logam mulia)$/.test(block.title ?? '')
  const displayColumnIndexes = block.columns
    .map((column, index) => ({ column, index }))
    .filter(({ column }) => !(isBuybackAudit && /^sumber\s+barang$/i.test(column.trim())))
    .map(({ index }) => index)
  const displayColumns = displayColumnIndexes.map(index => isMarketplaceSalesTable ? marketplaceColumnLabel(block.columns[index]) : block.columns[index])
  const displayRows = block.rows.map(row => displayColumnIndexes.map(index => {
    const value = row[index] ?? null
    if (isMarketplaceAudit) return marketplaceStatusCell(block.columns[index], value)
    return isBuybackAudit && /keterangan/i.test(block.columns[index]) && typeof value === 'string' ? buybackAuditExplanation(value) : value
  }))
  const isPriceAuditTable = /^(?:Audit harga (?:penjualan(?: marketplace)?|buyback) perhiasan|Audit harga (?:buyback|penjualan marketplace) logam mulia|Daftar acuan pemeriksaan harga)$/.test(block.title ?? '')
  const isBankReconciliationTable = displayColumns.some(column => /status\s+pemeriksaan/i.test(column))
    && displayColumns.some(column => /nominal\s+bank/i.test(column))
    && displayColumns.some(column => /keterangan\s+pemeriksaan/i.test(column))
  const isBankTransactionsTable = displayColumns.some(column => /rekening\s+toko/i.test(column))
    && displayColumns.some(column => /jenis\s+transaksi/i.test(column))
    && displayColumns.some(column => /uang\s+masuk/i.test(column))
  const isSalesAuthorization = isSalesAuthorizationTable(displayColumns)
  const canExport = isBankReconciliationTable || isPriceAuditTable || isMarketplaceSalesTable || isSalesAuthorization
  const matchStatusIndex = displayColumns.findIndex(column => /status\s+pemeriksaan/i.test(column))
  const currencyColumns = displayColumns.map(currencyColumn)
  const weightColumns = displayColumns.map(weightColumn)
  const pcsColumns = displayColumns.map(pcsColumn)
  const barcodeColumns = displayColumns.map(barcodeColumn)
  const cellNumber = (value: unknown, index: number) => barcodeColumns[index] ? barcodeCell(value) : currencyColumns[index] ? currencyCell(value) : weightColumns[index] ? weightCell(value) : pcsColumns[index] ? pcsCell(value) : numericCell(value)
  const numericColumns = displayColumns.map((_, index) => displayRows.some(row => cellNumber(row[index], index) !== null))
  const isRestockProjection = /restock per jenis/i.test(block.title ?? '')
  const hasBaseline = displayColumns.some(column => /patokan/i.test(column))
  const orderedRows = sorting.order(displayRows, (row, key) => cellNumber(row[Number(key)], Number(key)))
  const shownRows = orderedRows.slice(0, visibleRows)
  const hasMoreRows = visibleRows < orderedRows.length
  const loadMoreRows = () => {
    if (!hasMoreRows) return
    scrollToLatestAfterLoadRef.current = true
    setVisibleRows((current) => Math.min(current + tablePageSize, orderedRows.length))
  }
  const exportTable = async () => {
    if (exporting || !canExport || !displayColumns.length) return
    setExporting(true)
    setExportError(null)
    try {
      if (isSalesAuthorization) {
        const { exportSalesAuthorizationExcel } = await import('../lib/report-excel')
        await exportSalesAuthorizationExcel({ title: block.title, columns: displayColumns, rows: orderedRows })
        return
      }
      if (isMarketplaceSalesTable) {
        const { exportMarketplaceSalesExcel } = await import('../lib/report-excel')
        await exportMarketplaceSalesExcel({ title: block.title, columns: displayColumns, rows: orderedRows })
        return
      }
      if (isPriceAuditTable) {
        const { exportPriceAuditExcel } = await import('../lib/report-excel')
        await exportPriceAuditExcel({ title: block.title, columns: displayColumns, rows: orderedRows })
        return
      }
      const { default: ExcelJS } = await import('exceljs')
      const workbook = new ExcelJS.Workbook()
      workbook.creator = 'Italy Agent AI'
      workbook.subject = 'Pencocokan rekening koran'
      workbook.created = new Date()
      const worksheet = workbook.addWorksheet('Pencocokan')
      worksheet.views = [{ state: 'frozen', ySplit: 2, topLeftCell: 'A3' }]
      worksheet.mergeCells(1, 1, 1, displayColumns.length)
      const titleCell = worksheet.getCell(1, 1)
      titleCell.value = block.title || 'Pencocokan rekening koran'
      titleCell.font = { name: 'Aptos Display', size: 15, bold: true, color: { argb: 'FFFFFFFF' } }
      titleCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF2458C8' } }
      titleCell.alignment = { vertical: 'middle' }
      worksheet.getRow(1).height = 30

      const headerRow = worksheet.addRow(displayColumns)
      headerRow.height = 32
      headerRow.eachCell(cell => {
        cell.font = { name: 'Aptos', size: 10, bold: true, color: { argb: 'FF344A68' } }
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFEAF1FB' } }
        cell.alignment = { vertical: 'middle', wrapText: true }
        cell.border = { bottom: { style: 'medium', color: { argb: 'FFD6E1F0' } } }
      })

      const exportRows = orderedRows.map(row => row.map((rawValue, columnIndex) => {
        const column = displayColumns[columnIndex]
        if (currencyColumns[columnIndex]) return currencyCell(rawValue) ?? '—'
        if (weightColumns[columnIndex]) return weightCell(rawValue) ?? '—'
        if (pcsColumns[columnIndex]) return pcsCell(rawValue) ?? '—'
        if (rawValue === null || rawValue === undefined || rawValue === '') return '—'
        let value = String(rawValue)
        if (isBankReconciliationTable && /keterangan\s+pemeriksaan/i.test(column) && matchStatusIndex >= 0 && /cocok/i.test(String(row[matchStatusIndex] ?? ''))) {
          value = 'Tanggal, nominal, dan status uang masuk/keluar cocok.'
        }
        if (/status\s+pemeriksaan/i.test(column)) value = value.replace(/^✓\s*/, '')
        return value.replace(/\*\*([^*]+)\*\*/g, '$1').replace(/`([^`]+)`/g, '$1').replace(/\*([^*]+)\*/g, '$1')
      }))

      exportRows.forEach((values, rowIndex) => {
        const row = worksheet.addRow(values)
        row.eachCell((cell, columnNumber) => {
          const index = columnNumber - 1
          const column = displayColumns[index]
          cell.font = { name: 'Aptos', size: 10, color: { argb: 'FF526177' } }
          cell.alignment = { vertical: 'top', wrapText: true }
          cell.border = { bottom: { style: 'thin', color: { argb: 'FFE7ECF2' } } }
          if (rowIndex % 2 === 1) cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF8FAFD' } }
          if (currencyColumns[index] && typeof values[index] === 'number') {
            cell.numFmt = '"Rp" #,##0;[Red]-"Rp" #,##0;"—"'
            cell.alignment = { vertical: 'top', horizontal: 'right', wrapText: true }
          } else if (weightColumns[index] && typeof values[index] === 'number') {
            cell.numFmt = '#,##0.###'
            cell.alignment = { vertical: 'top', horizontal: 'right', wrapText: true }
          } else if (pcsColumns[index] && typeof values[index] === 'number') {
            cell.numFmt = '#,##0'
            cell.alignment = { vertical: 'top', horizontal: 'right', wrapText: true }
          }
          if (/status\s+pemeriksaan/i.test(column)) {
            const matched = /cocok/i.test(String(values[index] ?? '')) && !/belum|tidak/i.test(String(values[index] ?? ''))
            cell.font = { name: 'Aptos', size: 10, bold: true, color: { argb: matched ? 'FF147A69' : 'FF986218' } }
          }
        })
      })

      displayColumns.forEach((column, index) => {
        const contentWidth = exportRows.reduce((width, row) => Math.max(width, String(row[index] ?? '').length), column.length)
        worksheet.getColumn(index + 1).width = Math.min(58, Math.max(13, contentWidth + 2))
      })
      worksheet.autoFilter = `A2:${excelColumnName(displayColumns.length)}${exportRows.length + 2}`

      const buffer = await workbook.xlsx.writeBuffer()
      const file = new Blob([buffer as BlobPart], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
      const url = URL.createObjectURL(file)
      const link = document.createElement('a')
      const reportName = (block.title || 'pencocokan-rekening-koran').toLocaleLowerCase('id-ID').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
      const jakartaDate = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Jakarta', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date())
      link.href = url
      link.download = `${reportName || 'pencocokan-rekening-koran'}-${jakartaDate}.xlsx`
      document.body.appendChild(link)
      link.click()
      link.remove()
      window.setTimeout(() => URL.revokeObjectURL(url), 1000)
    } catch {
      setExportError('File Excel belum berhasil dibuat. Coba klik export lagi.')
    } finally {
      setExporting(false)
    }
  }
  return <section className={`agent-response-card agent-response-table-card${isRestockProjection ? ' is-restock-projection' : ''}${isBankReconciliationTable ? ' is-bank-reconciliation' : ''}${isBankTransactionsTable ? ' is-bank-transactions' : ''}${isBuybackAudit ? ' is-buyback-audit' : ''}`}>
    <div className="agent-response-table-heading-row">
      <CardTitle icon={<Table2 size={14} />} title={block.title} />
    </div>
    <div className="agent-response-table-frame">
    <div ref={tableScrollRef} className="agent-response-table-scroll"><table className={`agent-response-table${isRestockProjection ? ' is-restock-projection' : ''}${isBankReconciliationTable ? ' is-bank-reconciliation' : ''}${isBankTransactionsTable ? ' is-bank-transactions' : ''}${hasBaseline ? ' has-baseline-target' : ''}`}>
      <thead><tr>{displayColumns.map((column, columnIndex) => <AgentColumn key={`${column}-${columnIndex}`} column={column} index={columnIndex} sorting={sorting} numeric={numericColumns[columnIndex]} />)}</tr></thead>
      <tbody>{shownRows.map((row, rowIndex) => <tr key={rowIndex}>{displayColumns.map((column, columnIndex) => {
        const amount = currencyColumns[columnIndex] ? currencyCell(row[columnIndex]) : null
        const weight = weightColumns[columnIndex] ? weightCell(row[columnIndex]) : null
        const pcs = pcsColumns[columnIndex] ? pcsCell(row[columnIndex]) : null
        let value = amount !== null ? (isPriceAuditTable && /gram/i.test(column) ? tableRateFormat : tableCurrencyFormat).format(amount) : weight !== null ? tableWeightFormat.format(weight) : pcs !== null ? tablePcsFormat.format(pcs) : String(row[columnIndex] ?? '—')
        if (isBankReconciliationTable && /keterangan\s+pemeriksaan/i.test(column) && matchStatusIndex >= 0 && /cocok/i.test(String(row[matchStatusIndex] ?? ''))) {
          value = 'Tanggal, nominal, dan status uang masuk/keluar cocok.'
        }
        const cellClass = [numericColumns[columnIndex] ? 'is-number' : '', tableColumnClass(column)].filter(Boolean).join(' ') || undefined
        if (/(?:status|hasil)\s+pemeriksaan/i.test(column)) {
          const matched = value === 'Masih dalam batas range acuan' || /cocok/i.test(value) && !/belum|tidak/i.test(value)
          return <td key={columnIndex} className={cellClass}><span className={`agent-response-bank-status${matched ? ' is-matched' : ' is-review'}`}>{matched ? <CheckCircle2 size={14} aria-hidden="true" /> : <AlertTriangle size={14} aria-hidden="true" />}{value.replace(/^✓\s*/, '')}</span></td>
        }
        if (/^(?:risiko\b|di bawah target)/i.test(column)) {
          const atRisk = value.toLocaleLowerCase('id-ID').startsWith('ya')
          return <td key={columnIndex} className={cellClass}><span className={`agent-response-risk-badge${atRisk ? ' is-risk' : ' is-safe'}`}>{renderInline(value)}</span></td>
        }
        if (/^urgensi/i.test(column)) {
          const score = Math.max(1, Math.min(10, Math.round(Number(value) || 1)))
          const level = score >= 7 ? 'high' : score >= 4 ? 'medium' : 'low'
          return <td key={columnIndex} className={cellClass}><span className={`agent-response-urgency-badge is-${level}`} aria-label={`Urgensi ${score} dari 10`}><strong>{score}</strong><small>/ 10</small></span></td>
        }
        return <td key={columnIndex} className={cellClass}>{renderInline(value)}</td>
      })}</tr>)}</tbody>
    </table></div>
    {(orderedRows.length > tablePageSize || canExport) && <div className="agent-response-table-footer">
      <span>Menampilkan {Math.min(visibleRows, orderedRows.length)} dari {orderedRows.length} data</span>
      {hasMoreRows && <button className="agent-response-load-more" type="button" aria-label="Tambah data ke tabel" title="Tambah data" onClick={loadMoreRows}>+</button>}
      {canExport && <div className="agent-response-export-actions">
        {exportError && <span className="agent-response-export-error" role="alert">{exportError}</span>}
        <button className="agent-response-export-button" type="button" onClick={() => void exportTable()} disabled={exporting} aria-label={exporting ? 'Menyiapkan file Excel' : isMarketplaceSalesTable ? `Export Excel penjualan online ${block.title ?? ''}`.trim() : isPriceAuditTable ? `Export Excel ${block.title}` : 'Export Excel'}>
          {exporting ? <LoaderCircle size={14} className="spin" aria-hidden="true" /> : <Download size={14} aria-hidden="true" />}
          <span>{exporting ? 'Menyiapkan…' : 'Export Excel'}</span>
        </button>
      </div>}
    </div>}
    </div>
  </section>
}

function ComparisonBlock({ block }: { block: Extract<AgentResponseBlock, { type: 'comparison' }> }) {
  const difference = block.leftValue - block.rightValue
  const percentage = block.rightValue === 0 ? null : difference / Math.abs(block.rightValue) * 100
  const format = (value: number) => block.unit === 'IDR'
    ? new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 2 }).format(value)
    : `${new Intl.NumberFormat('id-ID', { maximumFractionDigits: 3 }).format(value)} ${block.unit}`
  return <section className="agent-response-card agent-comparison">
    <CardTitle icon={<BarChart3 size={19} />} title={block.title} />
    <div className="agent-comparison-values"><div><span>{block.leftLabel}</span><strong>{format(block.leftValue)}</strong></div><span className="agent-comparison-vs">vs</span><div><span>{block.rightLabel}</span><strong>{format(block.rightValue)}</strong></div></div>
    <div className="agent-comparison-delta"><strong>{difference === 0 ? 'Nilainya sama' : `${block.leftLabel} ${difference > 0 ? 'lebih besar' : 'lebih kecil'} ${format(Math.abs(difference))}`}</strong><span>{percentage === null ? 'Persentase tidak dihitung karena pembanding nol.' : `${numberFormat.format(Math.abs(percentage))}% ${percentage > 0 ? 'lebih besar' : percentage < 0 ? 'lebih kecil' : 'selisih'} dibanding ${block.rightLabel}.`}</span></div>
    {block.note && <p className="agent-response-text is-muted">{renderInline(block.note)}</p>}
  </section>
}
function AnalysisBlock({ block }: { block: Extract<AgentResponseBlock, { type: 'analysis' }> }) {
  return <section className="agent-response-card agent-analysis"><CardTitle icon={<Activity size={19} />} title={block.title} /><p className="agent-response-text">{renderInline(block.summary)}</p><div className="agent-analysis-columns">{block.findings.length > 0 && <div><h4>Temuan</h4><ul>{block.findings.map((text, index) => <li key={index}>{renderInline(text)}</li>)}</ul></div>}{block.actions.length > 0 && <div><h4>Saran tindak lanjut</h4><ul>{block.actions.map((text, index) => <li key={index}>{renderInline(text)}</li>)}</ul></div>}</div></section>
}
