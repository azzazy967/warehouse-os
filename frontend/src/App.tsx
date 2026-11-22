import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { AuthProvider, useAuth } from './auth';
import { Layout, ProtectedRoute, RoleRoute } from './Layout';
import { ThemeProvider } from './theme';
import { Loader } from './ui';
import { DashboardPage } from './pages/Dashboard';
import { InventoryPage } from './pages/Inventory';
import { LocationsPage } from './pages/Locations';
import { LoginPage } from './pages/Login';
import { MovementsPage } from './pages/Movements';
import { PickingPage } from './pages/Picking';
import { ProductDetailPage } from './pages/ProductDetail';
import { ProductsPage } from './pages/Products';
import { ReceivingPage } from './pages/Receiving';
import { ShippingPage } from './pages/Shipping';
import { UsersPage } from './pages/Users';

const MANAGER_PLUS = ['ADMIN', 'MANAGER'] as const;
const ADMIN_ONLY = ['ADMIN'] as const;

function LoginRoute() {
  const { user, loading } = useAuth();
  if (loading) {
    return (
      <div className="full-loader">
        <Loader />
      </div>
    );
  }
  return user ? <Navigate to="/" replace /> : <LoginPage />;
}

export default function App() {
  return (
    <ThemeProvider>
      <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <AuthProvider>
          <Routes>
            <Route path="/login" element={<LoginRoute />} />
            <Route
              element={
                <ProtectedRoute>
                  <Layout />
                </ProtectedRoute>
              }
            >
              <Route path="/" element={<DashboardPage />} />
              <Route path="/inventory" element={<InventoryPage />} />
              <Route
                path="/products"
                element={<RoleRoute allow={[...MANAGER_PLUS]}><ProductsPage /></RoleRoute>}
              />
              <Route path="/products/:id" element={<ProductDetailPage />} />
              <Route
                path="/locations"
                element={<RoleRoute allow={[...MANAGER_PLUS]}><LocationsPage /></RoleRoute>}
              />
              <Route
                path="/receiving"
                element={<RoleRoute allow={[...MANAGER_PLUS]}><ReceivingPage /></RoleRoute>}
              />
              <Route path="/picking" element={<PickingPage />} />
              <Route
                path="/shipping"
                element={<RoleRoute allow={[...MANAGER_PLUS]}><ShippingPage /></RoleRoute>}
              />
              <Route path="/movements" element={<MovementsPage />} />
              <Route
                path="/users"
                element={<RoleRoute allow={[...ADMIN_ONLY]}><UsersPage /></RoleRoute>}
              />
            </Route>
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </AuthProvider>
      </BrowserRouter>
    </ThemeProvider>
  );
}
