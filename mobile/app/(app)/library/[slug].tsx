import React, { useEffect, useState } from 'react';
import { View, ScrollView, StyleSheet, SafeAreaView, Pressable, ActivityIndicator } from 'react-native';
import { useLocalSearchParams, router } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { supabase } from '@/lib/supabase';
import { colors, spacing, fonts } from '@/constants/theme';
import { VirraText } from '@/components/ui/VirraText';

interface Article {
  id:           string;
  title:        string;
  body_md:      string;
  tags:         string[];
  published_at: string | null;
}

function renderBody(md: string) {
  return md.split('\n\n').map((block, i) => {
    if (block.startsWith('## ')) {
      return (
        <VirraText key={i} variant="bodyMedium" size={16} color={colors.breath} style={prose.h2}>
          {block.replace(/^## /, '')}
        </VirraText>
      );
    }
    if (block.startsWith('**') && block.endsWith('**')) {
      return (
        <VirraText key={i} variant="bodyMedium" color={colors.breath} style={prose.bold}>
          {block.replace(/\*\*/g, '')}
        </VirraText>
      );
    }
    return (
      <VirraText key={i} variant="body" size={15} color="rgba(244,237,224,0.8)" style={prose.p}>
        {block}
      </VirraText>
    );
  });
}

const prose = StyleSheet.create({
  h2:   { marginTop: spacing.lg, lineHeight: 24 },
  bold: { lineHeight: 22 },
  p:    { lineHeight: 24 },
});

export default function ArticleScreen() {
  const { slug } = useLocalSearchParams<{ slug: string }>();
  const [article, setArticle] = useState<Article | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase
      .from('articles')
      .select('id, title, body_md, tags, published_at')
      .eq('slug', slug)
      .single()
      .then(({ data }) => {
        setArticle(data);
        setLoading(false);
      });
  }, [slug]);

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={12} style={styles.backBtn}>
          <SymbolView name="chevron.left" size={20} tintColor={colors.breath} />
        </Pressable>
      </View>

      {loading ? (
        <View style={styles.loader}>
          <ActivityIndicator color={colors.pulse} />
        </View>
      ) : !article ? (
        <View style={styles.loader}>
          <VirraText variant="body" color={colors.muted}>Article not found.</VirraText>
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
          {article.tags.length > 0 && (
            <View style={styles.tags}>
              {article.tags.map((tag) => (
                <VirraText key={tag} variant="mono" size={11} color={colors.pulse} style={styles.tag}>
                  {tag.toUpperCase()}
                </VirraText>
              ))}
            </View>
          )}
          <VirraText variant="display" size={28} color={colors.breath} style={styles.title}>
            {article.title}
          </VirraText>
          <View style={styles.body}>
            {renderBody(article.body_md)}
          </View>
          <View style={styles.disclaimer}>
            <VirraText variant="mono" size={11} color={colors.muted} style={styles.disclaimerLabel}>
              EDUCATIONAL CONTENT
            </VirraText>
            <VirraText variant="body" size={12} color={colors.muted} style={styles.disclaimerBody}>
              Virra is an educational and training-guidance product, not a medical service. Articles are not a substitute for advice from a qualified healthcare professional. Consult a doctor before making decisions about exercise, nutrition, or your cycle — especially if pregnant, post-partum, or managing a medical condition.
            </VirraText>
          </View>
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe:    { flex: 1, backgroundColor: colors.mile },
  header:  { paddingHorizontal: spacing.lg, paddingVertical: spacing.md },
  backBtn: { width: 32 },
  loader:  { flex: 1, alignItems: 'center', justifyContent: 'center' },
  scroll:  { padding: spacing.lg, paddingBottom: spacing.xxl },
  tags:    { flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.sm, flexWrap: 'wrap' },
  tag:     { letterSpacing: 1.5 },
  title:   { lineHeight: 36, marginBottom: spacing.lg },
  body:    { gap: spacing.md },
  disclaimer: {
    marginTop:         spacing.xl,
    paddingTop:        spacing.md,
    borderTopWidth:    1,
    borderTopColor:    colors.border,
    gap:               spacing.xs,
  },
  disclaimerLabel: { letterSpacing: 1.5 },
  disclaimerBody:  { lineHeight: 18 },
});
