import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Activity,
  ArrowDownToLine,
  ArrowRight,
  ArrowUpRight,
  Boxes,
  ClipboardList,
  DollarSign,
  ListChecks,
  MapPin,
  PackageX,
  RefreshCw,
  TrendingDown,
  TrendingUp,
  Truck,
  Warehouse,
} from 'lucide-react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import {
  api,
  apiMessage,
  type ActivityEvent,
  type ActivityKind,
  type CategoryStock,
  type ChartPoint,
  type DashboardInsights,
  type DashboardStats,
  type LocationStock,
  type ProductStock,
  type StockMovement,
  type TopProduct,
} from '../api';
import { useAuth } from '../auth';
import { useTheme } from '../theme';
import { ProductLink } from '../components/ProductLink';
import {
  Badge,
  Banner,
  Button,
  Card,
  DataTable,
  Loader,
  Modal,
  PageHeader,
  StatCard,
  formatDateTime,
  formatMoney,
  formatNumber,
  type Column,
} from '../ui';

const chartPalette = (light: boolean) => ({
  axis: { fill: light ? '#1e293b' : '#e4e4f0', fontSize: 12 },
  line: light ? '#e2e8f0' : '#263449',
  tooltip: {
    contentStyle: {
      background: light ? '#ffffff' : '#111c31',
      border: `1px solid ${light ? '#e2e8f0' : '#263449'}`,
      borderRadius: 10,
      color: light ? '#1e293b' : '#e4e4f0',
    },
    labelStyle: { color: light ? '#1e293b' : '#e4e4f0' },
  },
});
const PIE_COLORS = ['#22d3ee', '#a78bfa', '#fbbf24', '#fb7185', '#34d399', '#60a5fa'];

type KpiKey = 'products' | 'value' | 'units' | 'lowStock' | 'outOfStock' | 'locations';

const DRILL_TITLES: Record<KpiKey, string> = {
  products: 'Active products',
  value: 'Stock value breakdown',
  units: 'Units on hand by location',
  lowStock: 'Low stock SKUs',
  outOfStock: 'Out of stock SKUs',
  locations: 'Stock locations',
};

const ACTIVITY_ICONS: Record<ActivityKind, typeof Boxes> = {
  receiving: ArrowDownToLine,
  picking: ListChecks,
  shipping: Truck,
  movement: Activity,
};
const ACTIVITY_TONES: Record<ActivityKind, string> = {
  receiving: 'pending-teal',
  picking: 'pending-amber',
  shipping: 'pending-violet',
  movement: 'pending-rose',
};

const topColumns: Column<TopProduct>[] = [
  {
    key: 'sku',
    header: 'Product',
    render: (row) => <div className="cell-stack"><strong><ProductLink id={row.id} name={row.name} sku={row.sku} /></strong><small>{row.sku}</small></div>,
  },
  { key: 'value', header: 'Stock value', render: (row) => formatMoney(row.value) },
];

const productColumns: Column<ProductStock>[] = [
  { key: 'sku', header: 'SKU', render: (row) => row.sku },
  { key: 'name', header: 'Product', render: (row) => <ProductLink id={row.id} name={row.name} sku={row.sku} /> },
  { key: 'onHand', header: 'On hand', render: (row) => formatNumber(row.onHand) },
  { key: 'available', header: 'Available', render: (row) => formatNumber(row.available) },
  { key: 'value', header: 'Value', render: (row) => formatMoney(row.value) },
];

const locationColumns: Column<LocationStock>[] = [
  { key: 'code', header: 'Code', render: (row) => row.code },
  { key: 'warehouse', header: 'Warehouse', render: (row) => row.warehouse },
  { key: 'zone', header: 'Zone', render: (row) => row.zone || '-' },
  { key: 'units', header: 'Units', render: (row) => formatNumber(row.units) },
  { key: 'value', header: 'Value', render: (row) => formatMoney(row.value) },
];

const categoryColumns: Column<CategoryStock>[] = [
  { key: 'category', header: 'Category', render: (row) => row.category },
  { key: 'units', header: 'Units', render: (row) => formatNumber(row.units) },
  { key: 'value', header: 'Value', render: (row) => formatMoney(row.value) },
];

const movementColumns: Column<StockMovement>[] = [
  {
    key: 'product',
    header: 'Product',
    render: (row) => (
      <div className="cell-stack">
        <strong><ProductLink id={row.productId} name={row.product?.name || `Product ${row.productId}`} sku={row.product?.sku} /></strong>
        <small>{row.product?.sku}</small>
      </div>
    ),
  },
  { key: 'type', header: 'Type', render: (row) => <Badge value={row.type} /> },
  { key: 'location', header: 'Location', render: (row) => row.location?.code || '-' },
  {
    key: 'quantity',
    header: 'Quantity',
    render: (row) => (
      <span className={row.quantity > 0 ? 'positive' : 'negative'}>
        {row.quantity > 0 ? '+' : ''}
        {formatNumber(row.quantity)}
      </span>
    ),
  },
  { key: 'reference', header: 'Reference', render: (row) => row.reference || '-' },
  { key: 'createdAt', header: 'When', render: (row) => formatDateTime(row.createdAt) },
];

export function DashboardPage() {
  const navigate = useNavigate();
  const { can } = useAuth();
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [chart, setChart] = useState<ChartPoint[]>([]);
  const [movements, setMovements] = useState<StockMovement[]>([]);
  const [insights, setInsights] = useState<DashboardInsights | null>(null);
  const [activity, setActivity] = useState<ActivityEvent[]>([]);
  const [drill, setDrill] = useState<KpiKey | null>(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [loading, setLoading] = useState(true);
  const [reloadKey, setReloadKey] = useState(0);
  const { theme } = useTheme();
  const palette = chartPalette(theme === 'light');

  const load = useCallback(() => {
    let active = true;
    setError('');
    setNotice('');
    setLoading(true);

    Promise.allSettled([
      api.get<DashboardStats>('/dashboard/stats'),
      api.get<ChartPoint[]>('/dashboard/movement-chart'),
      api.get<StockMovement[]>('/dashboard/recent-movements'),
      api.get<DashboardInsights>('/dashboard/insights'),
      api.get<ActivityEvent[]>('/dashboard/activity'),
    ]).then((results) => {
      if (!active) return;
      const [statsResult, chartResult, movementsResult, insightsResult, activityResult] = results;
      const messageFor = (index: number) => {
        const result = results[index];
        return result.status === 'rejected' ? apiMessage(result.reason) : '';
      };

      // Core data failure blocks the dashboard; enhancement failure only warns.
      const coreError = messageFor(0) || messageFor(1) || messageFor(2);
      const enhancementError = messageFor(3) || messageFor(4);
      setError(coreError);
      setNotice(coreError ? '' : enhancementError);

      if (statsResult.status === 'fulfilled') setStats(statsResult.value.data);
      if (chartResult.status === 'fulfilled') setChart(chartResult.value.data);
      if (movementsResult.status === 'fulfilled') setMovements(movementsResult.value.data);
      if (insightsResult.status === 'fulfilled') setInsights(insightsResult.value.data);
      if (activityResult.status === 'fulfilled') setActivity(activityResult.value.data);
      setLoading(false);
    });

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => load(), [load, reloadKey]);
  const reload = () => setReloadKey((key) => key + 1);

  const canManage = can('ADMIN', 'MANAGER');
  const flowStages = stats
    ? [
        { label: 'Receiving', sub: 'Pending receipts', value: stats.pendingReceiving, icon: ArrowDownToLine, tone: 'pending-teal', path: '/receiving', allowed: canManage },
        { label: 'Inventory', sub: 'Active products', value: stats.products, icon: Boxes, tone: 'pending-violet', path: '/inventory', allowed: true },
        { label: 'Picking', sub: 'Open pick orders', value: stats.pendingPicking, icon: ListChecks, tone: 'pending-amber', path: '/picking', allowed: true },
        { label: 'Shipping', sub: 'To dispatch', value: stats.pendingShipping, icon: Truck, tone: 'pending-rose', path: '/shipping', allowed: canManage },
      ]
    : [];

  const renderDrill = () => {
    if (!stats || !insights) return null;
    switch (drill) {
      case 'products':
        return (
          <>
            <div className="drill-summary">
              <div><strong>{stats.products}</strong><small>Active products</small></div>
              <div><strong>{formatMoney(stats.totalValue)}</strong><small>Total stock value</small></div>
            </div>
            <DataTable columns={topColumns} rows={insights.topProducts} emptyText="No products yet." />
            {canManage && (
              <div className="drill-actions">
                <Button variant="secondary" icon={ArrowUpRight} onClick={() => navigate('/products')}>Open Products</Button>
              </div>
            )}
          </>
        );
      case 'value':
        return (
          <>
            <div className="drill-summary">
              <div><strong>{formatMoney(stats.totalValue)}</strong><small>Total stock value</small></div>
              <div><strong>{insights.byCategory.length}</strong><small>Categories</small></div>
            </div>
            <DataTable columns={categoryColumns} rows={insights.byCategory} getRowKey={(row) => row.category} emptyText="No stock value recorded." />
          </>
        );
      case 'units':
        return (
          <>
            <div className="drill-summary">
              <div><strong>{formatNumber(stats.totalUnits)}</strong><small>Units on hand</small></div>
              <div><strong>{insights.byLocation.length}</strong><small>Stock locations</small></div>
            </div>
            <DataTable columns={locationColumns} rows={insights.byLocation} getRowKey={(row) => row.code} emptyText="No stock recorded." />
          </>
        );
      case 'lowStock':
        return (
          <>
            <div className="drill-summary">
              <div><strong>{stats.lowStock}</strong><small>SKU(s) at or below reorder level</small></div>
            </div>
            <DataTable columns={productColumns} rows={insights.productStock.filter((row) => row.status === 'LOW_STOCK')} emptyText="No low-stock items." />
          </>
        );
      case 'outOfStock':
        return (
          <>
            <div className="drill-summary">
              <div><strong>{stats.outOfStock}</strong><small>SKU(s) with no stock</small></div>
            </div>
            <DataTable columns={productColumns} rows={insights.productStock.filter((row) => row.status === 'OUT_OF_STOCK')} emptyText="Nothing is out of stock." />
          </>
        );
      case 'locations':
        return (
          <>
            <div className="drill-summary">
              <div><strong>{stats.locations}</strong><small>Configured locations</small></div>
              <div><strong>{formatNumber(stats.totalUnits)}</strong><small>Units stored</small></div>
            </div>
            <DataTable columns={locationColumns} rows={insights.byLocation} getRowKey={(row) => row.code} emptyText="No locations yet." />
            {canManage && (
              <div className="drill-actions">
                <Button variant="secondary" icon={ArrowUpRight} onClick={() => navigate('/locations')}>Open Locations</Button>
              </div>
            )}
          </>
        );
      default:
        return null;
    }
  };

  const categoryData = insights?.byCategory ?? [];
  const locationData = insights?.byLocation ?? [];

  return (
    <>
      <PageHeader
        title="Dashboard"
        subtitle="Live overview of warehouse operations and stock health"
      />

      {error && (
        <div className="banner-row">
          <Banner kind="error" text={error} />
          <Button variant="secondary" icon={RefreshCw} onClick={reload}>Retry</Button>
        </div>
      )}
      {notice && <Banner kind="error" text={notice} />}

      {error ? null : loading || !stats ? (
        <Loader />
      ) : (
        <>
          <div className="stat-grid">
            <StatCard label="Active products" value={stats.products} icon={Boxes} tone="teal" onClick={insights ? () => setDrill('products') : undefined} />
            <StatCard label="Stock value" value={formatMoney(stats.totalValue)} icon={DollarSign} tone="violet" onClick={insights ? () => setDrill('value') : undefined} />
            <StatCard label="Units on hand" value={formatNumber(stats.totalUnits)} icon={Warehouse} onClick={insights ? () => setDrill('units') : undefined} />
            <StatCard label="Low stock SKUs" value={stats.lowStock} icon={TrendingDown} tone="amber" hint="At or below reorder level" onClick={insights ? () => setDrill('lowStock') : undefined} />
            <StatCard label="Out of stock" value={stats.outOfStock} icon={PackageX} tone="rose" onClick={insights ? () => setDrill('outOfStock') : undefined} />
            <StatCard label="Stock locations" value={stats.locations} icon={MapPin} onClick={insights ? () => setDrill('locations') : undefined} />
          </div>

          <div className="pending-grid">
            {flowStages.map((stage) => {
              const Icon = stage.icon;
              const content = (
                <>
                  <span className={`pending-icon ${stage.tone}`}><Icon size={18} /></span>
                  <div><strong>{stage.value}</strong><small>{stage.sub}</small></div>
                  {stage.allowed && <ArrowUpRight size={15} className="pending-go" aria-hidden="true" />}
                </>
              );
              return stage.allowed ? (
                <button
                  type="button"
                  className="card pending-card pending-clickable"
                  key={stage.label}
                  onClick={() => navigate(stage.path)}
                  aria-label={`Open ${stage.label}`}
                >
                  {content}
                </button>
              ) : (
                <div className="card pending-card" key={stage.label}>{content}</div>
              );
            })}
            {insights ? (
              <button
                type="button"
                className="card pending-card pending-clickable"
                onClick={() => setDrill('lowStock')}
                aria-label="Open items needing attention"
              >
                <span className="pending-icon pending-rose"><ClipboardList size={18} /></span>
                <div><strong>{stats.lowStock + stats.outOfStock}</strong><small>Needs attention</small></div>
                <ArrowUpRight size={15} className="pending-go" aria-hidden="true" />
              </button>
            ) : (
              <div className="card pending-card">
                <span className="pending-icon pending-rose"><ClipboardList size={18} /></span>
                <div><strong>{stats.lowStock + stats.outOfStock}</strong><small>Needs attention</small></div>
              </div>
            )}
          </div>

          <Card className="flow-card">
            <div className="card-heading">
              <div>
                <h2>Operational flow</h2>
                <p>Open work moving through the warehouse pipeline</p>
              </div>
              <Activity size={18} className="muted" />
            </div>
            <div className="flow-track">
              {flowStages.map((stage, index) => {
                const Icon = stage.icon;
                return (
                  <div className="flow-stage" key={stage.label}>
                    {stage.allowed ? (
                      <button type="button" className="flow-node flow-node-link" onClick={() => navigate(stage.path)} aria-label={`Open ${stage.label}`}>
                        <span className={`flow-node-icon ${stage.tone}`}><Icon size={18} /></span>
                        <span className="flow-node-text">
                          <strong>{stage.value}</strong>
                          <small>{stage.label}</small>
                        </span>
                      </button>
                    ) : (
                      <div className="flow-node">
                        <span className={`flow-node-icon ${stage.tone}`}><Icon size={18} /></span>
                        <span className="flow-node-text">
                          <strong>{stage.value}</strong>
                          <small>{stage.label}</small>
                        </span>
                      </div>
                    )}
                    {index < flowStages.length - 1 && (
                      <span className="flow-arrow" aria-hidden="true"><ArrowRight size={20} /></span>
                    )}
                  </div>
                );
              })}
            </div>
          </Card>

          <div className="dashboard-charts">
            <Card className="chart-card">
              <div className="card-heading">
                <div>
                  <h2>Stock movement</h2>
                  <p>Inbound and outbound units over the last 7 days</p>
                </div>
                <div className="legend-inline">
                  <span><i className="dot dot-in" /> Inbound</span>
                  <span><i className="dot dot-out" /> Outbound</span>
                </div>
              </div>
              {chart.length === 0 ? (
                <p className="muted empty-chart">No movement data yet.</p>
              ) : (
                <div className="chart-wrap">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={chart} margin={{ top: 10, right: 12, left: 0, bottom: 0 }} barGap={4}>
                      <CartesianGrid stroke={palette.line} vertical={false} />
                      <XAxis dataKey="date" tick={palette.axis} tickLine={false} axisLine={{ stroke: palette.line }} />
                      <YAxis tick={palette.axis} tickLine={false} axisLine={false} width={44} />
                      <Tooltip {...palette.tooltip} />
                      <Legend wrapperStyle={{ display: 'none' }} />
                      <Bar dataKey="inbound" name="Inbound" fill="#22d3ee" radius={[4, 4, 0, 0]} />
                      <Bar dataKey="outbound" name="Outbound" fill="#a78bfa" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}
            </Card>

            <Card className="chart-card">
              <div className="card-heading">
                <div>
                  <h2>Stock value by category</h2>
                  <p>Share of total inventory value</p>
                </div>
              </div>
              {categoryData.length === 0 ? (
                <p className="muted empty-chart">No stock value data yet.</p>
              ) : (
                <>
                  <div className="chart-wrap">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie
                          data={categoryData}
                          dataKey="value"
                          nameKey="category"
                          innerRadius={58}
                          outerRadius={92}
                          paddingAngle={2}
                          stroke="none"
                        >
                          {categoryData.map((entry, index) => (
                            <Cell key={entry.category} fill={PIE_COLORS[index % PIE_COLORS.length]} />
                          ))}
                        </Pie>
                        <Tooltip {...palette.tooltip} formatter={(value) => formatMoney(Number(value))} />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                  <div className="legend-inline legend-wrap">
                    {categoryData.map((entry, index) => (
                      <span key={entry.category}>
                        <i className="dot" style={{ background: PIE_COLORS[index % PIE_COLORS.length] }} />
                        {entry.category}
                      </span>
                    ))}
                  </div>
                </>
              )}
            </Card>
          </div>

          <div className="dashboard-charts dashboard-charts-second">
            <Card className="chart-card">
              <div className="card-heading">
                <div>
                  <h2>Units by location</h2>
                  <p>Where stock is currently held</p>
                </div>
              </div>
              {locationData.length === 0 ? (
                <p className="muted empty-chart">No location data yet.</p>
              ) : (
                <div className="chart-wrap">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={locationData.slice(0, 8)} layout="vertical" margin={{ top: 6, right: 16, left: 4, bottom: 0 }}>
                      <CartesianGrid stroke={palette.line} horizontal={false} />
                      <XAxis type="number" tick={palette.axis} tickLine={false} axisLine={{ stroke: palette.line }} />
                      <YAxis type="category" dataKey="code" tick={palette.axis} tickLine={false} axisLine={false} width={112} />
                      <Tooltip {...palette.tooltip} />
                      <Bar dataKey="units" name="Units" fill="#22d3ee" radius={[0, 4, 4, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}
            </Card>

            <Card className="chart-card">
              <div className="card-heading">
                <div>
                  <h2>Activity timeline</h2>
                  <p>Latest receipts, picks, shipments and stock changes</p>
                </div>
                <Activity size={18} className="muted" />
              </div>
              <div className="timeline">
                {activity.map((event, index) => {
                  const Icon = ACTIVITY_ICONS[event.kind] ?? Activity;
                  return (
                    <div className="timeline-item" key={event.id}>
                      <div className="timeline-rail">
                        <span className={`timeline-dot ${ACTIVITY_TONES[event.kind] ?? 'pending-rose'}`}><Icon size={14} /></span>
                        {index < activity.length - 1 && <span className="timeline-line" />}
                      </div>
                      <div className="timeline-body">
                        <div className="timeline-head">
                          <strong>{event.title}</strong>
                          <Badge value={event.status} />
                        </div>
                        <small>{event.detail}</small>
                      </div>
                      <span className="timeline-meta">{formatDateTime(event.at)}</span>
                    </div>
                  );
                })}
                {activity.length === 0 && <p className="muted">No activity recorded yet.</p>}
              </div>
            </Card>
          </div>

          <Card className="recent-card">
            <div className="card-heading">
              <div>
                <h2>Recent movements</h2>
                <p>Latest stock movements recorded in the system</p>
              </div>
              <TrendingUp size={18} className="muted" />
            </div>
            <DataTable columns={movementColumns} rows={movements.slice(0, 5)} emptyText="No movements yet." />
          </Card>
        </>
      )}

      <Modal
        open={!!drill && !!insights}
        title={drill ? DRILL_TITLES[drill] : ''}
        onClose={() => setDrill(null)}
        wide
      >
        {renderDrill()}
      </Modal>
    </>
  );
}
