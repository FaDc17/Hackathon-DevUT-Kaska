export type Screen =
  | "login"
  | "register"
  | "recover"
  | "home"
  | "services"
  | "solidarity"
  | "emergency"
  | "channels"
  | "map"
  | "profile"
  | "allServices"
  | "allPosts"
  | "serviceDetail"
  | "postDetail"
  | "assistant"
  | "agentChat"
  | "tutorial"
  | "neighborProfile";

export type EntityId = string | number;
export type SyncStatus = "pendiente" | "sincronizado" | "error";

export type User = {
  id: string;
  remoteId?: string;
  name: string;
  phone: string;
  address: string;
  district: string;
  districtId?: number;
  avatar: string;
  about: string;
  syncStatus?: "pendiente" | "sincronizado" | "error";
};

export type Review = {
  id: EntityId;
  user: string;
  userId?: string;
  stars: number;
  comment: string;
  date: string;
};

export type Comment = {
  id: EntityId;
  user: string;
  userId?: string;
  content: string;
  createdAt: number;
};

export type Service = {
  imageReference?: string;
  imageDisplaySource?: string;
  imageId?: string;
  id: EntityId;
  districtId?: number;
  categoryId?: number;
  syncStatus?: SyncStatus;
  imagePending?: boolean;
  imageError?: string;
  isDemo?: boolean;
  owner: string;
  ownerId?: string;
  title: string;
  description: string;
  category: string;
  priceLabel: string;
  priceMin: number | null;
  priceMax: number | null;
  currency: "PEN";
  district: string;
  createdAt: number;
  contactPhone: string;
  location: string;
  lat?: number;
  lng?: number;
  image: string;
  reviews: Review[];
  mine?: boolean;
};

export type Post = {
  imageReference?: string;
  imageDisplaySource?: string;
  imageId?: string;
  id: EntityId;
  districtId?: number;
  typeId?: number;
  syncStatus?: SyncStatus;
  imagePending?: boolean;
  imageError?: string;
  isDemo?: boolean;
  owner: string;
  ownerId?: string;
  title: string;
  description: string;
  category: "Necesito" | "Solidaridad" | "Emergencia";
  district: string;
  location: string;
  lat?: number;
  lng?: number;
  image?: string;
  createdAt: number;
  mine?: boolean;
  comments?: Comment[];
};

export type ChatMessage = {
  id: number;
  sender: "agent" | "user";
  text: string;
  time: string;
};
