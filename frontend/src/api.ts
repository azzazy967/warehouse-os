import axios from 'axios';

const TOKEN_KEY = 'wms_token';

/** Prevents several parallel 401 responses from racing to reload the page. */
let authRedirectPending = false;

export function clearAuthRedirect(): void {
  authRedirectPending = false;
}

export const api = axios.create({
  baseURL: '/api',
  timeout: 20000,
});

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function setToken(token: string | null): void {
  if (token) {
    localStorage.setItem(TOKEN_KEY, token);
  } else {
    localStorage.removeItem(TOKEN_KEY);
  }
}

api.interceptors.request.use((config) => {
  const token = getToken();
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

api.interceptors.response.use(
  (response) => response,
  (error) => {
    const url = String(error?.config?.url || '');
    const atLogin = window.location.pathname.replace(/\/+$/, '') === '/login';
    const isLoginRequest = url.includes('/auth/login');
    if (
      error.response?.status === 401 &&
      getToken() &&
      !atLogin &&
      !isLoginRequest &&
      !authRedirectPending
    ) {
      authRedirectPending = true;
      setToken(null);
      window.location.assign('/login');
    }
    return Promise.reject(error);
  },
);

export function apiMessage(error: unknown): string {
  const axiosError = error as { response?: { data?: { message?: string | string[] } }; message?: string };
  const message = axiosError?.response?.data?.message;
  if (Array.isArray(message)) return message.join(', ');
  return message || axiosError?.message || 'Something went wrong. Please try again.';
}

export interface AuthUser {
  id: number;
  name: string;
  email: string;
  role: 'ADMIN' | 'MANAGER' | 'PICKER';
  isActive: boolean;
}

export interface Product {
  id: number;
  sku: string;
  barcode?: string | null;
  imagePath?: string | null;
  name: string;
  description?: string | null;
  category?: string | null;
  unitOfMeasure: string;
  reorderLevel: number;
  unitCost: number;
  weight: number;
  isActive: boolean;
  createdAt?: string;
  updatedAt?: string;
  inventory?: InventoryRow[];
}

/** Product images are served by the API from /uploads, outside the /api prefix. */
export function imageUrl(path?: string | null): string | null {
  return path ? path : null;
}

export interface Location {
  id: number;
  code: string;
  warehouse: string;
  zone?: string | null;
  aisle?: string | null;
  rack?: string | null;
  bin?: string | null;
  type: string;
  capacity: number;
  isActive: boolean;
}

export interface InventoryRow {
  id: number;
  productId: number;
  locationId: number;
  quantityOnHand: number;
  quantityReserved: number;
  product: Product;
  location: Location;
}

export interface InventorySummary {
  productId: number;
  sku: string;
  name: string;
  category: string | null;
  unitOfMeasure: string;
  reorderLevel: number;
  unitCost: number;
  quantityOnHand: number;
  quantityReserved: number;
  available: number;
  locations: number;
  stockValue: number;
  status: 'IN_STOCK' | 'LOW_STOCK' | 'OUT_OF_STOCK';
}

export interface StockMovement {
  id: number;
  productId: number;
  locationId: number;
  type: string;
  quantity: number;
  reference?: string | null;
  notes?: string | null;
  createdAt: string;
  product: Product;
  location: Location;
  user?: { name: string } | null;
}

export interface DocumentLine {
  id: number;
  productId: number;
  product: Product;
  locationId?: number | null;
  quantityExpected?: number;
  quantityReceived?: number;
  quantityOrdered?: number;
  quantityPicked?: number;
  quantity?: number;
  quantityShipped?: number;
}

export interface WarehouseDocument {
  id: number;
  orderNumber?: string;
  shipmentNumber?: string;
  supplier?: string;
  reference?: string | null;
  carrier?: string;
  trackingNumber?: string | null;
  destination?: string;
  status: string;
  priority?: string;
  expectedDate?: string | null;
  notes?: string | null;
  createdAt: string;
  pickedAt?: string | null;
  shippedAt?: string | null;
  items: DocumentLine[];
  assigneeId?: number | null;
  assignee?: { name: string } | null;
  receivedBy?: { name: string } | null;
  shippedBy?: { name: string } | null;
}

export interface DashboardStats {
  products: number;
  locations: number;
  totalUnits: number;
  totalValue: number;
  lowStock: number;
  outOfStock: number;
  pendingReceiving: number;
  pendingPicking: number;
  pendingShipping: number;
}

export interface ChartPoint {
  date: string;
  inbound: number;
  outbound: number;
}

export interface CategoryStock {
  category: string;
  units: number;
  value: number;
}

export interface LocationStock {
  code: string;
  warehouse: string;
  zone: string | null;
  units: number;
  value: number;
}

export interface ProductStock {
  id: number;
  sku: string;
  name: string;
  category: string | null;
  onHand: number;
  available: number;
  value: number;
  status: 'IN_STOCK' | 'LOW_STOCK' | 'OUT_OF_STOCK';
}

export interface TopProduct {
  id: number;
  name: string;
  sku: string;
  value: number;
}

export interface DashboardInsights {
  byCategory: CategoryStock[];
  byLocation: LocationStock[];
  productStock: ProductStock[];
  topProducts: TopProduct[];
}

export type ActivityKind = 'receiving' | 'picking' | 'shipping' | 'movement';

export interface ActivityEvent {
  id: string;
  kind: ActivityKind;
  title: string;
  detail: string;
  status: string;
  at: string;
}
