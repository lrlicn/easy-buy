// 订单与身份服务层：所有订单数据读写的唯一出口
// 微信端 + 已配置云环境时走云函数/云数据库；否则降级为 localStorage mock（H5 预览可用）
import Taro from '@tarojs/taro'
import { CLOUD_ENV_ID, MOCK_STAFF } from '../config'
import type { CartItem } from '../store/cart'

export interface Order {
  id: string
  openid: string
  items: CartItem[]
  total: number
  pickupCode: string // 6 位取件码，到店核销
  status: 'paid' | 'completed' | 'cancelled' // paid=待取件 completed=已核销 cancelled=已取消
  createdAt: number
}

// 微信端且配置了云环境才启用真实云端
const cloudReady = () =>
  process.env.TARO_ENV === 'weapp' && !!CLOUD_ENV_ID && !!(Taro as any).cloud

const callCloud = async (name: string, data: Record<string, unknown>) => {
  const res = await (Taro as any).cloud.callFunction({ name, data })
  return res.result
}

// ---------- 身份 ----------

// 买家免授权登录：真实模式由云函数从调用上下文取 openid；mock 返回固定账号
export async function getOpenId(): Promise<string> {
  if (cloudReady()) {
    const res = await callCloud('login', {})
    Taro.setStorageSync('openid', res.openid)
    return res.openid as string
  }
  let openid = Taro.getStorageSync('mock_openid') as string
  if (!openid) {
    openid = 'mock-user-' + Math.random().toString(36).slice(2, 8)
    Taro.setStorageSync('mock_openid', openid)
  }
  return openid
}

// 是否店员：真实模式每次实时查询 login 云函数（函数轻量且 staff 白名单可能变动，不做本地缓存）
export async function isStaff(): Promise<boolean> {
  if (cloudReady()) {
    const res = await callCloud('login', {})
    return res.isStaff === true
  }
  return MOCK_STAFF
}

// ---------- 订单 ----------

// 创建订单（支付成功后调用），返回含取件码的完整订单
export async function createOrder(items: CartItem[], total: number): Promise<Order> {
  if (cloudReady()) {
    const res = await callCloud('order', { action: 'create', items, total })
    return res.order as Order
  }
  const order: Order = {
    id: 'mock-' + Date.now(),
    openid: await getOpenId(),
    items,
    total,
    pickupCode: String(Math.floor(100000 + Math.random() * 900000)),
    status: 'paid',
    createdAt: Date.now()
  }
  const list = (Taro.getStorageSync('mock_orders') as Order[]) || []
  Taro.setStorageSync('mock_orders', [order, ...list])
  return order
}

// 买家：我的订单
export async function listMyOrders(): Promise<Order[]> {
  if (cloudReady()) {
    const res = await callCloud('order', { action: 'listMine' })
    return res.list as Order[]
  }
  const openid = await getOpenId()
  const list = (Taro.getStorageSync('mock_orders') as Order[]) || []
  return list.filter(o => o.openid === openid)
}

// 商家：全部订单（真实模式在云函数内校验 staff，非店员调用会抛错）
export async function listAllOrders(): Promise<Order[]> {
  if (cloudReady()) {
    const res = await callCloud('order', { action: 'listAll' })
    return res.list as Order[]
  }
  return (Taro.getStorageSync('mock_orders') as Order[]) || []
}

// 买家：取消待取件订单（仅本人、仅 paid 状态；成功返回 true）
export async function cancelOrder(id: string): Promise<boolean> {
  if (cloudReady()) {
    const res = await callCloud('order', { action: 'cancel', id })
    return res.ok === true
  }
  const openid = await getOpenId()
  const list = (Taro.getStorageSync('mock_orders') as Order[]) || []
  const target = list.find(o => o.id === id && o.openid === openid && o.status === 'paid')
  if (!target) return false
  target.status = 'cancelled'
  Taro.setStorageSync('mock_orders', list)
  return true
}

// 买家：删除自己的订单记录（已核销/已取消均可删；成功返回 true）
export async function deleteOrder(id: string): Promise<boolean> {
  if (cloudReady()) {
    const res = await callCloud('order', { action: 'delete', id })
    return res.ok === true
  }
  const openid = await getOpenId()
  const list = (Taro.getStorageSync('mock_orders') as Order[]) || []
  const next = list.filter(o => !(o.id === id && o.openid === openid))
  if (next.length === list.length) return false
  Taro.setStorageSync('mock_orders', next)
  return true
}

// 商家：按取件码核销，成功返回核销后的订单，未找到返回 null
export async function verifyPickup(pickupCode: string): Promise<Order | null> {
  if (cloudReady()) {
    const res = await callCloud('order', { action: 'verifyPickup', pickupCode })
    return (res.order as Order) || null
  }
  const code = pickupCode.trim()
  const list = (Taro.getStorageSync('mock_orders') as Order[]) || []
  const target = list.find(o => o.pickupCode === code && o.status === 'paid')
  if (!target) return null
  target.status = 'completed'
  Taro.setStorageSync('mock_orders', list)
  return target
}
