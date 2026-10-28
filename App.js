import React, { useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, SafeAreaView, StatusBar, TextInput, Alert, ActivityIndicator, Dimensions, Image, FlatList } from 'react-native';
import { FontAwesome5 } from '@expo/vector-icons';
import { Video, ResizeMode } from 'expo-av';

const { width, height } = Dimensions.get('window');

export default function App() {
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [pin, setPin] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [activeTab, setActiveTab] = useState('live'); // 'live' o 'movie'
  const [userData, setUserData] = useState(null);
  
  // Listas de contenido real de Xtream
  const [liveStreams, setLiveStreams] = useState([]);
  const [movies, setMovies] = useState([]);
  const [fetchingContent, setFetchingContent] = useState(false);

  // Estado para el reproductor ExoPlayer interno
  const [playingVideoUrl, setPlayingVideoUrl] = useState(null);
  const [videoTitle, setVideoTitle] = useState('');

  // 1. Autenticación con Firebase y Xtream
  const handleLogin = async () => {
    if (pin.trim().length < 3) {
      Alert.alert('Error', 'Ingresa un PIN válido');
      return;
    }

    setIsLoading(true);

    try {
      const fbResponse = await fetch(`https://firevodpanel-default-rtdb.firebaseio.com/lineas/${pin.trim()}.json?timestamp=${Date.now()}`);
      const firebaseData = await fbResponse.json();

      if (!firebaseData) {
        Alert.alert('Acceso Denegado', 'El código PIN no existe.');
        setIsLoading(false);
        return;
      }

      if (firebaseData.bloqueado === true || firebaseData.bloqueado === 1 || firebaseData.estado === 'bloqueado') {
        Alert.alert('Acceso Denegado', 'Tu PIN ha sido bloqueado.');
        setIsLoading(false);
        return;
      }

      if (firebaseData.vencimiento) {
        let expiryDate = new Date(firebaseData.vencimiento);
        if (!isNaN(expiryDate.getTime()) && new Date() > expiryDate) {
          Alert.alert('Cuenta Vencida', `Tu suscripción expiró el ${expiryDate.toLocaleDateString('es-ES')}.`);
          setIsLoading(false);
          return;
        }
      }

      const { serverUrl, xtreamUser, xtreamPass } = firebaseData;

      if (!serverUrl || !xtreamUser || !xtreamPass) {
        Alert.alert('Error', 'La cuenta no tiene credenciales completas.');
        setIsLoading(false);
        return;
      }

      const cleanUrl = serverUrl.replace(/\/+$/, '');
      const xtreamResponse = await fetch(`${cleanUrl}/player_api.php?username=${xtreamUser}&password=${xtreamPass}`);
      const xtreamData = await xtreamResponse.json();

      if (xtreamData && xtreamData.user_info && xtreamData.user_info.auth === 1) {
        const userCreds = {
          serverUrl: cleanUrl,
          username: xtreamUser,
          password: xtreamPass,
          name: firebaseData.nombre || 'Usuario'
        };
        setUserData(userCreds);
        setIsLoggedIn(true);
        
        // Cargar listas reales de inmediato
        loadXtreamContent(userCreds);
      } else {
        Alert.alert('Error de conexión', 'Credenciales de Xtream inválidas.');
      }

    } catch (error) {
      console.error(error);
      Alert.alert('Error', 'No se pudo conectar con el servidor.');
    } finally {
      setIsLoading(false);
    }
  };

  // 2. Cargar canales y películas desde Xtream Codes
  const loadXtreamContent = async (creds) => {
    setFetchingContent(true);
    try {
      // Cargar canales en vivo
      const liveRes = await fetch(`${creds.serverUrl}/player_api.php?username=${creds.username}&password=${creds.password}&action=get_live_streams`);
      const liveData = await liveRes.json();
      if (Array.isArray(liveData)) setLiveStreams(liveData.slice(0, 50)); // Limitamos a 50 para fluidez en pruebas

      // Cargar películas VOD
      const vodRes = await fetch(`${creds.serverUrl}/player_api.php?username=${creds.username}&password=${creds.password}&action=get_vod_streams`);
      const vodData = await vodRes.json();
      if (Array.isArray(vodData)) setMovies(vodData.slice(0, 50));

    } catch (e) {
      console.log("Error cargando contenido Xtream:", e);
    } finally {
      setFetchingContent(false);
    }
  };

  const handleLogout = () => {
    setIsLoggedIn(false);
    setPin('');
    setUserData(null);
    setPlayingVideoUrl(null);
    setLiveStreams([]);
    setMovies([]);
  };

  // --- REPRODUCTOR NATIVO (EXOPLAYER) EN PANTALLA COMPLETA ---
  if (playingVideoUrl) {
    return (
      <View style={styles.playerContainer}>
        <StatusBar hidden />
        <Video
          source={{ uri: playingVideoUrl }}
          style={styles.videoPlayer}
          resizeMode={ResizeMode.CONTAIN}
          shouldPlay={true}
          useNativeControls={true}
          onError={(e) => console.log("Error en ExoPlayer:", e)}
        />
        <TouchableOpacity 
          style={styles.backButton} 
          onPress={() => setPlayingVideoUrl(null)}
        >
          <FontAwesome5 name="arrow-left" size={18} color="#fff" />
          <Text style={styles.backButtonText}>Regresar</Text>
        </TouchableOpacity>
      </View>
    );
  }

  // --- PANTALLA DE LOGIN ---
  if (!isLoggedIn) {
    return (
      <SafeAreaView style={styles.loginContainer}>
        <StatusBar barStyle="light-content" backgroundColor="#121216" />
        <View style={styles.loginBox}>
          <Text style={styles.loginLogo}>FIREVOD</Text>
          <Text style={styles.loginSubtitle}>Ingresa tu Código de Acceso (PIN)</Text>
          
          <TextInput
            style={styles.pinInput}
            placeholder="Ej: 131543"
            placeholderTextColor="#888"
            keyboardType="numeric"
            value={pin}
            onChangeText={setPin}
            secureTextEntry={true} 
            editable={!isLoading}
          />
          
          <TouchableOpacity style={styles.btnRed} onPress={handleLogin} disabled={isLoading}>
            {isLoading ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <Text style={styles.btnRedText}>INGRESAR</Text>
            )}
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  // Elementos actuales a mostrar según la pestaña activa
  const currentList = activeTab === 'live' ? liveStreams : movies;

  // --- PANTALLA PRINCIPAL CON LISTAS REALES ---
  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor="#121216" />

      {/* HEADER */}
      <View style={styles.header}>
        <Text style={styles.logo}>FIREVOD</Text>
        <View style={{flexDirection: 'row', gap: 15, alignItems: 'center'}}>
          <Text style={{color: '#aaa', fontSize: 12}}>Hola, {userData?.name}</Text>
          <TouchableOpacity style={styles.iconBtn} onPress={handleLogout}>
            <FontAwesome5 name="sign-out-alt" size={16} color="#ff2400" />
          </TouchableOpacity>
        </View>
      </View>

      {/* NAVBAR DE CATEGORÍAS */}
      <View style={styles.navContainer}>
        <TouchableOpacity 
          style={[styles.tabBtn, activeTab === 'live' && styles.tabBtnActive]} 
          onPress={() => setActiveTab('live')}
        >
          <FontAwesome5 name="tv" size={14} color={activeTab === 'live' ? '#fff' : '#ff2400'} style={{marginRight: 6}} />
          <Text style={[styles.tabText, activeTab === 'live' && styles.tabTextActive]}>TV en Vivo</Text>
        </TouchableOpacity>

        <TouchableOpacity 
          style={[styles.tabBtn, activeTab === 'movie' && styles.tabBtnActive]} 
          onPress={() => setActiveTab('movie')}
        >
          <FontAwesome5 name="film" size={14} color={activeTab === 'movie' ? '#fff' : '#ff2400'} style={{marginRight: 6}} />
          <Text style={[styles.tabText, activeTab === 'movie' && styles.tabTextActive]}>Películas</Text>
        </TouchableOpacity>
      </View>

      {/* CONTENIDO: GRID DE CANALES / PELÍCULAS */}
      <View style={styles.contentArea}>
        {fetchingContent ? (
          <View style={styles.centerLoader}>
            <ActivityIndicator size="large" color="#ff2400" />
            <Text style={{color: '#aaa', marginTop: 10}}>Cargando tu contenido...</Text>
          </View>
        ) : (
          <FlatList
            data={currentList}
            keyExtractor={(item, index) => item.stream_id ? item.stream_id.toString() : index.toString()}
            numColumns={3}
            contentContainerStyle={styles.gridContainer}
            renderItem={({ item }) => {
              const title = item.name || item.title || 'Canal / Película';
              const logo = item.stream_icon || item.cover || 'https://i.ibb.co/pvy9nBkV/10ed6469-a30b-4c95-b642-d254c313f63e.png';
              
              return (
                <TouchableOpacity 
                  style={styles.card}
                  activeOpacity={0.8}
                  onPress={() => {
                    let url = '';
                    if (activeTab === 'live') {
                      url = `${userData.serverUrl}/live/${userData.username}/${userData.password}/${item.stream_id}.ts`;
                    } else {
                      const ext = item.container_extension || 'mp4';
                      url = `${userData.serverUrl}/movie/${userData.username}/${userData.password}/${item.stream_id}.${ext}`;
                    }
                    setVideoTitle(title);
                    setPlayingVideoUrl(url);
                  }}
                >
                  <Image source={{ uri: logo }} style={styles.cardImage} resizeMode="cover" />
                  <Text style={styles.cardTitle} numberOfLines={2}>{title}</Text>
                </TouchableOpacity>
              );
            }}
          />
        )}
      </View>
    </SafeAreaView>
  );
}

// --- ESTILOS NATIVOS ---
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#121216' },
  loginContainer: { flex: 1, backgroundColor: '#121216', justifyContent: 'center', alignItems: 'center', padding: 20 },
  loginBox: {
    backgroundColor: 'rgba(20, 20, 28, 0.95)',
    padding: 40,
    borderRadius: 24,
    width: '100%',
    maxWidth: 400,
    borderWidth: 2,
    borderColor: '#ff2400',
    alignItems: 'center',
    elevation: 10,
  },
  loginLogo: { color: '#ff2400', fontSize: 38, fontWeight: '900', letterSpacing: 2, marginBottom: 10 },
  loginSubtitle: { color: '#eee', fontSize: 15, marginBottom: 30, textAlign: 'center' },
  pinInput: {
    width: '100%',
    backgroundColor: 'rgba(0,0,0,0.6)',
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.2)',
    borderRadius: 12,
    color: '#fff',
    fontSize: 20,
    padding: 16,
    textAlign: 'center',
    letterSpacing: 4,
    marginBottom: 20,
  },
  btnRed: {
    width: '100%',
    backgroundColor: '#ff2400',
    padding: 16,
    borderRadius: 12,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#fff',
  },
  btnRedText: { color: '#fff', fontSize: 16, fontWeight: 'bold', letterSpacing: 1 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, paddingTop: 40, paddingBottom: 15 },
  logo: { color: '#ff2400', fontSize: 28, fontWeight: '900', letterSpacing: 2 },
  iconBtn: { backgroundColor: 'rgba(15,15,25,0.85)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.2)', width: 45, height: 45, borderRadius: 25, justifyContent: 'center', alignItems: 'center' },
  navContainer: { flexDirection: 'row', justifyContent: 'center', gap: 15, paddingVertical: 10, backgroundColor: 'rgba(0,0,0,0.3)' },
  tabBtn: { flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(15,15,25,0.85)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.2)', paddingVertical: 8, paddingHorizontal: 20, borderRadius: 20 },
  tabBtnActive: { backgroundColor: '#ff2400', borderColor: '#ff2400' },
  tabText: { color: '#eee', fontWeight: '600', fontSize: 14 },
  tabTextActive: { color: '#fff', fontWeight: '800' },
  contentArea: { flex: 1, paddingHorizontal: 10, paddingTop: 10 },
  centerLoader: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  gridContainer: { paddingBottom: 20 },
  card: { flex: 1, margin: 6, backgroundColor: 'rgba(255,255,255,0.05)', borderRadius: 10, overflow: 'hidden', borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)', maxWidth: (width / 3) - 12, height: 160 },
  cardImage: { width: '100%', height: 110, backgroundColor: '#000' },
  cardTitle: { color: '#fff', fontSize: 11, fontWeight: '600', padding: 6, textAlign: 'center' },
  playerContainer: { flex: 1, backgroundColor: '#000', justifyContent: 'center', alignItems: 'center' },
  videoPlayer: { width: width, height: height },
  backButton: {
    position: 'absolute',
    top: 40,
    left: 20,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.6)',
    paddingVertical: 10,
    paddingHorizontal: 15,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.3)',
    zIndex: 10,
  },
  backButtonText: { color: '#fff', fontWeight: 'bold', marginLeft: 8, fontSize: 14 },
});
