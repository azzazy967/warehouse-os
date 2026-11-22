import { useCallback, useEffect, useState } from 'react';
import { ArrowDownToLine, Eye, Plus, X } from 'lucide-react';
import {
  api, apiMessage, type DocumentLine, type Location, type Product, type WarehouseDocument,
} from '../api';
import { useAuth } from '../auth';
import { ProductLink } from '../components/ProductLink';
import {
  Badge, Banner, Button, Card, DataTable, Field, Loader, Modal, PageHeader,
  formatDate, type Column,
} from '../ui';

interface NewLine { key: string; productId: string; quantityExpected: string; locationId: string }
interface ReceiveLine { itemId: number; quantityReceived: number; locationId?: number }

let lineSequence = 0;
const newLine = (): NewLine => ({ key: `ln-${++lineSequence}`, productId: '', quantityExpected: '1', locationId: '' });

export function ReceivingPage() {
  const { can } = useAuth();
  const [rows, setRows] = useState<WarehouseDocument[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [locations, setLocations] = useState<Location[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [createOpen, setCreateOpen] = useState(false);
  const [receiveOrder, setReceiveOrder] = useState<WarehouseDocument | null>(null);
  const [viewOrder, setViewOrder] = useState<WarehouseDocument | null>(null);
  const [form, setForm] = useState({ supplier: '', expectedDate: '', notes: '', items: [newLine()] as NewLine[] });
  const [receiveLines, setReceiveLines] = useState<ReceiveLine[]>([]);
  const [saving, setSaving] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    Promise.all([api.get<WarehouseDocument[]>('/receiving'), api.get<Product[]>('/products'), api.get<Location[]>('/locations')])
      .then(([orders, productRows, locationRows]) => {
        setRows(orders.data);
        setProducts(productRows.data);
        setLocations(locationRows.data);
      })
      .catch((caught) => setError(apiMessage(caught)))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { load(); }, [load]);

  const openCreate = () => {
    setError('');
    setForm({ supplier: '', expectedDate: '', notes: '', items: [newLine()] });
    setCreateOpen(true);
  };

  const createOrder = async () => {
    setSaving(true);
    setError('');
    try {
      await api.post('/receiving', {
        supplier: form.supplier,
        expectedDate: form.expectedDate || undefined,
        notes: form.notes || undefined,
        items: form.items.map((item) => ({
          productId: Number(item.productId),
          quantityExpected: Number(item.quantityExpected),
          locationId: item.locationId ? Number(item.locationId) : undefined,
        })),
      });
      setNotice('Receiving order created.');
      setCreateOpen(false);
      load();
    } catch (caught) {
      setError(apiMessage(caught));
    } finally {
      setSaving(false);
    }
  };

  const openReceive = (order: WarehouseDocument) => {
    setError('');
    setReceiveOrder(order);
    setReceiveLines(
      order.items.map((item) => ({
        itemId: item.id,
        quantityReceived: Math.max(0, (item.quantityExpected || 0) - (item.quantityReceived || 0)),
      })),
    );
  };

  const submitReceive = async () => {
    if (!receiveOrder) return;
    setSaving(true);
    setError('');
    try {
      await api.post(`/receiving/${receiveOrder.id}/receive`, {
        items: receiveLines.filter((line) => line.quantityReceived > 0),
      });
      setNotice(`Stock received for ${receiveOrder.orderNumber}.`);
      setReceiveOrder(null);
      load();
    } catch (caught) {
      setError(apiMessage(caught));
    } finally {
      setSaving(false);
    }
  };

  const cancelOrder = async (order: WarehouseDocument) => {
    if (!window.confirm(`Cancel receiving order ${order.orderNumber}?`)) return;
    try {
      await api.delete(`/receiving/${order.id}`);
      setNotice('Receiving order cancelled.');
      load();
    } catch (caught) {
      setError(apiMessage(caught));
    }
  };

  const productName = (id: number) => products.find((product) => product.id === id)?.name || `Product ${id}`;

  const columns: Column<WarehouseDocument>[] = [
    { key: 'number', header: 'Order', render: (row) => <span className="mono accent-text">{row.orderNumber}</span> },
    { key: 'supplier', header: 'Supplier', render: (row) => row.supplier },
    { key: 'lines', header: 'Lines', render: (row) => row.items.length },
    { key: 'units', header: 'Units', render: (row) => row.items.reduce((sum, item) => sum + (item.quantityExpected || 0), 0) },
    { key: 'expected', header: 'Expected', render: (row) => formatDate(row.expectedDate) },
    { key: 'status', header: 'Status', render: (row) => <Badge value={row.status} /> },
    { key: 'created', header: 'Created', render: (row) => formatDate(row.createdAt) },
    {
      key: 'actions', header: '', className: 'actions-col',
      render: (row) => (
        <div className="row-actions">
          <button className="icon-btn" onClick={() => setViewOrder(row)} aria-label="View order" title="View"><Eye size={15} /></button>
          {can('ADMIN', 'MANAGER') && row.status !== 'COMPLETED' && row.status !== 'CANCELLED' && (
            <>
              <button className="btn btn-primary btn-sm" onClick={() => openReceive(row)} disabled={!row.items.length}>
                <ArrowDownToLine size={13} /> Receive
              </button>
              <button className="icon-btn danger" onClick={() => cancelOrder(row)} aria-label="Cancel order" title="Cancel"><X size={15} /></button>
            </>
          )}
        </div>
      ),
    },
  ];

  return (
    <>
      <PageHeader
        title="Receiving"
        subtitle="Inbound orders from suppliers and stock put-away"
        actions={can('ADMIN', 'MANAGER') && <Button icon={Plus} onClick={openCreate}>New receiving order</Button>}
      />
      {error && !createOpen && !receiveOrder && <Banner kind="error" text={error} />}
      {notice && <Banner kind="success" text={notice} />}

      <Card>
        {loading ? <Loader /> : <DataTable columns={columns} rows={rows} emptyText="No receiving orders yet." />}
      </Card>

      <Modal
        open={createOpen}
        title="New receiving order"
        onClose={() => setCreateOpen(false)}
        wide
        footer={<>
          <Button variant="secondary" onClick={() => setCreateOpen(false)}>Cancel</Button>
          <Button onClick={createOrder} disabled={saving || !form.supplier || form.items.some((i) => !i.productId || Number(i.quantityExpected) < 1)}>
            {saving ? 'Creating...' : 'Create order'}
          </Button>
        </>}
      >
        {error && <Banner kind="error" text={error} />}
        <div className="form-grid">
          <Field label="Supplier"><input value={form.supplier} onChange={(e) => setForm({ ...form, supplier: e.target.value })} placeholder="Supplier name" required /></Field>
          <Field label="Expected date"><input type="date" value={form.expectedDate} onChange={(e) => setForm({ ...form, expectedDate: e.target.value })} /></Field>
          <Field label="Notes" hint="Optional"><input value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></Field>
        </div>
        <div className="line-header"><strong>Expected items</strong><Button variant="secondary" size="sm" icon={Plus} onClick={() => setForm({ ...form, items: [...form.items, newLine()] })}>Add line</Button></div>
        <div className="line-list">
          {form.items.map((item, index) => (
            <div className="line-row" key={item.key}>
              <select value={item.productId} onChange={(e) => setForm({ ...form, items: form.items.map((l, i) => i === index ? { ...l, productId: e.target.value } : l) })} aria-label={`Product for line ${index + 1}`}>
                <option value="">Select product</option>
                {products.map((product) => <option key={product.id} value={product.id}>{product.sku} - {product.name}</option>)}
              </select>
              <input type="number" min="1" value={item.quantityExpected} onChange={(e) => setForm({ ...form, items: form.items.map((l, i) => i === index ? { ...l, quantityExpected: e.target.value } : l) })} aria-label="Expected quantity" />
              <select value={item.locationId} onChange={(e) => setForm({ ...form, items: form.items.map((l, i) => i === index ? { ...l, locationId: e.target.value } : l) })} aria-label="Destination bin">
                <option value="">Default bin</option>
                {locations.map((location) => <option key={location.id} value={location.id}>{location.code}</option>)}
              </select>
              <button className="icon-btn danger" onClick={() => setForm({ ...form, items: form.items.filter((_, i) => i !== index) })} aria-label="Remove line"><X size={15} /></button>
            </div>
          ))}
        </div>
      </Modal>

      <Modal
        open={!!receiveOrder}
        title={receiveOrder ? `Receive stock - ${receiveOrder.orderNumber}` : ''}
        onClose={() => setReceiveOrder(null)}
        wide
        footer={<>
          <Button variant="secondary" onClick={() => setReceiveOrder(null)}>Cancel</Button>
          <Button onClick={submitReceive} disabled={saving || receiveLines.every((line) => line.quantityReceived <= 0)}>
            {saving ? 'Receiving...' : 'Confirm receipt'}
          </Button>
        </>}
      >
        {error && <Banner kind="error" text={error} />}
        <div className="detail-meta">
          <span><small>Supplier</small><strong>{receiveOrder?.supplier}</strong></span>
          <span><small>Status</small>{receiveOrder && <Badge value={receiveOrder.status} />}</span>
        </div>
        <div className="table-scroll">
          <table className="data-table">
            <thead><tr><th>Product</th><th>Expected</th><th>Already received</th><th>Receive now</th></tr></thead>
            <tbody>
              {receiveOrder?.items.map((item: DocumentLine) => {
                const index = receiveLines.findIndex((line) => line.itemId === item.id);
                return (
                  <tr key={item.id}>
                    <td><ProductLink id={item.productId} name={productName(item.productId)} /></td>
                    <td>{item.quantityExpected}</td>
                    <td>{item.quantityReceived}</td>
                    <td>
                      <input
                        type="number" min="0" max={(item.quantityExpected || 0) - (item.quantityReceived || 0)}
                        value={receiveLines[index]?.quantityReceived ?? 0}
                        onChange={(e) => setReceiveLines(receiveLines.map((line, i) => i === index ? { ...line, quantityReceived: Number(e.target.value) } : line))}
                      />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Modal>

      <Modal open={!!viewOrder} title={viewOrder ? `Order ${viewOrder.orderNumber || viewOrder.shipmentNumber}` : ''} onClose={() => setViewOrder(null)} wide>
        <div className="detail-meta">
          <span><small>Supplier</small><strong>{viewOrder?.supplier}</strong></span>
          <span><small>Status</small>{viewOrder && <Badge value={viewOrder.status} />}</span>
          <span><small>Created</small><strong>{formatDate(viewOrder?.createdAt)}</strong></span>
        </div>
        <div className="table-scroll">
          <table className="data-table">
            <thead><tr><th>Product</th><th>Expected</th><th>Received</th><th>Bin</th></tr></thead>
            <tbody>
              {viewOrder?.items.map((item) => (
                <tr key={item.id}>
                  <td><ProductLink id={item.productId} name={productName(item.productId)} /></td>
                  <td>{item.quantityExpected}</td>
                  <td>{item.quantityReceived}</td>
                  <td className="mono">{locations.find((location) => location.id === item.locationId)?.code || '-'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Modal>
    </>
  );
}
