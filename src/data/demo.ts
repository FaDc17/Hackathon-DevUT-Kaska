import type { Post, Screen, Service, User } from "../types";

export const priceRanges = [
  { label: "S/ 0 – S/ 20", min: 0, max: 20 },
  { label: "S/ 20 – S/ 30", min: 20, max: 30 },
  { label: "S/ 30 – S/ 40", min: 30, max: 40 },
  { label: "S/ 40 – S/ 50", min: 40, max: 50 },
  { label: "S/ 50 – S/ 60", min: 50, max: 60 },
  { label: "S/ 60 – S/ 100", min: 60, max: 100 },
  { label: "S/ 100 – S/ 150", min: 100, max: 150 },
  { label: "S/ 150 – S/ 200", min: 150, max: 200 },
  { label: "Más de S/ 200", min: 200, max: null },
] as const;
export const defaultPriceRange = priceRanges[1];

export const initialUsers: User[] = [
  {
    id: "rosa-quispe",
    name: "Rosa Quispe",
    phone: "987654321",
    address: "",
    district: "Pueblo Libre",
    avatar: "R",
    about: "Artesana textil. Me gusta compartir mis conocimientos y apoyar a mis vecinos.",
  },
  {
    id: "david-cruz",
    name: "David Cruz",
    phone: "986543210",
    address: "",
    district: "Breña",
    avatar: "D",
    about: "Electricista dedicado a brindar soluciones seguras para el hogar.",
  },
  {
    id: "maria-torres",
    name: "María Torres",
    phone: "985432109",
    address: "",
    district: "Jesús María",
    avatar: "M",
    about: "Amante de los animales y cuidadora responsable.",
  },
  ...[
    ["elena-r", "Elena R.", "Pueblo Libre", "984321098"],
    ["jorge-m", "Jorge M.", "Pueblo Libre", "983210987"],
    ["lucia-v", "Lucía V.", "Pueblo Libre", "982109876"],
    ["monica-s", "Mónica S.", "Jesús María", "981098765"],
    ["luis-a", "Luis A.", "Breña", "980987654"],
    ["carla-p", "Carla P.", "Pueblo Libre", "979876543"],
  ].map(([id, name, district, phone]) => ({
    id,
    name,
    phone,
    address: "",
    district,
    avatar: name.charAt(0).toUpperCase(),
    about: "",
  })),
];

export const photos = {
  textile:
    "https://images.unsplash.com/photo-1769358720638-932b3dd8101a?crop=entropy&cs=tinysrgb&fit=crop&fm=jpg&q=82&w=900",
  electric:
    "https://images.unsplash.com/photo-1788399629762-7c63e63c0676?crop=entropy&cs=tinysrgb&fit=crop&fm=jpg&q=82&w=900",
  dogs: "https://images.unsplash.com/photo-1530700131180-d43d9b8cc41f?crop=entropy&cs=tinysrgb&fit=crop&fm=jpg&q=82&w=900",
};

export const initialServices: Service[] = [
  {
    id: 1,
    owner: "Rosa Quispe",
    ownerId: "rosa-quispe",
    title: "Arreglos y tejido artesanal",
    description:
      "Reparo prendas, hago ajustes y elaboro tejidos a mano con acabados de calidad. Coordinamos un punto público de entrega.",
    category: "Hogar",
    priceLabel: "S/ 20 – S/ 30",
    priceMin: 20,
    priceMax: 30,
    currency: "PEN",
    district: "Pueblo Libre",
    createdAt: Date.now() - 8 * 24 * 60 * 60_000,
    contactPhone: "987654321",
    location: "A 6 cuadras · Pueblo Libre",
    image: photos.textile,
    reviews: [
      {
        id: 1,
        user: "Mónica S.",
        userId: "monica-s",
        stars: 5,
        comment: "Muy amable y puntual. El acabado quedó precioso.",
        date: "Hace 2 días",
      },
      {
        id: 2,
        user: "Luis A.",
        userId: "luis-a",
        stars: 4,
        comment: "Buen trabajo y comunicación clara.",
        date: "Hace 1 semana",
      },
    ],
  },
  {
    id: 2,
    owner: "David Cruz",
    ownerId: "david-cruz",
    title: "Electricista de confianza",
    description:
      "Instalación de luminarias, revisión de tomacorrientes y soluciones eléctricas para el hogar.",
    category: "Electricidad",
    priceLabel: "S/ 60 – S/ 100",
    priceMin: 60,
    priceMax: 100,
    currency: "PEN",
    district: "Breña",
    createdAt: Date.now() - 5 * 24 * 60 * 60_000,
    contactPhone: "986543210",
    location: "A 1.2 km · Breña",
    image: photos.electric,
    reviews: [
      {
        id: 3,
        user: "Carla P.",
        userId: "carla-p",
        stars: 5,
        comment: "Resolvió todo rápido y de forma segura.",
        date: "Ayer",
      },
    ],
  },
  {
    id: 3,
    owner: "María Torres",
    ownerId: "maria-torres",
    title: "Paseos para tu mascota",
    description:
      "Paseos tranquilos y responsables para perros de todos los tamaños. Atención por turnos.",
    category: "Mascotas",
    priceLabel: "S/ 20 – S/ 30",
    priceMin: 20,
    priceMax: 30,
    currency: "PEN",
    district: "Jesús María",
    createdAt: Date.now() - 3 * 24 * 60 * 60_000,
    contactPhone: "985432109",
    location: "A 900 m · Jesús María",
    image: photos.dogs,
    reviews: [],
  },
];

export const initialPosts: Post[] = [
  {
    id: 1,
    owner: "Elena R.",
    ownerId: "elena-r",
    title: "Dono ropa de abrigo en buen estado",
    description:
      "Tengo prendas para adulto y niños. Podemos coordinar la entrega en un lugar público del distrito.",
    category: "Solidaridad",
    district: "Pueblo Libre",
    location: "Parque San Martín · Pueblo Libre",
    createdAt: Date.now() - 12 * 60_000,
  },
  {
    id: 2,
    owner: "Jorge M.",
    ownerId: "jorge-m",
    title: "Busco apoyo para mascota perdida",
    description:
      "Se perdió cerca al mercado. Es pequeña, lleva collar azul y responde al nombre de Killa.",
    category: "Necesito",
    district: "Pueblo Libre",
    location: "Mercado Bolívar · Pueblo Libre",
    createdAt: Date.now() - 48 * 60_000,
    image: photos.dogs,
  },
  {
    id: 3,
    owner: "Lucía V.",
    ownerId: "lucia-v",
    title: "Poste con cable expuesto",
    description:
      "Hay un cable expuesto junto a la vereda. Evitemos acercarnos mientras se informa a las autoridades.",
    category: "Emergencia",
    district: "Pueblo Libre",
    location: "Av. Sucre · referencia aproximada",
    createdAt: Date.now() - 22 * 60_000,
  },
];

export const categories = [
  ["Gasfitería", "drop"],
  ["Electricidad", "bolt"],
  ["Carpintería", "hammer"],
  ["Clases", "book"],
  ["Mascotas", "paw"],
  ["Transporte", "car"],
  ["Hogar", "home"],
  ["Más", "grid"],
];

export const navItems: [Screen, string, string][] = [
  ["home", "Inicio", "home"],
  ["services", "Servicios", "tools"],
  ["solidarity", "Comunidad", "heart"],
  ["emergency", "Emergencia", "alert"],
  ["map", "Mapa", "map"],
  ["profile", "Perfil", "user"],
];
