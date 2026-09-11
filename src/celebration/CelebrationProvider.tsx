import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { AccessibilityInfo, Animated, Easing, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { usePalette } from '../theme';
import { Card, Eyebrow, Pill, PrimaryButton, StatTile } from '../components/ui';
import { WeightUnit, formatWeight, toDisplay } from '../models';
import { SessionReward, ordinal, relativeDay, trainerHeadline } from '../rewards';
import { HapticKind, playHaptic } from '../haptics';
import { Confetti, ConfettiSize } from './Confetti';

/**
 * The moments worth marking, and the overlay that marks them.
 *
 * Kept out of the store on purpose: a celebration is an event, not state. It
 * must never persist, and it must never replay after a relaunch.
 *
 * The overlay is an absolutely positioned sibling of the root Stack rather than
 * an RN <Modal>. Every celebration fires *after* its screen has dismissed its
 * own native modal, and on iOS presenting a <Modal> while a native-stack modal
 * is still animating away is a known way to have it attach to the dismissing
 * controller and vanish with it. A short landing delay covers the dismiss
 * animation instead — and gives the moment a beat, so it reads as arriving
 * rather than as a flash.
 */

export type CelebrationEvent =
  | {
      kind: 'session';
      /** Who is holding the phone: the client after a solo session, or the trainer after a live one. */
      audience: 'client' | 'trainer';
      reward: SessionReward;
      clientName: string;
      workoutName: string;
      unit: WeightUnit;
    }
  | {
      kind: 'assigned';
      clientName: string;
      workoutName: string;
      exerciseCount: number;
      date: string;
    };

interface CelebrationApi {
  celebrate: (event: CelebrationEvent) => void;
  /** A confetti burst with no card, at most once per key per app launch. */
  burstOnce: (key: string) => void;
}

/**
 * Screens outside the provider — the error boundary renders in place of the
 * whole layout — get a harmless no-op rather than a throw from inside a finish
 * button.
 */
const NO_OP: CelebrationApi = { celebrate: () => {}, burstOnce: () => {} };

const CelebrationContext = createContext<CelebrationApi | null>(null);

export function useCelebration(): CelebrationApi {
  return useContext(CelebrationContext) ?? NO_OP;
}

/** Long enough for a native modal to finish dismissing; near-instant on the web. */
const LANDING_DELAY_MS = Platform.OS === 'web' ? 80 : 380;

function hapticFor(event: CelebrationEvent): HapticKind {
  if (event.kind === 'session' && event.reward.tier !== 'standard') return 'big';
  return 'success';
}

export function CelebrationProvider({ children }: { children: React.ReactNode }) {
  const p = usePalette();
  const [active, setActive] = useState<{ id: number; event: CelebrationEvent } | null>(null);
  const [burst, setBurst] = useState<number | null>(null);
  const [reduceMotion, setReduceMotion] = useState(false);

  const counter = useRef(0);
  const burstKeys = useRef(new Set<string>());
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);

  // Honour Reduce Motion: no confetti, but the card and the haptic still come.
  useEffect(() => {
    let alive = true;
    AccessibilityInfo.isReduceMotionEnabled()
      .then((enabled) => {
        if (alive) setReduceMotion(enabled);
      })
      .catch(() => {});
    let subscription: { remove: () => void } | undefined;
    try {
      subscription = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduceMotion);
    } catch {
      // Not every platform emits this; the initial read is enough.
    }
    const pending = timers.current;
    return () => {
      alive = false;
      subscription?.remove();
      pending.forEach(clearTimeout);
    };
  }, []);

  const celebrate = useCallback((event: CelebrationEvent) => {
    const timer = setTimeout(() => {
      counter.current += 1;
      setActive({ id: counter.current, event });
      playHaptic(hapticFor(event));
    }, LANDING_DELAY_MS);
    timers.current.push(timer);
  }, []);

  const burstOnce = useCallback((key: string) => {
    // A Set in a ref, so switching tabs and back does not replay the news.
    if (burstKeys.current.has(key)) return;
    burstKeys.current.add(key);
    counter.current += 1;
    setBurst(counter.current);
    playHaptic('light');
  }, []);

  const api = useMemo(() => ({ celebrate, burstOnce }), [celebrate, burstOnce]);

  const colors = useMemo(
    () => ({
      standard: p.tagColors,
      // Weighted toward gold, so a record looks different from an ordinary finish.
      big: [p.accent, p.accent, p.accent, ...p.tagColors],
    }),
    [p]
  );

  const clearBurst = useCallback(() => setBurst(null), []);
  const close = useCallback(() => setActive(null), []);

  return (
    <CelebrationContext.Provider value={api}>
      {children}
      {burst !== null && !reduceMotion ? (
        <Confetti key={burst} size="light" colors={colors.standard} onDone={clearBurst} />
      ) : null}
      {active ? (
        <CelebrationOverlay
          key={active.id}
          event={active.event}
          reduceMotion={reduceMotion}
          colors={colors}
          onClose={close}
        />
      ) : null}
    </CelebrationContext.Provider>
  );
}

// MARK: - The card

interface Content {
  icon: keyof typeof Ionicons.glyphMap;
  iconColor: string;
  eyebrow: string;
  title: string;
  subtitle?: string;
  confetti: ConfettiSize;
}

function describe(event: CelebrationEvent, accent: string, success: string): Content {
  const first = event.clientName.split(' ')[0];

  if (event.kind === 'assigned') {
    const exercises = `${event.exerciseCount} ${event.exerciseCount === 1 ? 'exercise' : 'exercises'}`;
    return {
      icon: 'paper-plane',
      iconColor: accent,
      eyebrow: 'SENT',
      title: `Sent to ${first}.`,
      subtitle: `${event.workoutName} · ${exercises} · ${relativeDay(event.date, new Date())}`,
      confetti: 'standard',
    };
  }

  const { reward } = event;
  const eyebrow =
    reward.tier === 'milestone'
      ? reward.milestone === 1
        ? 'FIRST SESSION'
        : `${ordinal(reward.milestone ?? 0).toUpperCase()} SESSION`
      : reward.tier === 'pr'
        ? reward.prs.length > 1
          ? `${reward.prs.length} NEW PERSONAL RECORDS`
          : 'NEW PERSONAL RECORD'
        : 'SESSION COMPLETE';

  // The client reads a line about themselves; the trainer reads who did what.
  // They are standing next to each other, so the trainer's card is something
  // to turn round and show.
  const trainer = event.audience === 'trainer';
  return {
    icon: reward.tier === 'milestone' ? 'trophy' : reward.tier === 'pr' ? 'medal' : 'checkmark-circle',
    iconColor: reward.tier === 'standard' ? success : accent,
    eyebrow,
    title: trainer ? `${first} finished ${event.workoutName}.` : reward.headline,
    subtitle: trainer ? trainerHeadline(reward, first) : event.workoutName,
    confetti: reward.tier === 'standard' ? 'standard' : 'big',
  };
}

function CelebrationOverlay({
  event,
  reduceMotion,
  colors,
  onClose,
}: {
  event: CelebrationEvent;
  reduceMotion: boolean;
  colors: { standard: readonly string[]; big: readonly string[] };
  onClose: () => void;
}) {
  const p = usePalette();
  const native = Platform.OS !== 'web';
  const fade = useRef(new Animated.Value(0)).current;
  const scale = useRef(new Animated.Value(0.92)).current;
  const closing = useRef(false);

  const content = describe(event, p.accent, p.success);

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fade, {
        toValue: 1,
        duration: 220,
        easing: Easing.out(Easing.quad),
        useNativeDriver: native,
      }),
      Animated.spring(scale, { toValue: 1, friction: 6, tension: 90, useNativeDriver: native }),
    ]).start();
    // Someone using VoiceOver gets the moment too, not just a silent overlay.
    AccessibilityInfo.announceForAccessibility(`${content.eyebrow}. ${content.title}`);
    // Mount only: the content is fixed for the life of this overlay.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const dismiss = () => {
    if (closing.current) return;
    closing.current = true;
    Animated.timing(fade, { toValue: 0, duration: 160, useNativeDriver: native }).start(() =>
      onClose()
    );
  };

  return (
    <View style={StyleSheet.absoluteFill} accessibilityViewIsModal>
      <Animated.View
        style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(0,0,0,0.62)', opacity: fade }]}
      >
        <Pressable
          style={StyleSheet.absoluteFill}
          onPress={dismiss}
          accessibilityRole="button"
          accessibilityLabel="Close"
        />
      </Animated.View>

      <View pointerEvents="box-none" style={{ flex: 1, justifyContent: 'center', padding: 22 }}>
        <Animated.View
          style={{
            width: '100%',
            maxWidth: 420,
            alignSelf: 'center',
            opacity: fade,
            transform: [{ scale }],
          }}
        >
          <Card radius={24} style={{ padding: 22, gap: 16 }}>
            <View style={{ alignItems: 'center', gap: 9 }}>
              <View
                style={{
                  width: 64,
                  height: 64,
                  borderRadius: 32,
                  backgroundColor: p.accentSoft,
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <Ionicons name={content.icon} size={32} color={content.iconColor} />
              </View>
              <Eyebrow color={p.accent}>{content.eyebrow}</Eyebrow>
              <Text
                style={{
                  fontSize: 26,
                  fontWeight: '800',
                  letterSpacing: -0.8,
                  color: p.text,
                  textAlign: 'center',
                }}
              >
                {content.title}
              </Text>
              {content.subtitle ? (
                <Text style={{ fontSize: 13, color: p.dim, textAlign: 'center', lineHeight: 19 }}>
                  {content.subtitle}
                </Text>
              ) : null}
            </View>

            {event.kind === 'session' ? <SessionBody event={event} /> : null}

            {event.kind === 'assigned' ? (
              <Text style={{ fontSize: 13, color: p.dim, textAlign: 'center', lineHeight: 19 }}>
                {`It'll be waiting on ${event.clientName.split(' ')[0]}'s Today screen.`}
              </Text>
            ) : null}

            <PrimaryButton title="Done" onPress={dismiss} />
          </Card>
        </Animated.View>
      </View>

      {!reduceMotion ? (
        <Confetti
          size={content.confetti}
          colors={content.confetti === 'big' ? colors.big : colors.standard}
        />
      ) : null}
    </View>
  );
}

function SessionBody({ event }: { event: Extract<CelebrationEvent, { kind: 'session' }> }) {
  const p = usePalette();
  const { reward, unit } = event;

  return (
    <View style={{ gap: 10 }}>
      <View style={{ flexDirection: 'row', gap: 8 }}>
        <StatTile label="SETS" value={String(reward.sets)} />
        <StatTile label="MINUTES" value={String(reward.minutes)} />
        <StatTile label="STREAK" value={`${reward.streak} wk`} tint={p.accent} />
      </View>

      {/* Named, specific records. "Bench Press 90 kg, up 5" is a reason to come
          back; "Great job!" is a notification people learn to ignore. */}
      {reward.prs.map((record) => {
        const now = toDisplay(record.weight, unit);
        const gain = now - toDisplay(record.previousWeight, unit);
        return (
          <View
            key={record.movementName}
            accessible
            accessibilityLabel={`New record: ${record.movementName}, ${formatWeight(now)} ${unit}${
              gain > 0 ? `, up ${formatWeight(gain)}` : ''
            }`}
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: 10,
              paddingVertical: 10,
              paddingHorizontal: 12,
              borderRadius: 12,
              backgroundColor: p.surfaceAlt,
            }}
          >
            <Ionicons name="trending-up" size={16} color={p.accent} />
            <Text numberOfLines={1} style={{ flex: 1, fontSize: 14, fontWeight: '700', color: p.text }}>
              {record.movementName}
            </Text>
            <Text style={{ fontSize: 14, fontWeight: '800', color: p.text }}>
              {`${formatWeight(now)} ${unit}`}
            </Text>
            {gain > 0 ? (
              <Pill label={`+${formatWeight(gain)}`} tint={p.success} background={p.surface} />
            ) : null}
          </View>
        );
      })}
    </View>
  );
}
