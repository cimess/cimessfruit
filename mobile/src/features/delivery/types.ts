export type Coordinate = { latitude: number; longitude: number };

export type DeliveryZone = {
  id: string;
  name: string;
  area: string;
  state: string;
  isAvailable: boolean;
  deliveryFee: number;
  estimatedTime: string;
  coverageNote: string;
  boundary?: Coordinate[] | null;
};

export type DeliveryAddressDraft = {
  zoneId: string;
  coordinates?: Coordinate;
  streetOrClose: string;
  houseNumber: string;
  flatOrBlock: string;
  landmark: string;
  note: string;
  phoneNumber: string;
};
