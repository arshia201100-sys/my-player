import React, { useState, useEffect, useRef } from 'react';
import {
  StyleSheet,
  Text,
  View,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  StatusBar,
  Dimensions,
  Modal,
  FlatList,
  TextInput,
  KeyboardAvoidingView,
  Platform,
  Image,
  Animated,
  Easing,
} from 'react-native';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system/legacy';
import { BlurView } from 'expo-blur';
import Slider from '@react-native-community/slider';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';

const { width, height } = Dimensions.get('window');

const formatTime = (secs) => {
  if (isNaN(secs) || secs < 0) return '00:00';
  const m = Math.floor(secs / 60);
  const s = Math.floor(secs % 60);
  return `${m < 10 ? '0' : ''}${m}:${s < 10 ? '0' : ''}${s}`;
};

const stripExt = (name) => (name || '').replace(/\.[^/.]+$/, '');

export default function App() {
  // ----- States -----
  const [showWelcome, setShowWelcome] = useState(true);
  const fadeAnim = useRef(new Animated.Value(1)).current;
  const scaleAnim = useRef(new Animated.Value(0.9)).current;
  const blobAnim = useRef(new Animated.Value(0)).current;
  const pillDropAnim = useRef(new Animated.Value(-50)).current;
  const artworkGlow = useRef(new Animated.Value(0)).current;

  const [loading, setLoading] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [trackName, setTrackName] = useState('هیچ موزیکی در حال پخش نیست');
  const [duration, setDuration] = useState(0);
  const [position, setPosition] = useState(0);
  const [volume, setVolume] = useState(0.7);
  const [coverError, setCoverError] = useState(false);

  const [serverIP, setServerIP] = useState('192.168.1.92');
  const [recentTracks, setRecentTracks] = useState([]);
  const [isArchiveVisible, setArchiveVisible] = useState(false);
  const [isSettingsVisible, setSettingsVisible] = useState(false);

  const SERVER_URL = `http://${serverIP}:5000`;
  const isSliding = useRef(false);
  const slideTimeout = useRef(null);

  // ----- Effects -----
  useEffect(() => {
    Animated.spring(scaleAnim, {
      toValue: 1,
      friction: 5,
      useNativeDriver: true,
    }).start();

    Animated.loop(
      Animated.sequence([
        Animated.timing(blobAnim, {
          toValue: 1,
          duration: 8000,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
        Animated.timing(blobAnim, {
          toValue: 0,
          duration: 8000,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
      ])
    ).start();

    Animated.loop(
      Animated.sequence([
        Animated.timing(artworkGlow, {
          toValue: 1,
          duration: 3000,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.timing(artworkGlow, {
          toValue: 0,
          duration: 3000,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
      ])
    ).start();
  }, []);

  useEffect(() => {
    AsyncStorage.getItem('serverIP').then((v) => {
      if (v) setServerIP(v);
    });
  }, []);

  const handleStartApp = () => {
    Animated.timing(fadeAnim, {
      toValue: 0,
      duration: 400,
      useNativeDriver: true,
    }).start(() => {
      setShowWelcome(false);
      Animated.spring(pillDropAnim, {
        toValue: Platform.OS === 'ios' ? 50 : 20,
        friction: 6,
        useNativeDriver: true,
      }).start();
    });
  };

  useEffect(() => {
    setCoverError(false);
  }, [trackName]);

  useEffect(() => {
    const fetchStatus = async () => {
      try {
        const res = await fetch(`${SERVER_URL}/status`);
        if (res.ok) {
          const data = await res.json();
          setIsPlaying(data.is_playing);
          setTrackName(data.track_name);
          setDuration(data.duration);

          if (!isSliding.current) {
            setPosition(data.position);
          }
          setVolume(data.volume);
        }
      } catch (e) {}
    };

    if (showWelcome) return;

    const interval = setInterval(fetchStatus, 1000);
    return () => clearInterval(interval);
  }, [serverIP, showWelcome]);

  // ----- Network Functions -----
  const sendFileToServer = async (uri, name) => {
    setLoading(true);
    setArchiveVisible(false);
    try {
      const base64Data = await FileSystem.readAsStringAsync(uri, {
        encoding: FileSystem.EncodingType.Base64,
      });

      const response = await fetch(`${SERVER_URL}/play`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ filename: name, data: base64Data }),
      });

      if (!response.ok) throw new Error('خطا در سرور');

      setRecentTracks((prev) => {
        const filtered = prev.filter((t) => t.name !== name);
        return [{ name, uri }, ...filtered];
      });
    } catch (error) {
      Alert.alert('خطا', 'ارتباط با سیستم برقرار نشد. آی‌پی یا اجرای server.py را بررسی کنید.');
    } finally {
      setLoading(false);
    }
  };

  const pickAndPlayMusic = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: 'audio/*',
        copyToCacheDirectory: true,
      });

      if (!result.canceled) {
        sendFileToServer(result.assets[0].uri, result.assets[0].name);
      }
    } catch (error) {}
  };

  const togglePause = async () => {
    try {
      setIsPlaying(!isPlaying);
      await fetch(`${SERVER_URL}/toggle_pause`, { method: 'POST' });
    } catch (error) {}
  };

  const playRelative = (step) => {
    if (recentTracks.length === 0) return;
    const i = recentTracks.findIndex((t) => t.name === trackName);
    const nextIndex = (i + step + recentTracks.length) % recentTracks.length;
    const next = recentTracks[nextIndex];
    if (next) sendFileToServer(next.uri, next.name);
  };

  const onSlidingStart = () => {
    isSliding.current = true;
    if (slideTimeout.current) clearTimeout(slideTimeout.current);
  };

  const onValueChange = (val) => setPosition(val);

  const handleSeek = async (val) => {
    setPosition(val);
    try {
      await fetch(`${SERVER_URL}/seek`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ position: val }),
      });
    } finally {
      slideTimeout.current = setTimeout(() => {
        isSliding.current = false;
      }, 1500);
    }
  };

  const handleVolume = async (val) => {
    setVolume(val);
    try {
      await fetch(`${SERVER_URL}/volume`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ volume: val }),
      });
    } catch (error) {}
  };

  const coverUrl = `${SERVER_URL}/cover?t=${encodeURIComponent(trackName)}`;

  const blob1TranslateY = blobAnim.interpolate({ inputRange: [0, 1], outputRange: [0, 50] });
  const blob2TranslateX = blobAnim.interpolate({ inputRange: [0, 1], outputRange: [0, -40] });
  const blob3Scale = blobAnim.interpolate({ inputRange: [0, 1], outputRange: [1, 1.2] });
  const glowOpacity = artworkGlow.interpolate({ inputRange: [0, 1], outputRange: [0.25, 0.55] });

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" translucent backgroundColor="transparent" />

      {/* Liquid Background */}
      <View style={styles.bgContainer}>
        <Animated.View style={[styles.bgBlob, styles.blob1, { transform: [{ translateY: blob1TranslateY }] }]} />
        <Animated.View style={[styles.bgBlob, styles.blob2, { transform: [{ translateX: blob2TranslateX }] }]} />
        <Animated.View style={[styles.bgBlob, styles.blob3, { transform: [{ scale: blob3Scale }] }]} />
      </View>
      <BlurView intensity={95} style={StyleSheet.absoluteFill} tint="dark" />
      <View style={styles.glassSheen} pointerEvents="none" />

      {/* Top status pill */}
      {!showWelcome && (
        <Animated.View style={[styles.topPillContainer, { transform: [{ translateY: pillDropAnim }] }]}>
          <BlurView intensity={85} style={styles.topPillBlur} tint="dark">
            <View style={styles.topPillInnerBorder} pointerEvents="none" />
            <Ionicons name="musical-notes" size={14} color="#FFF" />
            <Text style={styles.topPillText}>Ashi Player</Text>
          </BlurView>
        </Animated.View>
      )}

      {/* Main Content */}
      <View style={styles.safeArea}>
        <View style={styles.header}>
          <Text style={styles.headerText}>NOW PLAYING</Text>
        </View>

        {/* Artwork */}
        <View style={styles.artworkWrapper}>
          <Animated.View style={[styles.artworkGlow, { opacity: glowOpacity }]} />
          <View style={styles.artworkContainer}>
            {!coverError ? (
              <Image source={{ uri: coverUrl }} style={styles.coverImage} onError={() => setCoverError(true)} />
            ) : (
              <Ionicons name="musical-notes" size={80} color="rgba(255,255,255,0.2)" />
            )}
            <View style={styles.artworkBorder} pointerEvents="none" />
          </View>
        </View>

        {/* Info */}
        <View style={styles.infoContainer}>
          <Text numberOfLines={1} style={styles.title}>
            {stripExt(trackName)}
          </Text>
          <Text style={styles.subtitle}>High-Res Audio • Desktop</Text>
        </View>

        {/* Time Slider */}
        <View style={styles.sliderContainer}>
          <Slider
            style={styles.slider}
            minimumValue={0}
            maximumValue={duration > 0 ? duration : 1}
            value={position}
            onSlidingStart={onSlidingStart}
            onValueChange={onValueChange}
            onSlidingComplete={handleSeek}
            minimumTrackTintColor="#FFFFFF"
            maximumTrackTintColor="rgba(255,255,255,0.2)"
            thumbTintColor="#FFFFFF"
          />
          <View style={styles.timeRow}>
            <Text style={styles.timeText}>{formatTime(position)}</Text>
            <Text style={styles.timeText}>-{formatTime(duration - position)}</Text>
          </View>
        </View>

        {/* Controls */}
        <View style={styles.controls}>
          <TouchableOpacity activeOpacity={0.6} style={styles.controlIcon} onPress={() => playRelative(1)}>
            <Ionicons name="play-skip-back" size={34} color="#FFF" />
          </TouchableOpacity>

          <TouchableOpacity activeOpacity={0.85} onPress={togglePause} style={styles.playBtn}>
            <BlurView intensity={70} style={styles.playBtnBlur} tint="light">
              <View style={styles.playBtnBorder} pointerEvents="none" />
              {loading ? (
                <ActivityIndicator size="large" color="#000" />
              ) : (
                <Ionicons
                  name={isPlaying ? 'pause' : 'play'}
                  size={34}
                  color="#000"
                  style={{ marginLeft: isPlaying ? 0 : 4 }}
                />
              )}
            </BlurView>
          </TouchableOpacity>

          <TouchableOpacity activeOpacity={0.6} style={styles.controlIcon} onPress={() => playRelative(-1)}>
            <Ionicons name="play-skip-forward" size={34} color="#FFF" />
          </TouchableOpacity>
        </View>

        {/* Volume */}
        <View style={styles.volumeRow}>
          <Ionicons name="volume-low" size={18} color="rgba(255,255,255,0.5)" />
          <Slider
            style={styles.volSlider}
            minimumValue={0}
            maximumValue={1}
            value={volume}
            onSlidingComplete={handleVolume}
            minimumTrackTintColor="#FFFFFF"
            maximumTrackTintColor="rgba(255,255,255,0.2)"
            thumbTintColor="#FFFFFF"
          />
          <Ionicons name="volume-high" size={18} color="rgba(255,255,255,0.5)" />
        </View>
      </View>

      {/* Dock */}
      <View style={styles.dockContainer}>
        <BlurView intensity={85} style={styles.dockBlur} tint="dark">
          <View style={styles.dockBorder} pointerEvents="none" />
          <TouchableOpacity style={styles.dockItem} onPress={() => setArchiveVisible(true)}>
            <Ionicons name="albums" size={24} color="rgba(255,255,255,0.75)" />
          </TouchableOpacity>

          <TouchableOpacity activeOpacity={0.85} onPress={pickAndPlayMusic}>
            <View style={styles.dockMainCircle}>
              <Ionicons name="add" size={30} color="#FFF" />
            </View>
          </TouchableOpacity>

          <TouchableOpacity style={styles.dockItem} onPress={() => setSettingsVisible(true)}>
            <Ionicons name="settings" size={24} color="rgba(255,255,255,0.75)" />
          </TouchableOpacity>
        </BlurView>
      </View>

      {/* Welcome Screen */}
      {showWelcome && (
        <Animated.View style={[styles.welcomeScreen, { opacity: fadeAnim }]}>
          <BlurView intensity={100} style={styles.welcomeBlur} tint="dark">
            <Animated.View style={[styles.welcomeContent, { transform: [{ scale: scaleAnim }] }]}>
              <View style={styles.welcomeIconWrapper}>
                <BlurView intensity={80} style={styles.welcomeIconInner} tint="light">
                  <View style={styles.welcomeIconBorder} pointerEvents="none" />
                  <Ionicons name="play" size={58} color="#000" style={{ marginLeft: 8 }} />
                </BlurView>
              </View>
              <Text style={styles.welcomeTitle}>Ashi Player</Text>
              <Text style={styles.welcomeSubtitle}>
                پخش بدون محدودیت، کیفیت استودیویی، با معماری کنترل از راه دور.
              </Text>
              <TouchableOpacity activeOpacity={0.85} onPress={handleStartApp} style={styles.welcomeBtn}>
                <BlurView intensity={100} style={styles.welcomeBtnBlur} tint="light">
                  <Text style={styles.welcomeBtnText}>ورود به سیستم</Text>
                  <Ionicons name="arrow-forward" size={20} color="#000" />
                </BlurView>
              </TouchableOpacity>
            </Animated.View>
          </BlurView>
        </Animated.View>
      )}

      {/* Archive Modal */}
      <Modal animationType="slide" transparent visible={isArchiveVisible}>
        <View style={styles.modalOverlay}>
          <BlurView intensity={95} style={styles.modalContent} tint="dark">
            <View style={styles.modalInnerBorder} pointerEvents="none" />
            <View style={styles.modalDragHandle} />
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>آرشیو موزیک‌ها</Text>
              <TouchableOpacity style={styles.closeBtn} onPress={() => setArchiveVisible(false)}>
                <Ionicons name="close" size={22} color="#FFF" />
              </TouchableOpacity>
            </View>

            {recentTracks.length === 0 ? (
              <View style={styles.emptyState}>
                <Ionicons name="layers-outline" size={56} color="rgba(255,255,255,0.2)" />
                <Text style={styles.emptyText}>آرشیو شما خالی است.</Text>
              </View>
            ) : (
              <FlatList
                data={recentTracks}
                showsVerticalScrollIndicator={false}
                keyExtractor={(item, index) => index.toString()}
                renderItem={({ item }) => (
                  <TouchableOpacity style={styles.archiveItem} onPress={() => sendFileToServer(item.uri, item.name)}>
                    <View style={styles.archiveIconBox}>
                      <Ionicons name="musical-note" size={18} color="#FFF" />
                    </View>
                    <Text numberOfLines={1} style={styles.archiveItemText}>
                      {stripExt(item.name)}
                    </Text>
                    <Ionicons name="play-circle" size={26} color="rgba(255,255,255,0.5)" />
                  </TouchableOpacity>
                )}
              />
            )}
          </BlurView>
        </View>
      </Modal>

      {/* Settings Modal */}
      <Modal animationType="slide" transparent visible={isSettingsVisible}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.modalOverlay}>
          <BlurView intensity={95} style={styles.modalContent} tint="dark">
            <View style={styles.modalInnerBorder} pointerEvents="none" />
            <View style={styles.modalDragHandle} />
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>پیکربندی سرور</Text>
              <TouchableOpacity style={styles.closeBtn} onPress={() => setSettingsVisible(false)}>
                <Ionicons name="close" size={22} color="#FFF" />
              </TouchableOpacity>
            </View>
            <View style={styles.settingsBody}>
              <Text style={styles.settingsLabel}>آدرس IPv4 سیستم هدف</Text>
              <View style={styles.inputContainer}>
                <Ionicons name="server-outline" size={18} color="rgba(255,255,255,0.5)" style={styles.inputIcon} />
                <TextInput
                  style={styles.input}
                  value={serverIP}
                  onChangeText={setServerIP}
                  keyboardType="numbers-and-punctuation"
                  placeholder="192.168.X.X"
                  placeholderTextColor="rgba(255,255,255,0.3)"
                />
              </View>
              <Text style={styles.settingsHint}>
                پورت سرور به صورت پیش‌فرض روی ۵۰۰۰ تنظیم شده است. مطمئن شوید گوشی و پی‌سی روی یک شبکه‌ی Wi-Fi هستند.
              </Text>
            </View>
            <TouchableOpacity
              style={styles.saveBtn}
              onPress={async () => {
                await AsyncStorage.setItem('serverIP', serverIP.trim());
                setSettingsVisible(false);
              }}
            >
              <Text style={styles.saveBtnText}>ذخیره تنظیمات</Text>
            </TouchableOpacity>
          </BlurView>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000' },

  bgContainer: { ...StyleSheet.absoluteFillObject, overflow: 'hidden', backgroundColor: '#0A0A10' },
  bgBlob: { position: 'absolute', borderRadius: 999, opacity: 0.6 },
  blob1: { backgroundColor: '#5E5CE6', top: -100, left: -100, width: 400, height: 400 },
  blob2: { backgroundColor: '#FF2A54', bottom: 100, right: -150, width: 500, height: 500 },
  blob3: { backgroundColor: '#32ADE6', top: '30%', left: '10%', width: 300, height: 300 },

  // لایه‌ی ظریف نور بالا برای حس شیشه
  glassSheen: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: height * 0.35,
    backgroundColor: 'rgba(255,255,255,0.04)',
  },

  // کپسول وضعیت
  topPillContainer: {
    position: 'absolute',
    alignSelf: 'center',
    zIndex: 100,
    borderRadius: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.35,
    shadowRadius: 18,
    elevation: 10,
    overflow: 'hidden',
  },
  topPillBlur: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  topPillInnerBorder: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.18)',
  },
  topPillText: {
    color: '#FFF',
    fontSize: 14,
    fontWeight: '800',
    marginLeft: 6,
    letterSpacing: 1,
  },

  safeArea: {
    flex: 1,
    alignItems: 'center',
    paddingTop: Platform.OS === 'ios' ? 100 : 80,
    width: '100%',
  },

  header: { marginBottom: 25 },
  headerText: { color: 'rgba(255,255,255,0.5)', fontSize: 11, fontWeight: '800', letterSpacing: 3 },

  artworkWrapper: {
    width: width * 0.75,
    height: width * 0.75,
    marginBottom: 35,
    justifyContent: 'center',
    alignItems: 'center',
  },
  artworkGlow: {
    position: 'absolute',
    width: '108%',
    height: '108%',
    borderRadius: 32,
    backgroundColor: '#FFFFFF',
    shadowColor: '#FFFFFF',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.3,
    shadowRadius: 40,
  },
  artworkContainer: {
    width: '100%',
    height: '100%',
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderRadius: 26,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 22 },
    shadowOpacity: 0.45,
    shadowRadius: 30,
    elevation: 15,
    overflow: 'hidden',
  },
  artworkBorder: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: 26,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.14)',
  },
  coverImage: { width: '100%', height: '100%', resizeMode: 'cover' },

  infoContainer: { width: '85%', alignItems: 'center', marginBottom: 25 },
  title: { fontSize: 24, fontWeight: '800', color: '#FFF', marginBottom: 6, textAlign: 'center' },
  subtitle: { fontSize: 14, color: 'rgba(255,255,255,0.5)', fontWeight: '600' },

  sliderContainer: { width: '85%', marginBottom: 20 },
  slider: { width: '100%', height: 30 },
  timeRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 0,
    paddingHorizontal: 2,
  },
  timeText: { fontSize: 11, color: 'rgba(255,255,255,0.5)', fontWeight: '600', fontVariant: ['tabular-nums'] },

  controls: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', width: '100%', marginBottom: 30 },
  controlIcon: { padding: 15, marginHorizontal: 20 },
  playBtn: {
    width: 76,
    height: 76,
    borderRadius: 38,
    shadowColor: '#FFF',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.2,
    shadowRadius: 18,
  },
  playBtnBlur: {
    width: '100%',
    height: '100%',
    borderRadius: 38,
    justifyContent: 'center',
    alignItems: 'center',
    overflow: 'hidden',
  },
  playBtnBorder: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: 38,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.5)',
  },

  volumeRow: { flexDirection: 'row', alignItems: 'center', width: '85%', marginBottom: 90 },
  volSlider: { flex: 1, marginHorizontal: 12, height: 30 },

  dockContainer: {
    position: 'absolute',
    bottom: Platform.OS === 'ios' ? 30 : 20,
    width: '100%',
    alignItems: 'center',
    zIndex: 10,
  },
  dockBlur: {
    flexDirection: 'row',
    width: 250,
    height: 66,
    borderRadius: 33,
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.3,
    shadowRadius: 20,
    elevation: 10,
  },
  dockBorder: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: 33,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.18)',
  },
  dockItem: { padding: 10 },
  dockMainCircle: {
    width: 46,
    height: 46,
    borderRadius: 23,
    backgroundColor: '#FFF',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#FFF',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 12,
  },

  welcomeScreen: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    width: '100%',
    height: '100%',
    zIndex: 99999,
    elevation: 99999,
  },
  welcomeBlur: { flex: 1, width: '100%', height: '100%', justifyContent: 'center', alignItems: 'center' },
  welcomeContent: { alignItems: 'center', paddingHorizontal: 40 },
  welcomeIconWrapper: {
    width: 120,
    height: 120,
    borderRadius: 40,
    backgroundColor: 'rgba(255,255,255,0.08)',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 35,
    overflow: 'hidden',
    shadowColor: '#FFF',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.15,
    shadowRadius: 25,
  },
  welcomeIconInner: { width: '100%', height: '100%', justifyContent: 'center', alignItems: 'center' },
  welcomeIconBorder: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: 40,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.3)',
  },
  welcomeTitle: { fontSize: 36, fontWeight: '900', color: '#FFF', marginBottom: 15, letterSpacing: 1 },
  welcomeSubtitle: {
    fontSize: 15,
    color: 'rgba(255,255,255,0.6)',
    textAlign: 'center',
    lineHeight: 24,
    marginBottom: 50,
    fontWeight: '500',
  },
  welcomeBtn: {
    width: 200,
    height: 60,
    borderRadius: 30,
    overflow: 'hidden',
    shadowColor: '#FFF',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.2,
    shadowRadius: 20,
  },
  welcomeBtnBlur: {
    flexDirection: 'row',
    width: '100%',
    height: '100%',
    justifyContent: 'center',
    alignItems: 'center',
  },
  welcomeBtnText: { color: '#000', fontSize: 16, fontWeight: '800', marginRight: 10 },

  modalOverlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.55)' },
  modalContent: {
    height: '65%',
    width: '100%',
    borderTopLeftRadius: 40,
    borderTopRightRadius: 40,
    paddingHorizontal: 25,
    paddingTop: 15,
    paddingBottom: 35,
    overflow: 'hidden',
  },
  modalInnerBorder: {
    ...StyleSheet.absoluteFillObject,
    borderTopLeftRadius: 40,
    borderTopRightRadius: 40,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.14)',
    borderBottomWidth: 0,
  },
  modalDragHandle: {
    width: 40,
    height: 5,
    borderRadius: 3,
    backgroundColor: 'rgba(255,255,255,0.3)',
    alignSelf: 'center',
    marginBottom: 20,
  },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 25 },
  modalTitle: { fontSize: 24, fontWeight: '800', color: '#FFF' },
  closeBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.1)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  emptyState: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingBottom: 50 },
  emptyText: { marginTop: 15, fontSize: 16, color: 'rgba(255,255,255,0.4)', fontWeight: '600' },
  archiveItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.07)',
    padding: 12,
    borderRadius: 20,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  archiveIconBox: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: 'rgba(255,42,84,0.8)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  archiveItemText: { flex: 1, marginHorizontal: 15, fontSize: 16, fontWeight: '600', color: '#FFF' },
  settingsBody: { flex: 1, marginTop: 10 },
  settingsLabel: { fontSize: 14, fontWeight: '700', color: 'rgba(255,255,255,0.6)', marginBottom: 10, marginLeft: 5 },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.07)',
    borderRadius: 20,
    paddingHorizontal: 15,
    marginBottom: 15,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
  },
  inputIcon: { marginRight: 10 },
  input: {
    flex: 1,
    paddingVertical: 18,
    fontSize: 18,
    fontWeight: '700',
    color: '#FFF',
    letterSpacing: 2,
  },
  settingsHint: {
    fontSize: 13,
    color: 'rgba(255,255,255,0.4)',
    lineHeight: 22,
    textAlign: 'justify',
    paddingHorizontal: 5,
  },
  saveBtn: {
    backgroundColor: '#FFF',
    padding: 20,
    borderRadius: 25,
    alignItems: 'center',
    shadowColor: '#FFF',
    shadowOffset: { width: 0, height: 5 },
    shadowOpacity: 0.2,
    shadowRadius: 15,
  },
  saveBtnText: { color: '#000', fontSize: 18, fontWeight: '800' },
});
