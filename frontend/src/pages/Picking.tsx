import { useCallback, useEffect, useState } from 'react';
import { CheckCheck, Eye, Plus, UserPlus, X } from 'lucide-react';
import {
  api, apiMessage, type AuthUser, type DocumentLine, type Location, type Product, type WarehouseDocument,
} from '../api';
import { useAuth } from '../auth';
import { ProductLink } from '../components/ProductLink';
import {
  Badge, Banner, Button, Card, DataTable, Field, Loader, Modal, PageHeader,
  formatDate, type Column,
} from '../ui';

interface NewLine { key: string; productId: string; quantity: string; locationId: string }
interface PickLine { itemId: number; quantityPicked: number; locationId?: number }

let lineSequence = 0;
const newLine = (): NewLine => ({ key: `ln-${++lineSequence}`, productId: '', quantity: '1', locationId: '' });

export function PickingPage() {
  const { can, user: currentUser } = useAuth();
  const [rows, setRows] = useState<WarehouseDocument[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [locations, setLocations] = useState<Location[]>([]);
  const [users, setUsers] = useState<AuthUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [mineOnly, setMineOnly] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [assignOrder, setAssignOrder] = useState<WarehouseDocument | null>(null);
  const [completeOrder, setCompleteOrder] = useState<WarehouseDocument | null>(null);
  const [viewOrder, setViewOrder] = useState<WarehouseDocument | null>(null);
  const [assigneeId, setAssigneeId] = useState('');
  const [pickLines, setPickLines] = useState<PickLine[]>([]);
  const [form, setForm] = useState({ reference: '', priority: 'NORMAL', notes: '', items: [newLine()] as NewLine[] });
  const [saving, setSaving] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    const endpoint = mineOnly ? '/picking/my' : '/picking';
    const canAssign = can('ADMIN', 'MANAGER');
    const requests: Array<Promise<{ data: unknown }>> = [
      api.get<WarehouseDocument[]>(endpoint),
      api.get<Product[]>('/products'),
      api.get<Location[]>('/locations'),
    ];
    if (canAssign) requests.push(api.get<AuthUser[]>('/users'));
    Promise.all(requests)
      .then(([orders, productRows, locationRows, userRows]) => {
        setRows(orders.data as WarehouseDocument[]);
        setProducts(productRows.data as Product[]);
        setLocations(locationRows.data as Location[]);
        if (userRows) setUsers(userRows.data as AuthUser[]);
      })
      .catch((caught) => setError(apiMessage(caught)))
      .finally(() => setLoading(false));
  }, [mineOnly, can]);

  useEffect(() => { load(); }, [load]);

  const openCreate = () => {
    setError('');
    setForm({ reference: '', priority: 'NORMAL', notes: '', items: [newLine()] });
    setCreateOpen(true);
  };

  const createOrder = async () => {
    setSaving(true);
    setError('');
    try {
      await api.post('/picking', {
        reference: form.reference || undefined,
        priority: form.priority,
        notes: form.notes || undefined,
        items: form.items.map((item) => ({
          productId: Number(item.productId),
          quantity: Number(item.quantity),
          locationId: item.locationId ? Number(item.locationId) : undefined,
        })),
      });
      setNotice('Pick order created.');
      setCreateOpen(false);
      load();
    } catch (caught) {
      setError(apiMessage(caught));
    } finally {
      setSaving(false);
    }
  };

  const submitAssign = async () => {
    if (!assignOrder) return;
    setSaving(true);
    setError('');
    try {
      await api.post(`/picking/${assignOrder.id}/assign`, { assigneeId: Number(assigneeId) });
      setNotice('Pick order assigned.');
      setAssignOrder(null);
      load();
    } catch (caught) {
      setError(apiMessage(caught));
    } finally {
      setSaving(false);
    }
  };

  const openComplete = (order: WarehouseDocument) => {
    setError('');
    setCompleteOrder(order);
    setPickLines(order.items.map((item) => ({
      itemId: item.id,
      quantityPicked: Math.max(0, (item.quantityOrdered || 0) - (item.quantityPicked || 0)),
    })));
  };

  const submitComplete = async () => {
    if (!completeOrder) return;
    setSaving(true);
    setError('');
    try {
      await api.post(`/picking/${completeOrder.id}/complete`, {
        items: pickLines.filter((line) => line.quantityPicked > 0),
      });
      setNotice(`Pick order ${completeOrder.orderNumber} completed.`);
      setCompleteOrder(null);
      load();
    } catch (caught) {
      setError(apiMessage(caught));
    } finally {
      setSaving(false);
    }
  };

  const cancelOrder = async (order: WarehouseDocument) => {
    if (!window.confirm(`Cancel pick order ${order.orderNumber}?`)) return;
    try {
      await api.delete(`/picking/${order.id}`);
      setNotice('Pick order cancelled.');
      load();
    } catch (caught) {
      setError(apiMessage(caught));
    }
  };

  const productName = (id: number) => products.find((product) => product.id === id)?.name || `Product ${id}`;

  const columns: Column<WarehouseDocument>[] = [
    { key: 'number', header: 'Order', render: (row) => <span className="mono accent-text">{row.orderNumber}</span> },
    { key: 'reference', header: 'Reference', render: (row) => row.reference || '-' },
    { key: 'priority', header: 'Priority', render: (row) => <Badge value={row.priority || 'NORMAL'} /> },
    { key: 'lines', header: 'Lines', render: (row) => row.items.length },
    { key: 'units', header: 'Units', render: (row) => row.items.reduce((sum, item) => sum + (item.quantityOrdered || 0), 0) },
    { key: 'assignee', header: 'Assignee', render: (row) => row.assignee?.name || 'Unassigned' },
    { key: 'status', header: 'Status', render: (row) => <Badge value={row.status} /> },
    { key: 'created', header: 'Created', render: (row) => formatDate(row.createdAt) },
    {
      key: 'actions', header: '', className: 'actions-col',
      render: (row) => (
        <div className="row-actions">
          <button className="icon-btn" onClick={() => setViewOrder(row)} aria-label="View order" title="View"><Eye size={15} /></button>
          {row.status !== 'COMPLETED' && row.status !== 'CANCELLED' && (
            <>
              {can('ADMIN', 'MANAGER') && (
                <Button variant="secondary" size="sm" onClick={() => { setAssignOrder(row); setAssigneeId(String(row.assigneeId || users[0]?.id || '')); }} icon={UserPlus}>Assign</Button>
              )}
              {(can('ADMIN', 'MANAGER') || row.assigneeId === currentUser?.id) && (
                <Button size="sm" onClick={() => openComplete(row)} disabled={!row.items.length} icon={CheckCheck}>Pick</Button>
              )}
              {can('ADMIN', 'MANAGER') && <button className="icon-btn danger" onClick={() => cancelOrder(row)} aria-label="Cancel order" title="Cancel"><X size={15} /></button>}
            </>
          )}
        </div>
      ),
    },
  ];

  return (
    <>
      <PageHeader
        title="Picking"
        subtitle="Pick lists, assignment and stock deduction"
        actions={
          <div className="header-actions">
            <label className="check-inline"><input type="checkbox" checked={mineOnly} onChange={(e) => setMineOnly(e.target.checked)} /> My picks</label>
            {can('ADMIN', 'MANAGER') && <Button icon={Plus} onClick={openCreate}>New pick order</Button>}
          </div>
        }
      />
      {error && !createOpen && !completeOrder && !assignOrder && <Banner kind="error" text={error} />}
      {notice && <Banner kind="success" text={notice} />}

      <Card>
        {loading ? <Loader /> : <DataTable columns={columns} rows={rows} emptyText="No pick orders found." />}
      </Card>

      <Modal
        open={createOpen} title="New pick order" onClose={() => setCreateOpen(false)} wide
        footer={<>
          <Button variant="secondary" onClick={() => setCreateOpen(false)}>Cancel</Button>
          <Button onClick={createOrder} disabled={saving || form.items.some((i) => !i.productId || Number(i.quantity) < 1)}>{saving ? 'Creating...' : 'Create order'}</Button>
        </>}
      >
        {error && <Banner kind="error" text={error} />}
        <div className="form-grid">
          <Field label="Reference"><input value={form.reference} onChange={(e) => setForm({ ...form, reference: e.target.value })} placeholder="SO-10483" /></Field>
          <Field label="Priority"><select value={form.priority} onChange={(e) => setForm({ ...form, priority: e.target.value })}><option>NORMAL</option><option>LOW</option><option>HIGH</option><option>URGENT</option></select></Field>
          <Field label="Notes" hint="Optional"><input value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></Field>
        </div>
        <div className="line-header"><strong>Items to pick</strong><Button variant="secondary" size="sm" icon={Plus} onClick={() => setForm({ ...form, items: [...form.items, newLine()] })}>Add line</Button></div>
        <div className="line-list">
          {form.items.map((item, index) => (
            <div className="line-row" key={item.key}>
              <select value={item.productId} onChange={(e) => setForm({ ...form, items: form.items.map((l, i) => i === index ? { ...l, productId: e.target.value } : l) })} aria-label={`Product for line ${index + 1}`}>
                <option value="">Select product</option>
                {products.map((product) => <option key={product.id} value={product.id}>{product.sku} - {product.name}</option>)}
              </select>
              <input type="number" min="1" value={item.quantity} onChange={(e) => setForm({ ...form, items: form.items.map((l, i) => i === index ? { ...l, quantity: e.target.value } : l) })} aria-label="Quantity" />
              <select value={item.locationId} onChange={(e) => setForm({ ...form, items: form.items.map((l, i) => i === index ? { ...l, locationId: e.target.value } : l) })} aria-label="Source bin">
                <option value="">Auto-select bin</option>
                {locations.map((location) => <option key={location.id} value={location.id}>{location.code}</option>)}
              </select>
              <button className="icon-btn danger" onClick={() => setForm({ ...form, items: form.items.filter((_, i) => i !== index) })} aria-label="Remove line"><X size={15} /></button>
            </div>
          ))}
        </div>
      </Modal>

      <Modal
        open={!!assignOrder} title={assignOrder ? `Assign ${assignOrder.orderNumber}` : ''} onClose={() => setAssignOrder(null)}
        footer={<>
          <Button variant="secondary" onClick={() => setAssignOrder(null)}>Cancel</Button>
          <Button onClick={submitAssign} disabled={saving || !assigneeId}>{saving ? 'Assigning...' : 'Assign order'}</Button>
        </>}
      >
        {error && <Banner kind="error" text={error} />}
        <Field label="Assignee">
          <select value={assigneeId} onChange={(e) => setAssigneeId(e.target.value)}>
            <option value="">Select team member</option>
            {users.map((person) => <option key={person.id} value={person.id}>{person.name} - {person.role}</option>)}
          </select>
        </Field>
      </Modal>

      <Modal
        open={!!completeOrder} title={completeOrder ? `Pick ${completeOrder.orderNumber}` : ''} onClose={() => setCompleteOrder(null)} wide
        footer={<>
          <Button variant="secondary" onClick={() => setCompleteOrder(null)}>Cancel</Button>
          <Button onClick={submitComplete} disabled={saving || pickLines.every((line) => line.quantityPicked <= 0)}>{saving ? 'Saving...' : 'Confirm pick'}</Button>
        </>}
      >
        {error && <Banner kind="error" text={error} />}
        <div className="table-scroll">
          <table className="data-table">
            <thead><tr><th>Product</th><th>Ordered</th><th>Already picked</th><th>Pick now</th></tr></thead>
            <tbody>
              {completeOrder?.items.map((item: DocumentLine) => {
                const index = pickLines.findIndex((line) => line.itemId === item.id);
                return (
                  <tr key={item.id}>
                    <td><ProductLink id={item.productId} name={productName(item.productId)} /></td>
                    <td>{item.quantityOrdered}</td>
                    <td>{item.quantityPicked}</td>
                    <td><input type="number" min="0" max={(item.quantityOrdered || 0) - (item.quantityPicked || 0)} value={pickLines[index]?.quantityPicked ?? 0} onChange={(e) => setPickLines(pickLines.map((line, i) => i === index ? { ...line, quantityPicked: Number(e.target.value) } : line))} /></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Modal>

      <Modal open={!!viewOrder} title={viewOrder ? `Order ${viewOrder.orderNumber}` : ''} onClose={() => setViewOrder(null)} wide>
        <div className="detail-meta">
          <span><small>Reference</small><strong>{viewOrder?.reference || '-'}</strong></span>
          <span><small>Status</small>{viewOrder && <Badge value={viewOrder.status} />}</span>
          <span><small>Priority</small>{viewOrder && <Badge value={viewOrder.priority || 'NORMAL'} />}</span>
        </div>
        <div className="table-scroll">
          <table className="data-table">
            <thead><tr><th>Product</th><th>Ordered</th><th>Picked</th><th>Bin</th></tr></thead>
            <tbody>
              {viewOrder?.items.map((item) => (
                <tr key={item.id}>
                  <td><ProductLink id={item.productId} name={productName(item.productId)} /></td>
                  <td>{item.quantityOrdered}</td>
                  <td>{item.quantityPicked}</td>
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
