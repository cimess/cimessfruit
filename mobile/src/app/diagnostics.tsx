import { useState } from "react";
import { ScrollView, Pressable, Text } from "react-native";
import { Stack } from "expo-router";
import { requestMetrics } from "@/features/diagnostics/requests";
export default function Diagnostics() {
  const [report, setReport] = useState(() => requestMetrics.snapshot());
  if (!__DEV__ || process.env.EXPO_PUBLIC_REQUEST_METRICS_ENABLED !== "true")
    return <Text>Diagnostics are disabled.</Text>;
  return (
    <ScrollView contentContainerStyle={{ padding: 24 }}>
      <Stack.Screen
        options={{ title: "Request diagnostics", headerShown: true }}
      />
      <Text>
        Local counters only. Bytes exclude uploads, images, SSE, compression and
        TLS.
      </Text>
      <Pressable onPress={() => setReport(requestMetrics.snapshot())}>
        <Text style={{ paddingVertical: 16 }}>Refresh report</Text>
      </Pressable>
      <Pressable
        onPress={() => {
          requestMetrics.reset();
          setReport(requestMetrics.snapshot());
        }}
      >
        <Text style={{ paddingVertical: 16 }}>Reset counters</Text>
      </Pressable>
      <Text selectable style={{ fontFamily: "monospace" }}>
        {JSON.stringify(report, null, 2)}
      </Text>
    </ScrollView>
  );
}
