import React from 'react';
import { View, Pressable, StyleSheet } from 'react-native';
import { SymbolView } from 'expo-symbols';
import { colors, spacing, radius } from '@/constants/theme';
import { VirraText } from '@/components/ui/VirraText';
import type { ContraceptionType } from '@/lib/cycleEngine';

const MS_PER_DAY = 24 * 60 * 60 * 1000;

const CONTRACEPTION_TYPES: { value: ContraceptionType; label: string; sub: string }[] = [
  { value: 'combined_pill', label: 'Combined pill',     sub: 'Estrogen + progestin'              },
  { value: 'ring',          label: 'Vaginal ring',      sub: 'NuvaRing, Annovera'                },
  { value: 'patch',         label: 'Patch',             sub: 'Evra / transdermal'                },
  { value: 'mini_pill',     label: 'Mini-pill',         sub: 'Progestin-only (POP)'              },
  { value: 'hormonal_iud',  label: 'Hormonal IUD',      sub: 'Mirena, Kyleena, Jaydess'          },
  { value: 'implant',       label: 'Implant',           sub: 'Nexplanon, Implanon'               },
  { value: 'injection',     label: 'Injection',         sub: 'Depo-Provera'                      },
  { value: 'other',         label: 'Other or not sure', sub: "We'll keep your guidance general"  },
];

const PLACEBO_TYPES: ContraceptionType[] = ['combined_pill', 'ring', 'patch'];

function formatDate(d: Date) {
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
}

interface Props {
  contraceptionType:  ContraceptionType | null;
  hasPlaceboWeek:     boolean | null;
  currentPackStart:   Date | null;
  onCopperIUDEscape:  () => void;
  onChange: (patch: {
    contraceptionType: ContraceptionType;
    hasPlaceboWeek:    boolean | null;
    currentPackStart:  Date | null;
  }) => void;
}

export function HormonalSubPicker({
  contraceptionType,
  hasPlaceboWeek,
  currentPackStart,
  onCopperIUDEscape,
  onChange,
}: Props) {
  const showsPlacebo = contraceptionType != null && PLACEBO_TYPES.includes(contraceptionType);

  function selectType(type: ContraceptionType) {
    const needsPlacebo = PLACEBO_TYPES.includes(type);
    onChange({
      contraceptionType: type,
      hasPlaceboWeek:    needsPlacebo ? hasPlaceboWeek : null,
      currentPackStart:  needsPlacebo && hasPlaceboWeek ? (currentPackStart ?? new Date(Date.now() - 14 * MS_PER_DAY)) : null,
    });
  }

  function selectPlacebo(value: boolean) {
    const defaultStart = new Date(Date.now() - 14 * MS_PER_DAY);
    onChange({
      contraceptionType: contraceptionType!,
      hasPlaceboWeek:    value,
      currentPackStart:  value ? (currentPackStart ?? defaultStart) : null,
    });
  }

  function shiftPackDate(days: number) {
    const base = currentPackStart ?? new Date(Date.now() - 14 * MS_PER_DAY);
    const next = new Date(base.getTime() + days * MS_PER_DAY);
    if (next > new Date()) return;
    onChange({ contraceptionType: contraceptionType!, hasPlaceboWeek: true, currentPackStart: next });
  }

  return (
    <View style={s.container}>
      <VirraText variant="mono" size={9} color={colors.pulse} style={s.sectionLabel}>
        WHICH TYPE?
      </VirraText>

      {CONTRACEPTION_TYPES.map((opt) => {
        const active = contraceptionType === opt.value;
        return (
          <Pressable
            key={opt.value}
            onPress={() => selectType(opt.value)}
            style={[s.typeOption, active && s.typeOptionActive]}
            accessibilityRole="radio"
            accessibilityState={{ selected: active }}
          >
            <VirraText variant="bodyMedium" size={13} color={active ? colors.pulse : colors.breath}>
              {opt.label}
            </VirraText>
            <VirraText variant="body" size={10} color="rgba(244,237,224,0.4)">
              {opt.sub}
            </VirraText>
          </Pressable>
        );
      })}

      {showsPlacebo && (
        <View style={s.subSection}>
          <View style={s.divider} />
          <VirraText variant="bodyMedium" size={13} color={colors.breath} style={s.placeboQ}>
            Do you take a pill-free week each cycle?
          </VirraText>
          {[
            { value: true,  label: 'Yes — I take a break each cycle' },
            { value: false, label: 'No, I take it continuously'       },
          ].map((opt) => {
            const active = hasPlaceboWeek === opt.value;
            return (
              <Pressable
                key={String(opt.value)}
                onPress={() => selectPlacebo(opt.value)}
                style={[s.typeOption, active && s.typeOptionActive]}
                accessibilityRole="radio"
                accessibilityState={{ selected: active }}
              >
                <VirraText variant="bodyMedium" size={13} color={active ? colors.pulse : colors.breath}>
                  {opt.label}
                </VirraText>
              </Pressable>
            );
          })}

          {hasPlaceboWeek === true && (
            <View style={s.packDateSection}>
              <VirraText variant="mono" size={9} color="rgba(212,255,38,0.6)" style={s.sectionLabel}>
                CURRENT PACK START DATE
              </VirraText>
              {(() => {
                const packBase = currentPackStart ?? new Date(Date.now() - 14 * MS_PER_DAY);
                const isAtPackMax = packBase >= new Date(new Date().setHours(0, 0, 0, 0));
                return (
                  <View style={s.datePicker}>
                    <Pressable onPress={() => shiftPackDate(-1)} style={s.dateBtn} hitSlop={12}>
                      <SymbolView name="chevron.left" size={20} tintColor={colors.breath} />
                    </Pressable>
                    <VirraText variant="bodyMedium" size={15} color={colors.breath} style={s.dateText}>
                      {formatDate(packBase)}
                    </VirraText>
                    <Pressable onPress={() => shiftPackDate(1)} style={[s.dateBtn, isAtPackMax && { opacity: 0.35 }]} hitSlop={12}>
                      <SymbolView name="chevron.right" size={20} tintColor={colors.breath} />
                    </Pressable>
                  </View>
                );
              })()}
            </View>
          )}
        </View>
      )}

      <Pressable onPress={onCopperIUDEscape} style={s.copperLink} hitSlop={8}>
        <VirraText variant="body" size={11} color="rgba(244,237,224,0.35)" style={s.copperText}>
          Actually, I have a copper IUD →
        </VirraText>
      </Pressable>
    </View>
  );
}

const s = StyleSheet.create({
  container:       { gap: spacing.sm, padding: spacing.sm, backgroundColor: 'rgba(212,255,38,0.05)', borderRadius: radius.lg, borderWidth: 1, borderColor: 'rgba(212,255,38,0.18)' },
  sectionLabel:    { letterSpacing: 2, marginBottom: 2 },
  typeOption:      { padding: spacing.sm, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.mist, gap: 2 },
  typeOptionActive:{ borderColor: colors.pulse, backgroundColor: 'rgba(212,255,38,0.08)' },
  subSection:      { gap: spacing.sm },
  divider:         { height: 1, backgroundColor: 'rgba(244,237,224,0.07)' },
  placeboQ:        { lineHeight: 20 },
  packDateSection: { gap: spacing.xs },
  datePicker:      { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: colors.mist, borderRadius: radius.lg, padding: spacing.md, borderWidth: 1, borderColor: colors.border },
  dateBtn:         { width: 36, alignItems: 'center' },
  dateText:        { flex: 1, textAlign: 'center' },
  copperLink:      { alignItems: 'center', paddingTop: spacing.xs },
  copperText:      { textDecorationLine: 'underline' },
});
