import { useCallback, useEffect, useState } from "react";
import { z } from "zod";
import { apiRequest } from "@/lib/api";
import type { DeliveryZone } from "./types";
const coordinate = z.object({ latitude: z.number(), longitude: z.number() });
const zoneSchema = z.object({ id: z.string(), name: z.string(), area: z.string(), state: z.string(), isAvailable: z.boolean(), deliveryFee: z.number().int().nonnegative(), estimatedMinutesMin: z.number(), estimatedMinutesMax: z.number(), boundary: z.array(coordinate).nullable().optional() });
export function mapZone(value: unknown): DeliveryZone {
  const zone = zoneSchema.parse(value);
  return { ...zone, deliveryFee: zone.deliveryFee / 100, estimatedTime: `${zone.estimatedMinutesMin}-${zone.estimatedMinutesMax} mins`, coverageNote: `Delivery within ${zone.name}.` };
}
export const unavailableZone: DeliveryZone = { id: "", name: "Select a delivery zone", area: "", state: "", isAvailable: false, deliveryFee: 0, estimatedTime: "", coverageNote: "Choose an active delivery zone." };
export function useDeliveryZones() {
  const [zones, setZones] = useState<DeliveryZone[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [revision, setRevision] = useState(0);
  const reload = useCallback(() => { setLoading(true); setError(""); setRevision(value => value + 1); }, []);
  useEffect(() => {
    let active = true;
    apiRequest<{ zones: unknown[] }>("/api/delivery-zones", {}, false).then(result => {
      if (active) setZones(result.zones.map(mapZone));
    }).catch(err => { if (active) { setZones([]); setError(err instanceof Error ? err.message : "Unable to load delivery zones."); } }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [revision]);
  return { zones, error, loading, reload };
}
