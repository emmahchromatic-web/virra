import React, { useEffect, useRef, useState } from 'react';
import { View, Pressable, StyleSheet, TextInput } from 'react-native';
import { create } from 'zustand';
import { colors, spacing, radius, fonts } from '@/constants/theme';
import { VirraText } from '@/components/ui/VirraText';
import { VirraModal } from '@/components/ui/VirraModal';

// Mirrors React Native's AlertButton so call sites swap over mechanically.
export type AlertButtonStyle = 'default' | 'cancel' | 'destructive';
export interface AlertButton {
  text:     string;
  onPress?: () => void;
  style?:   AlertButtonStyle;
}

/** Single free-text field, for the themed equivalent of Alert.prompt. */
export interface AlertInput {
  placeholder?:  string;
  defaultValue?: string;
  submitText?:   string;
  cancelText?:   string;
  onSubmit:      (value: string) => void;
}

interface AlertConfig {
  title:    string;
  message?: string;
  buttons:  AlertButton[];
  input?:   AlertInput;
}

interface AlertState {
  current:  AlertConfig | null;
  /** Mounted hosts, in mount order. The last one is the one that renders. */
  hostIds:  number[];
  show:     (config: AlertConfig) => void;
  dismiss:  () => void;
  addHost:  (id: number) => void;
  dropHost: (id: number) => void;
}

const useAlertStore = create<AlertState>((set) => ({
  current:  null,
  hostIds:  [],
  show:     (config) => set({ current: config }),
  dismiss:  () => set({ current: null }),
  addHost:  (id) => set((s) => ({ hostIds: [...s.hostIds, id] })),
  dropHost: (id) => set((s) => ({ hostIds: s.hostIds.filter((h) => h !== id) })),
}));

// Monotonic ids so a remount never collides with a host that is still up.
let nextHostId = 1;

/**
 * Themed, imperative replacement for React Native's Alert.alert. Same call
 * shape: appAlert(title, message?, buttons?), so swapping call sites is
 * mechanical, but it renders as an on-brand VirraModal instead of the OS
 * dialog. Callable from anywhere (event handlers, async catch blocks), not
 * just inside render. Falls back to a single OK button when none are given.
 */
export function appAlert(title: string, message?: string, buttons?: AlertButton[]): void {
  useAlertStore.getState().show({
    title,
    message,
    buttons: buttons?.length ? buttons : [{ text: 'OK' }],
  });
}

/**
 * Themed replacement for Alert.prompt: same idea, one free-text field, but on
 * brand. The submit button is disabled until something is typed, so an empty
 * name cannot be saved by accident.
 */
export function appPrompt(title: string, message: string | undefined, input: AlertInput): void {
  useAlertStore.getState().show({ title, message, buttons: [], input });
}

function labelColor(style?: AlertButtonStyle): string {
  if (style === 'destructive') return colors.heat;
  if (style === 'cancel')      return colors.muted;
  return colors.mile; // 'default' sits on the pulse fill
}

/**
 * Somewhere for appAlert() to render. One host is mounted at the app root; a
 * screen presented with `presentation: 'modal'` must mount its own.
 *
 * Why: the host draws in a native RN Modal, and iOS will not present a second
 * modal from a view controller that already has one on screen. A host living
 * only at the root therefore renders nothing at all while a modal screen is
 * up, which silently swallowed every error on food-search, manual-activity,
 * checkin and run. Whichever host mounted last is the one deepest in the
 * presentation stack, so that is the only one allowed to render.
 */
export function VirraAlertHost() {
  const current  = useAlertStore((s) => s.current);
  const dismiss  = useAlertStore((s) => s.dismiss);
  const hostIds  = useAlertStore((s) => s.hostIds);
  const addHost  = useAlertStore((s) => s.addHost);
  const dropHost = useAlertStore((s) => s.dropHost);
  const idRef    = useRef<number>(0);
  if (idRef.current === 0) idRef.current = nextHostId++;
  const [value, setValue] = useState('');

  useEffect(() => {
    const id = idRef.current;
    addHost(id);
    return () => dropHost(id);
  }, [addHost, dropHost]);

  // Reset between prompts so a previous answer never pre-fills the next one.
  useEffect(() => { setValue(current?.input?.defaultValue ?? ''); }, [current]);

  const isTopmost = hostIds.length > 0 && hostIds[hostIds.length - 1] === idRef.current;

  if (!current || !isTopmost) return null;

  function press(button: AlertButton) {
    dismiss();
    button.onPress?.();
  }

  function submit() {
    const trimmed = value.trim();
    if (!trimmed) return;
    const onSubmit = current!.input!.onSubmit;
    dismiss();
    onSubmit(trimmed);
  }

  return (
    <VirraModal visible onClose={dismiss} title={current.title}>
      {current.message ? (
        <VirraText variant="body" size={15} color={colors.breath} style={styles.message}>
          {current.message}
        </VirraText>
      ) : null}
      {current.input && (
        <>
          <TextInput
            style={styles.input}
            value={value}
            onChangeText={setValue}
            placeholder={current.input.placeholder}
            placeholderTextColor="rgba(244,237,224,0.35)"
            autoFocus
            returnKeyType="done"
            onSubmitEditing={submit}
            accessibilityLabel={current.input.placeholder ?? current.title}
          />
          <View style={styles.buttons}>
            <Pressable
              onPress={submit}
              disabled={!value.trim()}
              accessibilityRole="button"
              accessibilityLabel={current.input.submitText ?? 'Save'}
              style={({ pressed }) => [
                styles.button,
                styles.buttonDefault,
                !value.trim() && styles.buttonDisabled,
                pressed && styles.buttonPressed,
              ]}
            >
              <VirraText variant="mono" size={13} color={colors.mile} style={styles.label}>
                {(current.input.submitText ?? 'Save').toUpperCase()}
              </VirraText>
            </Pressable>
            <Pressable
              onPress={dismiss}
              accessibilityRole="button"
              accessibilityLabel={current.input.cancelText ?? 'Cancel'}
              style={({ pressed }) => [styles.button, styles.buttonPlain, pressed && styles.buttonPressed]}
            >
              <VirraText variant="mono" size={13} color={colors.muted} style={styles.label}>
                {(current.input.cancelText ?? 'Cancel').toUpperCase()}
              </VirraText>
            </Pressable>
          </View>
        </>
      )}

      <View style={styles.buttons}>
        {current.buttons.map((button, i) => {
          const isDefault = button.style === 'default' || button.style === undefined;
          return (
            <Pressable
              key={`${button.text}-${i}`}
              onPress={() => press(button)}
              accessibilityRole="button"
              accessibilityLabel={button.text}
              style={({ pressed }) => [
                styles.button,
                isDefault ? styles.buttonDefault : styles.buttonPlain,
                pressed && styles.buttonPressed,
              ]}
            >
              <VirraText variant="mono" size={13} color={labelColor(button.style)} style={styles.label}>
                {button.text.toUpperCase()}
              </VirraText>
            </Pressable>
          );
        })}
      </View>
    </VirraModal>
  );
}

const styles = StyleSheet.create({
  message: { lineHeight: 21 },
  buttons: { gap: spacing.sm, marginTop: spacing.xs },
  button: {
    paddingVertical:   spacing.md,
    paddingHorizontal: spacing.lg,
    borderRadius:      radius.sm,
    alignItems:        'center',
    justifyContent:    'center',
  },
  buttonDefault: { backgroundColor: colors.pulse },
  buttonPlain:   { backgroundColor: 'transparent', borderWidth: 1, borderColor: colors.border },
  buttonPressed:  { opacity: 0.82 },
  buttonDisabled: { opacity: 0.4 },
  input: {
    marginTop:       spacing.md,
    backgroundColor: colors.mile,
    borderWidth:     1,
    borderColor:     colors.border,
    borderRadius:    radius.sm,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.md,
    color:           colors.breath,
    fontFamily:      fonts.mono,
    fontSize:        15,
  },
  label:         { letterSpacing: 1.5 },
});
