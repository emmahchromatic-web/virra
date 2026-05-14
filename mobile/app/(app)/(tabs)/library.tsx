import React, { useEffect, useState } from 'react';
import { View, ScrollView, Pressable, StyleSheet, SafeAreaView, ActivityIndicator } from 'react-native';
import { router } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { supabase } from '@/lib/supabase';
import { useCycleStore } from '@/store/cycle';
import { colors, spacing, radius } from '@/constants/theme';
import { AppHeader } from '@/components/layout/AppHeader';
import { VirraText } from '@/components/ui/VirraText';
import { VirraCard } from '@/components/ui/VirraCard';

interface Article {
  id:    string;
  title: string;
  slug:  string;
  tags:  string[];
}

const PHASE_TAGS  = ['menstrual', 'follicular', 'ovulatory', 'luteal'];
const ALL_FILTERS = ['All', 'Training', 'Nutrition', 'Recovery'];

function ArticleRow({ article }: { article: Article }) {
  const categoryTag = article.tags.find((t) => !PHASE_TAGS.includes(t));
  return (
    <Pressable onPress={() => router.push(`/(app)/library/${article.slug}`)}>
      <VirraCard style={styles.articleCard}>
        <View style={styles.articleInner}>
          <View style={{ flex: 1, gap: 6 }}>
            {categoryTag && (
              <VirraText variant="mono" size={11} color={colors.dawn} style={styles.articleTag}>
                {categoryTag.toUpperCase()}
              </VirraText>
            )}
            <VirraText variant="bodyMedium" size={15} color={colors.breath} style={styles.articleTitle}>
              {article.title}
            </VirraText>
          </View>
          <SymbolView name="chevron.right" size={14} tintColor={colors.muted} />
        </View>
      </VirraCard>
    </Pressable>
  );
}

export default function LibraryScreen() {
  const { cycleInfo } = useCycleStore();
  const [articles, setArticles] = useState<Article[]>([]);
  const [filter,   setFilter]   = useState('All');
  const [loading,  setLoading]  = useState(true);

  useEffect(() => {
    supabase
      .from('articles')
      .select('id, title, slug, tags')
      .not('published_at', 'is', null)
      .order('published_at', { ascending: false })
      .then(({ data }) => {
        setArticles(data ?? []);
        setLoading(false);
      });
  }, []);

  const phaseArticles = cycleInfo
    ? articles.filter((a) => a.tags.includes(cycleInfo.phase))
    : [];

  const filtered = articles.filter((a) =>
    filter === 'All' || a.tags.includes(filter.toLowerCase())
  );

  const remaining = filtered.filter((a) => !phaseArticles.includes(a));

  return (
    <SafeAreaView style={styles.safe}>
      <AppHeader title="Library" />
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>

        {phaseArticles.length > 0 && filter === 'All' && (
          <View style={styles.section}>
            <VirraText variant="mono" size={10} color={colors.pulse} style={styles.sectionLabel}>
              FOR YOUR PHASE
            </VirraText>
            {phaseArticles.slice(0, 2).map((a) => (
              <ArticleRow key={a.id} article={a} />
            ))}
          </View>
        )}

        <View style={styles.filterRow}>
          {ALL_FILTERS.map((f) => (
            <Pressable
              key={f}
              onPress={() => setFilter(f)}
              style={[styles.filterChip, filter === f && styles.filterActive]}
            >
              <VirraText
                variant="mono"
                size={10}
                color={filter === f ? colors.mile : 'rgba(244,237,224,0.6)'}
                style={styles.filterText}
              >
                {f.toUpperCase()}
              </VirraText>
            </Pressable>
          ))}
        </View>

        {loading ? (
          <ActivityIndicator color={colors.pulse} style={{ marginTop: spacing.xl }} />
        ) : (
          <View style={styles.section}>
            {remaining.map((a) => <ArticleRow key={a.id} article={a} />)}
            {remaining.length === 0 && filtered.length === 0 && (
              <VirraText variant="body" color={colors.muted}>No articles yet.</VirraText>
            )}
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe:         { flex: 1, backgroundColor: colors.mile },
  scroll:       { padding: spacing.lg, paddingBottom: spacing.xxl, gap: spacing.lg },
  section:      { gap: spacing.sm },
  sectionLabel: { letterSpacing: 2, marginBottom: spacing.xs },
  filterRow:    { flexDirection: 'row', gap: spacing.sm, flexWrap: 'wrap' },
  filterChip:   { paddingVertical: spacing.xs, paddingHorizontal: spacing.md, borderRadius: radius.full, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.mist },
  filterActive: { backgroundColor: colors.pulse, borderColor: colors.pulse },
  filterText:   { letterSpacing: 1.5 },
  articleCard:  { paddingVertical: spacing.md },
  articleInner: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  articleTag:   { letterSpacing: 1.5 },
  articleTitle: { lineHeight: 21 },
});
