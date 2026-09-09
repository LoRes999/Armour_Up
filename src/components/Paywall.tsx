import React, { useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useStore } from '../store';
import { metrics, usePalette } from '../theme';
import { Card, Pill, Title } from './ui';
import { PLANS } from '../purchases';
import { PlanId } from '../models';
import { notify } from '../confirm';

/**
 * Screen one. Trainers pay for the app; clients are free and arrive through an
 * invite code, so the two ways in sit side by side in the button group rather
 * than behind a separate "are you a coach?" question.
 *
 * A trainer whose subscription has lapsed gets the same screen with different
 * copy. Nothing of theirs is deleted — the trainer tab group simply stops
 * existing until they resubscribe, which is a kinder answer than a half-working
 * app where every tap is a question.
 */
export default function Paywall() {
  const p = usePalette();
  const router = useRouter();
  const store = useStore();
  const [plan, setPlan] = useState<PlanId>('annual');

  const lapsed = store.subscription?.status === 'expired';
  // Owns it, but is not signed in — signOut clears the role and keeps the sub.
  const owned = store.subscription?.status === 'active';
  const pending = store.purchasePending;

  // No navigation on success in either of these: the root gate re-renders and
  // redirects itself. Both sign in as a trainer, because a client never buys —
  // they arrive with a code — so owning a subscription is what a coach is.
  const buy = async () => {
    if (await store.purchasePlan(plan)) store.signInAsTrainer();
  };

  const restore = async () => {
    if (await store.restorePurchase()) {
      store.signInAsTrainer();
      return;
    }
    // restore() no longer hands out a subscription just for asking, so this is
    // a reachable outcome now and has to say something. Silence would read as
    // a dead button, which is what half the controls in here used to be.
    notify({
      title: 'Nothing to restore',
      message:
        'No active subscription is attached to this account. Choose a plan above to get started.',
    });
  };

  const bullets = lapsed
    ? [
        {
          icon: 'people-outline' as const,
          title: `Your ${store.clients.length} clients are safe`,
          detail: 'Every programme, session and personal record is exactly where you left it.',
        },
        {
          icon: 'play-outline' as const,
          title: 'Pick up mid-block',
          detail: 'Resubscribe and your roster is back the moment the purchase clears.',
        },
      ]
    : [
        {
          icon: 'people-outline' as const,
          title: 'Unlimited clients',
          detail: 'Invite anyone with a code. They never pay a penny.',
        },
        {
          icon: 'barbell-outline' as const,
          title: 'Programme and log in one place',
          detail: 'Build the session, then log it set by set while they lift.',
        },
        {
          icon: 'trending-up-outline' as const,
          title: 'History that answers questions',
          detail: 'Personal records, top-set trends and a training calendar per client.',
        },
      ];

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: p.background }}>
      <ScrollView contentContainerStyle={{ paddingHorizontal: 28, paddingBottom: 20, gap: 20 }}>
        <View style={{ paddingTop: 24, gap: 18 }}>
          <View
            style={{
              width: 58,
              height: 58,
              borderRadius: 18,
              backgroundColor: p.accent,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Ionicons name="barbell" size={30} color={p.onAccent} />
          </View>

          <Title size={40}>{lapsed ? 'Your subscription\nended.' : 'Coach your\nwhole roster.'}</Title>

          <Text style={{ fontSize: 15, color: p.dim, lineHeight: 22 }}>
            {lapsed
              ? 'Start again whenever you are ready. Your clients keep their app and their history in the meantime.'
              : 'One subscription covers every client you train. They join free with a code you send them.'}
          </Text>
        </View>

        <View style={{ gap: 11 }}>
          {bullets.map((bullet) => (
            <View key={bullet.title} style={{ flexDirection: 'row', gap: 12 }}>
              <View
                style={{
                  width: 30,
                  height: 30,
                  borderRadius: 10,
                  backgroundColor: p.surfaceAlt,
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <Ionicons name={bullet.icon} size={15} color={p.accent} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 14, fontWeight: '700', color: p.text }}>{bullet.title}</Text>
                <Text style={{ fontSize: 12, color: p.dim, lineHeight: 17, marginTop: 1 }}>
                  {bullet.detail}
                </Text>
              </View>
            </View>
          ))}
        </View>

        <View style={{ gap: 9 }}>
          {PLANS.map((option) => {
            const active = option.id === plan;
            return (
              <Pressable key={option.id} onPress={() => setPlan(option.id)}>
                <Card
                  radius={16}
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: 12,
                    padding: 14,
                    minHeight: metrics.hitTarget + 16,
                    borderColor: active ? p.accent : p.border,
                    backgroundColor: active ? p.accentSoft : p.surface,
                  }}
                >
                  <View
                    style={{
                      width: 20,
                      height: 20,
                      borderRadius: 10,
                      borderWidth: 2,
                      borderColor: active ? p.accent : p.border,
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    {active ? (
                      <View
                        style={{ width: 9, height: 9, borderRadius: 5, backgroundColor: p.accent }}
                      />
                    ) : null}
                  </View>

                  <View style={{ flex: 1 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 7 }}>
                      <Text style={{ fontSize: 15, fontWeight: '800', color: p.text }}>
                        {option.title}
                      </Text>
                      {option.savingLabel ? (
                        <Pill
                          label={option.savingLabel}
                          tint={p.onAccent}
                          background={p.accent}
                        />
                      ) : null}
                    </View>
                    <Text style={{ fontSize: 11, color: p.dim, marginTop: 2 }}>
                      {option.footnote}
                    </Text>
                  </View>

                  <View style={{ alignItems: 'flex-end' }}>
                    <Text style={{ fontSize: 19, fontWeight: '800', color: p.text }}>
                      {option.priceLabel}
                    </Text>
                    <Text style={{ fontSize: 10, color: p.dim }}>{option.periodLabel}</Text>
                  </View>
                </Card>
              </Pressable>
            );
          })}
        </View>

        <View style={{ gap: 9, opacity: pending ? 0.5 : 1 }}>
          {/* Apple's own button needs a dev build; in Expo Go this is a stand-in
              that follows the same visual contract. See the README. */}
          <Pressable
            onPress={pending ? undefined : buy}
            style={{
              height: 50,
              borderRadius: 12,
              backgroundColor: p.text,
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 8,
            }}
          >
            <Ionicons name="logo-apple" size={19} color={p.background} />
            <Text style={{ fontSize: 16, fontWeight: '600', color: p.background }}>
              {pending ? 'One moment…' : 'Subscribe with Apple'}
            </Text>
          </Pressable>

          {/* This slot used to read "Continue with email" and was wired to the
              same `buy` handler as the Apple button above, so the least
              committal-looking control on the screen completed a purchase. It is
              now the client's way in — the other thing this screen has to offer,
              and previously a small link at the very bottom of the pitch. */}
          <Pressable
            onPress={() => router.push('/join')}
            accessibilityRole="button"
            accessibilityLabel="Enter your invite code"
          >
            <Card
              radius={12}
              style={{
                height: 50,
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 8,
              }}
            >
              <Ionicons name="key-outline" size={18} color={p.text} />
              <Text style={{ fontSize: 16, fontWeight: '700', color: p.text }}>
                Enter your invite code
              </Text>
            </Card>
          </Pressable>

          <Pressable
            onPress={pending ? undefined : restore}
            style={{ minHeight: metrics.hitTarget, alignItems: 'center', justifyContent: 'center' }}
          >
            <Text style={{ fontSize: 13, fontWeight: '700', color: p.dim }}>Restore purchases</Text>
          </Pressable>
        </View>

        {/* The "INVITED BY A TRAINER?" divider and its link lived here; the
            button above now does exactly that, and always renders — which is
            also what un-strands a lapsed trainer who signs out, since the link
            used to be replaced by Sign out and /join became unreachable. */}
        {lapsed ? (
          <Pressable
            onPress={() => store.signOut()}
            accessibilityRole="button"
            style={{ minHeight: metrics.hitTarget, alignItems: 'center', justifyContent: 'center' }}
          >
            <Text style={{ fontSize: 14, fontWeight: '700', color: p.accent }}>Sign out</Text>
          </Pressable>
        ) : owned ? (
          // Signing out clears the role but keeps the subscription, so a paying
          // trainer was shown the whole acquisition pitch again with no way back
          // in short of re-purchasing.
          <Pressable
            onPress={() => store.signInAsTrainer()}
            accessibilityRole="button"
            style={{ minHeight: metrics.hitTarget, alignItems: 'center', justifyContent: 'center' }}
          >
            <Text style={{ fontSize: 14, fontWeight: '700', color: p.accent }}>
              Sign back in as coach
            </Text>
          </Pressable>
        ) : null}

        <Text style={{ fontSize: 11, color: p.dim, textAlign: 'center', lineHeight: 17 }}>
          Billed through the App Store and renews until cancelled. By continuing you agree to our
          Terms of Service and Privacy Policy.
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}
