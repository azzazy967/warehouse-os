import { useCallback, useEffect, useState } from 'react';
import { Activity, Search } from 'lucide-react';
import { api, apiMessage, type Product, type StockMovement } from '../api';
import { ProductLink } from '../components/ProductLink';
import {
  Badge, Banner, Button, Card, DataTable, Loader, PageHeader,
  formatDateTime, formatNumber, type Column,
} from '../ui';

const movementTypes = ['RECEIPT', 'PICK', 'SHIPMENT', 'TRANSFER', 'ADJUSTMENT', 'RETURN'];

export function MovementsPage() {
  const [rows, setRows] = useState<StockMovement[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [filters, setFilters] = useState({ search: '', type: '', productId: '', from: '', to: '' });

  const load = useCallback(() => {
    setLoading(true);
    const params = new URLSearchParams();
    Object.entries(filters).forEach(([key, value]) => { if (value) params.set(key, value); });
    Promise.all([api.get<StockMovement[]>(`/movements?${params}`), api.get<Product[]>('/products')])
      .then(([movements, productRows]) => {
        setRows(movements.data);
        setProducts(productRows.data);
      })
      .catch((caught) => setError(apiMessage(caught)))
      .finally(() => setLoading(false));
  }, [filters]);

  useEffect(() => {
    const timer = window.setTimeout(load, 200);
    return () => window.clearTimeout(timer);
  }, [load]);

  const columns: Column<StockMovement>[] = [
    { key: 'id', header: 'ID', render: (row) => <span className="mono muted">#{row.id}</span> },
    {
      key: 'product', header: 'Product',
      render: (row) => (
        <div className="cell-stack">
          <strong><ProductLink id={row.productId} name={row.product?.name || `Product ${row.productId}`} sku={row.product?.sku} /></strong>
          <small className="mono">{row.product?.sku}</small>
        </div>
      ),
    },
    { key: 'type', header: 'Type', render: (row) => <Badge value={row.type} /> },
    { key: 'location', header: 'Location', render: (row) => <span className="mono">{row.location?.code || '-'}</span> },
    {
      key: 'quantity', header: 'Quantity',
      render: (row) => <strong className={row.quantity > 0 ? 'positive' : 'negative'}>{row.quantity > 0 ? '+' : ''}{formatNumber(row.quantity)}</strong>,
    },
    { key: 'reference', header: 'Reference', render: (row) => row.reference || '-' },
    { key: 'user', header: 'By', render: (row) => row.user?.name || 'System' },
    { key: 'date', header: 'Date', render: (row) => formatDateTime(row.createdAt) },
  ];

  return (
    <>
      <PageHeader
        title="Stock Movements"
        subtitle="Complete audit trail of every inventory change"
        actions={<Button variant="secondary" icon={Activity} onClick={load}>Refresh</Button>}
      />
      {error && <Banner kind="error" text={error} />}

      <Card>
        <div className="toolbar toolbar-wrap">
          <div className="input-wrap search-wrap"><Search size={16} /><input value={filters.search} onChange={(e) => setFilters({ ...filters, search: e.target.value })} placeholder="Search product or reference" /></div>
          <select value={filters.type} onChange={(e) => setFilters({ ...filters, type: e.target.value })} aria-label="Filter by movement type">
            <option value="">All types</option>
            {movementTypes.map((type) => <option key={type} value={type}>{type}</option>)}
          </select>
          <select value={filters.productId} onChange={(e) => setFilters({ ...filters, productId: e.target.value })} aria-label="Filter by product">
            <option value="">All products</option>
            {products.map((product) => <option key={product.id} value={product.id}>{product.sku} - {product.name}</option>)}
          </select>
          <input type="date" value={filters.from} onChange={(e) => setFilters({ ...filters, from: e.target.value })} aria-label="From date" />
          <input type="date" value={filters.to} onChange={(e) => setFilters({ ...filters, to: e.target.value })} aria-label="To date" />
          {(filters.search || filters.type || filters.productId || filters.from || filters.to) && (
            <Button variant="ghost" size="sm" onClick={() => setFilters({ search: '', type: '', productId: '', from: '', to: '' })}>Clear filters</Button>
          )}
        </div>
        {loading ? <Loader /> : <DataTable columns={columns} rows={rows} emptyText="No movements match these filters." />}
      </Card>
    </>
  );
}
