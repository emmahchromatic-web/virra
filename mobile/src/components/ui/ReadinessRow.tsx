// mobile/src/components/ui/ReadinessRow.tsx

import React, { useEffect, useState } from 'react'
import { View, StyleSheet } from 'react-native'
import { SymbolView } from 'expo-symbols'
import { VirraCard } from './VirraCard'
import { VirraText } from './VirraText'
import { Shimmer } from './Shimmer'
import { useReadinessStore } from '@/store/readiness'
import { colors, spacing } from '@/constants/theme'
import type { Confidence, CyclePhase } from '@/lib/readinessEngine'

const TICK_COUNT = 40
const ANIM_DURATION_MS = 600

// Interpolates between two hex colours by fraction t (0–1)
function lerpHex(a: string, b: string, t: number): string {
  const parse = (h: string, pos: number) => parseInt(h.slice(pos, pos + 2), 16)
  const r = Math.round(parse(a, 1) + (parse(b, 1) - parse(a, 1)) * t).toString(16).padStart(2, '0')
  const g = Math.round(parse(a, 3) + (parse(b, 3) - parse(a, 3)) * t).toString(16).padStart(2, '0')
  const bl = Math.round(parse(a, 5) + (parse(b, 5) - parse(a, 5)) * t).toString(16).padStart(2, '0')
  return `#${r}${g}${bl}`
}

// Score-driven colour: lime at peak, amber in mid-range, dawn orange when low
function scoreToColor(score: number): string {
  if (score >= 70) return lerpHex('#C8E820', '#D4FF26', (score - 70) / 30)
  if (score >= 50) return lerpHex('#FF9A3D', '#C8E820', (score - 50) / 20)
  return lerpHex('#FF6B3D', '#FF9A3D', score / 50)
}

function footerText(phase: CyclePhase | null, confidence: Confidence): string {
  if (confidence === 'low') {
    return 'LEARNING YOUR BASELINE · CHECK IN TO IMPROVE ACCURACY'
  }
  const confLabel = confidence === 'high' ? 'HIGH CONFIDENCE' : 'MEDIUM CONFIDENCE'
  if (!phase) return confLabel
  const phaseLabel = phase.toUpperCase()
  return `${phaseLabel} PHASE · CYCLE-CORRECTED · ${confLabel}`
}

export function ReadinessRow() {
  const { today, isLoading, isFirstRun } = useReadinessStore()
  const [filledCount, setFilledCount] = useState(0)

  // Animate tick fill whenever a new score arrives
  useEffect(() => {
    if (!today) return
    setFilledCount(0)
    const target = Math.round((today.score / 100) * TICK_COUNT)
    if (target === 0) return

    const intervalMs = ANIM_DURATION_MS / target
    let i = 0
    const timer = setInterval(() => {
      i += 1
      setFilledCount(i)
      if (i >= target) clearInterval(timer)
    }, intervalMs)

    return () => clearInterval(timer)
  }, [today?.score])

  // Show shimmer during first-run backfill or loading
  if (isLoading || isFirstRun) {
    return (
      <VirraCard>
        <View style={s.barRow}>
          <SymbolView name="bolt.fill" size={17} tintColor={colors.muted} />
          <Shimmer height={20} style={{ flex: 1 }} />
          <VirraText variant="mono" size={15} color={colors.muted} style={s.score}>—</VirraText>
        </View>
        <VirraText variant="mono" size={8} color={colors.muted} style={s.footer}>
          ANALYSING YOUR HEALTH HISTORY…
        </VirraText>
      </VirraCard>
    )
  }

  // Hide entirely when no HK data available (iPhone-only, no HRV/RHR)
  if (!today) return null

  const color = scoreToColor(today.score)
  const footerColor = today.confidence === 'low' ? colors.muted : `${color}4D`

  return (
    <VirraCard>
      <View style={s.barRow}>
        <SymbolView name="bolt.fill" size={17} tintColor={color} />
        <View style={s.ticks}>
          {Array.from({ length: TICK_COUNT }).map((_, i) => (
            <View
              key={i}
              style={[s.tick, i < filledCount ? { backgroundColor: color } : s.tickEmpty]}
            />
          ))}
        </View>
        <VirraText variant="mono" size={15} color={color} style={s.score}>
          {today.score}%
        </VirraText>
      </View>
      <VirraText variant="mono" size={8} style={[s.footer, { color: footerColor }]}>
        {footerText(today.phase, today.confidence)}
      </VirraText>
    </VirraCard>
  )
}

const s = StyleSheet.create({
  barRow:    { flexDirection: 'row', alignItems: 'center', gap: 10 },
  ticks:     { flex: 1, flexDirection: 'row', gap: 1.5 },
  tick:      { flex: 1, height: 20, borderRadius: 1.5 },
  tickEmpty: { backgroundColor: 'rgba(255,255,255,0.07)' },
  score:     { minWidth: 40, textAlign: 'right' },
  footer:    { marginTop: spacing.xs, letterSpacing: 1.2 },
})
