import { StatusBar } from 'expo-status-bar';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { Ionicons } from '@expo/vector-icons';
import { useEffect, useMemo, useRef, useState } from 'react';
import * as Location from 'expo-location';
import MapView, { Marker } from 'react-native-maps';
import {
  ActivityIndicator,
  Image,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

type Screen =
  | 'welcome'
  | 'onboarding'
  | 'home'
  | 'map'
  | 'locationPermission'
  | 'camera'
  | 'photoPreview'
  | 'reportForm'
  | 'issueDetail'
  | 'reportSuccess'
  | 'profile';

type IssueStatus = 'Open' | 'In Progress' | 'Resolved';

type Issue = {
  id: string;
  title: string;
  summary: string;
  location: string;
  latitude: number;
  longitude: number;
  status: IssueStatus;
  severity: string;
  reportCount: number;
  imageUrl?: string | null;
};

type IssueApi = {
  cluster_id: string;
  issue_type: string;
  summary: string;
  latitude: number;
  longitude: number;
  status: IssueStatus;
  severity: string;
  report_count: number;
  latest_image_url?: string | null;
};

type FeedResponse = { issues: IssueApi[] };

type LocationState = {
  label: string;
  latitude: number;
  longitude: number;
};

const API_BASE_URL = (
  process.env.EXPO_PUBLIC_API_BASE_URL ?? 'https://scroll-backend-latest.onrender.com'
).replace(/\/$/, '');
const fallbackLocation: LocationState = { label: 'Unknown location', latitude: 0, longitude: 0 };
const REPORT_LOCATION_PLACEHOLDER = '53 Dalhousie Street';

function formatAddress(
  place: Location.LocationGeocodedAddress | undefined,
  coords: Location.LocationObjectCoords,
): string {
  if (!place) return `${coords.latitude.toFixed(5)}, ${coords.longitude.toFixed(5)}`;
  const line = [place.name, place.street].filter(Boolean).join(' ');
  const locality = [place.city, place.region, place.country].filter(Boolean).join(', ');
  return [line, locality].filter(Boolean).join(', ') || `${coords.latitude.toFixed(5)}, ${coords.longitude.toFixed(5)}`;
}

function toIssue(item: IssueApi): Issue {
  return {
    id: item.cluster_id,
    title: item.issue_type,
    summary: item.summary,
    location: `${item.latitude.toFixed(5)}, ${item.longitude.toFixed(5)}`,
    latitude: item.latitude,
    longitude: item.longitude,
    status: item.status,
    severity: item.severity,
    reportCount: item.report_count,
    imageUrl: item.latest_image_url,
  };
}

function distanceKm(aLat: number, aLng: number, bLat: number, bLng: number): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const earthRadiusKm = 6371;
  const dLat = toRad(bLat - aLat);
  const dLng = toRad(bLng - aLng);
  const lat1 = toRad(aLat);
  const lat2 = toRad(bLat);

  const h =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.sin(dLng / 2) * Math.sin(dLng / 2) * Math.cos(lat1) * Math.cos(lat2);
  return 2 * earthRadiusKm * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

async function fetchFeed(): Promise<Issue[]> {
  const response = await fetch(`${API_BASE_URL}/feed?limit=40`);
  if (!response.ok) throw new Error('Failed to load nearby issues');
  const data = (await response.json()) as FeedResponse;
  return data.issues.map(toIssue);
}

async function fetchIssue(id: string): Promise<Issue> {
  const response = await fetch(`${API_BASE_URL}/issue/${id}`);
  if (!response.ok) throw new Error('Failed to load issue');
  const data = (await response.json()) as IssueApi;
  return toIssue(data);
}

async function submitReport(params: {
  description: string;
  location: LocationState;
  photoUri: string;
}): Promise<void> {
  const form = new FormData();
  const payload = JSON.stringify({
    description: params.description,
    location: {
      latitude: params.location.latitude,
      longitude: params.location.longitude,
    },
  });

  form.append('payload', payload);

  const ext = params.photoUri.split('.').pop() || 'jpg';
  form.append('image', {
    uri: params.photoUri,
    name: `report.${ext}`,
    type: `image/${ext === 'jpg' ? 'jpeg' : ext}`,
  } as never);

  const response = await fetch(`${API_BASE_URL}/report`, {
    method: 'POST',
    body: form,
  });

  if (!response.ok) {
    const message = await response.text();
    throw new Error(message || 'Failed to submit report');
  }
}

export default function App() {
  const [screen, setScreen] = useState<Screen>('welcome');
  const [issues, setIssues] = useState<Issue[]>([]);
  const [issuesLoading, setIssuesLoading] = useState(false);
  const [issuesError, setIssuesError] = useState<string | null>(null);

  const [selectedIssueId, setSelectedIssueId] = useState<string | null>(null);
  const [selectedIssue, setSelectedIssue] = useState<Issue | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  const [reportPhotoUri, setReportPhotoUri] = useState<string | null>(null);
  const [reportLocation, setReportLocation] = useState<LocationState>(fallbackLocation);
  const [reportDescription, setReportDescription] = useState('');
  const [submitLoading, setSubmitLoading] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  useEffect(() => {
    if (screen !== 'home' && screen !== 'map') return;

    async function loadHome() {
      try {
        setIssuesLoading(true);
        setIssuesError(null);
        const data = await fetchFeed();
        setIssues(data);
      } catch (err) {
        setIssuesError(err instanceof Error ? err.message : 'Failed to load issues');
      } finally {
        setIssuesLoading(false);
      }
    }

    loadHome();
  }, [screen]);

  useEffect(() => {
    if (!selectedIssueId || screen !== 'issueDetail') return;
    const issueId = selectedIssueId;

    async function loadDetail() {
      try {
        setDetailLoading(true);
        const data = await fetchIssue(issueId);
        setSelectedIssue(data);
      } catch {
        setSelectedIssue(null);
      } finally {
        setDetailLoading(false);
      }
    }

    loadDetail();
  }, [selectedIssueId, screen]);

  const startReportFlow = () => {
    setReportPhotoUri(null);
    setReportDescription('');
    setReportLocation(fallbackLocation);
    setSubmitError(null);
    setScreen('locationPermission');
  };

  const topIssues = useMemo(() => issues.slice(0, 8), [issues]);

  if (screen === 'welcome') {
    return <WelcomeScreen onContinue={() => setScreen('onboarding')} />;
  }

  if (screen === 'onboarding') {
    return <OnboardingScreen onGetStarted={() => setScreen('home')} />;
  }

  return (
    <SafeAreaView style={styles.root}>
      <StatusBar style="dark" />

      {screen === 'home' && (
        <HomeScreen
          issues={topIssues}
          loading={issuesLoading}
          error={issuesError}
          onRefresh={() => setScreen('home')}
          onOpenMap={() => setScreen('map')}
          onOpenReportFlow={startReportFlow}
          onOpenIssue={(id) => {
            setSelectedIssueId(id);
            setScreen('issueDetail');
          }}
          onOpenProfile={() => setScreen('profile')}
        />
      )}

      {screen === 'map' && (
        <MapScreen
          issues={issues}
          loading={issuesLoading}
          onOpenHome={() => setScreen('home')}
          onOpenProfile={() => setScreen('profile')}
        />
      )}

      {screen === 'locationPermission' && (
        <LocationPermissionScreen
          onBack={() => setScreen('home')}
          onResolved={(location) => {
            setReportLocation(location);
            setScreen('camera');
          }}
        />
      )}

      {screen === 'camera' && (
        <CameraCaptureScreen
          onBack={() => setScreen('locationPermission')}
          onCaptured={(uri) => {
            setReportPhotoUri(uri);
            setScreen('photoPreview');
          }}
        />
      )}

      {screen === 'photoPreview' && (
        <PhotoPreviewScreen
          photoUri={reportPhotoUri}
          onRetake={() => setScreen('camera')}
          onUsePhoto={() => setScreen('reportForm')}
        />
      )}

      {screen === 'reportForm' && (
        <ReportFormScreen
          photoUri={reportPhotoUri}
          locationLabel={reportLocation.label}
          description={reportDescription}
          submitLoading={submitLoading}
          submitError={submitError}
          onDescriptionChange={setReportDescription}
          onBack={() => setScreen('photoPreview')}
          onSubmit={async () => {
            if (!reportPhotoUri) {
              setSubmitError('Please capture a photo before submitting.');
              return;
            }

            try {
              setSubmitLoading(true);
              setSubmitError(null);
              await submitReport({
                description: reportDescription,
                location: reportLocation,
                photoUri: reportPhotoUri,
              });
              setScreen('reportSuccess');
            } catch (err) {
              setSubmitError(err instanceof Error ? err.message : 'Failed to submit report');
            } finally {
              setSubmitLoading(false);
            }
          }}
        />
      )}

      {screen === 'issueDetail' && (
        <IssueDetailScreen
          issue={selectedIssue}
          loading={detailLoading}
          onBack={() => setScreen('home')}
        />
      )}

      {screen === 'reportSuccess' && (
        <ReportSuccessScreen
          onTrack={() => setScreen('home')}
          onHome={() => setScreen('home')}
        />
      )}

      {screen === 'profile' && <ProfileScreen onBack={() => setScreen('home')} />}
    </SafeAreaView>
  );
}

function Header({ title, left, right }: { title: string; left?: React.ReactNode; right?: React.ReactNode }) {
  return (
    <View style={styles.headerRow}>
      <View style={styles.headerSide}>{left}</View>
      <Text style={styles.headerTitle}>{title}</Text>
      <View style={[styles.headerSide, styles.headerSideRight]}>{right}</View>
    </View>
  );
}

function WelcomeScreen({ onContinue }: { onContinue: () => void }) {
  const [progress] = useState(30);

  useEffect(() => {
    const timer = setTimeout(() => {
      onContinue();
    }, 2500);
    return () => clearTimeout(timer);
  }, [onContinue]);

  return (
    <View style={styles.welcomeWrapper}>
      <StatusBar style="dark" />
      <View style={styles.welcomeGlowLarge} />
      <View style={styles.welcomeGlowSmall} />

      <View style={styles.welcomeCenterBlock}>
        <View style={styles.welcomeIconCard}>
          <Ionicons name="business" size={52} color="#FFFFFF" />
        </View>
        <Text style={styles.welcomeTitle}>Hello Resident</Text>
        <Text style={styles.welcomeText}>Reporting issues made simple for your community.</Text>
      </View>

      <View style={styles.welcomeProgressBlock}>
        <View style={styles.welcomeProgressHeader}>
          <Text style={styles.welcomeProgressLabel}>INITIALISING</Text>
          <Text style={styles.welcomeProgressValue}>{progress}%</Text>
        </View>
        <View style={styles.welcomeProgressTrack}>
          <View style={[styles.welcomeProgressFill, { width: `${progress}%` }]} />
        </View>
      </View>

      <View style={styles.welcomeBottomBlock}>
        <Text style={styles.welcomeBottomText}>SECURE COMMUNITY PLATFORM</Text>
      </View>
    </View>
  );
}

function OnboardingScreen({ onGetStarted }: { onGetStarted: () => void }) {
  return (
    <SafeAreaView style={styles.onboardingRoot}>
      <StatusBar style="dark" />
      <View style={styles.onboardingCard}>
        <View style={styles.onboardingHeader}>
          <View style={styles.onboardingHeaderIcon}>
            <Ionicons name="megaphone" size={24} color="#2F67DF" />
          </View>
          <Text style={styles.onboardingHeaderTitle}>Maya AI</Text>
        </View>

        <View style={styles.onboardingImageWrap}>
          <Image
            source={{ uri: 'https://images.unsplash.com/photo-1529156069898-49953e39b3ac?auto=format&fit=crop&w=1200&q=80' }}
            style={styles.onboardingImage}
          />
        </View>

        <Text style={styles.onboardingTitlePrimary}>Make Your Neighborhood</Text>
        <Text style={styles.onboardingTitleAccent}>Better</Text>

        <Text style={styles.onboardingBody}>
          Join thousands of neighbors reporting and fixing local issues in real-time. Together, we build a safer community.
        </Text>

        <View style={styles.onboardingDots}>
          <View style={[styles.onboardingDot, styles.onboardingDotActive]} />
          <View style={styles.onboardingDot} />
          <View style={styles.onboardingDot} />
        </View>

        <Pressable style={styles.onboardingButton} onPress={onGetStarted}>
          <Text style={styles.onboardingButtonText}>Get Started  →</Text>
        </Pressable>

        <View style={styles.onboardingSignInRow}>
          <Text style={styles.onboardingSignInText}>Already have an account? </Text>
          <Text style={styles.onboardingSignInLink}>Sign In</Text>
        </View>
      </View>
    </SafeAreaView>
  );
}

function HomeScreen({
  issues,
  loading,
  error,
  onRefresh,
  onOpenMap,
  onOpenReportFlow,
  onOpenIssue,
  onOpenProfile,
}: {
  issues: Issue[];
  loading: boolean;
  error: string | null;
  onRefresh: () => void;
  onOpenMap: () => void;
  onOpenReportFlow: () => void;
  onOpenIssue: (id: string) => void;
  onOpenProfile: () => void;
}) {
  return (
    <View style={styles.page}>
      <Header title="Maya AI" right={<Ionicons name="search" size={18} color="#64748B" />} />
      <ScrollView
        contentContainerStyle={[styles.scrollContent, styles.homeScrollContent]}
        showsVerticalScrollIndicator={false}
        contentInsetAdjustmentBehavior="never"
        automaticallyAdjustContentInsets={false}
      >
        <Pressable style={styles.mapCard} onPress={onOpenReportFlow}>
          <Image
            source={{ uri: 'https://images.unsplash.com/photo-1526778548025-fa2f459cd5ce?auto=format&fit=crop&w=1200&q=80' }}
            style={styles.mapImage}
          />
          <View style={styles.mapCardOverlay}>
            <Text style={styles.mapCardTitle}>Start report with location + photo</Text>
          </View>
        </Pressable>

        {error ? (
          <View style={styles.errorBox}>
            <Text style={styles.errorText}>{error}</Text>
            <Pressable onPress={onRefresh}>
              <Text style={styles.retryText}>Retry</Text>
            </Pressable>
          </View>
        ) : null}

        <Text style={styles.sectionTitle}>Nearby Issues</Text>

        {loading && <ActivityIndicator color="#2563EB" />}

        {!loading && issues.length === 0 ? (
          <Text style={styles.emptyText}>No issues available yet.</Text>
        ) : (
          issues.map((item) => (
            <Pressable key={item.id} style={styles.issueCard} onPress={() => onOpenIssue(item.id)}>
              <View style={styles.issueIconWrap}>
                <Ionicons name="alert-circle-outline" size={18} color="#1D4ED8" />
              </View>
              <View style={styles.issueTextWrap}>
                <Text style={styles.issueTitle}>{item.title}</Text>
                <Text style={styles.issueMeta}>{item.location}</Text>
                <Text style={styles.issueMeta}>{item.reportCount} reports • {item.severity}</Text>
                <Text style={[styles.issueStatus, { color: statusColor[item.status] }]}>{item.status}</Text>
              </View>
            </Pressable>
          ))
        )}
      </ScrollView>

      <View style={styles.homeBottomNav}>
        <Pressable style={styles.homeNavItem}>
          <Ionicons name="home" size={22} color="#2563EB" />
          <Text style={[styles.homeNavLabel, styles.homeNavLabelActive]}>Home</Text>
        </Pressable>
        <Pressable style={styles.homeNavItem} onPress={onOpenMap}>
          <Ionicons name="map-outline" size={22} color="#B0BCCF" />
          <Text style={styles.homeNavLabel}>Map</Text>
        </Pressable>
        <Pressable style={styles.homeNavItem} onPress={onOpenProfile}>
          <Ionicons name="person-outline" size={22} color="#B0BCCF" />
          <Text style={styles.homeNavLabel}>Profile</Text>
        </Pressable>
      </View>

      <Pressable style={styles.homeFloatingAdd} onPress={onOpenReportFlow}>
        <Ionicons name="add" size={20} color="#FFFFFF" />
      </Pressable>
    </View>
  );
}

function MapScreen({
  issues,
  loading,
  onOpenHome,
  onOpenProfile,
}: {
  issues: Issue[];
  loading: boolean;
  onOpenHome: () => void;
  onOpenProfile: () => void;
}) {
  const [region, setRegion] = useState({
    latitude: 5.6037,
    longitude: -0.187,
    latitudeDelta: 0.12,
    longitudeDelta: 0.12,
  });
  const [userLocation, setUserLocation] = useState<{ latitude: number; longitude: number } | null>(null);

  const nearbyIssues = useMemo(() => {
    if (!userLocation) return issues;
    return issues.filter((issue) => distanceKm(userLocation.latitude, userLocation.longitude, issue.latitude, issue.longitude) <= 20);
  }, [issues, userLocation]);

  useEffect(() => {
    async function resolveUserLocation() {
      try {
        const permission = await Location.requestForegroundPermissionsAsync();
        if (permission.status !== 'granted') return;
        const current = await Location.getCurrentPositionAsync({});
        const nextRegion = {
          latitude: current.coords.latitude,
          longitude: current.coords.longitude,
          latitudeDelta: 0.06,
          longitudeDelta: 0.06,
        };
        setRegion(nextRegion);
        setUserLocation({
          latitude: current.coords.latitude,
          longitude: current.coords.longitude,
        });
      } catch {
        // Keep fallback center if location is unavailable.
      }
    }

    resolveUserLocation();
  }, []);

  return (
    <View style={styles.page}>
      <Header title="Issue Map" />

      <View style={styles.mapScreenBody}>
        <MapView style={styles.liveMap} initialRegion={region} region={region} onRegionChangeComplete={setRegion}>
          {userLocation ? (
            <Marker coordinate={userLocation} title="You are here" pinColor="#2563EB" />
          ) : null}
          {nearbyIssues.map((issue) => (
            <Marker
              key={issue.id}
              coordinate={{ latitude: issue.latitude, longitude: issue.longitude }}
              title={issue.title}
              description={`${issue.reportCount} reports • ${issue.severity}`}
              pinColor="#EF4444"
            />
          ))}
        </MapView>
        {loading ? (
          <View style={styles.mapLoadingOverlay}>
            <ActivityIndicator color="#2563EB" />
            <Text style={styles.mapStatusText}>Loading nearby issue markers...</Text>
          </View>
        ) : null}
      </View>

      <View style={styles.homeBottomNav}>
        <Pressable style={styles.homeNavItem} onPress={onOpenHome}>
          <Ionicons name="home-outline" size={22} color="#B0BCCF" />
          <Text style={styles.homeNavLabel}>Home</Text>
        </Pressable>
        <Pressable style={styles.homeNavItem}>
          <Ionicons name="map" size={22} color="#2563EB" />
          <Text style={[styles.homeNavLabel, styles.homeNavLabelActive]}>Map</Text>
        </Pressable>
        <Pressable style={styles.homeNavItem} onPress={onOpenProfile}>
          <Ionicons name="person-outline" size={22} color="#B0BCCF" />
          <Text style={styles.homeNavLabel}>Profile</Text>
        </Pressable>
      </View>
    </View>
  );
}

function LocationPermissionScreen({ onBack, onResolved }: { onBack: () => void; onResolved: (location: LocationState) => void }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const requestLocation = async () => {
    setLoading(true);
    setError(null);

    try {
      const permission = await Location.requestForegroundPermissionsAsync();
      if (permission.status !== 'granted') {
        setError('Location access is required to tag where the report was taken.');
        return;
      }

      const current = await Location.getCurrentPositionAsync({});
      onResolved({
        label: REPORT_LOCATION_PLACEHOLDER,
        latitude: current.coords.latitude,
        longitude: current.coords.longitude,
      });
    } catch {
      setError('Could not fetch your location. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={styles.page}>
      <Header title="Share Location" left={<Ionicons name="arrow-back" size={18} color="#334155" onPress={onBack} />} />
      <View style={styles.centerCardWrap}>
        <View style={styles.permissionCard}>
          <Text style={styles.permissionTitle}>Allow Location Access</Text>
          <Text style={styles.permissionText}>We use location to tag where this issue is happening.</Text>
          {error ? <Text style={styles.errorText}>{error}</Text> : null}
          <Pressable style={styles.primaryButton} onPress={requestLocation} disabled={loading}>
            {loading ? <ActivityIndicator color="#FFFFFF" /> : <Text style={styles.primaryButtonText}>Share My Location</Text>}
          </Pressable>
        </View>
      </View>
    </View>
  );
}

function CameraCaptureScreen({ onBack, onCaptured }: { onBack: () => void; onCaptured: (uri: string) => void }) {
  const [permission, requestPermission] = useCameraPermissions();
  const [capturing, setCapturing] = useState(false);
  const cameraRef = useRef<CameraView | null>(null);

  const takePicture = async () => {
    if (!cameraRef.current || capturing) return;

    try {
      setCapturing(true);
      const photo = await cameraRef.current.takePictureAsync({ quality: 0.7 });
      if (photo?.uri) onCaptured(photo.uri);
    } finally {
      setCapturing(false);
    }
  };

  if (!permission) {
    return (
      <View style={styles.page}>
        <Header title="Take Photo" left={<Ionicons name="arrow-back" size={18} color="#334155" onPress={onBack} />} />
        <View style={styles.centerCardWrap}><ActivityIndicator color="#2563EB" /></View>
      </View>
    );
  }

  if (!permission.granted) {
    return (
      <View style={styles.page}>
        <Header title="Take Photo" left={<Ionicons name="arrow-back" size={18} color="#334155" onPress={onBack} />} />
        <View style={styles.centerCardWrap}>
          <View style={styles.permissionCard}>
            <Text style={styles.permissionTitle}>Allow Camera Access</Text>
            <Text style={styles.permissionText}>Camera access is needed to capture the issue photo.</Text>
            <Pressable style={styles.primaryButton} onPress={requestPermission}>
              <Text style={styles.primaryButtonText}>Enable Camera</Text>
            </Pressable>
          </View>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.page}>
      <Header title="Take Photo" left={<Ionicons name="arrow-back" size={18} color="#334155" onPress={onBack} />} />
      <View style={styles.cameraWrap}><CameraView style={styles.cameraView} ref={cameraRef} facing="back" /></View>
      <View style={styles.cameraFooter}>
        <Pressable style={styles.captureButton} onPress={takePicture} disabled={capturing}>
          <View style={styles.captureInner} />
        </Pressable>
      </View>
    </View>
  );
}

function PhotoPreviewScreen({ photoUri, onRetake, onUsePhoto }: { photoUri: string | null; onRetake: () => void; onUsePhoto: () => void }) {
  return (
    <View style={styles.page}>
      <Header title="Confirm Photo" />
      <View style={styles.previewWrap}>
        {photoUri ? <Image source={{ uri: photoUri }} style={styles.previewImage} /> : <View style={styles.previewFallback}><Text style={styles.previewFallbackText}>No image captured</Text></View>}
      </View>
      <View style={styles.previewActions}>
        <Pressable style={styles.secondaryButton} onPress={onRetake}><Text style={styles.secondaryButtonText}>Retake</Text></Pressable>
        <Pressable style={styles.primaryButton} onPress={onUsePhoto}><Text style={styles.primaryButtonText}>Use This Photo</Text></Pressable>
      </View>
    </View>
  );
}

function ReportFormScreen({
  photoUri,
  locationLabel,
  description,
  submitLoading,
  submitError,
  onDescriptionChange,
  onBack,
  onSubmit,
}: {
  photoUri: string | null;
  locationLabel: string;
  description: string;
  submitLoading: boolean;
  submitError: string | null;
  onDescriptionChange: (value: string) => void;
  onBack: () => void;
  onSubmit: () => void;
}) {
  return (
    <View style={styles.page}>
      <Header title="Report Issue" left={<Ionicons name="arrow-back" size={18} color="#334155" onPress={onBack} />} />
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <Text style={styles.formLabel}>Captured Image</Text>
        <View style={styles.formMapCard}>
          {photoUri ? <Image source={{ uri: photoUri }} style={styles.formMapImage} /> : <View style={styles.previewFallback}><Text style={styles.previewFallbackText}>No photo available</Text></View>}
        </View>

        <Text style={styles.formLabel}>Description</Text>
        <TextInput
          style={[styles.inputBox, styles.textArea]}
          multiline
          value={description}
          onChangeText={onDescriptionChange}
          placeholder="Add a short description of the problem"
          placeholderTextColor="#94A3B8"
        />

        <Text style={styles.formLabel}>Resolved Location</Text>
        <View style={styles.inputBox}>
          <Ionicons name="location-outline" size={16} color="#64748B" />
          <Text style={styles.inputLocationText}>{locationLabel}</Text>
        </View>

        {submitError ? <Text style={styles.errorText}>{submitError}</Text> : null}
      </ScrollView>

      <View style={styles.bottomCtaWrap}>
        <Pressable style={styles.primaryButton} onPress={onSubmit} disabled={submitLoading}>
          {submitLoading ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryButtonText}>Submit Report</Text>}
        </Pressable>
      </View>
    </View>
  );
}

function IssueDetailScreen({ issue, loading, onBack }: { issue: Issue | null; loading: boolean; onBack: () => void }) {
  return (
    <View style={styles.page}>
      <Header title="Issue Details" left={<Ionicons name="arrow-back" size={18} color="#334155" onPress={onBack} />} />
      <ScrollView contentContainerStyle={styles.scrollContent}>
        {loading && <ActivityIndicator color="#2563EB" />}

        {!loading && !issue && <Text style={styles.emptyText}>Issue details are unavailable.</Text>}

        {issue && (
          <>
            {issue.imageUrl ? (
              <Image source={{ uri: issue.imageUrl }} style={styles.detailImage} />
            ) : (
              <View style={[styles.detailImage, styles.previewFallback]}><Text style={styles.previewFallbackText}>No image available</Text></View>
            )}
            <Text style={styles.detailTitle}>{issue.title}</Text>
            <Text style={styles.bodyCopy}>{issue.summary}</Text>
            <Text style={styles.formLabel}>Status: {issue.status}</Text>
            <Text style={styles.formLabel}>Reports: {issue.reportCount}</Text>
            <Text style={styles.formLabel}>Severity: {issue.severity}</Text>
            <Text style={styles.formLabel}>Location: {issue.location}</Text>
          </>
        )}
      </ScrollView>
    </View>
  );
}

function ReportSuccessScreen({ onTrack, onHome }: { onTrack: () => void; onHome: () => void }) {
  return (
    <View style={styles.successPage}>
      <Header title="SUCCESS" left={<Ionicons name="close" size={18} color="#64748B" onPress={onHome} />} />
      <View style={styles.successCircle}><Ionicons name="checkmark-circle" size={38} color="#3B82F6" /></View>
      <Text style={styles.successTitle}>Report Submitted</Text>
      <Text style={styles.successText}>Your issue has been logged and routed.</Text>
      <View style={styles.successButtonStack}>
        <Pressable style={styles.primaryButton} onPress={onTrack}><Text style={styles.primaryButtonText}>Back to Home</Text></Pressable>
      </View>
    </View>
  );
}

function ProfileScreen({ onBack }: { onBack: () => void }) {
  return (
    <View style={styles.page}>
      <Header title="Profile" left={<Ionicons name="arrow-back" size={18} color="#334155" onPress={onBack} />} />
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <View style={styles.profileTopCard}>
          <View style={styles.avatar}><Text style={styles.avatarText}>HJ</Text></View>
          <Text style={styles.profileName}>Community User</Text>
          <Text style={styles.profileMeta}>Connected to live issue feed</Text>
        </View>
      </ScrollView>
    </View>
  );
}

const statusColor: Record<IssueStatus, string> = {
  Open: '#F59E0B',
  'In Progress': '#3B82F6',
  Resolved: '#16A34A',
};

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#F7FAFF' },
  page: { flex: 1, backgroundColor: '#F7FAFF' },
  homePage: { flex: 1, backgroundColor: '#EEF2F7' },
  scrollContent: { paddingHorizontal: 16, paddingBottom: 24, gap: 12 },
  homeScrollContent: { paddingHorizontal: 22, paddingBottom: 170, gap: 14 },
  homeTopNav: {
    paddingHorizontal: 22,
    paddingTop: 14,
    paddingBottom: 8,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  homeProfilePill: {
    backgroundColor: '#FFFFFF',
    borderRadius: 30,
    paddingVertical: 8,
    paddingHorizontal: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderWidth: 1,
    borderColor: '#E4EAF3',
  },
  homeProfileAvatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#F7DCC8',
    alignItems: 'center',
    justifyContent: 'center',
  },
  homeProfileName: {
    color: '#1E2D45',
    fontSize: 18,
    fontWeight: '700',
  },
  homeSearchCircle: {
    width: 54,
    height: 54,
    borderRadius: 27,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#E4EAF3',
  },
  homeGreetingTitle: {
    marginTop: 8,
    color: '#0A1635',
    fontSize: 28,
    fontWeight: '800',
    letterSpacing: -0.3,
  },
  homeGreetingSubtitle: {
    color: '#5C7292',
    fontSize: 16,
    marginTop: 2,
    marginBottom: 8,
  },
  homeSearchBar: {
    height: 56,
    borderRadius: 28,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#D9E1ED',
    paddingHorizontal: 18,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  homeSearchPlaceholder: {
    color: '#667A98',
    fontSize: 16,
  },
  homeMapCard: {
    borderRadius: 30,
    overflow: 'hidden',
    height: 290,
    marginTop: 10,
    backgroundColor: '#DBE5F4',
  },
  homeMapImage: {
    width: '100%',
    height: '100%',
  },
  homeMapOverlay: {
    ...StyleSheet.absoluteFillObject,
  },
  mapMarkerDot: {
    position: 'absolute',
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 3,
    borderColor: '#FFFFFF',
  },
  homeMapLocateButton: {
    position: 'absolute',
    right: 16,
    bottom: 16,
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#DCE5F2',
  },
  homeSectionRow: {
    marginTop: 8,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  homeSectionTitle: {
    color: '#0F172A',
    fontSize: 24,
    fontWeight: '700',
  },
  homeViewAll: {
    color: '#2563EB',
    fontSize: 16,
    fontWeight: '600',
  },
  homeFeaturedCard: {
    backgroundColor: '#D8CEF2',
    borderRadius: 28,
    padding: 20,
    marginTop: 8,
    minHeight: 190,
  },
  homeFeaturedHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  homeIssueIconBadge: {
    width: 58,
    height: 58,
    borderRadius: 29,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  homeReportCountWrap: {
    alignItems: 'flex-end',
  },
  homeReportCount: {
    color: '#1E2B45',
    fontSize: 40,
    fontWeight: '700',
    lineHeight: 40,
  },
  homeReportCountLabel: {
    color: '#3A4D6A',
    fontSize: 14,
  },
  homeFeaturedTitle: {
    marginTop: 26,
    color: '#0F172A',
    fontSize: 38,
    lineHeight: 42,
    fontWeight: '700',
  },
  homeFeaturedMeta: {
    marginTop: 8,
    color: '#3D4F69',
    fontSize: 16,
  },
  homeMiniGrid: {
    marginTop: 10,
    flexDirection: 'row',
    gap: 10,
  },
  homeMiniCard: {
    flex: 1,
    borderRadius: 24,
    padding: 16,
    minHeight: 150,
  },
  homeMiniCardYellow: {
    backgroundColor: '#F4E7B8',
  },
  homeMiniCardGreen: {
    backgroundColor: '#D5E8E3',
  },
  homeMiniIconCircle: {
    width: 54,
    height: 54,
    borderRadius: 27,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  homeMiniCount: {
    marginTop: 16,
    color: '#1E2B45',
    fontSize: 28,
    fontWeight: '700',
  },
  homeMiniTitle: {
    marginTop: 6,
    color: '#0F172A',
    fontSize: 18,
    fontWeight: '700',
    lineHeight: 22,
  },
  homeBottomNav: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: 94,
    backgroundColor: '#FFFFFF',
    borderTopWidth: 1,
    borderTopColor: '#E1E7F0',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-evenly',
    paddingHorizontal: 12,
    paddingBottom: 16,
  },
  homeNavItem: {
    alignItems: 'center',
    gap: 4,
    minWidth: 64,
  },
  homeNavLabel: {
    color: '#B0BCCF',
    fontSize: 12,
    fontWeight: '600',
  },
  homeNavLabelActive: {
    color: '#2563EB',
  },
  homeFloatingAdd: {
    position: 'absolute',
    bottom: 108,
    right: 20,
    width: 54,
    height: 54,
    borderRadius: 27,
    backgroundColor: '#2563EB',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#2563EB',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.25,
    shadowRadius: 10,
    elevation: 6,
  },
  mapScreenBody: {
    flex: 1,
    paddingHorizontal: 16,
    paddingBottom: 106,
    paddingTop: 6,
  },
  liveMap: {
    flex: 1,
    borderRadius: 18,
    overflow: 'hidden',
  },
  mapLoadingOverlay: {
    position: 'absolute',
    top: 18,
    left: 26,
    right: 26,
    backgroundColor: 'rgba(255,255,255,0.94)',
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  mapStatusText: {
    color: '#334155',
    fontSize: 12,
    fontWeight: '600',
  },
  headerRow: { height: 56, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16 },
  headerSide: { width: 40, justifyContent: 'center', alignItems: 'flex-start' },
  headerSideRight: { alignItems: 'flex-end' },
  headerTitle: { fontSize: 14, color: '#0F172A', fontWeight: '600', letterSpacing: 0.2 },
  welcomeWrapper: {
    flex: 1,
    backgroundColor: '#F4F5F8',
    paddingHorizontal: 28,
    paddingTop: 18,
    paddingBottom: 18,
    justifyContent: 'space-between',
  },
  welcomeGlowLarge: {
    position: 'absolute',
    width: 520,
    height: 520,
    borderRadius: 260,
    backgroundColor: '#FFFFFF',
    opacity: 0.7,
    top: -120,
    left: -120,
  },
  welcomeGlowSmall: {
    position: 'absolute',
    width: 360,
    height: 360,
    borderRadius: 180,
    backgroundColor: '#ECEFF5',
    opacity: 0.8,
    top: 180,
    right: -80,
  },
  welcomeCenterBlock: {
    marginTop: 0,
    alignItems: 'center',
    paddingTop: 34,
  },
  welcomeIconCard: {
    width: 118,
    height: 118,
    borderRadius: 24,
    backgroundColor: '#2F67DF',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 28,
    shadowColor: '#2F67DF',
    shadowOffset: { width: 0, height: 18 },
    shadowOpacity: 0.28,
    shadowRadius: 28,
    elevation: 12,
  },
  welcomeTitle: {
    fontSize: 44,
    lineHeight: 50,
    fontWeight: '800',
    color: '#0A1431',
    textAlign: 'center',
    letterSpacing: -1.2,
  },
  welcomeText: {
    marginTop: 14,
    fontSize: 18,
    lineHeight: 27,
    color: '#5B6E8D',
    textAlign: 'center',
    maxWidth: 520,
  },
  welcomeProgressBlock: {
    marginTop: 0,
    paddingHorizontal: 8,
  },
  welcomeProgressHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  welcomeProgressLabel: {
    fontSize: 14,
    letterSpacing: 2.5,
    color: '#A5B4CC',
    fontWeight: '600',
  },
  welcomeProgressValue: {
    fontSize: 16,
    color: '#2B63DF',
    fontWeight: '700',
  },
  welcomeProgressTrack: {
    marginTop: 16,
    width: '100%',
    height: 12,
    borderRadius: 999,
    backgroundColor: '#E2E8F0',
    overflow: 'hidden',
  },
  welcomeProgressFill: {
    height: '100%',
    backgroundColor: '#2F67DF',
    borderRadius: 999,
  },
  welcomeBottomBlock: {
    marginTop: 0,
    marginBottom: 0,
    alignItems: 'center',
  },
  welcomeBottomText: {
    fontSize: 11,
    letterSpacing: 4,
    color: '#BEC9DA',
    fontWeight: '600',
  },
  onboardingRoot: {
    flex: 1,
    backgroundColor: '#F6F7F9',
    paddingHorizontal: 0,
    paddingVertical: 0,
  },
  onboardingCard: {
    flex: 1,
    backgroundColor: '#F6F7F9',
    borderRadius: 0,
    paddingHorizontal: 22,
    paddingTop: 18,
    paddingBottom: 26,
    justifyContent: 'space-between',
  },
  onboardingHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  onboardingHeaderIcon: {
    width: 58,
    height: 58,
    borderRadius: 18,
    backgroundColor: '#DEE3EF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  onboardingHeaderTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#0F172A',
  },
  onboardingImageWrap: {
    marginTop: 18,
    borderRadius: 26,
    overflow: 'hidden',
    height: 240,
    backgroundColor: '#DDE6F3',
  },
  onboardingImage: {
    width: '100%',
    height: '100%',
  },
  onboardingTitlePrimary: {
    marginTop: 20,
    textAlign: 'center',
    color: '#0B1635',
    fontSize: 34,
    lineHeight: 40,
    fontWeight: '800',
    letterSpacing: -0.8,
  },
  onboardingTitleAccent: {
    textAlign: 'center',
    color: '#2F67DF',
    fontSize: 40,
    lineHeight: 46,
    fontWeight: '800',
    letterSpacing: -1,
  },
  onboardingBody: {
    marginTop: 14,
    textAlign: 'center',
    color: '#4B5F7F',
    fontSize: 14,
    lineHeight: 22,
    paddingHorizontal: 8,
  },
  onboardingDots: {
    marginTop: 16,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 10,
  },
  onboardingDot: {
    width: 11,
    height: 11,
    borderRadius: 6,
    backgroundColor: '#D0D7E4',
  },
  onboardingDotActive: {
    width: 44,
    backgroundColor: '#2F67DF',
  },
  onboardingButton: {
    marginTop: 18,
    height: 52,
    borderRadius: 26,
    backgroundColor: '#2F67DF',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#2F67DF',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.2,
    shadowRadius: 16,
    elevation: 6,
  },
  onboardingButtonText: {
    color: '#FFFFFF',
    fontSize: 17,
    fontWeight: '700',
    letterSpacing: 0.2,
  },
  onboardingSignInRow: {
    marginTop: 12,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
  },
  onboardingSignInText: {
    fontSize: 14,
    color: '#5B6E8D',
  },
  onboardingSignInLink: {
    fontSize: 14,
    color: '#2F67DF',
    fontWeight: '700',
  },
  sectionTitle: { color: '#334155', fontWeight: '700', fontSize: 13, marginTop: 6 },
  mapCard: { borderRadius: 14, overflow: 'hidden', backgroundColor: '#E9EEF7', height: 140 },
  mapImage: { width: '100%', height: '100%' },
  mapCardOverlay: { position: 'absolute', bottom: 8, left: 8, backgroundColor: 'rgba(15,23,42,0.62)', borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4 },
  mapCardTitle: { color: '#F8FAFC', fontSize: 10, fontWeight: '600' },
  issueCard: { flexDirection: 'row', gap: 10, alignItems: 'center', borderRadius: 14, backgroundColor: '#FFFFFF', padding: 12, borderWidth: 1, borderColor: '#E2E8F0' },
  issueIconWrap: { width: 34, height: 34, borderRadius: 17, backgroundColor: '#DBEAFE', alignItems: 'center', justifyContent: 'center' },
  issueTextWrap: { flex: 1, gap: 2 },
  issueTitle: { fontSize: 13, color: '#0F172A', fontWeight: '600', textTransform: 'capitalize' },
  issueMeta: { fontSize: 11, color: '#64748B' },
  issueStatus: { fontSize: 11, fontWeight: '600' },
  emptyText: { color: '#64748B', fontSize: 12 },
  bottomBar: { position: 'absolute', bottom: 0, left: 0, right: 0, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: '#FFFFFF', borderTopWidth: 1, borderColor: '#E2E8F0', paddingHorizontal: 32, paddingTop: 10, paddingBottom: 24 },
  bottomItem: { alignItems: 'center', gap: 4 },
  bottomText: { fontSize: 10, color: '#94A3B8' },
  bottomTextActive: { color: '#1D4ED8', fontWeight: '600' },
  bottomCenterButton: { width: 46, height: 46, borderRadius: 23, backgroundColor: '#3B82F6', alignItems: 'center', justifyContent: 'center', marginTop: -18 },
  centerCardWrap: { flex: 1, justifyContent: 'center', paddingHorizontal: 16 },
  permissionCard: { backgroundColor: '#FFFFFF', borderRadius: 16, borderWidth: 1, borderColor: '#E2E8F0', padding: 18, gap: 12 },
  permissionTitle: { fontSize: 18, color: '#0F172A', fontWeight: '700' },
  permissionText: { color: '#475569', fontSize: 13, lineHeight: 19 },
  errorBox: { backgroundColor: '#FEF2F2', borderWidth: 1, borderColor: '#FECACA', borderRadius: 10, padding: 10 },
  errorText: { color: '#DC2626', fontSize: 12 },
  retryText: { color: '#2563EB', fontSize: 12, fontWeight: '600', marginTop: 6 },
  cameraWrap: { flex: 1, marginHorizontal: 16, borderRadius: 20, overflow: 'hidden', backgroundColor: '#0F172A' },
  cameraView: { flex: 1 },
  cameraFooter: { paddingHorizontal: 16, paddingVertical: 14, alignItems: 'center' },
  captureButton: { width: 76, height: 76, borderRadius: 38, borderWidth: 4, borderColor: '#CBD5E1', alignItems: 'center', justifyContent: 'center', backgroundColor: '#FFFFFF' },
  captureInner: { width: 58, height: 58, borderRadius: 29, backgroundColor: '#2563EB' },
  previewWrap: { flex: 1, marginHorizontal: 16, borderRadius: 18, overflow: 'hidden', backgroundColor: '#E2E8F0' },
  previewImage: { width: '100%', height: '100%' },
  previewFallback: { alignItems: 'center', justifyContent: 'center' },
  previewFallbackText: { color: '#64748B', fontSize: 12 },
  previewActions: { paddingHorizontal: 16, paddingVertical: 14, gap: 10 },
  bottomCtaWrap: { paddingHorizontal: 16, paddingBottom: 12 },
  primaryButton: { backgroundColor: '#2563EB', borderRadius: 14, height: 46, alignItems: 'center', justifyContent: 'center' },
  primaryButtonText: { color: '#fff', fontWeight: '700', fontSize: 14 },
  secondaryButton: { backgroundColor: '#fff', borderRadius: 14, height: 46, borderWidth: 1, borderColor: '#DBE5F2', alignItems: 'center', justifyContent: 'center' },
  secondaryButtonText: { color: '#1E293B', fontWeight: '700', fontSize: 14 },
  formLabel: { color: '#334155', fontSize: 12, fontWeight: '600', marginTop: 8 },
  formMapCard: { borderRadius: 14, overflow: 'hidden', backgroundColor: '#E9EEF7', minHeight: 110 },
  formMapImage: { width: '100%', height: 180 },
  inputBox: { minHeight: 46, borderRadius: 12, borderWidth: 1, borderColor: '#E2E8F0', backgroundColor: '#FFFFFF', paddingHorizontal: 12, paddingVertical: 10, flexDirection: 'row', alignItems: 'center', gap: 8 },
  inputLocationText: { flex: 1, color: '#334155', fontSize: 12 },
  textArea: { minHeight: 110, alignItems: 'flex-start', textAlignVertical: 'top' },
  detailImage: { width: '100%', height: 220, borderRadius: 14, backgroundColor: '#E2E8F0' },
  detailTitle: { fontSize: 22, color: '#0F172A', fontWeight: '700', textTransform: 'capitalize' },
  bodyCopy: { color: '#475569', fontSize: 13, lineHeight: 19 },
  successPage: { flex: 1, alignItems: 'center', padding: 16, backgroundColor: '#F7FAFF' },
  successCircle: { marginTop: 36 },
  successTitle: { marginTop: 10, fontSize: 24, fontWeight: '700', color: '#0F172A' },
  successText: { marginTop: 8, color: '#64748B', textAlign: 'center' },
  successButtonStack: { width: '100%', marginTop: 32, gap: 10 },
  profileTopCard: { borderRadius: 18, backgroundColor: '#fff', borderWidth: 1, borderColor: '#E2E8F0', alignItems: 'center', padding: 20, gap: 4 },
  avatar: { width: 56, height: 56, borderRadius: 28, backgroundColor: '#DBEAFE', alignItems: 'center', justifyContent: 'center' },
  avatarText: { color: '#1D4ED8', fontWeight: '700' },
  profileName: { fontSize: 18, fontWeight: '700', color: '#0F172A' },
  profileMeta: { color: '#64748B', fontSize: 12 },
});
