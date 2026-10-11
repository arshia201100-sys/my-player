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
  SafeAreaView,
  Modal,
  FlatList,
  TextInput,
  KeyboardAvoidingView,
  Platform,
  Image,
  Animated,
} from 'react-native';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system/legacy';
import { BlurView } from 'expo-blur';
import Slider from '@react-native-community/slider';
import { Ionicons } from '@expo/vector-icons';

const { width, height } = Dimensions.get('window');

const formatTime = (secs) => {
  if (isNaN(secs) || secs < 0) return '00:00';
  const m = Math.floor(secs / 60);
  const s = Math.floor(secs % 60);
  return `${m < 10 ? '0' : ''}${m}:${s < 10 ? '0' : ''}${s}`;
};

export default function App() {
  // ----- State های ورود (Welcome Screen) -----
  const [showWelcome, setShowWelcome] = useState(true);
  const fadeAnim = useRef(new Animated.Value(1)).current;
  const scaleAnim = useRef(new Animated.Value(0.9)).current;

  // ----- State های اصلی پلیر -----
  const [loading, setLoading] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [trackName, setTrackName] = useState('هیچ موزیکی در حال پخش نیست');
  const [duration, setDuration] = useState(0);
  const [position, setPosition] = useState(0);
  const [volume, setVolume] = useState(0.7);
  const [coverError, setCoverError] = useState(false);

  const [serverIP, setServerIP] = useState('172.20.10.14');
  const [recentTracks, setRecentTracks] = useState([]);
  const [isArchiveVisible, setArchiveVisible] = useState(false);
  const [isSettingsVisible, setSettingsVisible] = useState(false);

  const SERVER_URL = `http://${serverIP}:5000`;
  const isSliding = useRef(false);
  const slideTimeout = useRef(null);

  // انیمیشن صفحه ورود
  useEffect(() => {
    Animated.spring(scaleAnim, {
      toValue: 1,
      friction: 4,
      useNativeDriver: true,
    }).start();
  }, []);

  const handleStartApp = () => {
    Animated.timing(fadeAnim, {
      toValue: 0,
      duration: 400,
      useNativeDriver: true,
    }).start(() => setShowWelcome(false));
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
    
    // وقتی کاربر در صفحه ولکام است، نیازی به ریکوئست‌های مداوم نیست
    if (showWelcome) return;

    const interval = setInterval(fetchStatus, 1000);
    return () => clearInterval(interval);
  }, [serverIP, showWelcome]);

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

      setRecentTracks(prev => {
        const filtered = prev.filter(t => t.name !== name);
        return [{ name, uri }, ...filtered];
      });

    } catch (error) {
      Alert.alert('خطا', 'ارتباط با سیستم برقرار نشد.');
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

  return (
    <View style={styles.container}>
      <StatusBar barStyle="dark-content" />

      {/* هاله‌های رنگی پس‌زمینه */}
      <View style={[styles.bgBlob, { backgroundColor: '#FAD961', top: -50, left: -50, width: 300, height: 300 }]} />
      <View style={[styles.bgBlob, { backgroundColor: '#F76B1C', bottom: '10%', right: -100, width: 400, height: 400 }]} />
      <View style={[styles.bgBlob, { backgroundColor: '#9B51E0', top: '30%', right: -50, width: 250, height: 250, opacity: 0.3 }]} />
      <BlurView intensity={100} tint="light" style={StyleSheet.absoluteFill} />

      {/* محتوای اصلی برنامه */}
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.playerCardContainer}>
          <BlurView intensity={85} tint="light" style={styles.playerCard}>
            
            {/* کاور با لبه‌های گردتر */}
            <View style={styles.artwork}>
              {!coverError ? (
                <Image 
                  source={{ uri: coverUrl }} 
                  style={styles.coverImage}
                  onError={() => setCoverError(true)}
                />
              ) : (
                <Ionicons name="musical-notes" size={80} color="rgba(0,0,0,0.15)" />
              )}
            </View>

            <Text style={styles.title} numberOfLines={1}>
              {trackName.replace('.mp3', '')}
            </Text>
            <Text style={styles.subtitle}>Desktop Speaker</Text>

            <View style={styles.sliderContainer}>
              <Slider
                style={styles.slider}
                minimumValue={0}
                maximumValue={duration > 0 ? duration : 1}
                value={position}
                onSlidingStart={onSlidingStart}
                onValueChange={onValueChange}
                onSlidingComplete={handleSeek}
                minimumTrackTintColor="#000"
                maximumTrackTintColor="rgba(0,0,0,0.1)"
                thumbTintColor="#000"
              />
              <View style={styles.timeRow}>
                <Text style={styles.timeText}>{formatTime(position)}</Text>
                <Text style={styles.timeText}>-{formatTime(duration - position)}</Text>
              </View>
            </View>

            <View style={styles.controls}>
              <TouchableOpacity style={styles.controlIcon}>
                <Ionicons name="play-skip-back" size={35} color="#333" />
              </TouchableOpacity>

              <TouchableOpacity style={styles.playBtn} onPress={togglePause} activeOpacity={0.8}>
                {loading ? (
                  <ActivityIndicator size="large" color="#FFF" />
                ) : (
                  <Ionicons name={isPlaying ? "pause" : "play"} size={35} color="#FFF" style={{ marginLeft: isPlaying ? 0 : 4 }} />
                )}
              </TouchableOpacity>

              <TouchableOpacity style={styles.controlIcon}>
                <Ionicons name="play-skip-forward" size={35} color="#333" />
              </TouchableOpacity>
            </View>

            <View style={styles.volumeRow}>
              <Ionicons name="volume-low" size={20} color="rgba(0,0,0,0.4)" />
              <Slider
                style={styles.volSlider}
                minimumValue={0}
                maximumValue={1}
                value={volume}
                onSlidingComplete={handleVolume}
                minimumTrackTintColor="#000"
                maximumTrackTintColor="rgba(0,0,0,0.1)"
                thumbTintColor="#000"
              />
              <Ionicons name="volume-high" size={20} color="rgba(0,0,0,0.4)" />
            </View>

          </BlurView>
        </View>
      </SafeAreaView>

      {/* 
        منوی شناور مهندسی شده: 
        لایه بک‌گراند بلور از لایه دکمه‌ها جداست تا دکمه وسط کات نشود و منو کاملا کپسولی بماند 
      */}
      <View style={styles.tabBarWrapper}>
        <BlurView intensity={90} tint="light" style={styles.tabBarBackground} />
        
        <View style={styles.tabBarForeground}>
          <TouchableOpacity style={styles.tabItem} onPress={() => setArchiveVisible(true)} activeOpacity={0.6}>
            <Ionicons name="albums-outline" size={26} color="#666" />
            <Text style={styles.tabText}>آرشیو</Text>
          </TouchableOpacity>

          <View style={styles.tabItemMain}>
            <TouchableOpacity style={styles.mainTabCircle} onPress={pickAndPlayMusic} activeOpacity={0.8}>
              <Ionicons name="add" size={36} color="#FFF" />
            </TouchableOpacity>
            <Text style={styles.tabTextMain}>ارسال موزیک</Text>
          </View>

          <TouchableOpacity style={styles.tabItem} onPress={() => setSettingsVisible(true)} activeOpacity={0.6}>
            <Ionicons name="settings-outline" size={26} color="#666" />
            <Text style={styles.tabText}>تنظیمات</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* ========================================= */}
      {/* صفحه ورود (Welcome Screen) متحرک */}
      {showWelcome && (
        <Animated.View style={[styles.welcomeScreen, { opacity: fadeAnim }]}>
          <BlurView intensity={100} tint="light" style={styles.welcomeBlur}>
            <Animated.View style={[styles.welcomeContent, { transform: [{ scale: scaleAnim }] }]}>
              
              <View style={styles.welcomeIconContainer}>
                <Ionicons name="headset" size={90} color="#FF2A54" />
              </View>
              
              <Text style={styles.welcomeTitle}>Remote Player</Text>
              <Text style={styles.welcomeSubtitle}>تجربه پخش هوشمند موزیک روی سیستم شخصی شما، بدون افت کیفیت.</Text>

              <TouchableOpacity style={styles.welcomeBtn} onPress={handleStartApp} activeOpacity={0.8}>
                <Text style={styles.welcomeBtnText}>ورود به برنامه</Text>
                <Ionicons name="chevron-forward" size={24} color="#FFF" />
              </TouchableOpacity>

            </Animated.View>
          </BlurView>
        </Animated.View>
      )}

      {/* ========================================= */}
      {/* مدال آرشیو */}
      <Modal visible={isArchiveVisible} transparent={true} animationType="slide">
        <View style={styles.modalOverlay}>
          <BlurView intensity={90} tint="light" style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>آرشیو موزیک‌ها</Text>
              <TouchableOpacity onPress={() => setArchiveVisible(false)}>
                <Ionicons name="close-circle" size={30} color="#999" />
              </TouchableOpacity>
            </View>
            
            {recentTracks.length === 0 ? (
              <View style={styles.emptyState}>
                <Ionicons name="file-tray-outline" size={50} color="#CCC" />
                <Text style={styles.emptyText}>هنوز موزیکی پخش نکرده‌اید.</Text>
              </View>
            ) : (
              <FlatList
                data={recentTracks}
                keyExtractor={(item, index) => index.toString()}
                renderItem={({ item }) => (
                  <TouchableOpacity style={styles.archiveItem} onPress={() => sendFileToServer(item.uri, item.name)}>
                    <Ionicons name="musical-note" size={24} color="#FF2A54" />
                    <Text style={styles.archiveItemText} numberOfLines={1}>{item.name}</Text>
                    <Ionicons name="play" size={20} color="#CCC" />
                  </TouchableOpacity>
                )}
              />
            )}
          </BlurView>
        </View>
      </Modal>

      {/* ========================================= */}
      {/* مدال تنظیمات */}
      <Modal visible={isSettingsVisible} transparent={true} animationType="slide">
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.modalOverlay}>
          <BlurView intensity={90} tint="light" style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>تنظیمات ارتباط</Text>
              <TouchableOpacity onPress={() => setSettingsVisible(false)}>
                <Ionicons name="close-circle" size={30} color="#999" />
              </TouchableOpacity>
            </View>

            <View style={styles.settingsBody}>
              <Text style={styles.settingsLabel}>آدرس IP سیستم (کامپیوتر):</Text>
              <TextInput
                style={styles.input}
                value={serverIP}
                onChangeText={setServerIP}
                keyboardType="numbers-and-punctuation"
                placeholder="192.168.1.X"
                placeholderTextColor="#999"
              />
              <Text style={styles.settingsHint}>
                در صورت تغییر وای‌فای، آی‌پی جدید سیستم را اینجا وارد کنید تا برنامه بدون نیاز به آپدیت دوباره متصل شود.
              </Text>
            </View>
            
            <TouchableOpacity style={styles.saveBtn} onPress={() => setSettingsVisible(false)}>
              <Text style={styles.saveBtnText}>ذخیره و بستن</Text>
            </TouchableOpacity>
          </BlurView>
        </KeyboardAvoidingView>
      </Modal>

    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F2F2F7' },
  bgBlob: { position: 'absolute', borderRadius: 999, opacity: 0.6 },
  safeArea: { flex: 1, alignItems: 'center', paddingTop: 50 },
  
  // گردتر کردن لبه‌های کارت اصلی پلیر
  playerCardContainer: {
    width: '90%', marginTop: 15, shadowColor: '#000',
    shadowOffset: { width: 0, height: 20 }, shadowOpacity: 0.12, shadowRadius: 35, elevation: 10,
  },
  playerCard: {
    width: '100%', borderRadius: 45, padding: 25, backgroundColor: 'rgba(255,255,255,0.5)',
    borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.9)', overflow: 'hidden',
  },
  
  // گردتر کردن لبه‌های کاور عکس
  artwork: {
    width: '100%', aspectRatio: 1, backgroundColor: 'rgba(255,255,255,0.5)', borderRadius: 30,
    justifyContent: 'center', alignItems: 'center', marginBottom: 25, shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 }, shadowOpacity: 0.08, shadowRadius: 20, overflow: 'hidden'
  },
  coverImage: { width: '100%', height: '100%', resizeMode: 'cover' },

  title: { fontSize: 24, fontWeight: '800', color: '#000', marginBottom: 5 },
  subtitle: { fontSize: 16, color: 'rgba(0,0,0,0.5)', fontWeight: '600', marginBottom: 25 },
  
  sliderContainer: { width: '100%', marginBottom: 20 },
  slider: { width: '100%', height: 40 },
  timeRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: -10, paddingHorizontal: 5 },
  timeText: { fontSize: 12, color: 'rgba(0,0,0,0.5)', fontWeight: '500' },
  
  controls: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, marginBottom: 25 },
  controlIcon: { padding: 10 },
  playBtn: {
    width: 75, height: 75, borderRadius: 40, backgroundColor: '#000', justifyContent: 'center',
    alignItems: 'center', shadowColor: '#000', shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.25, shadowRadius: 15,
  },
  
  volumeRow: { flexDirection: 'row', alignItems: 'center' },
  volSlider: { flex: 1, marginHorizontal: 10, height: 40 },
  
  // ==========================================
  // مهندسی تب بار شناور پایین
  // ==========================================
  tabBarWrapper: {
    position: 'absolute',
    bottom: Platform.OS === 'ios' ? 40 : 25, // فاصله از کف صفحه برای معلق بودن
    width: '100%',
    alignItems: 'center',
    justifyContent: 'center',
  },
  tabBarBackground: {
    position: 'absolute',
    width: '90%',
    height: 75,
    borderRadius: 40, // کپسولی و دایره‌ای کامل از بغل
    backgroundColor: 'rgba(255,255,255,0.7)',
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.9)',
    overflow: 'hidden', // فقط پس‌زمینه کات می‌شود
    shadowColor: '#000', shadowOffset: { width: 0, height: 10 }, shadowOpacity: 0.08, shadowRadius: 20,
  },
  tabBarForeground: {
    flexDirection: 'row',
    width: '90%',
    height: 75,
    justifyContent: 'space-around',
    alignItems: 'center',
    paddingHorizontal: 10,
  },
  tabItem: { alignItems: 'center', justifyContent: 'center', flex: 1 },
  tabText: { fontSize: 11, color: '#666', marginTop: 4, fontWeight: '600' },
  
  tabItemMain: { flex: 1, alignItems: 'center', justifyContent: 'center', position: 'relative' },
  mainTabCircle: {
    position: 'absolute', top: -50, // بیرون‌زدگی کامل بدون هیچ تداخلی
    width: 66, height: 66, borderRadius: 33, backgroundColor: '#FF2A54', justifyContent: 'center',
    alignItems: 'center', shadowColor: '#FF2A54', shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.45, shadowRadius: 15,
  },
  tabTextMain: { fontSize: 11, color: '#000', fontWeight: '800', marginTop: 35 },

  // ==========================================
  // استایل صفحه ورود
  // ==========================================
  welcomeScreen: {
    position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
    zIndex: 999, justifyContent: 'center', alignItems: 'center',
  },
  welcomeBlur: {
    flex: 1, width: '100%', justifyContent: 'center', alignItems: 'center',
  },
  welcomeContent: {
    alignItems: 'center', paddingHorizontal: 30,
  },
  welcomeIconContainer: {
    width: 150, height: 150, borderRadius: 75, backgroundColor: 'rgba(255,42,84,0.1)',
    justifyContent: 'center', alignItems: 'center', marginBottom: 30,
    borderWidth: 2, borderColor: 'rgba(255,42,84,0.3)',
  },
  welcomeTitle: { fontSize: 34, fontWeight: '900', color: '#000', marginBottom: 15, letterSpacing: 1 },
  welcomeSubtitle: { fontSize: 16, color: '#555', textAlign: 'center', lineHeight: 26, marginBottom: 50, fontWeight: '500' },
  welcomeBtn: {
    flexDirection: 'row', backgroundColor: '#000', paddingVertical: 18, paddingHorizontal: 35,
    borderRadius: 30, alignItems: 'center', shadowColor: '#000', shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.3, shadowRadius: 15,
  },
  welcomeBtnText: { color: '#FFF', fontSize: 18, fontWeight: '700', marginRight: 10 },

  // ==========================================
  // Modals
  // ==========================================
  modalOverlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.25)' },
  modalContent: {
    height: '65%', width: '100%', borderTopLeftRadius: 35, borderTopRightRadius: 35,
    padding: 25, backgroundColor: 'rgba(255,255,255,0.9)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.9)',
  },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 },
  modalTitle: { fontSize: 22, fontWeight: '800', color: '#000' },
  
  emptyState: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  emptyText: { marginTop: 15, fontSize: 16, color: '#888', fontWeight: '500' },
  archiveItem: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(255,255,255,0.6)',
    padding: 15, borderRadius: 16, marginBottom: 12,
  },
  archiveItemText: { flex: 1, marginLeft: 12, fontSize: 16, fontWeight: '600', color: '#333' },

  settingsBody: { flex: 1, marginTop: 10 },
  settingsLabel: { fontSize: 16, fontWeight: '700', color: '#333', marginBottom: 10 },
  input: {
    backgroundColor: 'rgba(0,0,0,0.05)', borderRadius: 16, padding: 18, fontSize: 18,
    fontWeight: '600', color: '#000', letterSpacing: 1, textAlign: 'center', marginBottom: 15,
  },
  settingsHint: { fontSize: 13, color: '#666', lineHeight: 20, textAlign: 'justify' },
  saveBtn: {
    backgroundColor: '#000', padding: 18, borderRadius: 20, alignItems: 'center', marginBottom: 20,
  },
  saveBtnText: { color: '#FFF', fontSize: 18, fontWeight: '700' },
});