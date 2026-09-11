import React, { useState } from 'react';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useStore } from '../../src/store';
import { metrics, usePalette } from '../../src/theme';
import { Card, DashedButton, EmptyState, Title, keyboardAware } from '../../src/components/ui';
import { movementInfo } from '../../src/movementLibrary';

export default function Library() {
  const p = usePalette();
  const router = useRouter();
  const store = useStore();
  const [search, setSearch] = useState('');

  const catalogue = store.allMovements();
  const results = search
    ? catalogue.filter((m) => m.toLowerCase().includes(search.toLowerCase()))
    : catalogue;

  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: p.background }}>
      <ScrollView
        contentContainerStyle={{ padding: metrics.screenPadding, paddingBottom: 32, gap: 8 }}
        {...keyboardAware}
      >
        <Title>Library</Title>

        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: 9,
            minHeight: 40,
            paddingHorizontal: 13,
            borderRadius: metrics.controlRadius,
            backgroundColor: p.surfaceAlt,
            marginBottom: 4,
          }}
        >
          <Ionicons name="search" size={16} color={p.dim} />
          <TextInput
            value={search}
            onChangeText={setSearch}
            placeholder="Search movements"
            placeholderTextColor={p.dim}
            style={{ flex: 1, fontSize: 14, color: p.text }}
          />
        </View>

        <DashedButton
          title="Add your own movement"
          onPress={() => router.push('/movement/new')}
          height={46}
        />

        {results.length === 0 ? (
          <EmptyState
            icon="search-outline"
            title="No match"
            message={`Nothing in the library matches "${search}".`}
          />
        ) : (
          results.map((movement) => {
            const custom = store.customMovement(movement);
            const info = movementInfo(movement);
            const subtitle = custom
              ? custom.muscles.join(' · ') || 'Your movement'
              : info?.muscles.join(' · ') ?? '';

            return (
              <Pressable
                key={movement}
                onPress={() =>
                  router.push({ pathname: '/movement/[name]', params: { name: movement } })
                }
              >
                <Card
                  radius={16}
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: 12,
                    paddingHorizontal: 13,
                    paddingVertical: 10,
                    minHeight: 56,
                  }}
                >
                  <View
                    style={{
                      width: 34,
                      height: 34,
                      borderRadius: 11,
                      backgroundColor: p.accentSoft,
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    <Ionicons
                      name={custom ? 'create-outline' : 'barbell-outline'}
                      size={16}
                      color={p.accent}
                    />
                  </View>

                  <View style={{ flex: 1 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                      <Text style={{ fontSize: 15, fontWeight: '600', color: p.text }}>
                        {movement}
                      </Text>
                      {custom ? (
                        <View
                          style={{
                            paddingHorizontal: 6,
                            paddingVertical: 2,
                            borderRadius: 999,
                            backgroundColor: p.accentSoft,
                          }}
                        >
                          <Text style={{ fontSize: 8, fontWeight: '800', color: p.accent }}>
                            CUSTOM
                          </Text>
                        </View>
                      ) : null}
                    </View>
                    {subtitle ? (
                      <Text style={{ fontSize: 11, color: p.dim, marginTop: 2 }} numberOfLines={1}>
                        {subtitle}
                      </Text>
                    ) : null}
                  </View>

                  <Ionicons name="chevron-forward" size={15} color={p.dim} />
                </Card>
              </Pressable>
            );
          })
        )}
      </ScrollView>
    </SafeAreaView>
  );
}
