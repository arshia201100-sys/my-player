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
  ScrollView,
} from 'react-native';
import DocumentPicker, { types } from 'react-native-document-picker';
import RNFS from 'react-native-fs';
import { BlurView } from 'expo-blur';
import Slider from '@react-native-community/slider';
import Ionicons from 'react-native-vector-icons/Ionicons';
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
  const [showWelcome, setShowWelcome] = useState(true);
  const [activeTab, setActiveTab] = useState('player');
  const fadeAnim = useRef(new Animated.Value(1)).current;
  const scaleAnim = useRef(new Animated.Value(0.92)).current;
  const blobAnim = useRef(new Animated.Value(0)).current;
  const pillDropAnim = useRef(new Animated.Value(-60)).current;
  const artworkGlow = useRef(new Animated.Value(0)).current;

  const [serverIP, setServerIP] = useState('192.168.1.92');
  const [isSettingsVisible, setSettingsVisible] = useState(false);
  const SERVER_URL = `http://${serverIP}:5000`;

  const [loading, setLoading] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [trackName, setTrackName] = useState('هیچ موزیکی در حال پخش نیست');
  const [duration, setDuration] = useState(0);
  const [position, setPosition] = useState(0);
  const [volume, setVolume] = useState(0.7);
  const [coverError, setCoverError] = useState(false);
  const [recentTracks, setRecentTracks] = useState([]);
  const [isArchiveVisible, setArchiveVisible] = useState(false);
  const isSliding = useRef(false);
  const slideTimeout = useRef(null);

  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploading, setUploading] = useState(false);
  const [lastUploaded, setLastUploaded] = useState(null);

  const [pcBusy, setPcBusy] = useState(false);

  useEffect(() => {
    Animated.spring(scaleAnim, { toValue: 1, tension: 40, friction: 7, useNativeDriver: true }).start();
    Animated.loop(
      Animated.sequence([
        Animated.timing(blobAnim, { toValue: 1, duration: 9000, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        Animated.timing(blobAnim, { toValue: 0, duration: 9000, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
      ])
    ).start();
    Animated.loop(
      Animated.sequence([
        Animated.timing(artworkGlow, { toValue: 1, duration: 3500, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
        Animated.timing(artworkGlow, { toValue: 0, duration: 3500, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
      ])
    ).start();
  }, []);

  useEffect(() => {
    AsyncStorage.getItem('serverIP').then((v) => { if (v) setServerIP(v); });
    AsyncStorage.getItem('recentTracks').then((v) => {
      if (v) {
        try {
          const parsed = JSON.parse(v);
          if (Array.isArray(parsed)) setRecentTracks(parsed);
        } catch (e) {}
      }
    });
  }, []);

  // Persist archive whenever it changes
  useEffect(() => {
    if (recentTracks.length > 0 || recentTracks === []) {
      AsyncStorage.setItem('recentTracks', JSON.stringify(recentTracks));
    }
  }, [recentTracks]);

  const handleStartApp = () => {
    Animated.timing(fadeAnim, { toValue: 0, duration: 300, useNativeDriver: true }).start(() => {
      setShowWelcome(false);
      Animated.spring(pillDropAnim, { toValue: Platform.OS === 'ios' ? 54 : 24, tension: 50, friction: 8, useNativeDriver: true }).start();
    });
  };

  useEffect(() => { setCoverError(false); }, [trackName]);

  useEffect(() => {
    const fetchStatus = async () => {
      try {
        const res = await fetch(`${SERVER_URL}/status`);
        if (res.ok) {
          const data = await res.json();
          setIsPlaying(data.is_playing);
          setTrackName(data.track_name);
          setDuration(data.duration);
          if (!isSliding.current) setPosition(data.position);
          setVolume(data.volume);
        }
      } catch (e) {}
    };
    if (showWelcome) return;
    const interval = setInterval(fetchStatus, 1000);
    return () => clearInterval(interval);
  }, [serverIP, showWelcome]);

  const ensureTracksDir = async () => {
    const dir = `${RNFS.DocumentDirectoryPath}/tracks`;
    const exists = await RNFS.exists(dir);
    if (!exists) await RNFS.mkdir(dir);
    return dir;
  };

  const sendFileToServer = async (uri, name) => {
    setLoading(true);
    setArchiveVisible(false);
    try {
      const cleanUri = Platform.OS === 'ios' ? decodeURIComponent(uri.replace('file://', '')) : uri;
      const base64Data = await RNFS.readFile(cleanUri, 'base64');

      const response = await fetch(`${SERVER_URL}/play`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ filename: name, data: base64Data }),
      });
      if (!response.ok) throw new Error('خطا در سرور');

      // Copy to permanent storage so archive survives app restarts
      let permanentUri = uri;
      try {
        const tracksDir = await ensureTracksDir();
        const safeName = name.replace(/[^a-zA-Z0-9._\-\u0600-\u06FF ]/g, '_');
        const dest = `${tracksDir}/${safeName}`;
        const already = await RNFS.exists(dest);
        if (!already) {
          await RNFS.copyFile(cleanUri, dest);
        }
        permanentUri = Platform.OS === 'ios' ? dest : `file://${dest}`;
      } catch (copyErr) {
        // fallback to original uri if copy fails
      }

      setRecentTracks((prev) => {
        const filtered = prev.filter((t) => t.name !== name);
        return [{ name, uri: permanentUri }, ...filtered].slice(0, 50); // keep last 50
      });
    } catch (error) {
      Alert.alert('خطا', 'ارتباط با سرور برقرار نشد.');
    } finally {
      setLoading(false);
    }
  };

  const pickAndPlayMusic = async () => {
    try {
      const result = await DocumentPicker.pickSingle({
        type: [types.audio],
        copyTo: 'cachesDirectory',
      });
      if (result) sendFileToServer(result.fileCopyUri || result.uri, result.name);
    } catch (error) {
      if (!DocumentPicker.isCancel(error)) Alert.alert('خطا', 'مشکلی در انتخاب فایل پیش آمد.');
    }
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
    const next = recentTracks[(i + step + recentTracks.length) % recentTracks.length];
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
      slideTimeout.current = setTimeout(() => { isSliding.current = false; }, 1200);
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

  const pickAndSendFile = async () => {
    try {
      const file = await DocumentPicker.pickSingle({
        type: [types.allFiles],
        copyTo: 'cachesDirectory',
      });
      if (!file) return;

      setUploading(true);
      setUploadProgress(0);

      const targetUri = file.fileCopyUri || file.uri;
      const formData = new FormData();
      formData.append('filename', file.name);
      formData.append('file', {
        uri: targetUri,
        type: file.type || 'application/octet-stream',
        name: file.name,
      });

      const xhr = new XMLHttpRequest();
      xhr.open('POST', `${SERVER_URL}/upload`);

      xhr.upload.onprogress = (event) => {
        if (event.lengthComputable && event.total > 0) {
          setUploadProgress(event.loaded / event.total);
        }
      };

      xhr.onload = () => {
        if (xhr.status === 200) setLastUploaded(file.name);
        else Alert.alert('خطا', 'پاسخ ناموفق از سرور.');
        setUploading(false);
        setUploadProgress(0);
      };

      xhr.onerror = () => {
        Alert.alert('خطا', 'ارسال ناموفق بود.');
        setUploading(false);
        setUploadProgress(0);
      };

      xhr.send(formData);
    } catch (error) {
      if (!DocumentPicker.isCancel(error)) Alert.alert('خطا', 'ارسال فایل با شکست مواجه شد.');
      setUploading(false);
      setUploadProgress(0);
    }
  };

  const callSystemAction = (action, label, confirmMsg) => {
    Alert.alert(label, confirmMsg, [
      { text: 'انصراف', style: 'cancel' },
      {
        text: 'تأیید',
        style: 'destructive',
        onPress: async () => {
          setPcBusy(true);
          try {
            const res = await fetch(`${SERVER_URL}/system/${action}`, { method: 'POST' });
            if (!res.ok) throw new Error();
          } catch (e) {
            Alert.alert('خطا', 'دستور به سیستم نرسید.');
          } finally {
            setPcBusy(false);
          }
        },
      },
    ]);
  };

  const cancelShutdown = async () => {
    try {
      await fetch(`${SERVER_URL}/system/cancel`, { method: 'POST' });
    } catch (e) {}
  };

  const blob1TranslateY = blobAnim.interpolate({ inputRange: [0, 1], outputRange: [0, 60] });
  const blob2TranslateX = blobAnim.interpolate({ inputRange: [0, 1], outputRange: [0, -50] });
  const blob3Scale = blobAnim.interpolate({ inputRange: [0, 1], outputRange: [1, 1.25] });
  const glowOpacity = artworkGlow.interpolate({ inputRange: [0, 1], outputRange: [0.12, 0.38] });

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" translucent backgroundColor="transparent" />

      {/* Animated Background Blobs */}
      <View style={styles.bgContainer}>
        <Animated.View style={[styles.bgBlob, styles.blob1, { transform: [{ translateY: blob1TranslateY }] }]} />
        <Animated.View style={[styles.bgBlob, styles.blob2, { transform: [{ translateX: blob2TranslateX }] }]} />
        <Animated.View style={[styles.bgBlob, styles.blob3, { transform: [{ scale: blob3Scale }] }]} />
      </View>

      {/* Top Pill - Glass */}
      {!showWelcome && (
        <Animated.View style={[styles.topPillContainer, { transform: [{ translateY: pillDropAnim }] }]}>
          <BlurView style={StyleSheet.absoluteFill} tint="systemChromeMaterialDark" intensity={85} />
          <View style={styles.specularHairline20} pointerEvents="none" />
          <Ionicons
            name={activeTab === 'player' ? 'musical-notes' : activeTab === 'pc' ? 'desktop' : 'cloud-upload'}
            size={13}
            color="#FFF"
          />
          <Text style={styles.topPillText}>
            {activeTab === 'player' ? 'Ashi Player' : activeTab === 'pc' ? 'کنترل سیستم' : 'ارسال فایل'}
          </Text>
        </Animated.View>
      )}

      {/* ===================== PLAYER TAB ===================== */}
      {!showWelcome && activeTab === 'player' && (
        <ScrollView
          style={styles.fullScroll}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.header}>
            <Text style={styles.headerText}>NOW PLAYING</Text>
          </View>

          {/* Artwork */}
          <View style={styles.artworkWrapper}>
            <Animated.View style={[styles.artworkGlow, { opacity: glowOpacity }]} />
            <View style={styles.artworkContainer}>
              <BlurView style={StyleSheet.absoluteFill} tint="dark" intensity={40} />
              {!coverError ? (
                <Image source={{ uri: coverUrl }} style={styles.coverImage} onError={() => setCoverError(true)} />
              ) : (
                <Ionicons name="musical-notes" size={82} color="rgba(255,255,255,0.22)" />
              )}
              <View style={styles.specularHairline28} pointerEvents="none" />
            </View>
          </View>

          {/* Track Info */}
          <View style={styles.infoContainer}>
            <Text numberOfLines={1} style={styles.title}>{stripExt(trackName)}</Text>
            <Text style={styles.subtitle}>Lossless Audio • High-Res</Text>
          </View>

          {/* Progress Slider */}
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
              maximumTrackTintColor="rgba(255,255,255,0.18)"
              thumbTintColor="#FFFFFF"
            />
            <View style={styles.timeRow}>
              <Text style={styles.timeText}>{formatTime(position)}</Text>
              <Text style={styles.timeText}>-{formatTime(duration - position)}</Text>
            </View>
          </View>

          {/* Controls */}
          <View style={styles.controls}>
            <TouchableOpacity activeOpacity={0.5} style={styles.controlIcon} onPress={() => playRelative(1)}>
              <Ionicons name="play-skip-back" size={32} color="#FFF" />
            </TouchableOpacity>

            <TouchableOpacity activeOpacity={0.8} onPress={togglePause} style={styles.playBtn}>
              <BlurView style={StyleSheet.absoluteFill} tint="systemThickMaterialLight" intensity={55} />
              <View style={styles.specularHairlineRound} pointerEvents="none" />
              {loading ? (
                <ActivityIndicator size="small" color="#FFF" />
              ) : (
                <Ionicons
                  name={isPlaying ? 'pause' : 'play'}
                  size={32}
                  color="#FFF"
                  style={{ marginLeft: isPlaying ? 0 : 3 }}
                />
              )}
            </TouchableOpacity>

            <TouchableOpacity activeOpacity={0.5} style={styles.controlIcon} onPress={() => playRelative(-1)}>
              <Ionicons name="play-skip-forward" size={32} color="#FFF" />
            </TouchableOpacity>
          </View>

          {/* Volume */}
          <View style={styles.volumeRow}>
            <Ionicons name="volume-low" size={17} color="rgba(255,255,255,0.4)" />
            <Slider
              style={styles.volSlider}
              minimumValue={0}
              maximumValue={1}
              value={volume}
              onSlidingComplete={handleVolume}
              minimumTrackTintColor="#FFFFFF"
              maximumTrackTintColor="rgba(255,255,255,0.18)"
              thumbTintColor="#FFFFFF"
            />
            <Ionicons name="volume-high" size={17} color="rgba(255,255,255,0.4)" />
          </View>

          {/* Add Track Button - Glass */}
          <TouchableOpacity style={styles.glassActionBtn} onPress={pickAndPlayMusic} activeOpacity={0.75}>
            <BlurView style={StyleSheet.absoluteFill} tint="systemChromeMaterialDark" intensity={75} />
            <View style={styles.specularHairline20} pointerEvents="none" />
            <Ionicons name="add" size={20} color="#FFF" />
            <Text style={styles.glassActionBtnText}>افزودن قطعه صوتی</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.archiveLinkBtn} onPress={() => setArchiveVisible(true)}>
            <Text style={styles.archiveLinkText}>آرشیو قطعات</Text>
            <Ionicons name="chevron-back" size={14} color="rgba(255,255,255,0.4)" />
          </TouchableOpacity>
        </ScrollView>
      )}

      {/* REST OF FILE CONTINUES - truncated in this call intentionally - will fix with full file */}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000' },
});
