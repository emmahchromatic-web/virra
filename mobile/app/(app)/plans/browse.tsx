import React, { useEffect, useState } from 'react';
import { View, ScrollView, Pressable, StyleSheet, SafeAreaView } from 'react-native';
import { SymbolView } from 'expo-symbols';
import { router } from 'expo-router';
import { supabase } from '@/lib/supabase';
import { colors, spacing } from '@/constants/theme';
import { VirraText } from '@/components/ui/VirraText';
import { VirraCard } from '@/components/ui/VirraCard';

interface PlanTemplate {
  id:             string;
  name:           string;
  sport_type:     string;
  distance_goal:  string | null;
  duration_weeks: number;
  description:    string | null;
  tagline:        string | null;
}

export default function BrowsePlansScreen() {
  const [templates, setTemplates] = useState<PlanTemplate[]>([]);
  const [loading,   setLoading]   = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from('plan_templates')
        .select('id, name, sport_type, distance_goal, duration_weeks, description, tagline')
        .order('sort_order');
      if (!cancelled) {
        setTemplates((data ?? []) as PlanTemplate[]);
        setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

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
        <View style={styles.templateList}>
          {templates.map((t) => (
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
  templateList:   { gap: spacing.sm },
  templateCard:   { gap: 0 },
  templateHeader: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md },
  templateRight:  { alignItems: 'flex-end', gap: 4 },
});
