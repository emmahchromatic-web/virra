import React, { useEffect, useMemo, useState } from 'react';
import { View, ScrollView, Pressable, StyleSheet, SafeAreaView } from 'react-native';
import { SymbolView } from 'expo-symbols';
import { router } from 'expo-router';
import { supabase } from '@/lib/supabase';
import { colors, spacing, radius } from '@/constants/theme';
import { VirraText } from '@/components/ui/VirraText';
import { VirraCard } from '@/components/ui/VirraCard';
import AsyncStorage from '@react-native-async-storage/async-storage';

interface PlanTemplate {
  id:             string;
  name:           string;
  sport_type:     string;
  distance_goal:  string | null;
  duration_weeks: number;
  description:    string | null;
  tagline:        string | null;
}

/**
 * Card 247. A user holds one run block, one strength block and one mobility
 * block at a time, so modality is already a first-class idea everywhere except
 * this screen, which mixed all of them into a single scroll.
 *
 * The filter also softens a second problem: the plan detail CTA reads
 * "Replace <plan>" when a slot is occupied, which alarms people who have not
 * understood that plans live in per-modality slots. Choosing a modality here
 * teaches that model before they reach the CTA.
 */
const FILTER_KEY = 'virra:browse_modality';

const MODALITY_LABEL: Record<string, string> = {
  run:      'Run',
  strength: 'Strength',
  mobility: 'Mobility',
};

export default function BrowsePlansScreen() {
  const [templates, setTemplates] = useState<PlanTemplate[]>([]);
  const [loading,   setLoading]   = useState(true);
  const [modality,  setModality]  = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      // is_active hides templates replaced by Get Strong (the old generic
      // strength template) from the picker without deleting the row.
      const { data } = await supabase
        .from('plan_templates')
        .select('id, name, sport_type, distance_goal, duration_weeks, description, tagline')
        .eq('is_active', true)
        .order('sort_order');
      if (!cancelled) {
        setTemplates((data ?? []) as PlanTemplate[]);
        setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  // Remembered rather than reset each visit: someone browsing strength plans is
  // usually still browsing strength plans the next time they open this.
  useEffect(() => {
    AsyncStorage.getItem(FILTER_KEY).then((v) => { if (v) setModality(v); });
  }, []);

  function chooseModality(next: string) {
    setModality(next);
    AsyncStorage.setItem(FILTER_KEY, next).catch(() => { /* preference only */ });
  }

  // Built from what is actually in the catalogue, so an empty modality never
  // shows a tab that leads to "No plans available yet".
  const modalities = useMemo(() => {
    const seen: string[] = [];
    for (const t of templates) if (!seen.includes(t.sport_type)) seen.push(t.sport_type);
    return seen.sort((a, b) => {
      const order = ['run', 'strength', 'mobility'];
      return order.indexOf(a) - order.indexOf(b);
    });
  }, [templates]);

  const active  = modality && modalities.includes(modality) ? modality : modalities[0] ?? null;
  const visible = active ? templates.filter((t) => t.sport_type === active) : templates;

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.header}>
        <Pressable
          style={styles.headerBtn}
          onPress={() => router.back()}
          hitSlop={12}
          accessibilityRole="button"
          accessibilityLabel="Close"
        >
          <SymbolView name="chevron.left" size={18} tintColor={colors.muted} />
        </Pressable>
        <VirraText variant="display" size={24} color={colors.pulse}>Browse Plans</VirraText>
        <View style={styles.headerBtn} />
      </View>
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        {modalities.length > 1 && (
          <View style={styles.segmented}>
            {modalities.map((m) => {
              const on = m === active;
              return (
                <Pressable
                  key={m}
                  onPress={() => chooseModality(m)}
                  style={[styles.segment, on && styles.segmentActive]}
                  accessibilityRole="button"
                  accessibilityState={{ selected: on }}
                  accessibilityLabel={MODALITY_LABEL[m] ?? m}
                >
                  <VirraText variant="mono" size={12} color={on ? colors.mile : colors.breath}>
                    {(MODALITY_LABEL[m] ?? m).toUpperCase()}
                  </VirraText>
                </Pressable>
              );
            })}
          </View>
        )}
        <View style={styles.templateList}>
          {visible.map((t) => (
            <TemplateCard key={t.id} template={t} />
          ))}
          {templates.length === 0 && !loading && (
            <VirraText variant="body" color={colors.muted}>No plans available yet.</VirraText>
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function TemplateCard({ template }: { template: PlanTemplate }) {
  return (
    <Pressable onPress={() => router.push(`/(app)/plan/${template.id}` as any)}>
      <VirraCard style={styles.templateCard}>
        <View style={styles.templateHeader}>
          <View style={{ flex: 1 }}>
            <VirraText variant="mono" size={11} color={colors.dawn} style={{ letterSpacing: 1.5 }}>
              {template.sport_type.toUpperCase()}{template.distance_goal ? ` · ${template.distance_goal.replace(/_/g, ' ').toUpperCase()}` : ''}
            </VirraText>
            <VirraText variant="bodyMedium" size={16} color={colors.breath} style={{ marginTop: 4 }}>
              {template.name}
            </VirraText>
            {template.tagline && (
              <VirraText variant="body" size={12} color="rgba(244,237,224,0.5)" style={{ marginTop: 4, lineHeight: 18 }}>
                {template.tagline}
              </VirraText>
            )}
          </View>
          <View style={styles.templateRight}>
            <VirraText variant="mono" size={10} color={colors.muted}>
              {template.duration_weeks > 0 ? `${template.duration_weeks}w` : 'Ongoing'}
            </VirraText>
            <SymbolView name="chevron.right" size={14} tintColor={colors.muted} />
          </View>
        </View>
      </VirraCard>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  safe:           { flex: 1, backgroundColor: colors.mile },
  header:         { height: 52, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: spacing.lg },
  headerBtn:      { width: 18, height: 32, alignItems: 'flex-start', justifyContent: 'center' },
  scroll:         { padding: spacing.lg, paddingBottom: spacing.xxl, gap: spacing.lg },
  segmented:      { flexDirection: 'row', gap: spacing.xs, backgroundColor: colors.mist, borderRadius: radius.md, padding: 3, borderWidth: 1, borderColor: colors.control },
  segment:        { flex: 1, alignItems: 'center', paddingVertical: spacing.sm, borderRadius: radius.sm },
  segmentActive:  { backgroundColor: colors.pulse },
  templateList:   { gap: spacing.sm },
  templateCard:   { gap: 0 },
  templateHeader: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md },
  templateRight:  { alignItems: 'flex-end', gap: 4 },
});
