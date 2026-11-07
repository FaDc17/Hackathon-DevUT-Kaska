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

export type User = {
  id: string;
  name: string;
  phone: string;
  address: string;
  district: string;
  avatar: string;
  about: string;
  passwordHash?: string;
};

export type Review = {
  id: number;
  user: string;
  userId?: string;
  stars: number;
  comment: string;
  date: string;
};

export type Comment = {
  id: number;
  user: string;
  userId?: string;
  content: string;
  createdAt: number;
};

export type Service = {
  id: number;
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
  image: string;
  reviews: Review[];
  mine?: boolean;
};

export type Post = {
  id: number;
  owner: string;
  ownerId?: string;
  title: string;
  description: string;
  category: "Necesito" | "Solidaridad" | "Emergencia";
  district: string;
  location: string;
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
