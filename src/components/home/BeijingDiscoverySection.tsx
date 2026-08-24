import React, { useRef, useState } from 'react';
import { Animated, Image, ImageBackground, Pressable, StyleSheet, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { BEIJING_EXPLORE_CARDS, DISCOVERY_GRID_IMAGES, BeijingExploreCard } from '../../data/beijingHomeMock';

export default function BeijingDiscoverySection({ onExplore, elderlyMode = false, scrollY }: { onExplore: () => void; elderlyMode?: boolean; scrollY: Animated.Value }) {
  const scrollX = useRef(new Animated.Value(0)).current;
  return <View style={styles.section}>
    <View style={styles.heading}><View><Text style={styles.eyebrow}>EXPLORE BEIJING</Text><Text style={[styles.title, elderlyMode && styles.largeTitle]}>发现北京</Text><Text style={[styles.subtitle, elderlyMode && styles.largeText]}>北京，远不止一条路线</Text></View><Ionicons name="arrow-forward" size={19} color="#0E9F93" /></View>
    <Animated.ScrollView horizontal showsHorizontalScrollIndicator={false} decelerationRate="fast" contentContainerStyle={styles.cardList} onScroll={Animated.event([{ nativeEvent: { contentOffset: { x: scrollX } } }], { useNativeDriver: true })} scrollEventThrottle={16}>
      {BEIJING_EXPLORE_CARDS.map((card, index) => <DiscoveryCard key={card.id} card={card} index={index} scrollX={scrollX} onPress={onExplore} />)}
    </Animated.ScrollView>
    <ImmersiveBridge />
    <View style={styles.gridHeading}><Text style={styles.gridEyebrow}>A CITY IN LAYERS</Text><Text style={[styles.gridTitle, elderlyMode && styles.largeTitle]}>把北京拆开看，处处都是风景</Text></View>
    <DiagonalGrid scrollY={scrollY} />
    <SliceBridge scrollY={scrollY} />
  </View>;
}

function DiscoveryCard({ card, index, scrollX, onPress }: { card: BeijingExploreCard; index: number; scrollX: Animated.Value; onPress: () => void }) {
  const [broken, setBroken] = useState(false);
  const imageShift = scrollX.interpolate({ inputRange: [Math.max(0, (index - 1) * 250), index * 250, (index + 1) * 250], outputRange: [-13, 0, 13], extrapolate: 'clamp' });
  return <Pressable onPress={onPress} style={({ pressed }) => [styles.discoveryCard, pressed && styles.pressed]}>
    <View style={styles.discoveryImageWrap}>{broken ? <LinearGradient colors={card.fallbackColors} style={styles.discoveryImage}><Ionicons name="image-outline" size={26} color="rgba(255,255,255,0.72)" /></LinearGradient> : <Animated.Image source={{ uri: card.imageUrl }} onError={() => setBroken(true)} style={[styles.discoveryImage, { transform: [{ translateX: imageShift }, { scale: 1.12 }] }]} /> }<LinearGradient colors={['rgba(6,35,31,0.02)', 'rgba(6,35,31,0.88)']} style={styles.cardShade} /></View>
    <View style={styles.cardCopy}><View style={styles.tag}><Text style={styles.tagText}>{card.tag}</Text></View><View><Text style={styles.english}>{card.englishName}</Text><Text style={styles.name}>{card.name}</Text><Text style={styles.detail}>{card.detail}</Text></View></View>
  </Pressable>;
}

function ImmersiveBridge() {
  const [broken, setBroken] = useState(false);
  return <View style={styles.immersive}><ImageBackground source={broken ? undefined : { uri: 'https://images.unsplash.com/photo-1474181487882-5abf3f0ba6c2?auto=format&fit=crop&w=1200&q=80' }} onError={() => setBroken(true)} style={styles.immersiveImage}><LinearGradient colors={['rgba(5,34,30,0.05)', 'rgba(5,34,30,0.82)']} style={styles.immersiveOverlay}><Text style={styles.immersiveKicker}>SLOW DOWN IN BEIJING</Text><Text style={styles.immersiveTitle}>给城市一点留白，让路线自己长出来。</Text><View style={styles.immersivePill}><Ionicons name="leaf-outline" size={14} color="#F5C351" /><Text style={styles.immersivePillText}>轻松游 · 少一点赶路</Text></View></LinearGradient></ImageBackground></View>;
}

function DiagonalGrid({ scrollY }: { scrollY: Animated.Value }) {
  return <View style={styles.grid} pointerEvents="none">{DISCOVERY_GRID_IMAGES.map((card, index) => {
    const offset = scrollY.interpolate({ inputRange: [560, 1100], outputRange: [index % 2 === 0 ? -6 : 8, index % 2 === 0 ? 10 : -8], extrapolate: 'clamp' });
    return <Animated.View key={`${card.id}-grid`} style={[styles.gridTile, { transform: [{ translateY: offset }, { rotate: index % 2 === 0 ? '-4deg' : '4deg' }] }]}><Image source={{ uri: card.imageUrl }} style={styles.gridImage} /><LinearGradient colors={['transparent', 'rgba(7,38,34,0.45)']} style={styles.gridShade} /></Animated.View>;
  })}</View>;
}

function SliceBridge({ scrollY }: { scrollY: Animated.Value }) {
  const pieces = Array.from({ length: 5 });
  return <View style={styles.sliceWrap}><View style={styles.sliceLabel}><Text style={styles.sliceEyebrow}>A MEMORY TO TAKE HOME</Text><Text style={styles.sliceTitle}>把这一眼，完整带走</Text></View><View style={styles.sliceImage}>{pieces.map((_, index) => { const translateY = scrollY.interpolate({ inputRange: [780, 1160], outputRange: [index % 2 === 0 ? 24 : -24, 0], extrapolate: 'clamp' }); return <Animated.View key={index} style={[styles.slice, { left: `${index * 20}%`, transform: [{ translateY }] }]}><Image source={{ uri: 'https://images.unsplash.com/photo-1548919973-5cef591cdbc9?auto=format&fit=crop&w=1000&q=80' }} style={[styles.slicePiece, { left: `${-index * 25}%` }]} /></Animated.View>; })}</View></View>;
}

const styles = StyleSheet.create({
  section: { marginTop: 32 }, heading: { paddingHorizontal: 2, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end' }, eyebrow: { color: '#0E9F93', fontSize: 10, fontWeight: '900', letterSpacing: 1.5 }, title: { color: '#0F2B27', fontSize: 24, fontWeight: '900', marginTop: 5 }, subtitle: { color: '#617571', fontSize: 12, marginTop: 4 }, largeTitle: { fontSize: 28 }, largeText: { fontSize: 15 }, cardList: { gap: 12, paddingTop: 16, paddingRight: 18 }, discoveryCard: { width: 248, height: 205, overflow: 'hidden', borderRadius: 24, backgroundColor: '#D7E6E1', shadowColor: '#0F2B27', shadowOffset: { width: 0, height: 10 }, shadowOpacity: 0.16, shadowRadius: 18, elevation: 4 }, pressed: { transform: [{ scale: 0.975 }] }, discoveryImageWrap: { ...StyleSheet.absoluteFillObject, overflow: 'hidden' }, discoveryImage: { width: '100%', height: '100%' }, cardShade: { ...StyleSheet.absoluteFillObject }, cardCopy: { flex: 1, padding: 15, justifyContent: 'space-between' }, tag: { alignSelf: 'flex-start', paddingHorizontal: 9, paddingVertical: 5, borderRadius: 99, backgroundColor: 'rgba(255,255,255,0.18)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.24)' }, tagText: { color: '#FFF', fontSize: 10, fontWeight: '800' }, english: { color: 'rgba(255,255,255,0.7)', fontSize: 9, fontWeight: '900', letterSpacing: 1 }, name: { color: '#FFF', fontSize: 20, fontWeight: '900', marginTop: 3 }, detail: { color: 'rgba(255,255,255,0.78)', fontSize: 10, marginTop: 4 }, immersive: { height: 265, marginTop: 20, marginHorizontal: -18, overflow: 'hidden' }, immersiveImage: { flex: 1 }, immersiveOverlay: { flex: 1, padding: 22, justifyContent: 'flex-end' }, immersiveKicker: { color: '#F5C351', fontSize: 10, fontWeight: '900', letterSpacing: 1.4 }, immersiveTitle: { color: '#FFF', fontSize: 25, lineHeight: 32, fontWeight: '900', marginTop: 8 }, immersivePill: { alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 14, paddingHorizontal: 11, paddingVertical: 7, borderRadius: 99, backgroundColor: 'rgba(255,255,255,0.15)' }, immersivePillText: { color: '#FFF', fontSize: 11, fontWeight: '700' }, gridHeading: { marginTop: 25, paddingHorizontal: 2 }, gridEyebrow: { color: '#A26B1D', fontSize: 10, fontWeight: '900', letterSpacing: 1.3 }, gridTitle: { color: '#0F2B27', fontSize: 18, fontWeight: '900', marginTop: 5 }, grid: { height: 230, marginTop: 12, flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', alignContent: 'center', gap: 7, overflow: 'hidden' }, gridTile: { width: '30%', height: 92, borderRadius: 14, overflow: 'hidden', backgroundColor: '#DCE9E5' }, gridImage: { width: '100%', height: '100%' }, gridShade: { ...StyleSheet.absoluteFillObject }, sliceWrap: { marginTop: 12, padding: 14, borderRadius: 22, backgroundColor: '#EDF7F3' }, sliceLabel: { marginBottom: 11 }, sliceEyebrow: { color: '#0E9F93', fontSize: 9, fontWeight: '900', letterSpacing: 1.2 }, sliceTitle: { color: '#0F2B27', fontSize: 17, fontWeight: '900', marginTop: 4 }, sliceImage: { height: 118, overflow: 'hidden', borderRadius: 15, flexDirection: 'row', backgroundColor: '#B9D7CD' }, slice: { position: 'absolute', top: 0, bottom: 0, width: '21%', overflow: 'hidden' }, slicePiece: { position: 'absolute', top: 0, width: 520, height: 118, resizeMode: 'cover' },
});
