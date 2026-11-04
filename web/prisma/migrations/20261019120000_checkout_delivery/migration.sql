INSERT INTO "DeliveryZone" ("id", "name", "area", "state", "deliveryFee", "estimatedMinutesMin", "estimatedMinutesMax", "isAvailable")
VALUES ('abesan-estate', 'Abesan Estate', 'Ipaja', 'Lagos', 50000, 30, 60, true)
ON CONFLICT ("id") DO NOTHING;
