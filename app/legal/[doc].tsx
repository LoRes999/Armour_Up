import React from 'react';
import { ScrollView, Text, View } from 'react-native';
import { Stack, useLocalSearchParams } from 'expo-router';
import { routeParam } from '../../src/routeParams';
import { SafeAreaView } from 'react-native-safe-area-context';
import { metrics, usePalette } from '../../src/theme';
import { EmptyState, Title } from '../../src/components/ui';
import { LEGAL_DOCS, LegalBlock, LegalDocId } from '../../src/legalContent';

/**
 * The Terms and Privacy Policy, in the app.
 *
 * Apple requires functional links to both beside a subscription price. They
 * used to be flat, untappable text on the paywall. Rendering them here rather
 * than only linking out means they work offline, they cannot 404, and the words
 * somebody reads are the words that shipped in the build they are holding.
 *
 * Content is generated from docs/*.md by scripts/build-legal.mjs, so the copy
 * published for App Store Connect and the copy rendered here cannot drift.
 */
export default function Legal() {
  const p = usePalette();
  const { doc: rawDoc } = useLocalSearchParams<{ doc?: string | string[] }>();
  const doc = routeParam(rawDoc);

  const id = doc === 'privacy' || doc === 'terms' ? (doc as LegalDocId) : undefined;
  const document = id ? LEGAL_DOCS[id] : undefined;

  if (!document) {
    return (
      <SafeAreaView edges={['bottom']} style={{ flex: 1, backgroundColor: p.background }}>
        <Stack.Screen options={{ headerShown: true, title: 'Not found' }} />
        <EmptyState
          icon="document-text-outline"
          title="No such document"
          message="That link does not point at anything we publish."
        />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView edges={['bottom']} style={{ flex: 1, backgroundColor: p.background }}>
      <Stack.Screen options={{ headerShown: true, title: document.title, headerBackTitle: 'Back' }} />
      <ScrollView
        contentContainerStyle={{
          paddingHorizontal: metrics.screenPadding,
          paddingBottom: 40,
          gap: 12,
        }}
      >
        <Title size={28}>{document.title}</Title>
        {document.blocks.map((block, index) => (
          <Block key={index} block={block} />
        ))}
      </ScrollView>
    </SafeAreaView>
  );
}

function Block({ block }: { block: LegalBlock }) {
  const p = usePalette();

  const text = block.spans.map((span, index) => (
    <Text key={index} style={{ fontWeight: span.bold ? '700' : '400' }}>
      {span.text}
    </Text>
  ));

  if (block.kind === 'h2') {
    return (
      <Text
        style={{
          fontSize: 17,
          fontWeight: '800',
          letterSpacing: -0.3,
          color: p.text,
          marginTop: 10,
        }}
      >
        {text}
      </Text>
    );
  }

  if (block.kind === 'li') {
    return (
      <View style={{ flexDirection: 'row', gap: 9, paddingLeft: 4 }}>
        <Text style={{ fontSize: 14, lineHeight: 21, color: p.accent }}>•</Text>
        <Text style={{ flex: 1, fontSize: 14, lineHeight: 21, color: p.dim }}>{text}</Text>
      </View>
    );
  }

  return <Text style={{ fontSize: 14, lineHeight: 21, color: p.dim }}>{text}</Text>;
}
