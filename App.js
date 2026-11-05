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
import { BlurView } from '@react-native-community/blur';
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
  // ----- Global -----
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

  // ----- Player -----
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

  // ----- File transfer -----
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploading, setUploading] = useState(false);
  const [lastUploaded, setLastUploaded] = useState(null);

  // ----- PC control -----
  const [pcBusy, setPcBusy] = useState(false);

  // ----- Effects -----
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
  }, []);

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

  // ----- Player functions -----
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
      setRecentTracks((prev) => {
        const filtered = prev.filter((t) => t.name !== name);
        return [{ name, uri }, ...filtered];
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

  // ----- File transfer -----
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

  // ----- PC control -----
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
  const glowOpacity = artworkGlow.interpolate({ inputRange: [0, 1], outputRange: [0.15, 0.4] });

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" translucent backgroundColor="transparent" />

      {/* حباب‌های نوری پس‌زمینه بدون تداخل بلر */}
      <View style={styles.bgContainer}>
        <Animated.View style={[styles.bgBlob, styles.blob1, { transform: [{ translateY: blob1TranslateY }] }]} />
        <Animated.View style={[styles.bgBlob, styles.blob2, { transform: [{ translateX: blob2TranslateX }] }]} />
        <Animated.View style={[styles.bgBlob, styles.blob3, { transform: [{ scale: blob3Scale }] }]} />
      </View>

      {/* Top Pill / جزیره بالای صفحه */}
      {!showWelcome && (
        <Animated.View style={[styles.topPillContainer, { transform: [{ translateY: pillDropAnim }] }]}>
          <BlurView style={StyleSheet.absoluteFill} blurType="thinMaterialDark" blurAmount={20} />
          <View style={styles.specularHairline} pointerEvents="none" />
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
          <View style={styles.header}><Text style={styles.headerText}>NOW PLAYING</Text></View>

          <View style={styles.artworkWrapper}>
            <Animated.View style={[styles.artworkGlow, { opacity: glowOpacity }]} />
            <View style={styles.artworkContainer}>
              {!coverError ? (
                <Image source={{ uri: coverUrl }} style={styles.coverImage} onError={() => setCoverError(true)} />
              ) : (
                <Ionicons name="musical-notes" size={82} color="rgba(255,255,255,0.25)" />
              )}
              <View style={styles.specularHairline} pointerEvents="none" />
            </View>
          </View>

          <View style={styles.infoContainer}>
            <Text numberOfLines={1} style={styles.title}>{stripExt(trackName)}</Text>
            <Text style={styles.subtitle}>Lossless Audio • High-Res</Text>
          </View>

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

          <View style={styles.controls}>
            <TouchableOpacity activeOpacity={0.5} style={styles.controlIcon} onPress={() => playRelative(1)}>
              <Ionicons name="play-skip-back" size={32} color="#FFF" />
            </TouchableOpacity>

            <TouchableOpacity activeOpacity={0.75} onPress={togglePause} style={styles.playBtn}>
              <BlurView style={StyleSheet.absoluteFill} blurType="thinMaterialLight" blurAmount={25} />
              <View style={styles.specularHairline} pointerEvents="none" />
              {loading ? (
                <ActivityIndicator size="small" color="#FFF" />
              ) : (
                <Ionicons name={isPlaying ? 'pause' : 'play'} size={32} color="#FFF" style={{ marginLeft: isPlaying ? 0 : 3 }} />
              )}
            </TouchableOpacity>

            <TouchableOpacity activeOpacity={0.5} style={styles.controlIcon} onPress={() => playRelative(-1)}>
              <Ionicons name="play-skip-forward" size={32} color="#FFF" />
            </TouchableOpacity>
          </View>

          <View style={styles.volumeRow}>
            <Ionicons name="volume-low" size={17} color="rgba(255,255,255,0.4)" />
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
            <Ionicons name="volume-high" size={17} color="rgba(255,255,255,0.4)" />
          </View>

          <TouchableOpacity style={styles.glassActionBtn} onPress={pickAndPlayMusic} activeOpacity={0.75}>
            <BlurView style={StyleSheet.absoluteFill} blurType="thinMaterialDark" blurAmount={20} />
            <View style={styles.specularHairline} pointerEvents="none" />
            <Ionicons name="add" size={20} color="#FFF" />
            <Text style={styles.glassActionBtnText}>افزودن قطعه صوتی</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.archiveLinkBtn} onPress={() => setArchiveVisible(true)}>
            <Text style={styles.archiveLinkText}>آرشیو قطعات</Text>
            <Ionicons name="chevron-back" size={14} color="rgba(255,255,255,0.4)" />
          </TouchableOpacity>
        </ScrollView>
      )}

      {/* ===================== PC CONTROL TAB ===================== */}
      {!showWelcome && activeTab === 'pc' && (
        <ScrollView
          style={styles.fullScroll}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.header}><Text style={styles.headerText}>DESKTOP CONTROL</Text></View>
          <Text style={styles.pcTitle}>کنترل سیستم</Text>
          <Text style={styles.pcSubtitle}>مدیریت بی‌درنگ وضعیت سخت‌افزار</Text>

          <TouchableOpacity
            style={styles.pcCard}
            disabled={pcBusy}
            activeOpacity={0.75}
            onPress={() => callSystemAction('sleep', 'حالت اسلیپ', 'سیستم به حالت خواب برود؟')}
          >
            <BlurView style={StyleSheet.absoluteFill} blurType="thinMaterialDark" blurAmount={20} />
            <View style={styles.specularHairline} pointerEvents="none" />
            <View style={[styles.pcIconBox, { backgroundColor: 'rgba(94,92,230,0.3)' }]}>
              <Ionicons name="moon" size={24} color="#8D8AFF" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.pcCardTitle}>حالت خواب (Sleep)</Text>
              <Text style={styles.pcCardDesc}>انتقال رایانه به حالت کم‌مصرف</Text>
            </View>
            <Ionicons name="chevron-back" size={17} color="rgba(255,255,255,0.3)" />
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.pcCard}
            disabled={pcBusy}
            activeOpacity={0.75}
            onPress={() => callSystemAction('restart', 'ری‌استارت', 'سیستم مجدداً راه‌اندازی شود؟')}
          >
            <BlurView style={StyleSheet.absoluteFill} blurType="thinMaterialDark" blurAmount={20} />
            <View style={styles.specularHairline} pointerEvents="none" />
            <View style={[styles.pcIconBox, { backgroundColor: 'rgba(50,173,230,0.3)' }]}>
              <Ionicons name="refresh" size={24} color="#64D2FF" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.pcCardTitle}>راه‌اندازی مجدد (Restart)</Text>
              <Text style={styles.pcCardDesc}>ری‌استارت کامل در ۵ ثانیه</Text>
            </View>
            <Ionicons name="chevron-back" size={17} color="rgba(255,255,255,0.3)" />
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.pcCard}
            disabled={pcBusy}
            activeOpacity={0.75}
            onPress={() => callSystemAction('shutdown', 'خاموشی', 'سیستم خاموش شود؟')}
          >
            <BlurView style={StyleSheet.absoluteFill} blurType="thinMaterialDark" blurAmount={20} />
            <View style={styles.specularHairline} pointerEvents="none" />
            <View style={[styles.pcIconBox, { backgroundColor: 'rgba(255,69,58,0.3)' }]}>
              <Ionicons name="power" size={24} color="#FF6961" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.pcCardTitle}>خاموش کردن (Shutdown)</Text>
              <Text style={styles.pcCardDesc}>خاتمه تمام پردازش‌ها و خاموشی</Text>
            </View>
            <Ionicons name="chevron-back" size={17} color="rgba(255,255,255,0.3)" />
          </TouchableOpacity>

          <TouchableOpacity style={styles.pcCancelBtn} onPress={cancelShutdown}>
            <Text style={styles.pcCancelText}>لغو عملیات زمان‌بندی‌شده</Text>
          </TouchableOpacity>
        </ScrollView>
      )}

      {/* ===================== FILE TRANSFER TAB ===================== */}
      {!showWelcome && activeTab === 'files' && (
        <ScrollView
          style={styles.fullScroll}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.header}><Text style={styles.headerText}>AIR TRANSFER</Text></View>
          <Text style={styles.pcTitle}>ارسال مستقیم</Text>
          <Text style={styles.pcSubtitle}>انتقال بی‌سیم فایل‌ها به سیستم</Text>

          <View style={styles.uploadZoneWrapper}>
            <View style={styles.uploadZone}>
              <BlurView style={StyleSheet.absoluteFill} blurType="thinMaterialDark" blurAmount={20} />
              <View style={styles.specularHairlineDashed} pointerEvents="none" />
              {uploading ? (
                <>
                  <ActivityIndicator size="large" color="#FFF" />
                  <Text style={styles.uploadStatusText}>
                    {Math.round(uploadProgress * 100)}% ارسـال شـد
                  </Text>
                  <View style={styles.progressTrack}>
                    <View style={[styles.progressFill, { width: `${uploadProgress * 100}%` }]} />
                  </View>
                </>
              ) : (
                <>
                  <View style={styles.uploadIconCircle}>
                    <Ionicons name="arrow-up-circle-outline" size={44} color="rgba(255,255,255,0.85)" />
                  </View>
                  <Text style={styles.uploadHintText}>فایل را برای ارسال انتخاب کنید</Text>
                  {lastUploaded && (
                    <Text style={styles.lastUploadedText}>آخرین فایل: {lastUploaded}</Text>
                  )}
                </>
              )}
            </View>
          </View>

          <TouchableOpacity style={styles.glassActionBtn} onPress={pickAndSendFile} disabled={uploading} activeOpacity={0.75}>
            <BlurView style={StyleSheet.absoluteFill} blurType="thinMaterialDark" blurAmount={20} />
            <View style={styles.specularHairline} pointerEvents="none" />
            <Ionicons name="document-text" size={19} color="#FFF" />
            <Text style={styles.glassActionBtnText}>انتخاب و انتقال فایل</Text>
          </TouchableOpacity>
        </ScrollView>
      )}

      {/* ===================== داک شناور دو تکه شیشه‌ای دقیقاً مثل ویدیو ===================== */}
      {!showWelcome && (
        <View style={styles.floatingBarWrapper} pointerEvents="box-none">
          {/* دکمه دایره‌ای شیشه‌ای مجزا در چپ */}
          <TouchableOpacity
            style={styles.circleGlassBtn}
            onPress={() => setSettingsVisible(true)}
            activeOpacity={0.7}
          >
            <BlurView style={StyleSheet.absoluteFill} blurType="thinMaterialDark" blurAmount={30} />
            <View style={styles.specularHairline} pointerEvents="none" />
            <Ionicons name="settings-outline" size={22} color="#FFF" />
          </TouchableOpacity>

          {/* کپسول قرصی شیشه‌ای اصلی با بلر طبیعی مایع */}
          <View style={styles.capsuleGlassDock}>
            <BlurView style={StyleSheet.absoluteFill} blurType="thinMaterialDark" blurAmount={30} />
            <View style={styles.specularHairline} pointerEvents="none" />

            <TouchableOpacity
              style={styles.dockTabItem}
              onPress={() => setActiveTab('player')}
              activeOpacity={0.7}
            >
              <Ionicons
                name={activeTab === 'player' ? 'musical-notes' : 'musical-notes-outline'}
                size={21}
                color={activeTab === 'player' ? '#FFF' : 'rgba(255,255,255,0.45)'}
              />
              <Text style={[styles.dockTabText, activeTab === 'player' && styles.dockTabTextActive]}>
                موزیک
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.dockTabItem}
              onPress={() => setActiveTab('pc')}
              activeOpacity={0.7}
            >
              <Ionicons
                name={activeTab === 'pc' ? 'desktop' : 'desktop-outline'}
                size={21}
                color={activeTab === 'pc' ? '#FFF' : 'rgba(255,255,255,0.45)'}
              />
              <Text style={[styles.dockTabText, activeTab === 'pc' && styles.dockTabTextActive]}>
                کنترل
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.dockTabItem}
              onPress={() => setActiveTab('files')}
              activeOpacity={0.7}
            >
              <Ionicons
                name={activeTab === 'files' ? 'cloud-upload' : 'cloud-upload-outline'}
                size={21}
                color={activeTab === 'files' ? '#FFF' : 'rgba(255,255,255,0.45)'}
              />
              <Text style={[styles.dockTabText, activeTab === 'files' && styles.dockTabTextActive]}>
                ارسال
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      {/* ===================== WELCOME ===================== */}
      {showWelcome && (
        <Animated.View style={[styles.welcomeScreen, { opacity: fadeAnim }]}>
          <Animated.View style={[styles.welcomeContent, { transform: [{ scale: scaleAnim }] }]}>
            <View style={styles.welcomeIconWrapper}>
              <BlurView style={StyleSheet.absoluteFill} blurType="thinMaterialLight" blurAmount={25} />
              <View style={styles.specularHairline} pointerEvents="none" />
              <Ionicons name="play" size={54} color="#FFF" style={{ marginLeft: 6 }} />
            </View>

            <Text style={styles.welcomeTitle}>Ashi Player</Text>
            <Text style={styles.welcomeSubtitle}>
              استریم مستقیم صوت و مدیریت سیستم‌عامل
            </Text>

            <TouchableOpacity activeOpacity={0.8} onPress={handleStartApp} style={styles.welcomeBtn}>
              <BlurView style={StyleSheet.absoluteFill} blurType="thinMaterialLight" blurAmount={25} />
              <View style={styles.specularHairline} pointerEvents="none" />
              <Text style={styles.welcomeBtnText}>ورود به برنامه</Text>
              <Ionicons name="arrow-forward" size={18} color="#FFF" />
            </TouchableOpacity>
          </Animated.View>
        </Animated.View>
      )}

      {/* ===================== شیت کشویی آرشیو ===================== */}
      <Modal animationType="slide" transparent visible={isArchiveVisible}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalGlassCard}>
            <BlurView style={StyleSheet.absoluteFill} blurType="thinMaterialDark" blurAmount={35} />
            <View style={styles.specularHairlineTop} pointerEvents="none" />
            <View style={styles.modalDragHandle} />
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>آرشیو قطعات صوتی</Text>
              <TouchableOpacity style={styles.closeBtn} onPress={() => setArchiveVisible(false)}>
                <Ionicons name="close" size={20} color="#FFF" />
              </TouchableOpacity>
            </View>
            {recentTracks.length === 0 ? (
              <View style={styles.emptyState}>
                <Ionicons name="disc-outline" size={56} color="rgba(255,255,255,0.2)" />
                <Text style={styles.emptyText}>هیچ قطعه‌ای در حافظه موقت نیست.</Text>
              </View>
            ) : (
              <FlatList
                data={recentTracks}
                showsVerticalScrollIndicator={false}
                keyExtractor={(item, index) => index.toString()}
                renderItem={({ item }) => (
                  <TouchableOpacity style={styles.archiveItem} onPress={() => sendFileToServer(item.uri, item.name)}>
                    <View style={styles.archiveIconBox}>
                      <Ionicons name="musical-note" size={17} color="#FFF" />
                    </View>
                    <Text numberOfLines={1} style={styles.archiveItemText}>{stripExt(item.name)}</Text>
                    <Ionicons name="play-circle-outline" size={24} color="rgba(255,255,255,0.5)" />
                  </TouchableOpacity>
                )}
              />
            )}
          </View>
        </View>
      </Modal>

      {/* ===================== شیت کشویی تنظیمات ===================== */}
      <Modal animationType="slide" transparent visible={isSettingsVisible}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.modalOverlay}>
          <View style={styles.modalGlassCard}>
            <BlurView style={StyleSheet.absoluteFill} blurType="thinMaterialDark" blurAmount={35} />
            <View style={styles.specularHairlineTop} pointerEvents="none" />
            <View style={styles.modalDragHandle} />
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>پیکربندی شبکه</Text>
              <TouchableOpacity style={styles.closeBtn} onPress={() => setSettingsVisible(false)}>
                <Ionicons name="close" size={20} color="#FFF" />
              </TouchableOpacity>
            </View>
            <View style={styles.settingsBody}>
              <Text style={styles.settingsLabel}>نشانی آی‌پی سرور محلی (IPv4)</Text>
              <View style={styles.inputContainer}>
                <Ionicons name="hardware-chip-outline" size={18} color="rgba(255,255,255,0.4)" style={styles.inputIcon} />
                <TextInput
                  style={styles.input}
                  value={serverIP}
                  onChangeText={setServerIP}
                  keyboardType="numbers-and-punctuation"
                  placeholder="192.168.1.X"
                  placeholderTextColor="rgba(255,255,255,0.25)"
                />
              </View>
              <Text style={styles.settingsHint}>
                پورت پیش‌فرض ۵۰۰۰ است. هر دو دستگاه باید به یک روتر متصل باشند.
              </Text>
            </View>
            <TouchableOpacity
              style={styles.appleActionBtn}
              onPress={async () => {
                await AsyncStorage.setItem('serverIP', serverIP.trim());
                setSettingsVisible(false);
              }}
            >
              <Text style={styles.appleActionBtnText}>ذخیره تغییرات</Text>
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0B0B10' },
  bgContainer: { ...StyleSheet.absoluteFillObject, overflow: 'hidden' },
  bgBlob: { position: 'absolute', borderRadius: 999, opacity: 0.6 },
  blob1: { backgroundColor: '#5E5CE6', top: -50, left: -70, width: 380, height: 380 },
  blob2: { backgroundColor: '#FF2D55', bottom: 160, right: -100, width: 440, height: 440 },
  blob3: { backgroundColor: '#007AFF', top: '35%', left: '15%', width: 300, height: 300 },

  fullScroll: { flex: 1, width: '100%' },
  scrollContent: {
    paddingTop: Platform.OS === 'ios' ? 104 : 84,
    paddingHorizontal: '7.5%',
    paddingBottom: 130, // فاصله باز برای اسکرول المان‌ها به پشت داک شیشه‌ای
    alignItems: 'center',
  },

  specularHairline: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: 999,
    borderWidth: 0.8,
    borderColor: 'rgba(255,255,255,0.25)',
    borderTopColor: 'rgba(255,255,255,0.5)',
  },
  specularHairlineTop: {
    ...StyleSheet.absoluteFillObject,
    borderTopLeftRadius: 36,
    borderTopRightRadius: 36,
    borderWidth: 0.8,
    borderColor: 'rgba(255,255,255,0.2)',
    borderTopColor: 'rgba(255,255,255,0.5)',
    borderBottomWidth: 0,
  },
  specularHairlineDashed: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: 24,
    borderWidth: 1.2,
    borderStyle: 'dashed',
    borderColor: 'rgba(255,255,255,0.25)',
  },

  topPillContainer: {
    position: 'absolute',
    alignSelf: 'center',
    zIndex: 100,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 7,
    borderRadius: 20,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.35,
    shadowRadius: 16,
  },
  topPillText: { color: '#FFF', fontSize: 13, fontWeight: '700', marginLeft: 6, letterSpacing: 0.5 },

  header: { marginBottom: 24, alignSelf: 'center' },
  headerText: { color: 'rgba(255,255,255,0.45)', fontSize: 11, fontWeight: '800', letterSpacing: 3 },

  artworkWrapper: { width: width * 0.74, height: width * 0.74, marginBottom: 30, justifyContent: 'center', alignItems: 'center' },
  artworkGlow: {
    position: 'absolute',
    width: '105%',
    height: '105%',
    borderRadius: 30,
    backgroundColor: '#FFFFFF',
    shadowColor: '#FFF',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.4,
    shadowRadius: 36,
  },
  artworkContainer: {
    width: '100%',
    height: '100%',
    borderRadius: 28,
    backgroundColor: 'rgba(255,255,255,0.06)',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 20 },
    shadowOpacity: 0.45,
    shadowRadius: 28,
    overflow: 'hidden',
  },
  coverImage: { width: '100%', height: '100%', resizeMode: 'cover' },

  infoContainer: { width: '100%', alignItems: 'center', marginBottom: 22 },
  title: { fontSize: 22, fontWeight: '800', color: '#FFF', marginBottom: 6, textAlign: 'center', letterSpacing: -0.3 },
  subtitle: { fontSize: 13, color: 'rgba(255,255,255,0.45)', fontWeight: '600', letterSpacing: 0.2 },

  sliderContainer: { width: '100%', marginBottom: 16 },
  slider: { width: '100%', height: 28 },
  timeRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 2, paddingHorizontal: 4 },
  timeText: { fontSize: 11, color: 'rgba(255,255,255,0.45)', fontWeight: '600', fontVariant: ['tabular-nums'] },

  controls: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', width: '100%', marginBottom: 22 },
  controlIcon: { padding: 14, marginHorizontal: 22 },
  playBtn: {
    width: 72,
    height: 72,
    borderRadius: 36,
    justifyContent: 'center',
    alignItems: 'center',
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.35,
    shadowRadius: 18,
  },

  volumeRow: { flexDirection: 'row', alignItems: 'center', width: '100%', marginBottom: 22 },
  volSlider: { flex: 1, marginHorizontal: 12, height: 28 },

  glassActionBtn: {
    width: '100%',
    borderRadius: 20,
    overflow: 'hidden',
    marginBottom: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.2,
    shadowRadius: 12,
  },
  glassActionBtnText: { color: '#FFF', fontWeight: '700', fontSize: 14, marginLeft: 8 },
  archiveLinkBtn: { flexDirection: 'row', alignItems: 'center', paddingVertical: 6 },
  archiveLinkText: { color: 'rgba(255,255,255,0.5)', fontSize: 13, fontWeight: '600', marginLeft: 4 },

  pcTitle: { fontSize: 26, fontWeight: '800', color: '#FFF', marginBottom: 6, alignSelf: 'flex-start', letterSpacing: -0.5 },
  pcSubtitle: { fontSize: 13, color: 'rgba(255,255,255,0.45)', marginBottom: 26, alignSelf: 'flex-start', textAlign: 'right' },
  pcCard: {
    width: '100%',
    borderRadius: 24,
    overflow: 'hidden',
    marginBottom: 14,
    flexDirection: 'row-reverse',
    alignItems: 'center',
    padding: 18,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.25,
    shadowRadius: 16,
  },
  pcIconBox: { width: 48, height: 48, borderRadius: 15, justifyContent: 'center', alignItems: 'center', marginLeft: 14 },
  pcCardTitle: { color: '#FFF', fontSize: 15, fontWeight: '700', textAlign: 'right', marginBottom: 2 },
  pcCardDesc: { color: 'rgba(255,255,255,0.45)', fontSize: 12, textAlign: 'right' },
  pcCancelBtn: { marginTop: 12, paddingVertical: 8 },
  pcCancelText: { color: 'rgba(255,255,255,0.4)', fontSize: 13, fontWeight: '600', textAlign: 'center' },

  uploadZoneWrapper: { width: '100%', marginTop: 8, marginBottom: 24 },
  uploadZone: {
    width: '100%',
    height: 220,
    borderRadius: 24,
    overflow: 'hidden',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.25,
    shadowRadius: 18,
  },
  uploadIconCircle: {
    width: 68,
    height: 68,
    borderRadius: 34,
    backgroundColor: 'rgba(255,255,255,0.08)',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 10,
  },
  uploadHintText: { color: 'rgba(255,255,255,0.7)', fontSize: 14, fontWeight: '600' },
  lastUploadedText: { color: 'rgba(255,255,255,0.35)', fontSize: 12, marginTop: 8 },
  uploadStatusText: { color: '#FFF', fontSize: 15, fontWeight: '700', marginTop: 12 },
  progressTrack: { width: '80%', height: 5, borderRadius: 2.5, backgroundColor: 'rgba(255,255,255,0.12)', marginTop: 14, overflow: 'hidden' },
  progressFill: { height: '100%', backgroundColor: '#FFF', borderRadius: 2.5 },

  // ==================== استایل داک دو تکه شیشه‌ای شناور ====================
  floatingBarWrapper: {
    position: 'absolute',
    bottom: Platform.OS === 'ios' ? 32 : 20,
    left: 20,
    right: 20,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 999,
  },
  circleGlassBtn: {
    width: 58,
    height: 58,
    borderRadius: 29,
    overflow: 'hidden',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.35,
    shadowRadius: 20,
  },
  capsuleGlassDock: {
    flex: 1,
    height: 58,
    borderRadius: 29,
    overflow: 'hidden',
    flexDirection: 'row-reverse',
    justifyContent: 'space-around',
    alignItems: 'center',
    paddingHorizontal: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.35,
    shadowRadius: 20,
  },
  dockTabItem: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 4,
  },
  dockTabText: {
    fontSize: 10,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.45)',
    marginTop: 2,
  },
  dockTabTextActive: {
    color: '#FFF',
    fontWeight: '800',
  },

  welcomeScreen: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 99999,
    justifyContent: 'center',
    alignItems: 'center',
  },
  welcomeContent: { alignItems: 'center', paddingHorizontal: 40 },
  welcomeIconWrapper: {
    width: 110,
    height: 110,
    borderRadius: 36,
    marginBottom: 30,
    overflow: 'hidden',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#FFF',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.25,
    shadowRadius: 28,
  },
  welcomeTitle: { fontSize: 34, fontWeight: '900', color: '#FFF', marginBottom: 12, letterSpacing: -0.5 },
  welcomeSubtitle: { fontSize: 14, color: 'rgba(255,255,255,0.5)', textAlign: 'center', lineHeight: 22, marginBottom: 44, fontWeight: '500' },
  welcomeBtn: {
    width: 190,
    height: 56,
    borderRadius: 28,
    overflow: 'hidden',
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.3,
    shadowRadius: 18,
  },
  welcomeBtnText: { color: '#FFF', fontSize: 15, fontWeight: '700', marginRight: 8 },

  modalOverlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.5)' },
  modalGlassCard: {
    height: '62%',
    width: '100%',
    borderTopLeftRadius: 36,
    borderTopRightRadius: 36,
    paddingHorizontal: 24,
    paddingTop: 14,
    paddingBottom: 32,
    overflow: 'hidden',
  },
  modalDragHandle: { width: 36, height: 5, borderRadius: 2.5, backgroundColor: 'rgba(255,255,255,0.3)', alignSelf: 'center', marginBottom: 20 },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 22 },
  modalTitle: { fontSize: 22, fontWeight: '800', color: '#FFF' },
  closeBtn: { width: 32, height: 32, borderRadius: 16, backgroundColor: 'rgba(255,255,255,0.1)', justifyContent: 'center', alignItems: 'center' },
  emptyState: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingBottom: 40 },
  emptyText: { marginTop: 14, fontSize: 15, color: 'rgba(255,255,255,0.35)', fontWeight: '600' },
  archiveItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.05)',
    padding: 12,
    borderRadius: 18,
    marginBottom: 10,
    borderWidth: 0.8,
    borderColor: 'rgba(255,255,255,0.12)',
  },
  archiveIconBox: { width: 38, height: 38, borderRadius: 12, backgroundColor: 'rgba(255,42,84,0.7)', justifyContent: 'center', alignItems: 'center' },
  archiveItemText: { flex: 1, marginHorizontal: 14, fontSize: 15, fontWeight: '600', color: '#FFF' },
  settingsBody: { flex: 1, marginTop: 8 },
  settingsLabel: { fontSize: 13, fontWeight: '600', color: 'rgba(255,255,255,0.5)', marginBottom: 8, marginLeft: 4 },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderRadius: 18,
    paddingHorizontal: 14,
    marginBottom: 12,
    borderWidth: 0.8,
    borderColor: 'rgba(255,255,255,0.15)',
  },
  inputIcon: { marginRight: 8 },
  input: { flex: 1, paddingVertical: 16, fontSize: 17, fontWeight: '600', color: '#FFF', letterSpacing: 1.5 },
  settingsHint: { fontSize: 12, color: 'rgba(255,255,255,0.35)', lineHeight: 20, textAlign: 'justify', paddingHorizontal: 4 },
  appleActionBtn: {
    backgroundColor: '#FFFFFF',
    paddingVertical: 18,
    borderRadius: 22,
    alignItems: 'center',
    shadowColor: '#FFF',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
  },
  appleActionBtnText: { color: '#000', fontSize: 16, fontWeight: '700' },
});
