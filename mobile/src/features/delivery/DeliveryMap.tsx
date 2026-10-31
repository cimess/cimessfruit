import { useRef, useState } from "react";
import { Modal, Platform, Pressable, ScrollView, Text, TextInput, View } from "react-native";
import MapView, { Marker, Polygon } from "react-native-maps";
import * as Location from "expo-location";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { apiRequest } from "@/lib/api";
import { mapZone } from "./zones";
import type { Coordinate, DeliveryAddressDraft, DeliveryZone } from "./types";
type Props = { zones: DeliveryZone[]; address: DeliveryAddressDraft; onSelect: (address: DeliveryAddressDraft) => void; onClose: () => void };
export default function DeliveryMap({ zones, address, onSelect, onClose }: Props) {
  const insets = useSafeAreaInsets();
  const map = useRef<MapView>(null);
  const revision = useRef(0);
  const [pin, setPin] = useState<Coordinate | undefined>(address.coordinates);
  const [matches, setMatches] = useState<DeliveryZone[]>([]);
  const [selected, setSelected] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [street, setStreet] = useState("");
  const [house, setHouse] = useState("");
  const [landmark, setLandmark] = useState("");
  const [addressHint, setAddressHint] = useState("");
  const canConfirm = !!selected && !busy && !!street.trim() && !!house.trim();
  async function lookupAddress(point: Coordinate, request: number) {
    try {
      if (Platform.OS === "android") {
        const permission = await Location.requestForegroundPermissionsAsync();
        if (!permission.granted) throw new Error("Location permission is required for address lookup.");
      }
      if (request !== revision.current) return;
      const [place] = await Location.reverseGeocodeAsync(point);
      if (request !== revision.current) return;
      const streetAddress = place
        ? [...new Set([place.street, place.district, place.city, place.region].filter(Boolean))].join(", ") || place.formattedAddress || place.name || ""
        : "";
      setStreet(streetAddress.slice(0, 200));
      setHouse(place?.streetNumber ?? "");
      setAddressHint(streetAddress
        ? "Check the address and add your house or entrance details and nearest bus stop for the rider."
        : "No address was found for this pin. Enter your address and a nearby bus stop or landmark below.");
    } catch {
      if (request === revision.current) setAddressHint("Address lookup is unavailable. Enter your address and a nearby bus stop or landmark below.");
    }
  }
  const mapped = zones.filter(zone => (zone.boundary?.length ?? 0) >= 3);
  const points = mapped.flatMap(zone => zone.boundary ?? []);
  const center = pin ?? (points.length ? { latitude: points.reduce((sum, p) => sum + p.latitude, 0) / points.length, longitude: points.reduce((sum, p) => sum + p.longitude, 0) / points.length } : undefined);
  async function choose(point: Coordinate) {
    const request = ++revision.current;
    setPin(point); setMatches([]); setSelected(""); setError(""); setBusy(true);
    setStreet(""); setHouse(""); setLandmark(""); setAddressHint("");
    const lookup = lookupAddress(point, request);
    try {
      const result = await apiRequest<{ zones: unknown[] }>("/api/delivery-zones/resolve", { method: "POST", body: JSON.stringify(point) });
      if (request !== revision.current) return;
      const found = result.zones.map(mapZone);
      setMatches(found); setSelected(found.length === 1 ? found[0].id : "");
      if (!found.length) setError("We do not currently deliver to this pin. Choose a location inside a highlighted zone.");
    } catch (err) { if (request === revision.current) setError(err instanceof Error ? err.message : "Could not check coverage. Tap the map to retry."); }
    finally { await lookup; if (request === revision.current) setBusy(false); }
  }
  async function locate() {
    setError("");
    try {
      const permission = await Location.requestForegroundPermissionsAsync();
      if (!permission.granted) { setError("Location permission was declined. You can still tap the map to choose your address."); return; }
      const location = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
      const point = { latitude: location.coords.latitude, longitude: location.coords.longitude };
      map.current?.animateToRegion({ ...point, latitudeDelta: 0.01, longitudeDelta: 0.01 });
      await choose(point);
    } catch { setError("Could not get your location. Tap the map to choose it instead."); }
  }
  function confirm() {
    if (!pin || !canConfirm) return;
    // Keep the exact pin together with the address confirmed by the customer.
    onSelect({ ...address, zoneId: selected, coordinates: pin, streetOrClose: street.trim(), houseNumber: house.trim(), flatOrBlock: "", landmark: landmark.trim() });
    onClose();
  }
  return <Modal visible animationType="slide" onRequestClose={onClose}><View style={{ flex: 1, paddingTop: insets.top, paddingBottom: insets.bottom }}><View className="p-4"><Pressable onPress={onClose}><Text className="text-green-700">Close map</Text></Pressable><Text className="mt-3 text-xl font-bold">Choose your delivery entrance</Text><Text>Tap the map or drag the pin. Highlighted areas are active delivery zones.</Text></View>{center ? <MapView ref={map} style={{ flex: 1 }} initialRegion={{ ...center, latitudeDelta: 0.05, longitudeDelta: 0.05 }} onPress={event => void choose(event.nativeEvent.coordinate)}>{mapped.map(zone => <Polygon key={zone.id} coordinates={zone.boundary!} strokeColor="#128A3A" fillColor="rgba(18,138,58,0.18)" />)}{pin && <Marker coordinate={pin} draggable onDragEnd={event => void choose(event.nativeEvent.coordinate)} />}</MapView> : <View className="flex-1 justify-center p-6"><Text>Map coverage is being set up for these delivery zones. You can still select a zone and enter your street address.</Text></View>}<ScrollView style={{ maxHeight: "45%" }} contentContainerStyle={{ padding: 16, gap: 8 }} keyboardShouldPersistTaps="handled">{center && <Pressable onPress={() => void locate()}><Text className="py-2 text-green-700">Use my current location</Text></Pressable>}{busy && <Text>Looking up address and delivery coverage…</Text>}{error ? <Text accessibilityRole="alert">{error}</Text> : null}{pin && !busy && <View style={{ gap: 8 }}>
      <Text>{addressHint || "Confirm the address for this pin."}</Text>
      <Text>Street / area</Text>
      <TextInput accessibilityLabel="Street or area" maxLength={200} value={street} onChangeText={setStreet} placeholder="Street name and area" style={{ borderWidth: 1, borderColor: "#ccc", borderRadius: 8, padding: 10 }} />
      <Text>House number / entrance</Text>
      <TextInput accessibilityLabel="House number or entrance" maxLength={100} value={house} onChangeText={setHouse} placeholder="e.g. House 15, blue gate" style={{ borderWidth: 1, borderColor: "#ccc", borderRadius: 8, padding: 10 }} />
      <Text>Nearest bus stop / landmark (optional)</Text>
      <TextInput accessibilityLabel="Nearest bus stop or landmark" maxLength={200} value={landmark} onChangeText={setLandmark} placeholder="e.g. Opposite the pharmacy at the bus stop" style={{ borderWidth: 1, borderColor: "#ccc", borderRadius: 8, padding: 10 }} />
    </View>}{matches.map(zone => <Pressable key={zone.id} onPress={() => setSelected(zone.id)}><Text className="py-2 font-bold">{selected === zone.id ? "✓ " : ""}{zone.name} · ₦{zone.deliveryFee}</Text></Pressable>)}<Pressable disabled={!canConfirm} onPress={confirm} className={`rounded-xl p-4 ${canConfirm ? "bg-green-700" : "bg-gray-400"}`}><Text className="text-center font-bold text-white">Deliver to this pin</Text></Pressable></ScrollView></View></Modal>;
}
