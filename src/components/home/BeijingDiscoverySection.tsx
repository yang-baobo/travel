import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Easing, Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import type { FliggyAttractionEditorial, TravelPlace } from '../../types/travel';

interface DiscoveryCardData {
  id: string;
  name: string;
  englishName: string;
  tag: string;
  detail: string;
  imageUrl: string;
  place: TravelPlace;
}

function normalizedPlaceName(value: string): string {
  return value.normalize('NFKC').replace(/[·•・\s（）()\-—_]/g, '').replace(/^北京(?:市)?/, '').toLowerCase();
}

function samePlaceName(left: string, right: string): boolean {
  return normalizedPlaceName(left) === normalizedPlaceName(right);
}

export default function BeijingDiscoverySection({
  places,
  editorialPlaces,
  loading,
  error,
  onRetry,
  onExplore,
  elderlyMode = false,
  scrollY,
}: {
  places: TravelPlace[];
  editorialPlaces: FliggyAttractionEditorial[];
  loading: boolean;
  error: boolean;
  onRetry: () => void;
  onExplore: (place: TravelPlace) => void;
  elderlyMode?: boolean;
  scrollY: Animated.Value;
}) {
  const scrollX = useRef(new Animated.Value(0)).current;
  const ambient = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const animation = Animated.loop(Animated.sequence([
      Animated.timing(ambient, { toValue: 1, duration: 4600, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
      Animated.timing(ambient, { toValue: 0, duration: 4600, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
    ]));
    animation.start();
    return () => animation.stop();
  }, [ambient]);

  const cards = useMemo<DiscoveryCardData[]>(() => places
    .map(place => {
      const editorial = editorialPlaces.find(item => samePlaceName(item.name, place.name));
      if (!editorial) return null;
      return {
        id: place.id,
        name: place.name,
        englishName: place.typeName || 'BEIJING',
        tag: place.district || '北京',
        detail: place.address || place.typeName || '',
        imageUrl: editorial.imageUrl,
        place,
      };
    })
    .filter((item): item is DiscoveryCardData => item !== null)
    .slice(0, 6), [editorialPlaces, places]);

  return (
    <View style={styles.section}>
      <View style={styles.heading}>
        <View>
          <Text style={styles.eyebrow}>EXPLORE BEIJING</Text>
          <Text style={[styles.title, elderlyMode && styles.largeTitle]}>发现北京</Text>
          <Text style={[styles.subtitle, elderlyMode && styles.largeText]}>高德真实地点 · 飞猪同名景点图</Text>
        </View>
        <Ionicons name="arrow-forward" size={19} color="#0E9F93" />
      </View>

      <Animated.ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        decelerationRate="fast"
        contentContainerStyle={styles.cardList}
        onScroll={Animated.event([{ nativeEvent: { contentOffset: { x: scrollX } } }], { useNativeDriver: true })}
        scrollEventThrottle={16}
      >
        {loading ? (
          <DiscoveryState message="正在核对高德地点与飞猪景点图片…" />
        ) : error ? (
          <DiscoveryState message="真实景点图片暂时没有加载成功" actionLabel="重新加载" onAction={onRetry} />
        ) : cards.length > 0 ? (
          cards.map((card, index) => (
            <DiscoveryCard key={card.id} card={card} index={index} scrollX={scrollX} onPress={() => onExplore(card.place)} />
          ))
        ) : (
          <DiscoveryState message="暂时没有名称精确匹配的景点图片" actionLabel="重新加载" onAction={onRetry} />
        )}
      </Animated.ScrollView>

      {editorialPlaces.length > 0 ? (
        <>
          <ImmersiveBridge place={editorialPlaces[1] || editorialPlaces[0]} scrollY={scrollY} ambient={ambient} />
          <View style={styles.gridHeading}>
            <Text style={styles.gridEyebrow}>A CITY IN MOTION</Text>
            <Text style={[styles.gridTitle, elderlyMode && styles.largeTitle]}>真实北京，在滚动中展开</Text>
            <Text style={styles.gridNote}>每张图片均来自对应的 FlyAI 景点条目</Text>
          </View>
          <DynamicEditorialGrid places={editorialPlaces.slice(0, 6)} scrollY={scrollY} ambient={ambient} />
          <SliceBridge place={editorialPlaces[0]} scrollY={scrollY} ambient={ambient} />
        </>
      ) : null}
    </View>
  );
}

function DiscoveryState({ message, actionLabel, onAction }: { message: string; actionLabel?: string; onAction?: () => void }) {
  return (
    <View style={styles.emptyCard}>
      <Ionicons name="images-outline" size={24} color="#0E9F93" />
      <Text style={styles.emptyText}>{message}</Text>
      {actionLabel && onAction ? (
        <Pressable onPress={onAction} style={styles.retryButton}><Text style={styles.retryText}>{actionLabel}</Text></Pressable>
      ) : null}
    </View>
  );
}

function DiscoveryCard({ card, index, scrollX, onPress }: {
  card: DiscoveryCardData;
  index: number;
  scrollX: Animated.Value;
  onPress: () => void;
}) {
  const [broken, setBroken] = useState(false);
  const imageShift = scrollX.interpolate({
    inputRange: [Math.max(0, (index - 1) * 250), index * 250, (index + 1) * 250],
    outputRange: [-15, 0, 15],
    extrapolate: 'clamp',
  });
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.discoveryCard, pressed && styles.pressed]}>
      <View style={styles.discoveryImageWrap}>
        <LinearGradient colors={['#0E9F93', '#084D48']} style={styles.discoveryImageFallback} />
        {!broken ? (
          <Animated.Image
            source={{ uri: card.imageUrl }}
            onError={() => setBroken(true)}
            style={[styles.discoveryImage, { transform: [{ translateX: imageShift }, { scale: 1.12 }] }]}
          />
        ) : (
          <View style={styles.imageUnavailable}>
            <Ionicons name="image-outline" size={24} color="rgba(255,255,255,0.68)" />
            <Text style={styles.imageUnavailableText}>飞猪图片暂不可用</Text>
          </View>
        )}
        <LinearGradient colors={['rgba(6,35,31,0.02)', 'rgba(6,35,31,0.90)']} style={styles.cardShade} />
      </View>
      <View style={styles.cardCopy}>
        <View style={styles.cardTopRow}>
          <View style={styles.tag}><Text style={styles.tagText}>{card.tag}</Text></View>
          <Text style={styles.fliggyBadge}>FLYAI 图</Text>
        </View>
        <View>
          <Text style={styles.english}>{card.englishName}</Text>
          <Text style={styles.name}>{card.name}</Text>
          <Text style={styles.detail}>{card.detail}</Text>
        </View>
      </View>
    </Pressable>
  );
}

function ImmersiveBridge({ place, scrollY, ambient }: {
  place: FliggyAttractionEditorial;
  scrollY: Animated.Value;
  ambient: Animated.Value;
}) {
  const parallax = scrollY.interpolate({ inputRange: [280, 900], outputRange: [-20, 32], extrapolate: 'clamp' });
  const drift = ambient.interpolate({ inputRange: [0, 1], outputRange: [-7, 7] });
  const zoom = ambient.interpolate({ inputRange: [0, 1], outputRange: [1.06, 1.11] });
  return (
    <View style={styles.immersive}>
      <Animated.Image
        source={{ uri: place.imageUrl }}
        style={[styles.immersiveImage, { transform: [{ translateY: Animated.add(parallax, drift) }, { scale: zoom }] }]}
      />
      <LinearGradient colors={['rgba(5,34,30,0.03)', 'rgba(5,34,30,0.84)']} style={styles.immersiveOverlay}>
        <View style={styles.sourcePill}><View style={styles.sourceDot} /><Text style={styles.sourcePillText}>FLYAI · {place.name}</Text></View>
        <Text style={styles.immersiveKicker}>SLOW DOWN IN BEIJING</Text>
        <Text style={styles.immersiveTitle}>给城市一点留白，让路线自己长出来。</Text>
        <View style={styles.immersivePill}>
          <Ionicons name="leaf-outline" size={14} color="#F5C351" />
          <Text style={styles.immersivePillText}>轻松游 · 少一点赶路</Text>
        </View>
      </LinearGradient>
    </View>
  );
}

function DynamicEditorialGrid({ places, scrollY, ambient }: {
  places: FliggyAttractionEditorial[];
  scrollY: Animated.Value;
  ambient: Animated.Value;
}) {
  return (
    <View style={styles.grid}>
      {places.map((place, index) => {
        const scrollOffset = scrollY.interpolate({
          inputRange: [560, 1260],
          outputRange: [index % 2 === 0 ? -18 : 20, index % 2 === 0 ? 20 : -18],
          extrapolate: 'clamp',
        });
        const idleOffset = ambient.interpolate({
          inputRange: [0, 1],
          outputRange: [index % 2 === 0 ? -4 : 5, index % 2 === 0 ? 5 : -4],
        });
        const scale = ambient.interpolate({
          inputRange: [0, 1],
          outputRange: index % 3 === 0 ? [1.01, 1.045] : [1.035, 1.01],
        });
        return (
          <Animated.View
            key={place.id}
            style={[styles.gridTile, { transform: [
              { translateY: Animated.add(scrollOffset, idleOffset) },
              { rotate: index % 2 === 0 ? '-3.2deg' : '3.2deg' },
              { scale },
            ] }]}
          >
            <Image source={{ uri: place.imageUrl }} style={styles.gridImage} />
            <LinearGradient colors={['transparent', 'rgba(7,38,34,0.72)']} style={styles.gridShade} />
            <Text numberOfLines={1} style={styles.gridPlaceName}>{place.name}</Text>
          </Animated.View>
        );
      })}
    </View>
  );
}

function SliceBridge({ place, scrollY, ambient }: {
  place: FliggyAttractionEditorial;
  scrollY: Animated.Value;
  ambient: Animated.Value;
}) {
  const [frameWidth, setFrameWidth] = useState(0);
  const panelCount = 5;
  const panelWidth = frameWidth / panelCount;
  const imageScale = ambient.interpolate({ inputRange: [0, 1], outputRange: [1.01, 1.035] });
  const imageDrift = ambient.interpolate({ inputRange: [0, 1], outputRange: [-2, 2] });
  const scrollLift = scrollY.interpolate({
    inputRange: [900, 1420],
    outputRange: [10, 0],
    extrapolate: 'clamp',
  });
  const sheenX = ambient.interpolate({
    inputRange: [0, 1],
    outputRange: [-80, Math.max(80, frameWidth + 40)],
  });

  return (
    <View style={styles.sliceWrap}>
      <View style={styles.sliceLabel}>
        <View>
          <Text style={styles.sliceEyebrow}>A MEMORY TO TAKE HOME</Text>
          <Text style={styles.sliceTitle}>把这一眼，完整带走</Text>
        </View>
        <View style={styles.sliceMeta}>
          <Text style={styles.sliceFrameLabel}>ONE PHOTO · FIVE FRAMES</Text>
          <Text style={styles.sliceSource}>FLYAI · {place.name}</Text>
        </View>
      </View>
      <View
        style={styles.sliceImage}
        onLayout={event => setFrameWidth(event.nativeEvent.layout.width)}
      >
        {frameWidth > 0 ? (
          <Animated.View
            style={[StyleSheet.absoluteFillObject, {
              transform: [
                { translateY: Animated.add(scrollLift, imageDrift) },
                { scale: imageScale },
              ],
            }]}
          >
            {Array.from({ length: panelCount }).map((_, index) => (
              <View
                key={index}
                style={[styles.slice, {
                  left: index * panelWidth,
                  width: panelWidth + 0.5,
                }]}
              >
                <Image
                  source={{ uri: place.imageUrl }}
                  style={[styles.slicePiece, {
                    left: -index * panelWidth,
                    width: frameWidth,
                  }]}
                />
                {index > 0 ? <View style={styles.sliceDivider} /> : null}
              </View>
            ))}
          </Animated.View>
        ) : (
          <Image source={{ uri: place.imageUrl }} style={StyleSheet.absoluteFillObject} />
        )}
        <Animated.View pointerEvents="none" style={[styles.sliceSheen, { transform: [{ translateX: sheenX }, { rotate: '12deg' }] }]}>
          <LinearGradient
            colors={['rgba(255,255,255,0)', 'rgba(255,255,255,0.22)', 'rgba(255,255,255,0)']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={StyleSheet.absoluteFillObject}
          />
        </Animated.View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  section: { marginTop: 32 },
  heading: { paddingHorizontal: 2, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end' },
  eyebrow: { color: '#0E9F93', fontSize: 10, fontWeight: '900', letterSpacing: 1.5 },
  title: { color: '#0F2B27', fontSize: 24, fontWeight: '900', marginTop: 5 },
  subtitle: { color: '#617571', fontSize: 12, marginTop: 4 },
  largeTitle: { fontSize: 28 },
  largeText: { fontSize: 15 },
  cardList: { gap: 12, paddingTop: 16, paddingRight: 18 },
  discoveryCard: { width: 248, height: 205, overflow: 'hidden', borderRadius: 24, backgroundColor: '#D7E6E1', shadowColor: '#0F2B27', shadowOffset: { width: 0, height: 10 }, shadowOpacity: 0.16, shadowRadius: 18, elevation: 4 },
  pressed: { transform: [{ scale: 0.975 }] },
  discoveryImageWrap: { ...StyleSheet.absoluteFillObject, overflow: 'hidden' },
  discoveryImageFallback: { ...StyleSheet.absoluteFillObject },
  discoveryImage: { width: '100%', height: '100%' },
  imageUnavailable: { ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center', gap: 7 },
  imageUnavailableText: { color: 'rgba(255,255,255,0.66)', fontSize: 10, fontWeight: '700' },
  cardShade: { ...StyleSheet.absoluteFillObject },
  cardCopy: { flex: 1, padding: 15, justifyContent: 'space-between' },
  cardTopRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  tag: { paddingHorizontal: 9, paddingVertical: 5, borderRadius: 99, backgroundColor: 'rgba(255,255,255,0.18)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.24)' },
  tagText: { color: '#FFF', fontSize: 10, fontWeight: '800' },
  fliggyBadge: { color: 'rgba(255,255,255,0.74)', fontSize: 8, fontWeight: '900', letterSpacing: 0.8 },
  english: { color: 'rgba(255,255,255,0.7)', fontSize: 9, fontWeight: '900', letterSpacing: 1 },
  name: { color: '#FFF', fontSize: 20, fontWeight: '900', marginTop: 3 },
  detail: { color: 'rgba(255,255,255,0.78)', fontSize: 10, marginTop: 4 },
  immersive: { height: 300, marginTop: 24, marginHorizontal: -18, overflow: 'hidden', backgroundColor: '#0A4D47' },
  immersiveImage: { ...StyleSheet.absoluteFillObject, width: '100%', height: 350, resizeMode: 'cover' },
  immersiveOverlay: { ...StyleSheet.absoluteFillObject, padding: 22, justifyContent: 'flex-end' },
  sourcePill: { position: 'absolute', top: 20, right: 20, flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 99, backgroundColor: 'rgba(5,35,31,0.54)' },
  sourceDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: '#68E1C9' },
  sourcePillText: { color: '#FFF', fontSize: 9, fontWeight: '800' },
  immersiveKicker: { color: '#F5C351', fontSize: 10, fontWeight: '900', letterSpacing: 1.4 },
  immersiveTitle: { color: '#FFF', fontSize: 25, lineHeight: 32, fontWeight: '900', marginTop: 8, maxWidth: 620 },
  immersivePill: { alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 14, paddingHorizontal: 11, paddingVertical: 7, borderRadius: 99, backgroundColor: 'rgba(255,255,255,0.15)' },
  immersivePillText: { color: '#FFF', fontSize: 11, fontWeight: '700' },
  gridHeading: { marginTop: 30, paddingHorizontal: 2 },
  gridEyebrow: { color: '#A26B1D', fontSize: 10, fontWeight: '900', letterSpacing: 1.3 },
  gridTitle: { color: '#0F2B27', fontSize: 18, fontWeight: '900', marginTop: 5 },
  gridNote: { color: '#748783', fontSize: 10, marginTop: 5 },
  grid: { minHeight: 265, marginTop: 14, flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', alignContent: 'center', gap: 8, overflow: 'hidden', paddingVertical: 18 },
  gridTile: { position: 'relative', width: '30%', height: 102, borderRadius: 15, overflow: 'hidden', backgroundColor: '#DCE9E5', shadowColor: '#0A3934', shadowOpacity: 0.14, shadowRadius: 12, shadowOffset: { width: 0, height: 8 } },
  gridImage: { width: '100%', height: '100%', backgroundColor: '#DDEAE6' },
  gridShade: { ...StyleSheet.absoluteFillObject },
  gridPlaceName: { position: 'absolute', left: 9, right: 9, bottom: 8, color: '#FFF', fontSize: 9, fontWeight: '900' },
  sliceWrap: { marginTop: 14, padding: 14, borderRadius: 22, backgroundColor: '#EDF7F3', overflow: 'hidden' },
  sliceLabel: { marginBottom: 11, flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', gap: 10 },
  sliceEyebrow: { color: '#0E9F93', fontSize: 9, fontWeight: '900', letterSpacing: 1.2 },
  sliceTitle: { color: '#0F2B27', fontSize: 17, fontWeight: '900', marginTop: 4 },
  sliceMeta: { alignItems: 'flex-end', gap: 3 },
  sliceFrameLabel: { color: '#0E9F93', fontSize: 6.5, fontWeight: '900', letterSpacing: 0.7 },
  sliceSource: { color: '#65807A', fontSize: 8, fontWeight: '800' },
  sliceImage: { position: 'relative', height: 150, overflow: 'hidden', borderRadius: 18, backgroundColor: '#B9D7CD' },
  slice: { position: 'absolute', top: 0, bottom: 0, overflow: 'hidden' },
  slicePiece: { position: 'absolute', top: 0, height: '100%', resizeMode: 'cover' },
  sliceDivider: { position: 'absolute', left: 0, top: 10, bottom: 10, width: 1, backgroundColor: 'rgba(255,255,255,0.52)' },
  sliceSheen: { position: 'absolute', top: -24, bottom: -24, left: 0, width: 62 },
  emptyCard: { width: 290, height: 205, borderRadius: 24, backgroundColor: '#DDEBE7', alignItems: 'center', justifyContent: 'center', padding: 22 },
  emptyText: { color: '#617571', fontSize: 12, textAlign: 'center', marginTop: 9 },
  retryButton: { marginTop: 12, paddingHorizontal: 14, paddingVertical: 8, borderRadius: 16, backgroundColor: '#0E9F93' },
  retryText: { color: '#FFF', fontSize: 11, fontWeight: '800' },
});
